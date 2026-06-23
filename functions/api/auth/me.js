import { json, verifyToken, getDbUser } from '../../_shared/auth.js';

async function handleGet(context) {
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const tokenUser = await verifyToken(context.env, token);
  if (!tokenUser) return json({ ok: false, user: null }, 401);
  const user = await getDbUser(context.env, tokenUser);
  if (!user) return json({ ok: false, user: null, error: 'Unauthorized or disabled account' }, 401);
  return json({ ok: true, user });
}


export async function onRequestGet(context) {
  try { return await handleGet(context); }
  catch (e) {
    console.error('AUTH_ME_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, user:null, error:'Auth API error: '+(e && e.message ? e.message : String(e || 'Unknown error')) }, 500);
  }
}
