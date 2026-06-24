import { json, requireUser } from '../../_shared/auth.js';
import { assertSupabase, kpiArgs, sbRpc } from '../../_shared/supabase.js';

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

function normalizeContractor(v) {
  const c = clean(v || 'ALL');
  if (!c || /^all$/i.test(c)) return 'ALL';
  if (/ccc/i.test(c)) return 'CCC';
  if (/jgc/i.test(c)) return 'JGC Direct MP';
  return c;
}

function normalizeArgs(args) {
  return {
    p_include_removed: !!args.p_include_removed,
    p_q: clean(args.p_q || ''),
    p_contractor: normalizeContractor(args.p_contractor || 'ALL'),
    p_area: clean(args.p_area || ''),
    p_stage: clean(args.p_stage || ''),
    p_final_status: clean(args.p_final_status || 'ALL') || 'ALL'
  };
}

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const args = normalizeArgs(kpiArgs(url));

    const data = await sbRpc(context.env, 'bitem_kpi_fast_v67', args);
    return json(data && typeof data === 'object' ? data : { ok:false, source:'Supabase', error:'Invalid bitem_kpi_fast_v67 response' }, data?.ok === false ? 500 : 200);
  } catch (e) {
    return json({ ok:false, source:'Supabase', endpoint:'kpi', method:'v67_fast_kpi_single_sql', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
