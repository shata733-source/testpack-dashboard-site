import { json, requirePagePermission, getClientIP } from '../../_shared/auth.js';
import { assertSupabase, sbRpc, clean } from '../../_shared/supabase.js';

function normalizeDate(v) {
  if (v === null || v === undefined) return '';
  const s = clean(v);
  if (!s || ['(BLANK)','BLANK','-','--','NULL','N/A','NA','UNDEFINED'].includes(s.toUpperCase())) return '';
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0,10);
  return s;
}

export async function handleSave(context, rawBody = {}) {
  const sbError = assertSupabase(context.env); if (sbError) return sbError;
  const auth = await requirePagePermission(context, 'bitem', 'edit');
  if (auth.error) return auth.error;
  const user = auth.user || {};
  const editorUsername = clean(user.username || user.sub || '');
  const editorDisplay = clean(user.display_name || user.name || editorUsername);

  const bitemId = clean(rawBody.bitem_id || rawBody.id || rawBody.bitemId || '');
  const fingerprint = clean(rawBody.fingerprint || rawBody.fp || '');
  const punchCleared = normalizeDate(rawBody.punch_cleared || rawBody.punchCleared || rawBody.value || rawBody.date || '');
  const clearDate = String(rawBody.clear_date || rawBody.clearDate || rawBody.action || '').toLowerCase();
  const isClearAction = clearDate === '1' || clearDate === 'true' || clearDate === 'clear' || clearDate === 'remove';
  const remarks = clean(rawBody.remarks || (isClearAction ? 'User removed Punch Cleared date' : 'Inline Punch Cleared update'));

  if (!bitemId && !fingerprint) return json({ ok:false, source:'Supabase', error:'bitem_id or fingerprint is required' }, 400);

  const data = await sbRpc(context.env, 'bitem_save_api', {
    p_bitem_id: bitemId,
    p_fingerprint: fingerprint,
    p_punch_cleared: punchCleared,
    p_clear_date: isClearAction,
    p_editor_username: editorUsername,
    p_editor_display: editorDisplay,
    p_role: clean(user.role || ''),
    p_ip: getClientIP(context.request),
    p_remarks: remarks
  });
  return json(data && typeof data === 'object' ? data : { ok:false, source:'Supabase', error:'Invalid bitem_save_api response' }, data?.ok === false ? 404 : 200);
}

export async function onRequestPost(context) {
  try {
    let body = {};
    try { body = await context.request.json(); } catch (_) { body = {}; }
    return await handleSave(context, body);
  } catch (e) {
    console.error('BITEM_SAVE_SUPABASE_POST_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', endpoint:'save', error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    return await handleSave(context, {
      bitem_id: url.searchParams.get('bitem_id') || url.searchParams.get('id') || '',
      fingerprint: url.searchParams.get('fingerprint') || url.searchParams.get('fp') || '',
      punch_cleared: url.searchParams.get('punch_cleared') || url.searchParams.get('date') || '',
      remarks: url.searchParams.get('remarks') || 'Inline Punch Cleared update',
      clear_date: url.searchParams.get('clear_date') || url.searchParams.get('clearDate') || '',
      action: url.searchParams.get('action') || ''
    });
  } catch (e) {
    console.error('BITEM_SAVE_SUPABASE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', endpoint:'save', error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
