# Store App — Stage 1: Architecture

Files in this stage:

```
/store-app
  index.html          - app shell (topbar, view container, bottom nav)
  style.css            - full design system + component styles
  db.js                 - IndexedDB abstraction layer (all storage goes through this)
  app.js                - router, theming, formatting helpers, dashboard view
  manifest.json          - PWA install config
  service-worker.js       - offline app-shell caching
  /icons                  - app icons (192 / 512, regular + maskable)
```

## What works right now

- Bottom navigation between Dashboard / Products / POS / Inventory / More,
  with a sliding pill indicator under the active tab
- **Swipe left/right anywhere on a screen** to move between Dashboard →
  Products → POS → Inventory (matches the bottom nav order)
- **Pull down from the top of any screen** to refresh it
- Dashboard reads real data from IndexedDB: today's sales, revenue, product
  count, low stock, inventory value, recent sales
- Full Product Management: add/edit/duplicate/delete, camera or gallery
  photo capture, search, category filter chips, sort, stock adjustment
  (logged to inventory history), real scannable Code 39 barcode
  generation/printing/sharing, and a Manage Categories screen
  (rename/delete with safe reassignment, never orphaning products)
  - **Swipe a product row left** to reveal quick Edit/Delete
  - Tap a row to open its full detail sheet
- Barcode Scanner: native `BarcodeDetector` API where the browser supports
  it, falling back automatically to a bundled ZXing scanner (shipped
  locally in `vendor/zxing.min.js` — no CDN, works fully offline) on
  browsers that don't. Scanning a known barcode adds it straight to the
  POS cart; an unknown barcode offers "Create Product" with the barcode
  pre-filled. Torch/flashlight support depends on the browser/device —
  unsupported entirely on iOS Safari
- POS / Checkout: cart with swipe-to-remove and quantity steppers, scan-to-add
  or search-to-add, per-item and total discounts, tax (from Settings),
  cash/card/bank transfer/other payment methods with automatic change
  calculation, sale completion that decrements stock and logs inventory
  history, and a printable/shareable receipt. Prices are copied onto the
  sale at checkout time, so editing a product's price later never changes
  past sales
- Dark/light theme system (currently dark by default; Settings screen to
  change it comes in a later stage)
- Every other route shows a "coming in a later stage" placeholder so
  navigation is fully clickable already
- Motion & gestures throughout: animated route transitions, tap ripple on
  every button/row, draggable bottom sheets (drag the handle down to
  dismiss), toast confirmations — all respecting
  `prefers-reduced-motion`
- Offline app-shell caching via the service worker
- Installable as a PWA

## How to test on your Android phone (no computer needed)

You need a way to serve these files over `http://` or `https://` — opening
`index.html` directly via `file://` will NOT work, because IndexedDB,
service workers, and manifest installability all require a proper origin.

**Recommended: a mobile code editor with built-in local server.**

1. Install an app like **Acode** or **Code Editor** (both free, on the Play
   Store) — they can open a folder and serve it on `localhost` with one tap.
2. Put the `store-app` folder somewhere the app can see it (its own storage,
   or a folder you pick via the system file picker).
3. In the editor, open the folder and use its "Run" / "Preview" / "Live
   Server" button. It will give you a `http://localhost:PORT` address.
4. Open that address in **Chrome** on the same phone.
5. Tap the Chrome menu (⋮) → **"Add to Home screen"** / **"Install app"**.
   Chrome will only offer this once it's confirmed the manifest + service
   worker are valid — if you don't see it, wait a few seconds and reload.
6. Open the installed icon from your home screen — it should launch full
   screen, no browser bar, and work if you turn on airplane mode.

**Alternative: GitHub + a static host, still entirely from your phone.**

1. Use the GitHub app (or mobile browser) to create a repo and upload the
   `store-app` files.
