import type { Metadata } from 'next';
import '../market/market.css';

export const metadata: Metadata = {
  title: 'Midnight Market | Shop',
  description: 'Discover independent fashion and after-dark style.',
};

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mm-shell">{children}</div>;
}
