import { json, requireUser } from '../../_shared/auth.js';

function clean(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function norm(v) { return clean(v).toUpperCase(); }
function csvList(v) { return clean(v).split(',').map(x => clean(x)).filter(Boolean).filter(x => x.toUpperCase() !== 'ALL'); }

const CCC_AREAS = ['A211','A212','A222','A231','A232','A233'];
function hasAllowedArea(row) {
  if (norm(row.area) === 'GENERAL') return true;
  const text = [row.area, row.comment_text, row.iso_or_spool, row.tp_no].map(norm).join(' ');
  return CCC_AREAS.some(a => new RegExp('(^|[^A-Z0-9])' + a + '([^A-Z0-9]|$)').test(text));
}
function effectiveContractor(row) {
  const c = norm(row.contractor);
  if (c.includes('JGC')) return 'JGC Direct MP';
  if (c.includes('CCC')) return hasAllowedArea(row) ? 'CCC' : 'JGC Direct MP';
  return 'JGC Direct MP';
}
function isCleared(row) { return norm(row.final_status) === 'CLEARED'; }
function isB(row) { const c = norm(row.punch_category); return c === 'B' || c.includes(' B') || c.includes('B '); }
function st(row) { return norm(row.construction_stage); }
function isCnsStage(row) {
  const s = st(row);
  return s.includes('QC PRETESTPACK PUNCH LIST') ||
         s.includes('RETURN FOR REINSTATEMENT') ||
         s.includes('RETURN WITH BACK PUNCH') ||
         s.includes('SAPID PUNCH LIST');
}
function isReturnStage(row) { return st(row).includes('QC PUNCH LIST RETURN'); }
function isRelevantB(row) { return isB(row) && (isCnsStage(row) || isReturnStage(row)); }

function party(row) {
  const t = norm([row.comment_text, row.material_type, row.iso_or_spool].join(' '));
  if (t.includes('ENG') || t.includes('DRAWING') || t.includes('DOCUMENT') || t.includes('PID') ||
      t.includes('P ID') || t.includes('ISO ') || t.includes('ISOMETRIC') || t.includes('VERIFY') ||
      t.includes('VERIFICATION') || t.includes('ENGINEERING') || t.includes('REVIEW')) return 'ENG';
  return 'CNS';
}
function materialClass(row) {
  const t = norm([row.comment_text, row.material_type, row.iso_or_spool].join(' '));
  const mat = clean(row.material_type);
  if (t.includes('BOLT TORQUE') || t.includes('TORQUING') || t.includes('REPORT TO BE ATTACHED') || t.includes('BT REPORT')) return 'Bolt Torquing';
  if (t.includes('SUPPORT')) return 'Support';
  if (t.includes('PLUG')) return 'Plug';
  if (t.includes('DRAWING') || t.includes('PID') || t.includes('P ID') || t.includes('VERIFY') || t.includes('VERIFICATION')) return 'Drawing / Verification';
  if (t.includes('ON PAVE') || t.includes('FOUNDATION') || t.includes('GROUT') || t.includes('FDN')) return 'On-pave FDN / Grouting';
  if (t.includes('INSTRUMENT') || /\b(PG|LIT|LG|LV|PV|ZV|XV|BDV|PT|TT|FT|LT)\b/.test(t)) return 'Instrument';
  if (t.includes('SPADE') || t.includes('BLIND') || t.includes('SPACER')) return 'Spade / Blind';
  if (t.includes('VALVE')) return 'Valve';
  return mat || 'General / Unclassified';
}
function addCount(map, key, n = 1) { key = clean(key) || 'Other'; map[key] = (map[key] || 0) + n; }
function hasColumn(cols, name) { return cols.has(String(name || '').toLowerCase()); }
function colExpr(cols, name, alias) { return hasColumn(cols, name) ? `${name} AS ${alias || name}` : `'' AS ${alias || name}`; }
async function tableColumns(env, table) {
  const r = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
  return new Set((r.results || []).map(x => String(x.name || '').toLowerCase()).filter(Boolean));
}
function matchesFilters(row, url) {
  const contractor = clean(url.searchParams.get('contractor') || 'ALL');
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
  if (q) {
    const blob = [row.bitem_id, row.tp_no, row.construction_stage, row.comment_text, row.material_type, row.iso_or_spool, row.area, row.final_status].map(norm).join(' ');
    if (!blob.includes(q)) return false;
  }
  return true;
}
function objToItems(obj) {
  return Object.entries(obj || {}).sort((a,b) => b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), undefined, {numeric:true}));
}

