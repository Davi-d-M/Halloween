'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Handshake, MoonStar, Search, Store } from 'lucide-react';
import MarketLogo from './market-logo';

type Category = { name: string; slug: string; description: string | null };
type Product = {
  id: string;
  name: string;
  slug: string;
  availabilityStatus: 'available_now' | 'planned' | 'made_to_order';
  estimatedAvailableOn: string | null;
  description: string | null;
  attributes: Record<string, string>;
  deliveryInformation: string | null;
  returnPolicy: string | null;
  merchant: { name: string; slug: string };
  category: { name: string; slug: string } | null;
  variants: Array<{
    id: string;
    size: string | null;
    color: string | null;
    priceMinor: number;
    salePriceMinor: number | null;
    currency: string;
    inStock: boolean;
  }>;
  images: Array<{ url: string; alt: string; mediaType: 'image' | 'video' }>;
};
type Catalog = {
  categories: Category[];
  products: Product[];
  campaign?: { title: string; message: string } | null;
  pagination?: { page: number; pageSize: number; total: number; hasMore: boolean };
};

type OfferThread = {
  id: string;
  status: string;
  latest_amount_minor: number;
  listed_price_minor: number;
  accepted_amount_minor: number | null;
  expires_at: string;
  product: { name: string; slug: string };
  merchant: { name: string };
  variant: { size: string | null; color: string | null };
  messages: Array<{ actor: string; action: string; amount_minor: number | null; message: string | null; created_at: string }>;
};

