import { json, createToken, getClientIP, ensureAuthTables, verifyPasswordRecord, makePasswordHash, audit, normalizePagePermissions, userForClient, ensureBuiltInAdmin } from '../../_shared/auth.js';

function clean(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }

async function handlePost(context) {
  const { request, env } = context;
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const username = clean(body.username).toLowerCase();
  const password = clean(body.password);
  const ip = getClientIP(request);

  const adminUser = clean(env.ADMIN_USERNAME || 'ccc').toLowerCase();
  const adminPass = clean(env.ADMIN_PASSWORD || 'ccc2026');
  let user = null;
  let dbUserExists = false;

  // Safety admin: ccc / ccc2026 must always remain Admin, even if an old D1 row
  // was accidentally saved as Viewer/User or without page permissions.
  if (username === adminUser && password === adminPass) {
    user = env.DB
      ? await ensureBuiltInAdmin(env, adminUser, env.ADMIN_DISPLAY_NAME || 'Mohamed Shata')
      : userForClient({ username: adminUser, display_name: env.ADMIN_DISPLAY_NAME || 'Mohamed Shata', role: 'admin', is_active: 1, view_pages: normalizePagePermissions('admin').view_pages, edit_pages: normalizePagePermissions('admin').edit_pages });
  }

  if (!user && env.DB) {
    await ensureAuthTables(env);
    const u = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
    dbUserExists = !!u;
    const ok = u && Number(u.is_active) === 1 && await verifyPasswordRecord(u, password);
    if (ok) {
      user = userForClient(u);
      await env.DB.prepare("UPDATE users SET last_login_at=datetime('now'), last_login_ip=?, updated_at=datetime('now') WHERE username=?")
        .bind(ip, username).run().catch(() => null);
    }
  }

  // Built-in emergency admin. If this admin is not in D1 yet, create it once.
  if (!user && !dbUserExists && username === adminUser && password === adminPass) {
    const perms = normalizePagePermissions('admin');
    user = userForClient({ username: adminUser, display_name: env.ADMIN_DISPLAY_NAME || 'Mohamed Shata', role: 'admin', view_pages: perms.view_pages, edit_pages: perms.edit_pages, is_active: 1 });
    if (env.DB) {
      try {
        const ph = await makePasswordHash(adminPass);
        await env.DB.prepare(`INSERT INTO users(username, display_name, role, password_hash, password_salt, password_plain, is_active, view_pages, edit_pages, created_by, created_at, updated_at)
          VALUES(?,?,?,?,?,NULL,1,?,?, 'system',datetime('now'),datetime('now'))`)
          .bind(adminUser, user.display_name, 'admin', ph.hash, ph.salt, JSON.stringify(perms.view_pages), JSON.stringify(perms.edit_pages)).run();
      } catch (_) {}
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


export async function onRequestPost(context) {
  try {
    return await handlePost(context);
  } catch (e) {
    console.error('AUTH_LOGIN_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:'Login API error: '+(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