2. Connect the repo to a free static host (GitHub Pages, Cloudflare Pages,
   Netlify) — all of these can be set up from a phone browser and auto-serve
   over `https://`, which also satisfies the service-worker requirement.
3. Open the resulting `https://...` URL in Chrome and install it the same
   way as above.

## Status

All stages from the original build plan are complete: IndexedDB,
Product Management, Barcode Scanner, POS/Checkout, Inventory, Sales
History, Reports, Customers, Suppliers, Backup & Restore, and Settings
(including a real PIN lock and biometric unlock). The "More" menu ties
everything into actual navigation. A full production audit was then
performed against the original spec — see `audit-report.md` for the
complete findings; the highlights: a critical historical-profit
calculation bug was fixed, sale completion and refunds were made atomic
(one IndexedDB transaction instead of several), a camera resource leak
was fixed, backup import now validates data before touching the
database, and category management (create/rename/delete) was completed
as a real feature rather than just free text. The app is ready to
install and test on your phone per the instructions above.

Fixed after initial completion:
- Receipt printing now uses a dedicated top-level `#printArea` element
  instead of printing content nested inside a Sheet — the Sheet's own
  fixed positioning and `overflow:auto` were clipping receipts and
  shifting them down the page instead of letting them paginate across
  multiple pages, which they now do correctly.
- Added biometric unlock (Face ID / Touch ID / Android fingerprint) via
  WebAuthn's platform authenticator, offered automatically on the lock
  screen with PIN as the fallback. Requires PIN lock to already be
  enabled and the platform to support it.
- The store's name and logo now appear in the app (Dashboard topbar) and
  in the browser tab/install-prompt icon where the platform allows
  updating it after page load.
- Full production audit (see `audit-report.md`): historical profit now
  uses the purchase price frozen at time of sale rather than the
  product's current cost; sale completion and refunds are now atomic;
  double-tapping "Complete Sale" or "Refund" can no longer create
  duplicates; backup import validates structure before writing anything;
  the scanner's camera no longer keeps running after leaving the screen
  by any means other than Cancel; product save now rejects negative
  values and duplicate barcodes; CSV exports include a UTF-8 BOM so
  non-Latin text (Arabic, etc.) renders correctly in Excel; receipts show
  each item's unit price, not just the line total; category management
  (rename/delete with safe reassignment) is now a real feature.

Possible future polish (not part of the original spec, only if wanted):
further receipt-printing refinements for specific thermal printer models,
a native APK wrapper if you ever want to distribute outside the PWA
install flow, and the performance/accessibility items noted as untested
in `audit-report.md` (large-dataset virtualization, stronger focus rings).

## Browser Compatibility

Built and tested against modern Chrome on Android, which is the
recommended browser for this app. Notes on other browsers:
- **iOS Safari**: works, but the flashlight/torch control is entirely
  unsupported (no web API for it exists on iOS) and PWA install works
  differently (Share → Add to Home Screen instead of an install prompt).
- **Firefox for Android**: the native `BarcodeDetector` API isn't
  supported, so the scanner automatically falls back to the bundled
  ZXing scanner — slightly slower but fully functional.
- Biometric unlock requires a browser with WebAuthn platform-authenticator
  support (Chrome, Safari, Edge on supporting hardware) — the toggle is
  hidden in Settings if unsupported.

## Deployment as a Static Web App

Every file in this project is static (HTML/CSS/JS + the bundled ZXing
library and icons) — there is no build step and nothing to compile. To
deploy anywhere that serves static files (GitHub Pages, Cloudflare Pages,
Netlify, or any plain web host):
1. Upload the entire `store-app` folder as-is, preserving the folder
   structure (especially `vendor/` and `icons/`).
2. Make sure the host serves it over `https://` — camera access and full
   PWA install both require a secure origin (`localhost` also works for
   local testing).
3. No environment variables, no server-side config, no database
   connection strings — there is nothing to configure.

## Design

