import type { Metadata, Viewport } from 'next';
import SessionReplay, { SessionReplayConsent } from './session-replay';
import PwaRegistration from './pwa-registration';

export const metadata: Metadata = {
  title: 'Midnight Market | Fashion After Dark',
  description: 'Discover independent fashion, accessories and looks from Midnight Market boutiques.',
  applicationName: 'Midnight Market',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Midnight Market',
  },
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
        <PwaRegistration />
        <SessionReplay />
        <SessionReplayConsent />
      </body>
    </html>
  );
}
