import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertSupabase, appendCommonFilters, sbSelect, clean } from '../../_shared/supabase.js';

const PAGE_CACHE = globalThis.__BITEM_SUPABASE_PAGE_CACHE__ || (globalThis.__BITEM_SUPABASE_PAGE_CACHE__ = new Map());
const PAGE_TTL_MS = 6000;
const PAGE_CACHE_MAX = 250;

function cacheKeyFromUrl(url, username) {
  const keys = ['limit','pageSize','offset','include_removed','q','contractor','area','stage','final_status'];
  return String(username || 'anon') + '|' + keys.map(k => `${k}=${url.searchParams.get(k) || ''}`).join('&');
}
function cacheGet(key) {
  const hit = PAGE_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > PAGE_TTL_MS) { PAGE_CACHE.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data) {
  if (PAGE_CACHE.size >= PAGE_CACHE_MAX) {
    const first = PAGE_CACHE.keys().next().value;
    if (first) PAGE_CACHE.delete(first);
  }
  PAGE_CACHE.set(key, { ts: Date.now(), data });
}

export async function onRequestGet(context) {
  try {
    const sbError = assertSupabase(context.env); if (sbError) return sbError;
    const auth = await requirePagePermission(context, 'bitem', 'view');
    if (auth.error) return auth.error;

    const url = new URL(context.request.url);
    const noCache = url.searchParams.get('no_cache') === '1' || url.searchParams.get('force') === '1';
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || url.searchParams.get('pageSize') || 100), 1), 500);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);
    const key = cacheKeyFromUrl(url, auth.user && (auth.user.username || auth.user.sub));

    if (!noCache) {
      const cached = cacheGet(key);
      if (cached) return json({ ...cached, cached: true, endpoint: 'page-v63-supabase' });
    }

    const params = new URLSearchParams();
    params.set('select', [
      'bitem_id','fingerprint','contractor:effective_contractor','tp_no','construction_stage','punch_category',
      'comment_text','material_type','iso_or_spool','area','query_status','query_cleared_date','final_status','final_cleared_date',
      'user_cleared_date','user_cleared_by','last_edited_by','last_edited_at','source_flag','sync_note','active','row_json','updated_at'
    ].join(','));
    appendCommonFilters(params, url);
    params.set('order', 'tp_no.asc,bitem_id.asc,fingerprint.asc');

    const { rows, count } = await sbSelect(context.env, 'bitem_registry_effective', params, { from: offset, to: offset + limit - 1, count: true });
    const payload = { ok: true, total: count ?? rows.length, limit, offset, rows, cached: false, endpoint: 'page-v63-supabase', source:'Supabase' };
    cacheSet(key, payload);
    return json(payload);
  } catch (e) {
    console.error('BITEM_SUPABASE_PAGE_GET_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, endpoint:'page-v63-supabase', source:'Supabase', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