function useCatalog(filters = '') {
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], products: [], campaign: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    if (page === 1) setError(null);
    const parameters = new URLSearchParams(filters);
    parameters.set('page', String(page));
    fetch(`/api/market/catalog?${parameters.toString()}`, {
      cache: 'no-store',
      signal: controller.signal
    })
      .then(async (response) => {
        const result = await response.json() as Catalog & { error?: string };
        if (!response.ok) throw new Error(result.error || 'The Market catalog could not be loaded.');
        setCatalog((current) => ({
          ...result,
          products: page === 1
            ? result.products
            : [...current.products, ...result.products.filter((item) => !current.products.some((existing) => existing.id === item.id))]
        }));
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'The Market catalog could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filters, page]);

  const loadMore = useCallback(() => {
    if (!loading && catalog.pagination?.hasMore) setPage((current) => current + 1);
  }, [catalog.pagination?.hasMore, loading]);

  return {
    ...catalog,
    loading,
    error,
    hasMore: catalog.pagination?.hasMore ?? false,
    total: catalog.pagination?.total ?? catalog.products.length,
    loadMore
  };
}

function MarketHeader() {
  return (
    <header className="mm-header">
      <Link className="mm-brand" href="/shop" aria-label="Midnight Market home">
        <MarketLogo className="mm-brand-mark" />
        <span className="mm-brand-name">MIDNIGHT <span>MARKET</span></span>
      </Link>
      <nav className="mm-nav" aria-label="Market navigation">
        <Link href="/shop">Discover</Link>
        <Link href="/shop#categories">Categories</Link>
      </nav>
    </header>
  );
}

function ProductGrid({ products, emptyMessage }: { products: Product[]; emptyMessage?: string }) {
  if (products.length === 0) {
    return <div className="mm-state">{emptyMessage || 'New independent boutiques are joining. Check back soon.'}</div>;
  }

  return (
    <div className="mm-product-grid">
      {products.map((product) => {
        const currency = product.variants[0]?.currency || 'KES';
        const inStock = product.variants.some((variant) => variant.inStock);
        const availabilityLabel = product.availabilityStatus === 'planned'
          ? 'Planned · coming soon'
          : product.availabilityStatus === 'made_to_order'
            ? 'Made to order'
            : inStock ? 'Available now' : 'Sold out';
        return (
          <Link className="mm-product-card" href={`/shop/product/${product.slug}`} key={product.id}>
            <div className="mm-product-image">
              {product.images[0]
                ? product.images[0].mediaType === 'video'
                  ? <video src={product.images[0].url} muted playsInline aria-label={product.images[0].alt} />
                  : <Image src={product.images[0].url} alt={product.images[0].alt} fill unoptimized sizes="(max-width: 800px) 50vw, 25vw" />
                : <MoonStar aria-hidden="true" size={42} strokeWidth={1} />}
              <span className={`mm-availability-badge mm-availability-${product.availabilityStatus}`}>{availabilityLabel}</span>
            </div>
            <h3>{product.name}</h3>
            <div className="mm-product-meta">{product.merchant.name}{product.category ? ` · ${product.category.name}` : ''}</div>
            <div className="mm-product-price">
              {new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(
                Math.min(...product.variants.map((variant) => variant.salePriceMinor ?? variant.priceMinor)) / 100
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function MarketFooter() {
  return (
    <footer className="mm-footer">
      <MarketLogo className="mm-footer-mark" />
      <span>Midnight Market — independent boutiques and after-dark style.</span>
    </footer>
  );
}

function ProductOfferPanel({ product, variant }: { product: Product; variant: Product['variants'][number] }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', amount: '', message: '' });
  const [offerId, setOfferId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [offer, setOffer] = useState<OfferThread | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOffer = useCallback(async (id: string, token: string) => {
    const response = await fetch('/api/market/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lookup', offerId: id, accessToken: token }),
      cache: 'no-store'
    });
    const result = await response.json() as { offer?: OfferThread; error?: string };
    if (!response.ok || !result.offer) throw new Error(result.error || 'Could not load this offer.');
    setOffer(result.offer);
  }, []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`mm-offer:${product.id}`);
      if (!saved) return;
      const credentials = JSON.parse(saved) as { offerId?: string; accessToken?: string };
      if (!credentials.offerId || !credentials.accessToken) return;
      setOfferId(credentials.offerId);
      setAccessToken(credentials.accessToken);
      void loadOffer(credentials.offerId, credentials.accessToken).catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not load this offer.');
      });
    } catch {
      setError('Offer tracking is unavailable in this browser session.');
    }
  }, [loadOffer, product.id]);

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = Math.round(Number(form.amount) * 100);
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/market/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          productId: product.id,
          variantId: variant.id,
          buyerName: form.name,
          buyerEmail: form.email,
          buyerPhone: form.phone,
          amountMinor,
          message: form.message
        })
      });
      const result = await response.json() as { offer?: { id: string }; accessToken?: string; error?: string };
      if (!response.ok || !result.offer || !result.accessToken) throw new Error(result.error || 'Could not send your offer.');
      setOfferId(result.offer.id);
      setAccessToken(result.accessToken);
      try {
        sessionStorage.setItem(`mm-offer:${product.id}`, JSON.stringify({ offerId: result.offer.id, accessToken: result.accessToken }));
      } catch {
        setNotice('Your offer was sent, but this browser could not save its private tracking session. Keep this page open to follow it.');
      }
      await loadOffer(result.offer.id, result.accessToken);
      setNotice((current) => current || 'Offer sent to the boutique. The amount is a request, not a confirmed sale.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your offer.');
    } finally {
      setWorking(false);
    }
  }

  async function respond(responseAction: 'accept' | 'counter' | 'decline') {
    if (!offerId || !accessToken) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const amountMinor = Math.round(Number(counterAmount) * 100);
      const response = await fetch('/api/market/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'respond',
          offerId,
          accessToken,
          responseAction,
          amountMinor: responseAction === 'counter' ? amountMinor : undefined
        })
      });
      const result = await response.json() as { offer?: { status: string }; error?: string };
      if (!response.ok || !result.offer) throw new Error(result.error || 'Could not update your offer.');
      await loadOffer(offerId, accessToken);
      setNotice(responseAction === 'accept'
        ? 'You accepted the proposed price. This records interest only; checkout and payment are not enabled.'
        : responseAction === 'counter'
          ? 'Your counteroffer was sent to the boutique.'
          : 'You declined this offer.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your offer.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mm-offer-panel">
      <div className="mm-eyebrow"><Handshake size={15} /> Price conversation</div>
      <h2>Make an offer</h2>
      <p>Ask the boutique about a price. Offers expire after 14 days. No payment or order is created here.</p>
      {offer ? (
        <div className="mm-offer-thread">
          <div className="mm-offer-state">Offer status: <strong>{offer.status.replace(/_/g, ' ')}</strong></div>
          <ol>
            {offer.messages.map((item, index) => (
              <li key={`${item.created_at}-${index}`}>
                <strong>{item.actor === 'buyer' ? 'You' : item.actor === 'admin' ? 'Market Operations' : 'Boutique'} · {item.action}</strong>
                {item.amount_minor !== null && <span>KSh {(item.amount_minor / 100).toLocaleString('en-KE')}</span>}
                {item.message && <p>{item.message}</p>}
                <time>{new Date(item.created_at).toLocaleString()}</time>
              </li>
            ))}
          </ol>
          {offer.status === 'countered' && (
            <div className="mm-offer-actions">
              <button className="mm-button" type="button" disabled={working} onClick={() => void respond('accept')}>Accept counteroffer</button>
              <label>Counteroffer (KSh)<input type="number" min="1" max={offer.listed_price_minor / 100} step="1" value={counterAmount} onChange={(event) => setCounterAmount(event.target.value)} /></label>
              <button className="mm-button mm-button-secondary" type="button" disabled={working || !counterAmount} onClick={() => void respond('counter')}>Send counteroffer</button>
              <button className="mm-text-link" type="button" disabled={working} onClick={() => void respond('decline')}>Decline</button>
            </div>
          )}
          {offer.status === 'accepted' && <p className="mm-phase-note">This is a recorded price agreement only. Contact the boutique directly; the Market does not process checkout or payment.</p>}
        </div>
      ) : (
        <form className="mm-form" onSubmit={submitOffer}>
          <label>Your name<input required minLength={2} maxLength={160} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Phone (optional)<input type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Offer (KSh)<input required type="number" min="1" max={variant.priceMinor / 100} step="1" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <label className="mm-form-wide">Note (optional)<textarea rows={3} maxLength={500} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
          {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
          {notice && <div className="mm-state mm-form-wide" role="status">{notice}</div>}
          <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Sending…' : 'Send price offer'}</button>
        </form>
      )}
      {offer && (
        <>
          {error && <div className="mm-state mm-error" role="alert">{error}</div>}
          {notice && <div className="mm-state" role="status">{notice}</div>}
          <button className="mm-text-link" type="button" disabled={working} onClick={() => void loadOffer(offerId, accessToken)}>Refresh offer status</button>
        </>
      )}
      <p className="mm-offer-privacy">Your email and phone are shared only with this boutique and Market Operations. Keep this browser session to view the private offer thread.</p>
    </section>
  );
}

