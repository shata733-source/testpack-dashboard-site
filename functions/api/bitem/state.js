import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertSupabase, pageArgs, sbRpc, clean } from '../../_shared/supabase.js';
import { handleSave } from './save.js';

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const url = new URL(context.request.url);
    if (url.searchParams.get('op') === 'edit') {
      return await handleSave(context, {
        bitem_id: url.searchParams.get('bitem_id') || url.searchParams.get('id') || '',
        fingerprint: url.searchParams.get('fingerprint') || url.searchParams.get('fp') || '',
        punch_cleared: url.searchParams.get('punch_cleared') || url.searchParams.get('date') || '',
        remarks: url.searchParams.get('remarks') || 'Inline Punch Cleared update',
        clear_date: url.searchParams.get('clear_date') || url.searchParams.get('clearDate') || '',
        action: url.searchParams.get('action') || ''
      });
    }
    const auth = await requirePagePermission(context, 'bitem', 'view');
    if (auth.error) return auth.error;
    const data = await sbRpc(context.env, 'bitem_page_api', pageArgs(url));
    return json(data && typeof data === 'object' ? data : { ok:false, source:'Supabase', error:'Invalid bitem_page_api response' }, data?.ok === false ? 500 : 200);
  } catch (e) {
    console.error('BITEM_STATE_SUPABASE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', endpoint:'state', error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};
    try { body = await context.request.json(); } catch (_) { return json({ ok:false, source:'Supabase', error:'Invalid JSON body' }, 400); }
    return await handleSave(context, body);
  } catch (e) {
    console.error('BITEM_STATE_SUPABASE_POST_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', endpoint:'state', error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
