# Midnight Market deployment

Midnight Market uses its own `mm_*` data tables and private `midnight-market` storage bucket in the existing Supabase project. The migration is additive; it does not reuse the waitlist, ordinary merchant, or ordinary product/order tables.

The standalone storefront and seller studio live in the `Davi-d-M/Halloween` repository. Central moderation remains in the Online Bar Halloween Market Desk at `/admin/market`; both deployments must use the same Supabase project for application reviews, product moderation, campaign publishing, merchant access, and price offers to stay synchronized. The Online Bar project contains the admin-only routes and authorization and should not be copied into this standalone app.

## Database and environment

1. Apply [`MIDNIGHT_MARKET_FOUNDATION.sql`](./MIDNIGHT_MARKET_FOUNDATION.sql) to the Supabase project used by the website.
2. Apply [`MIDNIGHT_MARKET_STUDIO_UPGRADE.sql`](./MIDNIGHT_MARKET_STUDIO_UPGRADE.sql) after the foundation. It adds merchant product editing and resubmission, category details, sale pricing, multi-photo and optional video listings, and admin rejection notes. The private storage bucket is configured to accept supported media types with a 10 MB maximum object size.
3. Apply [`MIDNIGHT_MARKET_ORDERS_UPGRADE.sql`](./MIDNIGHT_MARKET_ORDERS_UPGRADE.sql) after the Studio upgrade. It adds customer order requests and merchant fulfilment status. Requests are unpaid; a merchant confirms stock, then contacts the buyer to arrange payment and delivery. The merchant manually records payment received before fulfilment. Confirmation reserves stock and marking fulfilled deducts it.
4. Apply [`MIDNIGHT_MARKET_OPERATIONS_UPGRADE.sql`](./MIDNIGHT_MARKET_OPERATIONS_UPGRADE.sql) after the Orders upgrade. It stores verified seller contact details on approved boutiques so the Online Bar Market Desk can coordinate offers and order requests.
5. Apply [`MIDNIGHT_MARKET_ADMIN_CONTROL_UPGRADE.sql`](./MIDNIGHT_MARKET_ADMIN_CONTROL_UPGRADE.sql) after the Operations upgrade. It enables audited Online Bar actions to hide/restore any product listing and intervene in order fulfilment while maintaining stock reservations.
6. Apply [`MIDNIGHT_MARKET_AVAILABILITY_MIGRATION.sql`](./MIDNIGHT_MARKET_AVAILABILITY_MIGRATION.sql) last. It adds available-now, planned, and made-to-order states; planned and made-to-order listings collect enquiries only, and a database trigger rejects order requests for those states.
7. Configure `NEXT_PUBLIC_SUPABASE_URL`, a public Supabase key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and `SUPABASE_SERVICE_ROLE_KEY` in both deployments. Keep the service-role key server-only.
8. Configure Supabase Auth email confirmation and an SMS provider before enabling seller applications. Seller approval in Halloween Market Desk remains blocked until the applicant verifies the matching email and phone.
9. Add the standalone site's `/merchant/portal/login` callback to Supabase Auth's allowed redirect URLs.
10. Configure `RESEND_API_KEY` only if the deployment wants email notifications; current offer and order-request flows do not send automatic emails.

## Account and offer boundaries

Seller sign-in has its own pages and browser storage key, and seller access is separately gated by an approved `mm_merchant_memberships` record. Supabase Auth still stores seller and customer identities in the same project's `auth.users`; a separate storage key does not create a separate Auth directory. Do not represent it as a separate user database.

Price-offer acceptances are non-binding price agreements and do not create orders. Order requests are separate buyer requests; a merchant-entered paid status records offline payment only and is not independently verified by the Market. There is no online checkout, payment collection, automatic buyer notification, payout or refund processing. Buyers can revisit an offer in the same browser session, and the boutique can contact an order requester using the details provided.

Planned listings require zero stock and can include an estimated availability date. Customers may send an interest enquiry; the merchant sees those enquiries in Merchant Studio. An interest enquiry is not a reservation, preorder, or paid order.