function ProductOrderRequestPanel({ product, variant }: { product: Product; variant: Product['variants'][number] }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: '1', note: '' });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');

  async function submitOrderRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    setReference('');
    try {
      const response = await fetch('/api/market/order-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          variantId: variant.id,
          name: form.name,
          email: form.email,
          phone: form.phone,
          quantity: Number(form.quantity),
          note: form.note
        })
      });
      const result = await response.json() as { order?: { reference: string }; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error || 'Could not send your order request.');
      setReference(result.order.reference);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your order request.');
    } finally {
      setWorking(false);
    }

  }

  return (
    <section className="mm-order-request">
      <div className="mm-eyebrow">Request from boutique</div>
      <h2>Request this item</h2>
      <p>This sends an unpaid order request to the boutique. They must confirm availability and contact you to arrange payment and delivery.</p>
      {reference ? (
        <div className="mm-state" role="status">
          <strong>Request sent · {reference}</strong>
          <span>Your request is waiting for the boutique to confirm. No payment has been taken.</span>
        </div>
      ) : (
        <form className="mm-form" onSubmit={submitOrderRequest}>
          <label>Your name<input required minLength={2} maxLength={160} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Phone<input required type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>Quantity<input required type="number" min="1" max="10" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></label>
          <label className="mm-form-wide">Message for the boutique (optional)<textarea rows={3} maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
          <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Sending request…' : 'Send order request'}</button>
        </form>
      )}
      <p className="mm-offer-privacy">Your contact details are shared with this boutique and Market Operations to handle your request. This is not a paid order.</p>
    </section>
  );
}

