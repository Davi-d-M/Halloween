import type { Metadata } from 'next';
import MerchantDashboardPage from './studio-dashboard';

export const metadata: Metadata = {
  title: 'Merchant Studio | Midnight Market',
  description: 'Private merchant workspace for Midnight Market sellers.',
};

export default function MarketPage() {
  return <MerchantDashboardPage />;
}
