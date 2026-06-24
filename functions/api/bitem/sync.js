import { json, requireUser } from '../../_shared/auth.js';
import {
  clean, tpNo, constructionStage, punchCategory,
  deriveContractor, commentText, materialType, isoOrSpool, sheetNo, rowArea,
  isBItemRow, fingerprint, buildTpStatusMap, queryCleared, finalDecision
} from '../../_shared/bitem.js';
import { assertSupabase, sbFetch } from '../../_shared/supabase.js';

const MAX_IN_PARAMS = 80;

function nowIso() { return new Date().toISOString(); }
function s(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}
function enc(v) { return encodeURIComponent(String(v || '')); }
function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function displayIdFromCounter(contractor, tp, seq) {
  const c = contractor || 'JGC';
  const t = tp || 'NO-TP';
  return `${c}-B-${t}-C${String(seq).padStart(3, '0')}`;
}
function compactRow(row) {
  const keepNames = [
    'TP NUMBER', 'TestPackNo', 'Test Pack No', 'TP No',
    'Construction Stage', 'Stage', 'Current Stage',
    'Date', 'Area', 'ISO No.', 'ISO No', 'Sheet No.',
    'Punch Category\n(A/B/C)', 'Punch Category (A/B/C)', 'Punch Category', 'Punch Catergory',
    'Material TYPE', 'Material Type', 'Punch Item Type',
    'Comments', 'Comment', 'Punch Description', 'Punch Item',
    'Punch Cleared', 'Punched Cleared', 'Punch Clear Date',
    'CCC / JGC Direct MP', 'Contractor', 'Scope', 'Subcon'
  ];
  const out = {};
  const keys = Object.keys(row || {});
  const nk = (x) => clean(x).toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const name of keepNames) {
    if (row && row[name] !== undefined && row[name] !== null && clean(row[name]) !== '') out[name] = row[name];
    else {
      const n = nk(name);
      const k = keys.find(x => nk(x) === n);
      if (k && row[k] !== undefined && row[k] !== null && clean(row[k]) !== '') out[k] = row[k];
    }
  }
  out['TP NUMBER'] = out['TP NUMBER'] || out['TestPackNo'] || out['Test Pack No'] || out['TP No'] || tpNo(row);
  out['Construction Stage'] = out['Construction Stage'] || out['Stage'] || out['Current Stage'] || constructionStage(row);
  out['Punch Category\n(A/B/C)'] = out['Punch Category\n(A/B/C)'] || out['Punch Category (A/B/C)'] || out['Punch Category'] || punchCategory(row);
  out['Material TYPE'] = out['Material TYPE'] || out['Material Type'] || out['Punch Item Type'] || materialType(row);
  out['Comments'] = out['Comments'] || out['Comment'] || out['Punch Description'] || out['Punch Item'] || commentText(row);
  out['Punch Cleared'] = out['Punch Cleared'] || out['Punched Cleared'] || out['Punch Clear Date'] || '';
  out['Area'] = out['Area'] || rowArea(row);
  out['ISO No.'] = out['ISO No.'] || out['ISO No'] || isoOrSpool(row);
  out['Sheet No.'] = out['Sheet No.'] || out['Sheet No'] || out['Sheet Number'] || sheetNo(row);
  out['CCC / JGC Direct MP'] = out['CCC / JGC Direct MP'] || out['Contractor'] || deriveContractor(row);
  return out;
}

async function sbJson(env, path, init = {}) {
  const r = await sbFetch(env, path, init);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch (_) { throw new Error(`Supabase returned non-JSON (${r.status}): ${text.slice(0, 800)}`); }
  if (!r.ok) throw new Error(`Supabase request failed (${r.status}) ${path}: ${JSON.stringify(data).slice(0, 1000)}`);
  return { data, headers: r.headers, status: r.status };
}

async function fetchExistingByFingerprints(env, fps) {
  const out = new Map();
  const uniq = [...new Set((fps || []).filter(Boolean).map(String))];
  for (const part of chunks(uniq, MAX_IN_PARAMS)) {
    const inList = part.join(',');
    const path = `/rest/v1/bitem_registry?select=fingerprint,bitem_id,contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,query_status,query_cleared_date,final_status,final_cleared_date,user_cleared_date,user_cleared_by,last_edited_by,last_edited_at,source_flag,sync_note,active&fingerprint=in.(${inList})`;
    const { data } = await sbJson(env, path, { method: 'GET' });
    for (const r of (Array.isArray(data) ? data : [])) out.set(String(r.fingerprint), r);
  }
  return out;
}

async function upsertRows(env, rows) {
  if (!rows.length) return;
  for (const part of chunks(rows, 200)) {
    await sbJson(env, `/rest/v1/bitem_registry?on_conflict=fingerprint`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(part)
    });
  }
}

