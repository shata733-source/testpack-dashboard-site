import { json, requireUser } from '../../_shared/auth.js';
import { assertSupabase, sbFetch, clean } from '../../_shared/supabase.js';
import { deriveContractor, fingerprint, tpNo, constructionStage, punchCategory, commentText, materialType, isoOrSpool, sheetNo, rowArea } from '../../_shared/bitem.js';

function enc(v){ return encodeURIComponent(String(v || '')); }
function nowIso(){ return new Date().toISOString(); }
function parseJson(v){
  if(!v) return {};
  if(typeof v === 'object') return v || {};
  try { return JSON.parse(String(v)); } catch (_) { return {}; }
}
function num(v, def, min, max){
  let n = Number(v || def);
  if(!Number.isFinite(n)) n = def;
  n = Math.trunc(n);
  if(min !== undefined) n = Math.max(min, n);
  if(max !== undefined) n = Math.min(max, n);
  return n;
}
function chunks(arr, size){
  const out=[];
  for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size));
  return out;
}
function displayIdFromExisting(expectedContractor, tp, oldId){
  const c = expectedContractor || 'JGC';
  const t = tp || 'NO-TP';
  const old = String(oldId || '');
  const m = old.match(/-C(\d+)$/i);
  const seq = m ? String(m[1]).padStart(3,'0') : '001';
  return `${c}-B-${t}-C${seq}`;
}
function sourceRowFromRegistry(r){
  const row = parseJson(r.row_json);
  row['TP NUMBER'] = row['TP NUMBER'] || row.TestPackNo || row['Test Pack No'] || r.tp_no || '';
  row['Construction Stage'] = row['Construction Stage'] || row.Stage || r.construction_stage || '';
  row['Punch Category\n(A/B/C)'] = row['Punch Category\n(A/B/C)'] || row['Punch Category (A/B/C)'] || row['Punch Category'] || r.punch_category || '';
  row['Material TYPE'] = row['Material TYPE'] || row['Material Type'] || row['Punch Item Type'] || r.material_type || '';
  row['Comments'] = row['Comments'] || row.Comment || row['Punch Description'] || r.comment_text || '';
  row['Area'] = row.Area || r.area || '';
  row['ISO No.'] = row['ISO No.'] || row['ISO No'] || r.iso_or_spool || '';
  row['Sheet No.'] = row['Sheet No.'] || row['Sheet No'] || row.SheetNo || r.sheet_no || '';
  return row;
}
function updateStoredRowJson(r, src, expected){
  const row = parseJson(r.row_json);
  row['TP NUMBER'] = row['TP NUMBER'] || src['TP NUMBER'] || r.tp_no || '';
  row['Construction Stage'] = row['Construction Stage'] || src['Construction Stage'] || r.construction_stage || '';
  row['Punch Category\n(A/B/C)'] = row['Punch Category\n(A/B/C)'] || src['Punch Category\n(A/B/C)'] || r.punch_category || '';
  row['Material TYPE'] = row['Material TYPE'] || src['Material TYPE'] || r.material_type || '';
  row['Comments'] = row['Comments'] || src['Comments'] || r.comment_text || '';
  row['Area'] = row.Area || src.Area || r.area || '';
  row['ISO No.'] = row['ISO No.'] || src['ISO No.'] || r.iso_or_spool || '';
  row['Sheet No.'] = row['Sheet No.'] || src['Sheet No.'] || r.sheet_no || '';
  row['CCC / JGC Direct MP'] = expected;
  row['Contractor'] = expected;
  row['Scope'] = expected === 'CCC' ? 'CCC' : 'JGC Direct MP';
  return row;
}
async function sbJson(env,path,init={}){
  const r = await sbFetch(env,path,init);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch (_) { throw new Error(`Supabase returned non-JSON (${r.status}): ${text.slice(0,500)}`); }
  if(!r.ok) throw new Error(`Supabase request failed (${r.status}) ${path}: ${JSON.stringify(data).slice(0,800)}`);
  return data;
}
async function getRows(env,limit,cursor){
  const cols = 'id,bitem_id,fingerprint,contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,row_json,active,sync_note';
  const gt = cursor > 0 ? `&id=gt.${enc(cursor)}` : '';
  const data = await sbJson(env, `/rest/v1/bitem_registry?select=${cols}&active=eq.1${gt}&limit=${limit}&order=id.asc`);
  return Array.isArray(data) ? data : [];
}
async function getByFingerprints(env,fps){
  const out = new Map();
  const uniq = [...new Set((fps || []).filter(Boolean).map(String))];
  for(const part of chunks(uniq, 50)){
    if(!part.length) continue;
    const data = await sbJson(env, `/rest/v1/bitem_registry?select=id,bitem_id,fingerprint,active&fingerprint=in.(${part.map(enc).join(',')})&limit=100`);
    for(const r of (Array.isArray(data) ? data : [])) out.set(String(r.fingerprint), r);
  }
  return out;
}
async function patchById(env, id, body){
  await sbJson(env, `/rest/v1/bitem_registry?id=eq.${enc(id)}`, {
    method:'PATCH',
    headers:{'content-type':'application/json','prefer':'return=minimal'},
    body: JSON.stringify(body)
  });
}
function expectedIdMatches(id, expected, tp){
  const s = String(id || '');
  return s.startsWith(`${expected || 'JGC'}-B-${tp || 'NO-TP'}-C`);
}
function mismatchReason(r, expected, expectedFp, expectedId){
  const reasons = [];
  if(String(clean(r.contractor || 'JGC') || 'JGC') !== String(expected)) reasons.push('contractor');
  if(String(r.fingerprint || '') !== String(expectedFp || '')) reasons.push('fingerprint');
  if(String(r.bitem_id || '') !== String(expectedId || '')) reasons.push('bitem_id');
  return reasons.join(',');
}

