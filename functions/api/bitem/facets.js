import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertSupabase, sbRpc } from '../../_shared/supabase.js';

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requirePagePermission(context, 'bitem', 'view');
    if (auth.error) return auth.error;
    const data = await sbRpc(context.env, 'bitem_facets_api', {});
    return json(data && typeof data === 'object' ? data : { ok:false, source:'Supabase', error:'Invalid bitem_facets_api response' }, data?.ok === false ? 500 : 200);
  } catch (e) {
    return json({ ok:false, source:'Supabase', endpoint:'facets', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
