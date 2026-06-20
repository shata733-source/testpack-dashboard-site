import { json, requireUser } from '../../_shared/auth.js';
import {
  assertDB, clean, norm, tpNo, constructionStage, punchCategory, punchClearedDate,
  deriveContractor, commentText, materialType, isoOrSpool, rowArea,
  isBItemRow, fingerprint, buildTpStatusMap, queryCleared, finalDecision, nextDisplayId
} from '../../_shared/bitem.js';

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
    await context.env.DB.prepare('INSERT OR IGNORE INTO bitem_sync_runs(sync_id, started_by, started_at, total_input_rows, status) VALUES(?,?,datetime(\'now\'),?,?)')
      .bind(syncId, user.sub, Number(body.totalRows || rows.length || 0), 'RUNNING').run();
  }

  let processed = 0, skipped = 0, inserted = 0, updated = 0;
  const flags = {};

  for (const row of rows) {
    if (!isBItemRow(row)) { skipped++; continue; }
    processed++;
    const fp = await fingerprint(row);
    const existing = await context.env.DB.prepare('SELECT * FROM bitem_registry WHERE fingerprint=?').bind(fp).first();
    const contractor = deriveContractor(row);
    const tp = tpNo(row);
    const q = queryCleared(row, tpStatusByTP);
    const qStatus = q.cleared ? 'CLEARED' : 'NOT CLEARED';
    const rowJson = JSON.stringify(row);
    let displayId, decision;

    if (!existing) {
      displayId = await nextDisplayId(context.env, contractor, tp);
      decision = {
        finalStatus: (q.cleared || q.stageClosed) ? 'CLEARED' : 'OPEN',
        finalDate: q.cleared ? (q.date || '') : (q.stageClosed ? (q.stageDate || '') : ''),
        sourceFlag: q.stageClosed ? 'NEW_FROM_TP_SUMMARY_STAGE_CLOSED' : 'NEW_FROM_FMS_CCC_EXCEL',
        syncNote: q.userNote || 'New comment received from latest FMS / CCC Excel B Item row.'
      };
      await context.env.DB.prepare(`
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
      ).run();
      inserted++;
      flags[decision.sourceFlag] = (flags[decision.sourceFlag] || 0) + 1;
      await context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\'))')
        .bind('NEW_FROM_FMS', displayId, fp, user.sub, user.name, user.role, JSON.stringify({ tp, stage: constructionStage(row), fmsCccExcelStatus: qStatus, finalStatus: decision.finalStatus, note: decision.syncNote })).run();
    } else {
      displayId = existing.bitem_id;
      decision = finalDecision(existing, q);
      await context.env.DB.prepare(`
        UPDATE bitem_registry SET
          contractor=?, tp_no=?, construction_stage=?, punch_category=?, comment_text=?, material_type=?, iso_or_spool=?, area=?,
          query_status=?, query_cleared_date=?, final_status=?, final_cleared_date=?, source_flag=?, sync_note=?,
          active=1, last_seen_at=datetime('now'), last_sync_id=?, row_json=?, updated_at=datetime('now')
        WHERE fingerprint=?
      `).bind(
        contractor, tp, constructionStage(row), punchCategory(row), commentText(row), materialType(row), isoOrSpool(row), rowArea(row),
        qStatus, q.date || '', decision.finalStatus, decision.finalDate || '', decision.sourceFlag, decision.syncNote,
        syncId, rowJson, fp
      ).run();
      updated++;
      flags[decision.sourceFlag] = (flags[decision.sourceFlag] || 0) + 1;
      if (existing.source_flag !== decision.sourceFlag || existing.query_status !== qStatus || existing.final_status !== decision.finalStatus) {
        await context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\'))')
          .bind('SYNC_STATUS_CHANGE', displayId, fp, user.sub, user.name, user.role, JSON.stringify({ oldQueryStatus: existing.query_status, newQueryStatus: qStatus, oldFinalStatus: existing.final_status, newFinalStatus: decision.finalStatus, sourceFlag: decision.sourceFlag, note: decision.syncNote })).run();
      }
    }
  }

  let removed = 0;
  if (isLast) {
    const missing = await context.env.DB.prepare('SELECT bitem_id, fingerprint, final_status, source_flag FROM bitem_registry WHERE active=1 AND last_sync_id<>?').bind(syncId).all();
    const missingRows = missing.results || [];
    removed = missingRows.length;
    await context.env.DB.prepare(`
      UPDATE bitem_registry SET active=0, source_flag='REMOVED_FROM_FMS_CCC_EXCEL', sync_note='Deleted / not returned from latest FMS / CCC Excel B Item row.', updated_at=datetime('now')
      WHERE active=1 AND last_sync_id<>?
    `).bind(syncId).run();
    for (const m of missingRows.slice(0, 500)) {
      await context.env.DB.prepare('INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, details, created_at) VALUES(?,?,?,?,?,?,?,datetime(\'now\'))')
        .bind('REMOVED_FROM_FMS_CCC_EXCEL', m.bitem_id, m.fingerprint, user.sub, user.name, user.role, JSON.stringify({ note: 'Existing system comment did not return in the latest FMS / CCC Excel B Item row.', previousFinalStatus: m.final_status })).run();
    }
    await context.env.DB.prepare('UPDATE bitem_sync_runs SET finished_at=datetime(\'now\'), processed_rows=processed_rows+?, inserted_rows=inserted_rows+?, updated_rows=updated_rows+?, removed_rows=?, skipped_rows=skipped_rows+?, status=? WHERE sync_id=?')
      .bind(processed, inserted, updated, removed, skipped, 'DONE', syncId).run();
  } else {
    await context.env.DB.prepare('UPDATE bitem_sync_runs SET processed_rows=processed_rows+?, inserted_rows=inserted_rows+?, updated_rows=updated_rows+?, skipped_rows=skipped_rows+? WHERE sync_id=?')
      .bind(processed, inserted, updated, skipped, syncId).run();
  }

  return json({ ok: true, syncId, processed, skipped, inserted, updated, removed, flags });
}
