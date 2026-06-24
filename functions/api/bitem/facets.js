import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertSupabase, sbSelectAll } from '../../_shared/supabase.js';

const CACHE = globalThis.__BITEM_SUPABASE_FACETS_CACHE__ || (globalThis.__BITEM_SUPABASE_FACETS_CACHE__ = { ts:0, data:null });
const TTL_MS = 10 * 60 * 1000;
function uniqSorted(rows, key) {
  return [...new Set((rows || []).map(r => r && r[key]).filter(Boolean).map(String))].sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
}

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requirePagePermission(context, 'bitem', 'view');
    if (auth.error) return auth.error;
    if (CACHE.data && Date.now() - CACHE.ts < TTL_MS) return json({ ok:true, cached:true, source:'Supabase', facets:CACHE.data });

    const params = new URLSearchParams();
    params.set('select', 'area,construction_stage');
    params.set('active', 'eq.1');
    const rows = await sbSelectAll(context.env, 'bitem_registry_effective', params, { pageSize: 2000, maxRows: 30000 });
    const facets = {
      areas: uniqSorted(rows, 'area'),
      stages: uniqSorted(rows, 'construction_stage'),
      contractors: ['CCC','JGC Direct MP']
    };
    CACHE.ts = Date.now(); CACHE.data = facets;
    return json({ ok:true, cached:false, source:'Supabase', facets });
  } catch (e) {
    return json({ ok:false, source:'Supabase', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
