import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Become a Merchant | Midnight Market',
  description: 'Apply to sell products in Midnight Market.'
};

export default function MerchantRegistrationRouteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
