import { json, requireUser, ensureAuthTables, audit, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

export async function onRequestGet(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin']); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  const url = new URL(context.request.url);
  const q = clean(url.searchParams.get('q') || '');
  const where = [];
  const binds = [];
  if (q) { where.push('(username LIKE ? OR display_name LIKE ? OR role LIKE ?)'); const like = `%${q}%`; binds.push(like, like, like); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await context.env.DB.prepare(`
    SELECT username, display_name, role, is_active, created_by, created_at, updated_at, last_login_at, last_login_ip
    FROM users ${whereSql}
    ORDER BY is_active DESC, username COLLATE NOCASE ASC
  `).bind(...binds).all();
  await audit(context.env, 'USERS_LIST', auth.user, { q }, { ip: getClientIP(context.request) });
  return json({ ok: true, rows: rows.results || [] });
}
