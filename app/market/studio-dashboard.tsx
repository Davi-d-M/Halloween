'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck, Box, ClipboardList, ImagePlus, LogOut, MessageSquareText, PackagePlus, Store } from 'lucide-react';
import { marketSupabase } from '@/lib/marketSupabaseClient';

type Category = { name: string; slug: string };
type MerchantProduct = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: { name: string; slug: string } | null;
  attributes: Record<string, string>;
  delivery_information: string | null;
  return_policy: string | null;
  review_note: string | null;
  status: string;
  variants: Array<{
    id: string;
    sku: string | null;
    price_minor: number;
    sale_price_minor: number | null;
    currency: string;
    size: string | null;
    color: string | null;
    inventory: { quantity_available: number; quantity_reserved: number } | null;
  }>;
  images: Array<{ url: string; alt: string; storage_path: string; media_type: 'image' | 'video' }>;
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
type MerchantOrder = {
  id: string;
  reference: string;
  product_name: string;
  variant_label: string;
  quantity: number;
  unit_price_minor: number;
  total_minor: number;
  currency: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  buyer_note: string | null;
  status: 'requested' | 'confirmed' | 'preparing' | 'ready' | 'fulfilled' | 'cancelled';
  payment_status: 'unpaid' | 'paid';
  created_at: string;
};

type ProductForm = {
  name: string;
  description: string;
  category: string;
  price: string;
  salePrice: string;
  stock: string;
  sku: string;
  size: string;
  color: string;
  deliveryInformation: string;
  returnPolicy: string;
  attributes: Record<string, string>;
};

const blankForm: ProductForm = {
  name: '', description: '', category: '', price: '', salePrice: '', stock: '', sku: '',
  size: '', color: '', deliveryInformation: '', returnPolicy: '', attributes: {}
};

const categoryFields: Record<string, Array<{ key: string; label: string; placeholder: string }>> = {
  jewellery: [
    { key: 'material', label: 'Metal / material', placeholder: '925 sterling silver' },
    { key: 'gemstone', label: 'Gemstone details', placeholder: 'Stone and cut, if applicable' },
    { key: 'plating', label: 'Plating', placeholder: 'Gold plated, rhodium, none…' },
    { key: 'adjustable', label: 'Adjustable sizing', placeholder: 'Adjustable / fixed sizing' },
    { key: 'weight', label: 'Weight (optional)', placeholder: 'Weight in grams' },
    { key: 'authenticity', label: 'Authenticity details', placeholder: 'Describe materials accurately; avoid unsupported claims' }
  ],
  clothing: [
    { key: 'fabric', label: 'Fabric', placeholder: 'Cotton, velvet, polyester…' },
    { key: 'fit', label: 'Fit and size chart', placeholder: 'Fit notes or size chart' },
    { key: 'occasion', label: 'Occasion', placeholder: 'Costume, evening, everyday…' },
    { key: 'care', label: 'Care instructions', placeholder: 'Washing and care instructions' }
  ],
  'costumes-masks': [
    { key: 'material', label: 'Material', placeholder: 'Main materials' },
    { key: 'fit', label: 'Fit / measurements', placeholder: 'Sizing and fit notes' },
    { key: 'included_components', label: 'What is included', placeholder: 'List all included pieces' },
    { key: 'safety', label: 'Safety notes', placeholder: 'Relevant safety warnings' },
    { key: 'care', label: 'Care instructions', placeholder: 'Cleaning and storage' }
  ],
  'wigs-beauty': [
    { key: 'hair_length', label: 'Hair length', placeholder: 'Length in inches or centimetres' },
    { key: 'texture', label: 'Texture', placeholder: 'Straight, body wave, curly…' },
    { key: 'shade', label: 'Colour / shade', placeholder: 'Product colour or shade' },
    { key: 'cap_size', label: 'Cap size', placeholder: 'Cap measurements or fit' },
    { key: 'condition', label: 'Condition', placeholder: 'New, pre-owned…' },
    { key: 'ingredients', label: 'Ingredients / safety', placeholder: 'Ingredients or safety details where applicable' },
    { key: 'expiry', label: 'Expiry (where applicable)', placeholder: 'Expiry date' }
  ],
  'shoes-bags': [
    { key: 'material', label: 'Material', placeholder: 'Upper / outer material' },
    { key: 'dimensions', label: 'Dimensions', placeholder: 'Measurements in cm' },
    { key: 'weight', label: 'Weight (optional)', placeholder: 'Weight' },
    { key: 'included_components', label: 'Included components', placeholder: 'Accessories or parts in the package' },
    { key: 'safety', label: 'Safety notes', placeholder: 'Relevant product warnings' }
  ],
  accessories: [
    { key: 'material', label: 'Material', placeholder: 'Main materials' },
    { key: 'dimensions', label: 'Dimensions', placeholder: 'Measurements in cm' },
    { key: 'included_components', label: 'Included components', placeholder: 'What is in the package' },
    { key: 'safety', label: 'Safety notes', placeholder: 'Relevant product warnings' }
  ]
};

