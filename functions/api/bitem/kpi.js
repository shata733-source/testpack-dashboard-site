import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertDB } from '../../_shared/bitem.js';

const CCC_ALLOWED_SQL = [
  "UPPER(COALESCE(area,'')) LIKE '%A211%'","UPPER(COALESCE(comment_text,'')) LIKE '%A211%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A211%'","UPPER(COALESCE(tp_no,'')) LIKE '%A211%'",
  "UPPER(COALESCE(area,'')) LIKE '%A212%'","UPPER(COALESCE(comment_text,'')) LIKE '%A212%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A212%'","UPPER(COALESCE(tp_no,'')) LIKE '%A212%'",
  "UPPER(COALESCE(area,'')) LIKE '%A222%'","UPPER(COALESCE(comment_text,'')) LIKE '%A222%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A222%'","UPPER(COALESCE(tp_no,'')) LIKE '%A222%'",
  "UPPER(COALESCE(area,'')) LIKE '%A231%'","UPPER(COALESCE(comment_text,'')) LIKE '%A231%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A231%'","UPPER(COALESCE(tp_no,'')) LIKE '%A231%'",
  "UPPER(COALESCE(area,'')) LIKE '%A232%'","UPPER(COALESCE(comment_text,'')) LIKE '%A232%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A232%'","UPPER(COALESCE(tp_no,'')) LIKE '%A232%'",
  "UPPER(COALESCE(area,'')) LIKE '%A233%'","UPPER(COALESCE(comment_text,'')) LIKE '%A233%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A233%'","UPPER(COALESCE(tp_no,'')) LIKE '%A233%'"
].join(' OR ');
const SCOPE = `CASE WHEN UPPER(COALESCE(contractor,'')) LIKE '%CCC%' AND (${CCC_ALLOWED_SQL}) THEN 'CCC' ELSE 'JGC Direct MP' END`;

export async function onRequestGet(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requirePagePermission(context, 'dashboard', 'view');
  if (auth.error) {
    const alt = await requirePagePermission(context, 'bitem', 'view');
    if (alt.error) return auth.error;
  }
  const rows = await context.env.DB.prepare(`
    SELECT ${SCOPE} AS contractor,
           COUNT(*) AS total,
           SUM(CASE WHEN final_status='CLEARED' THEN 1 ELSE 0 END) AS cleared,
           SUM(CASE WHEN final_status IS NULL OR final_status='' OR final_status<>'CLEARED' THEN 1 ELSE 0 END) AS balance
    FROM bitem_registry
    WHERE active=1
    GROUP BY ${SCOPE}
  `).all();
  const by = {}; let total=0, cleared=0, balance=0;
  for (const r of (rows.results||[])) {
    by[r.contractor] = { total:Number(r.total||0), cleared:Number(r.cleared||0), balance:Number(r.balance||0) };
    total += Number(r.total||0); cleared += Number(r.cleared||0); balance += Number(r.balance||0);
  }
  return json({ ok:true, source:'bitem_registry', total, cleared, balance, by_contractor:by });
}
