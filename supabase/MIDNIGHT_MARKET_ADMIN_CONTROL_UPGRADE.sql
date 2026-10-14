-- Apply after MIDNIGHT_MARKET_OPERATIONS_UPGRADE.sql.
-- Adds audited Online Bar controls for listings and order requests.

ALTER TABLE public.mm_admin_audit_log
  DROP CONSTRAINT IF EXISTS mm_admin_audit_log_resource_type_check;

ALTER TABLE public.mm_admin_audit_log
  ADD CONSTRAINT mm_admin_audit_log_resource_type_check
  CHECK (resource_type IN ('merchant_application', 'product', 'merchant', 'market_campaign', 'price_offer', 'order_request'));

ALTER TABLE public.mm_order_request_events
  DROP CONSTRAINT IF EXISTS mm_order_request_events_actor_check;

ALTER TABLE public.mm_order_request_events
  ADD CONSTRAINT mm_order_request_events_actor_check
  CHECK (actor IN ('customer', 'merchant', 'admin'));

ALTER TABLE public.mm_order_request_events
  ADD COLUMN IF NOT EXISTS actor_email TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

CREATE OR REPLACE FUNCTION public.mm_admin_set_product_status(
  p_product_id UUID,
  p_status TEXT,
  p_actor_email TEXT,
  p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending_review', 'published', 'rejected', 'archived')
    OR length(trim(COALESCE(p_actor_email, ''))) NOT BETWEEN 3 AND 254
    OR length(COALESCE(p_review_note, '')) > 1000
    OR (p_status IN ('rejected', 'archived') AND length(trim(COALESCE(p_review_note, ''))) < 5) THEN
    RAISE EXCEPTION 'Choose a valid listing status and provide a reason when declining or hiding a listing.';
  END IF;

  IF p_status = 'published' AND EXISTS (
    SELECT 1
    FROM public.mm_products AS product
    JOIN public.mm_merchants AS merchant ON merchant.id = product.merchant_id
    WHERE product.id = p_product_id
      AND merchant.status <> 'approved'
  ) THEN
    RAISE EXCEPTION 'A listing cannot be published while its boutique is suspended.';
  END IF;

  UPDATE public.mm_products
  SET status = p_status,
      review_note = CASE
        WHEN p_status IN ('rejected', 'archived') THEN trim(p_review_note)
        ELSE NULL
      END,
      updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO product_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing no longer exists.';
  END IF;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    lower(trim(p_actor_email)),
    'product_' || p_status,
    'product',
    p_product_id::TEXT,
    jsonb_build_object('review_note', product_row.review_note)
  );

  RETURN jsonb_build_object('id', product_row.id, 'status', product_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_admin_set_product_status(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_admin_set_product_status(UUID, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.mm_admin_update_order_request(
  p_order_id UUID,
  p_status TEXT,
  p_actor_email TEXT,
  p_note TEXT
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
  audit_action TEXT;
  next_payment_status TEXT;
BEGIN
  IF p_status NOT IN ('paid', 'confirmed', 'preparing', 'ready', 'fulfilled', 'cancelled')
    OR length(trim(COALESCE(p_actor_email, ''))) NOT BETWEEN 3 AND 254
    OR length(trim(COALESCE(p_note, ''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Choose a valid order action and provide an audit note of at least five characters.';
  END IF;

  SELECT * INTO order_row
  FROM public.mm_order_requests
  WHERE id = p_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This order request no longer exists.';
  END IF;

  next_payment_status := order_row.payment_status;
  IF p_status = 'paid' THEN
    IF order_row.status NOT IN ('confirmed', 'preparing', 'ready') THEN
      RAISE EXCEPTION 'Confirm the order before recording an offline payment.';
    END IF;
    IF order_row.payment_status = 'paid' THEN
      RAISE EXCEPTION 'Payment is already recorded for this order request.';
    END IF;

    UPDATE public.mm_order_requests
    SET payment_status = 'paid', updated_at = now()
    WHERE id = order_row.id;
    next_payment_status := 'paid';
    audit_action := 'payment_recorded';

    INSERT INTO public.mm_order_request_events (
      order_request_id, actor, actor_email, action, from_status, to_status, note
    )
    VALUES (order_row.id, 'admin', lower(trim(p_actor_email)), audit_action, order_row.status, order_row.status, trim(p_note));
  ELSE
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
        RAISE EXCEPTION 'Record the offline payment before marking this order fulfilled.';
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
    audit_action := 'status_updated';

    INSERT INTO public.mm_order_request_events (
      order_request_id, actor, actor_email, action, from_status, to_status, note
    )
    VALUES (order_row.id, 'admin', lower(trim(p_actor_email)), audit_action, order_row.status, p_status, trim(p_note));
  END IF;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    lower(trim(p_actor_email)),
    'order_' || audit_action,
    'order_request',
    order_row.id::TEXT,
    jsonb_build_object(
      'reference', order_row.reference,
      'note', trim(p_note),
      'from_status', order_row.status,
      'to_status', CASE WHEN p_status = 'paid' THEN order_row.status ELSE p_status END,
      'payment_status', next_payment_status
    )
  );

  RETURN jsonb_build_object(
    'id', order_row.id,
    'reference', order_row.reference,
    'status', CASE WHEN p_status = 'paid' THEN order_row.status ELSE p_status END,
    'paymentStatus', next_payment_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_admin_update_order_request(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_admin_update_order_request(UUID, TEXT, TEXT, TEXT) TO service_role;
