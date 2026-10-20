import { NextResponse } from 'next/server';

const waitlistContentUrl = 'https://theewaitlist.vercel.app/api/content';
const genreLabels: Record<string, string> = {
  reggae: 'Reggae',
  genge: 'Genge',
  gengetone: 'Gengetone',
  soul: 'Soul',
  rnb: 'R&B',
  classic: 'Classics',
  love_romance: 'Love & Romance',
  afrobeats: 'Afrobeats',
  hip_hop: 'Hip-hop',
  pop: 'Pop',
  other: 'Other',
};

type WaitlistResponse = {
  content?: {
    genre_tracks?: Record<string, unknown>;
  };
};

export async function GET() {
  let response: Response;
  try {
    response = await fetch(waitlistContentUrl, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error('[MidnightMarket] Could not reach Waitlist music settings:', error);
    return NextResponse.json({ error: 'Waitlist music is temporarily unavailable.' }, { status: 503 });
  }

  if (!response.ok) {
    console.error('[MidnightMarket] Waitlist music settings returned an error:', response.status);
    return NextResponse.json({ error: 'Waitlist music is temporarily unavailable.' }, { status: 503 });
  }

  let content: WaitlistResponse;
  try {
    content = await response.json() as WaitlistResponse;
  } catch (error) {
    console.error('[MidnightMarket] Waitlist music settings were not valid JSON:', error);
    return NextResponse.json({ error: 'Waitlist music settings could not be read.' }, { status: 502 });
  }

  const rawTracks = content.content?.genre_tracks;
  const tracks = rawTracks && typeof rawTracks === 'object' && !Array.isArray(rawTracks)
    ? Object.entries(rawTracks).flatMap(([id, value]) => {
      if (!Object.prototype.hasOwnProperty.call(genreLabels, id) || !value || typeof value !== 'object') return [];
      const track = value as { title?: unknown; url?: unknown };
      if (typeof track.title !== 'string' || typeof track.url !== 'string') return [];
      const title = track.title.trim();
      if (!title || title.length > 120 || track.url.length > 2048) return [];
      try {
        if (new URL(track.url).protocol !== 'https:') return [];
      } catch {
        return [];
      }
      return [{ id, genre: genreLabels[id], title, url: track.url }];
    })
    : [];

  return NextResponse.json({ tracks }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}