The app now uses the "Neon Orchid" palette: near-black charcoal
background (#29262B), vivid orchid accent (#AC5FDB), soft lilac highlight
(#E3A2EE) — every color token in the app is derived from these four, with
zero leftover colors from earlier palette iterations (verified with a
full-codebase grep). Danger/success signals stay within the same violet
family (a rose-red and a lilac) rather than switching to off-palette
red/green, so the whole app reads as one coherent surface while still
staying visually distinct from the primary accent.

Liquid glass is pushed further toward Apple's treatment: every card,
list row, sheet, and the nav/top bars share a single glass recipe
(`--glass-blur` / `--glass-sat` / `--glass-sheen`) — strong blur+saturate,
a bright top hairline, a soft dark bottom edge for concavity, and a faint
diagonal sheen, rather than flat translucent panels.

Navigation is unified end to end: a shared `ROUTE_ORDER` in the router
auto-computes a slide direction for every screen change — tapping a tab,
following a link from the More menu, going back — not just swipe
gestures, so the whole app now feels like one continuous strip of pages
rather than isolated screens.

One implementation note carried forward from the FAB-clipping bug: never
put `backdrop-filter` directly on an element that has absolutely-positioned
children meant to overflow its box (like the floating POS button) — it
clips them in several browsers/webviews even with no `overflow: hidden`
set. The bottom nav's blur lives on a separate `::before` layer behind the
nav content specifically because of this.

Two more notes worth keeping in mind for future stages:
- Native emoji (⚠️🏅📦 etc.) render in the OS's own fixed colors no matter
  what the app theme is. They're left as-is (their natural color) per
  explicit instruction — don't add a neutralizing filter to icon
  containers again without checking first.
- Backdrop-filter blur is genuinely expensive to recomposite during a live
  drag when there are many blurred glass surfaces on screen — it's
  dropped app-wide via a `body.swipe-active` class for the duration of an
  active swipe and restored on release. Keep this in mind if new glass
  surfaces are added to a screen that also supports swipe navigation.
- **Theme colors have two sources of truth that must both be updated
  together**: the CSS tokens in `style.css`, AND
  `DEFAULT_SETTINGS.appearance.accentColor` in `db.js` — the latter gets
  applied as an inline style override on `--accent` by `applyTheme()` in
  `app.js` on every boot, so a stale value there silently overrides any
  CSS palette work. Sweep both whenever the palette changes, and remember
  the `store-app-preview.html` wrapper has its own hardcoded banner
  separate from the real app files.
- `#view` needs `touch-action: pan-y` for swipe navigation to feel
  immediate — without it the browser adds a scroll-disambiguation delay
  before horizontal touch events reach JS at all.
- Printed content (receipts) must go through the top-level `#printArea`
  div (via the shared `printReceiptHTML()` helper in app.js), never
  printed directly from inside a Sheet — a Sheet's fixed positioning and
  `overflow:auto` break both the print page's positioning and its ability
  to paginate across multiple pages.
- Biometric unlock (`Security.registerBiometric()` /
  `verifyBiometric()` in settings.js) uses WebAuthn's platform
  authenticator with no backend — it verifies the device's own Face
  ID/Touch ID/fingerprint succeeded, which is the right model for a fully
  local/offline app, but means it gates access to this device's data
  rather than proving identity to a server. It requires a PIN to already
  be set as a fallback, and won't work inside a sandboxed preview/iframe
  — only on an actually-installed, real-origin PWA.

## A note on the camera scanner and flashlight

Camera access requires a real `https://` (or `localhost`) origin with
camera permission granted — it will not work through `file://` or inside
a sandboxed preview. Test it after installing the app on your phone as
described above.

Flashlight/torch control over the web is inherently browser- and
device-dependent: it's unsupported entirely on iOS Safari (no web API for
it exists), and support on Android varies by browser and camera hardware.
The scanner tries the standard method first, then a secondary fallback,
and clearly tells you via a toast if neither works on your device rather
than silently doing nothing.