async function insertAudit(env, rows) {
  if (!rows.length) return;
  try {
    await sbJson(env, `/rest/v1/bitem_audit_log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'prefer': 'return=minimal' },
      body: JSON.stringify(rows)
    });
  } catch (e) {
    console.warn('BITEM_SUPABASE_AUDIT_SKIPPED', e && (e.message || e));
  }
}

async function upsertSyncRun(env, row) {
  try {
    await sbJson(env, `/rest/v1/bitem_sync_runs?on_conflict=sync_id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row)
    });
  } catch (e) {
    console.warn('BITEM_SUPABASE_SYNC_RUN_SKIPPED', e && (e.message || e));
  }
}

async function updateSyncRunCounters(env, syncId, add) {
  // Keep this deliberately light. The source of truth is bitem_registry itself.
  try {
    const { data } = await sbJson(env, `/rest/v1/bitem_sync_runs?select=processed_rows,inserted_rows,updated_rows,removed_rows,skipped_rows&sync_id=eq.${enc(syncId)}&limit=1`, { method: 'GET' });
    const cur = Array.isArray(data) && data[0] ? data[0] : {};
    const patch = {
      processed_rows: Number(cur.processed_rows || 0) + Number(add.processed || 0),
      inserted_rows: Number(cur.inserted_rows || 0) + Number(add.inserted || 0),
      updated_rows: Number(cur.updated_rows || 0) + Number(add.updated || 0),
      removed_rows: Number(cur.removed_rows || 0) + Number(add.removed || 0),
      skipped_rows: Number(cur.skipped_rows || 0) + Number(add.skipped || 0),
      status: add.status || 'RUNNING',
      ...(add.finished_at ? { finished_at: add.finished_at } : {})
    };
    await sbJson(env, `/rest/v1/bitem_sync_runs?sync_id=eq.${enc(syncId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'prefer': 'return=minimal' },
      body: JSON.stringify(patch)
    });
  } catch (e) {
    console.warn('BITEM_SUPABASE_SYNC_RUN_COUNTERS_SKIPPED', e && (e.message || e));
  }
}

async function maxSeqForKey(env, contractor, tp) {
  // Supabase migrated data already has B Item IDs. For new comments, continue the C### sequence per contractor/TP.
  const prefix = `${contractor || 'JGC'}-B-${tp || 'NO-TP'}-C`;
  const { data } = await sbJson(env, `/rest/v1/bitem_registry?select=bitem_id&contractor=eq.${enc(contractor)}&tp_no=eq.${enc(tp)}&bitem_id=like.${enc(prefix)}*&limit=1000`, { method: 'GET' });
  let max = 0;
  for (const r of (Array.isArray(data) ? data : [])) {
    const m = String(r.bitem_id || '').match(/-C(\d+)$/);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return max;
}

async function assignIdsForNewItems(env, newItems) {
  const seqMap = new Map();
  for (const item of newItems) {
    const key = `${item.contractor || 'JGC'}|${item.tp || 'NO-TP'}`;
    if (!seqMap.has(key)) seqMap.set(key, await maxSeqForKey(env, item.contractor || 'JGC', item.tp || 'NO-TP'));
    const next = Number(seqMap.get(key) || 0) + 1;
    item.displayId = displayIdFromCounter(item.contractor || 'JGC', item.tp || 'NO-TP', next);
    seqMap.set(key, next);
  }
}

function statusChanged(existing, qStatus, decision) {
  if (!existing) return false;
  return String(existing.query_status || '') !== String(qStatus || '') ||
         String(existing.final_status || '') !== String(decision.finalStatus || '') ||
         String(existing.final_cleared_date || '') !== String(decision.finalDate || '') ||
         String(existing.query_cleared_date || '') !== String(decision.queryDate || '') ||
         String(existing.source_flag || '') !== String(decision.sourceFlag || '') ||
         String(existing.sync_note || '') !== String(decision.syncNote || '');
}
function rowMetaChanged(existing, row, contractor, tp) {
  if (!existing) return true;
  return String(existing.contractor || '') !== String(contractor || '') ||
         String(existing.tp_no || '') !== String(tp || '') ||
         String(existing.construction_stage || '') !== String(constructionStage(row) || '') ||
         String(existing.punch_category || '') !== String(punchCategory(row) || '') ||
         String(existing.comment_text || '') !== String(commentText(row) || '') ||
         String(existing.material_type || '') !== String(materialType(row) || '') ||
         String(existing.iso_or_spool || '') !== String(isoOrSpool(row) || '') ||
         String(existing.area || '') !== String(rowArea(row) || '');
}

async function deactivateMissing(env, syncId) {
  const countResp = await sbFetch(env, `/rest/v1/bitem_registry?select=id&active=eq.1&last_sync_id=neq.${enc(syncId)}`, {
    method: 'GET',
    headers: { 'prefer': 'count=exact', 'range': '0-0' }
  });
  const cr = countResp.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)$/);
  const removed = m ? Number(m[1] || 0) : 0;
  await countResp.arrayBuffer().catch(()=>null);

  if (removed > 0) {
    await sbJson(env, `/rest/v1/bitem_registry?active=eq.1&last_sync_id=neq.${enc(syncId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'prefer': 'return=minimal' },
      body: JSON.stringify({
        active: 0,
        source_flag: 'REMOVED_FROM_FMS_CCC_EXCEL',
        sync_note: 'This comment did not return in the latest FMS / CCC Excel source.',
        updated_at: nowIso()
      })
    });
  }
  return removed;
}

