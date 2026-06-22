import { json, createToken, getClientIP, ensureAuthTables, verifyPasswordRecord, audit } from '../../_shared/auth.js';
import { clean } from '../../_shared/bitem.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const username = clean(body.username);
  const password = clean(body.password);
  const ip = getClientIP(request);

  const adminUser = env.ADMIN_USERNAME || 'ccc';
  const adminPass = env.ADMIN_PASSWORD || 'ccc2026';

  let user = null;
  if (username === adminUser && password === adminPass) {
    user = { username, display_name: env.ADMIN_DISPLAY_NAME || 'Mohamed Shata', role: 'admin' };
  } else if (env.DB) {
    await ensureAuthTables(env);
    const u = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
    const ok = u && Number(u.is_active) === 1 && await verifyPasswordRecord(u, password);
    if (ok) {
      user = { username: u.username, display_name: u.display_name || u.username, role: u.role || 'user' };
      await env.DB.prepare("UPDATE users SET last_login_at=datetime('now'), last_login_ip=?, updated_at=datetime('now') WHERE username=?")
        .bind(ip, username).run().catch(() => null);
    }
  }

  if (!user) {
    if (env.DB) await audit(env, 'LOGIN_FAILED', { username, display_name: username, role: '' }, { username, ip, userAgent: request.headers.get('user-agent') || '' }, { ip });
    return json({ ok: false, error: 'Invalid username or password' }, 401);
  }

  const token = await createToken(env, user);
  if (env.DB) await audit(env, 'LOGIN', user, { userAgent: request.headers.get('user-agent') || '' }, { ip });
  return json({ ok: true, token, user });
}
