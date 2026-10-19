import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMarketConfiguration } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const configuration = getMarketConfiguration();
  if (!configuration) {
    return NextResponse.json({
      error: 'Market server configuration is incomplete. Set the Supabase URL, public key, and server-only SUPABASE_SERVICE_ROLE_KEY.'
    }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid order request.' }, { status: 400 });
  }

  const productId = body.productId;
  const variantId = body.variantId;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const quantity = body.quantity;
  if (!isUuid(productId) || !isUuid(variantId)
    || name.length < 2 || name.length > 160
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || phone.length > 40 || note.length > 500
    || !Number.isSafeInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 10) {
    return NextResponse.json({ error: 'Check your name, email, phone and quantity.' }, { status: 400 });
  }

  const database = createClient(configuration.url, configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await database.rpc('mm_create_order_request', {
    p_product_id: productId,
    p_variant_id: variantId,
    p_buyer_name: name,
    p_buyer_email: email,
    p_buyer_phone: phone || null,
    p_buyer_note: note || null,
    p_quantity: quantity
  });
  if (error) {
    if (error.message.includes('no longer available') || error.message.includes('not currently accepting')
      || error.message.includes('not enough stock') || error.message.includes('not available for order requests')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.message.includes('Check your contact')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[MidnightMarket] Could not create customer order request:', error);
    return NextResponse.json({ error: 'Could not submit your order request.' }, { status: 503 });
  }

  return NextResponse.json({ order: data }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  });
}