async function handleSync(context) {
  const sbError = assertSupabase(context.env); if (sbError) return sbError;
  const auth = await requireUser(context, ['admin', 'user']);
  if (auth.error) return auth.error;
  const user = auth.user || {};

  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok:false, source:'Supabase', error:'Invalid JSON body' }, 400); }

  const syncId = clean(body.syncId) || `SYNC-${Date.now()}`;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const isFirst = !!body.isFirst;
  const isLast = !!body.isLast;
  const tpStatusByTP = buildTpStatusMap(body.tpStatusByTP || {});

  if (isFirst) {
    await upsertSyncRun(context.env, {
      sync_id: syncId,
      started_by: s(user.username || user.sub || ''),
      started_at: nowIso(),
      total_input_rows: Number(body.totalRows || rows.length || 0),
      processed_rows: 0,
      inserted_rows: 0,
      updated_rows: 0,
      removed_rows: 0,
      skipped_rows: 0,
      status: 'RUNNING'
    });
  }

  const validRaw = [];
  let skipped = 0;
  let duplicateFingerprintsInChunk = 0;
  for (const row of rows) {
    if (!isBItemRow(row)) { skipped++; continue; }
    const fp = await fingerprint(row);
    const contractor = deriveContractor(row);
    const tp = tpNo(row);
    const q = queryCleared(row, tpStatusByTP);
    validRaw.push({ row, fp, contractor, tp, q });
  }

  const byFingerprint = new Map();
  for (const item of validRaw) {
    if (byFingerprint.has(item.fp)) duplicateFingerprintsInChunk++;
    byFingerprint.set(item.fp, item);
  }
  const valid = [...byFingerprint.values()];
  skipped += duplicateFingerprintsInChunk;

<<<<<<< HEAD
  const existingMap = await fetchExistingByFingerprints(context.env, valid.map(x => x.fp));
=======
  const existingMap = await selectMap(context.env, `SELECT fingerprint, bitem_id, contractor, tp_no, construction_stage, punch_category, comment_text, material_type, iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date, user_cleared_date, user_cleared_by, last_edited_by, last_edited_at, source_flag, sync_note, active FROM bitem_registry WHERE fingerprint`, valid.map(x => x.fp), 'fingerprint');
