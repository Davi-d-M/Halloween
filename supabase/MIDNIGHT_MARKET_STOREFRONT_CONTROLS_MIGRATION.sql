ALTER TABLE public.mm_market_campaigns
  ADD COLUMN IF NOT EXISTS storefront_eyebrow TEXT NOT NULL DEFAULT 'HALLOWEEN DROP',
  ADD COLUMN IF NOT EXISTS storefront_title TEXT NOT NULL DEFAULT 'COSTUME STORE FOR THE SEASON',
  ADD COLUMN IF NOT EXISTS storefront_subtitle TEXT NOT NULL DEFAULT 'Browse costume drops, explore fit and photo previews, and discover real merchant listings when they are published.',
  ADD COLUMN IF NOT EXISTS collection_eyebrow TEXT NOT NULL DEFAULT 'THE COLLECTION',
  ADD COLUMN IF NOT EXISTS collection_title TEXT NOT NULL DEFAULT 'Find your look.',
  ADD COLUMN IF NOT EXISTS search_placeholder TEXT NOT NULL DEFAULT 'Search costumes, styles, and descriptions',
  ADD COLUMN IF NOT EXISTS categories_label TEXT NOT NULL DEFAULT 'SHOP LIVE CATEGORIES',
  ADD COLUMN IF NOT EXISTS countdown_label TEXT NOT NULL DEFAULT 'HALLOWEEN COUNTDOWN',
  ADD COLUMN IF NOT EXISTS countdown_ends_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS show_preview_designs BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.mm_market_campaigns
  ALTER COLUMN countdown_ends_at DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.mm_set_market_storefront(
  p_title TEXT,
  p_message TEXT,
  p_published BOOLEAN,
  p_storefront_eyebrow TEXT,
  p_storefront_title TEXT,
  p_storefront_subtitle TEXT,
  p_collection_eyebrow TEXT,
  p_collection_title TEXT,
  p_search_placeholder TEXT,
  p_categories_label TEXT,
  p_countdown_label TEXT,
  p_countdown_ends_at TIMESTAMPTZ,
  p_show_preview_designs BOOLEAN,
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
  IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 2 AND 120
    OR p_message IS NULL
    OR length(trim(p_message)) NOT BETWEEN 2 AND 500
    OR p_storefront_eyebrow IS NULL
    OR length(trim(p_storefront_eyebrow)) NOT BETWEEN 2 AND 80
    OR p_storefront_title IS NULL
    OR length(trim(p_storefront_title)) NOT BETWEEN 2 AND 120
    OR p_storefront_subtitle IS NULL
    OR length(trim(p_storefront_subtitle)) NOT BETWEEN 2 AND 500
    OR p_collection_eyebrow IS NULL
    OR length(trim(p_collection_eyebrow)) NOT BETWEEN 2 AND 60
    OR p_collection_title IS NULL
    OR length(trim(p_collection_title)) NOT BETWEEN 2 AND 100
    OR p_search_placeholder IS NULL
    OR length(trim(p_search_placeholder)) NOT BETWEEN 2 AND 100
    OR p_categories_label IS NULL
    OR length(trim(p_categories_label)) NOT BETWEEN 2 AND 60
    OR p_countdown_label IS NULL
    OR length(trim(p_countdown_label)) NOT BETWEEN 2 AND 60
    OR p_published IS NULL
    OR p_show_preview_designs IS NULL THEN
    RAISE EXCEPTION 'A storefront field is outside the allowed length or format.';
  END IF;

  UPDATE public.mm_market_campaigns
  SET title = trim(p_title),
      message = trim(p_message),
      published = p_published,
      storefront_eyebrow = trim(p_storefront_eyebrow),
      storefront_title = trim(p_storefront_title),
      storefront_subtitle = trim(p_storefront_subtitle),
      collection_eyebrow = trim(p_collection_eyebrow),
      collection_title = trim(p_collection_title),
      search_placeholder = trim(p_search_placeholder),
      categories_label = trim(p_categories_label),
      countdown_label = trim(p_countdown_label),
      countdown_ends_at = p_countdown_ends_at,
      show_preview_designs = p_show_preview_designs,
      updated_by_email = p_actor_email,
      updated_at = now()
  WHERE campaign_key = 'market'
  RETURNING * INTO campaign_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Market storefront settings are not configured.';
  END IF;

  INSERT INTO public.mm_admin_audit_log (actor_email, action, resource_type, resource_id, details)
  VALUES (
    COALESCE(NULLIF(trim(p_actor_email), ''), 'unknown'),
    CASE WHEN p_published THEN 'storefront_settings_published' ELSE 'storefront_settings_saved' END,
    'market_campaign',
    'market',
    jsonb_build_object(
      'campaign_title', campaign_row.title,
      'storefront_title', campaign_row.storefront_title,
      'countdown_ends_at', campaign_row.countdown_ends_at,
      'show_preview_designs', campaign_row.show_preview_designs,
      'published', campaign_row.published
    )
  );

  RETURN jsonb_build_object(
    'title', campaign_row.title,
    'message', campaign_row.message,
    'published', campaign_row.published,
    'storefrontEyebrow', campaign_row.storefront_eyebrow,
    'storefrontTitle', campaign_row.storefront_title,
    'storefrontSubtitle', campaign_row.storefront_subtitle,
    'collectionEyebrow', campaign_row.collection_eyebrow,
    'collectionTitle', campaign_row.collection_title,
    'searchPlaceholder', campaign_row.search_placeholder,
    'categoriesLabel', campaign_row.categories_label,
    'countdownLabel', campaign_row.countdown_label,
    'countdownEndsAt', campaign_row.countdown_ends_at,
    'showPreviewDesigns', campaign_row.show_preview_designs,
    'updatedAt', campaign_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mm_set_market_storefront(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mm_set_market_storefront(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT) TO service_role;
