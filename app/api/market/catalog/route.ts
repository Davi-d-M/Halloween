import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  attributes: Record<string, string>;
  delivery_information: string | null;
  return_policy: string | null;
  merchant: { name: string; slug: string };
  category: { name: string; slug: string } | null;
  variants: Array<{
    id: string;
    size: string | null;
    color: string | null;
    sku: string | null;
    price_minor: number;
    sale_price_minor: number | null;
    currency: string;
    inventory: { quantity_available: number; quantity_reserved: number } | null;
  }>;
  media: Array<{ storage_path: string; media_type: 'image' | 'video'; alt_text: string | null; sort_order: number }>;
};

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function GET(request: Request) {
  const database = getDatabase();
  if (!database) {
    return NextResponse.json({
      error: 'Market server configuration is incomplete. Set the server-only SUPABASE_SERVICE_ROLE_KEY to connect to the Midnight Market database.'
    }, { status: 503 });
  }

  const parameters = new URL(request.url).searchParams;
  const category = parameters.get('category')?.trim();
  const slug = parameters.get('slug')?.trim();
  const store = parameters.get('store')?.trim();
  const search = parameters.get('q')?.trim();
  if ([category, slug, store, search].some((value) => value && value.length > 100)) {
    return NextResponse.json({ error: 'Search filters must be 100 characters or fewer.' }, { status: 400 });
  }

  const [{ data: categories, error: categoriesError }, productsResult, campaignResult] = await Promise.all([
    database.from('mm_categories')
      .select('name, slug, description')
      .eq('active', true)
      .order('sort_order')
      .order('name'),
    (async () => {
      let query = database.from('mm_products').select(`
        id, name, slug, description, attributes, delivery_information, return_policy,
        merchant:mm_merchants!inner(name, slug, status),
        category:mm_categories!inner(name, slug),
        variants:mm_product_variants!inner(id, sku, size, color, price_minor, sale_price_minor, currency, active, inventory:mm_inventory(quantity_available, quantity_reserved)),
        media:mm_product_media(storage_path, media_type, alt_text, sort_order)
      `)
        .eq('status', 'published')
        .eq('merchant.status', 'approved')
        .eq('variants.active', true)
        .order('created_at', { ascending: false })
        .limit(48);

      if (category) query = query.eq('category.slug', category);
      if (slug) query = query.eq('slug', slug);
      if (store) query = query.eq('merchant.slug', store);
      if (search) query = query.ilike('name', `%${search.replace(/[%_,]/g, '')}%`);

      return query;
    })(),
    database.from('mm_market_campaigns')
      .select('title, message')
      .eq('campaign_key', 'market')
      .eq('published', true)
      .maybeSingle()
  ]);

  if (categoriesError || productsResult.error || campaignResult.error) {
    const error = categoriesError || productsResult.error || campaignResult.error;
    console.error('[MidnightMarket] Could not load catalog:', error);
    return NextResponse.json({ error: 'The Midnight Market catalog could not be loaded.' }, { status: 503 });
  }

  const rawProducts = (productsResult.data || []) as unknown as CatalogProduct[];
  let imageSigningFailed = false;
  const products = await Promise.all(rawProducts.map(async (product) => {
    const orderedMedia = [...product.media].sort((left, right) => left.sort_order - right.sort_order);
    const images = await Promise.all(orderedMedia.map(async (item) => {
      const { data, error } = await database.storage
        .from('midnight-market')
        .createSignedUrl(item.storage_path, 3600);
      if (error) {
        console.error('[MidnightMarket] Could not sign product media URL:', error);
        imageSigningFailed = true;
        return null;
      }
      return { url: data.signedUrl, alt: item.alt_text || product.name, mediaType: item.media_type };
    }));
    const variants = product.variants.map((variant) => ({
      id: variant.id,
      size: variant.size,
      color: variant.color,
      priceMinor: Number(variant.price_minor),
      salePriceMinor: variant.sale_price_minor === null ? null : Number(variant.sale_price_minor),
      sku: variant.sku,
      currency: variant.currency,
      inStock: Boolean(variant.inventory
        && variant.inventory.quantity_available > variant.inventory.quantity_reserved)
    }));

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      attributes: product.attributes || {},
      deliveryInformation: product.delivery_information,
      returnPolicy: product.return_policy,
      merchant: product.merchant,
      category: product.category,
      variants,
      images: images.filter((image): image is NonNullable<typeof image> => image !== null)
    };
  }));

  if (imageSigningFailed) {
    return NextResponse.json({ error: 'Product photos could not be loaded. Please try again.' }, { status: 503 });
  }

  return NextResponse.json({ categories: categories || [], products, campaign: campaignResult.data }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
  });
}
