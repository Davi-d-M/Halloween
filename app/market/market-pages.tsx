'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Download, Heart, Handshake, MoonStar, Search, ShoppingBag, Store, Trash2 } from 'lucide-react';
import MarketLogo from './market-logo';
import { useMarketShopping } from './market-shopping';

type Category = { name: string; slug: string; description: string | null };
export type Product = {
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
    availableQuantity: number;
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

type FitStudioOffering = {
  id: string;
  service_key: string;
  title: string;
  description: string;
  image_url: string | null;
  price_kes: number | null;
};

const fitStudioServiceLabels: Record<string, string> = {
  finding_outfit: 'Outfits',
  styling: 'Styling',
  makeup_sfx: 'Makeup & effects',
  wig_hair: 'Wigs & hair',
  props_accessories: 'Props & accessories',
  tailoring: 'Tailoring',
  costume_maker: 'Costumes',
  inspiration_tutorials: 'Inspiration'
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
  const { cart, wishlist, storageError } = useMarketShopping();
  return (
    <>
      <header className="mm-header">
        <Link className="mm-brand" href="/shop" aria-label="Midnight Market home">
          <MarketLogo className="mm-brand-mark" />
          <span className="mm-brand-name">MIDNIGHT <span>MARKET</span></span>
        </Link>
        <nav className="mm-nav" aria-label="Market navigation">
          <Link href="/shop">Discover</Link>
          <Link href="/shop#categories">Categories</Link>
          <Link href="/shop/wishlist"><Heart size={15} /> Saved <span className="mm-header-count">{wishlist.length}</span></Link>
          <Link href="/shop/bag"><ShoppingBag size={15} /> Bag <span className="mm-header-count">{cart.reduce((count, line) => count + line.quantity, 0)}</span></Link>
          <MarketInstallButton />
        </nav>
      </header>
      {storageError && <div className="mm-storage-notice" role="status">{storageError}</div>}
    </>
  );
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function MarketInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAppleMobile, setIsAppleMobile] = useState(false);

  useEffect(() => {
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches);
    setIsAppleMobile(/iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };

    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function installShop() {
    if (!installPrompt) {
      setShowHelp(true);
      return;
    }

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'dismissed') setShowHelp(true);
    } catch (error) {
      console.error('[PWA] The install prompt could not be opened:', error);
      setInstallPrompt(null);
      setShowHelp(true);
    }
  }

  return (
    <>
      {!isInstalled && (
        <button className="mm-install-app" type="button" onClick={() => void installShop()}>
          <Download size={14} /> Install app
        </button>
      )}
      {showHelp && (
        <div className="mm-install-overlay" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setShowHelp(false);
        }}>
          <section className="mm-install-dialog" role="dialog" aria-modal="true" aria-labelledby="mm-install-heading">
            <button className="mm-install-close" type="button" onClick={() => setShowHelp(false)} aria-label="Close install instructions">×</button>
            <div className="mm-eyebrow">Take the shop with you</div>
            <h2 id="mm-install-heading">Add Midnight Market to your home screen</h2>
            <p>
              {isAppleMobile
                ? 'In Safari, tap Share, then choose “Add to Home Screen”.'
                : 'Open your browser menu and choose “Install app” or “Add to Home screen”.'}
            </p>
            <p className="mm-install-note">The shop needs an internet connection to show the latest products and availability.</p>
            <button className="mm-button" type="button" onClick={() => setShowHelp(false)}>Got it</button>
          </section>
        </div>
      )}
    </>
  );
}

function ProductGrid({ products, emptyMessage }: { products: Product[]; emptyMessage?: string }) {
  const { isWishlisted, toggleWishlist } = useMarketShopping();
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
        const priceMinor = product.variants.length
          ? Math.min(...product.variants.map((variant) => variant.salePriceMinor ?? variant.priceMinor))
          : null;
        return (
          <article className="mm-product-card" key={product.id}>
            <Link className="mm-product-card-link" href={`/shop/product/${product.slug}`}>
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
              {priceMinor === null ? 'Price on request' : new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(priceMinor / 100)}
            </div>
            </Link>
            <button
              className={`mm-wishlist-toggle${isWishlisted(product.id) ? ' is-saved' : ''}`}
              type="button"
              aria-label={isWishlisted(product.id) ? `Remove ${product.name} from saved items` : `Save ${product.name}`}
              aria-pressed={isWishlisted(product.id)}
              onClick={() => toggleWishlist(product)}
            >
              <Heart size={18} fill={isWishlisted(product.id) ? 'currentColor' : 'none'} />
            </button>
          </article>
        );
      })}
    </div>
  );
}

