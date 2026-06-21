import { json, createToken, getClientIP } from '../../_shared/auth.js';
import { clean } from '../../_shared/bitem.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const username = clean(body.username);
  const password = clean(body.password);

  const adminUser = env.ADMIN_USERNAME || 'ccc';
  const adminPass = env.ADMIN_PASSWORD || 'ccc2026';

  let user = null;
  if (username === adminUser && password === adminPass) {
    user = { username, display_name: env.ADMIN_DISPLAY_NAME || 'System Admin', role: 'admin' };
  } else if (env.DB) {
    const u = await env.DB.prepare('SELECT username, display_name, role, password_plain, is_active FROM users WHERE username=?')
      .bind(username).first();
    if (u && Number(u.is_active) === 1 && u.password_plain === password) {
      user = { username: u.username, display_name: u.display_name || u.username, role: u.role || 'user' };
    }
  }

  if (!user) return json({ ok: false, error: 'Invalid username or password' }, 401);

  const token = await createToken(env, user);
  if (env.DB) {
    await env.DB.prepare('INSERT INTO bitem_audit_log(action, username, display_name, role, ip, details, created_at) VALUES(?,?,?,?,?,?,datetime(\'now\'))')
      .bind('LOGIN', user.username, user.display_name, user.role, getClientIP(request), JSON.stringify({ userAgent: request.headers.get('user-agent') || '' })).run()
      .catch(() => null);
  }
  return json({ ok: true, token, user });
}
