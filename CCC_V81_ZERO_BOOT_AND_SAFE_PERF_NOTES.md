# CCC V81 - Zero Boot Fix + Safe Performance Only

Base: V80 Performance Only / restored logic baseline.

Scope:
- No B Item calculation logic changed.
- No B Item API changed.
- No SQL changed.
- No Selenium/workflow changed.
- Dashboard calculations remain the same; only render/cache performance and first paint timing were adjusted.

Fixes applied:
1. Initial zero KPIs fix
   - Loads any saved dashboard snapshot before waiting for the live dashboard_data.js request.
   - Forces a stable dashboard repaint when the dashboard becomes visible and after live data loads.
   - This targets the issue where values stay zero until any filter is applied.

2. Safe memoization
   - tpAreas(row) is cached in a WeakMap and reset when data changes.
   - getAllAreasFromTP() is cached per DATA_VERSION.
   - filteredMaterialRows() uses a WeakMap cache per filtered data array and filter state.

3. Safe render optimization
   - h(id, html) does not rewrite innerHTML if the same HTML was already rendered.
   - Area chart in Overview uses one Map pass instead of repeatedly filtering for each area.
   - stageMetricRows() uses a single aggregation pass instead of repeated data.filter arrays.

4. Safe paint optimization
   - Removed width transitions from horizontal bars, pipe bars, and punch progress bars.
   - Removed layout containment from .page to avoid delayed hidden-page measurements.

Not changed:
- B Item source/API logic.
- Punch calculation rules.
- Stage calculation rules.
- Reinstatement scope logic.
- User edits/D1 logic.
