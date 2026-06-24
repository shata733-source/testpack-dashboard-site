import { json, requireUser } from '../../_shared/auth.js';

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}
function norm(v) { return clean(v).toUpperCase(); }
function csvList(v) {
  return clean(v).split(',').map(x => clean(x)).filter(Boolean).filter(x => x.toUpperCase() !== 'ALL');
}

const CCC_ALLOWED_SQL = [
  "UPPER(COALESCE(area,'')) LIKE '%A211%'","UPPER(COALESCE(comment_text,'')) LIKE '%A211%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A211%'","UPPER(COALESCE(tp_no,'')) LIKE '%A211%'",
  "UPPER(COALESCE(area,'')) LIKE '%A212%'","UPPER(COALESCE(comment_text,'')) LIKE '%A212%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A212%'","UPPER(COALESCE(tp_no,'')) LIKE '%A212%'",
  "UPPER(COALESCE(area,'')) LIKE '%A222%'","UPPER(COALESCE(comment_text,'')) LIKE '%A222%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A222%'","UPPER(COALESCE(tp_no,'')) LIKE '%A222%'",
  "UPPER(COALESCE(area,'')) LIKE '%A231%'","UPPER(COALESCE(comment_text,'')) LIKE '%A231%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A231%'","UPPER(COALESCE(tp_no,'')) LIKE '%A231%'",
  "UPPER(COALESCE(area,'')) LIKE '%A232%'","UPPER(COALESCE(comment_text,'')) LIKE '%A232%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A232%'","UPPER(COALESCE(tp_no,'')) LIKE '%A232%'",
  "UPPER(COALESCE(area,'')) LIKE '%A233%'","UPPER(COALESCE(comment_text,'')) LIKE '%A233%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A233%'","UPPER(COALESCE(tp_no,'')) LIKE '%A233%'",
  "UPPER(TRIM(COALESCE(area,'')))='GENERAL'"
].join(' OR ');

const EFFECTIVE_CONTRACTOR_SQL = `CASE WHEN UPPER(COALESCE(contractor,'')) LIKE '%JGC%' THEN 'JGC Direct MP' WHEN UPPER(COALESCE(contractor,'')) LIKE '%CCC%' AND (${CCC_ALLOWED_SQL}) THEN 'CCC' ELSE 'JGC Direct MP' END`;

function whereFromUrl(url) {
  const contractor = clean(url.searchParams.get('contractor') || 'ALL');
  const finalStatus = clean(url.searchParams.get('final_status') || 'ALL');
  const areas = csvList(url.searchParams.get('area') || '');
  const stages = csvList(url.searchParams.get('stage') || '');
  const q = norm(url.searchParams.get('q') || '');
  const where = ['active=1'];
  const binds = [];

  if (contractor && contractor.toUpperCase() !== 'ALL') {
    if (/JGC/i.test(contractor)) where.push(`${EFFECTIVE_CONTRACTOR_SQL}='JGC Direct MP'`);
    else if (/CCC/i.test(contractor)) where.push(`${EFFECTIVE_CONTRACTOR_SQL}='CCC'`);
  }

  if (areas.length) {
    where.push('(' + areas.map(() => "UPPER(COALESCE(area,'')) LIKE ?").join(' OR ') + ')');
    areas.forEach(a => binds.push('%' + norm(a) + '%'));
  }

  if (stages.length) {
    where.push('(' + stages.map(() => "UPPER(COALESCE(construction_stage,'')) = ?").join(' OR ') + ')');
    stages.forEach(s => binds.push(norm(s)));
  }

  if (finalStatus && finalStatus.toUpperCase() !== 'ALL') {
    if (finalStatus.toUpperCase() === 'CLEARED') where.push("UPPER(COALESCE(final_status,''))='CLEARED'");
    else where.push("(final_status IS NULL OR final_status='' OR UPPER(final_status)<>'CLEARED')");
  }

  if (q) {
    const like = '%' + q + '%';
    where.push(`(
      UPPER(COALESCE(bitem_id,'')) LIKE ? OR UPPER(COALESCE(tp_no,'')) LIKE ? OR
      UPPER(COALESCE(construction_stage,'')) LIKE ? OR UPPER(COALESCE(comment_text,'')) LIKE ? OR
      UPPER(COALESCE(material_type,'')) LIKE ? OR UPPER(COALESCE(iso_or_spool,'')) LIKE ? OR
      UPPER(COALESCE(area,'')) LIKE ? OR UPPER(COALESCE(user_cleared_by,'')) LIKE ? OR
      UPPER(COALESCE(final_status,'')) LIKE ?
    )`);
    binds.push(like, like, like, like, like, like, like, like, like);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}

export async function onRequestGet(context) {
  try {
    if (!context.env || !context.env.DB) return json({ ok:false, error:'D1 binding DB is not configured' }, 500);
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const { whereSql, binds } = whereFromUrl(url);

    const rs = await context.env.DB.prepare(`
      SELECT ${EFFECTIVE_CONTRACTOR_SQL} AS contractor,
             COUNT(*) AS total,
             SUM(CASE WHEN UPPER(COALESCE(final_status,''))='CLEARED' THEN 1 ELSE 0 END) AS cleared
      FROM bitem_registry
      ${whereSql}
      GROUP BY ${EFFECTIVE_CONTRACTOR_SQL}
    `).bind(...binds).all();

    const by = {};
    let total = 0, cleared = 0;
    for (const r of (rs.results || [])) {
      const c = clean(r.contractor) || 'JGC Direct MP';
      const t = Number(r.total || 0);
      const cl = Number(r.cleared || 0);
      by[c] = { total: t, cleared: cl, balance: Math.max(t - cl, 0) };
      total += t;
      cleared += cl;
    }

    const balance = Math.max(total - cleared, 0);
    return json({
      ok: true,
      source: 'bitem_registry',
      method: 'v51_sql_safe_kpi',
      logic: 'JGC remains JGC; CCC is CCC only if Area=General or inside A211/A212/A222/A231/A232/A233; otherwise JGC Direct MP',
      filters: Object.fromEntries(url.searchParams.entries()),
      total, cleared, balance,
      by_contractor: by,
      punchB: { total, cleared, balance }
    });
  } catch (e) {
    return json({ ok:false, source:'bitem_registry', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
