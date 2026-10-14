-- Isolated Midnight Market catalog foundation.
-- Apply this migration in the Supabase project used by the existing website.

CREATE TABLE IF NOT EXISTS public.mm_merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description TEXT,
  logo_path TEXT,
  cover_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mm_merchant_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL CHECK (length(trim(business_name)) BETWEEN 2 AND 160),
  requested_slug TEXT NOT NULL CHECK (requested_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  business_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'information_requested')),
  review_note TEXT,
  reviewed_by_email TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.mm_merchant_applications
  ADD COLUMN IF NOT EXISTS reviewed_by_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS mm_one_open_application_per_user_idx
  ON public.mm_merchant_applications (user_id)
  WHERE status IN ('submitted', 'under_review', 'information_requested');

CREATE UNIQUE INDEX IF NOT EXISTS mm_one_open_application_per_slug_idx
  ON public.mm_merchant_applications (requested_slug)
  WHERE status IN ('submitted', 'under_review', 'information_requested');

CREATE INDEX IF NOT EXISTS mm_merchant_applications_status_idx
  ON public.mm_merchant_applications (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.mm_merchant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'fulfilment')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, user_id)
);

CREATE INDEX IF NOT EXISTS mm_merchant_memberships_user_idx
  ON public.mm_merchant_memberships (user_id, status);

CREATE TABLE IF NOT EXISTS public.mm_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.mm_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mm_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.mm_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 180),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'rejected', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, slug)
);

CREATE INDEX IF NOT EXISTS mm_products_catalog_idx
  ON public.mm_products (status, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_products_category_idx
  ON public.mm_products (category_id, status);

CREATE TABLE IF NOT EXISTS public.mm_product_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_product_media_product_idx
  ON public.mm_product_media (product_id, sort_order);

CREATE TABLE IF NOT EXISTS public.mm_product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  size TEXT,
  color TEXT,
  price_minor BIGINT NOT NULL CHECK (price_minor > 0),
  currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (product_id, size, color)
);

CREATE INDEX IF NOT EXISTS mm_product_variants_product_idx
  ON public.mm_product_variants (product_id, active);

