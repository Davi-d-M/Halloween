-- Apply after MIDNIGHT_MARKET_AVAILABILITY_MIGRATION.sql.
-- Stores customer listing reports and audited Online Bar review outcomes.

CREATE TABLE IF NOT EXISTS public.mm_customer_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.mm_products(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.mm_merchants(id) ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL CHECK (reason IN ('misleading', 'counterfeit', 'unsafe', 'other')),
  details TEXT NOT NULL CHECK (length(trim(details)) BETWEEN 10 AND 1000),
  reporter_email TEXT NOT NULL CHECK (length(trim(reporter_email)) BETWEEN 3 AND 254),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  admin_note TEXT,
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mm_customer_reports_status_idx
  ON public.mm_customer_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS mm_customer_reports_product_idx
  ON public.mm_customer_reports (product_id, created_at DESC);

ALTER TABLE public.mm_admin_audit_log
  DROP CONSTRAINT IF EXISTS mm_admin_audit_log_resource_type_check;
ALTER TABLE public.mm_admin_audit_log
  ADD CONSTRAINT mm_admin_audit_log_resource_type_check
  CHECK (resource_type IN ('merchant_application', 'product', 'merchant', 'market_campaign', 'price_offer', 'order_request', 'customer_report'));

ALTER TABLE public.mm_customer_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mm_customer_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mm_customer_reports TO service_role;

CREATE OR REPLACE FUNCTION public.mm_create_customer_report(
  p_product_id UUID,
  p_reason TEXT,
  p_details TEXT,
  p_reporter_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.mm_products%ROWTYPE;
  report_reference TEXT;
  report_id UUID;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('misleading', 'counterfeit', 'unsafe', 'other')
    OR length(trim(COALESCE(p_details, ''))) NOT BETWEEN 10 AND 1000
    OR length(trim(COALESCE(p_reporter_email, ''))) NOT BETWEEN 3 AND 254
    OR trim(p_reporter_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Check the report reason, details and email address.';
  END IF;

  SELECT * INTO product_row
  FROM public.mm_products
  WHERE id = p_product_id AND status = 'published'
  FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.mm_merchants
    WHERE id = product_row.merchant_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'This listing is not available to report.';
  END IF;

  report_reference := 'MMR-' || upper(substr(replace(gen_random_uuid()::TEXT, '-', ''), 1, 10));
  INSERT INTO public.mm_customer_reports (
    product_id, merchant_id, reference, reason, details, reporter_email
  )
  VALUES (
    product_row.id, product_row.merchant_id, report_reference, p_reason,
    trim(p_details), lower(trim(p_reporter_email))
  )
  RETURNING id INTO report_id;

  RETURN jsonb_build_object('id', report_id, 'reference', report_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_create_customer_report(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_create_customer_report(UUID, TEXT, TEXT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mm_admin_update_customer_report(
  p_report_id UUID,
  p_status TEXT,
  p_actor_email TEXT,
  p_admin_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_row public.mm_customer_reports%ROWTYPE;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('investigating', 'resolved', 'dismissed')
    OR trim(COALESCE(p_actor_email, '')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR length(trim(COALESCE(p_admin_note, ''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Choose a valid report outcome and provide an admin note.';
  END IF;

  SELECT * INTO report_row
  FROM public.mm_customer_reports
  WHERE id = p_report_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This customer report no longer exists.';
  END IF;

  UPDATE public.mm_customer_reports
  SET status = p_status,
      admin_note = trim(p_admin_note),
      reviewed_by_email = lower(trim(p_actor_email)),
      reviewed_at = now()
  WHERE id = report_row.id
  RETURNING * INTO report_row;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    lower(trim(p_actor_email)),
    'customer_report_' || p_status,
    'customer_report',
    report_row.id::TEXT,
    jsonb_build_object(
      'reference', report_row.reference,
      'product_id', report_row.product_id,
      'merchant_id', report_row.merchant_id,
      'admin_note', report_row.admin_note
    )
  );

  RETURN jsonb_build_object('id', report_row.id, 'reference', report_row.reference, 'status', report_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.mm_admin_update_customer_report(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_admin_update_customer_report(UUID, TEXT, TEXT, TEXT)
  TO service_role;
