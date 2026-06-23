import { json, requirePagePermission, ensureAuthTables, audit, getClientIP } from '../../_shared/auth.js';

function clean(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }
function assertDB(env) { return env && env.DB ? null : json({ ok:false, error:'D1 binding DB is not configured.' }, 500); }

async function handlePost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requirePagePermission(context, 'users', 'edit'); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok:false, error:'Invalid JSON body' }, 400); }
  const username = clean(body.username).toLowerCase();
  if (!username) return json({ ok:false, error:'Username is required' }, 400);
  if (username === clean(auth.user.username || auth.user.sub).toLowerCase()) return json({ ok:false, error:'You cannot disable your own account' }, 400);
  let isActive;
  if (body.is_active === undefined && body.active === undefined) {
    const u = await context.env.DB.prepare('SELECT is_active FROM users WHERE username=?').bind(username).first();
    isActive = u && Number(u.is_active) === 1 ? 0 : 1;
  } else {
    const v = body.is_active !== undefined ? body.is_active : body.active;
    isActive = (v === false || v === 0 || v === '0') ? 0 : 1;
  }
  await context.env.DB.prepare("UPDATE users SET is_active=?, updated_at=datetime('now') WHERE username=?").bind(isActive, username).run();
  await audit(context.env, isActive ? 'USER_ENABLED' : 'USER_DISABLED', auth.user, { username }, { ip: getClientIP(context.request) });
  return json({ ok:true, active: isActive === 1 });
}


export async function onRequestPost(context) {
  try { return await handlePost(context); }
  catch (e) {
    console.error('functions/api/users/toggle.js_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
