import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMarketConfiguration } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

function offerHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

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
    return NextResponse.json({ error: 'Send a valid offer request.' }, { status: 400 });
  }

  const database = createClient(configuration.url, configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const action = body.action;

  if (action === 'create') {
    const productId = body.productId;
    const variantId = body.variantId;
    const buyerName = typeof body.buyerName === 'string' ? body.buyerName.trim() : '';
    const buyerEmail = typeof body.buyerEmail === 'string' ? body.buyerEmail.trim().toLowerCase() : '';
    const buyerPhone = typeof body.buyerPhone === 'string' ? body.buyerPhone.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const amountMinor = body.amountMinor;
    if (!isUuid(productId) || !isUuid(variantId)
      || buyerName.length < 2 || buyerName.length > 160
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) || buyerEmail.length > 254
      || buyerPhone.length > 40 || message.length > 500
      || !Number.isSafeInteger(amountMinor) || Number(amountMinor) < 100) {
      return NextResponse.json({ error: 'Check your name, email, message and offer amount (at least KSh 1).' }, { status: 400 });
    }

    const accessToken = randomBytes(32).toString('hex');
    const { data, error } = await database.rpc('mm_create_price_offer', {
      p_product_id: productId,
      p_variant_id: variantId,
      p_buyer_name: buyerName,
      p_buyer_email: buyerEmail,
      p_buyer_phone: buyerPhone || null,
      p_access_token_hash: offerHash(accessToken),
      p_amount_minor: amountMinor,
      p_message: message || null
    });
    if (error) {
      if (error.message.includes('no longer available') || error.message.includes('not currently accepting')
        || error.message.includes('not accepting price offers')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      if (error.message.includes('Check your contact')) return NextResponse.json({ error: error.message }, { status: 400 });
      console.error('[MidnightMarket] Could not create price offer:', error);
      return NextResponse.json({ error: 'Could not send your offer. Please try again.' }, { status: 503 });
    }
    return NextResponse.json({ offer: data, accessToken }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  }

  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : '';
  const offerId = body.offerId;
  if (!/^[0-9a-f]{64}$/i.test(accessToken) || !isUuid(offerId)) {
    return NextResponse.json({ error: 'A valid private offer access code is required.' }, { status: 400 });
  }
  const tokenHash = offerHash(accessToken);

  if (action === 'lookup') {
    const { data: offer, error } = await database
      .from('mm_price_offers')
      .select('id, status, latest_amount_minor, listed_price_minor, accepted_amount_minor, expires_at, created_at, product:mm_products(name, slug), variant:mm_product_variants(size, color), merchant:mm_merchants(name)')
      .eq('id', offerId)
      .eq('access_token_hash', tokenHash)
      .maybeSingle();
    if (error) {
      console.error('[MidnightMarket] Could not load private price offer:', error);
      return NextResponse.json({ error: 'Could not load your offer.' }, { status: 503 });
    }
    if (!offer) return NextResponse.json({ error: 'This offer link is invalid or has expired.' }, { status: 404 });
    let status = offer.status;
    if (['pending_merchant', 'countered'].includes(status) && new Date(offer.expires_at).getTime() <= Date.now()) {
      const { error: expireError } = await database.from('mm_price_offers').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', offer.id).eq('status', status);
      if (expireError) {
        console.error('[MidnightMarket] Could not expire an old price offer:', expireError);
        return NextResponse.json({ error: 'Could not refresh your offer status.' }, { status: 503 });
      }
      const { data: currentOffer, error: currentOfferError } = await database
        .from('mm_price_offers')
        .select('status')
        .eq('id', offer.id)
        .maybeSingle();
      if (currentOfferError || !currentOffer) {
        console.error('[MidnightMarket] Could not recheck an expired price offer:', currentOfferError);
        return NextResponse.json({ error: 'Could not refresh your offer status.' }, { status: 503 });
      }
      status = currentOffer.status;
    }
    const { data: messages, error: messagesError } = await database
      .from('mm_price_offer_messages')
      .select('actor, action, amount_minor, message, created_at')
      .eq('offer_id', offer.id)
      .order('created_at');
    if (messagesError) {
      console.error('[MidnightMarket] Could not load price offer history:', messagesError);
      return NextResponse.json({ error: 'Could not load the offer conversation.' }, { status: 503 });
    }
    return NextResponse.json({
      offer: { ...offer, status, messages: messages || [] }
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (action === 'respond') {
    const responseAction = body.responseAction;
    const amountMinor = body.amountMinor;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!['accept', 'counter', 'decline'].includes(String(responseAction))
      || message.length > 500
      || (responseAction === 'counter' && (!Number.isSafeInteger(amountMinor) || Number(amountMinor) < 100))) {
      return NextResponse.json({ error: 'Check your response and counteroffer amount.' }, { status: 400 });
    }
    const { data, error } = await database.rpc('mm_respond_to_price_offer', {
      p_offer_id: offerId,
      p_actor: 'buyer',
      p_actor_user_id: null,
      p_access_token_hash: tokenHash,
      p_action: responseAction,
      p_amount_minor: responseAction === 'counter' ? amountMinor : null,
      p_message: message || null,
      p_actor_email: null
    });
    if (error) {
      const conflict = error.message.includes('already closed') || error.message.includes('Wait for the boutique') || error.message.includes('expired');
      if (!conflict) console.error('[MidnightMarket] Could not respond to price offer:', error);
      return NextResponse.json({ error: conflict ? error.message : 'Could not update your offer.' }, { status: conflict ? 409 : 503 });
    }
    return NextResponse.json({ offer: data }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ error: 'Choose a valid offer operation.' }, { status: 400 });
}
