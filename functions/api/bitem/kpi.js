import { json, requireUser } from '../../_shared/auth.js';
import { assertSupabase, kpiArgs, sbRpc } from '../../_shared/supabase.js';

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requireUser(context, []);
    if (auth.error) return auth.error;
    const url = new URL(context.request.url);
    const data = await sbRpc(context.env, 'bitem_kpi_api', kpiArgs(url));
    return json(data && typeof data === 'object' ? data : { ok:false, source:'Supabase', error:'Invalid bitem_kpi_api response' }, data?.ok === false ? 500 : 200);
  } catch (e) {
    return json({ ok:false, source:'Supabase', endpoint:'kpi', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
