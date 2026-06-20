import { json, requireUser, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean, normalizeDate } from '../../_shared/bitem.js';

export async function onRequestPost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin', 'user']);
  if (auth.error) return auth.error;
  const user = auth.user;

  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
  const bitemId = clean(body.bitem_id);
  const fingerprint = clean(body.fingerprint);
  const punchCleared = normalizeDate(body.punch_cleared || body.punchCleared || body.value || '');
  const remarks = clean(body.remarks || '');

  if (!bitemId && !fingerprint) return json({ ok: false, error: 'bitem_id or fingerprint is required' }, 400);
  const row = bitemId
    ? await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE bitem_id=?').bind(bitemId).first()
    : await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE fingerprint=?').bind(fingerprint).first();
  if (!row) return json({ ok: false, error: 'B Item not found' }, 404);

  const old = {
    user_cleared_date: row.user_cleared_date || '',
    final_status: row.final_status || '',
    final_cleared_date: row.final_cleared_date || ''
  };
  const finalStatus = punchCleared ? 'CLEARED' : (row.query_status === 'CLEARED' ? 'CLEARED' : 'OPEN');
  const finalDate = punchCleared || row.query_cleared_date || '';
  const sourceFlag = punchCleared ? 'USER_EDITED' : (row.query_status === 'CLEARED' ? 'QUERY_CLOSED_SYSTEM_OPEN' : 'SAME_OPEN');
  const syncNote = punchCleared
    ? 'User updated Punch Cleared date; final status recalculated immediately.'
    : 'User cleared manual Punch Cleared value; final status follows latest query.';

  await context.env.DB.prepare(`
    UPDATE bitem_registry SET
      user_cleared_date=?, final_status=?, final_cleared_date=?, last_edited_by=?, last_edited_at=datetime('now'),
      source_flag=?, sync_note=?, updated_at=datetime('now')
    WHERE fingerprint=?
  `).bind(punchCleared, finalStatus, finalDate, user.sub, sourceFlag, syncNote, row.fingerprint).run();

  const updated = await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE fingerprint=?').bind(row.fingerprint).first();
  await context.env.DB.prepare('INSERT INTO bitem_user_edits(bitem_id, fingerprint, field_name, old_value, new_value, edited_by, edited_by_name, remarks, created_at) VALUES(?,?,?,?,?,?,?,?,datetime(\'now\'))')
    .bind(row.bitem_id, row.fingerprint, 'Punch Cleared', old.user_cleared_date, punchCleared, user.sub, user.name, remarks).run();
  await context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, ip, details, created_at) VALUES(?,?,?,?,?,?,?,?,datetime(\'now\'))')
    .bind('USER_EDIT', row.bitem_id, row.fingerprint, user.sub, user.name, user.role, getClientIP(context.request), JSON.stringify({ old, new: { user_cleared_date: punchCleared, final_status: finalStatus, final_cleared_date: finalDate }, remarks })).run();

  return json({ ok: true, row: updated });
}
