import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main style={{
      alignItems: 'center',
      background: '#F9F4EC',
      color: '#10231f',
      display: 'flex',
      justifyContent: 'center',
      minHeight: '100dvh',
      padding: 24,
      textAlign: 'center',
    }}>
      <section style={{ maxWidth: 440 }}>
        <p style={{ color: '#D91C1C', fontSize: 12, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase' }}>
          Midnight Market
        </p>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(36px, 9vw, 56px)', fontWeight: 400, margin: '16px 0' }}>
          You’re offline.
        </h1>
        <p style={{ lineHeight: 1.7 }}>
          Reconnect to browse current products, availability, and boutique details.
        </p>
        <Link href="/shop" style={{
          background: '#D91C1C',
          borderRadius: 6,
          color: '#fff',
          display: 'inline-block',
          marginTop: 16,
          padding: '12px 18px',
          textDecoration: 'none',
        }}>
          Try the shop again
        </Link>
      </section>
    </main>
  );
}
