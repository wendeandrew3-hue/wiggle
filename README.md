# Whisker & Wag

Cat and dog toy store. Same stack as GadgetGrub:
- Node.js + Express, no database (data/users.json file storage)
- Accounts: signup, login, logout (scrypt-hashed passwords, signed cookie sessions)
- Cart in localStorage (ww-cart)
- Checkout: order summary, shipping, card form. Card number and CVC never leave
  the browser; only brand + last4 + expiry are sent to the server (same two-wall
  masking as GadgetGrub). Orders show in the admin panel.
- Admin panel: /admin.html, default password wag-admin (override with
  ADMIN_PASSWORD env var). Set SESSION_SECRET in production.

## Deploy on Render
1. Push these files to a GitHub repo (root of the repo, no subfolder).
2. New Web Service -> pick the repo -> Runtime: Node -> Build: npm install ->
   Start: node server.js
3. Add environment variables: SESSION_SECRET (any long random string),
   ADMIN_PASSWORD (your admin password).
4. Free tier note: data/users.json resets when the server restarts.

No payment processor yet: customers get "Order received" plus a reference, and
you contact them to arrange payment. Stripe mounts on /api/checkout later.
