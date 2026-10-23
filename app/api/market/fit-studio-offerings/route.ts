import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function GET() {
  const database = getDatabase();
  if (!database) {
    return NextResponse.json({
      error: 'Fit Studio listings are not connected. Configure the same Supabase project and server-only service key used by Online Bar Admin.'
    }, { status: 503 });
  }

  const pageSize = 24;
  const offerings = [];
  let from = 0;

  while (true) {
    const { data, error } = await database
      .from('fit_service_offerings')
      .select('id, service_key, title, description, image_url, price_kes, available')
      .eq('published', true)
      .order('updated_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[MidnightMarket] Could not load published Fit Studio listings:', error.code);
      return NextResponse.json({
        error: 'Published Fit Studio listings could not be loaded. Check that the shared Fit Studio marketplace migration is applied.'
      }, { status: 503 });
    }

    offerings.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return NextResponse.json({ offerings }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
  });
}
