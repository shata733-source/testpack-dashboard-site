import { json, requirePagePermission, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean, normalizeDate } from '../../_shared/bitem.js';
import { handleSave } from './save.js';

async function ensureEditTables(env) {
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
    "ALTER TABLE bitem_registry ADD COLUMN user_cleared_date TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN user_cleared_by TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN final_status TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN final_cleared_date TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN last_edited_by TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN last_edited_at TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN source_flag TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN sync_note TEXT",
    "ALTER TABLE bitem_registry ADD COLUMN updated_at TEXT"
  ];
  for (const sql of regAlters) { try { await env.DB.prepare(sql).run(); } catch (_) {} }
}

async function handleEdit(context, body) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  await ensureEditTables(context.env);

  const auth = await requirePagePermission(context, 'bitem', 'edit');
  if (auth.error) return auth.error;
  const user = auth.user || {};
  const editorUsername = user.username || user.sub || '';
  const editorDisplay = user.display_name || user.name || editorUsername;

  const bitemId = clean(body.bitem_id || body.id || '');
  const fingerprint = clean(body.fingerprint || body.fp || '');
  const punchCleared = normalizeDate(body.punch_cleared || body.punchCleared || body.value || body.date || '');
  const remarks = clean(body.remarks || '');
  if (!bitemId && !fingerprint) return json({ ok: false, error: 'bitem_id or fingerprint is required' }, 400);

  const row = fingerprint
    ? await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE fingerprint=?').bind(fingerprint).first()
    : await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE bitem_id=?').bind(bitemId).first();
  if (!row) return json({ ok: false, error: 'B Item not found' }, 404);

  const old = {
    user_cleared_date: row.user_cleared_date || '',
    user_cleared_by: row.user_cleared_by || row.last_edited_by || '',
    final_status: row.final_status || '',
    final_cleared_date: row.final_cleared_date || '',
    last_edited_by: row.last_edited_by || ''
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
      user_cleared_date=?, user_cleared_by=?, final_status=?, final_cleared_date=?, last_edited_by=?, last_edited_at=datetime('now'),
      source_flag=?, sync_note=?, updated_at=datetime('now')
    WHERE fingerprint=?
  `).bind(punchCleared, editorDisplay, finalStatus, finalDate, editorDisplay, sourceFlag, syncNote, row.fingerprint).run();

  const updated = await context.env.DB.prepare(`
    SELECT bitem_id, fingerprint, contractor, tp_no, construction_stage, punch_category, comment_text, material_type,
           iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date, user_cleared_date, user_cleared_by,
           last_edited_by, last_edited_at, source_flag, sync_note, active, row_json, updated_at
    FROM bitem_registry WHERE fingerprint=?
  `).bind(row.fingerprint).first();

  try {
    await context.env.DB.prepare(`INSERT INTO bitem_user_edits(bitem_id, fingerprint, field_name, old_value, new_value, edited_by, edited_by_name, remarks, created_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind(row.bitem_id, row.fingerprint, 'Punch Cleared', old.user_cleared_date, punchCleared, editorUsername, editorDisplay, remarks).run();
  } catch (_) {}
  try {
    await context.env.DB.prepare(`INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, ip, details, created_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind('USER_EDIT', row.bitem_id, row.fingerprint, editorUsername, editorDisplay, user.role || '', getClientIP(context.request), JSON.stringify({ old, new: { user_cleared_date: punchCleared, user_cleared_by: editorDisplay, final_status: finalStatus, final_cleared_date: finalDate }, remarks })).run();
  } catch (_) {}

  return json({ ok: true, row: updated, user_cleared_by: editorDisplay });
}

export async function onRequestGet(context) {
  try {
    const dbError = assertDB(context.env); if (dbError) return dbError;
    await ensureEditTables(context.env);
    const url = new URL(context.request.url);

    // V21: edit through the same robust save handler, to keep date/status/name in sync.
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

    const includeRemoved = url.searchParams.get('include_removed') === '1';
    const q = clean(url.searchParams.get('q') || '');
    const limit = Math.min(Number(url.searchParams.get('limit') || 500), 50000);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

    const where = [];
    const binds = [];
    if (!includeRemoved) where.push('active=1');
    if (q) {
      where.push('(bitem_id LIKE ? OR tp_no LIKE ? OR construction_stage LIKE ? OR comment_text LIKE ? OR source_flag LIKE ?)');
      const like = `%${q}%`;
      binds.push(like, like, like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const count = await context.env.DB.prepare(`SELECT COUNT(*) AS n FROM bitem_registry ${whereSql}`).bind(...binds).first();
    const rows = await context.env.DB.prepare(`
      SELECT bitem_id, fingerprint, contractor, tp_no, construction_stage, punch_category, comment_text, material_type,
             iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date, user_cleared_date,
             last_edited_by, last_edited_at, source_flag, sync_note, active, row_json, updated_at
      FROM bitem_registry
      ${whereSql}
      ORDER BY active DESC, contractor, tp_no, bitem_id
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all();

    const kpi = await context.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active_total,
        SUM(CASE WHEN active=1 AND final_status='CLEARED' THEN 1 ELSE 0 END) AS active_cleared,
        SUM(CASE WHEN active=1 AND final_status<>'CLEARED' THEN 1 ELSE 0 END) AS active_balance,
        SUM(CASE WHEN active=0 THEN 1 ELSE 0 END) AS removed_total
      FROM bitem_registry
    `).first();

    return json({ ok: true, total: count?.n || 0, limit, offset, kpi, rows: rows.results || [] });
  } catch (e) {
    console.error('BITEM_STATE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};
    try { body = await context.request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON body' }, 400); }
    return await handleSave(context, body);
  } catch (e) {
    console.error('BITEM_STATE_POST_EDIT_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
