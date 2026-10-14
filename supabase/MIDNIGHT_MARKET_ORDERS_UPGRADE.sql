-- Apply after MIDNIGHT_MARKET_FOUNDATION.sql and MIDNIGHT_MARKET_STUDIO_UPGRADE.sql.
-- This enables unpaid customer order requests; it does not process payments.

CREATE TABLE IF NOT EXISTS public.mm_order_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.mm_product_variants(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_minor BIGINT NOT NULL CHECK (unit_price_minor > 0),
  total_minor BIGINT NOT NULL CHECK (total_minor > 0),
  currency TEXT NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  buyer_name TEXT NOT NULL CHECK (length(trim(buyer_name)) BETWEEN 2 AND 160),
  buyer_email TEXT NOT NULL CHECK (length(trim(buyer_email)) BETWEEN 3 AND 254),
  buyer_phone TEXT,
  buyer_note TEXT,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'preparing', 'ready', 'fulfilled', 'cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_order_requests_merchant_idx
  ON public.mm_order_requests (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_order_requests_status_idx
  ON public.mm_order_requests (merchant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mm_order_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_request_id UUID NOT NULL REFERENCES public.mm_order_requests(id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (actor IN ('customer', 'merchant')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_order_request_events_order_idx
  ON public.mm_order_request_events (order_request_id, created_at);

CREATE OR REPLACE FUNCTION public.mm_create_order_request(
  p_product_id UUID,
  p_variant_id UUID,
  p_buyer_name TEXT,
  p_buyer_email TEXT,
  p_buyer_phone TEXT,
  p_buyer_note TEXT,
  p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
  merchant_row public.mm_merchants%ROWTYPE;
  variant_row public.mm_product_variants%ROWTYPE;
  inventory_row public.mm_inventory%ROWTYPE;
  chosen_price BIGINT;
  variant_description TEXT;
  order_id UUID;
  order_reference TEXT;
BEGIN
  IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 10
    OR length(trim(COALESCE(p_buyer_name, ''))) NOT BETWEEN 2 AND 160
    OR length(trim(COALESCE(p_buyer_email, ''))) NOT BETWEEN 3 AND 254
    OR p_buyer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR length(COALESCE(p_buyer_phone, '')) > 40
    OR length(COALESCE(p_buyer_note, '')) > 500 THEN
    RAISE EXCEPTION 'Check your contact details, note and quantity.';
  END IF;

  SELECT product.* INTO product_row
  FROM public.mm_products AS product
  WHERE product.id = p_product_id AND product.status = 'published'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing is no longer available.';
  END IF;

  SELECT merchant.* INTO merchant_row
  FROM public.mm_merchants AS merchant
  WHERE merchant.id = product_row.merchant_id AND merchant.status = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This boutique is not currently accepting requests.';
  END IF;

  SELECT variant.* INTO variant_row
  FROM public.mm_product_variants AS variant
  JOIN public.mm_inventory AS inventory ON inventory.variant_id = variant.id
  WHERE variant.id = p_variant_id
    AND variant.product_id = p_product_id
    AND variant.active = true
  FOR SHARE OF variant;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This product option is no longer available.';
  END IF;

  SELECT inventory.* INTO inventory_row
  FROM public.mm_inventory AS inventory
  WHERE inventory.variant_id = p_variant_id
  FOR UPDATE;
  IF NOT FOUND OR inventory_row.quantity_available - inventory_row.quantity_reserved < p_quantity THEN
    RAISE EXCEPTION 'There is not enough stock for this request.';
  END IF;

  chosen_price := COALESCE(variant_row.sale_price_minor, variant_row.price_minor);
  variant_description := concat_ws(' / ', NULLIF(variant_row.size, ''), NULLIF(variant_row.color, ''));
  IF variant_description = '' THEN
    variant_description := 'Standard';
  END IF;

  order_reference := 'MM-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10));
  INSERT INTO public.mm_order_requests (
    reference, merchant_id, product_id, variant_id, product_name, variant_label,
    quantity, unit_price_minor, total_minor, buyer_name, buyer_email,
    buyer_phone, buyer_note
  )
  VALUES (
    order_reference, merchant_row.id, product_row.id, variant_row.id,
    product_row.name, variant_description, p_quantity, chosen_price,
    chosen_price * p_quantity, trim(p_buyer_name), lower(trim(p_buyer_email)),
    NULLIF(trim(p_buyer_phone), ''), NULLIF(trim(p_buyer_note), '')
  )
  RETURNING id INTO order_id;

  INSERT INTO public.mm_order_request_events (order_request_id, actor, action, to_status)
  VALUES (order_id, 'customer', 'request_submitted', 'requested');

  RETURN jsonb_build_object('id', order_id, 'reference', order_reference, 'status', 'requested');
END;
$$;

CREATE OR REPLACE FUNCTION public.mm_update_merchant_order_request(
  p_order_id UUID,
  p_merchant_id UUID,
  p_actor_user_id UUID,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.mm_order_requests%ROWTYPE;
  next_reserved INTEGER;
  next_available INTEGER;
BEGIN
  SELECT * INTO order_row
  FROM public.mm_order_requests
  WHERE id = p_order_id AND merchant_id = p_merchant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This order request is not available to your boutique.';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('paid', 'confirmed', 'preparing', 'ready', 'fulfilled', 'cancelled') THEN
    RAISE EXCEPTION 'Choose a valid next order status.';
  END IF;

  IF p_status = 'paid' THEN
    IF order_row.status NOT IN ('confirmed', 'preparing', 'ready') THEN
      RAISE EXCEPTION 'Confirm this request before recording payment.';
    END IF;
    IF order_row.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Payment is already recorded for this order request.';
    END IF;

    UPDATE public.mm_order_requests
    SET payment_status = 'paid', updated_at = now()
    WHERE id = order_row.id;

    INSERT INTO public.mm_order_request_events (
      order_request_id, actor, actor_user_id, action, from_status, to_status
    )
    VALUES (
      order_row.id, 'merchant', p_actor_user_id, 'payment_recorded', order_row.status, order_row.status
    );

    RETURN jsonb_build_object('id', order_row.id, 'reference', order_row.reference, 'status', order_row.status, 'paymentStatus', 'paid');
  END IF;

  IF NOT (
    (order_row.status = 'requested' AND p_status IN ('confirmed', 'cancelled'))
    OR (order_row.status = 'confirmed' AND p_status IN ('preparing', 'cancelled'))
    OR (order_row.status = 'preparing' AND p_status IN ('ready', 'cancelled'))
    OR (order_row.status = 'ready' AND p_status IN ('fulfilled', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'This order request cannot be moved to that status.';
  END IF;

  IF p_status = 'confirmed' THEN
    UPDATE public.mm_inventory
    SET quantity_reserved = quantity_reserved + order_row.quantity, updated_at = now()
    WHERE variant_id = order_row.variant_id
      AND quantity_available - quantity_reserved >= order_row.quantity
    RETURNING quantity_reserved INTO next_reserved;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'There is not enough stock to confirm this order request.';
    END IF;
  ELSIF p_status = 'cancelled' AND order_row.status IN ('confirmed', 'preparing', 'ready') THEN
    UPDATE public.mm_inventory
    SET quantity_reserved = quantity_reserved - order_row.quantity, updated_at = now()
    WHERE variant_id = order_row.variant_id
      AND quantity_reserved >= order_row.quantity
    RETURNING quantity_reserved INTO next_reserved;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not release the stock reserved for this order.';
    END IF;
  ELSIF p_status = 'fulfilled' THEN
    IF order_row.payment_status <> 'paid' THEN
      RAISE EXCEPTION 'Record the payment before marking this order fulfilled.';
    END IF;
    UPDATE public.mm_inventory
    SET quantity_available = quantity_available - order_row.quantity,
        quantity_reserved = quantity_reserved - order_row.quantity,
        updated_at = now()
    WHERE variant_id = order_row.variant_id
      AND quantity_reserved >= order_row.quantity
      AND quantity_available >= order_row.quantity
    RETURNING quantity_available INTO next_available;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Could not complete stock updates for this order.';
    END IF;
  END IF;

  UPDATE public.mm_order_requests
  SET status = p_status, updated_at = now()
  WHERE id = order_row.id;

  INSERT INTO public.mm_order_request_events (
    order_request_id, actor, actor_user_id, action, from_status, to_status
  )
  VALUES (
    order_row.id, 'merchant', p_actor_user_id, 'status_updated', order_row.status, p_status
  );

  RETURN jsonb_build_object('id', order_row.id, 'reference', order_row.reference, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_create_order_request(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mm_update_merchant_order_request(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_create_order_request(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mm_update_merchant_order_request(UUID, UUID, UUID, TEXT) TO service_role;

ALTER TABLE public.mm_order_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mm_order_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mm_order_requests, public.mm_order_request_events FROM anon, authenticated;
GRANT ALL ON TABLE public.mm_order_requests, public.mm_order_request_events TO service_role;
