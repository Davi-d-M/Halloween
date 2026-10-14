-- Apply after MIDNIGHT_MARKET_ORDERS_UPGRADE.sql.
-- Store verified seller contacts on the approved boutique for Market Operations.

ALTER TABLE public.mm_merchants
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

UPDATE public.mm_merchants AS merchant
SET contact_name = application.contact_name,
    contact_email = application.contact_email,
    contact_phone = application.contact_phone
FROM public.mm_admin_audit_log AS audit
JOIN public.mm_merchant_applications AS application
  ON application.id::TEXT = audit.resource_id
WHERE audit.resource_type = 'merchant_application'
  AND audit.action = 'application_approved'
  AND audit.details->>'merchant_id' = merchant.id::TEXT
  AND (merchant.contact_email IS NULL OR merchant.contact_phone IS NULL);

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
  IF p_action <> 'approve'
    AND length(trim(COALESCE(p_review_note, ''))) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'A review note of at least five characters is required.';
  END IF;

  next_status := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'information_requested'
  END;

  IF p_action = 'approve' THEN
    INSERT INTO public.mm_merchants (
      name, slug, description, status, contact_name, contact_email, contact_phone
    )
    VALUES (
      application_row.business_name,
      application_row.requested_slug,
      application_row.business_description,
      'approved',
      application_row.contact_name,
      lower(trim(application_row.contact_email)),
      application_row.contact_phone
    )
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
