import type { Metadata } from 'next';
import './market.css';

export const metadata: Metadata = {
  title: 'Midnight Market | Fashion After Dark',
  description: 'Discover independent fashion, accessories and looks from Midnight Market boutiques.',
};

export default function MarketLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mm-shell">{children}</div>;
}
