import { json } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

export async function onRequestGet(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const url = new URL(context.request.url);
  const includeRemoved = url.searchParams.get('include_removed') === '1';
  const q = clean(url.searchParams.get('q') || '');
  const limit = Math.min(Number(url.searchParams.get('limit') || 500), 50000);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const light = url.searchParams.get('light') === '1';

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
           last_edited_by, last_edited_at, source_flag, sync_note, active, updated_at
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
}
