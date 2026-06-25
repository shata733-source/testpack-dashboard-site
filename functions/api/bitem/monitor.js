import { json, requirePagePermission } from '../../_shared/auth.js';
import { assertSupabase, sbFetch, clean } from '../../_shared/supabase.js';

function enc(v) { return encodeURIComponent(String(v || '')); }
function safeText(v) { return v === null || v === undefined ? '' : String(v); }
function parseJson(v) {
  if (!v) return {};
  if (typeof v === 'object') return v || {};
  try { return JSON.parse(String(v)); } catch (_) { return {}; }
}
function limitParam(url, name, def, max) {
  const n = Number(url.searchParams.get(name) || def);
  if (!Number.isFinite(n)) return def;
  return Math.max(1, Math.min(Math.trunc(n), max));
}
async function sbJson(env, path, init = {}) {
  const r = await sbFetch(env, path, init);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch (_) { throw new Error(`Supabase returned non-JSON (${r.status}): ${text.slice(0, 500)}`); }
  if (!r.ok) throw new Error(`Supabase request failed (${r.status}) ${path}: ${JSON.stringify(data).slice(0, 800)}`);
  return Array.isArray(data) ? data : (data ? [data] : []);
}
async function tryRows(env, path, init = {}) {
  try { return await sbJson(env, path, init); }
  catch (e) { console.warn('BITEM_MONITOR_OPTIONAL_QUERY_FAILED', path, e && (e.message || e)); return []; }
}
function uniq(arr) { return [...new Set((arr || []).map(x => clean(x)).filter(Boolean))]; }
function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function csvIn(values) { return values.map(v => enc(v)).join(','); }
function userKey(...vals) {
  for (const v of vals) {
    const s = clean(v);
    if (s) return s;
  }
  return 'Unknown User';
}
function displayName(row, fallback) {
  return clean(row.edited_by_name || row.display_name || row.user_cleared_by_name || row.last_edited_by_name || fallback || row.edited_by || row.username || row.user_cleared_by || row.last_edited_by || 'Unknown User');
}
function classifyFromValues(newValue, oldValue, details = {}, action = '') {
  const a = clean(action).toLowerCase();
  const d = details || {};
  if (a.includes('open') || a.includes('remove') || a.includes('clear_date') || d.clear_date === true || d.clearDate === true) return 'opened';
  const nv = clean(newValue ?? d.new_value ?? d.newValue ?? d.punch_cleared ?? d.punchCleared ?? d.value ?? d.date ?? '');
  const ov = clean(oldValue ?? d.old_value ?? d.oldValue ?? '');
  if (nv) return 'closed';
  if (!nv && ov) return 'opened';
  if (clean(d.punch_cleared) || clean(d.punchCleared)) return 'closed';
  return '';
}
function actionLabel(action) { return action === 'closed' ? 'Closed' : action === 'opened' ? 'Opened' : 'Edited'; }
function registryAction(r) {
  const ud = clean(r.user_cleared_date || '');
  if (ud) return 'closed';
  const fs = clean(r.final_status || '').toUpperCase();
  if (clean(r.last_edited_by || r.user_cleared_by || '') && !ud) return 'opened';
  return fs === 'CLEARED' ? 'closed' : 'opened';
}
function normRegistry(r) {
  const user = userKey(r.last_edited_by, r.user_cleared_by);
  const action = registryAction(r);
  return {
    source: 'registry',
    id: clean(r.bitem_id || r.id || r.fingerprint),
    bitem_id: clean(r.bitem_id || ''),
    fingerprint: clean(r.fingerprint || ''),
    user,
    display_name: displayName(r, user),
    action,
    action_label: actionLabel(action),
    edited_at: clean(r.last_edited_at || r.updated_at || r.user_cleared_date || ''),
    tp_no: clean(r.tp_no || ''),
    contractor: clean(r.contractor || ''),
    area: clean(r.area || ''),
    construction_stage: clean(r.construction_stage || ''),
    punch_category: clean(r.punch_category || ''),
    comment_text: clean(r.comment_text || ''),
    final_status: clean(r.final_status || ''),
    final_cleared_date: clean(r.final_cleared_date || ''),
    user_cleared_date: clean(r.user_cleared_date || ''),
    sync_note: clean(r.sync_note || ''),
    row: r
  };
}
function normEdit(e, registryMap) {
  const key = clean(e.bitem_id || e.id || '');
  const reg = registryMap.get(key) || registryMap.get(clean(e.fingerprint || '')) || {};
  const details = parseJson(e.details || e.remarks_json || '');
  const user = userKey(e.edited_by, e.username, e.user, e.created_by, reg.last_edited_by, reg.user_cleared_by);
  const action = classifyFromValues(e.new_value, e.old_value, details, e.action || e.remarks || '');
  return {
    source: 'edit',
    id: clean(e.id || `${key}-${e.created_at || ''}`),
    bitem_id: clean(e.bitem_id || reg.bitem_id || ''),
    fingerprint: clean(e.fingerprint || reg.fingerprint || ''),
    user,
    display_name: displayName(e, user),
    action: action || registryAction(reg),
    action_label: actionLabel(action || registryAction(reg)),
    edited_at: clean(e.created_at || e.edited_at || reg.last_edited_at || ''),
    field_name: clean(e.field_name || ''),
    old_value: safeText(e.old_value || ''),
    new_value: safeText(e.new_value || ''),
    remarks: clean(e.remarks || ''),
    tp_no: clean(reg.tp_no || ''),
    contractor: clean(reg.contractor || ''),
    area: clean(reg.area || ''),
    construction_stage: clean(reg.construction_stage || ''),
    punch_category: clean(reg.punch_category || ''),
    comment_text: clean(reg.comment_text || ''),
    final_status: clean(reg.final_status || ''),
    final_cleared_date: clean(reg.final_cleared_date || ''),
    user_cleared_date: clean(reg.user_cleared_date || ''),
    row: e
  };
}
function normAudit(a, registryMap) {
  const details = parseJson(a.details || {});
  const key = clean(a.bitem_id || details.bitem_id || details.bitemId || '');
  const reg = registryMap.get(key) || registryMap.get(clean(a.fingerprint || details.fingerprint || '')) || {};
  const user = userKey(a.username, details.editor_username, details.edited_by, reg.last_edited_by, reg.user_cleared_by);
  const action = classifyFromValues(details.new_value, details.old_value, details, a.action || '');
  return {
    source: 'audit',
    id: clean(a.id || `${key}-${a.created_at || ''}`),
    bitem_id: clean(a.bitem_id || details.bitem_id || reg.bitem_id || ''),
    fingerprint: clean(a.fingerprint || details.fingerprint || reg.fingerprint || ''),
    user,
    display_name: displayName(a, user),
    action: action || registryAction(reg),
    action_label: actionLabel(action || registryAction(reg)),
    edited_at: clean(a.created_at || reg.last_edited_at || ''),
    tp_no: clean(reg.tp_no || details.tp_no || ''),
    contractor: clean(reg.contractor || details.contractor || ''),
    area: clean(reg.area || details.area || ''),
    construction_stage: clean(reg.construction_stage || details.construction_stage || ''),
    punch_category: clean(reg.punch_category || details.punch_category || ''),
    comment_text: clean(reg.comment_text || details.comment_text || details.comment || ''),
    final_status: clean(reg.final_status || ''),
    final_cleared_date: clean(reg.final_cleared_date || ''),
    user_cleared_date: clean(reg.user_cleared_date || ''),
    details,
    action_raw: clean(a.action || ''),
    row: a
  };
}
function looksLikeUserAudit(a) {
  const action = clean(a.action || '').toUpperCase();
  if (!action) return false;
  if (action.includes('SYNC')) return false;
  if (action.includes('LOGIN') || action.includes('USER_') || action.includes('USERS_')) return false;
  if (action.includes('BITEM') || action.includes('PUNCH') || action.includes('EDIT') || action.includes('SAVE') || action.includes('CLEAR')) return true;
  const d = parseJson(a.details || {});
  return !!(clean(a.bitem_id || d.bitem_id || d.bitemId || '') || clean(a.fingerprint || d.fingerprint || ''));
}
function makeSummary(events, comments) {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monthKey = todayKey.slice(0, 7);
  const base = events.length ? events : comments;
  const users = new Map();
  const daily = new Map();
  let closed = 0, opened = 0, today = 0, week = 0, month = 0;
  for (const r of base) {
    const action = r.action === 'closed' ? 'closed' : r.action === 'opened' ? 'opened' : 'edited';
    if (action === 'closed') closed++;
    if (action === 'opened') opened++;
    const user = clean(r.user || r.display_name || 'Unknown User');
    if (!users.has(user)) users.set(user, { user, display_name: clean(r.display_name || user), total: 0, closed: 0, opened: 0, today: 0, week: 0, month: 0 });
    const u = users.get(user);
    u.total++;
    if (action === 'closed') u.closed++;
    if (action === 'opened') u.opened++;
    const dt = r.edited_at ? new Date(r.edited_at) : null;
    if (dt && !Number.isNaN(dt.getTime())) {
      const dkey = dt.toISOString().slice(0, 10);
      daily.set(dkey, (daily.get(dkey) || 0) + 1);
      if (dkey === todayKey) { today++; u.today++; }
      if ((now - dt) <= weekMs && (now - dt) >= 0) { week++; u.week++; }
      if (dkey.slice(0, 7) === monthKey) { month++; u.month++; }
    }
  }
  return {
    total_events: base.length,
    modified_comments: comments.length,
    closed,
    opened,
    today,
    week,
    month,
    users_count: users.size,
    users: [...users.values()].sort((a, b) => b.total - a.total || a.user.localeCompare(b.user)),
    daily: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }))
  };
}

