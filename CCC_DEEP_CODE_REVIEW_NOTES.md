# CCC Testpack Dashboard — Deep Code Review Notes

## Root causes found

1. `dashboard.html` is not a clean physical dashboard page. It still contains the old portal, dashboard tabs, embedded B Item Control markup, and many stacked patch scripts.
2. `bitem-monitoring.html` is not a clean monitoring page. It still carries a near-complete copy of the old dashboard and uses `#/monitoring` internally.
3. The script block `mp-v4-shape-hard-fix-js` was the most dangerous part: it called `hardRoute()` several times after load and then kept running with `setInterval(hardRoute, 2500)`. That means the page was continuously changing route state and touching DOM while the user was filtering or changing tabs.
4. Menu links still used legacy hash routes (`/dashboard.html#/dashboard`, `/bitem.html#/bitem`, `/bitem-monitoring.html#/monitoring`), so the site was half physical pages and half old SPA.
5. `dashboard.html` included the old B Item Control table section. This is exactly the “pages riding on each other” problem.
6. Dashboard scripts still had old B Item table code paths. The dashboard should call KPI/stage aggregate endpoints only, not the heavy table endpoint.

## Changes in this package

- Keeps the existing visual dashboard shape instead of replacing it with a new skeleton.
- Keeps the old V12 internal view controller only where it is still needed to display the correct physical page view.
- Disables `mp-v4-shape-hard-fix-js` repeated route/DOM loop.
- Changes portal menu links to real `.html` pages.
- Removes embedded B Item Control markup from `dashboard.html`; B Item Control now belongs to `/bitem.html` only.
- Adds a safety guard so the dashboard page cannot accidentally request the heavy B Item table state endpoint.

## Files changed

- `dashboard.html`
- `bitem-monitoring.html`
- `assets/portal.js`
- `CCC_DEEP_CODE_REVIEW_NOTES.md`

## What is intentionally not changed

- Selenium workflow
- Excel refresh workflow
- `dashboard_data.js` generation workflow
- Supabase/D1 B Item sync logic
- User management functions

## Next cleanup after testing this patch

The next correct step is to extract the remaining dashboard render functions into dedicated JS files and stop embedding a 500KB dashboard file in every page. This patch removes the biggest current cause of route fighting and page overlap first, without redesigning the UI again.
