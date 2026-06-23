import { json, requireUser } from '../../_shared/auth.js';

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}
function norm(v) { return clean(v).toUpperCase(); }
function csvList(v) {
  return clean(v).split(',').map(x => clean(x)).filter(Boolean).filter(x => x.toUpperCase() !== 'ALL');
}
const CCC_AREAS = ['A211','A212','A222','A231','A232','A233'];
function hasAllowedArea(row) {
  const text = [row.area, row.comment_text, row.iso_or_spool, row.tp_no].map(norm).join(' ');
  return CCC_AREAS.some(a => text.includes(a));
}
function effectiveContractor(row) {
  const c = norm(row.contractor);
  return (c.includes('CCC') && !c.includes('JGC') && hasAllowedArea(row)) ? 'CCC' : 'JGC Direct MP';
}
function isCleared(row) { return norm(row.final_status) === 'CLEARED'; }
function hasColumn(cols, name) { return cols.has(String(name).toLowerCase()); }
function colExpr(cols, name, alias) {
  return hasColumn(cols, name) ? `${name} AS ${alias || name}` : `'' AS ${alias || name}`;
}
async function tableColumns(env, table) {
  const r = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return new Set((r.results || []).map(x => String(x.name || '').toLowerCase()).filter(Boolean));
}
function matchesFilters(row, url) {
  const contractor = clean(url.searchParams.get('contractor') || 'ALL');
  const finalStatus = clean(url.searchParams.get('final_status') || 'ALL');
  const areas = csvList(url.searchParams.get('area') || '');
  const stages = csvList(url.searchParams.get('stage') || '');
  const q = norm(url.searchParams.get('q') || '');

  if (contractor && contractor.toUpperCase() !== 'ALL') {
    const eff = effectiveContractor(row);
    if (/JGC/i.test(contractor)) { if (eff !== 'JGC Direct MP') return false; }
    else if (/CCC/i.test(contractor)) { if (eff !== 'CCC') return false; }
  }
  if (areas.length) {
    const a = norm(row.area);
    if (!areas.some(x => a.includes(norm(x)))) return false;
  }
  if (stages.length) {
    const s = norm(row.construction_stage);
    if (!stages.some(x => s === norm(x))) return false;
  }
  if (finalStatus && finalStatus.toUpperCase() !== 'ALL') {
    const cleared = isCleared(row);
    if (finalStatus.toUpperCase() === 'CLEARED' && !cleared) return false;
    if ((finalStatus.toUpperCase() === 'NOT CLEARED' || finalStatus.toUpperCase() === 'OPEN') && cleared) return false;
  }
  if (q) {
    const blob = [row.bitem_id, row.tp_no, row.construction_stage, row.comment_text, row.material_type, row.iso_or_spool, row.area, row.user_cleared_by, row.final_status].map(norm).join(' ');
    if (!blob.includes(q)) return false;
  }
  return true;
}

export async function onRequestGet(context) {
  try {
    if (!context.env || !context.env.DB) return json({ ok:false, error:'D1 binding DB is not configured' }, 500);
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const cols = await tableColumns(context.env, 'bitem_registry');
    if (!cols.size) return json({ ok:false, error:'bitem_registry table was not found or has no columns' }, 500);

    const select = [
      colExpr(cols, 'bitem_id', 'bitem_id'),
      colExpr(cols, 'contractor', 'contractor'),
      colExpr(cols, 'tp_no', 'tp_no'),
      colExpr(cols, 'construction_stage', 'construction_stage'),
      colExpr(cols, 'comment_text', 'comment_text'),
      colExpr(cols, 'material_type', 'material_type'),
      colExpr(cols, 'iso_or_spool', 'iso_or_spool'),
      colExpr(cols, 'area', 'area'),
      colExpr(cols, 'final_status', 'final_status'),
      colExpr(cols, 'user_cleared_by', 'user_cleared_by'),
      hasColumn(cols, 'active') ? 'active AS active' : '1 AS active'
    ].join(', ');

    // Fetch only lightweight columns. 12-13k rows is safe here and avoids fragile SQL expressions / schema mismatch.
    const rs = await context.env.DB.prepare(`SELECT ${select} FROM bitem_registry`).all();
    const rows = (rs.results || []).filter(r => Number(r.active ?? 1) === 1).filter(r => matchesFilters(r, url));

    const by = {};
    let total = 0, cleared = 0, balance = 0;
    for (const r of rows) {
      const c = effectiveContractor(r);
      if (!by[c]) by[c] = { total: 0, cleared: 0, balance: 0 };
      by[c].total++;
      total++;
      if (isCleared(r)) { by[c].cleared++; cleared++; }
      else { by[c].balance++; balance++; }
    }

    return json({
      ok: true,
      source: 'bitem_registry',
      method: 'v30_js_safe_kpi',
      logic: 'CCC only if CCC row contains A211/A212/A222/A231/A232/A233; otherwise JGC Direct MP',
      filters: Object.fromEntries(url.searchParams.entries()),
      total, cleared, balance,
      by_contractor: by,
      punchB: { total, cleared, balance }
    });
  } catch (e) {
    return json({ ok:false, source:'bitem_registry', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
