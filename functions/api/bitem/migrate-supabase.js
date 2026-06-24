import { json, requireUser } from '../../_shared/auth.js';

const FIELDS = [
  'bitem_id','fingerprint','contractor','tp_no','construction_stage','punch_category','comment_text','material_type','iso_or_spool','area',
  'query_status','query_cleared_date','final_status','final_cleared_date','user_cleared_date','user_cleared_by','last_edited_by','last_edited_at',
  'source_flag','sync_note','active','first_seen_at','last_seen_at','last_sync_id','row_json','updated_at'
];

function clean(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

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

function parseRowJson(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch (_) { return { raw: String(v) }; }
}

function normalizeRow(r) {
  const out = {};
  for (const f of FIELDS) {
    if (f === 'row_json') out[f] = parseRowJson(r[f]);
    else if (f === 'active') out[f] = Number(r[f] ?? 1) === 0 ? 0 : 1;
    else out[f] = clean(r[f]);
  }
  if (!out.updated_at) out.updated_at = new Date().toISOString();
  return out;
}

async function getD1Columns(env) {
  const res = await env.DB.prepare('PRAGMA table_info(bitem_registry)').all();
  return new Set((res.results || []).map(r => r.name));
}

function selectSql(cols) {
  return FIELDS.map(f => cols.has(f) ? f : `NULL AS ${f}`).join(', ');
}

async function upsertRows(env, rows, conflictCol) {
  if (!rows.length) return { ok:true, count:0 };
  const path = `/rest/v1/bitem_registry?on_conflict=${encodeURIComponent(conflictCol)}`;
  const r = await supabaseFetch(env, path, {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  const txt = await r.text();
  if (!r.ok) {
    throw new Error(`Supabase upsert failed (${r.status}): ${txt.slice(0, 800)}`);
  }
  return { ok:true, count:rows.length };
}

export async function onRequestGet(context) {
  try {
    const auth = await requireUser(context, ['admin']);
    if (auth.error) return auth.error;
    if (!context.env.DB) return json({ ok:false, error:'Missing D1 DB binding' }, 500);

    const url = new URL(context.request.url);
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 200)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
    const dryRun = ['1','true','yes'].includes(String(url.searchParams.get('dry') || '').toLowerCase());

    const countRow = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM bitem_registry').first();
    const total = Number(countRow?.n || 0);

    const cols = await getD1Columns(context.env);
    const sql = `SELECT ${selectSql(cols)} FROM bitem_registry ORDER BY rowid LIMIT ? OFFSET ?`;
    const res = await context.env.DB.prepare(sql).bind(limit, offset).all();
    const d1Rows = res.results || [];
    const rows = d1Rows.map(normalizeRow).filter(r => r.fingerprint || r.bitem_id);

    let migrated = 0;
    let skipped = d1Rows.length - rows.length;
    if (!dryRun && rows.length) {
      const withFp = rows.filter(r => r.fingerprint);
      const noFp = rows.filter(r => !r.fingerprint && r.bitem_id);
      if (withFp.length) { await upsertRows(context.env, withFp, 'fingerprint'); migrated += withFp.length; }
      if (noFp.length) { await upsertRows(context.env, noFp, 'bitem_id'); migrated += noFp.length; }
    }

    const nextOffset = offset + d1Rows.length;
    return json({
      ok:true,
      dryRun,
      source:'D1',
      target:'Supabase',
      total,
      offset,
      limit,
      read:d1Rows.length,
      migrated: dryRun ? 0 : migrated,
      skipped,
      nextOffset,
      done: nextOffset >= total,
      nextUrl: nextOffset >= total ? '' : `/api/bitem/migrate-supabase?offset=${nextOffset}&limit=${limit}`
    });
  } catch (e) {
    return json({ ok:false, error:e && e.message ? e.message : String(e) }, 500);
  }
}
