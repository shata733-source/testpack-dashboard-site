import { json, requireUser, ensureAuthTables, audit, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

export async function onRequestPost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin']); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok:false, error:'Invalid JSON body' }, 400); }
  const username = clean(body.username).toLowerCase();
  const isActive = body.is_active === false || body.is_active === 0 || body.is_active === '0' ? 0 : 1;
  if (!username) return json({ ok:false, error:'Username is required' }, 400);
  await context.env.DB.prepare("UPDATE users SET is_active=?, updated_at=datetime('now') WHERE username=?").bind(isActive, username).run();
  await audit(context.env, isActive ? 'USER_ENABLED' : 'USER_DISABLED', auth.user, { username }, { ip: getClientIP(context.request) });
  return json({ ok:true });
}
