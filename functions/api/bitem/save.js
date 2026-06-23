import { json, requirePagePermission, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean, normalizeDate } from '../../_shared/bitem.js';

async function ensureEditTables(env) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bitem_user_edits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bitem_id TEXT,
      fingerprint TEXT,
      field_name TEXT,
      old_value TEXT,
      new_value TEXT,
      edited_by TEXT,
      edited_by_name TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run();
  } catch (_) {}
  const regAlters = [
    'ALTER TABLE bitem_registry ADD COLUMN user_cleared_date TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN final_status TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN final_cleared_date TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN last_edited_by TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN last_edited_at TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN source_flag TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN sync_note TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN updated_at TEXT'
  ];
  for (const sql of regAlters) { try { await env.DB.prepare(sql).run(); } catch (_) {} }
}

function upper(v) { return clean(v).toUpperCase(); }

async function findBItem(env, bitemId, fingerprint) {
  if (fingerprint) {
    const r = await env.DB.prepare('SELECT * FROM bitem_registry WHERE fingerprint=? LIMIT 1').bind(fingerprint).first();
    if (r) return r;
  }
  if (bitemId) {
    const r = await env.DB.prepare('SELECT * FROM bitem_registry WHERE bitem_id=? LIMIT 1').bind(bitemId).first();
    if (r) return r;
  }
  return null;
}

async function selectUpdated(env, row) {
  if (row.fingerprint) return await env.DB.prepare(`
    SELECT bitem_id, fingerprint, contractor, tp_no, construction_stage, punch_category, comment_text, material_type,
           iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date, user_cleared_date,
           last_edited_by, last_edited_at, source_flag, sync_note, active, row_json, updated_at
    FROM bitem_registry WHERE fingerprint=? LIMIT 1
  `).bind(row.fingerprint).first();
  return await env.DB.prepare(`
    SELECT bitem_id, fingerprint, contractor, tp_no, construction_stage, punch_category, comment_text, material_type,
           iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date, user_cleared_date,
           last_edited_by, last_edited_at, source_flag, sync_note, active, row_json, updated_at
    FROM bitem_registry WHERE bitem_id=? LIMIT 1
  `).bind(row.bitem_id || '').first();
}

export async function handleSave(context, rawBody = {}) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  await ensureEditTables(context.env);

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

  const whereCol = clean(row.fingerprint) ? 'fingerprint' : 'bitem_id';
  const whereVal = clean(row.fingerprint) || clean(row.bitem_id || bitemId);
  const result = await context.env.DB.prepare(`
    UPDATE bitem_registry SET
      user_cleared_date=?,
      final_status=?,
      final_cleared_date=?,
      last_edited_by=?,
      last_edited_at=datetime('now'),
      source_flag=?,
      sync_note=?,
      updated_at=datetime('now')
    WHERE ${whereCol}=?
  `).bind(punchCleared, finalStatus, finalDate, editorDisplay, sourceFlag, syncNote, whereVal).run();

  const updated = await selectUpdated(context.env, row);

  try {
    await context.env.DB.prepare(`INSERT INTO bitem_user_edits(bitem_id, fingerprint, field_name, old_value, new_value, edited_by, edited_by_name, remarks, created_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind(clean(row.bitem_id || bitemId), clean(row.fingerprint || fingerprint), 'Punch Cleared', old.user_cleared_date, punchCleared, editorUsername, editorDisplay, remarks).run();
  } catch (_) {}

  try {
    await context.env.DB.prepare(`INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, ip, details, created_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind('USER_EDIT', clean(row.bitem_id || bitemId), clean(row.fingerprint || fingerprint), editorUsername, editorDisplay, user.role || '', getClientIP(context.request), JSON.stringify({ old, new: { user_cleared_date: punchCleared, final_status: finalStatus, final_cleared_date: finalDate, user_cleared_by: editorDisplay, clear_date: isClearAction }, changes: result?.meta || {}, remarks })).run();
  } catch (_) {}

  return json({
    ok: true,
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
    row: updated || {
      ...row,
      user_cleared_date: punchCleared,
      final_status: finalStatus,
      final_cleared_date: finalDate,
      last_edited_by: editorDisplay,
      source_flag: sourceFlag,
      sync_note: syncNote
    }
  });
}

export async function onRequestPost(context) {
  try {
    let body = {};
    try { body = await context.request.json(); } catch (_) { body = {}; }
    return await handleSave(context, body);
  } catch (e) {
    console.error('BITEM_SAVE_POST_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
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
    console.error('BITEM_SAVE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
