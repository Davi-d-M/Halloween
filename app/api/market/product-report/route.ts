import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMarketConfiguration } from '@/lib/marketMerchantAuth.server';

export const dynamic = 'force-dynamic';

const attempts = new Map<string, { since: number; count: number }>();
const windowMs = 60 * 60 * 1000;
const maxAttempts = 5;

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

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }
  if (rateLimited(request)) {
    return NextResponse.json({ error: 'Too many reports. Please try again later.' }, { status: 429 });
  }

  const configuration = getMarketConfiguration();
  if (!configuration) {
    return NextResponse.json({ error: 'Market server configuration is incomplete.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid listing report.' }, { status: 400 });
  }

  const productId = body.productId;
  const reason = body.reason;
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!isUuid(productId) || !['misleading', 'counterfeit', 'unsafe', 'other'].includes(String(reason))
    || details.length < 10 || details.length > 1000
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Check the report details and email address.' }, { status: 400 });
  }

  const database = createClient(configuration.url, configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await database.rpc('mm_create_customer_report', {
    p_product_id: productId,
    p_reason: reason,
    p_details: details,
    p_reporter_email: email
  });

  if (error) {
    if (error.message.includes('not available to report')) {
      return NextResponse.json({ error: 'This listing is no longer available to report.' }, { status: 409 });
    }
    if (error.message.includes('Check the report')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[MidnightMarket] Could not save customer listing report:', error);
    return NextResponse.json({ error: 'Could not submit your listing report.' }, { status: 503 });
  }

  return NextResponse.json({ report: data }, {
    status: 201,
    headers: { 'Cache-Control': 'no-store' }
  });
}
