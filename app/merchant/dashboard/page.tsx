'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ImagePlus, Store } from 'lucide-react';
import { marketSupabase } from '@/lib/marketSupabaseClient';

type Category = { name: string; slug: string };
type MerchantProduct = {
  id: string;
  name: string;
  slug: string;
  status: string;
  variants: Array<{
    price_minor: number;
    currency: string;
    size: string | null;
    color: string | null;
    inventory: { quantity_available: number; quantity_reserved: number } | null;
  }>;
  images: Array<{ url: string; alt: string }>;
};
type MerchantOffer = {
  id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  listed_price_minor: number;
  latest_amount_minor: number;
  accepted_amount_minor: number | null;
  status: string;
  product: { name: string; slug: string };
  variant: { size: string | null; color: string | null };
  messages: Array<{ actor: string; action: string; amount_minor: number | null; message: string | null; created_at: string }>;
};
type Application = { status: string; review_note: string | null; business_name: string };

const blankForm = { name: '', description: '', category: '', price: '', stock: '', size: '', color: '' };

export default function MerchantDashboardPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [offers, setOffers] = useState<MerchantOffer[]>([]);
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});
  const [application, setApplication] = useState<Application | null>(null);
  const [form, setForm] = useState(blankForm);
  const [image, setImage] = useState<File | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [workingOfferId, setWorkingOfferId] = useState<string | null>(null);

  const loadOffers = useCallback(async (token: string) => {
    const response = await fetch('/api/market/merchant-offers', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const result = await response.json() as { offers?: MerchantOffer[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not load customer offers.');
    setOffers(result.offers || []);
  }, []);

  const loadProducts = useCallback(async (token: string) => {
    const response = await fetch('/api/market/merchant-products', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const result = await response.json() as { products?: MerchantProduct[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not load your shop.');
    setProducts(result.products || []);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const categoryResponse = await fetch('/api/market/catalog', { cache: 'no-store' });
        const categoryResult = await categoryResponse.json() as { categories?: Category[]; error?: string };
        if (!categoryResponse.ok) throw new Error(categoryResult.error || 'Could not load market categories.');
        if (active) setCategories(categoryResult.categories || []);

        if (!marketSupabase) throw new Error('Merchant Studio is not configured on this site.');
        const { data: { session } } = await marketSupabase.auth.getSession();
        if (!active) return;
        if (!session?.access_token) {
          setError('Sign in to access your seller account.');
          return;
        }
        try {
          await loadProducts(session.access_token);
          await loadOffers(session.access_token);
          if (active) setAccessToken(session.access_token);
        } catch (cause) {
          const applicationResponse = await fetch('/api/market/merchant-application', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store'
          });
          const applicationResult = await applicationResponse.json() as { application?: Application | null };
          if (applicationResponse.ok && applicationResult.application && active) {
            setApplication(applicationResult.application);
            if (applicationResult.application.status === 'approved') {
              setError(cause instanceof Error ? cause.message : 'Your merchant access is currently unavailable.');
            }
          } else {
            throw cause;
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not open Merchant Studio.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => { active = false; };
  }, [loadOffers, loadProducts]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    setImage(event.target.files?.[0] || null);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    if (!image) {
      setError('Choose a product photo before submitting the listing.');
      return;
    }
    setWorking(true);
    setError('');
    setMessage('');
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.set(key, value));
    body.set('image', image);
    try {
      const response = await fetch('/api/market/merchant-products', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body
      });
      const result = await response.json() as { product?: { id: string }; error?: string };
      if (!response.ok || !result.product) throw new Error(result.error || 'Could not create this listing.');
      setMessage('Listing sent for Market review. It will appear in the storefront after approval.');
      setForm(blankForm);
      setImage(null);
      await loadProducts(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create this listing.');
    } finally {
      setWorking(false);
    }
  }

  async function respondToOffer(offer: MerchantOffer, action: 'accept' | 'counter' | 'decline') {
    if (!accessToken) return;
    const amountMinor = Math.round(Number(counterAmounts[offer.id]) * 100);
    if (action === 'counter' && (!Number.isSafeInteger(amountMinor) || amountMinor < 100 || amountMinor > offer.listed_price_minor)) {
      setError('Enter a counteroffer between KSh 1 and the listed price.');
      return;
    }
    setWorkingOfferId(offer.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/market/merchant-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ offerId: offer.id, action, amountMinor })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this offer.');
      setMessage(action === 'accept' ? 'The offered price was accepted.' : action === 'counter' ? 'Your counteroffer was sent.' : 'The offer was declined.');
      await loadOffers(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this offer.');
    } finally {
      setWorkingOfferId(null);
    }
  }

  return (
    <>
      <header className="mm-header">
        <Link className="mm-brand" href="/market">MIDNIGHT <span>MARKET</span></Link>
        <nav className="mm-nav"><Link href="/merchant/register">Seller application</Link></nav>
      </header>
      <main className="mm-page mm-merchant-register">
        <Link className="mm-text-link" href="/market"><ArrowLeft size={14} /> Back to Market</Link>
        <div className="mm-register-card">
          <div className="mm-eyebrow">Merchant Studio</div>
          <h1>Your boutique, your finds.</h1>
          <p className="mm-register-copy">Upload product photos, prices and stock. New listings are reviewed before they appear in the customer market.</p>

          {loading && <div className="mm-state">Opening Merchant Studio…</div>}
          {!loading && error && !accessToken && !application && (
            <div className="mm-state">
              {error} <Link className="mm-text-link" href="/merchant/portal/login">Sign in</Link> · <Link className="mm-text-link" href="/merchant/register">Seller application</Link>
            </div>
          )}
          {!loading && application && (
            <div className="mm-state">
              <Store size={22} />
              <strong>{application.business_name}</strong>
              <span>Seller application: {application.status.replace(/_/g, ' ')}</span>
              {application.review_note && <span>{application.review_note}</span>}
              {error && <span className="mm-error">{error}</span>}
              {application.status === 'approved'
                ? <span>Merchant access is currently unavailable. Contact Market Operations if your boutique should be active.</span>
                : <Link className="mm-text-link" href="/merchant/register">View application</Link>}
            </div>
          )}
          {!loading && accessToken && !application && (
            <form className="mm-form" onSubmit={submitProduct}>
              <label>Product name<input required minLength={2} maxLength={180} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                <option value="">Choose a category</option>
                {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
              </select></label>
              <label>Price (KSh)<input required type="number" min="1" max="1000000" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
              <label>Available stock<input required type="number" min="0" max="1000000" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
              <label>Size (optional)<input maxLength={80} value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></label>
              <label>Colour (optional)<input maxLength={80} value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
              <label className="mm-form-wide">Description<textarea rows={4} maxLength={3000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <label className="mm-form-wide mm-upload-field">
                <span><ImagePlus size={18} /> Product photo · JPG, PNG, WebP or AVIF, up to 4 MB</span>
                <input required type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleImageChange} />
                {image && <span>{image.name}</span>}
              </label>
              {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
              {message && <div className="mm-state mm-form-wide" role="status">{message}</div>}
              <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Uploading listing…' : 'Submit listing for review'}</button>
            </form>
          )}
        </div>

        {accessToken && !application && (
          <section className="mm-merchant-listings">
            <div className="mm-section-heading">
              <div><div className="mm-eyebrow">Customer conversations</div><h2>Price offers</h2></div>
            </div>
            {error && <div className="mm-state mm-error" role="alert">{error}</div>}
            {message && <div className="mm-state" role="status">{message}</div>}
            {offers.length === 0
              ? <div className="mm-state">No customer offers yet.</div>
              : <div className="mm-offer-cards">
                {offers.map((offer) => (
                  <article className="mm-offer-card" key={offer.id}>
                    <div className="mm-offer-card-heading">
                      <div><strong>{offer.product.name}</strong><span>{[offer.variant.size, offer.variant.color].filter(Boolean).join(' / ') || 'Standard'} · {offer.status.replace(/_/g, ' ')}</span></div>
                      <strong>KSh {(offer.latest_amount_minor / 100).toLocaleString('en-KE')}</strong>
                    </div>
                    <div className="mm-offer-contact">{offer.buyer_name} · <a href={`mailto:${encodeURIComponent(offer.buyer_email)}`}>{offer.buyer_email}</a>{offer.buyer_phone && <> · <a href={`tel:${encodeURIComponent(offer.buyer_phone)}`}>{offer.buyer_phone}</a></>}</div>
                    <ol className="mm-offer-history">
                      {offer.messages.map((item, index) => <li key={`${item.created_at}-${index}`}>
                        <strong>{item.actor === 'admin' ? 'Market Operations' : item.actor === 'buyer' ? 'Customer' : 'Boutique'} · {item.action}</strong>
                        {item.amount_minor !== null && <span>KSh {(item.amount_minor / 100).toLocaleString('en-KE')}</span>}
                        {item.message && <p>{item.message}</p>}
                      </li>)}
                    </ol>
                    {['pending_merchant', 'countered'].includes(offer.status) && (
                      <div className="mm-offer-actions">
                        <button className="mm-button" type="button" disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'accept')}>Accept</button>
                        <label>Counteroffer (KSh)<input type="number" min="1" max={offer.listed_price_minor / 100} step="1" value={counterAmounts[offer.id] || ''} onChange={(event) => setCounterAmounts({ ...counterAmounts, [offer.id]: event.target.value })} /></label>
                        <button className="mm-button mm-button-secondary" type="button" disabled={workingOfferId === offer.id || !counterAmounts[offer.id]} onClick={() => void respondToOffer(offer, 'counter')}>Counter</button>
                        <button className="mm-text-link" type="button" disabled={workingOfferId === offer.id} onClick={() => void respondToOffer(offer, 'decline')}>Decline</button>
                      </div>
                    )}
                    {offer.status === 'accepted' && <p className="mm-phase-note">Recorded as a non-binding price agreement. Contact the customer to arrange next steps; checkout is not enabled.</p>}
                  </article>
                ))}
              </div>}
          </section>
        )}

        {products.length > 0 && (
          <section className="mm-merchant-listings">
            <div className="mm-section-heading"><div><div className="mm-eyebrow">Your catalogue</div><h2>Product listings</h2></div></div>
            <div className="mm-product-grid">
              {products.map((product) => (
                <article className="mm-product-card" key={product.id}>
                  <div className="mm-product-image">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt} fill unoptimized sizes="(max-width: 800px) 50vw, 25vw" /> : <ImagePlus size={40} />}</div>
                  <h3>{product.name}</h3>
                  <div className="mm-product-meta">Status: {product.status.replace(/_/g, ' ')}</div>
                  {product.variants[0] && <div className="mm-product-price">KSh {(product.variants[0].price_minor / 100).toLocaleString('en-KE')}</div>}
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
