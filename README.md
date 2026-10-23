# Halloween — Midnight Market

Standalone Midnight Market storefront and private merchant studio. The app uses its own routes and seller-session storage key while reading and writing the dedicated `mm_*` tables in the existing Supabase project.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and add the existing Supabase project URL, publishable key, and **server-only** service-role key.
3. Apply [`supabase/MIDNIGHT_MARKET_FOUNDATION.sql`](./supabase/MIDNIGHT_MARKET_FOUNDATION.sql) once to that same Supabase project if it has not already been applied.
4. Configure Supabase Auth email confirmation and an SMS provider. Set the application URL and `/merchant/portal/login` as an allowed redirect URL.
5. Run `npm install`, then `npm run dev`.

The private Merchant Studio is at `/market`; `/merchant/dashboard` and `/` redirect there. The customer storefront is separate at `/shop`. Seller application is at `/merchant/register`, and seller sign-in is at `/merchant/portal/login`. Seller entry points are not added to the customer storefront navigation.

The public `/shop` catalog only returns published listings from approved merchants. Customers can search product names and descriptions, narrow by category or availability, browse boutique pages, load additional results in pages, and save a local wishlist or shopping bag. The homepage also shows every Fit Studio listing explicitly published by Online Bar Admin, including its photo, category and KSh price. Published listings remain visible when temporarily unavailable and are labeled accordingly; unpublished drafts remain private. These are request listings, not confirmed stock or online checkout, and Fit Studio member requests still use the Waitlist member pass. Both deployments must use the same Supabase project, and the Halloween deployment must have its server-only service-role key configured to read the Fit Studio listings. Customer safety reports are stored privately and reviewed in Online Bar Market Desk. The bag is not checkout: each product order request is checked server-side for current publication, merchant approval, price, and stock, and the boutique confirms stock and arranges payment and delivery directly. The current Market does not provide cart checkout or online payment.

The shop's optional music player loads the currently published genre tracks and age-group mixes from the Waitlist's public `/api/content` endpoint through the shop's server-side `/api/market/music` proxy. Keep both deployments online and publish tracks in the existing Waitlist content settings. Visitors choose a track and start playback themselves; music never autoplays.

## Install Midnight Market

The customer shop is an installable Progressive Web App at `/shop`. On a supported browser, tap **Install app** in the shop navigation and accept the browser prompt. On iPhone or iPad, open the shop in Safari, tap **Share**, then **Add to Home Screen**. The app requires an internet connection to show current products and availability; if the device goes offline, it provides a reconnect screen.

After applying the foundation SQL, apply [`supabase/MIDNIGHT_MARKET_STUDIO_UPGRADE.sql`](./supabase/MIDNIGHT_MARKET_STUDIO_UPGRADE.sql), [`supabase/MIDNIGHT_MARKET_ORDERS_UPGRADE.sql`](./supabase/MIDNIGHT_MARKET_ORDERS_UPGRADE.sql), [`supabase/MIDNIGHT_MARKET_OPERATIONS_UPGRADE.sql`](./supabase/MIDNIGHT_MARKET_OPERATIONS_UPGRADE.sql), [`supabase/MIDNIGHT_MARKET_ADMIN_CONTROL_UPGRADE.sql`](./supabase/MIDNIGHT_MARKET_ADMIN_CONTROL_UPGRADE.sql), [`supabase/MIDNIGHT_MARKET_AVAILABILITY_MIGRATION.sql`](./supabase/MIDNIGHT_MARKET_AVAILABILITY_MIGRATION.sql), and [`supabase/MIDNIGHT_MARKET_CUSTOMER_SAFETY_MIGRATION.sql`](./supabase/MIDNIGHT_MARKET_CUSTOMER_SAFETY_MIGRATION.sql), in that order. These enable editable/resubmittable product listings, category details and media, customer order requests, verified seller contacts, audited Online Bar moderation, explicit available-now/planned/made-to-order states, and audited customer listing reports. Planned and made-to-order products collect interest only and cannot create order requests or take payment.

For first-party session replay shared with Online Bar and the Waitlist, also run Online Bar's [`SESSION_REPLAYS_MIGRATION.sql`](../ohhh-now-picture-this-to-those-who-refer/supabase/SESSION_REPLAYS_MIGRATION.sql) once in this same Supabase project. Replay is opt-in and playback is available in Online Bar Admin; no PostHog account or additional environment variables are needed.

## Central control and data flow

The Halloween Market Desk remains in the Online Bar admin app at `/admin/market` (published in the Online Bar feature branch). Both apps use the same Supabase project and `mm_*` schema: seller applications, approvals, product moderation, campaign publishing, offer review, and suspension actions made in the Desk are reflected in this standalone app. Keep the Supabase URL and project the same in both deployments.

The standalone repository intentionally does not copy the Online Bar admin session, admin APIs, or unrelated waitlist/customer code. Do not expose the service-role key to the browser; only server routes use it. Seller identities still live in the shared Supabase Auth directory, with a separate seller portal and browser storage key rather than a separate Supabase Auth project.

Customer order requests are not paid checkout: the boutique must confirm stock, contact the customer to arrange payment and delivery, and manually record when payment is received. Stock is reserved when the boutique confirms and deducted when marked fulfilled. The Market does not collect money or automatically notify buyers; online payments, sales analytics, payouts and refunds still need a payment integration. Price-offer agreements remain separate from order requests. See [`supabase/MIDNIGHT_MARKET_SETUP.md`](./supabase/MIDNIGHT_MARKET_SETUP.md) for deployment requirements.
