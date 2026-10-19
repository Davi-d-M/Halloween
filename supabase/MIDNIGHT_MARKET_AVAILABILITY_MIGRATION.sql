-- Apply after MIDNIGHT_MARKET_ADMIN_CONTROL_UPGRADE.sql.
-- Planned and made-to-order listings collect interest only; they are not orders or preorders.

ALTER TABLE public.mm_products
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'available_now',
  ADD COLUMN IF NOT EXISTS estimated_available_on DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mm_products_availability_status_check'
      AND conrelid = 'public.mm_products'::regclass
  ) THEN
    ALTER TABLE public.mm_products
      ADD CONSTRAINT mm_products_availability_status_check
      CHECK (availability_status IN ('available_now', 'planned', 'made_to_order'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mm_products_estimated_date_status_check'
      AND conrelid = 'public.mm_products'::regclass
  ) THEN
    ALTER TABLE public.mm_products
      ADD CONSTRAINT mm_products_estimated_date_status_check
      CHECK (estimated_available_on IS NULL OR availability_status = 'planned');
  END IF;
END;
$$;

INSERT INTO public.mm_categories (name, slug, description, sort_order)
VALUES
  ('Costume Packages', 'costume-packages', 'Complete looks and coordinated group costume sets.', 25),
  ('Props & Effects', 'props-fx', 'Costume props, theatrical effects and character details.', 65),
  ('Party & Décor', 'party-decor', 'Halloween decorations, photo props and party kits.', 70)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mm_product_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  buyer_name TEXT NOT NULL CHECK (length(trim(buyer_name)) BETWEEN 2 AND 160),
  buyer_email TEXT NOT NULL CHECK (length(trim(buyer_email)) BETWEEN 3 AND 254),
  buyer_phone TEXT,
  buyer_note TEXT,
  contact_consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_product_interests_merchant_idx
  ON public.mm_product_interests (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_product_interests_product_idx
  ON public.mm_product_interests (product_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.mm_upsert_product_listing_with_availability(
  p_user_id UUID,
  p_product_id UUID,
  p_variant_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_category_slug TEXT,
  p_attributes JSONB,
  p_delivery_information TEXT,
  p_return_policy TEXT,
  p_sku TEXT,
  p_size TEXT,
  p_color TEXT,
  p_price_minor BIGINT,
  p_sale_price_minor BIGINT,
  p_quantity INTEGER,
  p_images JSONB,
  p_availability_status TEXT,
  p_estimated_available_on DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  product_id UUID;
BEGIN
  IF p_availability_status IS NULL
    OR p_availability_status NOT IN ('available_now', 'planned', 'made_to_order')
    OR (p_availability_status = 'planned' AND p_quantity <> 0)
    OR (p_availability_status <> 'planned' AND p_estimated_available_on IS NOT NULL)
    OR (p_estimated_available_on IS NOT NULL AND p_estimated_available_on < CURRENT_DATE) THEN
    RAISE EXCEPTION 'Choose a valid availability state, stock quantity and estimated date.';
  END IF;

  result := public.mm_upsert_product_listing(
    p_user_id, p_product_id, p_variant_id, p_name, p_slug, p_description,
    p_category_slug, p_attributes, p_delivery_information, p_return_policy,
    p_sku, p_size, p_color, p_price_minor, p_sale_price_minor, p_quantity, p_images
  );
  product_id := (result->>'id')::UUID;

  UPDATE public.mm_products
  SET availability_status = p_availability_status,
      estimated_available_on = p_estimated_available_on
  WHERE id = product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The product listing could not be updated.';
  END IF;

  RETURN result || jsonb_build_object(
    'availabilityStatus', p_availability_status,
    'estimatedAvailableOn', p_estimated_available_on
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_upsert_product_listing_with_availability(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT,
  TEXT, TEXT, BIGINT, BIGINT, INTEGER, JSONB, TEXT, DATE
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_upsert_product_listing_with_availability(
  UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT,
  TEXT, TEXT, BIGINT, BIGINT, INTEGER, JSONB, TEXT, DATE
) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_create_product_interest(
  p_product_id UUID,
  p_buyer_name TEXT,
  p_buyer_email TEXT,
  p_buyer_phone TEXT,
  p_buyer_note TEXT,
  p_contact_consent BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
  merchant_row public.mm_merchants%ROWTYPE;
  interest_id UUID;
  interest_reference TEXT;
BEGIN
  IF length(trim(COALESCE(p_buyer_name, ''))) NOT BETWEEN 2 AND 160
    OR length(trim(COALESCE(p_buyer_email, ''))) NOT BETWEEN 3 AND 254
    OR p_buyer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR length(COALESCE(p_buyer_phone, '')) > 40
    OR p_contact_consent IS DISTINCT FROM true
    OR length(COALESCE(p_buyer_note, '')) > 500 THEN
    RAISE EXCEPTION 'Check your contact details and note.';
  END IF;

  SELECT * INTO product_row
  FROM public.mm_products
  WHERE id = p_product_id
    AND status = 'published'
    AND availability_status IN ('planned', 'made_to_order')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing is not collecting product interest.';
  END IF;

  SELECT * INTO merchant_row
  FROM public.mm_merchants
  WHERE id = product_row.merchant_id AND status = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This boutique is not currently accepting interest.';
  END IF;

  interest_reference := 'MMI-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10));
  INSERT INTO public.mm_product_interests (
    reference, product_id, merchant_id, buyer_name, buyer_email, buyer_phone, buyer_note, contact_consent_at
  )
  VALUES (
    interest_reference, product_row.id, merchant_row.id, trim(p_buyer_name),
    lower(trim(p_buyer_email)), NULLIF(trim(p_buyer_phone), ''), NULLIF(trim(p_buyer_note), ''), now()
  )
  RETURNING id INTO interest_id;

  RETURN jsonb_build_object('id', interest_id, 'reference', interest_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_create_product_interest(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_create_product_interest(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mm_reject_unavailable_listing_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.mm_products
    WHERE id = NEW.product_id
      AND availability_status = 'available_now'
      AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'This listing is not available for order requests.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_order_requests_require_available_listing ON public.mm_order_requests;
CREATE TRIGGER mm_order_requests_require_available_listing
  BEFORE INSERT ON public.mm_order_requests
  FOR EACH ROW EXECUTE FUNCTION public.mm_reject_unavailable_listing_order();

CREATE OR REPLACE FUNCTION public.mm_reject_unavailable_listing_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.mm_products
    WHERE id = NEW.product_id
      AND availability_status = 'available_now'
      AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'This listing is not accepting price offers.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mm_price_offers_require_available_listing ON public.mm_price_offers;
CREATE TRIGGER mm_price_offers_require_available_listing
  BEFORE INSERT ON public.mm_price_offers
  FOR EACH ROW EXECUTE FUNCTION public.mm_reject_unavailable_listing_offer();

ALTER TABLE public.mm_product_interests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mm_product_interests FROM anon, authenticated;
GRANT ALL ON TABLE public.mm_product_interests TO service_role;
