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
  if (username === clean(auth.user.username || auth.user.sub).toLowerCase()) return json({ ok:false, error:'You cannot delete your own account' }, 400);
  await context.env.DB.prepare('DELETE FROM users WHERE username=?').bind(username).run();
  await audit(context.env, 'USER_DELETED', auth.user, { username }, { ip: getClientIP(context.request) });
  return json({ ok:true });
}


export async function onRequestPost(context) {
  try { return await handlePost(context); }
  catch (e) {
    console.error('functions/api/users/delete.js_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, error:(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
