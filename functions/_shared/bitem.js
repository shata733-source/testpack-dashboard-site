import { json } from './auth.js';

export function clean(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  return String(v).replace(/\s+/g, ' ').trim();
}

export function norm(v) {
  return clean(v).toUpperCase();
}

export function rowVal(row, names) {
  if (!row) return '';
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && clean(row[n]) !== '') return row[n];
  }
  const keys = Object.keys(row || {});
  for (const n of names) {
    const nn = norm(n).replace(/[^A-Z0-9]/g, '');
    const k = keys.find(x => norm(x).replace(/[^A-Z0-9]/g, '') === nn);
    if (k && row[k] !== undefined && row[k] !== null && clean(row[k]) !== '') return row[k];
  }
  return '';
}

export function tpNo(row) {
  return clean(rowVal(row, ['TP NUMBER', 'TestPackNo', 'Test Pack No', 'TestPack No', 'TP No', 'TestPackNo.']));
}

export function constructionStage(row) {
  return clean(rowVal(row, ['Construction Stage', 'Stage', 'Current Stage']));
}

export function punchCategory(row) {
  return norm(rowVal(row, ['Punch Category\n(A/B/C)', 'Punch Category (A/B/C)', 'Punch Category#(lf)(A/B/C)', 'Punch Category', 'Punch Catergory', 'Punch Catergory#(lf)(A/B/C)']));
}

export function punchClearedDate(row) {
  const v = rowVal(row, ['Punch Cleared', 'Punched Cleared', 'Punch Clear Date', 'Cleared Date']);
  return normalizeDate(v);
}

export function normalizeDate(v) {
  if (v === null || v === undefined || clean(v) === '') return '';
  if (typeof v === 'number' && isFinite(v)) {
    // Excel serial date, using UTC to avoid timezone shift.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = clean(v);
  // yyyy-mm-dd
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  // dd/mm/yyyy or dd-mm-yyyy
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

export function isAllowedBStage(stage) {
  const s = norm(stage);
  return [
    'QC PRETESTPACK PUNCH LIST',
    'RETURN FOR REINSTATEMENT',
    'RETURN WITH BACK PUNCH',
    'SAPID PUNCH LIST',
    'QC PUNCH LIST RETURN'
  ].includes(s);
}

export function isBItemRow(row) {
  return punchCategory(row) === 'B' && isAllowedBStage(constructionStage(row));
}

export function deriveContractor(row) {
  const v = norm(rowVal(row, ['CCC / JGC Direct MP', 'Contractor', 'Scope', 'Subcon']));
  if (v.includes('CCC')) return 'CCC';
  if (v.includes('JGC')) return 'JGC';
  return 'UNK';
}

export function commentText(row) {
  return clean(rowVal(row, ['Comments', 'Punch Description', 'PunchDesc', 'Comment', 'Punch Item']));
}

export function materialType(row) {
  return clean(rowVal(row, ['Material TYPE', 'Material Type', 'Punch Item Type', 'PunchTypeDescription']));
}

export function isoOrSpool(row) {
  return clean(rowVal(row, ['ISO No.', 'ISO No', 'ISO', 'SpoolDwgNo', 'Spool Dwg No', 'Sheet No.']));
}

export function rowArea(row) {
  return clean(rowVal(row, ['Area', 'AREA', 'Drawing Areas']));
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || '')));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function fingerprint(row) {
  // Stable matching key: do NOT include Punch Cleared date, because status may change.
  const parts = [
    deriveContractor(row),
    tpNo(row),
    constructionStage(row),
    punchCategory(row),
    commentText(row),
    materialType(row),
    isoOrSpool(row),
    rowArea(row)
  ].map(norm);
  return sha256Hex(parts.join('|'));
}

export function buildTpStatusMap(tpStatusByTP = {}) {
  const out = {};
  for (const [k, v] of Object.entries(tpStatusByTP || {})) {
    out[norm(k)] = v || {};
  }
  return out;
}

export function queryCleared(row, tpStatusByTP = {}) {
  const tp = norm(tpNo(row));
  const stage = norm(constructionStage(row));
  const tpst = tpStatusByTP[tp] || {};
  const pc = punchClearedDate(row);
  if (pc) return { cleared: true, date: pc, reason: 'Punch Cleared in Excel' };

  if (stage === 'QC PUNCH LIST RETURN') {
    if (tpst.QC_REINSTATEMENT_SIGN) {
      return { cleared: true, date: tpst.QC_REINSTATEMENT_SIGN, reason: 'TP Summary QC Reinstatement Sign' };
    }
    return { cleared: false, date: '', reason: 'Open in Excel' };
  }

  if (['QC PRETESTPACK PUNCH LIST', 'RETURN FOR REINSTATEMENT', 'RETURN WITH BACK PUNCH', 'SAPID PUNCH LIST'].includes(stage)) {
    if (tpst.CNS_PUNCH_B_CLEARED) {
      return { cleared: true, date: tpst.CNS_PUNCH_B_CLEARED, reason: 'TP Summary CNS Punch B Cleared' };
    }
    if (tpst.QC_PUNCH_LIST_RETURN) {
      return { cleared: true, date: tpst.QC_PUNCH_LIST_RETURN, reason: 'TP Summary QC Punch List Return' };
    }
  }

  return { cleared: false, date: '', reason: 'Open in Excel' };
}

export function finalDecision(existing, query) {
  const existingFinalCleared = existing && existing.final_status === 'CLEARED';
  const userCleared = existing && clean(existing.user_cleared_date);
  if (query.cleared && !existingFinalCleared && !userCleared) {
    return { finalStatus: 'CLEARED', finalDate: query.date || '', sourceFlag: 'QUERY_CLOSED_SYSTEM_OPEN', syncNote: 'Was open in system, but closed in latest Excel/query.' };
  }
  if (!query.cleared && (existingFinalCleared || userCleared)) {
    return { finalStatus: 'CLEARED', finalDate: existing.final_cleared_date || existing.user_cleared_date || '', sourceFlag: 'SYSTEM_CLOSED_QUERY_OPEN', syncNote: 'Closed in system/user edits, but returned open from latest Excel/query.' };
  }
  if (query.cleared && (existingFinalCleared || userCleared)) {
    return { finalStatus: 'CLEARED', finalDate: existing.final_cleared_date || existing.user_cleared_date || query.date || '', sourceFlag: 'SAME_CLOSED', syncNote: 'Same closed status in both system and latest source.' };
  }
  return { finalStatus: 'OPEN', finalDate: '', sourceFlag: 'SAME_OPEN', syncNote: 'Same open status in both system and latest source.' };
}

export async function nextDisplayId(env, contractor, tp) {
  const c = contractor || 'UNK';
  const t = tp || 'NO-TP';
  const key = `${c}|${t}`;
  const existing = await env.DB.prepare('SELECT next_no FROM bitem_counters WHERE counter_key=?').bind(key).first();
  const next = existing ? Number(existing.next_no || 1) : 1;
  const newNext = next + 1;
  if (existing) {
    await env.DB.prepare('UPDATE bitem_counters SET next_no=?, updated_at=datetime(\'now\') WHERE counter_key=?').bind(newNext, key).run();
  } else {
    await env.DB.prepare('INSERT INTO bitem_counters(counter_key, contractor, tp_no, next_no, updated_at) VALUES(?,?,?,?,datetime(\'now\'))').bind(key, c, t, newNext).run();
  }
  return `${c}-B-${t}-C${String(next).padStart(3, '0')}`;
}

export function assertDB(env) {
  if (!env.DB) return json({ ok: false, error: 'D1 binding DB is not configured.' }, 500);
  return null;
}