export default function MerchantDashboardPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<MerchantProduct[]>([]);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [offers, setOffers] = useState<MerchantOffer[]>([]);
  const [counterAmounts, setCounterAmounts] = useState<Record<string, string>>({});
  const [application, setApplication] = useState<Application | null>(null);
  const [form, setForm] = useState(blankForm);
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [keptImages, setKeptImages] = useState<MerchantProduct['images']>([]);
  const [editingProduct, setEditingProduct] = useState<MerchantProduct | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [ordersError, setOrdersError] = useState('');
  const [message, setMessage] = useState('');
  const [workingOfferId, setWorkingOfferId] = useState<string | null>(null);
  const [workingOrderId, setWorkingOrderId] = useState<string | null>(null);
  const listingCounts = useMemo(() => ({
    total: products.length,
    live: products.filter((product) => product.status === 'published').length,
    review: products.filter((product) => product.status === 'pending_review').length,
    changes: products.filter((product) => product.status === 'rejected').length
  }), [products]);

  const loadOffers = useCallback(async (token: string) => {
    const response = await fetch('/api/market/merchant-offers', {
      headers: { Authorization: ['Bearer', token].join(' ') },
      cache: 'no-store'
    });
    const result = await response.json() as { offers?: MerchantOffer[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not load customer offers.');
    setOffers(result.offers || []);
  }, []);

  const loadOrders = useCallback(async (token: string) => {
    const response = await fetch('/api/market/merchant-orders', {
      headers: { Authorization: ['Bearer', token].join(' ') },
      cache: 'no-store'
    });
    const result = await response.json() as { orders?: MerchantOrder[]; error?: string };
    if (!response.ok) {
      const message = result.error || 'Could not load your order requests.';
      setOrdersError(message);
      throw new Error(message);
    }
    setOrdersError('');
    setOrders(result.orders || []);
  }, []);

  const loadProducts = useCallback(async (token: string) => {
    const response = await fetch('/api/market/merchant-products', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    const result = await response.json() as { products?: MerchantProduct[]; error?: string };
    if (!response.ok) throw new Error(result.error || 'Could not load your product listings.');
    setProducts(result.products || []);
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      let categoryError = '';
      try {
        const categoryResponse = await fetch('/api/market/catalog', { cache: 'no-store' });
        const categoryResult = await categoryResponse.json() as { categories?: Category[]; error?: string };
        if (!categoryResponse.ok) throw new Error(categoryResult.error || 'Could not load market categories.');
        if (active) setCategories(categoryResult.categories || []);
      } catch (cause) {
        categoryError = cause instanceof Error ? cause.message : 'Could not load market categories.';
      }

      try {
        if (!marketSupabase) throw new Error('Merchant Studio is not configured on this site.');
        const { data: { session }, error: sessionError } = await marketSupabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;
        if (!session?.access_token) {
          setError('Sign in to access your seller account.');
          return;
        }
        setAccessToken(session.access_token);
        try {
          await loadProducts(session.access_token);
          await loadOffers(session.access_token);
          try {
            await loadOrders(session.access_token);
          } catch {
            if (active) setOrders([]);
          }
          if (active && categoryError) setError(categoryError);
        } catch (cause) {
          const applicationResponse = await fetch('/api/market/merchant-application', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: 'no-store'
          });
          const applicationResult = await applicationResponse.json() as { application?: Application | null; error?: string };
          if (!applicationResponse.ok) throw new Error(applicationResult.error || 'Could not check your seller application.');
          if (applicationResult.application && active) {
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
  }, [loadOffers, loadOrders, loadProducts]);

  useEffect(() => {
    if (!accessToken) return;
    const interval = window.setInterval(() => {
      void loadOrders(accessToken).catch((cause: unknown) => {
        setOrdersError(cause instanceof Error ? cause.message : 'Could not refresh order requests.');
      });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [accessToken, loadOrders]);

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    setImages(Array.from(event.target.files || []));
  }

  async function signOut() {
    if (!marketSupabase) {
      setError('Seller sign-out is not configured. Refresh the page and try again.');
      return;
    }
    const { error: signOutError } = await marketSupabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    window.location.assign('/market');
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return;
    if (!editingProduct && images.length === 0) {
      setError('Add at least one product photo before submitting the listing.');
      return;
    }
    if (images.length + keptImages.length < 1) {
      setError('Keep or add at least one product photo.');
      return;
    }
    if (images.length + keptImages.filter((image) => image.media_type === 'image').length > 6) {
      setError('A listing can have up to six photos. Select fewer new photos.');
      return;
    }
    if (video && keptImages.some((image) => image.media_type === 'video')) {
      setError('Remove the current video before uploading a replacement.');
      return;
    }
    setWorking(true);
    setError('');
    setMessage('');
    const storage = marketSupabase;
    const newFiles = [
      ...images.map((file) => ({ file, mediaType: 'image' as const })),
      ...(video ? [{ file: video, mediaType: 'video' as const }] : [])
    ];
    let uploadedPaths: string[] = [];
    try {
      if (!storage) throw new Error('Merchant Studio is not configured on this site.');
      let uploadedMedia: Array<{ path: string; mediaType: 'image' | 'video'; altText: string }> = [];
      if (newFiles.length > 0) {
        const uploadResponse = await fetch('/api/market/merchant-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            files: newFiles.map(({ file, mediaType }) => ({
              mediaType,
              contentType: file.type,
              size: file.size
            }))
          })
        });
        const uploadResult = await uploadResponse.json() as {
          uploads?: Array<{ path: string; token: string; mediaType: 'image' | 'video' }>;
          error?: string;
        };
        if (!uploadResponse.ok || !uploadResult.uploads || uploadResult.uploads.length !== newFiles.length) {
          throw new Error(uploadResult.error || 'Could not prepare product media uploads.');
        }
        uploadedPaths = uploadResult.uploads.map((upload) => upload.path);
        const mediaUploads = await Promise.allSettled(uploadResult.uploads.map(async (upload, index) => {
          const { file, mediaType } = newFiles[index];
          const { error: storageError } = await storage.storage
            .from('midnight-market')
            .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
          if (storageError) throw storageError;
          return { path: upload.path, mediaType, altText: form.name };
        }));
        const failedUpload = mediaUploads.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failedUpload) throw failedUpload.reason;
        uploadedMedia = mediaUploads.map((result) => {
          if (result.status !== 'fulfilled') throw new Error('Could not upload all product media.');
          return result.value;
        });
      }
      const response = await fetch('/api/market/merchant-products', {
        method: editingProduct ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          category: form.category,
          price: Number(form.price),
          salePrice: form.salePrice ? Number(form.salePrice) : null,
          stock: Number(form.stock),
          sku: form.sku,
          size: form.size,
          color: form.color,
          deliveryInformation: form.deliveryInformation,
          returnPolicy: form.returnPolicy,
          attributes: form.attributes,
          productId: editingProduct?.id || null,
          variantId: editingProduct?.variants[0]?.id || null,
          keepImages: keptImages.map((image) => ({
            path: image.storage_path,
            mediaType: image.media_type,
            altText: image.alt
          })),
          uploadedMedia
        })
      });
      const result = await response.json() as { product?: { id: string }; error?: string };
      if (!response.ok || !result.product) throw new Error(result.error || 'Could not save this listing.');
      uploadedPaths = [];
      setMessage(editingProduct
        ? 'Changes saved and sent to Market Operations for a fresh review. This listing is hidden until approval.'
        : 'Listing sent for Market review. It will appear in the storefront after approval.');
      setForm(blankForm);
      setImages([]);
      setVideo(null);
      setKeptImages([]);
      setEditingProduct(null);
      await loadProducts(accessToken);
    } catch (cause) {
      let errorMessage = cause instanceof Error ? cause.message : 'Could not save this listing.';
      if (uploadedPaths.length > 0) {
        try {
          const cleanupResponse = await fetch('/api/market/merchant-media', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ paths: uploadedPaths })
          });
          const cleanupResult = await cleanupResponse.json() as { error?: string };
          if (!cleanupResponse.ok && cleanupResponse.status !== 409) {
            errorMessage += ` Temporary media cleanup failed: ${cleanupResult.error || 'try again later'}`;
          }
        } catch {
          errorMessage += ' Temporary media cleanup failed and must be retried.';
        }
      }
      setError(errorMessage);
    } finally {
      setWorking(false);
    }
  }

  function editProduct(product: MerchantProduct) {
    const variant = product.variants[0];
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      category: product.category?.slug || '',
      price: variant ? String(variant.price_minor / 100) : '',
      salePrice: variant?.sale_price_minor ? String(variant.sale_price_minor / 100) : '',
      stock: variant?.inventory ? String(variant.inventory.quantity_available) : '0',
      sku: variant?.sku || '',
      size: variant?.size || '',
      color: variant?.color || '',
      deliveryInformation: product.delivery_information || '',
      returnPolicy: product.return_policy || '',
      attributes: product.attributes || {}
    });
    setImages([]);
    setVideo(null);
    setKeptImages(product.images);
    setError('');
    setMessage('');
    document.getElementById('listing-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingProduct(null);
    setForm(blankForm);
    setImages([]);
    setVideo(null);
    setKeptImages([]);
    setError('');
    setMessage('');
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

  async function updateOrder(order: MerchantOrder, status: Exclude<MerchantOrder['status'], 'requested'> | 'paid') {
    if (!accessToken) return;
    setWorkingOrderId(order.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/market/merchant-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', accessToken].join(' ') },
        body: JSON.stringify({ orderId: order.id, status })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not update this order request.');
      setMessage(`Order ${order.reference} updated: ${status.replace(/_/g, ' ')}.`);
      await loadOrders(accessToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this order request.');
    } finally {
      setWorkingOrderId(null);
    }
  }

  return (
    <>
      <header className="mm-header">
        <Link className="mm-brand" href="/market">MIDNIGHT <span>MARKET</span> · STUDIO</Link>
        <nav className="mm-nav">
          {accessToken && (
            <>
              <a href="#orders">Orders</a>
              <a href="#listings">My listings</a>
              <a href="#offers">Customer offers</a>
              <button className="mm-text-link" type="button" onClick={() => void signOut()}><LogOut size={14} /> Sign out</button>
            </>
          )}
        </nav>
      </header>
      <main className="mm-page mm-merchant-register">
        <div className="mm-register-card mm-studio-card">
          <div className="mm-eyebrow">Merchant Studio</div>
          <h1>Merchant dashboard.</h1>
          <p className="mm-register-copy">Sign in to manage your products, customer enquiries and order fulfilment. Product listings are reviewed by Market Operations before they go live.</p>

          {loading && <div className="mm-state">Opening Merchant Studio…</div>}
          {!loading && error && !accessToken && !application && (
            <div className="mm-state">
              <Store size={22} />
              <strong>Private seller workspace</strong>
              <span>{error}</span>
              <div className="mm-studio-actions">
                <Link className="mm-button" href="/merchant/portal/login">Merchant sign in</Link>
                <Link className="mm-button mm-button-secondary" href="/merchant/portal/register">Create seller account</Link>
              </div>
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
            <div className="mm-studio-dashboard">
              <div className="mm-studio-stats">
                <article><ClipboardList size={20} /><span>New order requests</span><strong>{orders.filter((order) => order.status === 'requested').length}</strong></article>
                <article><PackagePlus size={20} /><span>Total listings</span><strong>{listingCounts.total}</strong></article>
                <article><BadgeCheck size={20} /><span>Live in Market</span><strong>{listingCounts.live}</strong></article>
                <article><Box size={20} /><span>Under review</span><strong>{listingCounts.review}</strong></article>
                <article><MessageSquareText size={20} /><span>Needs changes</span><strong>{listingCounts.changes}</strong></article>
              </div>
              <section id="orders" className="mm-merchant-listings mm-studio-order-state">
                <div className="mm-section-heading">
                  <div><div className="mm-eyebrow">Orders & fulfilment</div><h2>Customer order requests</h2></div>
                  <button className="mm-text-link" type="button" onClick={() => void loadOrders(accessToken).catch((cause: unknown) => {
                    setOrdersError(cause instanceof Error ? cause.message : 'Could not refresh order requests.');
                  })}>Refresh orders</button>
                </div>
                <p className="mm-phase-note">These are requests submitted from the customer catalog. They are not paid orders; confirm stock before arranging payment and delivery with the customer.</p>
                {orders.length === 0
                  ? <div className={ordersError ? 'mm-state mm-error' : 'mm-state'} role={ordersError ? 'alert' : undefined}>{ordersError || 'No customer order requests yet.'}</div>
                  : <div className="mm-merchant-orders">
                    {orders.map((order) => (
                      <article className="mm-merchant-order" key={order.id}>
                        <div className="mm-merchant-order-heading">
                          <div><strong>{order.reference}</strong><span>{new Date(order.created_at).toLocaleString()}</span></div>
                          <strong>{order.status.replace(/_/g, ' ')}</strong>
                        </div>
                        <h3>{order.product_name}</h3>
                        <p>{order.variant_label} · Qty {order.quantity} · KSh {(order.total_minor / 100).toLocaleString('en-KE')}</p>
                        <p className="mm-phase-note">Payment: {order.payment_status}{order.payment_status === 'unpaid' ? ' · contact customer to arrange payment' : ' · recorded by merchant'}</p>
                        <div className="mm-offer-contact">
                          {order.buyer_name} · <a href={`mailto:${encodeURIComponent(order.buyer_email)}`}>{order.buyer_email}</a>
                          {order.buyer_phone && <> · <a href={`tel:${encodeURIComponent(order.buyer_phone)}`}>{order.buyer_phone}</a></>}
                        </div>
                        {order.buyer_note && <p>Customer note: {order.buyer_note}</p>}
                        {order.status === 'requested' && (
                          <div className="mm-offer-actions">
                            <button className="mm-button" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'confirmed')}>Confirm request</button>
                            <button className="mm-text-link" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'cancelled')}>Decline</button>
                          </div>
                        )}
                        {['confirmed', 'preparing', 'ready'].includes(order.status) && order.payment_status === 'unpaid' && (
                          <button className="mm-button mm-button-secondary" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'paid')}>Record payment received</button>
                        )}
                        {order.status === 'confirmed' && (
                          <div className="mm-offer-actions">
                            <button className="mm-button" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'preparing')}>Start fulfilment</button>
                            <button className="mm-text-link" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'cancelled')}>Cancel request</button>
                          </div>
                        )}
                        {order.status === 'preparing' && (
                          <div className="mm-offer-actions">
                            <button className="mm-button" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'ready')}>Mark ready</button>
                            <button className="mm-text-link" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'cancelled')}>Cancel request</button>
                          </div>
                        )}
                        {order.status === 'ready' && order.payment_status === 'paid' && (
                          <div className="mm-offer-actions">
                            <button className="mm-button" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'fulfilled')}>Mark fulfilled</button>
                            <button className="mm-text-link" type="button" disabled={workingOrderId === order.id} onClick={() => void updateOrder(order, 'cancelled')}>Cancel request</button>
                          </div>
                        )}
                        {order.status === 'ready' && order.payment_status === 'unpaid' && <p className="mm-phase-note">Record payment received before marking this request fulfilled.</p>}
                      </article>
                    ))}
                  </div>}
              </section>
              <section id="listing-form" className="mm-studio-section mm-studio-form">
                <div className="mm-section-heading">
                  <div><div className="mm-eyebrow">{editingProduct ? 'Edit and resubmit' : 'Product catalogue'}</div><h2>{editingProduct ? `Update ${editingProduct.name}` : 'Add a product'}</h2></div>
                </div>
                {editingProduct?.review_note && <div className="mm-state mm-review-note"><strong>Market Operations feedback:</strong> {editingProduct.review_note}</div>}
                <form className="mm-form" onSubmit={submitProduct}>
              <label>Product name<input required minLength={2} maxLength={180} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Category<select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value, attributes: {} })}>
                <option value="">Choose a category</option>
                {categories.map((category) => <option key={category.slug} value={category.slug}>{category.name}</option>)}
              </select></label>
              <label>SKU (optional)<input maxLength={100} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></label>
              <label>Regular price (KSh)<input required type="number" min="1" max="100000000" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
              <label>Sale price (optional)<input type="number" min="1" max={Number(form.price) || undefined} step="0.01" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} /></label>
              <label>Available stock<input required type="number" min="0" max="1000000" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label>
              <label>Size / measurements<input maxLength={80} value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></label>
              <label>Colour<input maxLength={80} value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
              {categoryFields[form.category]?.map((field) => (
                <label key={field.key}>{field.label}<input maxLength={500} placeholder={field.placeholder} value={form.attributes[field.key] || ''} onChange={(event) => setForm({ ...form, attributes: { ...form.attributes, [field.key]: event.target.value } })} /></label>
              ))}
              <label className="mm-form-wide">Description<textarea required rows={4} maxLength={3000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <label className="mm-form-wide">Delivery information<textarea rows={2} maxLength={1000} placeholder="Delivery areas, timing and any fees" value={form.deliveryInformation} onChange={(event) => setForm({ ...form, deliveryInformation: event.target.value })} /></label>
              <label className="mm-form-wide">Returns / exchange policy<textarea rows={2} maxLength={1000} placeholder="State your shop's policy clearly" value={form.returnPolicy} onChange={(event) => setForm({ ...form, returnPolicy: event.target.value })} /></label>
              <label className="mm-form-wide mm-upload-field">
                <span><ImagePlus size={18} /> Product photos · up to six · JPG, PNG, WebP or AVIF, up to 4 MB each</span>
                <input required={!editingProduct} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onChange={handleImageChange} />
                {images.map((image) => <span key={`${image.name}-${image.lastModified}`}>{image.name}</span>)}
              </label>
              <label className="mm-form-wide mm-upload-field">
                <span>Product video (optional) · MP4 or WebM · up to 10 MB</span>
                <input type="file" accept="video/mp4,video/webm" onChange={(event) => setVideo(event.target.files?.[0] || null)} />
                {video && <span>{video.name}</span>}
              </label>
              {keptImages.length > 0 && (
                <div className="mm-retained-photos mm-form-wide" aria-label="Current product photos">
                  {keptImages.map((image) => (
                    <figure key={image.storage_path}>
                      {image.media_type === 'video'
                        ? <video src={image.url} controls aria-label={image.alt} />
                        : <Image src={image.url} alt={image.alt} width={120} height={100} unoptimized />}
                      <button type="button" className="mm-text-link" onClick={() => setKeptImages((current) => current.filter((photo) => photo.storage_path !== image.storage_path))}>Remove photo</button>
                    </figure>
                  ))}
                </div>
              )}
              <p className="mm-phase-note mm-form-wide">Category-specific details help buyers compare jewellery, clothing, wigs, beauty, footwear and accessories. Editing a live item hides it until Market Operations reviews the update.</p>
              {error && <div className="mm-state mm-error mm-form-wide" role="alert">{error}</div>}
              {message && <div className="mm-state mm-form-wide" role="status">{message}</div>}
              <div className="mm-studio-actions mm-form-wide">
                <button className="mm-button" type="submit" disabled={working}>{working ? 'Saving listing…' : editingProduct ? 'Save changes for review' : 'Submit listing for review'}</button>
                {editingProduct && <button className="mm-button mm-button-secondary" type="button" onClick={cancelEdit}>Cancel edit</button>}
              </div>
                </form>
              </section>
            </div>
          )}
        </div>

        {accessToken && !application && (
          <section id="offers" className="mm-merchant-listings">
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
          <section id="listings" className="mm-merchant-listings">
            <div className="mm-section-heading"><div><div className="mm-eyebrow">Your catalogue</div><h2>Product listings</h2></div></div>
            <div className="mm-product-grid">
              {products.map((product) => (
                <article className="mm-product-card" key={product.id}>
                  <div className="mm-product-image">{product.images[0] ? <Image src={product.images[0].url} alt={product.images[0].alt} fill unoptimized sizes="(max-width: 800px) 50vw, 25vw" /> : <ImagePlus size={40} />}</div>
                  <h3>{product.name}</h3>
                  <div className="mm-product-meta">Status: {product.status.replace(/_/g, ' ')}{product.category ? ` · ${product.category.name}` : ''}</div>
                  {product.variants[0] && <div className="mm-product-price">KSh {(product.variants[0].price_minor / 100).toLocaleString('en-KE')}</div>}
                  {product.review_note && <div className="mm-review-note"><strong>Changes requested:</strong> {product.review_note}</div>}
                  <button className="mm-button mm-button-secondary" type="button" onClick={() => editProduct(product)}>Edit listing</button>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
