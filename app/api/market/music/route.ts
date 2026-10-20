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
    age_group_tracks?: Record<string, unknown>;
    genre_tracks?: Record<string, unknown>;
  };
};

const ageGroupLabels: Record<string, string> = {
  '18_20': 'Age-group mix · 18–20',
  '21_24': 'Age-group mix · 21–24',
  '25_34': 'Age-group mix · 25–34',
  '35_44': 'Age-group mix · 35–44',
  '45_plus': 'Age-group mix · 45+',
};

function normalizeTracks(raw: unknown, labels: Record<string, string>, prefix: string) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw).flatMap(([id, value]) => {
    if (!Object.prototype.hasOwnProperty.call(labels, id) || !value || typeof value !== 'object') return [];
    const track = value as { title?: unknown; url?: unknown };
    if (typeof track.title !== 'string' || typeof track.url !== 'string') return [];
    const title = track.title.trim();
    if (!title || title.length > 120 || track.url.length > 2048) return [];
    try {
      if (new URL(track.url).protocol !== 'https:') return [];
    } catch {
      return [];
    }
    return [{ id: `${prefix}:${id}`, collection: labels[id], title, url: track.url }];
  });
}

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
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Waitlist music settings were not an object.');
    }
    content = payload as WaitlistResponse;
    if (!content.content || typeof content.content !== 'object' || Array.isArray(content.content)) {
      throw new Error('Waitlist music content was missing.');
    }
  } catch (error) {
    console.error('[MidnightMarket] Waitlist music settings were not valid JSON:', error);
    return NextResponse.json({ error: 'Waitlist music settings could not be read.' }, { status: 502 });
  }

  const ageGroupTracks = normalizeTracks(content.content?.age_group_tracks, ageGroupLabels, 'age');
  const genreTracks = normalizeTracks(content.content?.genre_tracks, genreLabels, 'genre');

  return NextResponse.json({ tracks: [...ageGroupTracks, ...genreTracks] }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
  });
}
