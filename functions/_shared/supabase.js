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
  if (!url || !key) return json({ ok:false, error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
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

export async function sbJson(env, path, init = {}) {
  const r = await sbFetch(env, path, init);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) {
    const msg = typeof data === 'object' && data ? JSON.stringify(data) : String(text || r.statusText);
    throw new Error(`Supabase ${r.status}: ${msg.slice(0, 1200)}`);
  }
  return { data, response: r, text };
}

export function parseContentRange(header) {
  const s = String(header || '');
  const m = s.match(/\/(\d+|\*)$/);
  return m && m[1] !== '*' ? Number(m[1]) : null;
}

export function restValue(v) {
  return encodeURIComponent(clean(v));
}

export function sanitizeLike(v) {
  return clean(v).replace(/[*,()]/g, ' ').slice(0, 160);
}

export function appendCommonFilters(params, url, opts = {}) {
  const includeRemoved = url.searchParams.get('include_removed') === '1';
  const q = sanitizeLike(url.searchParams.get('q') || '');
  const contractor = clean(url.searchParams.get('contractor') || '');
  const area = clean(url.searchParams.get('area') || '');
  const stage = clean(url.searchParams.get('stage') || '');
  const finalStatus = clean(url.searchParams.get('final_status') || url.searchParams.get('status') || '');

  if (!includeRemoved) params.set('active', 'eq.1');
  if (q) params.set('search_blob', `ilike.*${q}*`);
  if (contractor && contractor.toUpperCase() !== 'ALL') {
    if (/JGC/i.test(contractor)) params.set('effective_contractor', 'eq.JGC Direct MP');
    else if (/CCC/i.test(contractor)) params.set('effective_contractor', 'eq.CCC');
  }
  if (area && area.toUpperCase() !== 'ALL') {
    // Area filter in the old dashboard may be a group/string; ilike preserves old behavior.
    params.set('area', `ilike.*${sanitizeLike(area)}*`);
  }
  if (stage && stage.toUpperCase() !== 'ALL') params.set('construction_stage', `eq.${stage}`);
  if (finalStatus && finalStatus.toUpperCase() !== 'ALL') {
    if (finalStatus.toUpperCase() === 'CLEARED') params.set('final_status', 'eq.CLEARED');
    else params.set('final_status', 'not.eq.CLEARED');
  }
  return params;
}

export async function sbSelect(env, table, params, { from = 0, to = 99, count = false } = {}) {
  const qs = params.toString();
  const headers = new Headers();
  headers.set('range', `${from}-${to}`);
  if (count) headers.set('prefer', 'count=exact');
  const r = await sbFetch(env, `/rest/v1/${table}?${qs}`, { method:'GET', headers });
  const text = await r.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch (_) { throw new Error(`Supabase returned non-JSON (${r.status}): ${text.slice(0,500)}`); }
  if (!r.ok && r.status !== 206) throw new Error(`Supabase select failed (${r.status}): ${text.slice(0,1000)}`);
  return { rows: Array.isArray(data) ? data : [], count: parseContentRange(r.headers.get('content-range')), response: r };
}

export async function sbCount(env, table, params) {
  const p = new URLSearchParams(params.toString());
  if (!p.has('select')) p.set('select', 'id');
  const headers = new Headers();
  headers.set('prefer', 'count=exact');
  headers.set('range', '0-0');
  const r = await sbFetch(env, `/rest/v1/${table}?${p.toString()}`, { method:'HEAD', headers });
  if (!r.ok && r.status !== 206) {
    const t = await r.text().catch(()=>'');
    throw new Error(`Supabase count failed (${r.status}): ${t.slice(0,500)}`);
  }
  return parseContentRange(r.headers.get('content-range')) || 0;
}

export async function sbSelectAll(env, table, params, { pageSize = 1000, maxRows = 50000 } = {}) {
  let out = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { rows } = await sbSelect(env, table, params, { from, to: from + pageSize - 1 });
    out = out.concat(rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