function FitStudioEditSection() {
  const [offerings, setOfferings] = useState<FitStudioOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/market/fit-studio-offerings', {
      cache: 'no-store',
      signal: controller.signal
    })
      .then(async (response) => {
        const result = await response.json() as { offerings?: FitStudioOffering[]; error?: string };
        if (!response.ok) throw new Error(result.error || 'Halloween picks could not be loaded.');
        if (!Array.isArray(result.offerings)) throw new Error('Halloween picks returned an invalid response.');
        setOfferings(result.offerings);
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Halloween picks could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  return (
    <section className="mm-fit-edit" aria-labelledby="fit-edit-heading">
      <div className="mm-section-heading">
        <div>
          <div className="mm-eyebrow">Curated by Midnight Society</div>
          <h2 id="fit-edit-heading">Halloween finds &amp; finishing touches</h2>
          <p className="mm-fit-edit-intro">Admin-published outfits, wigs and accessories from the Fit Studio edit.</p>
        </div>
      </div>
      {error
        ? <div className="mm-state mm-error" role="alert">{error}</div>
        : loading
          ? <div className="mm-state" role="status">Loading Halloween finds…</div>
        : offerings.length === 0
          ? <div className="mm-state">No Halloween finds have been published yet. Admin listings appear here after they are marked available and published.</div>
          : <div className="mm-fit-edit-grid">
            {offerings.map((offering) => (
              <article className="mm-fit-edit-card" key={offering.id}>
                <div className="mm-fit-edit-image">
                  {offering.image_url
                    ? <Image src={offering.image_url} alt={offering.title} fill unoptimized sizes="(max-width: 800px) 50vw, 25vw" />
                    : <MoonStar aria-hidden="true" size={38} strokeWidth={1} />}
                  <span className="mm-fit-edit-category">{fitStudioServiceLabels[offering.service_key] || 'Halloween style'}</span>
                </div>
                <h3>{offering.title}</h3>
                {offering.description && <p>{offering.description}</p>}
                <div className="mm-fit-edit-price">
                  {offering.price_kes === null
                    ? 'Ask for a quote'
                    : new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(offering.price_kes)}
                </div>
              </article>
            ))}
          </div>}
      <p className="mm-fit-edit-note">
        These are request listings, not confirmed stock or online checkout. Waitlist members can ask about a find through Fit Studio.
      </p>
      <a className="mm-button mm-button-secondary" href="https://theewaitlist.vercel.app/fit-studio">
        Explore member requests <ArrowRight size={15} />
      </a>
    </section>
  );
}

function formatMarketPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(amountMinor / 100);
}

export function MarketWishlistPage() {
  const { wishlist, ready } = useMarketShopping();
  return (
    <>
      <MarketHeader />
      <main className="mm-page">
        <div className="mm-section-heading">
          <div>
            <Link className="mm-text-link" href="/shop"><ArrowLeft size={14} /> Back to discover</Link>
            <div className="mm-eyebrow" style={{ marginTop: 24 }}>Your picks</div>
            <h2>Saved pieces</h2>
          </div>
        </div>
        {!ready
          ? <div className="mm-state" role="status">Loading saved pieces…</div>
          : <ProductGrid products={wishlist} emptyMessage="Your saved pieces will appear here. Tap the heart on a product to keep it close." />}
        <p className="mm-personal-storage-note">Saved items are stored in this browser on this device. They are not yet connected to a customer account.</p>
        <MarketFooter />
      </main>
    </>
  );
}