function ProductInterestPanel({ product }: { product: Product }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', note: '' });
  const [contactConsent, setContactConsent] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');

  async function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/market/product-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, ...form, contactConsent })
      });
      const result = await response.json() as { interest?: { reference: string }; error?: string };
      if (!response.ok || !result.interest) throw new Error(result.error || 'Could not register your interest.');
      setReference(result.interest.reference);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not register your interest.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mm-order-request">
      <div className="mm-eyebrow">{product.availabilityStatus === 'planned' ? 'Coming soon' : 'Made to order'}</div>
      <h2>Register your interest</h2>
      <p>{product.availabilityStatus === 'planned'
        ? `This is a planned listing, not confirmed stock. ${product.estimatedAvailableOn ? `The merchant estimates ${new Date(`${product.estimatedAvailableOn}T00:00:00`).toLocaleDateString('en-KE')} for availability. ` : ''}Register interest and the boutique can follow up when plans are confirmed.`
        : 'This item is made to order. Send an enquiry and the boutique can confirm its production time and terms before any order or payment.'}</p>
      {reference ? (
        <div className="mm-state" role="status">
          <strong>Interest recorded · {reference}</strong>
          <span>The boutique can contact you to discuss availability. This is not an order and no payment has been taken.</span>
        </div>
      ) : (
        <form className="mm-form" onSubmit={submitInterest}>
          <label>Your name<input required minLength={2} maxLength={160} autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Email<input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Phone (optional)<input type="tel" maxLength={40} autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label className="mm-form-wide">Message (optional)<textarea rows={3} maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
          <label className="mm-form-wide mm-interest-consent"><input type="checkbox" checked={contactConsent} onChange={(event) => setContactConsent(event.target.checked)} required /> I agree that this boutique and Market Operations may use my contact details to respond to this enquiry.</label>
          {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
          <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Sending…' : 'Notify the boutique of my interest'}</button>
        </form>
      )}
      <p className="mm-offer-privacy">Your contact details go to this boutique and Market Operations for this enquiry only. This is not a preorder; no payment or reservation is created.</p>
    </section>
  );
}

export function MarketHomePage() {
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailability] = useState('');
  const filters = useMemo(() => {
    const parameters = new URLSearchParams();
    if (search) parameters.set('q', search);
    if (category) parameters.set('category', category);
    if (availability) parameters.set('availability', availability);
    return parameters.toString();
  }, [availability, category, search]);
  const { categories, products, loading, error, campaign, hasMore, total, loadMore } = useCatalog(filters);
  const hasFilters = Boolean(search || category || availability);

  return (
    <>
      <MarketHeader />
      <main className="mm-page">
        <section className="mm-hero">
          <div>
            <div className="mm-eyebrow">Independent style · Nairobi after dark</div>
            <h1>{campaign?.title || <>Find your<br />after-dark.</>}</h1>
            <p>{campaign?.message || 'Discover statement pieces, expressive accessories and independent boutiques — all in one place.'}</p>
            <a className="mm-button" href="#new-arrivals">Explore the edit <ArrowRight size={15} /></a>
          </div>
          <div className="mm-hero-art" aria-hidden="true">✳</div>
        </section>

        <section id="categories">
          <div className="mm-section-heading">
            <div>
              <div className="mm-eyebrow">Shop your mood</div>
              <h2>Explore the market</h2>
            </div>
          </div>
          {categories.length > 0 && (
            <div className="mm-category-list">
              {categories.map((category) => (
                <Link className="mm-category-pill" href={`/shop/category/${category.slug}`} key={category.slug}>
                  {category.name}
                </Link>
              ))}
            </div>
          )}
        </section>

        <section id="new-arrivals">
          <div className="mm-section-heading">
            <div>
              <div className="mm-eyebrow">{hasFilters ? 'Your market search' : 'Fresh from approved boutiques'}</div>
              <h2>{hasFilters ? 'Find your piece' : 'Recently discovered'}</h2>
            </div>
          </div>
          <form className="mm-catalog-controls" onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchText.trim());
          }}>
            <label className="mm-search-field">
              <span className="mm-visually-hidden">Search products and descriptions</span>
              <Search aria-hidden="true" size={18} />
              <input
                type="search"
                value={searchText}
                maxLength={100}
                placeholder="Search outfits, masks, jewellery…"
                onChange={(event) => setSearchText(event.target.value)}
              />
              <button type="submit">Search</button>
            </label>
            <label>
              <span>Category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">All categories</option>
                {categories.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>Availability</span>
              <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
                <option value="">All listings</option>
                <option value="available_now">Available now</option>
                <option value="planned">Coming soon</option>
                <option value="made_to_order">Made to order</option>
              </select>
            </label>
            {hasFilters && <button
              className="mm-clear-filters"
              type="button"
              onClick={() => {
                setSearchText('');
                setSearch('');
                setCategory('');
                setAvailability('');
              }}
            >
              Clear filters
            </button>}
          </form>
          {!error && <p className="mm-results-count" aria-live="polite">
            {loading && products.length === 0 ? 'Loading approved pieces…' : `${total.toLocaleString('en-KE')} approved ${total === 1 ? 'piece' : 'pieces'} found`}
          </p>}
          {error
            ? <div className="mm-state mm-error" role="alert">{error}</div>
            : loading
              && products.length === 0
              ? <div className="mm-state" role="status">Opening the market…</div>
              : <>
                <ProductGrid
                  products={products}
                  emptyMessage={hasFilters ? 'No approved pieces match those filters. Try a different search or clear your filters.' : undefined}
                />
                {loading && products.length > 0 && <div className="mm-state" role="status">Loading more approved pieces…</div>}
                {hasMore && <button className="mm-button mm-load-more" type="button" disabled={loading} onClick={loadMore}>
                  {loading ? 'Loading…' : 'Load more pieces'} <ArrowRight size={15} />
                </button>}
              </>}
        </section>

        <MarketFooter />
      </main>
    </>
  );
}

