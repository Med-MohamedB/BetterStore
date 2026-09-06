/* ==========================================================================
   Stats — reports a handful of ANONYMOUS, AGGREGATE numbers to Firestore
   so the admin panel can show totals across every install (total sales
   made, total products/customers/suppliers currently entered, active
   installs, and some coarse breakdowns like theme/app version/ad mode).

   What this deliberately does NOT do:
     - No shop name, no customer data, no product names, no individual
       sale amounts, no revenue figures, ever.
     - No per-shop breakdown is ever shown anywhere — the admin panel only
       ever displays combined sums across all devices.
     - Uses a random ID generated on-device (crypto.randomUUID, nothing
       derived from any real identifier) purely so a device can update
       its OWN previous numbers instead of creating endless duplicate
       rows forever.

   Performance, since this runs for every user of the app:
     - Fires at most once per 12 hours per device (checked before doing
       any work at all).
     - Runs long after boot has already finished rendering (see the
       setTimeout delay where this is called from app.js) — never blocks
       anything the user is looking at.
     - Plain fetch() straight to Firestore's REST API — no Firebase SDK
       is bundled into the app, so this costs nothing on every OTHER page
       load/action, only the rare moment this actually runs.
     - Entirely fire-and-forget: any failure (offline, Firestore down,
       whatever) is swallowed silently and just tries again next time.
   ========================================================================== */

const Stats = (() => {
  const PROJECT_ID = 'betterstore-cd4b5';
  const REPORT_EVERY_MS = 12 * 60 * 60 * 1000; // 12 hours
  const DEVICE_ID_KEY = 'sa_stats_device_id';
  const LAST_REPORT_KEY = 'sa_stats_last_report';
  const SALES_RATCHET_KEY = 'sa_stats_sales_ratchet';

  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  function dueForReport() {
    const last = parseInt(localStorage.getItem(LAST_REPORT_KEY), 10) || 0;
    return Date.now() - last > REPORT_EVERY_MS;
  }

  /** "Total sales made" should never go DOWN even if someone clears old
   *  sales history locally later — so this tracks a high-water mark
   *  instead of reporting the live count directly. */
  function ratchet(key, liveValue) {
    const stored = parseInt(localStorage.getItem(key), 10) || 0;
    const next = Math.max(stored, liveValue);
    localStorage.setItem(key, String(next));
    return next;
  }

  function firestoreValue(v) {
    if (typeof v === 'number') return { integerValue: String(Math.round(v)) };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    return { stringValue: String(v) };
  }

  async function gatherPayload() {
    const [salesLive, productsCount, customersCount, suppliersCount] = await Promise.all([
      DB.count('sales').catch(() => 0),
      DB.count('products').catch(() => 0),
      DB.count('customers').catch(() => 0),
      DB.count('suppliers').catch(() => 0),
    ]);
    const salesCount = ratchet(SALES_RATCHET_KEY, salesLive);

    let theme = 'unknown';
    let currency = 'unknown';
    try {
      const appearance = await Settings.get('appearance');
      theme = appearance.themePack || 'unknown';
      const store = await Settings.get('store');
      currency = store.currency || 'unknown';
    } catch (e) { /* best-effort only */ }

    let adMode = 'unknown';
    try {
      if (window.ShopPromo && ShopPromo.getDebugInfo) adMode = ShopPromo.getDebugInfo().adMode || 'unknown';
    } catch (e) { /* best-effort only */ }

    return {
      salesCount,
      productsCount,
      customersCount,
      suppliersCount,
      lastSeen: new Date(),
      appVersion: window.CURRENT_VERSION || 'unknown',
      theme,
      currency,
      adMode,
    };
  }

  async function reportIfDue() {
    try {
      if (!dueForReport()) return;
      if (!window.fetch) return;
      const payload = await gatherPayload();
      const fields = {};
      for (const [k, v] of Object.entries(payload)) fields[k] = firestoreValue(v);

      const deviceId = getDeviceId();
      const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/deviceStats/${deviceId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (res.ok) localStorage.setItem(LAST_REPORT_KEY, String(Date.now()));
    } catch (e) {
      // Offline, Firestore hiccup, whatever — just try again next time.
    }
  }

  return { reportIfDue };
})();
window.Stats = Stats;
