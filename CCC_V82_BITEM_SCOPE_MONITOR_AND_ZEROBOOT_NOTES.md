# CCC V82 — B Item Scope Fix + Lightweight Monitor + First Boot Paint Fix

## Changes
- Reinstated the lightweight B Item Monitor page/API created earlier.
- Corrected B Item contractor derivation during sync using the supplied Reinstatement TP list:
  - TP outside the list => JGC Direct MP.
  - TP inside the list + Area in A211/A212/A222/A231/A232/A233/GENERAL => CCC.
  - TP inside the list but outside those areas => JGC Direct MP.
- Added first-boot dashboard repaint/cache invalidation only, so the first opening should not stay on zero values until a filter is applied.

## Not changed
- B Item clearing logic.
- TP Summary closure logic.
- Dashboard formulas.
- KPI/stage SQL/RPC formulas.
- Supabase DB schema.
- Selenium.
- Workflow.

## Important after upload
Run the normal Selenium / B Item sync once so existing rows with old CCC ownership are reprocessed using the corrected Reinstatement TP list.
