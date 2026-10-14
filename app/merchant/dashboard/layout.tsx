import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Merchant Studio | Midnight Market',
  description: 'Manage products and stock for your Midnight Market boutique.'
};

export default function MerchantDashboardRouteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
