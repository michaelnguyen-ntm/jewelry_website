# Aurelle — demo jewelry store

A small storefront: static pages in `public/`, an Express API in `lib/`, sample products in `lib/products.js`.

## Run locally

```bash
npm install
npm start        # http://localhost:3000
```

## Deploy to Vercel

Import the folder (or run `vercel`). No build settings are needed: `public/` is served as the site and
`api/index.js` runs the Express API as a serverless function (`vercel.json` wires this up).

Set these in **Project → Settings → Environment Variables**:

| Variable | Why |
| --- | --- |
| `JWT_SECRET` | Signs login sessions. Use a long random string. Without it a public default is used. |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Added automatically when you connect an **Upstash Redis** store from the Vercel Marketplace. Without them, accounts and orders live in memory only and are lost whenever the serverless function restarts. |

## Good to know

- The bag is stored in the browser (`localStorage`); the server recalculates all prices at checkout.
- Checkout is a demo: card fields are never sent to the server and no payment is taken.
- Product pictures are generated SVG illustrations. Add an `image` field to a product in
  `lib/products.js` to use a real photo instead.

## Insider Web SDK

Every page defines `window.InsiderQueue` and loads `ins.js` in its `<head>`. The data pushes live in the
"Insider (Web SDK)" section of `public/js/app.js`: user, currency and cart, then the page type, then `init`
on each page view, plus `add_to_cart` / `remove_from_cart` whenever the bag changes.
