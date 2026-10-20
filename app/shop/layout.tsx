import type { Metadata } from 'next';
import '../market/market.css';
import { MarketShoppingProvider } from '../market/market-shopping';
import WaitlistMusicPlayer from '../market/waitlist-music-player';

export const metadata: Metadata = {
  title: 'Midnight Market | Shop',
  description: 'Discover independent fashion and after-dark style.',
};

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <MarketShoppingProvider>
      <div className="mm-shell">{children}</div>
      <WaitlistMusicPlayer />
    </MarketShoppingProvider>
  );
}
