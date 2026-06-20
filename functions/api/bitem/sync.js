import { json, requireUser } from '../../_shared/auth.js';
import {
  assertDB, clean, norm, tpNo, constructionStage, punchCategory, punchClearedDate,
  deriveContractor, commentText, materialType, isoOrSpool, rowArea,
  isBItemRow, fingerprint, buildTpStatusMap, queryCleared, finalDecision
} from '../../_shared/bitem.js';

const MAX_IN_PARAMS = 80;
const DB_BATCH_SIZE = 80;

function chunks(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runBatches(env, statements) {
  for (const part of chunks(statements, DB_BATCH_SIZE)) {
    if (part.length) await env.DB.batch(part);
  }
}

async function selectMap(env, sqlPrefix, values, keyField) {
  const out = new Map();
  const uniq = [...new Set(values.filter(Boolean))];
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
    `).bind(k, contractor || 'UNK', tp || 'NO-TP', working.get(k) || 1));
  }
  await runBatches(env, stmts);
}

export async function onRequestPost(context) {
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
    await context.env.DB.prepare('INSERT OR REPLACE INTO bitem_sync_runs(sync_id, started_by, started_at, total_input_rows, processed_rows, inserted_rows, updated_rows, removed_rows, skipped_rows, status) VALUES(?,?,datetime(\'now\'),?,0,0,0,0,0,?)')
      .bind(syncId, user.sub, Number(body.totalRows || rows.length || 0), 'RUNNING').run();
  }

  const valid = [];
  let skipped = 0;
  for (const row of rows) {
    if (!isBItemRow(row)) { skipped++; continue; }
    const fp = await fingerprint(row);
    const contractor = deriveContractor(row);
    const tp = tpNo(row);
    const q = queryCleared(row, tpStatusByTP);
    valid.push({ row, fp, contractor, tp, counterKey: `${contractor || 'UNK'}|${tp || 'NO-TP'}`, q });
  }

  const existingMap = await selectMap(context.env, 'SELECT * FROM bitem_registry WHERE fingerprint', valid.map(x => x.fp), 'fingerprint');
  const newItems = valid.filter(x => !existingMap.get(x.fp));
  await nextIdsForNewRows(context.env, newItems);

  const stmts = [];
  let inserted = 0, updated = 0, changed = 0;
  const flags = {};

  for (const item of valid) {
    const { row, fp, contractor, tp, q } = item;
    const existing = existingMap.get(fp);
    const qStatus = q.cleared ? 'CLEARED' : 'NOT CLEARED';
    const rowJson = JSON.stringify(row);
    let decision, displayId;

    if (!existing) {
      displayId = item.displayId;
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
        displayId, fp, contractor, tp, constructionStage(row), punchCategory(row),
        commentText(row), materialType(row), isoOrSpool(row), rowArea(row), qStatus, q.date || '',
        decision.finalStatus, decision.finalDate, '', decision.sourceFlag, decision.syncNote,
        syncId, rowJson
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
        contractor, tp, constructionStage(row), punchCategory(row), commentText(row), materialType(row), isoOrSpool(row), rowArea(row),
        qStatus, q.date || '', decision.finalStatus, decision.finalDate || '', decision.sourceFlag, decision.syncNote,
        syncId, rowJson, fp
      ));
      if (statusChanged(existing, qStatus, decision)) {
        stmts.push(context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\'))')
          .bind('SYNC_STATUS_CHANGE', displayId, fp, user.sub, user.name, user.role, JSON.stringify({ oldFmsCccExcelStatus: existing.query_status, newFmsCccExcelStatus: qStatus, oldFinalStatus: existing.final_status, newFinalStatus: decision.finalStatus, sourceFlag: decision.sourceFlag, note: decision.syncNote })));
      }
      updated++;
    }
    flags[decision.sourceFlag] = (flags[decision.sourceFlag] || 0) + 1;
  }

  // One lightweight audit row per chunk instead of thousands of new-row audit records.
  if (valid.length || skipped) {
    stmts.push(context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\'))')
      .bind('SYNC_CHUNK', '', '', user.sub, user.name, user.role, JSON.stringify({ syncId, processed: valid.length, inserted, updated, changed, skipped, isFirst, isLast, flags })));
  }

  await runBatches(context.env, stmts);

  let removed = 0;
  if (isLast) {
    const missingCount = await context.env.DB.prepare('SELECT COUNT(*) AS n FROM bitem_registry WHERE active=1 AND last_sync_id<>?').bind(syncId).first();
    removed = Number(missingCount?.n || 0);
    await context.env.DB.prepare(`
      UPDATE bitem_registry SET active=0, source_flag='REMOVED_FROM_FMS_CCC_EXCEL', sync_note='This comment did not return in the latest FMS / CCC Excel source.', updated_at=datetime('now')
      WHERE active=1 AND last_sync_id<>?
    `).bind(syncId).run();
    await context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\'))')
      .bind('SYNC_COMPLETE', '', '', user.sub, user.name, user.role, JSON.stringify({ syncId, removed })).run();
    await context.env.DB.prepare('UPDATE bitem_sync_runs SET finished_at=datetime(\'now\'), processed_rows=processed_rows+?, inserted_rows=inserted_rows+?, updated_rows=updated_rows+?, removed_rows=?, skipped_rows=skipped_rows+?, status=? WHERE sync_id=?')
      .bind(valid.length, inserted, updated, removed, skipped, 'DONE', syncId).run();
  } else {
    await context.env.DB.prepare('UPDATE bitem_sync_runs SET processed_rows=processed_rows+?, inserted_rows=inserted_rows+?, updated_rows=updated_rows+?, skipped_rows=skipped_rows+? WHERE sync_id=?')
      .bind(valid.length, inserted, updated, skipped, syncId).run();
  }

  return json({ ok: true, syncId, processed: valid.length, skipped, inserted, updated, changed, removed, flags });
}
