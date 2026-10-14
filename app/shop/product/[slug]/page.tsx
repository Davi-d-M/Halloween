import { MarketProductPage } from '../../../market/market-pages';

export default async function ShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MarketProductPage slug={slug} />;
}
