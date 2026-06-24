import { json, requirePagePermission, ensureAuthTables, audit, getClientIP, userForClient } from '../../_shared/auth.js';

function clean(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function assertDB(env) { return env && env.DB ? null : json({ ok:false, error:'D1 binding DB is not configured.' }, 500); }

async function handleGet(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requirePagePermission(context, 'users', 'view'); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  const url = new URL(context.request.url);
  const q = clean(url.searchParams.get('q') || '');
  const where = [];
  const binds = [];
  if (q) { where.push('(username LIKE ? OR display_name LIKE ? OR role LIKE ?)'); const like = `%${q}%`; binds.push(like, like, like); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await context.env.DB.prepare(`
    SELECT username, display_name, role, is_active, view_pages, edit_pages, created_by, created_at, updated_at, last_login_at, last_login_ip
    FROM users ${whereSql}
    ORDER BY is_active DESC, username COLLATE NOCASE ASC
  `).bind(...binds).all();
  await audit(context.env, 'USERS_LIST', auth.user, { q }, { ip: getClientIP(context.request) });
  const users = (rows.results || []).map(u => {
    const c = userForClient(u);
    return { ...u, ...c, active: Number(u.is_active) === 1 };
  });
  return json({ ok: true, users, rows: users });
}


export async function onRequestGet(context) {
  try { return await handleGet(context); }
  catch (e) {
    console.error('functions/api/users/list.js_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
