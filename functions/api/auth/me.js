import { json, verifyToken } from '../../_shared/auth.js';

export async function onRequestGet(context) {
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const user = await verifyToken(context.env, token);
  if (!user) return json({ ok: false, user: null }, 401);
  return json({ ok: true, user });
}
