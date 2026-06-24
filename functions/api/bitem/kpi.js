import { json, requireUser } from '../../_shared/auth.js';
import { assertSupabase, appendCommonFilters, sbCount } from '../../_shared/supabase.js';

function makeParams(url, contractor, clearedOnly = false) {
  const params = new URLSearchParams();
  params.set('select', 'id');
  appendCommonFilters(params, url);
  if (contractor) params.set('effective_contractor', `eq.${contractor}`);
  if (clearedOnly) params.set('final_status', 'eq.CLEARED');
  return params;
}

async function countPair(env, url, contractor = '') {
  const [total, cleared] = await Promise.all([
    sbCount(env, 'bitem_registry_effective', makeParams(url, contractor, false)),
    sbCount(env, 'bitem_registry_effective', makeParams(url, contractor, true))
  ]);
  return { total, cleared, balance: Math.max(total - cleared, 0) };
}

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const contractorFilter = String(url.searchParams.get('contractor') || 'ALL').toUpperCase();

    let totalObj;
    const by = {};
    if (contractorFilter === 'CCC') {
      by.CCC = await countPair(context.env, url, 'CCC');
      totalObj = by.CCC;
    } else if (contractorFilter.includes('JGC')) {
      by['JGC Direct MP'] = await countPair(context.env, url, 'JGC Direct MP');
      totalObj = by['JGC Direct MP'];
    } else {
      const [ccc, jgc] = await Promise.all([
        countPair(context.env, url, 'CCC'),
        countPair(context.env, url, 'JGC Direct MP')
      ]);
      by.CCC = ccc; by['JGC Direct MP'] = jgc;
      totalObj = { total: ccc.total + jgc.total, cleared: ccc.cleared + jgc.cleared };
      totalObj.balance = Math.max(totalObj.total - totalObj.cleared, 0);
    }

    return json({
      ok:true,
      source:'Supabase',
      method:'v63_supabase_kpi',
      logic:'JGC remains JGC; CCC is CCC only if Area=General or inside A211/A212/A222/A231/A232/A233; otherwise JGC Direct MP',
      filters:Object.fromEntries(url.searchParams.entries()),
      total: totalObj.total,
      cleared: totalObj.cleared,
      balance: totalObj.balance,
      by_contractor: by,
      punchB: totalObj
    });
  } catch (e) {
    return json({ ok:false, source:'Supabase', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
