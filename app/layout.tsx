import type { Metadata, Viewport } from 'next';
import SessionReplay, { SessionReplayConsent } from './session-replay';

export const metadata: Metadata = {
  title: 'Midnight Market | Fashion After Dark',
  description: 'Discover independent fashion, accessories and looks from Midnight Market boutiques.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <SessionReplay appName="Midnight Market" />
        <SessionReplayConsent />
      </body>
    </html>
  );
}
