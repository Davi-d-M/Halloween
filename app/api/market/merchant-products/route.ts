import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getMarketMerchantContext } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

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
  return false;
}

export async function GET(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  const { data, error } = await context.database
    .from('mm_products')
    .select('id, name, slug, description, status, created_at, category:mm_categories(name, slug), variants:mm_product_variants(id, size, color, price_minor, currency, inventory:mm_inventory(quantity_available, quantity_reserved)), media:mm_product_media(storage_path, alt_text, sort_order)')
    .eq('merchant_id', context.merchantId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[MerchantStudio] Could not load merchant listings:', error);
    return NextResponse.json({ error: 'Could not load your product listings.' }, { status: 503 });
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
      return { url: signed.signedUrl, alt: image.alt_text || product.name };
    }));
    return { ...product, images: signedMedia.filter((image): image is NonNullable<typeof image> => image !== null) };
  }));

  if (imageSigningFailed) {
    return NextResponse.json({ error: 'One or more product photos could not be loaded.' }, { status: 503 });
  }

  return NextResponse.json({ products }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send a valid product listing.' }, { status: 400 });
  }

  const name = String(form.get('name') || '').trim();
  const slug = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const description = String(form.get('description') || '').trim();
  const categorySlug = String(form.get('category') || '').trim();
  const size = String(form.get('size') || '').trim();
  const color = String(form.get('color') || '').trim();
  const altText = String(form.get('altText') || '').trim();
  const price = Number(form.get('price'));
  const stock = Number(form.get('stock'));
  const image = form.get('image');

  if (name.length < 2 || name.length > 180 || slug.length < 2
    || description.length > 3000 || size.length > 80 || color.length > 80 || altText.length > 200
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)
    || !Number.isSafeInteger(price) || price < 1 || price > 100000000
    || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
    return NextResponse.json({ error: 'Check the product details, price, stock and category.' }, { status: 400 });
  }
  if (!(image instanceof File) || !['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(image.type) || image.size < 1 || image.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: 'Upload a JPG, PNG, WebP or AVIF product photo under 4 MB.' }, { status: 400 });
  }

  const extensionByType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif'
  };
  const storagePath = `${context.user.id}/${randomUUID()}.${extensionByType[image.type]}`;
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!matchesImageType(bytes, image.type)) {
    return NextResponse.json({ error: 'The uploaded photo does not match its file type.' }, { status: 400 });
  }
  const { error: uploadError } = await context.database.storage
    .from('midnight-market')
    .upload(storagePath, bytes, { contentType: image.type, upsert: false });
  if (uploadError) {
    console.error('[MerchantStudio] Could not upload product photo:', uploadError);
    return NextResponse.json({ error: 'Could not upload the product photo. Please try again.' }, { status: 503 });
  }

  const priceMinor = Math.round(price * 100);
  const { data, error } = await context.database.rpc('mm_create_product_listing', {
    p_user_id: context.user.id,
    p_name: name,
    p_slug: slug,
    p_description: description,
    p_category_slug: categorySlug,
    p_storage_path: storagePath,
    p_alt_text: altText || name,
    p_size: size,
    p_color: color,
    p_price_minor: priceMinor,
    p_quantity: stock
  });

  if (error) {
    const { error: removeError } = await context.database.storage.from('midnight-market').remove([storagePath]);
    if (removeError) console.error('[MerchantStudio] Could not clean up an unlinked product photo:', removeError);
    if (error.code === '23505') return NextResponse.json({ error: 'You already have a listing with this product name.' }, { status: 409 });
    if (error.message.includes('Choose an active marketplace category')) return NextResponse.json({ error: 'Choose an available category.' }, { status: 400 });
    console.error('[MerchantStudio] Could not create product listing:', error);
    return NextResponse.json({ error: 'Could not create the product listing.' }, { status: 503 });
  }

  return NextResponse.json({ product: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
