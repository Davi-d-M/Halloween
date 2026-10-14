# Halloween — Midnight Market

Standalone Midnight Market storefront and private merchant studio. The app uses its own routes and seller-session storage key while reading and writing the dedicated `mm_*` tables in the existing Supabase project.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and add the existing Supabase project URL, publishable key, and **server-only** service-role key.
3. Apply [`supabase/MIDNIGHT_MARKET_FOUNDATION.sql`](./supabase/MIDNIGHT_MARKET_FOUNDATION.sql) once to that same Supabase project if it has not already been applied.
4. Configure Supabase Auth email confirmation and an SMS provider. Set the application URL and `/merchant/portal/login` as an allowed redirect URL.
5. Run `npm install`, then `npm run dev`.

The storefront is at `/market`; `/` redirects there. Public browsing does not require a customer account. Seller application is at `/merchant/register`, seller sign-in is at `/merchant/portal/login`, and the approved seller dashboard is at `/merchant/dashboard`. Seller entry points are not added to the public storefront navigation.

## Central control and data flow

The Halloween Market Desk remains in the Online Bar admin app at `/admin/market` (published in the Online Bar feature branch). Both apps use the same Supabase project and `mm_*` schema: seller applications, approvals, product moderation, campaign publishing, offer review, and suspension actions made in the Desk are reflected in this standalone app. Keep the Supabase URL and project the same in both deployments.

The standalone repository intentionally does not copy the Online Bar admin session, admin APIs, or unrelated waitlist/customer code. Do not expose the service-role key to the browser; only server routes use it. Seller identities still live in the shared Supabase Auth directory, with a separate seller portal and browser storage key rather than a separate Supabase Auth project.

Price agreements are not checkout: this release does not create orders, take payments, reserve inventory, or automatically notify buyers by email/SMS. See [`supabase/MIDNIGHT_MARKET_SETUP.md`](./supabase/MIDNIGHT_MARKET_SETUP.md) for the current limits and deployment requirements.
