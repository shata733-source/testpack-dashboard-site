import { json, requireUser } from '../../_shared/auth.js';
import { assertSupabase, appendCommonFilters, sbSelectAll, clean } from '../../_shared/supabase.js';

function norm(v) { return clean(v).toUpperCase(); }
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
function objToItems(obj) { return Object.entries(obj || {}).sort((a,b) => b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), undefined, {numeric:true})); }

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const params = new URLSearchParams();
    params.set('select', 'bitem_id,contractor:effective_contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,final_status,active');
    appendCommonFilters(params, url);
    params.set('order', 'tp_no.asc,bitem_id.asc');

    const allRows = await sbSelectAll(context.env, 'bitem_registry_effective', params, { pageSize: 2000, maxRows: 40000 });
    const sourceRows = (allRows || []).filter(r => Number(r.active ?? 1) === 1).filter(isRelevantB);

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
      source:'Supabase',
      method:'v63_supabase_stage_control',
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
    return json({ ok:false, source:'Supabase', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
