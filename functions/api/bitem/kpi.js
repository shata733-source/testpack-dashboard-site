import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

const CCC_ALLOWED_SQL = [
  "UPPER(COALESCE(area,'')) LIKE '%A211%'","UPPER(COALESCE(comment_text,'')) LIKE '%A211%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A211%'","UPPER(COALESCE(tp_no,'')) LIKE '%A211%'",
  "UPPER(COALESCE(area,'')) LIKE '%A212%'","UPPER(COALESCE(comment_text,'')) LIKE '%A212%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A212%'","UPPER(COALESCE(tp_no,'')) LIKE '%A212%'",
  "UPPER(COALESCE(area,'')) LIKE '%A222%'","UPPER(COALESCE(comment_text,'')) LIKE '%A222%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A222%'","UPPER(COALESCE(tp_no,'')) LIKE '%A222%'",
  "UPPER(COALESCE(area,'')) LIKE '%A231%'","UPPER(COALESCE(comment_text,'')) LIKE '%A231%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A231%'","UPPER(COALESCE(tp_no,'')) LIKE '%A231%'",
  "UPPER(COALESCE(area,'')) LIKE '%A232%'","UPPER(COALESCE(comment_text,'')) LIKE '%A232%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A232%'","UPPER(COALESCE(tp_no,'')) LIKE '%A232%'",
  "UPPER(COALESCE(area,'')) LIKE '%A233%'","UPPER(COALESCE(comment_text,'')) LIKE '%A233%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A233%'","UPPER(COALESCE(tp_no,'')) LIKE '%A233%'"
].join(' OR ');

const EFFECTIVE_CONTRACTOR_SQL = `CASE WHEN UPPER(COALESCE(contractor,'')) LIKE '%CCC%' AND (${CCC_ALLOWED_SQL}) THEN 'CCC' ELSE 'JGC Direct MP' END`;

function csvList(v) {
  return clean(v).split(',').map(x => clean(x)).filter(Boolean).filter(x => x.toUpperCase() !== 'ALL');
}

function whereFromUrl(url) {
  const where = ['active=1'];
  const binds = [];
  const contractor = clean(url.searchParams.get('contractor') || '');
  const finalStatus = clean(url.searchParams.get('final_status') || '');
  const areas = csvList(url.searchParams.get('area') || '');
  const stages = csvList(url.searchParams.get('stage') || '');
  const q = clean(url.searchParams.get('q') || '');

  if (contractor && contractor.toUpperCase() !== 'ALL') {
    if (/JGC/i.test(contractor)) where.push(`${EFFECTIVE_CONTRACTOR_SQL}='JGC Direct MP'`);
    else where.push(`${EFFECTIVE_CONTRACTOR_SQL}='CCC'`);
  }
  if (areas.length) {
    where.push(`(${areas.map(() => 'UPPER(COALESCE(area,\'\')) LIKE ?').join(' OR ')})`);
    areas.forEach(a => binds.push(`%${a.toUpperCase()}%`));
  }
  if (stages.length) {
    where.push(`(${stages.map(() => 'construction_stage=?').join(' OR ')})`);
    stages.forEach(s => binds.push(s));
  }
  if (finalStatus) {
    if (finalStatus.toUpperCase() === 'CLEARED') where.push("final_status='CLEARED'");
    else if (finalStatus.toUpperCase() === 'NOT CLEARED' || finalStatus.toUpperCase() === 'OPEN') where.push("(final_status IS NULL OR final_status='' OR final_status<>'CLEARED')");
  }
  if (q) {
    where.push(`(bitem_id LIKE ? OR tp_no LIKE ? OR comment_text LIKE ? OR material_type LIKE ? OR iso_or_spool LIKE ? OR area LIKE ? OR user_cleared_by LIKE ?)`);
    const like = `%${q}%`;
    binds.push(like, like, like, like, like, like, like);
  }
  return { whereSql: `WHERE ${where.join(' AND ')}`, binds };
}

export async function onRequestGet(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requirePagePermission(context, 'dashboard', 'view');
  if (auth.error) {
    const alt = await requirePagePermission(context, 'bitem', 'view');
    if (alt.error) return auth.error;
  }

  const url = new URL(context.request.url);
  const { whereSql, binds } = whereFromUrl(url);

  const byRows = await context.env.DB.prepare(`
    SELECT ${EFFECTIVE_CONTRACTOR_SQL} AS contractor,
           COUNT(*) AS total,
           SUM(CASE WHEN final_status='CLEARED' THEN 1 ELSE 0 END) AS cleared,
           SUM(CASE WHEN final_status IS NULL OR final_status='' OR final_status<>'CLEARED' THEN 1 ELSE 0 END) AS balance
    FROM bitem_registry
    ${whereSql}
    GROUP BY ${EFFECTIVE_CONTRACTOR_SQL}
  `).bind(...binds).all();

  const by = {}; let total = 0, cleared = 0, balance = 0;
  for (const r of (byRows.results || [])) {
    const item = { total: Number(r.total || 0), cleared: Number(r.cleared || 0), balance: Number(r.balance || 0) };
    by[r.contractor] = item;
    total += item.total; cleared += item.cleared; balance += item.balance;
  }

  return json({
    ok: true,
    source: 'bitem_registry',
    logic: 'effective contractor: CCC only if CCC row contains A211/A212/A222/A231/A232/A233; otherwise JGC Direct MP',
    filters: Object.fromEntries(url.searchParams.entries()),
    total, cleared, balance,
    by_contractor: by,
    punchB: { total, cleared, balance }
  });
}
