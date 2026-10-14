import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export function getMarketConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;
  return { url, serviceKey, publicKey };
}

export async function getMarketMerchantContext(request: Request) {
  const configuration = getMarketConfiguration();
  if (!configuration) {
    return {
      response: NextResponse.json({
        error: 'Market server configuration is incomplete. Set the Supabase URL, public key, and server-only SUPABASE_SERVICE_ROLE_KEY.'
      }, { status: 503 })
    };
  }
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { response: NextResponse.json({ error: 'Sign in to Merchant Studio.' }, { status: 401 }) };

  const authClient = createClient(configuration.url, configuration.publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) return { response: NextResponse.json({ error: 'Your sign-in session is invalid.' }, { status: 401 }) };

  const database = createClient(configuration.url, configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: memberships, error: membershipError } = await database
    .from('mm_merchant_memberships')
    .select('merchant_id, role')
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .in('role', ['owner', 'manager'])
    .order('created_at')
    .limit(1);
  if (membershipError) {
    console.error('[MerchantStudio] Could not verify merchant membership:', membershipError);
    return { response: NextResponse.json({ error: 'Could not verify your merchant access.' }, { status: 503 }) };
  }
  const membership = memberships?.[0];
  if (!membership) return { response: NextResponse.json({ error: 'An approved merchant account is required.' }, { status: 403 }) };

  const { data: merchant, error: merchantError } = await database
    .from('mm_merchants')
    .select('status')
    .eq('id', membership.merchant_id)
    .maybeSingle();
  if (merchantError) {
    console.error('[MerchantStudio] Could not verify boutique status:', merchantError);
    return { response: NextResponse.json({ error: 'Could not verify this boutique’s status.' }, { status: 503 }) };
  }
  if (!merchant || merchant.status !== 'approved') {
    return { response: NextResponse.json({ error: 'This boutique is suspended. Contact Market Operations for help.' }, { status: 403 }) };
  }
  return { configuration, database, user: data.user, merchantId: membership.merchant_id };
}
