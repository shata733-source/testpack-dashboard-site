import { json, requireUser } from '../../_shared/auth.js';

function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  return { url, key };
}

async function supabaseFetch(env, path, init = {}) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
}

function parseCount(contentRange) {
  const s = String(contentRange || '');
  const m = s.match(/\/(\d+|\*)$/);
  if (!m || m[1] === '*') return null;
  return Number(m[1]);
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context, ['admin']);
    if (auth.error) return auth.error;

    const cfg = supabaseConfig(context.env);
    if (!cfg.url || !cfg.key) {
      return json({ ok:false, error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
    }

    const r = await supabaseFetch(context.env, '/rest/v1/bitem_registry?select=id&limit=1', {
      method: 'GET',
      headers: { prefer: 'count=exact' }
    });
    const txt = await r.text();
    const count = parseCount(r.headers.get('content-range'));

    if (!r.ok) {
      return json({ ok:false, status:r.status, error:txt.slice(0, 500) }, 500);
    }

    return json({ ok:true, supabase:true, table:'bitem_registry', count, sample: txt ? JSON.parse(txt) : [] });
  } catch (e) {
    return json({ ok:false, error:e && e.message ? e.message : String(e) }, 500);
  }
}