export async function onRequestGet(context){
  try{
    const sbError = assertSupabase(context.env); if(sbError) return sbError;
    const auth = await requireUser(context, ['admin']);
    if(auth.error) return auth.error;
    const url = new URL(context.request.url);
    const apply = ['1','true','yes','apply'].includes(String(url.searchParams.get('apply')||'').toLowerCase());
    const cursor = num(url.searchParams.get('cursor'), 0, 0, 1000000000);
    // Apply mode is intentionally capped to stay below Cloudflare subrequest limits.
    // Verify/dry-run can scan larger pages because it only reads once and does local calculations.
    const limit = apply
      ? num(url.searchParams.get('limit'), 30, 1, 40)
      : num(url.searchParams.get('limit'), 500, 1, 1000);

    const rows = await getRows(context.env, limit, cursor);
    let scanned = rows.length, needsChange = 0, updated = 0, deactivatedDuplicates = 0, skipped = 0;
    let nextCursor = cursor;
    const examples = [];
    const planned = [];

    for(const r of rows){
      nextCursor = Math.max(nextCursor, Number(r.id || 0));
      const src = sourceRowFromRegistry(r);
      const expected = deriveContractor(src) || 'JGC';
      const tp = tpNo(src) || r.tp_no || '';
      const expectedFp = await fingerprint(src);
      const expectedId = displayIdFromExisting(expected, tp, r.bitem_id);
      const current = clean(r.contractor || 'JGC') || 'JGC';
      const reason = mismatchReason(r, expected, expectedFp, expectedId);
      if(!reason) continue;
      needsChange++;
      const sample = {
        id:r.id,
        bitem_id:r.bitem_id,
        expected_bitem_id:expectedId,
        tp_no:tp,
        area:rowArea(src) || r.area || '',
        from:current,
        to:expected,
        reason
      };
      if(examples.length < 25) examples.push(sample);
      planned.push({ r, src, expected, tp, expectedFp, expectedId, current, reason });
    }

    let collisions = new Map();
    if(apply && planned.length){
      collisions = await getByFingerprints(context.env, planned.map(x => x.expectedFp));
    }

    if(apply){
      for(const p of planned){
        const collision = collisions.get(String(p.expectedFp));
        if(collision && String(collision.id || '') !== String(p.r.id || '')){
          await patchById(context.env, p.r.id, {
            active: 0,
            sync_note: `Deactivated by scope repair: duplicate exists as ${collision.bitem_id || collision.fingerprint}. ${clean(p.r.sync_note || '')}`.slice(0,900),
            updated_at: nowIso()
          });
          deactivatedDuplicates++;
          continue;
        }
        await patchById(context.env, p.r.id, {
          contractor: p.expected,
          fingerprint: p.expectedFp,
          bitem_id: p.expectedId,
          row_json: updateStoredRowJson(p.r, p.src, p.expected),
          sync_note: `Scope repaired from ${p.current} to ${p.expected}. ${clean(p.r.sync_note || '')}`.slice(0,900),
          updated_at: nowIso()
        });
        updated++;
      }
    }

    const done = rows.length < limit;
    return json({
      ok:true,
      source:'bitem_scope_repair',
      version:'V84_BATCH_SAFE',
      mode:apply?'APPLIED':'DRY_RUN',
      cursor,
      next_cursor: nextCursor,
      limit,
      scanned,
      needs_change: needsChange,
      updated,
      deactivated_duplicates: deactivatedDuplicates,
      skipped,
      done,
      examples
    });
  }catch(e){
    console.error('BITEM_REPAIR_SCOPE_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'bitem_scope_repair', version:'V84_BATCH_SAFE', error:e && e.message ? e.message : String(e || 'Unknown error') }, 500);
  }
}
