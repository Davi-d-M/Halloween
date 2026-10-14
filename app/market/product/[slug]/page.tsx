import { redirect } from 'next/navigation';

export default async function MarketProductRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/shop/product/${slug}`);
}
