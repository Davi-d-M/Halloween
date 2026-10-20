'use client';

import { useEffect, useRef, useState } from 'react';
import { Headphones, Pause, Play, Volume2 } from 'lucide-react';

type Track = { id: string; collection: string; title: string; url: string };

export default function WaitlistMusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/market/music', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { tracks?: Track[]; error?: string };
        if (!response.ok) throw new Error(result.error || 'Waitlist tracks could not be loaded.');
        if (!Array.isArray(result.tracks)) throw new Error('Waitlist tracks could not be loaded.');
        setTracks(result.tracks);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Waitlist tracks could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const selectedTrack = tracks.find((track) => track.id === selectedTrackId);

  async function playSelectedTrack() {
    const audio = audioRef.current;
    if (!audio || !selectedTrack) return;
    setError('');
    if (audio.src !== selectedTrack.url) {
      audio.src = selectedTrack.url;
      audio.load();
    }
    try {
      await audio.play();
    } catch (cause) {
      console.error('[MidnightMarket] Could not play the selected Waitlist track:', cause);
      setError('This track could not be played. Try another song or check your connection.');
      setPlaying(false);
    }
  }

  function selectTrack(id: string) {
    setSelectedTrackId(id);
    setError('');
    if (!id) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    if (!playing) return;
    const track = tracks.find((item) => item.id === id);
    const audio = audioRef.current;
    if (!track || !audio) return;
    audio.src = track.url;
    audio.load();
    void audio.play().catch((cause: unknown) => {
      console.error('[MidnightMarket] Could not switch Waitlist tracks:', cause);
      setError('This track could not be played. Try another song or check your connection.');
      setPlaying(false);
    });
  }

  return (
    <aside className="mm-music-player" aria-label="Waitlist music player">
      <audio
        ref={audioRef}
        aria-hidden="true"
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          if (audioRef.current?.src) {
            setError('This track could not be loaded. Try another song or check your connection.');
            setPlaying(false);
          }
        }}
      />
      <div className="mm-music-player-brand" aria-hidden="true">
        <Headphones size={17} />
        <Volume2 size={14} />
      </div>
      <div className="mm-music-player-info">
        <span className="mm-music-player-eyebrow">Waitlist sounds</span>
        <strong>{selectedTrack?.title || (loading ? 'Loading tracks…' : tracks.length ? 'Choose a track' : 'No tracks published yet')}</strong>
      </div>
      <label className="mm-music-track-select">
        <span className="mm-visually-hidden">Choose a Waitlist track</span>
        <select
          aria-label="Choose a Waitlist track"
          value={selectedTrackId}
          onChange={(event) => selectTrack(event.target.value)}
          disabled={loading || tracks.length === 0}
        >
          {tracks.length === 0
            ? <option value="">{loading ? 'Loading tracks…' : 'No tracks available'}</option>
            : <>
              <option value="">Choose a track</option>
              {tracks.map((track) => <option key={track.id} value={track.id}>{track.collection} · {track.title}</option>)}
            </>}
        </select>
      </label>
      <button
        className="mm-music-play"
        type="button"
        onClick={() => {
          if (playing) audioRef.current?.pause();
          else void playSelectedTrack();
        }}
        disabled={loading || !selectedTrack}
        aria-label={playing ? 'Pause music' : 'Play music'}
      >
        {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        <span>{playing ? 'Pause' : 'Play'}</span>
      </button>
      {error && <span className="mm-music-player-error" role="alert">{error}</span>}
    </aside>
  );
}
