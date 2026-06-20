import { json, requireUser } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

export async function onRequestGet(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin']);
  if (auth.error) return auth.error;
  const url = new URL(context.request.url);
  const q = clean(url.searchParams.get('q') || '');
  const limit = Math.min(Number(url.searchParams.get('limit') || 500), 2000);
  const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
  const where = [];
  const binds = [];
  if (q) {
    where.push('(action LIKE ? OR bitem_id LIKE ? OR username LIKE ? OR details LIKE ?)');
    const like = `%${q}%`; binds.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await context.env.DB.prepare(`
    SELECT id, action, bitem_id, fingerprint, username, display_name, role, ip, details, created_at
    FROM bitem_audit_log
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all();
  return json({ ok: true, rows: rows.results || [], limit, offset });
}
