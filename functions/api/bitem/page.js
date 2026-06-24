import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

// V57: dedicated lightweight read-only endpoint for B Item table paging.
// It is intentionally decoupled from /api/bitem/state and from save/edit imports.
// Goal: stable JSON response for B Item Control navigation under multi-user load.

const PAGE_CACHE = globalThis.__BITEM_PAGE_CACHE__ || (globalThis.__BITEM_PAGE_CACHE__ = new Map());
const PAGE_TTL_MS = 5000;
const PAGE_CACHE_MAX = 200;

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

function cacheKeyFromUrl(url, username) {
  const keys = ['limit','pageSize','offset','include_removed','q','contractor','area','stage','final_status'];
  return String(username || 'anon') + '|' + keys.map(k => `${k}=${url.searchParams.get(k) || ''}`).join('&');
}
function cacheGet(key) {
  const hit = PAGE_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > PAGE_TTL_MS) { PAGE_CACHE.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) {
  if (PAGE_CACHE.size >= PAGE_CACHE_MAX) {
    const first = PAGE_CACHE.keys().next().value;
    if (first) PAGE_CACHE.delete(first);
  }
  PAGE_CACHE.set(key, { ts: Date.now(), data });
}

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
    if (/JGC/i.test(contractor)) where.push(`${EFFECTIVE_CONTRACTOR_SQL}='JGC Direct MP'`);
    else where.push(`${EFFECTIVE_CONTRACTOR_SQL}='CCC'`);
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
    const auth = await requirePagePermission(context, 'bitem', 'view');
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const noCache = url.searchParams.get('no_cache') === '1' || url.searchParams.get('force') === '1';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || url.searchParams.get('pageSize') || 100), 1), 300);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const key = cacheKeyFromUrl(url, auth.user && (auth.user.username || auth.user.sub));

    if (!noCache) {
      const cached = cacheGet(key);
      if (cached) return json({ ...cached, cached: true, endpoint: 'page-v57' });
    }

    const { whereSql, binds } = whereFromUrl(url);

    const countStmt = context.env.DB.prepare(`SELECT COUNT(*) AS n FROM bitem_registry ${whereSql}`).bind(...binds);
    const rowStmt = context.env.DB.prepare(`
      SELECT bitem_id, fingerprint, ${EFFECTIVE_CONTRACTOR_SQL} AS contractor, tp_no, construction_stage, punch_category, comment_text, material_type,
             iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date,
             user_cleared_date, user_cleared_by, last_edited_by, last_edited_at, source_flag, sync_note, active, row_json, updated_at
      FROM bitem_registry
      ${whereSql}
      ORDER BY tp_no, bitem_id, fingerprint
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset);

    const [count, rows] = await Promise.all([countStmt.first(), rowStmt.all()]);
    const payload = { ok: true, total: count?.n || 0, limit, offset, rows: rows.results || [], cached: false, endpoint: 'page-v57' };
    cacheSet(key, payload);
    return json(payload);
  } catch (e) {
    console.error('BITEM_PAGE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok: false, endpoint: 'page-v57', error: (e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
