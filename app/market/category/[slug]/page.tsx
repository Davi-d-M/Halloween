import { redirect } from 'next/navigation';

export default async function MarketCategoryRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/shop/category/${slug}`);
}
