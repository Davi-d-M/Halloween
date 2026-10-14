-- Apply after MIDNIGHT_MARKET_FOUNDATION.sql. Safe to re-run.

ALTER TABLE public.mm_products
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_information TEXT,
  ADD COLUMN IF NOT EXISTS return_policy TEXT,
  ADD COLUMN IF NOT EXISTS review_note TEXT;

ALTER TABLE public.mm_product_variants
  ADD COLUMN IF NOT EXISTS sale_price_minor BIGINT;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
    SET file_size_limit = 10485760,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
    WHERE id = 'midnight-market';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mm_product_variants_sale_price_check'
      AND conrelid = 'public.mm_product_variants'::regclass
  ) THEN
    ALTER TABLE public.mm_product_variants
      ADD CONSTRAINT mm_product_variants_sale_price_check
      CHECK (sale_price_minor IS NULL OR (sale_price_minor > 0 AND sale_price_minor < price_minor));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mm_upsert_product_listing(
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
  p_images JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_category_id UUID;
  v_product_id UUID := p_product_id;
  v_variant_id UUID := p_variant_id;
  v_status TEXT;
  v_reserved INTEGER;
  v_old_paths JSONB;
  v_removed_paths JSONB;
  v_image JSONB;
BEGIN
  IF length(trim(p_name)) NOT BETWEEN 2 AND 180
    OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR length(p_slug) > 180
    OR length(COALESCE(p_description, '')) > 3000
    OR length(COALESCE(p_delivery_information, '')) > 1000
    OR length(COALESCE(p_return_policy, '')) > 1000
    OR length(COALESCE(p_sku, '')) > 100
    OR length(COALESCE(p_size, '')) > 80
    OR length(COALESCE(p_color, '')) > 80
    OR p_price_minor NOT BETWEEN 1 AND 10000000000
    OR (p_sale_price_minor IS NOT NULL AND (p_sale_price_minor < 1 OR p_sale_price_minor >= p_price_minor))
    OR p_quantity NOT BETWEEN 0 AND 1000000
    OR jsonb_typeof(COALESCE(p_attributes, '{}'::jsonb)) <> 'object'
    OR jsonb_object_length(COALESCE(p_attributes, '{}'::jsonb)) > 40
    OR jsonb_typeof(p_images) <> 'array' THEN
    RAISE EXCEPTION 'Check the product details, price, stock, attributes and photos.';
  END IF;

  IF jsonb_array_length(p_images) NOT BETWEEN 1 AND 7
    OR (SELECT count(*) FROM jsonb_array_elements(p_images) AS media(item) WHERE item->>'media_type' = 'image') NOT BETWEEN 1 AND 6
    OR (SELECT count(*) FROM jsonb_array_elements(p_images) AS media(item) WHERE item->>'media_type' = 'video') > 1 THEN
    RAISE EXCEPTION 'A listing requires one to six photos and may include one video.';
  END IF;

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
    RAISE EXCEPTION 'An approved merchant membership is required to manage listings.';
  END IF;

  SELECT id INTO v_category_id
  FROM public.mm_categories
  WHERE slug = p_category_slug AND active = true;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Choose an active marketplace category.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_images) AS images(media)
    WHERE jsonb_typeof(media) <> 'object'
      OR COALESCE(media->>'storage_path', '') !~ ('^' || p_user_id::TEXT || '/[A-Za-z0-9._-]+$')
      OR length(COALESCE(media->>'alt_text', '')) > 200
      OR COALESCE(media->>'media_type', '') NOT IN ('image', 'video')
  ) THEN
    RAISE EXCEPTION 'One or more product photos are invalid.';
  END IF;

  IF v_product_id IS NULL THEN
    INSERT INTO public.mm_products (
      merchant_id, category_id, name, slug, description, attributes,
      delivery_information, return_policy, status
    )
    VALUES (
      v_merchant_id, v_category_id, trim(p_name), p_slug,
      NULLIF(trim(p_description), ''), COALESCE(p_attributes, '{}'::jsonb),
      NULLIF(trim(p_delivery_information), ''), NULLIF(trim(p_return_policy), ''),
      'pending_review'
    )
    RETURNING id, status INTO v_product_id, v_status;

    INSERT INTO public.mm_product_variants (
      product_id, sku, size, color, price_minor, sale_price_minor, currency, active
    )
    VALUES (
      v_product_id, NULLIF(trim(p_sku), ''), NULLIF(trim(p_size), ''),
      NULLIF(trim(p_color), ''), p_price_minor, p_sale_price_minor, 'KES', true
    )
    RETURNING id INTO v_variant_id;

    INSERT INTO public.mm_inventory (variant_id, quantity_available, quantity_reserved)
    VALUES (v_variant_id, p_quantity, 0);
  ELSE
    SELECT status INTO v_status
    FROM public.mm_products
    WHERE id = v_product_id AND merchant_id = v_merchant_id
      AND status <> 'archived'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This listing is unavailable or belongs to another boutique.';
    END IF;

    SELECT inventory.quantity_reserved INTO v_reserved
    FROM public.mm_product_variants AS variant
    JOIN public.mm_inventory AS inventory ON inventory.variant_id = variant.id
    WHERE variant.id = v_variant_id AND variant.product_id = v_product_id
    FOR UPDATE OF variant, inventory;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'This product variant could not be found.';
    END IF;
    IF p_quantity < v_reserved THEN
      RAISE EXCEPTION 'Available stock cannot be lower than stock reserved for orders.';
    END IF;

    SELECT COALESCE(jsonb_agg(storage_path), '[]'::jsonb) INTO v_old_paths
    FROM public.mm_product_media WHERE product_id = v_product_id;

    UPDATE public.mm_products
    SET category_id = v_category_id,
        name = trim(p_name),
        slug = p_slug,
        description = NULLIF(trim(p_description), ''),
        attributes = COALESCE(p_attributes, '{}'::jsonb),
        delivery_information = NULLIF(trim(p_delivery_information), ''),
        return_policy = NULLIF(trim(p_return_policy), ''),
        status = 'pending_review',
        updated_at = now()
    WHERE id = v_product_id;

    UPDATE public.mm_product_variants
    SET sku = NULLIF(trim(p_sku), ''),
        size = NULLIF(trim(p_size), ''),
        color = NULLIF(trim(p_color), ''),
        price_minor = p_price_minor,
        sale_price_minor = p_sale_price_minor
    WHERE id = v_variant_id;

    UPDATE public.mm_inventory
    SET quantity_available = p_quantity, updated_at = now()
    WHERE variant_id = v_variant_id;

    DELETE FROM public.mm_product_media WHERE product_id = v_product_id;
  END IF;

  FOR v_image IN SELECT value FROM jsonb_array_elements(p_images)
  LOOP
    INSERT INTO public.mm_product_media (product_id, storage_path, media_type, alt_text, sort_order)
    VALUES (
      v_product_id,
      v_image->>'storage_path',
      v_image->>'media_type',
      NULLIF(trim(v_image->>'alt_text'), ''),
      COALESCE((v_image->>'sort_order')::INTEGER, 0)
    );
  END LOOP;

  SELECT COALESCE(jsonb_agg(old_path), '[]'::jsonb) INTO v_removed_paths
  FROM jsonb_array_elements_text(COALESCE(v_old_paths, '[]'::jsonb)) AS removed(old_path)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_images) AS images(kept)
    WHERE kept->>'storage_path' = old_path
  );

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    COALESCE((SELECT email FROM auth.users WHERE id = p_user_id), 'merchant'),
    CASE WHEN p_product_id IS NULL THEN 'merchant_product_created' ELSE 'merchant_product_resubmitted' END,
    'product',
    v_product_id::TEXT,
    jsonb_build_object('status', 'pending_review', 'previous_status', v_status)
  );

  RETURN jsonb_build_object(
    'id', v_product_id,
    'variantId', v_variant_id,
    'status', 'pending_review',
    'removedMediaPaths', v_removed_paths
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_upsert_product_listing(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_upsert_product_listing(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, INTEGER, JSONB) TO service_role;

DROP FUNCTION IF EXISTS public.mm_review_product_listing(UUID, TEXT, TEXT);

CREATE FUNCTION public.mm_review_product_listing(
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
  IF p_status NOT IN ('published', 'rejected')
    OR length(COALESCE(p_review_note, '')) > 1000
    OR (p_status = 'rejected' AND length(trim(COALESCE(p_review_note, ''))) < 5) THEN
    RAISE EXCEPTION 'A rejection reason of at least five characters is required.';
  END IF;

  UPDATE public.mm_products
  SET status = p_status,
      review_note = CASE WHEN p_status = 'rejected' THEN trim(p_review_note) ELSE NULL END,
      updated_at = now()
  WHERE id = p_product_id AND status = 'pending_review'
  RETURNING * INTO product_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing has already been reviewed or no longer exists.';
  END IF;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    COALESCE(NULLIF(trim(p_actor_email), ''), 'unknown'),
    'product_' || p_status,
    'product',
    p_product_id::TEXT,
    jsonb_build_object('review_note', product_row.review_note)
  );

  RETURN jsonb_build_object('id', product_row.id, 'status', product_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_review_product_listing(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_review_product_listing(UUID, TEXT, TEXT, TEXT) TO service_role;
