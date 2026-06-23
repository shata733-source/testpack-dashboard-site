import { json, requirePagePermission, ensureAuthTables, makePasswordHash, audit, getClientIP, normalizePagePermissions } from '../../_shared/auth.js';

function clean(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function assertDB(env) { return env && env.DB ? null : json({ ok:false, error:'D1 binding DB is not configured.' }, 500); }

function validRole(r) { r = clean(r).toLowerCase(); return ['admin','user','viewer'].includes(r) ? r : 'user'; }

export async function onRequestPost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requirePagePermission(context, 'users', 'edit'); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok:false, error:'Invalid JSON body' }, 400); }
  const username = clean(body.username).toLowerCase();
  const displayName = clean(body.display_name || body.displayName || username);
  const role = validRole(body.role || 'user');
  const isActive = body.is_active === false || body.is_active === 0 || body.is_active === '0' ? 0 : 1;
  const password = clean(body.password || '');
  const perms = normalizePagePermissions(role, body.view_pages ?? body.viewPages, body.edit_pages ?? body.editPages);

  if (!username) return json({ ok:false, error:'Username is required' }, 400);
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) return json({ ok:false, error:'Username must be 3-50 chars: letters, numbers, dot, dash, underscore only' }, 400);
  const existing = await context.env.DB.prepare('SELECT username FROM users WHERE username=?').bind(username).first();
  if (!existing && !password) return json({ ok:false, error:'Password is required for new user' }, 400);
  if (password && password.length < 4) return json({ ok:false, error:'Password must be at least 4 characters' }, 400);

  const viewJson = JSON.stringify(perms.view_pages);
  const editJson = JSON.stringify(perms.edit_pages);

  if (existing) {
    if (password) {
      const ph = await makePasswordHash(password);
      await context.env.DB.prepare(`UPDATE users SET display_name=?, role=?, is_active=?, view_pages=?, edit_pages=?, password_hash=?, password_salt=?, password_plain=NULL, updated_at=datetime('now') WHERE username=?`)
        .bind(displayName, role, isActive, viewJson, editJson, ph.hash, ph.salt, username).run();
    } else {
      await context.env.DB.prepare(`UPDATE users SET display_name=?, role=?, is_active=?, view_pages=?, edit_pages=?, updated_at=datetime('now') WHERE username=?`)
        .bind(displayName, role, isActive, viewJson, editJson, username).run();
    }
    await audit(context.env, 'USER_UPDATED', auth.user, { username, displayName, role, isActive, view_pages: perms.view_pages, edit_pages: perms.edit_pages, passwordChanged: !!password }, { ip: getClientIP(context.request) });
  } else {
    const ph = await makePasswordHash(password);
    await context.env.DB.prepare(`INSERT INTO users(username, display_name, role, password_hash, password_salt, password_plain, is_active, view_pages, edit_pages, created_by, created_at, updated_at)
      VALUES(?,?,?,?,?,NULL,?,?,?,?,datetime('now'),datetime('now'))`)
      .bind(username, displayName, role, ph.hash, ph.salt, isActive, viewJson, editJson, auth.user.username || auth.user.sub || '').run();
    await audit(context.env, 'USER_CREATED', auth.user, { username, displayName, role, isActive, view_pages: perms.view_pages, edit_pages: perms.edit_pages }, { ip: getClientIP(context.request) });
  }
  return json({ ok:true, view_pages: perms.view_pages, edit_pages: perms.edit_pages });
}
