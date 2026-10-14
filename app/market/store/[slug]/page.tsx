import { MarketStorePage } from '../../market-pages';

export default async function MarketStoreRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <MarketStorePage slug={slug} />;
}
