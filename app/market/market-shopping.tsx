'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Product } from './market-pages';

export type MarketCartLine = {
  product: Product;
  variantId: string;
  quantity: number;
};

type MarketShoppingContextValue = {
  cart: MarketCartLine[];
  wishlist: Product[];
  ready: boolean;
  storageError: string;
  addToCart: (product: Product, variantId: string, quantity?: number) => string | null;
  removeFromCart: (productId: string, variantId: string) => void;
  updateCartQuantity: (productId: string, variantId: string, quantity: number) => void;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (product: Product) => void;
};

const MarketShoppingContext = createContext<MarketShoppingContextValue | null>(null);
const storageKey = 'midnight-market-shopping-v1';

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false;
  const product = value as Partial<Product>;
  return typeof product.id === 'string'
    && typeof product.name === 'string'
    && typeof product.slug === 'string'
    && ['available_now', 'planned', 'made_to_order'].includes(product.availabilityStatus || '')
    && Boolean(product.merchant && typeof product.merchant.name === 'string' && typeof product.merchant.slug === 'string')
    && Array.isArray(product.variants)
    && product.variants.every((variant: Product['variants'][number]) => Boolean(
      variant && typeof variant.id === 'string'
      && Number.isFinite(variant.priceMinor)
      && (variant.salePriceMinor === null || Number.isFinite(variant.salePriceMinor))
      && Number.isInteger(variant.availableQuantity)
      && variant.availableQuantity >= 0
      && typeof variant.inStock === 'boolean'
    ))
    && Array.isArray(product.images)
    && product.images.every((image: Product['images'][number]) => Boolean(
      image && typeof image.url === 'string'
      && typeof image.alt === 'string'
      && ['image', 'video'].includes(image.mediaType)
    ));
}

function readSavedShopping() {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return { cart: [] as MarketCartLine[], wishlist: [] as Product[] };
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !('cart' in parsed) || !('wishlist' in parsed)
    || !Array.isArray(parsed.cart) || !Array.isArray(parsed.wishlist)) {
    throw new Error('Saved shopping data is not in a supported format.');
  }

  const cart = parsed.cart.filter((line): line is MarketCartLine => {
    if (!line || typeof line !== 'object' || !('product' in line) || !isProduct(line.product)
      || !('variantId' in line) || typeof line.variantId !== 'string'
      || !('quantity' in line) || !Number.isInteger(line.quantity)
      || Number(line.quantity) < 1 || Number(line.quantity) > 10) return false;
    return line.product.availabilityStatus === 'available_now'
      && line.product.variants.some((variant: Product['variants'][number]) => variant.id === line.variantId);
  });
  const wishlist = parsed.wishlist.filter(isProduct);
  return { cart, wishlist };
}

export function MarketShoppingProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [cart, setCart] = useState<MarketCartLine[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    try {
      const saved = readSavedShopping();
      setCart(saved.cart);
      setWishlist(saved.wishlist);
    } catch (cause) {
      console.error('[MidnightMarket] Could not restore saved shopping:', cause);
      setStorageError('Saved items could not be restored from this browser.');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ cart, wishlist }));
      setStorageError('');
    } catch (cause) {
      console.error('[MidnightMarket] Could not save shopping data:', cause);
      setStorageError('Your changes are only saved for this visit because browser storage is unavailable.');
    }
  }, [cart, ready, wishlist]);

  const addToCart = useCallback((product: Product, variantId: string, quantity = 1) => {
    const variant = product.variants.find((item) => item.id === variantId);
    if (product.availabilityStatus !== 'available_now' || !variant?.inStock) {
      return 'This option is no longer available. Refresh the product and check stock again.';
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return 'Choose a quantity from 1 to 10.';
    }
    if (quantity > variant.availableQuantity) {
      return `Only ${variant.availableQuantity} of this option are currently available.`;
    }
    const existing = cart.find((line) => line.product.id === product.id && line.variantId === variantId);
    if (existing && existing.quantity + quantity > 10) {
      return 'A maximum of 10 of this option can be saved in your bag.';
    }
    if (existing && existing.quantity + quantity > variant.availableQuantity) {
      return `Only ${variant.availableQuantity} of this option are currently available.`;
    }
    setCart((current) => {
      const currentLine = current.find((line) => line.product.id === product.id && line.variantId === variantId);
      if (!currentLine) return [...current, { product, variantId, quantity }];
      return current.map((line) => line.product.id === product.id && line.variantId === variantId
        ? { ...line, product, quantity: line.quantity + quantity }
        : line);
    });
    return null;
  }, [cart]);

  const removeFromCart = useCallback((productId: string, variantId: string) => {
    setCart((current) => current.filter((line) => line.product.id !== productId || line.variantId !== variantId));
  }, []);

  const updateCartQuantity = useCallback((productId: string, variantId: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return;
    setCart((current) => current.map((line) => {
      if (line.product.id !== productId || line.variantId !== variantId) return line;
      const variant = line.product.variants.find((item) => item.id === variantId);
      return variant && quantity <= variant.availableQuantity ? { ...line, quantity } : line;
    }));
  }, []);

  const isWishlisted = useCallback((productId: string) => wishlist.some((item) => item.id === productId), [wishlist]);

  const toggleWishlist = useCallback((product: Product) => {
    setWishlist((current) => current.some((item) => item.id === product.id)
      ? current.filter((item) => item.id !== product.id)
      : [product, ...current]);
  }, []);

  const value = useMemo(() => ({
    cart,
    wishlist,
    ready,
    storageError,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    isWishlisted,
    toggleWishlist
  }), [addToCart, cart, isWishlisted, ready, removeFromCart, storageError, toggleWishlist, updateCartQuantity, wishlist]);

  return <MarketShoppingContext.Provider value={value}>{children}</MarketShoppingContext.Provider>;
}

export function useMarketShopping() {
  const value = useContext(MarketShoppingContext);
  if (!value) throw new Error('MarketShoppingProvider is missing from the shop layout.');
  return value;
}
