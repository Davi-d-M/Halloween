import { NextResponse } from 'next/server';
import { getMarketMerchantContext } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  const { data, error } = await context.database
    .from('mm_order_requests')
    .select('id, reference, product_name, variant_label, quantity, unit_price_minor, total_minor, currency, buyer_name, buyer_email, buyer_phone, buyer_note, status, payment_status, created_at, updated_at')
    .eq('merchant_id', context.merchantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[MerchantStudio] Could not load merchant order requests:', error);
    return NextResponse.json({ error: 'Could not load your order requests.' }, { status: 503 });
  }

  return NextResponse.json({ orders: data || [] }, {
    headers: { 'Cache-Control': 'private, no-store' }
  });
}

export async function PUT(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid order update.' }, { status: 400 });
  }

  const orderId = body.orderId;
  const status = body.status;
  if (!isUuid(orderId) || !['paid', 'confirmed', 'preparing', 'ready', 'fulfilled', 'cancelled'].includes(String(status))) {
    return NextResponse.json({ error: 'Choose a valid order and next status.' }, { status: 400 });
  }

  const { data, error } = await context.database.rpc('mm_update_merchant_order_request', {
    p_order_id: orderId,
    p_merchant_id: context.merchantId,
    p_actor_user_id: context.user.id,
    p_status: status
  });
  if (error) {
    if (error.message.includes('not available to your boutique')) {
      return NextResponse.json({ error: 'This order request is not available to your boutique.' }, { status: 404 });
    }
    if (error.message.includes('not enough stock') || error.message.includes('cannot be moved')
      || error.message.includes('Could not release') || error.message.includes('Could not complete stock')
      || error.message.includes('Record the payment') || error.message.includes('already recorded')
      || error.message.includes('Confirm this request before recording')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[MerchantStudio] Could not update merchant order request:', error);
    return NextResponse.json({ error: 'Could not update this order request.' }, { status: 503 });
  }

  return NextResponse.json({ order: data }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