export function MarketBagPage() {
  const { cart, ready, removeFromCart, updateCartQuantity } = useMarketShopping();
  const estimatedTotals = cart.reduce((totals, line) => {
    const variant = line.product.variants.find((item) => item.id === line.variantId);
    if (!variant) return totals;
    totals[variant.currency] = (totals[variant.currency] || 0) + (variant.salePriceMinor ?? variant.priceMinor) * line.quantity;
    return totals;
  }, {} as Record<string, number>);

  return (
    <>
      <MarketHeader />
      <main className="mm-page">
        <div className="mm-section-heading">
          <div>
            <Link className="mm-text-link" href="/shop"><ArrowLeft size={14} /> Back to discover</Link>
            <div className="mm-eyebrow" style={{ marginTop: 24 }}>Your selection</div>
            <h2>Your bag</h2>
          </div>
        </div>
        {!ready
          ? <div className="mm-state" role="status">Loading your bag…</div>
          : cart.length === 0
            ? <div className="mm-state">Your bag is empty. Explore approved pieces and add available items to your bag.</div>
            : <>
              <div className="mm-bag-list">
                {cart.map((line) => {
                  const variant = line.product.variants.find((item) => item.id === line.variantId);
                  if (!variant) return null;
                  const unitPriceMinor = variant.salePriceMinor ?? variant.priceMinor;
                  const option = [variant.size, variant.color].filter(Boolean).join(' / ') || 'Standard';
                  return (
                    <article className="mm-bag-line" key={`${line.product.id}:${line.variantId}`}>
                      <Link className="mm-bag-image" href={`/shop/product/${line.product.slug}`}>
                        {line.product.images[0]?.mediaType === 'image'
                          ? <Image src={line.product.images[0].url} alt={line.product.images[0].alt} fill unoptimized sizes="100px" />
                          : <MoonStar aria-hidden="true" size={30} />}
                      </Link>
                      <div className="mm-bag-info">
                        <Link href={`/shop/product/${line.product.slug}`}><strong>{line.product.name}</strong></Link>
                        <span>{line.product.merchant.name} · {option}</span>
                        <span>{formatMarketPrice(unitPriceMinor, variant.currency)} each</span>
                        {!variant.inStock && <span className="mm-bag-stock-warning">This saved option may have sold out. Refresh the product before sending a request.</span>}
                        <label className="mm-bag-quantity">
                          Qty
                          <input type="number" min="1" max={Math.max(1, Math.min(10, variant.availableQuantity))} value={line.quantity}
                            onChange={(event) => updateCartQuantity(line.product.id, line.variantId, Number(event.target.value))} />
                        </label>
                      </div>
                      <div className="mm-bag-line-actions">
                        <strong>{formatMarketPrice(unitPriceMinor * line.quantity, variant.currency)}</strong>
                        <Link className="mm-text-link" href={`/shop/product/${line.product.slug}?variant=${encodeURIComponent(line.variantId)}&quantity=${line.quantity}#order-request`}>
                          Request item
                        </Link>
                        <button className="mm-remove-item" type="button" onClick={() => removeFromCart(line.product.id, line.variantId)}>
                          <Trash2 size={15} /> Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <aside className="mm-bag-summary">
                {Object.entries(estimatedTotals).map(([currency, amount]) => (
                  <div key={currency}><span>Items subtotal estimate ({currency})</span><strong>{formatMarketPrice(amount, currency)}</strong></div>
                ))}
                <p>This bag is a saved shopping list, not a checkout. Send a request for each item; each boutique confirms stock and arranges payment and delivery. Price and stock are rechecked by the server when you send a request.</p>
                <Link className="mm-button" href="/shop">Continue discovering <ArrowRight size={15} /></Link>
              </aside>
            </>}
        <MarketFooter />
      </main>
    </>
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

function ProductOrderRequestPanel({ product, variant, initialQuantity = 1 }: { product: Product; variant: Product['variants'][number]; initialQuantity?: number }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: String(initialQuantity), note: '' });
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
    <section className="mm-order-request" id="order-request">
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

function ProductReportPanel({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('misleading');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError('');
    try {
      const response = await fetch('/api/market/product-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, reason, details, email })
      });
      const result = await response.json() as { report?: { reference: string }; error?: string };
      if (!response.ok || !result.report) throw new Error(result.error || 'Could not submit your report.');
      setReference(result.report.reference);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your report.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="mm-report">
      <button className="mm-text-link" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Report a listing
      </button>
      {open && (reference
        ? <p className="mm-state" role="status">Report received · {reference}. Market Operations will review it.</p>
        : <form className="mm-form" onSubmit={submitReport}>
          <label>Reason
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="misleading">Misleading listing</option>
              <option value="counterfeit">Suspected counterfeit</option>
              <option value="unsafe">Unsafe item</option>
              <option value="other">Something else</option>
            </select>
          </label>
          <label>Email for follow-up<input required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="mm-form-wide">What should we review?<textarea required minLength={10} maxLength={1000} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
          {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
          <button className="mm-button mm-form-wide" type="submit" disabled={working}>{working ? 'Submitting…' : 'Send report'}</button>
        </form>)}
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

        <FitStudioEditSection />

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

export function MarketProductPage({ slug, initialVariantId, initialQuantity = 1 }: { slug: string; initialVariantId?: string; initialQuantity?: number }) {
  const { products, loading, error } = useCatalog(`slug=${encodeURIComponent(slug)}`);
  const product = products[0];
  const [selectedVariant, setSelectedVariant] = useState(initialVariantId || '');
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [cartNotice, setCartNotice] = useState('');
  const { addToCart, isWishlisted, toggleWishlist } = useMarketShopping();
  useEffect(() => {
    setSelectedImage(0);
    const requestedVariant = product?.variants.find((variant) => variant.id === initialVariantId);
    const firstInStock = product?.variants.find((variant) => variant.inStock);
    setSelectedVariant(requestedVariant?.id || firstInStock?.id || product?.variants[0]?.id || '');
    setQuantity(initialQuantity);
  }, [initialQuantity, initialVariantId, product]);
  useEffect(() => {
    if (product && window.location.hash === '#order-request') {
      document.getElementById('order-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [product]);
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
                          <select value={selected?.id || ''} onChange={(event) => {
                            setSelectedVariant(event.target.value);
                            setQuantity(1);
                          }}>
                            {product.variants.map((variant) => (
                              <option
                                key={variant.id}
                                value={variant.id}
                                disabled={product.availabilityStatus === 'available_now' && !variant.inStock}
                              >
                                {[variant.size, variant.color].filter(Boolean).join(' / ') || 'Standard'}
                                {product.availabilityStatus === 'available_now'
                                  ? variant.inStock ? ` · ${variant.availableQuantity} available` : ' · sold out'
                                  : ''}
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
                      {product.availabilityStatus === 'available_now' && selected?.inStock && (
                        <label className="mm-variant-label">
                          Quantity
                          <input type="number" min="1" max="10" step="1" value={quantity} onChange={(event) => {
                            const next = Number(event.target.value);
                            if (Number.isInteger(next) && next >= 1 && next <= 10) setQuantity(next);
                          }} />
                        </label>
                      )}
                      <div className="mm-product-meta">{product.availabilityStatus === 'planned'
                        ? 'Planned listing · not currently in stock'
                        : product.availabilityStatus === 'made_to_order'
                          ? 'Made to order · confirm terms with the boutique'
                          : selected?.inStock ? `${selected.availableQuantity} available from this boutique` : 'Currently sold out'}</div>
                      {product.availabilityStatus !== 'available_now' && <ProductInterestPanel product={product} />}
                      {product.availabilityStatus === 'available_now' && selected?.inStock && (
                        <>
                          <div className="mm-product-actions">
                            <button className="mm-button" type="button" onClick={() => {
                              const errorMessage = addToCart(product, selected.id, quantity);
                              setCartNotice(errorMessage || `${product.name} added to your bag.`);
                            }}>
                              <ShoppingBag size={16} /> Add to bag
                            </button>
                            <button
                              className={`mm-button mm-button-secondary${isWishlisted(product.id) ? ' is-saved' : ''}`}
                              type="button"
                              aria-pressed={isWishlisted(product.id)}
                              onClick={() => {
                                toggleWishlist(product);
                                setCartNotice(isWishlisted(product.id) ? 'Removed from saved items.' : 'Saved to your wishlist.');
                              }}
                            >
                              <Heart size={16} fill={isWishlisted(product.id) ? 'currentColor' : 'none'} />
                              {isWishlisted(product.id) ? 'Saved' : 'Save'}
                            </button>
                          </div>
                          {cartNotice && <p className="mm-cart-notice" role="status">{cartNotice}</p>}
                          <ProductOrderRequestPanel product={product} variant={selected} initialQuantity={quantity} />
                          <ProductOfferPanel product={product} variant={selected} />
                        </>
                      )}
                      <ProductReportPanel product={product} />
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
