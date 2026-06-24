import { json } from './auth.js';

export function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

export function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  return { url, key };
}

export function assertSupabase(env) {
  const { url, key } = supabaseConfig(env || {});
  if (!url || !key) return json({ ok:false, source:'Supabase', error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  return null;
}

export async function sbFetch(env, path, init = {}) {
  const { url, key } = supabaseConfig(env);
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  const headers = new Headers(init.headers || {});
  headers.set('apikey', key);
  headers.set('authorization', `Bearer ${key}`);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  return fetch(`${url}${path}`, { ...init, headers });
}

export async function sbRpc(env, fnName, args = {}) {
  const r = await sbFetch(env, `/rest/v1/rpc/${encodeURIComponent(fnName)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args || {})
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch (_) { throw new Error(`Supabase returned non-JSON (${r.status}): ${text.slice(0, 800)}`); }
  if (!r.ok) {
    const msg = typeof data === 'object' && data ? JSON.stringify(data) : String(text || r.statusText);
    throw new Error(`Supabase RPC ${fnName} failed (${r.status}): ${msg.slice(0, 1200)}`);
  }
  return data;
}

export function boolParam(url, name, def = false) {
  const v = String(url.searchParams.get(name) || '').toLowerCase();
  if (!v) return def;
  return ['1','true','yes','y'].includes(v);
}

export function intParam(url, names, def, min, max) {
  const list = Array.isArray(names) ? names : [names];
  let v = '';
  for (const n of list) { if (url.searchParams.has(n)) { v = url.searchParams.get(n); break; } }
  let n = Number(v || def);
  if (!Number.isFinite(n)) n = def;
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return Math.trunc(n);
}

export function pageArgs(url) {
  return {
    p_limit: intParam(url, ['limit','pageSize'], 100, 1, 500),
    p_offset: intParam(url, 'offset', 0, 0, 100000000),
    p_include_removed: boolParam(url, 'include_removed', false),
    p_q: clean(url.searchParams.get('q') || ''),
    p_contractor: clean(url.searchParams.get('contractor') || 'ALL') || 'ALL',
    p_area: clean(url.searchParams.get('area') || ''),
    p_stage: clean(url.searchParams.get('stage') || ''),
    p_final_status: clean(url.searchParams.get('final_status') || url.searchParams.get('status') || 'ALL') || 'ALL'
  };
}

export function kpiArgs(url) {
  return {
    p_include_removed: boolParam(url, 'include_removed', false),
    p_q: clean(url.searchParams.get('q') || ''),
    p_contractor: clean(url.searchParams.get('contractor') || 'ALL') || 'ALL',
    p_area: clean(url.searchParams.get('area') || ''),
    p_stage: clean(url.searchParams.get('stage') || ''),
    p_final_status: clean(url.searchParams.get('final_status') || url.searchParams.get('status') || 'ALL') || 'ALL'
  };
}

export function stageArgs(url) {
  return {
    p_q: clean(url.searchParams.get('q') || ''),
    p_contractor: clean(url.searchParams.get('contractor') || 'ALL') || 'ALL',
    p_area: clean(url.searchParams.get('area') || ''),
    p_stage: clean(url.searchParams.get('stage') || '')
  };
}
