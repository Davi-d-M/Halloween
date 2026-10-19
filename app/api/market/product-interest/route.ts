import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMarketConfiguration } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

const attempts = new Map<string, { since: number; count: number }>();
const windowMs = 15 * 60 * 1000;
const maxAttempts = 12;

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function rateLimited(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const now = Date.now();
  const current = attempts.get(ip);
  if (current && now - current.since < windowMs && current.count >= maxAttempts) return true;
  if (!current || now - current.since >= windowMs) attempts.set(ip, { since: now, count: 1 });
  else current.count += 1;
  if (attempts.size > 2000) {
    for (const [key, value] of attempts) {
      if (now - value.since >= windowMs) attempts.delete(key);
    }
  }
  return false;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }
  if (rateLimited(request)) {
    return NextResponse.json({ error: 'Too many interest requests. Please wait and try again.' }, { status: 429 });
  }

  const configuration = getMarketConfiguration();
  if (!configuration) {
    return NextResponse.json({
      error: 'Market server configuration is incomplete. Set the Supabase URL, public key, and server-only service-role key.'
    }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid product interest request.' }, { status: 400 });
  }

  const productId = body.productId;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const contactConsent = body.contactConsent === true;
  if (!isUuid(productId) || name.length < 2 || name.length > 160
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || phone.length > 40 || note.length > 500 || !contactConsent) {
    return NextResponse.json({ error: 'Check your name, email, phone and message.' }, { status: 400 });
  }

  const database = createClient(configuration.url, configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await database.rpc('mm_create_product_interest', {
    p_product_id: productId,
    p_buyer_name: name,
    p_buyer_email: email,
    p_buyer_phone: phone || null,
    p_buyer_note: note || null,
    p_contact_consent: contactConsent
  });
  if (error) {
    if (error.message.includes('not collecting product interest')
      || error.message.includes('not currently accepting interest')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error.message.includes('Check your contact')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[MidnightMarket] Could not save product interest:', error);
    return NextResponse.json({ error: 'Could not send your interest to the boutique.' }, { status: 503 });
  }

  return NextResponse.json({ interest: data }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  });
}
