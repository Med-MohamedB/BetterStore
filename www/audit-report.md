# Store App — Production Audit Report

**Method note, read first:** This audit was performed by reading and
reasoning through the actual source of all 12 application files line by
line — grepping for known bug patterns, tracing data flow through every
critical operation (sale completion, refund, backup import), and fixing
what was found. It was **not** performed by running the app in a live
Android browser or on real hardware, because this environment has no
phone, no camera, and no way to install a PWA. Every item below is
labeled honestly as either "verified by code review," "fixed," or
"cannot be verified from this environment" — nothing here claims a test
that wasn't actually possible.

## Summary

The application was already feature-complete against the original 30-section
build spec before this audit. This pass found and fixed **one critical
data-integrity bug**, **two real atomicity gaps**, **one resource-leak
bug**, **several validation gaps**, and closed **one genuine feature gap**
(category management) that existed only partially. No functionality was
removed or replaced with placeholders. The app remains fully client-side,
offline-first, and dependency-free (aside from the bundled offline ZXing
fallback).

## Issues Found and Fixed

### 1. CRITICAL — Historical profit used current cost, not sale-time cost
- **Where:** `reports.js`, profit/COGS calculation
- **Problem:** Estimated profit and cost-of-goods were computed using each
  product's *current* `purchasePrice`, looked up live from the products
  store. Changing a product's cost today would retroactively change
  yesterday's — or last month's — profit report.
- **Root cause:** Sale records never froze the purchase price at checkout
  time; only the selling price was frozen.
- **Fix:** `pos.js`'s `completeSale()` now reads and freezes each item's
  `purchasePrice` onto the sale record at the moment of sale, exactly like
  the selling price already was. `reports.js` now reads that frozen value,
  falling back to the live product cost only for sales recorded before
  this fix existed (which have no way to recover their true historical
  cost).

### 2. Sale completion and refunds were not atomic
- **Where:** `pos.js` (`completeSale`), `sales.js` (`refundSale`)
- **Problem:** Each sale touched three stores (sales, products,
  inventoryLog) via separate, independent IndexedDB transactions. A
  failure partway through — a full disk, a browser crash, a tab closing
  mid-operation — could leave a sale recorded with stock never
  decremented, or vice versa. Same risk applied to refunds.
- **Fix:** Both now run inside a single IndexedDB transaction spanning all
  three stores (`DB.runTx`), so the sale record, every stock update, and
  every log entry either all commit together or all roll back together.
  `db.js`'s `runTx` helper was extended to support async work functions
  and to abort the transaction cleanly on error.
- **Honesty note:** This pattern (sequential awaited IndexedDB requests
  within one transaction) is well-established and used by widely-adopted
  libraries, but it was verified by code review only — I could not run it
  against a live IndexedDB engine from this environment. **This should be
  the first thing tested on a real device**, specifically: complete a
  sale, then immediately check Inventory and Sales History both updated.