export async function onRequestGet(context) {
  try {
    if (!context.env || !context.env.DB) return json({ ok:false, error:'D1 binding DB is not configured' }, 500);
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const cols = await tableColumns(context.env, 'bitem_registry');
    if (!cols.size) return json({ ok:false, error:'bitem_registry table was not found' }, 500);

    const select = [
      colExpr(cols, 'bitem_id', 'bitem_id'),
      colExpr(cols, 'contractor', 'contractor'),
      colExpr(cols, 'tp_no', 'tp_no'),
      colExpr(cols, 'construction_stage', 'construction_stage'),
      colExpr(cols, 'punch_category', 'punch_category'),
      colExpr(cols, 'comment_text', 'comment_text'),
      colExpr(cols, 'material_type', 'material_type'),
      colExpr(cols, 'iso_or_spool', 'iso_or_spool'),
      colExpr(cols, 'area', 'area'),
      colExpr(cols, 'final_status', 'final_status'),
      hasColumn(cols, 'active') ? 'active AS active' : '1 AS active'
    ].join(', ');

    const rs = await context.env.DB.prepare(`SELECT ${select} FROM bitem_registry`).all();
    const sourceRows = (rs.results || []).filter(r => Number(r.active ?? 1) === 1).filter(r => matchesFilters(r, url)).filter(isRelevantB);

    const cns = { total:0, cleared:0, balance:0 };
    const ret = { total:0, cleared:0, balance:0 };
    const partyCounts = {};
    const materialCounts = {};
    const byTp = {};

    for (const r of sourceRows) {
      const bucket = isReturnStage(r) ? ret : cns;
      bucket.total++;
      if (isCleared(r)) bucket.cleared++; else bucket.balance++;
      addCount(partyCounts, party(r));
      addCount(materialCounts, materialClass(r));
      const tp = clean(r.tp_no);
      if (tp) {
        if (!byTp[tp]) byTp[tp] = { tp, total:0, cleared:0, balance:0, cns:0, eng:0, retTotal:0, retCleared:0, retBalance:0 };
        const x = byTp[tp];
        if (isReturnStage(r)) { x.retTotal++; if (isCleared(r)) x.retCleared++; else x.retBalance++; }
        else { x.total++; if (isCleared(r)) x.cleared++; else x.balance++; party(r)==='ENG' ? x.eng++ : x.cns++; }
      }
    }

    return json({
      ok:true,
      source:'bitem_registry',
      method:'v35_stage_control_d1',
      logic:'JGC remains JGC; CCC is CCC only if Area=General or inside A211/A212/A222/A231/A232/A233, otherwise JGC Direct MP',
      filters:Object.fromEntries(url.searchParams.entries()),
      cns, ret,
      total:cns.total+ret.total,
      cleared:cns.cleared+ret.cleared,
      balance:cns.balance+ret.balance,
      party_counts: objToItems(partyCounts),
      material_counts: objToItems(materialCounts).slice(0,30),
      by_tp: Object.values(byTp).sort((a,b)=>b.balance-a.balance || b.retBalance-a.retBalance || b.total-a.total).slice(0,500)
    });
  } catch (e) {
    return json({ ok:false, source:'bitem_registry', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
