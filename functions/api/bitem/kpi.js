import { json, requireUser } from '../../_shared/auth.js';
import { assertSupabase, kpiArgs, sbRpc } from '../../_shared/supabase.js';

function n(v) {
  const x = Number(v || 0);
  return Number.isFinite(x) ? x : 0;
}

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

async function pageCount(env, args) {
  const data = await sbRpc(env, 'bitem_page_api', {
    p_limit: 1,
    p_offset: 0,
    p_include_removed: !!args.p_include_removed,
    p_q: clean(args.p_q || ''),
    p_contractor: clean(args.p_contractor || 'ALL') || 'ALL',
    p_area: clean(args.p_area || ''),
    p_stage: clean(args.p_stage || ''),
    p_final_status: clean(args.p_final_status || 'ALL') || 'ALL'
  });
  if (!data || data.ok === false) throw new Error(data && data.error ? data.error : 'Invalid bitem_page_api response');
  return n(data.total);
}

async function kpiByPageApi(env, baseArgs) {
  const total = await pageCount(env, baseArgs);
  const fs = clean(baseArgs.p_final_status || 'ALL').toUpperCase();
  let cleared = 0;

  if (fs === 'CLEARED') {
    cleared = total;
  } else if (fs === 'ALL' || fs === '') {
    cleared = await pageCount(env, { ...baseArgs, p_final_status: 'CLEARED' });
  } else {
    cleared = 0;
  }

  const balance = Math.max(total - cleared, 0);
  const contractor = clean(baseArgs.p_contractor || 'ALL') || 'ALL';
  const by = {};
  if (/CCC/i.test(contractor)) by.CCC = { total, cleared, balance };
  else if (/JGC/i.test(contractor)) by['JGC Direct MP'] = { total, cleared, balance };

  return {
    ok: true,
    source: 'Supabase',
    method: 'v66_page_count_kpi_safe',
    total,
    cleared,
    balance,
    by_contractor: by,
    punchB: { total, cleared, balance }
  };
}

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const args = kpiArgs(url);

    // The Overview card depends on this endpoint. Use the already-validated
    // bitem_page_api count path instead of the separate aggregate RPC to avoid
    // keeping Overview stuck on Loading while B Item Control itself works.
    const data = await kpiByPageApi(context.env, args);
    return json(data, 200);
  } catch (e) {
    return json({ ok:false, source:'Supabase', endpoint:'kpi', method:'v66_page_count_kpi_safe', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