async function fetchRegistryByIds(env, ids) {
  const cols = 'bitem_id,fingerprint,contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,query_status,query_cleared_date,final_status,final_cleared_date,user_cleared_date,user_cleared_by,last_edited_by,last_edited_at,source_flag,sync_note,active,updated_at';
  const map = new Map();
  for (const part of chunks(uniq(ids).slice(0, 1000), 80)) {
    const rows = await tryRows(env, `/rest/v1/bitem_registry?select=${cols}&bitem_id=in.(${csvIn(part)})&limit=1000`);
    for (const r of rows) {
      if (clean(r.bitem_id)) map.set(clean(r.bitem_id), r);
      if (clean(r.fingerprint)) map.set(clean(r.fingerprint), r);
    }
  }
  return map;
}

async function handleGet(context) {
  const sbError = assertSupabase(context.env); if (sbError) return sbError;
  const auth = await requirePagePermission(context, 'bitem-monitoring', 'view');
  if (auth.error) return auth.error;

  const url = new URL(context.request.url);
  const limit = limitParam(url, 'limit', 2000, 5000);
  const eventLimit = limitParam(url, 'event_limit', 3000, 8000);
  const cols = 'bitem_id,fingerprint,contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,query_status,query_cleared_date,final_status,final_cleared_date,user_cleared_date,user_cleared_by,last_edited_by,last_edited_at,source_flag,sync_note,active,updated_at';

  // Current user-modified B comments. This is the light source for the table.
  let registryRows = await tryRows(context.env, `/rest/v1/bitem_registry?select=${cols}&last_edited_at=not.is.null&order=last_edited_at.desc.nullslast&limit=${limit}`);
  if (!registryRows.length) {
    registryRows = await tryRows(context.env, `/rest/v1/bitem_registry?select=${cols}&user_cleared_by=not.is.null&order=updated_at.desc.nullslast&limit=${limit}`);
  }

  // True edit history if the table exists / the RPC writes to it. Optional by design.
  const editRows = await tryRows(context.env, `/rest/v1/bitem_user_edits?select=*&order=created_at.desc&limit=${eventLimit}`);
  const auditRowsRaw = await tryRows(context.env, `/rest/v1/bitem_audit_log?select=*&order=created_at.desc&limit=${eventLimit}`);
  const auditRows = auditRowsRaw.filter(looksLikeUserAudit);

  const ids = [];
  for (const r of registryRows) ids.push(r.bitem_id);
  for (const r of editRows) ids.push(r.bitem_id);
  for (const r of auditRows) {
    ids.push(r.bitem_id);
    const d = parseJson(r.details || {});
    ids.push(d.bitem_id || d.bitemId);
  }
  const registryMap = await fetchRegistryByIds(context.env, ids);
  for (const r of registryRows) {
    if (clean(r.bitem_id)) registryMap.set(clean(r.bitem_id), r);
    if (clean(r.fingerprint)) registryMap.set(clean(r.fingerprint), r);
  }

  const comments = registryRows.map(normRegistry).filter(r => r.user && r.user !== 'Unknown User');
  let events = editRows.map(r => normEdit(r, registryMap));
  if (!events.length && auditRows.length) events = auditRows.map(r => normAudit(r, registryMap));
  events = events
    .filter(r => r.user && r.user !== 'Unknown User')
    .filter(r => r.bitem_id || r.fingerprint || r.comment_text)
    .sort((a, b) => String(b.edited_at || '').localeCompare(String(a.edited_at || '')));

  const summary = makeSummary(events, comments);
  return json({
    ok: true,
    source: 'Supabase',
    generated_at: new Date().toISOString(),
    current_user: auth.user,
    summary,
    comments,
    events,
    meta: {
      registry_rows: registryRows.length,
      edit_rows: editRows.length,
      audit_rows: auditRows.length,
      event_source: editRows.length ? 'bitem_user_edits' : (auditRows.length ? 'bitem_audit_log' : 'bitem_registry_current_state')
    }
  });
}

export async function onRequestGet(context) {
  try { return await handleGet(context); }
  catch (e) {
    console.error('BITEM_MONITOR_SUPABASE_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'Supabase', endpoint:'monitor', error:(e && e.message) ? e.message : String(e || 'Unknown error') }, 500);
  }
}
