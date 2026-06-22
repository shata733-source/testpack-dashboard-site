import { json, requireUser, ensureAuthTables, makePasswordHash, audit, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

function validRole(r) { r = clean(r).toLowerCase(); return ['admin','user','viewer'].includes(r) ? r : 'user'; }

export async function onRequestPost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin']); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok:false, error:'Invalid JSON body' }, 400); }
  const username = clean(body.username).toLowerCase();
  const displayName = clean(body.display_name || body.displayName || username);
  const role = validRole(body.role || 'user');
  const isActive = body.is_active === false || body.is_active === 0 || body.is_active === '0' ? 0 : 1;
  const password = clean(body.password || '');
  if (!username) return json({ ok:false, error:'Username is required' }, 400);
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) return json({ ok:false, error:'Username must be 3-50 chars: letters, numbers, dot, dash, underscore only' }, 400);
  const existing = await context.env.DB.prepare('SELECT username FROM users WHERE username=?').bind(username).first();
  if (!existing && !password) return json({ ok:false, error:'Password is required for new user' }, 400);
  if (password && password.length < 4) return json({ ok:false, error:'Password must be at least 4 characters' }, 400);

  if (existing) {
    if (password) {
      const ph = await makePasswordHash(password);
      await context.env.DB.prepare(`UPDATE users SET display_name=?, role=?, is_active=?, password_hash=?, password_salt=?, password_plain=NULL, updated_at=datetime('now') WHERE username=?`)
        .bind(displayName, role, isActive, ph.hash, ph.salt, username).run();
    } else {
      await context.env.DB.prepare(`UPDATE users SET display_name=?, role=?, is_active=?, updated_at=datetime('now') WHERE username=?`)
        .bind(displayName, role, isActive, username).run();
    }
    await audit(context.env, 'USER_UPDATED', auth.user, { username, displayName, role, isActive, passwordChanged: !!password }, { ip: getClientIP(context.request) });
  } else {
    const ph = await makePasswordHash(password);
    await context.env.DB.prepare(`INSERT INTO users(username, display_name, role, password_hash, password_salt, password_plain, is_active, created_by, created_at, updated_at)
      VALUES(?,?,?,?,?,NULL,?,?,datetime('now'),datetime('now'))`)
      .bind(username, displayName, role, ph.hash, ph.salt, isActive, auth.user.username || auth.user.sub || '').run();
    await audit(context.env, 'USER_CREATED', auth.user, { username, displayName, role, isActive }, { ip: getClientIP(context.request) });
  }
  return json({ ok:true });
}
