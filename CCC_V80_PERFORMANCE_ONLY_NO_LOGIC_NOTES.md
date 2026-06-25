# CCC V80 Performance-only Patch

This patch is based on `RESTORE_ORIGINAL_AS_UPLOADED_SITE.zip`.

Scope:
- No dashboard calculation logic changed.
- No B Item calculation/API logic changed.
- No SQL changes.
- No DB reset.
- No Selenium/workflow changes.

Changes:
1. `dashboard_data.js` is fetched through `/api/dashboard-data`, a Cloudflare Pages Function that returns the exact same GitHub raw JS content with a short 60-second Cloudflare cache.
2. First paint uses the latest saved IndexedDB snapshot immediately, then refreshes from the latest JS source in the background.
3. XLSX library load is deferred so it does not block the dashboard boot.
4. Punch page no longer clears `PUNCH_FAST_CACHE` on every render; the cache is still cleared when filters/data change.
5. The repeated `hardRoute` interval that repainted the page every 2.5 seconds is disabled; one-shot route fixes remain.

Files to upload:
- `dashboard.html`
- `functions/api/dashboard-data.js`

Do not upload SQL. Do not reset DB. Do not change Selenium.