CREATE TABLE IF NOT EXISTS public.mm_inventory (
  variant_id UUID PRIMARY KEY REFERENCES public.mm_product_variants(id) ON DELETE CASCADE,
  quantity_available INTEGER NOT NULL DEFAULT 0 CHECK (quantity_available >= 0),
  quantity_reserved INTEGER NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mm_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('merchant_application', 'product', 'merchant', 'market_campaign')),
  resource_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_admin_audit_log_resource_idx
  ON public.mm_admin_audit_log (resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mm_market_campaigns (
  campaign_key TEXT PRIMARY KEY CHECK (campaign_key = 'market'),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 120),
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 2 AND 500),
  published BOOLEAN NOT NULL DEFAULT false,
  updated_by_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mm_price_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.mm_product_variants(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL CHECK (length(trim(buyer_name)) BETWEEN 2 AND 160),
  buyer_email TEXT NOT NULL CHECK (length(trim(buyer_email)) BETWEEN 3 AND 254),
  buyer_phone TEXT,
  access_token_hash TEXT NOT NULL UNIQUE CHECK (access_token_hash ~ '^[0-9a-f]{64}$'),
  listed_price_minor BIGINT NOT NULL CHECK (listed_price_minor > 0),
  latest_amount_minor BIGINT NOT NULL CHECK (latest_amount_minor > 0),
  accepted_amount_minor BIGINT CHECK (accepted_amount_minor > 0),
  status TEXT NOT NULL DEFAULT 'pending_merchant'
    CHECK (status IN ('pending_merchant', 'countered', 'accepted', 'declined', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_price_offers_merchant_idx
  ON public.mm_price_offers (merchant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_price_offers_product_idx
  ON public.mm_price_offers (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mm_price_offer_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.mm_price_offers(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('buyer', 'merchant', 'admin')),
  action TEXT NOT NULL CHECK (action IN ('offer', 'counter', 'accepted', 'declined')),
  amount_minor BIGINT CHECK (amount_minor > 0),
  message TEXT CHECK (message IS NULL OR length(message) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_price_offer_messages_thread_idx
  ON public.mm_price_offer_messages (offer_id, created_at);

ALTER TABLE public.mm_admin_audit_log
  DROP CONSTRAINT IF EXISTS mm_admin_audit_log_resource_type_check;
ALTER TABLE public.mm_admin_audit_log
  ADD CONSTRAINT mm_admin_audit_log_resource_type_check
  CHECK (resource_type IN ('merchant_application', 'product', 'merchant', 'market_campaign', 'price_offer'));

INSERT INTO public.mm_market_campaigns (campaign_key, title, message, published)
VALUES ('market', 'Find your after-dark', 'Discover statement pieces, expressive accessories and independent boutiques — all in one place.', false)
ON CONFLICT (campaign_key) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'midnight-market',
      'midnight-market',
      false,
      10485760,
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    )
    ON CONFLICT (id) DO UPDATE
      SET public = false,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END;
$$;

INSERT INTO public.mm_categories (name, slug, description, sort_order)
VALUES
  ('Clothing', 'clothing', 'Statement pieces and everyday style.', 10),
  ('Costumes & Masks', 'costumes-masks', 'Looks for nights that call for more.', 20),
  ('Jewellery', 'jewellery', 'Finishing touches with a point of view.', 30),
  ('Wigs & Beauty', 'wigs-beauty', 'Hair, makeup and beauty finds.', 40),
  ('Shoes & Bags', 'shoes-bags', 'The pieces that take you there.', 50),
  ('Accessories', 'accessories', 'Unexpected details from local boutiques.', 60)
ON CONFLICT (slug) DO NOTHING;

DROP FUNCTION IF EXISTS public.mm_review_merchant_application(UUID, BOOLEAN, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.mm_review_merchant_application(
  p_application_id UUID,
  p_action TEXT,
  p_review_note TEXT DEFAULT NULL,
  p_reviewer_email TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application_row public.mm_merchant_applications%ROWTYPE;
  v_merchant_id UUID;
  next_status TEXT;
BEGIN
  SELECT * INTO application_row
  FROM public.mm_merchant_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant application not found.';
  END IF;
  IF application_row.status NOT IN ('submitted', 'under_review', 'information_requested') THEN
    RAISE EXCEPTION 'This merchant application has already been reviewed.';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'request_information') THEN
    RAISE EXCEPTION 'Choose a valid merchant application review action.';
  END IF;

  next_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'information_requested'
  END;

  IF p_action = 'approve' THEN
    INSERT INTO public.mm_merchants (name, slug, description, status)
    VALUES (application_row.business_name, application_row.requested_slug, application_row.business_description, 'approved')
    RETURNING id INTO v_merchant_id;

    INSERT INTO public.mm_merchant_memberships (merchant_id, user_id, role, status)
    VALUES (v_merchant_id, application_row.user_id, 'owner', 'active');
  END IF;

  UPDATE public.mm_merchant_applications
  SET status = next_status,
      review_note = NULLIF(trim(p_review_note), ''),
      reviewed_by_email = p_reviewer_email,
      reviewed_at = now()
  WHERE id = p_application_id;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    COALESCE(NULLIF(trim(p_reviewer_email), ''), 'unknown'),
    'application_' || next_status,
    'merchant_application',
    p_application_id::TEXT,
    jsonb_build_object('note', NULLIF(trim(p_review_note), ''), 'merchant_id', v_merchant_id)
  );

  RETURN jsonb_build_object('applicationId', p_application_id, 'status', next_status, 'merchantId', v_merchant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_review_merchant_application(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_review_merchant_application(UUID, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_create_product_listing(
  p_user_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_category_slug TEXT,
  p_storage_path TEXT,
  p_alt_text TEXT,
  p_size TEXT,
  p_color TEXT,
  p_price_minor BIGINT,
  p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_category_id UUID;
  v_product_id UUID;
  v_variant_id UUID;
BEGIN
  SELECT membership.merchant_id INTO v_merchant_id
  FROM public.mm_merchant_memberships AS membership
  JOIN public.mm_merchants AS merchant ON merchant.id = membership.merchant_id
  WHERE membership.user_id = p_user_id
    AND membership.status = 'active'
    AND membership.role IN ('owner', 'manager')
    AND merchant.status = 'approved'
  ORDER BY membership.created_at
  LIMIT 1;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'An approved merchant membership is required to create a listing.';
  END IF;

  SELECT id INTO v_category_id
  FROM public.mm_categories
  WHERE slug = p_category_slug AND active = true;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Choose an active marketplace category.';
  END IF;

  INSERT INTO public.mm_products (merchant_id, category_id, name, slug, description, status)
  VALUES (v_merchant_id, v_category_id, trim(p_name), p_slug, NULLIF(trim(p_description), ''), 'pending_review')
  RETURNING id INTO v_product_id;

  INSERT INTO public.mm_product_media (product_id, storage_path, alt_text, sort_order)
  VALUES (v_product_id, p_storage_path, NULLIF(trim(p_alt_text), ''), 0);

  INSERT INTO public.mm_product_variants (product_id, size, color, price_minor, currency, active)
  VALUES (v_product_id, NULLIF(trim(p_size), ''), NULLIF(trim(p_color), ''), p_price_minor, 'KES', true)
  RETURNING id INTO v_variant_id;

  INSERT INTO public.mm_inventory (variant_id, quantity_available, quantity_reserved)
  VALUES (v_variant_id, p_quantity, 0);

  RETURN jsonb_build_object('id', v_product_id, 'status', 'pending_review');
END;
$$;

REVOKE ALL ON FUNCTION public.mm_create_product_listing(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_create_product_listing(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_review_product_listing(
  p_product_id UUID,
  p_status TEXT,
  p_actor_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
BEGIN
  IF p_status NOT IN ('published', 'rejected') THEN
    RAISE EXCEPTION 'Choose a valid product review outcome.';
  END IF;

  UPDATE public.mm_products
  SET status = p_status, updated_at = now()
  WHERE id = p_product_id AND status = 'pending_review'
  RETURNING * INTO product_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing has already been reviewed or no longer exists.';
  END IF;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id)
  VALUES (COALESCE(NULLIF(trim(p_actor_email), ''), 'unknown'), 'product_' || p_status, 'product', p_product_id::TEXT);

  RETURN jsonb_build_object('id', product_row.id, 'status', product_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_review_product_listing(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_review_product_listing(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_set_merchant_status(
  p_merchant_id UUID,
  p_status TEXT,
  p_actor_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  merchant_row public.mm_merchants%ROWTYPE;
BEGIN
  IF p_status NOT IN ('approved', 'suspended') THEN
    RAISE EXCEPTION 'Choose a valid merchant status.';
  END IF;

  UPDATE public.mm_merchants
  SET status = p_status, updated_at = now()
  WHERE id = p_merchant_id AND status IN ('approved', 'suspended')
  RETURNING * INTO merchant_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This merchant no longer exists or cannot be updated.';
  END IF;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    COALESCE(NULLIF(trim(p_actor_email), ''), 'unknown'),
    'merchant_' || p_status,
    'merchant',
    p_merchant_id::TEXT,
    jsonb_build_object('slug', merchant_row.slug)
  );

  RETURN jsonb_build_object('id', merchant_row.id, 'status', merchant_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_set_merchant_status(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_set_merchant_status(UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_set_market_campaign(
  p_title TEXT,
  p_message TEXT,
  p_published BOOLEAN,
  p_actor_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  campaign_row public.mm_market_campaigns%ROWTYPE;
BEGIN
  IF length(trim(p_title)) NOT BETWEEN 2 AND 120
    OR length(trim(p_message)) NOT BETWEEN 2 AND 500 THEN
    RAISE EXCEPTION 'Campaign title or message is outside the allowed length.';
  END IF;

  UPDATE public.mm_market_campaigns
  SET title = trim(p_title),
      message = trim(p_message),
      published = p_published,
      updated_by_email = p_actor_email,
      updated_at = now()
  WHERE campaign_key = 'market'
  RETURNING * INTO campaign_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market campaign settings are not configured.';
  END IF;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    COALESCE(NULLIF(trim(p_actor_email), ''), 'unknown'),
    CASE WHEN p_published THEN 'campaign_published' ELSE 'campaign_unpublished' END,
    'market_campaign',
    'market',
    jsonb_build_object('title', campaign_row.title)
  );

  RETURN jsonb_build_object(
    'title', campaign_row.title,
    'message', campaign_row.message,
    'published', campaign_row.published,
    'updatedAt', campaign_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_set_market_campaign(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_set_market_campaign(TEXT, TEXT, BOOLEAN, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_create_price_offer(
  p_product_id UUID,
  p_variant_id UUID,
  p_buyer_name TEXT,
  p_buyer_email TEXT,
  p_buyer_phone TEXT,
  p_access_token_hash TEXT,
  p_amount_minor BIGINT,
  p_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  variant_row public.mm_product_variants%ROWTYPE;
  product_row public.mm_products%ROWTYPE;
  merchant_row public.mm_merchants%ROWTYPE;
  offer_id UUID;
BEGIN
  SELECT variant.* INTO variant_row
  FROM public.mm_product_variants AS variant
  WHERE variant.id = p_variant_id AND variant.product_id = p_product_id AND variant.active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product option is no longer available.';
  END IF;

  SELECT product.* INTO product_row
  FROM public.mm_products AS product
  WHERE product.id = p_product_id AND product.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product is no longer available for offers.';
  END IF;

  SELECT merchant.* INTO merchant_row
  FROM public.mm_merchants AS merchant
  WHERE merchant.id = product_row.merchant_id AND merchant.status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This boutique is not currently accepting offers.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mm_inventory AS inventory
    WHERE inventory.variant_id = p_variant_id
      AND inventory.quantity_available > inventory.quantity_reserved
  ) THEN
    RAISE EXCEPTION 'This product is no longer available.';
  END IF;

  IF length(trim(p_buyer_name)) NOT BETWEEN 2 AND 160
    OR length(trim(p_buyer_email)) NOT BETWEEN 3 AND 254
    OR (p_buyer_phone IS NOT NULL AND length(trim(p_buyer_phone)) > 40)
    OR p_amount_minor < 1 OR p_amount_minor > variant_row.price_minor
    OR length(COALESCE(p_message, '')) > 500
    OR p_access_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Check your contact details and offer amount.';
  END IF;

  INSERT INTO public.mm_price_offers (
    product_id, variant_id, merchant_id, buyer_name, buyer_email, buyer_phone,
    access_token_hash, listed_price_minor, latest_amount_minor
  )
  VALUES (
    p_product_id, p_variant_id, product_row.merchant_id, trim(p_buyer_name),
    lower(trim(p_buyer_email)), NULLIF(trim(p_buyer_phone), ''),
    p_access_token_hash, variant_row.price_minor, p_amount_minor
  )
  RETURNING id INTO offer_id;

  INSERT INTO public.mm_price_offer_messages (offer_id, actor, action, amount_minor, message)
  VALUES (offer_id, 'buyer', 'offer', p_amount_minor, NULLIF(trim(p_message), ''));

  RETURN jsonb_build_object('id', offer_id, 'status', 'pending_merchant', 'expiresAt', now() + interval '14 days');
END;
$$;

REVOKE ALL ON FUNCTION public.mm_create_price_offer(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_create_price_offer(UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_respond_to_price_offer(
  p_offer_id UUID,
  p_actor TEXT,
  p_actor_user_id UUID,
  p_access_token_hash TEXT,
  p_action TEXT,
  p_amount_minor BIGINT,
  p_message TEXT,
  p_actor_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  offer_row public.mm_price_offers%ROWTYPE;
  next_status TEXT;
  accepted_amount BIGINT;
BEGIN
  SELECT offer.* INTO offer_row
  FROM public.mm_price_offers AS offer
  WHERE offer.id = p_offer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This offer could not be found.';
  END IF;

  IF p_actor = 'buyer' THEN
    IF p_access_token_hash IS NULL OR offer_row.access_token_hash <> p_access_token_hash THEN
      RAISE EXCEPTION 'This offer access code is invalid.';
    END IF;
  ELSIF p_actor = 'merchant' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.mm_merchant_memberships AS membership
      JOIN public.mm_merchants AS merchant ON merchant.id = membership.merchant_id
      WHERE membership.user_id = p_actor_user_id
        AND membership.merchant_id = offer_row.merchant_id
        AND membership.status = 'active'
        AND membership.role IN ('owner', 'manager')
        AND merchant.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'An approved membership for this boutique is required.';
    END IF;
  ELSIF p_actor <> 'admin' THEN
    RAISE EXCEPTION 'Choose a valid offer participant.';
  END IF;

  IF offer_row.status IN ('pending_merchant', 'countered') AND offer_row.expires_at <= now() THEN
    UPDATE public.mm_price_offers SET status = 'expired', updated_at = now() WHERE id = p_offer_id;
    RETURN jsonb_build_object('id', p_offer_id, 'status', 'expired');
  END IF;

  IF p_action NOT IN ('accept', 'counter', 'decline')
    OR length(COALESCE(p_message, '')) > 500 THEN
    RAISE EXCEPTION 'Choose a valid offer response.';
  END IF;

  IF offer_row.status NOT IN ('pending_merchant', 'countered') THEN
    RAISE EXCEPTION 'This offer is already closed.';
  END IF;

  IF p_actor = 'buyer' AND p_action = 'accept' AND offer_row.status <> 'countered' THEN
    RAISE EXCEPTION 'Wait for the boutique to make a counteroffer before accepting.';
  END IF;

  IF p_action IN ('accept', 'counter') AND NOT EXISTS (
    SELECT 1
    FROM public.mm_products AS product
    JOIN public.mm_merchants AS merchant ON merchant.id = product.merchant_id
    JOIN public.mm_product_variants AS variant ON variant.product_id = product.id
    JOIN public.mm_inventory AS inventory ON inventory.variant_id = variant.id
    WHERE product.id = offer_row.product_id
      AND variant.id = offer_row.variant_id
      AND product.status = 'published'
      AND merchant.status = 'approved'
      AND variant.active = true
      AND inventory.quantity_available > inventory.quantity_reserved
  ) THEN
    RAISE EXCEPTION 'This product is no longer available.';
  END IF;

  IF p_action = 'counter' THEN
    IF p_amount_minor IS NULL OR p_amount_minor < 1 OR p_amount_minor > offer_row.listed_price_minor THEN
      RAISE EXCEPTION 'The counteroffer must be between KSh 1 and the listed price.';
    END IF;
    next_status := CASE WHEN p_actor = 'buyer' THEN 'pending_merchant' ELSE 'countered' END;
    accepted_amount := NULL;
  ELSIF p_action = 'accept' THEN
    next_status := 'accepted';
    accepted_amount := offer_row.latest_amount_minor;
  ELSE
    next_status := 'declined';
    accepted_amount := NULL;
  END IF;

  UPDATE public.mm_price_offers
  SET status = next_status,
      latest_amount_minor = CASE WHEN p_action = 'counter' THEN p_amount_minor ELSE latest_amount_minor END,
      accepted_amount_minor = accepted_amount,
      updated_at = now()
  WHERE id = p_offer_id;

  INSERT INTO public.mm_price_offer_messages (offer_id, actor, action, amount_minor, message)
  VALUES (
    p_offer_id,
    p_actor,
    CASE p_action
      WHEN 'counter' THEN 'counter'
      WHEN 'accept' THEN 'accepted'
      ELSE 'declined'
    END,
    CASE WHEN p_action = 'counter' THEN p_amount_minor ELSE accepted_amount END,
    NULLIF(trim(p_message), '')
  );

  IF p_actor = 'admin' THEN
    INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
    VALUES (
      COALESCE(NULLIF(trim(p_actor_email), ''), 'unknown'),
      'offer_' || p_action,
      'price_offer',
      p_offer_id::TEXT,
      jsonb_build_object('status', next_status, 'amount_minor', COALESCE(p_amount_minor, accepted_amount))
    );
  END IF;

  RETURN jsonb_build_object('id', p_offer_id, 'status', next_status, 'amountMinor', COALESCE(p_amount_minor, accepted_amount, offer_row.latest_amount_minor));
END;
$$;

REVOKE ALL ON FUNCTION public.mm_respond_to_price_offer(UUID, TEXT, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_respond_to_price_offer(UUID, TEXT, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT) TO service_role;

ALTER TABLE public.mm_merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_merchant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_merchant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_market_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_price_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_price_offer_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.mm_merchants,
  public.mm_merchant_applications,
  public.mm_merchant_memberships,
  public.mm_categories,
  public.mm_products,
  public.mm_product_media,
  public.mm_product_variants,
  public.mm_inventory,
  public.mm_admin_audit_log,
  public.mm_market_campaigns,
  public.mm_price_offers,
  public.mm_price_offer_messages
FROM anon, authenticated;

GRANT ALL ON TABLE
  public.mm_merchants,
  public.mm_merchant_applications,
  public.mm_merchant_memberships,
  public.mm_categories,
  public.mm_products,
  public.mm_product_media,
  public.mm_product_variants,
  public.mm_inventory,
  public.mm_admin_audit_log,
  public.mm_market_campaigns,
  public.mm_price_offers,
  public.mm_price_offer_messages
TO service_role;
