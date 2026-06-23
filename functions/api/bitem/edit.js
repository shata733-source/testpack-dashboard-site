import { json, requirePagePermission, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean, normalizeDate } from '../../_shared/bitem.js';

async function handlePost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requirePagePermission(context, 'bitem', 'edit');
  if (auth.error) return auth.error;
  const user = auth.user;
  const editorUsername = user.username || user.sub || '';
  const editorDisplay = user.display_name || user.name || editorUsername;

  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  const bitemId = clean(body.bitem_id);
  const fingerprint = clean(body.fingerprint);
  const punchCleared = normalizeDate(body.punch_cleared || body.punchCleared || body.value || '');
  const remarks = clean(body.remarks || '');

  if (!bitemId && !fingerprint) return json({ ok: false, error: 'bitem_id or fingerprint is required' }, 400);
  // Fingerprint is the real unique key. Some B Item IDs can repeat across sheet/area/comment variants.
  // Always prefer fingerprint when it is supplied so only the selected row is edited.
  const row = fingerprint
    ? await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE fingerprint=?').bind(fingerprint).first()
    : await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE bitem_id=?').bind(bitemId).first();
  if (!row) return json({ ok: false, error: 'B Item not found' }, 404);

  const old = {
    user_cleared_date: row.user_cleared_date || '',
    final_status: row.final_status || '',
    final_cleared_date: row.final_cleared_date || ''
  };
  const stageClosed = String(row.source_flag || '').includes('TP_SUMMARY_STAGE_CLOSED') || String(row.sync_note || '').toLowerCase().includes('closure of the current construction stage');
  const finalStatus = punchCleared ? 'CLEARED' : (row.query_status === 'CLEARED' || stageClosed ? 'CLEARED' : 'OPEN');
  const finalDate = punchCleared || row.query_cleared_date || (stageClosed ? (row.final_cleared_date || '') : '');
  const sourceFlag = punchCleared ? 'USER_EDITED' : (stageClosed ? 'TP_SUMMARY_STAGE_CLOSED' : (row.query_status === 'CLEARED' ? 'FMS_CCC_EXCEL_CLOSED' : 'SAME_NOT_CLEARED'));
  const syncNote = punchCleared
    ? 'User updated Punch Cleared date; final status recalculated immediately.'
    : (stageClosed ? 'Closed due to the closure of the current construction stage.' : 'User cleared manual Punch Cleared value; final status follows latest FMS / CCC Excel Sheet Status.');

  await context.env.DB.prepare(`
    UPDATE bitem_registry SET
      user_cleared_date=?, final_status=?, final_cleared_date=?, last_edited_by=?, last_edited_at=datetime('now'),
      source_flag=?, sync_note=?, updated_at=datetime('now')
    WHERE fingerprint=?
  `).bind(punchCleared, finalStatus, finalDate, editorDisplay, sourceFlag, syncNote, row.fingerprint).run();

  const updated = await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE fingerprint=?').bind(row.fingerprint).first();
  await context.env.DB.prepare('INSERT INTO bitem_user_edits(bitem_id, fingerprint, field_name, old_value, new_value, edited_by, edited_by_name, remarks, created_at) VALUES(?,?,?,?,?,?,?,?,datetime(\'now\'))')
    .bind(row.bitem_id, row.fingerprint, 'Punch Cleared', old.user_cleared_date, punchCleared, editorUsername, editorDisplay, remarks).run();
  await context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, ip, details, created_at) VALUES(?,?,?,?,?,?,?,?,datetime(\'now\'))')
    .bind('USER_EDIT', row.bitem_id, row.fingerprint, editorUsername, editorDisplay, user.role, getClientIP(context.request), JSON.stringify({ old, new: { user_cleared_date: punchCleared, final_status: finalStatus, final_cleared_date: finalDate, user_cleared_by: editorDisplay }, remarks })).run();

  return json({ ok: true, row: updated, user_cleared_by: editorDisplay });
}


export async function onRequestPost(context) {
  try { return await handlePost(context); }
  catch (e) {
    console.error('BITEM_EDIT_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