### 3. Double-tap could create duplicate sales/refunds
- **Where:** `pos.js` ("Complete Sale" button), `sales.js` ("Refund This
  Sale" button)
- **Problem:** Neither button was disabled during its async operation, so
  a fast double-tap (very plausible on a touchscreen) could fire the
  handler twice, creating two sale records or attempting two refunds.
- **Fix:** Both buttons now disable themselves and show a loading label
  immediately on click, re-enabling only if the operation actually fails.

### 4. Backup import had no defense against malformed data
- **Where:** `backup.js`, `importBackup()`
- **Problem:** The import loop assumed every field in the uploaded JSON
  was the correct type. A hand-edited or corrupted backup (e.g. a store's
  data being a string instead of an array) would throw partway through
  the clear-and-repopulate loop, potentially leaving the database
  half-cleared with no error shown to the user.
- **Fix:** Full structural validation now runs *before* anything is
  touched — every store's data must be an array (or absent) and settings
  must be a plain object (or absent), or the import is rejected outright
  with a clear message. The actual import now also runs inside one atomic
  transaction, so a failure partway through cannot leave a half-restored
  database. Individual malformed records within an otherwise-valid array
  are skipped rather than aborting the whole import — documented here
  rather than silently assumed, per the instruction not to silently drop
  data.

### 5. Camera could keep running after leaving the scanner
- **Where:** `scanner.js`
- **Problem:** The scanner's full-screen overlay is appended directly to
  `<body>`, outside the router's own view. Leaving the scanner screen by
  anything other than tapping Cancel — a bottom-nav tap, a swipe gesture,
  the browser back button — did not stop the camera stream, since the
  router swapping content underneath the overlay doesn't know the overlay
  exists.
- **Fix:** Added a global `hashchange` listener that force-closes any
  active scanner overlay (and stops its camera stream) on any navigation,
  regardless of how it happened.

### 6. Validation gaps
- Product save now rejects negative prices/stock and blocks saving a
  barcode that's already used by a different product (checked against the
  barcode index, excluding the product's own record on edit).
- Settings now clamp tax percentage to 0–100 and minimum stock to ≥0
  instead of silently accepting negative values.
- Added `min="0"` to the relevant number inputs for the on-screen spinner
  controls.

### 7. CSV export would mangle non-Latin text in Excel
- **Where:** `backup.js`
- **Problem:** CSV files were written without a UTF-8 byte-order-mark.
  Excel (particularly on Windows) defaults to a different encoding
  without one, showing Arabic or other non-Latin product/customer names
  as mojibake even though the underlying data was correct UTF-8.
- **Fix:** Both CSV exports now prepend a UTF-8 BOM. Other spreadsheet
  applications ignore it harmlessly.

### 8. Receipts didn't show individual item prices
- **Where:** `pos.js`, `sales.js` receipt templates
- **Problem:** Receipts showed each line's total but not the unit price,
  which the spec explicitly lists as a required field distinct from the
  line total.
- **Fix:** Each line now shows `qty × name @ unit price` alongside the
  line total, plus a breakout of any item-level discount.

### 9. Category management existed only as free text, not as a feature
- **Where:** `products.js`
- **Problem:** The spec calls for creating, renaming, and deleting
  categories as first-class actions with safe handling of products still
  assigned to a deleted category. Previously, categories were just a free
  text field on each product with no dedicated management screen.
- **Fix:** Added a "Manage Categories" screen (🏷️ icon in the Products
  top bar) showing every category with its live product count. **Rename**
  bulk-updates every product using that category. **Delete** safely
  reassigns affected products to "Uncategorized" rather than deleting or
  orphaning them, exactly as the spec requires. "Create" is handled
  honestly: since categories only exist as strings on products (an
  intentional, low-complexity design choice made earlier in the build),
  there's no separate category record to create in isolation — the UI
  says so plainly rather than faking a create action that would do
  nothing.

## Reviewed and found correct (no changes needed)

- **HTML injection safety:** Every user-entered string (product, customer,
  supplier, category names; descriptions; notes) that lands in `innerHTML`
  anywhere in the app goes through `escapeHTML()` first — verified by
  grepping every interpolation of a `.name`/`.notes`/`.description` field
  across all 12 files. The few unescaped instances found are all inside
  `confirm()`, `Toast` messages, or `navigator.share()` text, none of
  which parse HTML, so there is no injection path.
- **Historical price on receipts:** Selling price was already correctly
  frozen onto sale items at checkout time before this audit — confirmed
  by tracing `completeSale()` and the receipt templates. A later price
  change on the product does not alter a past receipt.
- **Double-refund guard:** The refund button is already conditionally
  hidden once a sale's status is `'refunded'`, preventing a double-refund
  through the UI.
- **Refund audit trail:** Refunding a sale flips its `status` field and
  records a `refundedAt` timestamp rather than deleting the original
  record — the sale stays visible and auditable in Sales History, marked
  distinctly.
- **CSV escaping:** Values containing commas, quotes, or newlines are
  already correctly quoted and escaped in both CSV exports.
- **Search performance:** Product/customer/supplier search filters an
  already-loaded in-memory array with a single `.filter()` pass per
  keystroke — no nested loops or repeated DB round-trips. This should
  hold up reasonably at the sizes a single small store would realistically
  reach, though see the Performance section below for what could not be
  verified.

## Data Integrity Testing

Performed by tracing code paths, not by executing them:
- Traced the full lifecycle of a sale from cart → checkout → sale record →
  stock decrement → inventory log, confirming the data written at each
  step and that prices are frozen correctly (see fixes #1 and #2 above).
- Traced the refund lifecycle the same way (fix #2, "reviewed and found
  correct" note on the audit trail).
- Traced product edit/delete/duplicate for ID stability — edits reuse the
  existing `id` via `DB.put`, duplicates explicitly delete `id` before
  `DB.add` so a new one is generated, deletes remove the exact record by
  key. No path that could create an accidental duplicate was found.
- Traced backup export → import round-trip logic, including the new
  validation (fix #4).

**Not verified:** actually running these flows in a browser against a
live IndexedDB instance, closing/reopening the app, or testing under
real concurrent access. The atomicity fixes in particular (#2) are sound
by IndexedDB specification but unverified in a running browser from here.

## Barcode / Camera Testing

**Not verified — no camera or Android device available in this
environment.** What can be said from code review:
- The scanner correctly tries the native `BarcodeDetector` API first and
  falls back to the bundled ZXing library if unavailable, entirely
  offline (ZXing is bundled locally, not loaded from a CDN).
- A detection is debounced for 1.5 seconds per unique code to avoid one
  physical scan registering multiple times.
- Camera access requires a real `https://` or `localhost` origin — it
  will not work over plain `http://` or inside a sandboxed preview, which
  is a genuine browser-security limitation, not an app bug.
- Torch/flashlight support is inherently inconsistent across
  browsers/devices and is unsupported entirely on iOS Safari; the app
  detects this and reports it via a toast rather than failing silently
  (this was fixed and discussed at length earlier in this project).
- Fixed in this pass: the camera no longer keeps running after leaving
  the scanner screen by any means other than the Cancel button (#5).

**This entire section needs real-device verification** — it is the
single feature most dependent on hardware and browser capability this
environment cannot provide.

## Responsive Testing

**Not verified on actual devices.** The CSS uses mobile-first fixed units
appropriate for phone screens, a `max-width: 640px` container that caps
growth on larger screens, and `touch-action` rules tuned for phone touch
gestures. Tablet and desktop layouts were not specifically designed or
tested — the spec's stated primary target is Android phones, and the app
was built accordingly. If tablet/desktop use turns out to matter, that
would be a follow-up design pass, not a bug fix.

## Offline Testing

**Not verified with an actual airplane-mode device.** By code review: no
part of the application's core functionality makes a network request.
The only network-dependent piece is registering the service worker on
first load (standard for any PWA) and the initial page load itself —
after that, IndexedDB and the cached app shell are used exclusively. The
bundled ZXing fallback and all icons are local files, not CDN-loaded.

## Performance Testing

**Not tested with a large dataset** — there is no way to generate and
interact with 1,000+ realistic products in this environment. By code
review: product/customer/supplier lists render as flat arrays filtered
in-memory, which is appropriate for the hundreds-of-products range a
single small store would have, but was not benchmarked at the 1,000+
scale the audit brief specifies. If that scale turns out to matter in
practice, likely next steps would be virtualizing long lists (rendering
only visible rows) rather than rendering the full filtered array into the
DOM at once.

## Remaining Known Limitations

Being direct about what this pass did not attempt to fix:
- **No real-device testing was performed at all** — everything above
  labeled "not verified" is a genuine gap, not an oversight being hidden.
- Focus states on text inputs use a border-color change rather than a
  dedicated focus ring — visible and functional, but not a strict
  accessibility-best-practice indicator.
- Large-dataset (1,000+ product) performance is unverified and unoptimized
  beyond what naturally falls out of the existing architecture.
- Tablet/desktop layouts are not a designed target, per the spec's own
  mobile-first Android focus.
- Biometric unlock (WebAuthn) cannot function inside any sandboxed
  preview and was not tested against real platform authenticator
  hardware — only verified by code review against the WebAuthn spec.
