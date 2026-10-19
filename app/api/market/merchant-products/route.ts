import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getMarketMerchantContext } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

type KeptMedia = { storage_path: string; media_type: 'image' | 'video'; alt_text: string; sort_order: number };

function matchesImageType(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  if (mimeType === 'image/webp') {
    return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  if (mimeType === 'image/avif') {
    return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp'
      && ['avif', 'avis', 'mif1'].includes(String.fromCharCode(...bytes.slice(8, 12)));
  }
  if (mimeType === 'video/mp4') return String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
  if (mimeType === 'video/webm') return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function readForm(request: Request) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

async function saveProductFromStorage(request: Request, context: Exclude<Awaited<ReturnType<typeof getMarketMerchantContext>>, { response: NextResponse }>, updating: boolean) {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid product listing.' }, { status: 400 });
  }

  const text = (key: string) => typeof body[key] === 'string' ? (body[key] as string).trim() : '';
  const name = text('name');
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const description = text('description');
  const categorySlug = text('category');
  const size = text('size');
  const color = text('color');
  const sku = text('sku');
  const deliveryInformation = text('deliveryInformation');
  const returnPolicy = text('returnPolicy');
  const availability = text('availability');
  const estimatedAvailableOn = text('estimatedAvailableOn');
  const price = Number(body.price);
  const salePrice = body.salePrice === null || body.salePrice === '' ? null : Number(body.salePrice);
  const stock = Number(body.stock);
  const productId = text('productId');
  const variantId = text('variantId');

  if (!body.attributes || typeof body.attributes !== 'object' || Array.isArray(body.attributes)
    || !Array.isArray(body.keepImages) || !Array.isArray(body.uploadedMedia)) {
    return NextResponse.json({ error: 'Product attributes and photos are invalid.' }, { status: 400 });
  }
  let attributes: Record<string, string>;
  try {
    attributes = Object.fromEntries(Object.entries(body.attributes).map(([key, value]) => {
      if (!/^[a-z_]{2,40}$/.test(key) || typeof value !== 'string' || value.length > 500) throw new Error();
      return [key, value.trim()];
    }));
  } catch {
    return NextResponse.json({ error: 'Product attributes are invalid.' }, { status: 400 });
  }
  const parseMedia = (value: unknown): Array<{ storagePath: string; mediaType: 'image' | 'video'; altText: string; sortOrder: number }> | null => {
    if (!Array.isArray(value)) return null;
    const parsed: Array<{ storagePath: string; mediaType: 'image' | 'video'; altText: string; sortOrder: number }> = [];
    for (const [index, item] of value.entries()) {
      if (!item || typeof item !== 'object'
        || !('path' in item) || typeof item.path !== 'string'
        || !('mediaType' in item) || (item.mediaType !== 'image' && item.mediaType !== 'video')) return null;
      const altText = 'altText' in item && typeof item.altText === 'string' ? item.altText.trim() : name;
      if (altText.length > 200) return null;
      parsed.push({ storagePath: item.path, mediaType: item.mediaType, altText: altText || name, sortOrder: index });
    }
    return parsed;
  };
  const keptImages = parseMedia(body.keepImages);
  const uploadedMedia = parseMedia(body.uploadedMedia);
  if (!keptImages || !uploadedMedia) return NextResponse.json({ error: 'Product photos are invalid.' }, { status: 400 });

  const allMedia = [...keptImages, ...uploadedMedia];
  const imageCount = allMedia.filter((item) => item.mediaType === 'image').length;
  const videoCount = allMedia.filter((item) => item.mediaType === 'video').length;
  if (name.length < 2 || name.length > 180 || slug.length < 2
    || description.length < 2 || description.length > 3000
    || size.length > 80 || color.length > 80 || sku.length > 100
    || deliveryInformation.length > 1000 || returnPolicy.length > 1000
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)
    || !['available_now', 'planned', 'made_to_order'].includes(availability)
    || (availability === 'planned' && stock !== 0)
    || (availability !== 'planned' && Boolean(estimatedAvailableOn))
    || (estimatedAvailableOn && !isDateOnly(estimatedAvailableOn))
    || (estimatedAvailableOn && estimatedAvailableOn < new Date().toISOString().slice(0, 10))
    || !Number.isFinite(price) || !Number.isSafeInteger(Math.round(price * 100)) || price < 1 || price > 100000000
    || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 1 || salePrice >= price))
    || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000
    || (updating ? (!isUuid(productId) || !isUuid(variantId)) : Boolean(productId || variantId))
    || imageCount < 1 || imageCount > 6 || videoCount > 1 || allMedia.length > 7
    || uploadedMedia.some((item) => !item.storagePath.startsWith(`${context.user.id}/`))
    || new Set(allMedia.map((item) => item.storagePath)).size !== allMedia.length) {
    return NextResponse.json({ error: 'Check the product details, prices, stock, category and attached media.' }, { status: 400 });
  }

  if (updating && keptImages.length > 0) {
    const { data: existing, error: mediaError } = await context.database
      .from('mm_product_media')
      .select('storage_path')
      .eq('product_id', productId)
      .in('storage_path', keptImages.map((item) => item.storagePath));
    if (mediaError) {
      console.error('[MerchantStudio] Could not verify saved product media:', mediaError);
      return NextResponse.json({ error: 'Could not verify saved product media.' }, { status: 503 });
    }
    const paths = new Set((existing || []).map((item) => item.storage_path));
    if (keptImages.some((item) => !paths.has(item.storagePath))) {
      return NextResponse.json({ error: 'A saved media item does not belong to this product.' }, { status: 403 });
    }
  }

  const uploadedPaths = uploadedMedia.map((item) => item.storagePath);
  for (const item of uploadedMedia) {
    const { data: file, error: downloadError } = await context.database.storage
      .from('midnight-market')
      .download(item.storagePath);
    const expectedTypes = item.mediaType === 'image'
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
      : ['video/mp4', 'video/webm'];
    if (downloadError || !file || file.size < 1
      || file.size > (item.mediaType === 'video' ? 10 * 1024 * 1024 : 4 * 1024 * 1024)
      || !expectedTypes.includes(file.type)
      || !matchesImageType(new Uint8Array(await file.arrayBuffer()), file.type)) {
      if (downloadError) console.error('[MerchantStudio] Could not verify uploaded product media:', downloadError);
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await context.database.storage.from('midnight-market').remove(uploadedPaths);
        if (cleanupError) console.error('[MerchantStudio] Could not clean up unverified product media:', cleanupError);
      }
      return NextResponse.json({ error: 'A product photo or video is missing or does not match its file type.' }, { status: 400 });
    }
  }

  const media = allMedia.map((item, index) => ({
    storage_path: item.storagePath,
    media_type: item.mediaType,
    alt_text: item.altText,
    sort_order: index
  }));
  const { data, error } = await context.database.rpc('mm_upsert_product_listing_with_availability', {
    p_user_id: context.user.id,
    p_product_id: updating ? productId : null,
    p_variant_id: updating ? variantId : null,
    p_name: name,
    p_slug: slug,
    p_description: description,
    p_category_slug: categorySlug,
    p_attributes: attributes,
    p_delivery_information: deliveryInformation,
    p_return_policy: returnPolicy,
    p_sku: sku || null,
    p_size: size,
    p_color: color,
    p_price_minor: Math.round(price * 100),
    p_sale_price_minor: salePrice === null ? null : Math.round(salePrice * 100),
    p_quantity: stock,
    p_images: media,
    p_availability_status: availability,
    p_estimated_available_on: estimatedAvailableOn || null
  });

  if (error) {
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await context.database.storage.from('midnight-market').remove(uploadedPaths);
      if (cleanupError) console.error('[MerchantStudio] Could not clean up unsaved product media:', cleanupError);
    }
    if (error.code === '23505') return NextResponse.json({ error: 'That product name or SKU is already in use in your boutique.' }, { status: 409 });
    if (error.message.includes('Choose an active marketplace category')) return NextResponse.json({ error: 'Choose an available category.' }, { status: 400 });
    if (error.message.includes('reserved for orders')) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.message.includes('valid availability state')) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.message.includes('another boutique') || error.message.includes('approved merchant')) {
      return NextResponse.json({ error: 'This listing is not available to your merchant account.' }, { status: 403 });
    }
    console.error('[MerchantStudio] Could not save product listing:', error);
    return NextResponse.json({ error: 'Could not save this product listing.' }, { status: 503 });
  }

  const removedPaths = Array.isArray(data?.removedMediaPaths) ? data.removedMediaPaths as string[] : [];
  if (removedPaths.length > 0) {
    const { error: removeError } = await context.database.storage.from('midnight-market').remove(removedPaths);
    if (removeError) console.error('[MerchantStudio] Listing saved but replaced product media could not be cleaned up:', removeError);
  }
  return NextResponse.json({ product: data }, {
    status: updating ? 200 : 201,
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

async function saveProduct(request: Request, updating: boolean) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;
  if (request.headers.get('content-type')?.includes('application/json')) {
    return saveProductFromStorage(request, context, updating);
  }

  const form = await readForm(request);
  if (!form) return NextResponse.json({ error: 'Send a valid product listing.' }, { status: 400 });

  const name = String(form.get('name') || '').trim();
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const description = String(form.get('description') || '').trim();
  const categorySlug = String(form.get('category') || '').trim();
  const size = String(form.get('size') || '').trim();
  const color = String(form.get('color') || '').trim();
  const sku = String(form.get('sku') || '').trim();
  const deliveryInformation = String(form.get('deliveryInformation') || '').trim();
  const returnPolicy = String(form.get('returnPolicy') || '').trim();
  const availability = String(form.get('availability') || 'available_now');
  const estimatedAvailableOn = String(form.get('estimatedAvailableOn') || '').trim();
  const price = Number(form.get('price'));
  const salePriceValue = String(form.get('salePrice') || '').trim();
  const salePrice = salePriceValue ? Number(salePriceValue) : null;
  const stock = Number(form.get('stock'));
  const productId = String(form.get('productId') || '');
  const variantId = String(form.get('variantId') || '');
  const imageEntries = form.getAll('images');
  const newImages = imageEntries.filter((entry): entry is File => entry instanceof File);
  const videoEntry = form.get('video');
  const newVideo = videoEntry instanceof File ? videoEntry : null;

  let attributes: Record<string, string>;
  let keptImages: Array<{ storagePath: string; mediaType: 'image' | 'video'; altText: string; sortOrder: number }>;
  try {
    const parsedAttributes: unknown = JSON.parse(String(form.get('attributes') || '{}'));
    if (!parsedAttributes || typeof parsedAttributes !== 'object' || Array.isArray(parsedAttributes)) throw new Error();
    attributes = Object.fromEntries(Object.entries(parsedAttributes).map(([key, value]) => {
      if (!/^[a-z_]{2,40}$/.test(key) || typeof value !== 'string' || value.length > 500) throw new Error();
      return [key, value.trim()];
    }));
    const parsedKeptImages: unknown = JSON.parse(String(form.get('keepImages') || '[]'));
    if (!Array.isArray(parsedKeptImages)) throw new Error();
    keptImages = parsedKeptImages.map((image, index) => {
      if (!image || typeof image !== 'object'
        || typeof image.storagePath !== 'string'
        || typeof image.altText !== 'string'
        || (image.mediaType !== 'image' && image.mediaType !== 'video')
        || image.altText.length > 200) throw new Error();
      return { storagePath: image.storagePath, mediaType: image.mediaType, altText: image.altText.trim(), sortOrder: index };
    });
  } catch {
    return NextResponse.json({ error: 'Product attributes or saved photos are invalid.' }, { status: 400 });
  }

  if (name.length < 2 || name.length > 180 || slug.length < 2
    || description.length < 2 || description.length > 3000
    || size.length > 80 || color.length > 80 || sku.length > 100
    || deliveryInformation.length > 1000 || returnPolicy.length > 1000
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)
    || !['available_now', 'planned', 'made_to_order'].includes(availability)
    || (availability === 'planned' && stock !== 0)
    || (availability !== 'planned' && Boolean(estimatedAvailableOn))
    || (estimatedAvailableOn && !isDateOnly(estimatedAvailableOn))
    || (estimatedAvailableOn && estimatedAvailableOn < new Date().toISOString().slice(0, 10))
    || !Number.isFinite(price) || !Number.isSafeInteger(Math.round(price * 100)) || price < 1 || price > 100000000
    || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 1 || salePrice >= price))
    || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000
    || (updating ? (!isUuid(productId) || !isUuid(variantId)) : Boolean(productId || variantId))
    || imageEntries.length !== newImages.length
    || (videoEntry !== null && newVideo === null)
    || keptImages.filter((image) => image.mediaType === 'image').length + newImages.length < 1
    || keptImages.filter((image) => image.mediaType === 'image').length + newImages.length > 6
    || keptImages.filter((image) => image.mediaType === 'video').length + (newVideo instanceof File && newVideo.size > 0 ? 1 : 0) > 1
    || (!updating && keptImages.length > 0)) {
    return NextResponse.json({ error: 'Add one to six product photos and no more than one product video.' }, { status: 400 });
  }

  if (updating && keptImages.length > 0) {
    const requestedPaths = keptImages.map((image) => image.storagePath);
    if (requestedPaths.some((path) => !path.startsWith(`${context.user.id}/`))) {
      return NextResponse.json({ error: 'A saved product photo is not available to this account.' }, { status: 403 });
    }
    const { data: existingMedia, error: mediaError } = await context.database
      .from('mm_product_media')
      .select('storage_path')
      .eq('product_id', productId)
      .in('storage_path', requestedPaths);
    if (mediaError) {
      console.error('[MerchantStudio] Could not verify saved product photos:', mediaError);
      return NextResponse.json({ error: 'Could not verify the saved product photos.' }, { status: 503 });
    }
    const verifiedPaths = new Set((existingMedia || []).map((media) => media.storage_path));
    if (requestedPaths.some((path) => !verifiedPaths.has(path))) {
      return NextResponse.json({ error: 'A saved product photo does not belong to this listing.' }, { status: 403 });
    }
  }

  const extensionByType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
    'video/webm': 'webm'
  };
  const uploadedPaths: string[] = [];
  const media: KeptMedia[] = keptImages.map((image, index) => ({
    storage_path: image.storagePath,
    media_type: image.mediaType,
    alt_text: image.altText || name,
    sort_order: index
  }));

  const files = [
    ...newImages.map((file) => ({ file, mediaType: 'image' as const })),
    ...(newVideo instanceof File && newVideo.size > 0 ? [{ file: newVideo, mediaType: 'video' as const }] : [])
  ];
  for (const { file, mediaType } of files) {
    const maxBytes = mediaType === 'video' ? 10 * 1024 * 1024 : 4 * 1024 * 1024;
    const expectedTypes = mediaType === 'video' ? ['video/mp4', 'video/webm'] : ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    if (!Object.hasOwn(extensionByType, file.type) || !expectedTypes.includes(file.type)
      || file.size < 1 || file.size > maxBytes) {
      return NextResponse.json({ error: mediaType === 'video'
        ? 'The product video must be MP4 or WebM and no larger than 10 MB.'
        : 'Each photo must be a JPG, PNG, WebP or AVIF under 4 MB.' }, { status: 400 });
    }
  }

  for (const { file, mediaType } of files) {
    const storagePath = `${context.user.id}/${randomUUID()}.${extensionByType[file.type]}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageType(bytes, file.type)) {
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await context.database.storage.from('midnight-market').remove(uploadedPaths);
        if (cleanupError) console.error('[MerchantStudio] Could not clean up invalid product media:', cleanupError);
      }
      return NextResponse.json({ error: 'A product media file does not match its file type.' }, { status: 400 });
    }
    const { error: uploadError } = await context.database.storage
      .from('midnight-market')
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (uploadError) {
      console.error('[MerchantStudio] Could not upload product photo:', uploadError);
      if (uploadedPaths.length > 0) {
        const { error: cleanupError } = await context.database.storage.from('midnight-market').remove(uploadedPaths);
        if (cleanupError) console.error('[MerchantStudio] Could not clean up incomplete product uploads:', cleanupError);
      }
      return NextResponse.json({ error: 'Could not upload all product photos. Please try again.' }, { status: 503 });
    }
    uploadedPaths.push(storagePath);
    media.push({ storage_path: storagePath, media_type: mediaType, alt_text: name, sort_order: media.length });
  }

  const { data, error } = await context.database.rpc('mm_upsert_product_listing_with_availability', {
    p_user_id: context.user.id,
    p_product_id: updating ? productId : null,
    p_variant_id: updating ? variantId : null,
    p_name: name,
    p_slug: slug,
    p_description: description,
    p_category_slug: categorySlug,
    p_attributes: attributes,
    p_delivery_information: deliveryInformation,
    p_return_policy: returnPolicy,
    p_sku: sku || null,
    p_size: size,
    p_color: color,
    p_price_minor: Math.round(price * 100),
    p_sale_price_minor: salePrice === null ? null : Math.round(salePrice * 100),
    p_quantity: stock,
    p_images: media,
    p_availability_status: availability,
    p_estimated_available_on: estimatedAvailableOn || null
  });

  if (error) {
    if (uploadedPaths.length > 0) {
      const { error: cleanupError } = await context.database.storage.from('midnight-market').remove(uploadedPaths);
      if (cleanupError) console.error('[MerchantStudio] Could not clean up unlinked product photos:', cleanupError);
    }
    if (error.code === '23505') return NextResponse.json({ error: 'That product name or SKU is already in use in your boutique.' }, { status: 409 });
    if (error.message.includes('Choose an active marketplace category')) return NextResponse.json({ error: 'Choose an available category.' }, { status: 400 });
    if (error.message.includes('reserved for orders')) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error.message.includes('valid availability state')) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error.message.includes('another boutique') || error.message.includes('approved merchant')) {
      return NextResponse.json({ error: 'This listing is not available to your merchant account.' }, { status: 403 });
    }
    console.error('[MerchantStudio] Could not save product listing:', error);
    return NextResponse.json({ error: 'Could not save this product listing.' }, { status: 503 });
  }

  const removedPaths = Array.isArray(data?.removedMediaPaths) ? data.removedMediaPaths as string[] : [];
  if (removedPaths.length > 0) {
    const { error: removeError } = await context.database.storage.from('midnight-market').remove(removedPaths);
    if (removeError) {
      console.error('[MerchantStudio] Listing saved but replaced product photos could not be cleaned up:', removeError);
    }
  }

  return NextResponse.json({ product: data }, {
    status: updating ? 200 : 201,
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function GET(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  const { data, error } = await context.database
    .from('mm_products')
    .select('id, name, slug, description, availability_status, estimated_available_on, attributes, delivery_information, return_policy, review_note, status, created_at, category:mm_categories(name, slug), variants:mm_product_variants(id, sku, size, color, price_minor, sale_price_minor, currency, inventory:mm_inventory(quantity_available, quantity_reserved)), media:mm_product_media(storage_path, media_type, alt_text, sort_order)')
    .eq('merchant_id', context.merchantId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[MerchantStudio] Could not load merchant listings:', error);
    return NextResponse.json({ error: 'Could not load your product listings.' }, { status: 503 });
  }

  const { data: interests, error: interestsError } = await context.database
    .from('mm_product_interests')
    .select('id, product_id, buyer_name, buyer_email, buyer_phone, buyer_note, created_at')
    .eq('merchant_id', context.merchantId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (interestsError) {
    console.error('[MerchantStudio] Could not load product interest:', interestsError);
    return NextResponse.json({ error: 'Could not load customer interest for your planned listings.' }, { status: 503 });
  }

  let imageSigningFailed = false;
  const products = await Promise.all((data || []).map(async (product) => {
    const media = product.media || [];
    const signedMedia = await Promise.all(media.map(async (image) => {
      const { data: signed, error: signError } = await context.database.storage
        .from('midnight-market')
        .createSignedUrl(image.storage_path, 3600);
      if (signError) {
        console.error('[MerchantStudio] Could not sign merchant image:', signError);
        imageSigningFailed = true;
        return null;
      }
      return { url: signed.signedUrl, alt: image.alt_text || product.name, storage_path: image.storage_path, media_type: image.media_type };
    }));
    return {
      ...product,
      images: signedMedia.filter((image): image is NonNullable<typeof image> => image !== null)
    };
  }));

  if (imageSigningFailed) {
    return NextResponse.json({ error: 'One or more product photos could not be loaded.' }, { status: 503 });
  }
  const productNames = new Map((data || []).map((product) => [product.id, product.name]));
  const visibleInterests = (interests || []).map((interest) => ({
    id: interest.id,
    product_name: productNames.get(interest.product_id) || 'Product listing',
    buyer_name: interest.buyer_name,
    buyer_email: interest.buyer_email,
    buyer_phone: interest.buyer_phone,
    buyer_note: interest.buyer_note,
    created_at: interest.created_at
  }));
  return NextResponse.json({ products, interests: visibleInterests }, {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function POST(request: Request) {
  return saveProduct(request, false);
}

export async function PUT(request: Request) {
  return saveProduct(request, true);
}
