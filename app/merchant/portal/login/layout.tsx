import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Merchant Studio Sign In | Midnight Market',
  description: 'Private sign-in for approved Midnight Market sellers.'
};

export default function MarketSellerLoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
