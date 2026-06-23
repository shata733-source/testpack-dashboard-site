import { json, requireUser, ensureAuthTables, makePasswordHash, verifyPasswordRecord, audit, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

export async function onRequestPost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin','user','viewer']); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok:false, error:'Invalid JSON body' }, 400); }
  const username = clean(auth.user.username || auth.user.sub).toLowerCase();
  const displayName = clean(body.display_name || body.displayName || auth.user.display_name || auth.user.name || username);
  const currentPassword = clean(body.current_password || body.currentPassword || '');
  const newPassword = clean(body.new_password || body.newPassword || '');

  let row = await context.env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  if (!row) {
    // Create a profile row for the built-in admin if it was not seeded yet.
    const role = clean(auth.user.role || 'user').toLowerCase();
    await context.env.DB.prepare(`INSERT INTO users(username, display_name, role, password_plain, is_active, created_by, created_at, updated_at)
      VALUES(?,?,?,?,1,'profile',datetime('now'),datetime('now'))`)
      .bind(username, displayName || username, role, '').run();
    row = await context.env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  }

  if (newPassword) {
    if (newPassword.length < 4) return json({ ok:false, error:'New password must be at least 4 characters' }, 400);
    // If the account has a password already, current password must match.
    if ((row.password_hash || row.password_plain) && !(await verifyPasswordRecord(row, currentPassword))) {
      return json({ ok:false, error:'Current password is incorrect' }, 400);
    }
    const ph = await makePasswordHash(newPassword);
    await context.env.DB.prepare(`UPDATE users SET display_name=?, password_hash=?, password_salt=?, password_plain=NULL, updated_at=datetime('now') WHERE username=?`)
      .bind(displayName, ph.hash, ph.salt, username).run();
    await audit(context.env, 'PROFILE_PASSWORD_CHANGED', auth.user, { username, displayName }, { ip: getClientIP(context.request) });
  } else {
    await context.env.DB.prepare(`UPDATE users SET display_name=?, updated_at=datetime('now') WHERE username=?`).bind(displayName, username).run();
    await audit(context.env, 'PROFILE_UPDATED', auth.user, { username, displayName }, { ip: getClientIP(context.request) });
  }
  const updated = await context.env.DB.prepare('SELECT username, display_name, role, is_active, updated_at, last_login_at FROM users WHERE username=?').bind(username).first();
  return json({ ok:true, user: updated });
}
