import { json, requireUser } from '../../_shared/auth.js';
import {
  assertDB, clean, tpNo, constructionStage, punchCategory,
  deriveContractor, commentText, materialType, isoOrSpool, sheetNo, rowArea,
  isBItemRow, fingerprint, buildTpStatusMap, queryCleared, finalDecision
} from '../../_shared/bitem.js';

// Smaller batches are safer for D1 when row_json is large.
const MAX_IN_PARAMS = 50;
const DB_BATCH_SIZE = 15;

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function s(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch (_) { return String(v); }
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

async function runBatches(env, statements) {
  for (const part of chunks(statements, DB_BATCH_SIZE)) {
    if (part.length) await env.DB.batch(part);
  }
}

async function selectMap(env, sqlPrefix, values, keyField) {
  const out = new Map();
  const uniq = [...new Set((values || []).filter(Boolean).map(String))];
  if (!uniq.length) return out;
  for (const part of chunks(uniq, MAX_IN_PARAMS)) {
    const qs = part.map(() => '?').join(',');
    const res = await env.DB.prepare(`${sqlPrefix} IN (${qs})`).bind(...part).all();
    for (const r of (res.results || [])) out.set(String(r[keyField]), r);
  }
  return out;
}

function statusChanged(existing, qStatus, decision) {
  if (!existing) return false;
  return String(existing.query_status || '') !== String(qStatus || '') ||
         String(existing.final_status || '') !== String(decision.finalStatus || '') ||
         String(existing.source_flag || '') !== String(decision.sourceFlag || '') ||
         String(existing.sync_note || '') !== String(decision.syncNote || '');
}

function displayIdFromCounter(contractor, tp, seq) {
  const c = contractor || 'UNK';
  const t = tp || 'NO-TP';
  return `${c}-B-${t}-C${String(seq).padStart(3, '0')}`;
}

async function nextIdsForNewRows(env, newItems) {
  const keys = [...new Set(newItems.map(x => x.counterKey))];
  if (!keys.length) return;
  const counterMap = await selectMap(env, 'SELECT counter_key, contractor, tp_no, next_no FROM bitem_counters WHERE counter_key', keys, 'counter_key');
  const working = new Map();
  for (const k of keys) working.set(k, Number((counterMap.get(k) || {}).next_no || 1));

  for (const item of newItems) {
    const next = working.get(item.counterKey) || 1;
    item.displayId = displayIdFromCounter(item.contractor, item.tp, next);
    working.set(item.counterKey, next + 1);
  }

  const stmts = [];
  for (const k of keys) {
    const [contractor, tp] = k.split('|');
    stmts.push(env.DB.prepare(`
      INSERT INTO bitem_counters(counter_key, contractor, tp_no, next_no, updated_at)
      VALUES(?,?,?,?,datetime('now'))
      ON CONFLICT(counter_key) DO UPDATE SET next_no=excluded.next_no, updated_at=datetime('now')
    `).bind(s(k), s(contractor || 'UNK'), s(tp || 'NO-TP'), Number(working.get(k) || 1)));
  }
  await runBatches(env, stmts);
}

async function handleSync(context) {
  const dbError = assertDB(context.env); if (dbError) return dbError;
  const auth = await requireUser(context, ['admin', 'user']);
  if (auth.error) return auth.error;
  const user = auth.user;

  let body = {};
  try { body = await context.request.json(); } catch (_) { return json({ ok: false, error: 'Invalid JSON body' }, 400); }

  const syncId = clean(body.syncId) || `SYNC-${Date.now()}`;
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const isFirst = !!body.isFirst;
  const isLast = !!body.isLast;
  const tpStatusByTP = buildTpStatusMap(body.tpStatusByTP || {});

  if (isFirst) {
    await context.env.DB.prepare(`
      INSERT OR REPLACE INTO bitem_sync_runs(sync_id, started_by, started_at, total_input_rows, processed_rows, inserted_rows, updated_rows, removed_rows, skipped_rows, status)
      VALUES(?,?,datetime('now'),?,0,0,0,0,0,?)
    `).bind(s(syncId), s(user.sub), Number(body.totalRows || rows.length || 0), 'RUNNING').run();
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
    validRaw.push({ row, fp, contractor, tp, counterKey: `${contractor || 'UNK'}|${tp || 'NO-TP'}`, q });
  }

  // Some Excel rows can be duplicated or can produce the same stable fingerprint
  // inside the same chunk. Without this de-duplication, two INSERT statements in
  // one D1 batch may try to insert the same fingerprint and fail with:
  // UNIQUE constraint failed: bitem_registry.fingerprint.
  // Keep the last occurrence in the chunk, but count the duplicates as skipped
  // so the sync run remains transparent.
  const byFingerprint = new Map();
  for (const item of validRaw) {
    if (byFingerprint.has(item.fp)) duplicateFingerprintsInChunk++;
    byFingerprint.set(item.fp, item);
  }
  const valid = [...byFingerprint.values()];
  skipped += duplicateFingerprintsInChunk;

  const existingMap = await selectMap(context.env, `SELECT fingerprint, bitem_id, contractor, tp_no, construction_stage, punch_category, comment_text, material_type, iso_or_spool, area, query_status, query_cleared_date, final_status, final_cleared_date, user_cleared_date, last_edited_by, last_edited_at, source_flag, sync_note, active FROM bitem_registry WHERE fingerprint`, valid.map(x => x.fp), 'fingerprint');
  const newItems = valid.filter(x => !existingMap.get(x.fp));
  await nextIdsForNewRows(context.env, newItems);

  const stmts = [];
  let inserted = 0, updated = 0, changed = 0;
  const flags = {};

  for (const item of valid) {
    const { row, fp, contractor, tp, q } = item;
    const existing = existingMap.get(fp);
    const qStatus = q.cleared ? 'CLEARED' : 'NOT CLEARED';
    const rowJson = JSON.stringify(compactRow(row));
    let decision, displayId;

    if (!existing) {
      displayId = item.displayId || displayIdFromCounter(contractor, tp, 1);
      decision = {
        finalStatus: (q.cleared || q.stageClosed) ? 'CLEARED' : 'OPEN',
        finalDate: q.cleared ? (q.date || '') : (q.stageClosed ? (q.stageDate || '') : ''),
        sourceFlag: q.stageClosed ? 'NEW_FROM_TP_SUMMARY_STAGE_CLOSED' : 'NEW_FROM_FMS_CCC_EXCEL',
        syncNote: q.userNote || 'New comment received from latest FMS / CCC Excel B Item row.'
      };
      stmts.push(context.env.DB.prepare(`
        INSERT INTO bitem_registry(
          bitem_id, fingerprint, contractor, tp_no, construction_stage, punch_category,
          comment_text, material_type, iso_or_spool, area, query_status, query_cleared_date,
          final_status, final_cleared_date, user_cleared_date, source_flag, sync_note,
          active, first_seen_at, last_seen_at, last_sync_id, row_json, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'),datetime('now'),?,?,datetime('now'))
      `).bind(
        s(displayId), s(fp), s(contractor), s(tp), s(constructionStage(row)), s(punchCategory(row)),
        s(commentText(row)), s(materialType(row)), s(isoOrSpool(row)), s(rowArea(row)), s(qStatus), s(q.date || ''),
        s(decision.finalStatus), s(decision.finalDate), '', s(decision.sourceFlag), s(decision.syncNote),
        s(syncId), s(rowJson)
      ));
      inserted++;
    } else {
      displayId = existing.bitem_id;
      decision = finalDecision(existing, q);
      if (statusChanged(existing, qStatus, decision)) changed++;
      stmts.push(context.env.DB.prepare(`
        UPDATE bitem_registry SET
          contractor=?, tp_no=?, construction_stage=?, punch_category=?, comment_text=?, material_type=?, iso_or_spool=?, area=?,
          query_status=?, query_cleared_date=?, final_status=?, final_cleared_date=?, source_flag=?, sync_note=?,
          active=1, last_seen_at=datetime('now'), last_sync_id=?, row_json=?, updated_at=datetime('now')
        WHERE fingerprint=?
      `).bind(
        s(contractor), s(tp), s(constructionStage(row)), s(punchCategory(row)), s(commentText(row)), s(materialType(row)), s(isoOrSpool(row)), s(rowArea(row)),
        s(qStatus), s(q.date || ''), s(decision.finalStatus), s(decision.finalDate || ''), s(decision.sourceFlag), s(decision.syncNote),
        s(syncId), s(rowJson), s(fp)
      ));
      if (statusChanged(existing, qStatus, decision)) {
        stmts.push(context.env.DB.prepare("INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))")
          .bind('SYNC_STATUS_CHANGE', s(displayId), s(fp), s(user.sub), s(user.name), s(user.role), JSON.stringify({ oldFmsCccExcelStatus: existing.query_status, newFmsCccExcelStatus: qStatus, oldFinalStatus: existing.final_status, newFinalStatus: decision.finalStatus, sourceFlag: decision.sourceFlag, note: decision.syncNote })));
      }
      updated++;
    }
    flags[decision.sourceFlag] = (flags[decision.sourceFlag] || 0) + 1;
  }

  if (valid.length || skipped) {
    stmts.push(context.env.DB.prepare("INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))")
      .bind('SYNC_CHUNK', '', '', s(user.sub), s(user.name), s(user.role), JSON.stringify({ syncId, processed: valid.length, inserted, updated, changed, skipped, duplicateFingerprintsInChunk, isFirst, isLast, flags })));
  }

  await runBatches(context.env, stmts);

  let removed = 0;
  if (isLast) {
    const missingCount = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM bitem_registry WHERE active=1 AND last_sync_id<>?').bind(s(syncId)).first();
    removed = Number(missingCount?.n || 0);
    await context.env.DB.prepare(`
      UPDATE bitem_registry SET active=0, source_flag='REMOVED_FROM_FMS_CCC_EXCEL', sync_note='This comment did not return in the latest FMS / CCC Excel source.', updated_at=datetime('now')
      WHERE active=1 AND last_sync_id<>?
    `).bind(s(syncId)).run();
    await context.env.DB.prepare("INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime('now'))")
      .bind('SYNC_COMPLETE', '', '', s(user.sub), s(user.name), s(user.role), JSON.stringify({ syncId, removed })).run();
    await context.env.DB.prepare("UPDATE bitem_sync_runs SET finished_at=datetime('now'), processed_rows=processed_rows+?, inserted_rows=inserted_rows+?, updated_rows=updated_rows+?, removed_rows=?, skipped_rows=skipped_rows+?, status=? WHERE sync_id=?")
      .bind(Number(valid.length), Number(inserted), Number(updated), Number(removed), Number(skipped), 'DONE', s(syncId)).run();
  } else {
    await context.env.DB.prepare('UPDATE bitem_sync_runs SET processed_rows=processed_rows+?, inserted_rows=inserted_rows+?, updated_rows=updated_rows+?, skipped_rows=skipped_rows+? WHERE sync_id=?')
      .bind(Number(valid.length), Number(inserted), Number(updated), Number(skipped), s(syncId)).run();
  }

  return json({ ok: true, syncId, processed: valid.length, skipped, duplicateFingerprintsInChunk, inserted, updated, changed, removed, flags });
}

export async function onRequestPost(context) {
  try {
    return await handleSync(context);
  } catch (err) {
    console.error('BITEM_SYNC_EXCEPTION', err && (err.stack || err.message || err));
    return json({
      ok: false,
      error: 'B Item sync Worker exception',
      message: String(err && (err.message || err)),
      stack: String(err && err.stack || '').slice(0, 2500)
    }, 500);
  }
}
