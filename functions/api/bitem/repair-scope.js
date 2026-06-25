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
function displayIdFromCounter(contractor,tp,seq){
  const c = contractor || 'JGC';
  const t = tp || 'NO-TP';
  return `${c}-B-${t}-C${String(seq).padStart(3,'0')}`;
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
async function sbJson(env,path,init={}){
  const r = await sbFetch(env,path,init);
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch (_) { throw new Error(`Supabase returned non-JSON (${r.status}): ${text.slice(0,500)}`); }
  if(!r.ok) throw new Error(`Supabase request failed (${r.status}) ${path}: ${JSON.stringify(data).slice(0,800)}`);
  return data;
}
async function getRows(env,limit,offset){
  const cols = 'id,bitem_id,fingerprint,contractor,tp_no,construction_stage,punch_category,comment_text,material_type,iso_or_spool,area,row_json,active,sync_note';
  const data = await sbJson(env, `/rest/v1/bitem_registry?select=${cols}&active=eq.1&limit=${limit}&offset=${offset}&order=tp_no.asc`);
  return Array.isArray(data) ? data : [];
}
async function getByFingerprint(env,fp){
  const data = await sbJson(env, `/rest/v1/bitem_registry?select=id,bitem_id,fingerprint,active&fingerprint=eq.${enc(fp)}&limit=1`);
  return Array.isArray(data) && data[0] ? data[0] : null;
}
async function maxSeqForKey(env, contractor, tp){
  const prefix = `${contractor || 'JGC'}-B-${tp || 'NO-TP'}-C`;
  const data = await sbJson(env, `/rest/v1/bitem_registry?select=bitem_id&contractor=eq.${enc(contractor)}&tp_no=eq.${enc(tp)}&bitem_id=like.${enc(prefix)}*&limit=1000`);
  let max = 0;
  for(const r of (Array.isArray(data)?data:[])){
    const m = String(r.bitem_id || '').match(/-C(\d+)$/);
    if(m) max = Math.max(max, Number(m[1] || 0));
  }
  return max;
}
async function patchByFingerprint(env, oldFp, body){
  await sbJson(env, `/rest/v1/bitem_registry?fingerprint=eq.${enc(oldFp)}`, {
    method:'PATCH',
    headers:{'content-type':'application/json','prefer':'return=minimal'},
    body: JSON.stringify(body)
  });
}

export async function onRequestGet(context){
  try{
    const sbError = assertSupabase(context.env); if(sbError) return sbError;
    const auth = await requireUser(context, ['admin']);
    if(auth.error) return auth.error;
    const url = new URL(context.request.url);
    const apply = ['1','true','yes','apply'].includes(String(url.searchParams.get('apply')||'').toLowerCase());
    const maxRows = Math.max(1, Math.min(Number(url.searchParams.get('max') || 20000), 60000));
    const limit = 1000;
    let offset = 0;
    let scanned = 0, needsChange = 0, updated = 0, deactivatedDuplicates = 0, skipped = 0;
    const examples = [];
    const seqCache = new Map();
    while(scanned < maxRows){
      const rows = await getRows(context.env, Math.min(limit, maxRows - scanned), offset);
      if(!rows.length) break;
      offset += rows.length;
      scanned += rows.length;
      for(const r of rows){
        const src = sourceRowFromRegistry(r);
        const expected = deriveContractor(src) || 'JGC';
        const current = clean(r.contractor || 'JGC') || 'JGC';
        if(String(expected) === String(current)) continue;
        needsChange++;
        const tp = tpNo(src) || r.tp_no || '';
        const newFp = await fingerprint(src);
        const collision = await getByFingerprint(context.env, newFp);
        const sample = { bitem_id:r.bitem_id, tp_no:tp, area:rowArea(src) || r.area || '', from:current, to:expected, new_fingerprint:newFp.slice(0,12) };
        if(examples.length < 25) examples.push(sample);
        if(!apply) continue;
        if(collision && String(collision.fingerprint || '') !== String(r.fingerprint || '')){
          await patchByFingerprint(context.env, r.fingerprint, {
            active: 0,
            sync_note: `Deactivated by scope repair: duplicate exists as ${collision.bitem_id || collision.fingerprint}.`,
            updated_at: nowIso()
          });
          deactivatedDuplicates++;
          continue;
        }
        const seqKey = `${expected}|${tp}`;
        if(!seqCache.has(seqKey)) seqCache.set(seqKey, await maxSeqForKey(context.env, expected, tp));
        const next = Number(seqCache.get(seqKey) || 0) + 1;
        seqCache.set(seqKey, next);
        const newId = displayIdFromCounter(expected, tp, next);
        await patchByFingerprint(context.env, r.fingerprint, {
          contractor: expected,
          fingerprint: newFp,
          bitem_id: newId,
          sync_note: `Scope repaired from ${current} to ${expected}. ${clean(r.sync_note || '')}`.slice(0,900),
          updated_at: nowIso()
        });
        updated++;
      }
      if(rows.length < limit) break;
    }
    return json({ ok:true, source:'bitem_scope_repair', mode:apply?'APPLIED':'DRY_RUN', scanned, needs_change:needsChange, updated, deactivated_duplicates:deactivatedDuplicates, skipped, examples });
  }catch(e){
    console.error('BITEM_REPAIR_SCOPE_ERROR', e && (e.stack || e.message || e));
    return json({ ok:false, source:'bitem_scope_repair', error:e && e.message ? e.message : String(e || 'Unknown error') }, 500);
  }
}
