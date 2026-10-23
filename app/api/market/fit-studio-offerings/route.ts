import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const waitlistOfferingsUrl = 'https://theewaitlist.vercel.app/api/fit-studio-offerings';

type WaitlistOffering = {
  id: string;
  service_key: string;
  title: string;
  description: string;
  image_url: string | null;
  price_kes: number | null;
  available: boolean;
};

function isWaitlistOffering(value: unknown): value is WaitlistOffering {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const offering = value as Record<string, unknown>;
  return typeof offering.id === 'string'
    && typeof offering.service_key === 'string'
    && typeof offering.title === 'string'
    && typeof offering.description === 'string'
    && (offering.image_url === null || typeof offering.image_url === 'string')
    && (offering.price_kes === null || (typeof offering.price_kes === 'number' && Number.isFinite(offering.price_kes)))
    && typeof offering.available === 'boolean';
}

export async function GET() {
  let response: Response;
  try {
    response = await fetch(waitlistOfferingsUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    console.error('[MidnightMarket] Could not reach the Waitlist published-listings API:', error);
    return NextResponse.json({ error: 'Published Halloween finds are temporarily unavailable.' }, { status: 503 });
  }

  if (!response.ok) {
    console.error('[MidnightMarket] Waitlist published-listings API returned an error:', response.status);
    return NextResponse.json({ error: 'Published Halloween finds are temporarily unavailable.' }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    console.error('[MidnightMarket] Waitlist published listings were not valid JSON:', error);
    return NextResponse.json({ error: 'Published Halloween finds could not be read.' }, { status: 502 });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !Array.isArray((payload as { offerings?: unknown }).offerings)
    || !(payload as { offerings: unknown[] }).offerings.every(isWaitlistOffering)) {
    console.error('[MidnightMarket] Waitlist published listings had an invalid response shape.');
    return NextResponse.json({ error: 'Published Halloween finds could not be read.' }, { status: 502 });
  }

  return NextResponse.json({ offerings: (payload as { offerings: WaitlistOffering[] }).offerings }, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' }
  });
}
