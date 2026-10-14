import { MarketCategoryPage } from '../../../market/market-pages';

export default async function ShopCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MarketCategoryPage slug={slug} />;
}
