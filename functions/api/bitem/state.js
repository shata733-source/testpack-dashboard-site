import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';
import { handleSave } from './save.js';


// V55: short server-side cache to protect D1 when many users open the same B Item page.
// Permission is still checked on every request; only the repeated DB read is skipped for a few seconds.
const STATE_CACHE = globalThis.__BITEM_STATE_CACHE__ || (globalThis.__BITEM_STATE_CACHE__ = new Map());
const STATE_TTL_MS = 3500;
const STATE_CACHE_MAX = 120;
function cacheKeyFromUrl(url) {
  const keys = ['limit','pageSize','offset','include_removed','q','contractor','area','stage','final_status'];
  return keys.map(k => `${k}=${url.searchParams.get(k) || ''}`).join('&');
}
function cacheGet(key) {
  const hit = STATE_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > STATE_TTL_MS) { STATE_CACHE.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) {
  if (STATE_CACHE.size >= STATE_CACHE_MAX) {
    const first = STATE_CACHE.keys().next().value;
    if (first) STATE_CACHE.delete(first);
  }
  STATE_CACHE.set(key, { ts: Date.now(), data });
}

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


const CCC_ALLOWED_SQL = [
  "UPPER(COALESCE(area,'')) LIKE '%A211%'","UPPER(COALESCE(comment_text,'')) LIKE '%A211%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A211%'","UPPER(COALESCE(tp_no,'')) LIKE '%A211%'",
  "UPPER(COALESCE(area,'')) LIKE '%A212%'","UPPER(COALESCE(comment_text,'')) LIKE '%A212%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A212%'","UPPER(COALESCE(tp_no,'')) LIKE '%A212%'",
  "UPPER(COALESCE(area,'')) LIKE '%A222%'","UPPER(COALESCE(comment_text,'')) LIKE '%A222%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A222%'","UPPER(COALESCE(tp_no,'')) LIKE '%A222%'",
  "UPPER(COALESCE(area,'')) LIKE '%A231%'","UPPER(COALESCE(comment_text,'')) LIKE '%A231%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A231%'","UPPER(COALESCE(tp_no,'')) LIKE '%A231%'",
  "UPPER(COALESCE(area,'')) LIKE '%A232%'","UPPER(COALESCE(comment_text,'')) LIKE '%A232%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A232%'","UPPER(COALESCE(tp_no,'')) LIKE '%A232%'",
  "UPPER(COALESCE(area,'')) LIKE '%A233%'","UPPER(COALESCE(comment_text,'')) LIKE '%A233%'","UPPER(COALESCE(iso_or_spool,'')) LIKE '%A233%'","UPPER(COALESCE(tp_no,'')) LIKE '%A233%'",
  "UPPER(TRIM(COALESCE(area,'')))='GENERAL'"
].join(' OR ');

const EFFECTIVE_CONTRACTOR_SQL = `CASE WHEN UPPER(COALESCE(contractor,'')) LIKE '%JGC%' THEN 'JGC Direct MP' WHEN UPPER(COALESCE(contractor,'')) LIKE '%CCC%' AND (${CCC_ALLOWED_SQL}) THEN 'CCC' ELSE 'JGC Direct MP' END`;

function whereFromUrl(url) {
  const includeRemoved = url.searchParams.get('include_removed') === '1';
  const q = clean(url.searchParams.get('q') || '').slice(0, 120);
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
      where.push(`${EFFECTIVE_CONTRACTOR_SQL}='JGC Direct MP'`);
    } else {
      where.push(`${EFFECTIVE_CONTRACTOR_SQL}='CCC'`);
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


export async function onRequestGet(context) {
  try {
    const dbError = assertDB(context.env); if (dbError) return dbError;
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

    const noCache = url.searchParams.get('no_cache') === '1' || url.searchParams.get('force') === '1';
    const cacheKey = cacheKeyFromUrl(url);
    if (!noCache) {
      const cached = cacheGet(cacheKey);
      if (cached) return json({ ...cached, cached: true, cache_ttl_ms: STATE_TTL_MS });
    }

    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || url.searchParams.get('pageSize') || 100), 1), 300);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const { whereSql, binds } = whereFromUrl(url);

    // V55: table-state endpoint stays light and adds a short in-memory cache.
    // No facets, no KPI, no schema checks, no extra aggregation.
    // No facets, no KPI, no schema checks, no extra aggregation.
    // This keeps B Item Control light when navigating between pages/dashboard.
    const count = await context.env.DB.prepare(`SELECT COUNT(*) AS n FROM bitem_registry ${whereSql}`).bind(...binds).first();
    const rows = await context.env.DB.prepare(`
      SELECT bitem_id, fingerprint, ${EFFECTIVE_CONTRACTOR_SQL} AS contractor, tp_no, construction_stage, punch_category, comment_text, material_type,
             iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date,
             user_cleared_date, user_cleared_by, last_edited_by, last_edited_at, source_flag, sync_note, active, row_json, updated_at
      FROM bitem_registry
      ${whereSql}
      ORDER BY tp_no, bitem_id, fingerprint
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all();


    const payload = { ok: true, total: count?.n || 0, limit, offset, rows: rows.results || [], cached: false };
    cacheSet(cacheKey, payload);
    return json(payload);
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
