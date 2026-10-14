import { MarketCategoryPage } from '../../market-pages';

export default async function MarketCategoryRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MarketCategoryPage slug={slug} />;
}
