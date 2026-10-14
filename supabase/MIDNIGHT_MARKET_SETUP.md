# Midnight Market deployment

Midnight Market uses its own `mm_*` data tables and private `midnight-market` storage bucket in the existing Supabase project. The migration is additive; it does not reuse the waitlist, ordinary merchant, or ordinary product/order tables.

The standalone storefront and seller studio live in the `Davi-d-M/Halloween` repository. Central moderation remains in the Online Bar Halloween Market Desk at `/admin/market`; both deployments must use the same Supabase project for application reviews, product moderation, campaign publishing, merchant access, and price offers to stay synchronized. The Online Bar project contains the admin-only routes and authorization and should not be copied into this standalone app.

## Database and environment

1. Apply [`MIDNIGHT_MARKET_FOUNDATION.sql`](./MIDNIGHT_MARKET_FOUNDATION.sql) to the Supabase project used by the website.
2. Apply [`MIDNIGHT_MARKET_STUDIO_UPGRADE.sql`](./MIDNIGHT_MARKET_STUDIO_UPGRADE.sql) after the foundation. It adds merchant product editing and resubmission, category details, sale pricing, multi-photo and optional video listings, and admin rejection notes. The private storage bucket is configured to accept the supported image/video types, with a 10 MB maximum object size.
3. Configure `NEXT_PUBLIC_SUPABASE_URL`, a public Supabase key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and `SUPABASE_SERVICE_ROLE_KEY` in both deployments. Keep the service-role key server-only.
4. Configure Supabase Auth email confirmation and an SMS provider before enabling seller applications. Seller approval in Halloween Market Desk remains blocked until the applicant verifies the matching email and phone.
5. Add the standalone site's `/merchant/portal/login` callback to Supabase Auth's allowed redirect URLs.
6. Configure `RESEND_API_KEY` only if the deployment wants to add email notifications; the current offer workflow displays updates in the private browser session and exposes the buyer's contact details only to that boutique and Market Operations.

## Account and offer boundaries

Seller sign-in has its own pages and browser storage key, and seller access is separately gated by an approved `mm_merchant_memberships` record. Supabase Auth still stores seller and customer identities in the same project's `auth.users`; a separate storage key does not create a separate Auth directory. Do not represent it as a separate user database.

Price-offer acceptances are recorded as non-binding price agreements only. The Market currently has no checkout, order creation, payment, stock reservation, or automatic email/SMS notification for a counteroffer. The buyer can revisit the product in the same browser session to view or respond to the private offer thread; the boutique can use the supplied email/phone to contact them. Do not report sales, earnings, refunds, payouts, or fulfilment status until a real order/payment workflow has been added.
