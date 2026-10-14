# Halloween — Midnight Market

Standalone Midnight Market storefront and private merchant studio. The app uses its own routes and seller-session storage key while reading and writing the dedicated `mm_*` tables in the existing Supabase project.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and add the existing Supabase project URL, publishable key, and **server-only** service-role key.
3. Apply [`supabase/MIDNIGHT_MARKET_FOUNDATION.sql`](./supabase/MIDNIGHT_MARKET_FOUNDATION.sql) once to that same Supabase project if it has not already been applied.
4. Configure Supabase Auth email confirmation and an SMS provider. Set the application URL and `/merchant/portal/login` as an allowed redirect URL.
5. Run `npm install`, then `npm run dev`.

The private Merchant Studio is at `/market`; `/merchant/dashboard` and `/` redirect there. The customer storefront is separate at `/shop`. Seller application is at `/merchant/register`, and seller sign-in is at `/merchant/portal/login`. Seller entry points are not added to the customer storefront navigation.

After applying the foundation SQL, apply [`supabase/MIDNIGHT_MARKET_STUDIO_UPGRADE.sql`](./supabase/MIDNIGHT_MARKET_STUDIO_UPGRADE.sql), [`supabase/MIDNIGHT_MARKET_ORDERS_UPGRADE.sql`](./supabase/MIDNIGHT_MARKET_ORDERS_UPGRADE.sql), and [`supabase/MIDNIGHT_MARKET_OPERATIONS_UPGRADE.sql`](./supabase/MIDNIGHT_MARKET_OPERATIONS_UPGRADE.sql), in that order. These enable editable/resubmittable product listings, category details and media, customer order requests, and verified seller contacts for central sales coordination.

## Central control and data flow

The Halloween Market Desk remains in the Online Bar admin app at `/admin/market` (published in the Online Bar feature branch). Both apps use the same Supabase project and `mm_*` schema: seller applications, approvals, product moderation, campaign publishing, offer review, and suspension actions made in the Desk are reflected in this standalone app. Keep the Supabase URL and project the same in both deployments.

The standalone repository intentionally does not copy the Online Bar admin session, admin APIs, or unrelated waitlist/customer code. Do not expose the service-role key to the browser; only server routes use it. Seller identities still live in the shared Supabase Auth directory, with a separate seller portal and browser storage key rather than a separate Supabase Auth project.

Customer order requests are not paid checkout: the boutique must confirm stock, contact the customer to arrange payment and delivery, and manually record when payment is received. Stock is reserved when the boutique confirms and deducted when marked fulfilled. The Market does not collect money or automatically notify buyers; online payments, sales analytics, payouts and refunds still need a payment integration. Price-offer agreements remain separate from order requests. See [`supabase/MIDNIGHT_MARKET_SETUP.md`](./supabase/MIDNIGHT_MARKET_SETUP.md) for deployment requirements.
