import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publicKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !serviceKey || !publicKey) return null;
  return { url, serviceKey, publicKey };
}

async function getAuthenticatedUser(request: Request) {
  const configuration = getConfiguration();
  if (!configuration) return { response: NextResponse.json({ error: 'Merchant services are not configured.' }, { status: 503 }) };

  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return { response: NextResponse.json({ error: 'Sign in before applying to sell.' }, { status: 401 }) };

  const authClient = createClient(configuration.url, configuration.publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data.user) {
    return { response: NextResponse.json({ error: 'Your sign-in session is invalid. Please sign in again.' }, { status: 401 }) };
  }

  return { configuration, user: data.user };
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const database = createClient(auth.configuration.url, auth.configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data, error } = await database
    .from('mm_merchant_applications')
    .select('id, business_name, requested_slug, contact_name, contact_email, contact_phone, business_description, status, review_note, submitted_at, reviewed_at')
    .eq('user_id', auth.user.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[MidnightMarket] Could not load merchant application:', error);
    return NextResponse.json({ error: 'Could not load your seller application.' }, { status: 503 });
  }

  return NextResponse.json({ application: data }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid seller application.' }, { status: 400 });
  }

  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
  const requestedSlug = typeof body.slug === 'string'
    ? body.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : '';
  const contactName = typeof body.contactName === 'string' ? body.contactName.trim() : '';
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim().toLowerCase() : '';
  const contactPhone = typeof body.contactPhone === 'string' ? body.contactPhone.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : '';

  if (businessName.length < 2 || businessName.length > 160
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requestedSlug) || requestedSlug.length > 80
    || contactName.length < 2 || contactName.length > 160
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    || contactPhone.replace(/\D/g, '').length < 7 || contactPhone.length > 40
    || description.length < 20 || description.length > 3000) {
    return NextResponse.json({ error: 'Check the business name, boutique link, contact details and description.' }, { status: 400 });
  }

  const database = createClient(auth.configuration.url, auth.configuration.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  if (!auth.user.email_confirmed_at
    || auth.user.email?.trim().toLowerCase() !== contactEmail) {
    return NextResponse.json({ error: 'Use the verified email address on your signed-in account.' }, { status: 403 });
  }

  if (applicationId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
      return NextResponse.json({ error: 'This application cannot be updated.' }, { status: 400 });
    }
    const { data: updated, error: updateError } = await database
      .from('mm_merchant_applications')
      .update({
        business_name: businessName,
        requested_slug: requestedSlug,
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        business_description: description,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        reviewed_by_email: null,
        reviewed_at: null
      })
      .eq('id', applicationId)
      .eq('user_id', auth.user.id)
      .eq('status', 'information_requested')
      .select('id, business_name, requested_slug, contact_name, contact_email, contact_phone, business_description, status, review_note, submitted_at')
      .maybeSingle();
    if (updateError) {
      if (updateError.code === '23505') {
        return NextResponse.json({ error: 'That boutique URL is already in use.' }, { status: 409 });
      }
      console.error('[MidnightMarket] Could not update seller application:', updateError);
      return NextResponse.json({ error: 'Could not resubmit your seller application.' }, { status: 503 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'This application is not waiting for more information.' }, { status: 409 });
    }
    return NextResponse.json({ application: updated }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: membership, error: membershipError } = await database
    .from('mm_merchant_memberships')
    .select('merchant_id')
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    console.error('[MidnightMarket] Could not check existing seller access:', membershipError);
    return NextResponse.json({ error: 'Could not check your seller access. Try again.' }, { status: 503 });
  }
  if (membership) return NextResponse.json({ error: 'Your account already has an approved boutique.' }, { status: 409 });

  const { data: existingMerchant, error: merchantLookupError } = await database
    .from('mm_merchants')
    .select('id')
    .eq('slug', requestedSlug)
    .maybeSingle();
  if (merchantLookupError) {
    console.error('[MidnightMarket] Could not check requested boutique URL:', merchantLookupError);
    return NextResponse.json({ error: 'Could not verify that boutique URL. Try again.' }, { status: 503 });
  }
  if (existingMerchant) return NextResponse.json({ error: 'That boutique URL is already in use.' }, { status: 409 });

  const { data: application, error } = await database
    .from('mm_merchant_applications')
    .insert({
      user_id: auth.user.id,
      business_name: businessName,
      requested_slug: requestedSlug,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      business_description: description
    })
    .select('id, business_name, requested_slug, status, review_note, submitted_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You already have an application under review, or that boutique URL has been requested.' }, { status: 409 });
    }
    console.error('[MidnightMarket] Could not submit merchant application:', error);
    return NextResponse.json({ error: 'Could not submit your seller application.' }, { status: 503 });
  }

  return NextResponse.json({ application }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
