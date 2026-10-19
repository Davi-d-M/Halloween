import { MarketProductPage } from '../../../market/market-pages';

export default async function ShopProductPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ variant?: string; quantity?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const requestedQuantity = Number(query.quantity);
  const initialQuantity = Number.isInteger(requestedQuantity) && requestedQuantity >= 1 && requestedQuantity <= 10
    ? requestedQuantity
    : 1;
  return <MarketProductPage slug={slug} initialVariantId={query.variant} initialQuantity={initialQuantity} />;
}
