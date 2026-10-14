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
    .from('mm_price_offers')
    .select('id, product_id, variant_id, buyer_name, buyer_email, buyer_phone, listed_price_minor, latest_amount_minor, accepted_amount_minor, status, expires_at, created_at, product:mm_products!inner(name, slug), variant:mm_product_variants!inner(size, color), messages:mm_price_offer_messages(actor, action, amount_minor, message, created_at)')
    .eq('merchant_id', context.merchantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[MerchantStudio] Could not load price offers:', error);
    return NextResponse.json({ error: 'Could not load your customer offers.' }, { status: 503 });
  }

  return NextResponse.json({ offers: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const context = await getMarketMerchantContext(request);
  if ('response' in context) return context.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid offer response.' }, { status: 400 });
  }

  const offerId = body.offerId;
  const action = body.action;
  const amountMinor = body.amountMinor;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!isUuid(offerId) || !['accept', 'counter', 'decline'].includes(String(action))
    || message.length > 500
    || (action === 'counter' && (!Number.isSafeInteger(amountMinor) || Number(amountMinor) < 100))) {
    return NextResponse.json({ error: 'Check the offer response and counteroffer amount.' }, { status: 400 });
  }

  const { data, error } = await context.database.rpc('mm_respond_to_price_offer', {
    p_offer_id: offerId,
    p_actor: 'merchant',
    p_actor_user_id: context.user.id,
    p_access_token_hash: null,
    p_action: action,
    p_amount_minor: action === 'counter' ? amountMinor : null,
    p_message: message || null,
    p_actor_email: context.user.email || null
  });
  if (error) {
    const conflict = error.message.includes('already closed') || error.message.includes('expired') || error.message.includes('no longer available');
    const forbidden = error.message.includes('membership for this boutique');
    const invalid = error.message.includes('counteroffer must');
    if (!conflict && !forbidden && !invalid) console.error('[MerchantStudio] Could not respond to price offer:', error);
    const status = conflict ? 409 : forbidden ? 403 : invalid ? 400 : 503;
    return NextResponse.json({ error: conflict || forbidden || invalid ? error.message : 'Could not update this offer.' }, { status });
  }
  return NextResponse.json({ offer: data }, { headers: { 'Cache-Control': 'no-store' } });
}
