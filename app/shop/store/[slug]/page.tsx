import { MarketStorePage } from '../../../market/market-pages';

export default async function ShopStorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MarketStorePage slug={slug} />;
}
