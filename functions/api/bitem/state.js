import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';
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
    'ALTER TABLE bitem_registry ADD COLUMN user_cleared_date TEXT',
    'ALTER TABLE bitem_registry ADD COLUMN user_cleared_by TEXT',
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

function whereFromUrl(url) {
  const includeRemoved = url.searchParams.get('include_removed') === '1';
  const q = clean(url.searchParams.get('q') || '');
  const contractor = clean(url.searchParams.get('contractor') || '');
  const area = clean(url.searchParams.get('area') || '');
  const stage = clean(url.searchParams.get('stage') || '');
  const finalStatus = clean(url.searchParams.get('final_status') || '');
  const where = [];
  const binds = [];
  if (!includeRemoved) where.push('active=1');
  if (q) {
    where.push(`(
      bitem_id LIKE ? OR tp_no LIKE ? OR construction_stage LIKE ? OR comment_text LIKE ? OR material_type LIKE ? OR
      iso_or_spool LIKE ? OR area LIKE ? OR source_flag LIKE ? OR sync_note LIKE ? OR last_edited_by LIKE ? OR user_cleared_by LIKE ?
    )`);
    const like = `%${q}%`;
    binds.push(like, like, like, like, like, like, like, like, like, like, like);
  }
  if (contractor && contractor.toUpperCase() !== 'ALL') {
    if (/JGC/i.test(contractor)) {
      where.push('(contractor=? OR contractor=? OR contractor=?)');
      binds.push('JGC', 'JGC Direct MP', 'JGC DIRECT MP');
    } else {
      where.push('contractor=?');
      binds.push(contractor);
    }
  }
  if (area && area.toUpperCase() !== 'ALL') { where.push('area=?'); binds.push(area); }
  if (stage && stage.toUpperCase() !== 'ALL') { where.push('construction_stage=?'); binds.push(stage); }
  if (finalStatus && finalStatus.toUpperCase() !== 'ALL') {
    if (finalStatus.toUpperCase() === 'CLEARED') where.push("final_status='CLEARED'");
    else where.push("(final_status IS NULL OR final_status='' OR final_status<>'CLEARED')");
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', binds };
}

async function facets(env) {
  const [areas, stages, contractors] = await Promise.all([
    env.DB.prepare(`SELECT DISTINCT area AS v FROM bitem_registry WHERE active=1 AND area IS NOT NULL AND area<>'' ORDER BY area LIMIT 500`).all(),
    env.DB.prepare(`SELECT DISTINCT construction_stage AS v FROM bitem_registry WHERE active=1 AND construction_stage IS NOT NULL AND construction_stage<>'' ORDER BY construction_stage LIMIT 200`).all(),
    env.DB.prepare(`SELECT DISTINCT contractor AS v FROM bitem_registry WHERE active=1 AND contractor IS NOT NULL AND contractor<>'' ORDER BY contractor LIMIT 20`).all()
  ]);
  return {
    areas: (areas.results || []).map(x => x.v).filter(Boolean),
    stages: (stages.results || []).map(x => x.v).filter(Boolean),
    contractors: (contractors.results || []).map(x => x.v).filter(Boolean)
  };
}

export async function onRequestGet(context) {
  try {
    const dbError = assertDB(context.env); if (dbError) return dbError;
    await ensureEditTables(context.env);

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

    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || url.searchParams.get('pageSize') || 100), 1), 500);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const { whereSql, binds } = whereFromUrl(url);

    const count = await context.env.DB.prepare(`SELECT COUNT(*) AS n FROM bitem_registry ${whereSql}`).bind(...binds).first();
    const rows = await context.env.DB.prepare(`
      SELECT bitem_id, fingerprint, contractor, tp_no, construction_stage, punch_category, comment_text, material_type,
             iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date,
             user_cleared_date, user_cleared_by, last_edited_by, last_edited_at, source_flag, sync_note, active, row_json, updated_at
      FROM bitem_registry
      ${whereSql}
      ORDER BY active DESC, tp_no, bitem_id, fingerprint
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all();

    const kpi = await context.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active_total,
        SUM(CASE WHEN active=1 AND final_status='CLEARED' THEN 1 ELSE 0 END) AS active_cleared,
        SUM(CASE WHEN active=1 AND (final_status IS NULL OR final_status='' OR final_status<>'CLEARED') THEN 1 ELSE 0 END) AS active_balance,
        SUM(CASE WHEN active=0 THEN 1 ELSE 0 END) AS removed_total
      FROM bitem_registry
    `).first();

    return json({ ok: true, total: count?.n || 0, limit, offset, kpi, facets: await facets(context.env), rows: rows.results || [] });
  } catch (e) {
    console.error('BITEM_STATE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    let body = {};
    try { body = await context.request.json(); } catch (_) { return json({ ok:false, error:'Invalid JSON body' }, 400); }
    return await handleSave(context, body);
  } catch (e) {
    console.error('BITEM_STATE_POST_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
