import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Private Seller Registration | Midnight Market',
  description: 'Create a separate Midnight Market seller account.'
};

export default function MarketSellerRegistrationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
