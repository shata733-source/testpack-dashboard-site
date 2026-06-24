import { json, requirePagePermission, getClientIP } from '../../_shared/auth.js';
import { clean, normalizeDate } from '../../_shared/bitem.js';
import { assertSupabase, sbFetch, sbJson, restValue } from '../../_shared/supabase.js';

function upper(v) { return clean(v).toUpperCase(); }
function filterBy(row) {
  if (clean(row.fingerprint)) return `fingerprint=eq.${restValue(row.fingerprint)}`;
  return `bitem_id=eq.${restValue(row.bitem_id || '')}`;
}
async function findBItem(env, bitemId, fingerprint) {
  const select = 'select=bitem_id,fingerprint,contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,query_status,query_cleared_date,final_status,final_cleared_date,user_cleared_date,user_cleared_by,last_edited_by,last_edited_at,source_flag,sync_note,active,row_json,updated_at';
  if (fingerprint) {
    const r = await sbJson(env, `/rest/v1/bitem_registry?${select}&fingerprint=eq.${restValue(fingerprint)}&limit=1`);
    if (Array.isArray(r.data) && r.data[0]) return r.data[0];
  }
  if (bitemId) {
    const r = await sbJson(env, `/rest/v1/bitem_registry?${select}&bitem_id=eq.${restValue(bitemId)}&limit=1`);
    if (Array.isArray(r.data) && r.data[0]) return r.data[0];
  }
  return null;
}
async function selectUpdated(env, row) {
  const select = 'select=bitem_id,fingerprint,contractor:effective_contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,query_status,query_cleared_date,final_status,final_cleared_date,user_cleared_date,user_cleared_by,last_edited_by,last_edited_at,source_flag,sync_note,active,row_json,updated_at';
  const filter = clean(row.fingerprint) ? `fingerprint=eq.${restValue(row.fingerprint)}` : `bitem_id=eq.${restValue(row.bitem_id || '')}`;
  const r = await sbJson(env, `/rest/v1/bitem_registry_effective?${select}&${filter}&limit=1`);
  return Array.isArray(r.data) ? r.data[0] : null;
}
async function insertLog(env, table, row) {
  try {
    await sbFetch(env, `/rest/v1/${table}`, {
      method:'POST',
      headers:{ prefer:'return=minimal' },
      body: JSON.stringify(row)
    });
  } catch (_) {}
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
  if (!bitemId && !fingerprint) return json({ ok:false, error:'bitem_id or fingerprint is required' }, 400);

  const row = await findBItem(context.env, bitemId, fingerprint);
  if (!row) return json({ ok:false, error:'B Item not found' }, 404);

  const old = {
    user_cleared_date: clean(row.user_cleared_date || ''),
    user_cleared_by: clean(row.user_cleared_by || row.last_edited_by || ''),
    final_status: clean(row.final_status || ''),
    final_cleared_date: clean(row.final_cleared_date || ''),
    last_edited_by: clean(row.last_edited_by || '')
  };

  const queryCleared = upper(row.query_status) === 'CLEARED';
  const stageClosed = upper(row.source_flag).includes('TP_SUMMARY_STAGE_CLOSED') || upper(row.sync_note).includes('CLOSURE OF THE CURRENT CONSTRUCTION STAGE');

  let finalStatus = 'OPEN';
  let finalDate = '';
  let sourceFlag = isClearAction ? 'USER_REOPENED' : 'SAME_NOT_CLEARED';
  let syncNote = isClearAction ? 'User removed Punch Cleared date; item reopened unless closed by FMS / CCC or TP Summary.' : 'Same not cleared status in both system and latest FMS / CCC Excel source.';

  if (punchCleared) {
    finalStatus = 'CLEARED';
    finalDate = punchCleared;
    sourceFlag = 'USER_EDITED';
    syncNote = 'User updated Punch Cleared date; final status recalculated immediately.';
  } else if (queryCleared) {
    finalStatus = 'CLEARED';
    finalDate = clean(row.query_cleared_date || row.final_cleared_date || '');
    sourceFlag = 'FMS_CCC_EXCEL_CLOSED';
    syncNote = 'Final status follows latest FMS / CCC Excel Sheet Status.';
  } else if (stageClosed) {
    finalStatus = 'CLEARED';
    finalDate = clean(row.final_cleared_date || '');
    sourceFlag = 'TP_SUMMARY_STAGE_CLOSED';
    syncNote = 'Closed due to the closure of the current construction stage.';
  }

  const patch = {
    user_cleared_date: punchCleared,
    user_cleared_by: editorDisplay,
    final_status: finalStatus,
    final_cleared_date: finalDate,
    last_edited_by: editorDisplay,
    last_edited_at: new Date().toISOString(),
    source_flag: sourceFlag,
    sync_note: syncNote,
    updated_at: new Date().toISOString()
  };
  const filter = filterBy(row);
  const upd = await sbFetch(context.env, `/rest/v1/bitem_registry?${filter}`, {
    method:'PATCH',
    headers:{ prefer:'return=minimal' },
    body: JSON.stringify(patch)
  });
  const updText = await upd.text();
  if (!upd.ok) throw new Error(`Supabase update failed (${upd.status}): ${updText.slice(0,1000)}`);

  await insertLog(context.env, 'bitem_user_edits', {
    bitem_id: clean(row.bitem_id || bitemId),
    fingerprint: clean(row.fingerprint || fingerprint),
    field_name: 'Punch Cleared',
    old_value: old.user_cleared_date,
    new_value: punchCleared,
    edited_by: editorUsername,
    edited_by_name: editorDisplay,
    remarks,
    created_at: new Date().toISOString()
  });
  await insertLog(context.env, 'bitem_audit_log', {
    action: 'USER_EDIT',
    bitem_id: clean(row.bitem_id || bitemId),
    fingerprint: clean(row.fingerprint || fingerprint),
    username: editorUsername,
    display_name: editorDisplay,
    role: user.role || '',
    ip: getClientIP(context.request),
    details: { old, new: { user_cleared_date: punchCleared, user_cleared_by: editorDisplay, final_status: finalStatus, final_cleared_date: finalDate, clear_date: isClearAction }, remarks },
    created_at: new Date().toISOString()
  });

  const updated = await selectUpdated(context.env, row);
  return json({
    ok: true,
    source:'Supabase',
    bitem_id: clean(row.bitem_id || bitemId),
    fingerprint: clean(row.fingerprint || fingerprint),
    punch_cleared: punchCleared,
    final_status: finalStatus,
    final_cleared_date: finalDate,
    user_cleared_date: punchCleared,
    user_cleared_by: editorDisplay,
    clear_date: isClearAction,
    last_edited_by: editorDisplay,
    source_flag: sourceFlag,
    sync_note: syncNote,
    row: updated || { ...row, ...patch }
  });
}

export async function onRequestPost(context) {
  try {
    let body = {};
    try { body = await context.request.json(); } catch (_) { body = {}; }
    return await handleSave(context, body);
  } catch (e) {
    console.error('BITEM_SUPABASE_SAVE_POST_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
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
    console.error('BITEM_SUPABASE_SAVE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