export function MarketCategoryPage({ slug }: { slug: string }) {
  const { categories, products, loading, error, hasMore, total, loadMore } = useCatalog(`category=${encodeURIComponent(slug)}`);
  const category = categories.find((item) => item.slug === slug);

  return (
    <>
      <MarketHeader />
      <main className="mm-page">
        <div className="mm-section-heading">
          <div>
            <Link className="mm-text-link" href="/shop"><ArrowLeft size={14} /> Back to discover</Link>
            <div className="mm-eyebrow" style={{ marginTop: 24 }}>Midnight Market category</div>
            <h2>{category?.name || slug.replace(/-/g, ' ')}</h2>
            {category?.description && <p className="mm-product-meta">{category.description}</p>}
          </div>
        </div>
        {error
          ? <div className="mm-state mm-error" role="alert">{error}</div>
          : loading && products.length === 0
            ? <div className="mm-state" role="status">Finding pieces…</div>
            : <>
              <p className="mm-results-count" aria-live="polite">{total.toLocaleString('en-KE')} approved {total === 1 ? 'piece' : 'pieces'}</p>
              <ProductGrid products={products} />
              {loading && <div className="mm-state" role="status">Loading more approved pieces…</div>}
              {hasMore && <button className="mm-button mm-load-more" type="button" disabled={loading} onClick={loadMore}>
                {loading ? 'Loading…' : 'Load more pieces'} <ArrowRight size={15} />
              </button>}
            </>}
        <MarketFooter />
      </main>
    </>
  );
}

