import { json, requireUser, ensureAuthTables, audit, getClientIP } from '../../_shared/auth.js';
import { assertDB, clean } from '../../_shared/bitem.js';

export async function onRequestPost(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin']); if (auth.error) return auth.error;
  await ensureAuthTables(context.env);
  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok:false, error:'Invalid JSON body' }, 400); }
  const username = clean(body.username).toLowerCase();
  if (!username) return json({ ok:false, error:'Username is required' }, 400);
  await context.env.DB.prepare('DELETE FROM users WHERE username=?').bind(username).run();
  await audit(context.env, 'USER_DELETED', auth.user, { username }, { ip: getClientIP(context.request) });
  return json({ ok:true });
}
