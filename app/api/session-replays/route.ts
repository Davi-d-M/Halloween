import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxBodyBytes = 300 * 1024;

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
      || request.headers.get('host') || requestUrl.host;
    const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
      || requestUrl.protocol.replace(/:$/, '');
    return originUrl.host.toLowerCase() === host.toLowerCase()
      && originUrl.protocol === `${protocol.replace(/:$/, '')}:`
      && !originUrl.username && !originUrl.password
      && originUrl.pathname === '/' && !originUrl.search && !originUrl.hash;
  } catch {
    return false;
  }
}

function getDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Same-origin replay upload required.' }, { status: 403 });
  if (Number(request.headers.get('content-length') || 0) > maxBodyBytes) {
    return NextResponse.json({ error: 'Replay batch is too large.' }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) {
      return NextResponse.json({ error: 'Replay batch is too large.' }, { status: 413 });
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send a valid replay batch.' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const pagePath = typeof body.pagePath === 'string' ? body.pagePath : '';
  const events = body.events;
  if (!uuidPattern.test(sessionId) || !pagePath.startsWith('/') || pagePath.length > 512
    || /[?#]/.test(pagePath) || !Array.isArray(events) || events.length < 1 || events.length > 40) {
    return NextResponse.json({ error: 'Replay batch details are invalid.' }, { status: 400 });
  }

  const database = getDatabase();
  if (!database) return NextResponse.json({ error: 'First-party replay storage is not configured.' }, { status: 503 });
  const { error } = await database.rpc('record_session_replay_batch', {
    p_session_id: sessionId,
    p_app_name: 'midnight-market',
    p_page_path: pagePath,
    p_events: events
  });
  if (error) {
    console.error('[SessionReplay] Could not store replay batch:', error);
    return NextResponse.json({ error: 'The replay batch could not be stored.' }, { status: 503 });
  }
  return NextResponse.json({ saved: true }, { headers: { 'Cache-Control': 'no-store' } });
}
