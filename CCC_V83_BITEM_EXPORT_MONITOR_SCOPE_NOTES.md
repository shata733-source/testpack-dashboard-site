# CCC V83 — B Item Export + Monitor UX + Scope Diagnostic

## What changed

### 1) B Item Control export
- `Export B Item` now exports all rows matching the current filters.
- It fetches pages from `/api/bitem/page` in batches instead of exporting only `STATE.rows` / the current 100 rows.

### 2) B Item Control scope display
- The Scope column now uses the Reinstatement B Item rule for display/export:
  - TP outside the 429 Reinstatement CCC list = JGC Direct MP.
  - TP inside the list + area A211/A212/A222/A231/A232/A233/GENERAL = CCC.
  - TP inside the list but outside those areas = JGC Direct MP.
- This is display/export alignment only. It does not change dashboard formulas.

### 3) Optional admin scope repair endpoint
- Added `/api/bitem/repair-scope`.
- Dry run: `/api/bitem/repair-scope`
- Apply: `/api/bitem/repair-scope?apply=1`
- Admin only.
- This is not SQL and does not reset DB. It repairs existing active records that were already stored with old contractor scope.

### 4) B Item Monitor visual rebuild
- Better contrast and more consistent colors.
- User selector changed to a dropdown.
- KPI definitions are separated:
  - Touched Comments = unique B comments touched by users.
  - Closed Actions = number of user close actions.
  - Opened Actions = number of user open/remove-date actions.
  - Closed & Still Closed = unique touched comments currently closed.
  - Opened & Still Open = unique touched comments currently open.
- Trend chart supports:
  - Per day
  - Per week, Friday to Thursday
  - Per month
- Every bucket shows two bars: Closed and Opened.

### 5) Dashboard first-open zero nudge
- Added a safe repaint nudge that re-runs the existing renderer after `dashboard_data.js` loads.
- No formulas or calculations changed.

## Files changed
- `dashboard.html`
- `bitem.html`
- `bitem-monitoring.html`
- `functions/_shared/bitem.js`
- `functions/api/bitem/repair-scope.js`

## What was not changed
- No SQL reset.
- No Selenium change.
- No workflow change.
- No dashboard calculation formula changes.
- No B Item save logic changes.
