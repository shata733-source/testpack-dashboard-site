import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertSupabase, pageArgs, sbRpc } from '../../_shared/supabase.js';

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requirePagePermission(context, 'bitem', 'view');
    if (auth.error) return auth.error;
    const url = new URL(context.request.url);
    const data = await sbRpc(context.env, 'bitem_page_api', pageArgs(url));
    return json(data && typeof data === 'object' ? data : { ok:false, source:'Supabase', error:'Invalid bitem_page_api response' }, data?.ok === false ? 500 : 200);
  } catch (e) {
    console.error('BITEM_PAGE_SUPABASE_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', endpoint:'page', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
