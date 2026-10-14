import { MarketProductPage } from '../../market-pages';

export default async function MarketProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MarketProductPage slug={slug} />;
}