export function MarketProductPage({ slug }: { slug: string }) {
  const { products, loading, error } = useCatalog(`slug=${encodeURIComponent(slug)}`);
  const product = products[0];
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  useEffect(() => setSelectedImage(0), [product?.id]);
  const selected = useMemo(
    () => product?.variants.find((variant) => variant.id === selectedVariant) || product?.variants[0],
    [product, selectedVariant]
  );

  return (
    <>
      <MarketHeader />
      <main className="mm-page">
        {error
          ? <div className="mm-state mm-error" role="alert">{error}</div>
          : loading
            ? <div className="mm-state" role="status">Opening this piece…</div>
            : !product
              ? <div className="mm-state">This piece is not available.</div>
              : (
                <section className="mm-product-detail">
                  <Link className="mm-text-link" href="/shop"><ArrowLeft size={14} /> Back to the market</Link>
                  <div className="mm-detail-grid">
                    <div>
                    <div className="mm-product-image mm-detail-image">
                      {product.images[selectedImage]
                        ? product.images[selectedImage].mediaType === 'video'
                          ? <video src={product.images[selectedImage].url} controls aria-label={product.images[selectedImage].alt} />
                          : <Image src={product.images[selectedImage].url} alt={product.images[selectedImage].alt} fill unoptimized sizes="(max-width: 800px) 100vw, 50vw" />
                        : <MoonStar aria-hidden="true" size={56} strokeWidth={1} />}
                    </div>
                    {product.images.length > 1 && <div className="mm-media-thumbnails">{product.images.map((media, index) => (
                      <button key={media.url} type="button" aria-label={`Show product media ${index + 1}`} aria-pressed={selectedImage === index} onClick={() => setSelectedImage(index)}>
                        {media.mediaType === 'video' ? <span>Video</span> : <Image src={media.url} alt="" width={74} height={68} unoptimized />}
                      </button>
                    ))}</div>}
                    </div>
                    <div>
                      <div className="mm-eyebrow">{product.category?.name || 'Independent design'}</div>
                      <h1>{product.name}</h1>
                      <Link href={`/shop/store/${product.merchant.slug}`} className="mm-text-link">
                        <Store size={15} /> {product.merchant.name}
                      </Link>
                      <p className="mm-detail-description">{product.description || 'A distinctive find from a Midnight Market boutique.'}</p>
                      {Object.entries(product.attributes || {}).filter(([, value]) => value).length > 0 && (
                        <dl className="mm-product-attributes">
                          {Object.entries(product.attributes).filter(([, value]) => value).map(([key, value]) => (
                            <div key={key}><dt>{key.replace(/_/g, ' ')}</dt><dd>{value}</dd></div>
                          ))}
                        </dl>
                      )}
                      {product.deliveryInformation && <p className="mm-product-meta"><strong>Delivery:</strong> {product.deliveryInformation}</p>}
                      {product.returnPolicy && <p className="mm-product-meta"><strong>Returns:</strong> {product.returnPolicy}</p>}
                      {product.variants.length > 1 && (
                        <label className="mm-variant-label">
                          Choose a size or colour
                          <select value={selected?.id || ''} onChange={(event) => setSelectedVariant(event.target.value)}>
                            {product.variants.map((variant) => (
                              <option key={variant.id} value={variant.id}>
                                {[variant.size, variant.color].filter(Boolean).join(' / ') || 'Standard'}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {selected && (
                        <div className="mm-product-price mm-detail-price">
                          {selected.salePriceMinor !== null && <del className="mm-original-price">{new Intl.NumberFormat('en-KE', { style: 'currency', currency: selected.currency }).format(selected.priceMinor / 100)}</del>}
                          {new Intl.NumberFormat('en-KE', { style: 'currency', currency: selected.currency }).format((selected.salePriceMinor ?? selected.priceMinor) / 100)}
                        </div>
                      )}
                      <div className="mm-product-meta">{product.availabilityStatus === 'planned'
                        ? 'Planned listing · not currently in stock'
                        : product.availabilityStatus === 'made_to_order'
                          ? 'Made to order · confirm terms with the boutique'
                          : selected?.inStock ? 'Available from this boutique' : 'Currently sold out'}</div>
                      {product.availabilityStatus !== 'available_now' && <ProductInterestPanel product={product} />}
                      {product.availabilityStatus === 'available_now' && selected?.inStock && (
                        <>
                          <ProductOrderRequestPanel product={product} variant={selected} />
                          <ProductOfferPanel product={product} variant={selected} />
                        </>
                      )}
                    </div>
                  </div>
                </section>
              )}
        <MarketFooter />
      </main>
    </>
  );
}

export function MarketStorePage({ slug }: { slug: string }) {
  const { products, loading, error, hasMore, total, loadMore } = useCatalog(`store=${encodeURIComponent(slug)}`);
  const merchant = products[0]?.merchant;

  return (
    <>
      <MarketHeader />
      <main className="mm-page">
        <div className="mm-section-heading">
          <div>
            <Link className="mm-text-link" href="/shop"><ArrowLeft size={14} /> Back to discover</Link>
            <div className="mm-eyebrow" style={{ marginTop: 24 }}>Independent boutique</div>
            <h2>{merchant?.name || slug.replace(/-/g, ' ')}</h2>
          </div>
        </div>
        {error
          ? <div className="mm-state mm-error" role="alert">{error}</div>
          : loading && products.length === 0
            ? <div className="mm-state" role="status">Opening boutique…</div>
            : <>
              <p className="mm-results-count" aria-live="polite">{total.toLocaleString('en-KE')} approved {total === 1 ? 'piece' : 'pieces'}</p>
              <ProductGrid products={products} />
              {loading && <div className="mm-state" role="status">Loading more approved pieces…</div>}
              {hasMore && <button className="mm-button mm-load-more" type="button" disabled={loading} onClick={loadMore}>
                {loading ? 'Loading…' : 'Load more pieces'} <ArrowRight size={15} />
              </button>}
            </>}
        <MarketFooter />
      </main>
    </>
  );
}