>>>>>>> e0e08f2a42b1b14783f956d2851b487a0e0e01c9
  const newItems = valid.filter(x => !existingMap.get(x.fp));
  await assignIdsForNewItems(context.env, newItems);

  const upserts = [];
  let inserted = 0, updated = 0, changed = 0;
  const flags = {};
  const ts = nowIso();

  for (const item of valid) {
    const { row, fp, contractor, tp, q } = item;
    const existing = existingMap.get(fp);
    const qStatus = q.cleared ? 'CLEARED' : 'NOT CLEARED';
    const rowJson = compactRow(row);
    let decision;

    if (!existing) {
      decision = {
        finalStatus: (q.cleared || q.stageClosed) ? 'CLEARED' : 'OPEN',
        finalDate: q.cleared ? (q.date || '') : (q.stageClosed ? (q.stageDate || '') : ''),
        sourceFlag: q.stageClosed ? 'NEW_FROM_TP_SUMMARY_STAGE_CLOSED' : 'NEW_FROM_FMS_CCC_EXCEL',
        queryDate: q.date || '',
        syncNote: q.userNote || 'New comment received from latest FMS / CCC Excel B Item row.'
      };
<<<<<<< HEAD
      upserts.push({
        bitem_id: item.displayId,
        fingerprint: fp,
        contractor: contractor || 'JGC',
        tp_no: tp,
        construction_stage: constructionStage(row),
        punch_category: punchCategory(row),
        comment_text: commentText(row),
        material_type: materialType(row),
        iso_or_spool: isoOrSpool(row),
        area: rowArea(row),
        query_status: qStatus,
        query_cleared_date: q.date || '',
        final_status: decision.finalStatus,
        final_cleared_date: decision.finalDate || '',
        user_cleared_date: '',
        user_cleared_by: '',
        source_flag: decision.sourceFlag,
        sync_note: decision.syncNote,
        active: 1,
        first_seen_at: ts,
        last_seen_at: ts,
        last_sync_id: syncId,
        row_json: rowJson,
        updated_at: ts
      });
=======
      stmts.push(context.env.DB.prepare(`
        INSERT INTO bitem_registry(
          bitem_id, fingerprint, contractor, tp_no, construction_stage, punch_category,
          comment_text, material_type, iso_or_spool, area, query_status, query_cleared_date,
          final_status, final_cleared_date, user_cleared_date, user_cleared_by, source_flag, sync_note,
          active, first_seen_at, last_seen_at, last_sync_id, row_json, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'),datetime('now'),?,?,datetime('now'))
      `).bind(
        s(displayId), s(fp), s(contractor), s(tp), s(constructionStage(row)), s(punchCategory(row)),
        s(commentText(row)), s(materialType(row)), s(isoOrSpool(row)), s(rowArea(row)), s(qStatus), s(q.date || ''),
        s(decision.finalStatus), s(decision.finalDate), '', '', s(decision.sourceFlag), s(decision.syncNote),
        s(syncId), s(rowJson)
      ));
>>>>>>> e0e08f2a42b1b14783f956d2851b487a0e0e01c9
      inserted++;
    } else {
      decision = finalDecision(existing, q);
      const statusDiff = statusChanged(existing, qStatus, { ...decision, queryDate: q.date || '' });
      const metaDiff = rowMetaChanged(existing, row, contractor, tp);
      if (statusDiff) changed++;
      if (statusDiff || metaDiff || String(existing.active || '1') !== '1') {
        upserts.push({
          fingerprint: fp,
          contractor: contractor || 'JGC',
          tp_no: tp,
          construction_stage: constructionStage(row),
          punch_category: punchCategory(row),
          comment_text: commentText(row),
          material_type: materialType(row),
          iso_or_spool: isoOrSpool(row),
          area: rowArea(row),
          query_status: qStatus,
          query_cleared_date: q.date || '',
          final_status: decision.finalStatus,
          final_cleared_date: decision.finalDate || '',
          source_flag: decision.sourceFlag,
          sync_note: decision.syncNote,
          active: 1,
          last_seen_at: ts,
          last_sync_id: syncId,
          row_json: rowJson,
          updated_at: ts
        });
      } else {
        upserts.push({ fingerprint: fp, active: 1, last_seen_at: ts, last_sync_id: syncId });
      }
      updated++;
    }
    flags[decision.sourceFlag] = (flags[decision.sourceFlag] || 0) + 1;
  }

  await upsertRows(context.env, upserts);

  if (isFirst || isLast) {
    await insertAudit(context.env, [{
      action: isFirst ? 'SYNC_START_CHUNK_SUPABASE' : 'SYNC_LAST_CHUNK_SUPABASE',
      bitem_id: '',
      fingerprint: '',
      username: s(user.username || user.sub || ''),
      display_name: s(user.display_name || user.name || ''),
      role: s(user.role || ''),
      details: { syncId, processed: valid.length, inserted, updated, changed, skipped, duplicateFingerprintsInChunk, isFirst, isLast, flags },
      created_at: ts
    }]);
  }

  let removed = 0;
  if (isLast) {
    removed = await deactivateMissing(context.env, syncId);
    await insertAudit(context.env, [{
      action: 'SYNC_COMPLETE_SUPABASE',
      bitem_id: '',
      fingerprint: '',
      username: s(user.username || user.sub || ''),
      display_name: s(user.display_name || user.name || ''),
      role: s(user.role || ''),
      details: { syncId, removed },
      created_at: nowIso()
    }]);
    await updateSyncRunCounters(context.env, syncId, { processed: valid.length, inserted, updated, removed, skipped, status: 'DONE', finished_at: nowIso() });
  } else {
    await updateSyncRunCounters(context.env, syncId, { processed: valid.length, inserted, updated, skipped, status: 'RUNNING' });
  }

  return json({ ok:true, source:'Supabase', syncId, processed: valid.length, skipped, duplicateFingerprintsInChunk, inserted, updated, changed, removed, flags });
}

export async function onRequestPost(context) {
  try {
    return await handleSync(context);
  } catch (err) {
    console.error('BITEM_SUPABASE_SYNC_EXCEPTION', err && (err.stack || err.message || err));
    return json({ ok:false, source:'Supabase', error:'B Item Supabase sync Worker exception', message:String(err && (err.message || err)), stack:String(err && err.stack || '').slice(0, 2500) }, 500);
  }
}
