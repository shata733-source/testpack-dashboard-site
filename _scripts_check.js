
// Multi-page bridge: force this physical page to open the correct old stable route.
(function(){
  var target='#/dashboard';
  if(location.hash!==target) location.replace(location.pathname+target);
})();

;

// DATA_START
var TP=window.TP||[];
var MAT=window.MAT||{};
var MAT_ROWS=window.MAT_ROWS||[];
var PUNCH_STATS=window.PUNCH_STATS||[];
var PUNCH_MON=window.PUNCH_MON||{};
var PUNCH_WEK=window.PUNCH_WEK||{};
var PUNCH_EVENTS=window.PUNCH_EVENTS||[];
var TP_MON=window.TP_MON||{};
var TP_WEK=window.TP_WEK||{};
var TP_SUMMARY_ROWS=window.TP_SUMMARY_ROWS||[];
var TP_SUMMARY_HEADERS=window.TP_SUMMARY_HEADERS||[];
// DATA_END
var TP_SUMMARY_ROWS=(typeof TP_SUMMARY_ROWS==='undefined')?[]:TP_SUMMARY_ROWS;
var TP_SUMMARY_HEADERS=(typeof TP_SUMMARY_HEADERS==='undefined')?[]:TP_SUMMARY_HEADERS;
var TEST_PACK_ROWS=window.TEST_PACK_ROWS||[];
var TEST_PACK_HEADERS=window.TEST_PACK_HEADERS||[];
var B_ITEM_ROWS=window.B_ITEM_ROWS||[];
var B_ITEM_HEADERS=window.B_ITEM_HEADERS||[];

const LIGHT_TEST_PACK_HEADERS=["TP NUMBER","Date","Construction Stage","Area","ISO No.","Punch Item","Punch Item Type","Material TYPE","Comments","Ident. Code","Punch Category\r\n(A/B/C)","Punch Cleared"];
const B_ITEM_SHEET_HEADERS=["TP NUMBER","Construction Stage","Date","Area","ISO No.","Sheet No.","Punch Category\n(A/B/C)","Material TYPE","Comments","Punch Cleared"];
let TEST_PACK_HEADER_MAP=null;
let DATA_VERSION=0;
let FILTER_CACHE={key:'',data:null};
let PUNCH_FAST_CACHE={};
function invalidateDashboardCaches(){
  FILTER_CACHE={key:'',data:null};
  PUNCH_FAST_CACHE={};
  TEST_PACK_HEADER_MAP=null;
}
function getTestPackHeaderMap(){
  if(TEST_PACK_HEADER_MAP)return TEST_PACK_HEADER_MAP;
  const map={};
  (TEST_PACK_HEADERS||[]).forEach((h,i)=>{map[normHeaderKey(h)]=i;});
  TEST_PACK_HEADER_MAP=map;
  return map;
}
function compactTestPackRows(rows){
  const hdrs=LIGHT_TEST_PACK_HEADERS||[];
  if(!Array.isArray(rows)||!rows.length)return [];
  if(Array.isArray(rows[0])){
    TEST_PACK_HEADERS=hdrs.slice();
    TEST_PACK_HEADER_MAP=null;
    return rows;
  }
  const out=rows.map(r=>hdrs.map(h=>rowValue(r,[h])));
  TEST_PACK_HEADERS=hdrs.slice();
  TEST_PACK_HEADER_MAP=null;
  return out;
}
function ensureLightTestPackRows(){
  if(!Array.isArray(TEST_PACK_ROWS))TEST_PACK_ROWS=[];
  if(TEST_PACK_ROWS.length && !Array.isArray(TEST_PACK_ROWS[0])){
    TEST_PACK_ROWS=compactTestPackRows(TEST_PACK_ROWS);
  }
  TEST_PACK_HEADERS=(LIGHT_TEST_PACK_HEADERS||TEST_PACK_HEADERS||[]).slice();
  TEST_PACK_HEADER_MAP=null;
}
function filterStateKey(extra=''){
  const a=v=>Array.isArray(v)?v.join('|'):String(v);
  return [extra,DATA_VERSION,F&&F.con,a(F&&F.areaGrp),a(F&&F.area),a(F&&F.sys),a(F&&F.stage)].join('§');
}


let F={con:'ALL',areaGrp:['ALL'],area:['ALL'],sys:['ALL'],stage:['ALL']};
let currentPage='overview';

let allAreas=[];
let allAreaGroups=[];

const STAGE_ORDER=[
  'CNS L/C Completed','CNS Punch Issue','CNS A Punch Clear','L/C Issue To QC',
  'QC PreTestPack Punch List','QC Punch A Cleared','QC Punch A Confirmed','NDE Cleared',
  'L/C Issue SAPMT','SAPMT Punch List Return','SAPMT Punch A Cleared','L/C Issued to SAPID',
  'SAPID Punch List','SAPID Punch A Cleared','RFT','Air Blowing','Hydro Testing','Layup',
  'Release To Paint/Insulation','Release to PCOM (For Cleaning)','Return for Reinstatement',
  'CNS Punch B Cleared','L/C Issue To QC-2','QC Punch List Return','QC Reinstatement Sign',
  'Issue to SAPMT','SAPMT Sign','Issue to SAPID','PID-Reinstated'
];

// Populate systems and stages
let allSystems=[];
const areaGrpSel=document.getElementById('fAreaGrp');
const areaSel=document.getElementById('fArea');
const sysSel=document.getElementById('fSys');
const stageSel=document.getElementById('fStage');

function areaSort(a,b){
  a=String(a||''); b=String(b||'');
  const ma=a.match(/^([A-Z]+)(\d+)(.*)$/i), mb=b.match(/^([A-Z]+)(\d+)(.*)$/i);
  if(ma&&mb){
    const c=ma[1].localeCompare(mb[1],undefined,{numeric:true,sensitivity:'base'});
    if(c)return c;
    const n=Number(ma[2])-Number(mb[2]);
    if(n)return n;
    return ma[3].localeCompare(mb[3],undefined,{numeric:true,sensitivity:'base'});
  }
  return a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
}
function areaGroupOf(a){
  // Area Group should be based on the first letter only.
  // Example: ACU... must be under group A, not group ACU.
  const m=String(a||'').trim().toUpperCase().match(/^[A-Z]/);
  return m?m[0]:'Other';
}
function extractAreas(v){
  const s=clean(v).toUpperCase();
  if(!s)return [];
  const matches=s.match(/[A-Z]+\d{2,5}[A-Z]?/g)||[];
  const list=[...new Set(matches.map(x=>x.trim()).filter(Boolean))].sort(areaSort);
  return list.length?list:[s];
}
function getAllAreasFromTP(){
  const vals=[];
  (TP||[]).forEach(r=>extractAreas(r.areaRaw||r.area||'').forEach(a=>vals.push(a)));
  return [...new Set(vals)].sort(primaryAreaSort);
}
function getAllAreaGroupsFromAreas(areas){
  return [...new Set((areas||[]).map(areaGroupOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}

const PRIMARY_AREAS=['A211','A212','A222','A231','A232','A233'];
function primaryAreaSort(a,b){
  const ia=PRIMARY_AREAS.indexOf(String(a||'').toUpperCase());
  const ib=PRIMARY_AREAS.indexOf(String(b||'').toUpperCase());
  if(ia>=0&&ib>=0)return ia-ib;
  if(ia>=0)return -1;
  if(ib>=0)return 1;
  return areaSort(a,b);
}

function toMulti(v){
  if(Array.isArray(v))return v.length?v:['ALL'];
  if(!v||v==='ALL')return ['ALL'];
  return [v];
}
function selectValues(el){
  if(!el)return ['ALL'];
  const vals=[...el.selectedOptions].map(o=>o.value).filter(Boolean);
  if(!vals.length||vals.includes('ALL'))return ['ALL'];
  return vals;
}
function applyMultiSelect(el,vals){
  if(!el)return;
  vals=toMulti(vals);
  [...el.options].forEach(o=>{o.selected=vals.includes(o.value)||(vals.includes('ALL')&&o.value==='ALL');});
}
function multiIsAll(vals){return toMulti(vals).includes('ALL');}
function setMultiF(key,el){
  F[key]=selectValues(el);
  if(multiIsAll(F[key]))applyMultiSelect(el,['ALL']);
  refresh();
}
function populateAreaFilters(){
  if(!areaSel&&!areaGrpSel)return;
  allAreas=getAllAreasFromTP();
  allAreaGroups=getAllAreaGroupsFromAreas(allAreas);

  if(areaGrpSel){
    areaGrpSel.innerHTML='<option value="ALL">All Area Groups</option>';
    allAreaGroups.forEach(g=>{const o=document.createElement('option');o.value=o.textContent=g;areaGrpSel.appendChild(o);});
    const gVals=toMulti(F.areaGrp).filter(v=>v==='ALL'||allAreaGroups.includes(v));
    F.areaGrp=gVals.length?gVals:['ALL'];
    applyMultiSelect(areaGrpSel,F.areaGrp);
  }

  if(areaSel){
    areaSel.innerHTML='<option value="ALL">All Areas</option>';
    allAreas.forEach(a=>{const o=document.createElement('option');o.value=o.textContent=a;areaSel.appendChild(o);});
    const aVals=toMulti(F.area).filter(v=>v==='ALL'||allAreas.includes(v));
    F.area=aVals.length?aVals:['ALL'];
    applyMultiSelect(areaSel,F.area);
  }
}

function populateSystems(){
  if(!sysSel)return;
  allSystems=[...new Set((TP||[]).map(r=>clean(r.sys)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  sysSel.innerHTML='<option value="ALL">All Systems</option>';
  allSystems.forEach(s=>{const o=document.createElement('option');o.value=o.textContent=s;sysSel.appendChild(o)});
  const vals=toMulti(F.sys).filter(v=>v==='ALL'||allSystems.includes(v));
  F.sys=vals.length?vals:['ALL'];
  applyMultiSelect(sysSel,F.sys);
}
function populateStageFilter(){
  if(!stageSel)return;
  stageSel.innerHTML='<option value="ALL">All Stages</option>';
  STAGE_ORDER.forEach(s=>{const o=document.createElement('option');o.value=o.textContent=s;stageSel.appendChild(o)});
  const vals=toMulti(F.stage).filter(v=>v==='ALL'||STAGE_ORDER.includes(v));
  F.stage=vals.length?vals:['ALL'];
  applyMultiSelect(stageSel,F.stage);
}
function buildMultiDropdown(selectId,ddId,key,allText){
  const sel=document.getElementById(selectId), dd=document.getElementById(ddId);
  if(!sel||!dd)return;
  const vals=selectValues(sel);
  dd.innerHTML=`<button type="button" class="multi-dd-btn"><span class="multi-dd-label"></span><span class="multi-dd-arrow">▾</span></button><div class="multi-dd-menu"><div class="multi-dd-tools"><button type="button" data-act="all">All</button><button type="button" data-act="clear">Clear</button></div><input class="multi-dd-search" type="text" placeholder="Search..." oninput="filterMultiDropdownOptions(this)"><div class="multi-dd-options"></div></div>`;
  const opts=dd.querySelector('.multi-dd-options');
  [...sel.options].forEach(o=>{
    const row=document.createElement('label');
    row.className='multi-dd-option';
    row.dataset.search=String(o.textContent||o.value).toUpperCase();
    row.innerHTML=`<input type="checkbox" value="${escapeAttr(o.value)}" ${vals.includes(o.value)?'checked':''}> <span>${escapeHtml(o.textContent||o.value)}</span>`;
    opts.appendChild(row);
  });
  dd.querySelector('.multi-dd-btn').onclick=(ev)=>{ev.stopPropagation();document.querySelectorAll('.multi-dd.open').forEach(x=>{if(x!==dd)x.classList.remove('open')});dd.classList.toggle('open');const s=dd.querySelector('.multi-dd-search');if(s)setTimeout(()=>s.focus(),50);};
  dd.querySelector('.multi-dd-menu').onclick=(ev)=>ev.stopPropagation();
  dd.querySelectorAll('input[type="checkbox"]').forEach(ch=>{
    ch.onchange=()=>{
      let picked=[...dd.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
      if(ch.value==='ALL'&&ch.checked)picked=['ALL'];
      if(ch.value!=='ALL'&&ch.checked)picked=picked.filter(v=>v!=='ALL');
      if(!picked.length)picked=['ALL'];
      applyMultiSelect(sel,picked);
      setMultiF(key,sel);
      updateMultiDropdownLabel(dd,sel,allText);
      syncMultiDropdownChecks(dd,sel);
    };
  });
  dd.querySelector('[data-act="all"]').onclick=(ev)=>{ev.stopPropagation();applyMultiSelect(sel,['ALL']);setMultiF(key,sel);updateMultiDropdownLabel(dd,sel,allText);syncMultiDropdownChecks(dd,sel);};
  dd.querySelector('[data-act="clear"]').onclick=(ev)=>{ev.stopPropagation();applyMultiSelect(sel,['ALL']);setMultiF(key,sel);updateMultiDropdownLabel(dd,sel,allText);syncMultiDropdownChecks(dd,sel);};
  updateMultiDropdownLabel(dd,sel,allText);
  syncMultiDropdownChecks(dd,sel);
}
function escapeHtml(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function escapeAttr(v){return escapeHtml(v).replace(/'/g,'&#39;');}
function filterMultiDropdownOptions(inp){
  const q=String(inp.value||'').trim().toUpperCase();
  const menu=inp.closest('.multi-dd-menu');
  if(!menu)return;
  menu.querySelectorAll('.multi-dd-option').forEach(row=>{
    row.style.display=!q || String(row.dataset.search||'').includes(q) ? '' : 'none';
  });
}
function syncMultiDropdownChecks(dd,sel){
  const vals=selectValues(sel);
  dd.querySelectorAll('input[type="checkbox"]').forEach(ch=>{ch.checked=vals.includes(ch.value);});
}
function updateMultiDropdownLabel(dd,sel,allText){
  const vals=selectValues(sel);
  const lab=dd.querySelector('.multi-dd-label');
  if(!lab)return;
  if(!vals.length||vals.includes('ALL')){lab.textContent=allText;return;}
  lab.textContent=vals.length<=2?vals.join(', '):`${vals.length} selected`;
}
function initSidebarMultiDropdowns(){
  buildMultiDropdown('fAreaGrp','ddAreaGrp','areaGrp','All Area Groups');
  buildMultiDropdown('fArea','ddArea','area','All Areas');
  buildMultiDropdown('fSys','ddSys','sys','All Systems');
  buildMultiDropdown('fStage','ddStage','stage','All Stages');
}
function rebuildSidebarFilters(){
  if(typeof populateAreaFilters==='function')populateAreaFilters();
  if(typeof populateSystems==='function')populateSystems();
  if(typeof populateStageFilter==='function')populateStageFilter();
  if(typeof initSidebarMultiDropdowns==='function')initSidebarMultiDropdowns();
  else if(typeof updateSidebarMultiDropdownLabels==='function')updateSidebarMultiDropdownLabels();
}

function updateSidebarMultiDropdownLabels(){
  [['fAreaGrp','ddAreaGrp','All Area Groups'],['fArea','ddArea','All Areas'],['fSys','ddSys','All Systems'],['fStage','ddStage','All Stages']].forEach(([sid,did,txt])=>{
    const sel=document.getElementById(sid),dd=document.getElementById(did); if(sel&&dd){updateMultiDropdownLabel(dd,sel,txt);syncMultiDropdownChecks(dd,sel);}
  });
}
document.addEventListener('click',()=>document.querySelectorAll('.multi-dd.open').forEach(dd=>dd.classList.remove('open')));

populateAreaFilters();
populateSystems();
populateStageFilter();
initSidebarMultiDropdowns();

function setF(key,val,btn){
  F[key]=val;
  if(key==='con'&&btn){document.querySelectorAll('.sidebar .fbtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}
  refresh();
}
function resetFilters(){
  F={con:'ALL',areaGrp:['ALL'],area:['ALL'],sys:['ALL'],stage:['ALL']};
  applyMultiSelect(document.getElementById('fAreaGrp'),['ALL']);
  applyMultiSelect(document.getElementById('fArea'),['ALL']);
  applyMultiSelect(document.getElementById('fSys'),['ALL']);
  applyMultiSelect(document.getElementById('fStage'),['ALL']);
  updateSidebarMultiDropdownLabels();
  document.querySelectorAll('.sidebar .fbtn').forEach((b,i)=>b.classList.toggle('active',i===0));
  refresh();
}
function getFiltered(){
  const key=filterStateKey('tp');
  if(FILTER_CACHE.key===key&&FILTER_CACHE.data)return FILTER_CACHE.data;
  const areaGrpVals=toMulti(F.areaGrp);
  const areaVals=toMulti(F.area);
  const sysVals=toMulti(F.sys);
  const stageVals=toMulti(F.stage);
  const out=TP.filter(r=>{
    if(F.con!=='ALL'&&r.con!==F.con) return false;
    const ras=tpAreas(r);
    if(!multiIsAll(areaGrpVals)&&!ras.some(a=>areaGrpVals.includes(areaGroupOf(a)))) return false;
    if(!multiIsAll(areaVals)&&!ras.some(a=>areaVals.includes(a))) return false;
    if(!multiIsAll(sysVals)&&!sysVals.includes(r.sys)) return false;
    if(!multiIsAll(stageVals)){
      const ok=stageVals.some(stg=>stg==='CNS L/C Completed'?hasCnsLC(r):hasStage(r,stg));
      if(!ok)return false;
    }
    return true;
  });
  FILTER_CACHE={key,data:out};
  return out;
}
let _refreshTimer=null;
let _refreshFrame=null;
let _lastRenderedPage='';
function showPage(pg,btn){
  if(currentPage===pg && document.getElementById('page-'+pg)?.classList.contains('active'))return;
  currentPage=pg;
  document.querySelectorAll('.page.active').forEach(p=>p.classList.remove('active'));
  const page=document.getElementById('page-'+pg);
  if(page)page.classList.add('active');
  document.querySelectorAll('.tab.active').forEach(t=>t.classList.remove('active'));
  if(btn)btn.classList.add('active');
  refresh(true);
}
function refresh(immediate=false){
  clearTimeout(_refreshTimer);
  if(_refreshFrame){cancelAnimationFrame(_refreshFrame);_refreshFrame=null;}
  const run=()=>{_refreshFrame=requestAnimationFrame(()=>{_refreshFrame=null;_doRefresh();});};
  if(immediate)run();
  else _refreshTimer=setTimeout(run,20);
}
function _doRefresh(){
  const data=getFiltered();
  _lastRenderedPage=currentPage;
  if(currentPage==='overview') renderOverview(data);
  else if(currentPage==='stages')   renderStages(data);
  else if(currentPage==='stagescontrol') renderStagesControl(data);
  else if(currentPage==='material') renderMaterial(data);
  else if(currentPage==='punch') renderPunchPage(data);
  else if(currentPage==='system')   renderSystem(data);
  else if(currentPage==='comparison') renderComparison();
  else if(currentPage==='tplist') renderTestPackList(data);
  else if(currentPage==='tpcomments') renderTestPackComments(data);
  else if(currentPage==='progress') renderProgress(data);
}

// HELPERS
function h(el,html){const node=document.getElementById(el); if(node) node.innerHTML=html;}
function sum(arr,fn){return arr.reduce((s,r)=>s+(fn(r)||0),0);}
function cnt(arr,fn){return arr.filter(fn).length;}
function hasStage(r,s){return!!(r.st&&r.st[s]);}
function hasCnsLC(r){return hasStage(r,'CNS L/C Completed');}
function tpAreas(r){
  const raw=extractAreas(r&&((r.areaRaw||r.area)||''));
  const arr=Array.isArray(r&&r.areas)&&r.areas.length?r.areas:[];
  const merged=[...new Set([...arr,...raw].map(a=>clean(a).toUpperCase()).filter(Boolean))].sort(areaSort);
  return merged;
}
function normalizeAreas(v){return extractAreas(v);}
function fmtNum(v,d=0){return Number(v||0).toLocaleString(undefined,{maximumFractionDigits:d});}
function pct(v,t){return t>0?(v/t*100).toFixed(1):'0.0';}
function areaFilterPass(area){
  const a=clean(area).toUpperCase();
  const areaGrpVals=toMulti(F.areaGrp), areaVals=toMulti(F.area);
  if(!multiIsAll(areaGrpVals)&&!areaGrpVals.includes(areaGroupOf(a)))return false;
  if(!multiIsAll(areaVals)&&!areaVals.includes(a))return false;
  return true;
}


function escapeHTML(v){return clean(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function buildFallbackTpSummaryRows(data){
  const rows=(data&&data.length?data:TP).map(r=>({
    'TestPackNo':r.tp,'SystemNo':r.sys,'Area':r.areaRaw||tpAreas(r).join(', '),'CCC / JGC Direct MP':r.con,'Priority':r.pri,
    'Length':r.len,'Volume':r.vol,
    'CNS L/C Completed':r.st&&r.st['CNS L/C Completed']||'',
    'CNS Punch Issue':r.st&&r.st['CNS Punch Issue']||'',
    'CNS A Punch Clear':r.st&&r.st['CNS A Punch Clear']||'',
    'L/C Issue To QC':r.st&&r.st['L/C Issue To QC']||'',
    'QC PreTestPack Punch List':r.st&&r.st['QC PreTestPack Punch List']||'',
    'QC Punch A Cleared':r.st&&r.st['QC Punch A Cleared']||'',
    'QC Punch A Confirmed':r.st&&r.st['QC Punch A Confirmed']||'',
    'RFT':r.st&&r.st['RFT']||'',
    'Hydro Testing':r.st&&r.st['Hydro Testing']||'',
    'Total Punch A':r.pa,'Total A Punch Cleared':r.pac,'Total A Punch Balance':r.pab,
    'Total Punch B':r.pb,'Total B Punch Cleared':r.pbc,'Total B Punch Balance':r.pbb,
    'Total Punch C':r.pcx,'Total C Punch Cleared':r.pcc,'Total C Punch Balance':r.pcb,
    'Total Spools not erected':r.sp,'Total Supports not erected':r.su,'Total Valves not erected':r.va
  }));
  return rows;
}
function tpSummaryHeaders(rows){
  const preferred=['TestPackNo','SystemNo','Area','CCC / JGC Direct MP','Priority','Length','Volume'];
  const headers=(Array.isArray(TP_SUMMARY_HEADERS)&&TP_SUMMARY_HEADERS.length)?TP_SUMMARY_HEADERS.slice():[];
  rows.forEach(r=>Object.keys(r||{}).forEach(k=>{if(!headers.includes(k))headers.push(k);}));
  preferred.slice().reverse().forEach(h=>{const i=headers.indexOf(h);if(i>0){headers.splice(i,1);headers.unshift(h);}});
  return headers;
}
function formatTpListCell(header,value){
  if(value===null||value===undefined||value==='(blank)')return '';
  const h=clean(header);
  if(STAGE_ORDER.includes(h)||/date/i.test(h)){
    const iso=excelDateToISO(value);
    if(iso){const p=iso.split('-');return `${p[2]}/${p[1]}/${p[0]}`;}
  }
  if(typeof value==='number'&&Math.abs(value)>0&&Math.abs(value)<1000000){
    return Number.isInteger(value)?String(value):String(Math.round(value*1000)/1000);
  }
  return clean(value);
}
// UPDATE DELTA HELPERS
const DASHBOARD_DIFF_KEY='testpackDashboard.originalScope.updateDiffBase.v7.grandBaseline';
let DIFF_BASE=null;
function cloneSnapshot(obj){try{return JSON.parse(JSON.stringify(obj));}catch(e){return null;}}
function withDashboardSnapshot(snapshot,fn){
  if(!snapshot)return null;
  const bak={TP, MAT, MAT_ROWS, TP_SUMMARY_ROWS, TP_SUMMARY_HEADERS, TEST_PACK_ROWS, TEST_PACK_HEADERS, B_ITEM_ROWS, B_ITEM_HEADERS, PUNCH_STATS, PUNCH_MON, PUNCH_WEK, PUNCH_EVENTS, TP_MON, TP_WEK};
  const bakCache={filter:FILTER_CACHE,punch:PUNCH_FAST_CACHE,headerMap:TEST_PACK_HEADER_MAP};
  try{
    // Never let calculations made on a snapshot pollute the live caches.
    FILTER_CACHE={key:'',data:null};
    PUNCH_FAST_CACHE={};
    TEST_PACK_HEADER_MAP=null;

    TP=snapshot.TP||[]; MAT=snapshot.MAT||{}; MAT_ROWS=snapshot.MAT_ROWS||[];
    TP_SUMMARY_ROWS=snapshot.TP_SUMMARY_ROWS||[]; TP_SUMMARY_HEADERS=snapshot.TP_SUMMARY_HEADERS||[];
    TEST_PACK_ROWS=Array.isArray(snapshot.TEST_PACK_ROWS)?snapshot.TEST_PACK_ROWS:[];
    TEST_PACK_HEADERS=Array.isArray(snapshot.TEST_PACK_HEADERS)?snapshot.TEST_PACK_HEADERS:[];
    B_ITEM_ROWS=Array.isArray(snapshot.B_ITEM_ROWS)?snapshot.B_ITEM_ROWS:[];
    B_ITEM_HEADERS=Array.isArray(snapshot.B_ITEM_HEADERS)?snapshot.B_ITEM_HEADERS:[];
    if(typeof ensureLightTestPackRows==='function')ensureLightTestPackRows();

    PUNCH_STATS=snapshot.PUNCH_STATS||[]; PUNCH_MON=snapshot.PUNCH_MON||{}; PUNCH_WEK=snapshot.PUNCH_WEK||{}; PUNCH_EVENTS=snapshot.PUNCH_EVENTS||[];
    TP_MON=snapshot.TP_MON||{}; TP_WEK=snapshot.TP_WEK||{};
    return fn();
  }finally{
    TP=bak.TP; MAT=bak.MAT; MAT_ROWS=bak.MAT_ROWS;
    TP_SUMMARY_ROWS=bak.TP_SUMMARY_ROWS; TP_SUMMARY_HEADERS=bak.TP_SUMMARY_HEADERS;
    PUNCH_STATS=bak.PUNCH_STATS; PUNCH_MON=bak.PUNCH_MON; PUNCH_WEK=bak.PUNCH_WEK; PUNCH_EVENTS=bak.PUNCH_EVENTS;
    TP_MON=bak.TP_MON; TP_WEK=bak.TP_WEK;
    TEST_PACK_ROWS=bak.TEST_PACK_ROWS; TEST_PACK_HEADERS=bak.TEST_PACK_HEADERS; B_ITEM_ROWS=bak.B_ITEM_ROWS; B_ITEM_HEADERS=bak.B_ITEM_HEADERS;
    FILTER_CACHE=bakCache.filter;
    PUNCH_FAST_CACHE=bakCache.punch;
    TEST_PACK_HEADER_MAP=bakCache.headerMap;
  }
}
function previousFilteredData(){return DIFF_BASE?withDashboardSnapshot(DIFF_BASE,()=>getFiltered()):null;}
function deltaValue(curr,prev){
  const c=Number(curr)||0,p=Number(prev)||0;
  return c-p;
}
function deltaFormat(v,d=0){
  const n=Number(v)||0;
  const abs=Math.abs(n);
  const txt=abs.toLocaleString(undefined,{minimumFractionDigits:d?d:0,maximumFractionDigits:d});
  return (n>0?'+':n<0?'-':'')+txt;
}
function deltaHtml(curr,prev,d=0,invertColor=false,inline=false){
  if(!DIFF_BASE||prev===null||prev===undefined||!Number.isFinite(Number(curr))||!Number.isFinite(Number(prev)))return '';
  const diff=deltaValue(curr,prev);
  // Hide deltas smaller than half of the displayed unit.
  // d=0 means integer display, so differences below/equal 0.5 should not show as misleading +/-0.
  const eps=d>0?Math.pow(10,-d)*0.5:0.5;
  if(Math.abs(diff)<=eps)return '';
  const cls=(diff>0)!==!!invertColor?'up':'down';
  const arrow=diff>0?'▲':'▼';
  return `<span class=\"delta-badge ${cls} ${inline?'delta-inline':''}\" title=\"Previous: ${Number(prev||0).toLocaleString(undefined,{maximumFractionDigits:d})}\">${arrow} ${deltaFormat(diff,d)}</span>`;
}
async function storeUpdateDiffBaseline(beforeSnapshot,source){
  const full=beforeSnapshot?{
    TP:beforeSnapshot.TP||[],
    MAT:beforeSnapshot.MAT||{},
    MAT_ROWS:beforeSnapshot.MAT_ROWS||[],
    TP_SUMMARY_ROWS:beforeSnapshot.TP_SUMMARY_ROWS||[],
    TP_SUMMARY_HEADERS:beforeSnapshot.TP_SUMMARY_HEADERS||[],
    TEST_PACK_ROWS:beforeSnapshot.TEST_PACK_ROWS||[],
    TEST_PACK_HEADERS:beforeSnapshot.TEST_PACK_HEADERS||[],
    B_ITEM_ROWS:beforeSnapshot.B_ITEM_ROWS||[],
    B_ITEM_HEADERS:beforeSnapshot.B_ITEM_HEADERS||[],
    PUNCH_STATS:beforeSnapshot.PUNCH_STATS||[],
    PUNCH_MON:beforeSnapshot.PUNCH_MON||{},
    PUNCH_WEK:beforeSnapshot.PUNCH_WEK||{},
    PUNCH_EVENTS:beforeSnapshot.PUNCH_EVENTS||[],
    TP_MON:beforeSnapshot.TP_MON||{},
    TP_WEK:beforeSnapshot.TP_WEK||{}
  }:null;
  const base=cloneSnapshot(full);
  if(!base||!Array.isArray(base.TP)||!base.TP.length){DIFF_BASE=null;return false;}
  base.diffSavedAt=new Date().toISOString();
  base.diffSource=source||'update';
  DIFF_BASE=base;

  // Lightweight localStorage copy for quick fallback.
  const slim={
    TP:base.TP||[],MAT:base.MAT||{},MAT_ROWS:base.MAT_ROWS||[],
    PUNCH_STATS:base.PUNCH_STATS||[],PUNCH_MON:base.PUNCH_MON||{},PUNCH_WEK:base.PUNCH_WEK||{},PUNCH_EVENTS:base.PUNCH_EVENTS||[],
    TP_MON:base.TP_MON||{},TP_WEK:base.TP_WEK||{},
    diffSavedAt:base.diffSavedAt,diffSource:base.diffSource
  };

  let ok=false;
  try{localStorage.setItem(DASHBOARD_DIFF_KEY,JSON.stringify(slim));ok=true;}catch(err){console.warn('Could not save slim diff baseline in localStorage:',err);}
  try{await idbPutSnapshot(DASHBOARD_DIFF_KEY,base);ok=true;}catch(err){console.warn('Could not save full diff baseline in IndexedDB:',err);}
  return ok;
}
async function loadUpdateDiffBaseline(){
  try{
    const snap=await idbGetSnapshot(DASHBOARD_DIFF_KEY);
    if(snap&&Array.isArray(snap.TP)&&snap.TP.length){DIFF_BASE=snap;return true;}
  }catch(err){console.warn('Could not load full diff baseline from IndexedDB:',err);}
  try{
    const raw=localStorage.getItem(DASHBOARD_DIFF_KEY);
    if(!raw)return false;
    const snap=JSON.parse(raw);
    if(!snap||!Array.isArray(snap.TP)||!snap.TP.length)return false;
    DIFF_BASE=snap;
    return true;
  }catch(err){console.warn('Could not load update diff baseline from localStorage:',err);return false;}
}
function clearUpdateDeltas(showAlert=true){
  DIFF_BASE=null;
  try{localStorage.removeItem(DASHBOARD_DIFF_KEY);}catch(e){}
  try{idbDeleteSnapshot(DASHBOARD_DIFF_KEY);}catch(e){}
  refresh();
  if(showAlert!==false)alert('Update delta indicators have been cleared. They will appear again after the next Update Data.');
}
function buildSystemAgg(data){
  const sysMap={};
  (data||[]).forEach(r=>{
    if(!sysMap[r.sys])sysMap[r.sys]={sys:r.sys,n:0,len:0,vol:0,pa:0,pab:0,pb:0,pbb:0,sp:0,su:0,va:0,lcQC:0,rft:0,hydro:0};
    const x=sysMap[r.sys];
    x.n++;x.len+=(Number(r.len)||0);x.vol+=(Number(r.vol)||0);x.pa+=(Number(r.pa)||0);x.pab+=(Number(r.pab)||0);x.pb+=(Number(r.pb)||0);x.pbb+=(Number(r.pbb)||0);
    x.sp+=(Number(r.sp)||0);x.su+=(Number(r.su)||0);x.va+=(Number(r.va)||0);
    if(hasStage(r,'L/C Issue To QC'))x.lcQC++;
    if(hasStage(r,'RFT'))x.rft++;
    if(hasStage(r,'Hydro Testing'))x.hydro++;
  });
  return sysMap;
}
function stageMetricRows(data){
  const total=data.length,totalLen=sum(data,r=>r.len),totalVol=sum(data,r=>r.vol);
  return STAGE_ORDER.map(stage=>{
    const ds=data.filter(r=>stage==='CNS L/C Completed'?hasCnsLC(r):hasStage(r,stage));
    const len=sum(ds,r=>r.len),vol=sum(ds,r=>r.vol);
    return {stage,count:ds.length,pct:total>0?+(ds.length/total*100).toFixed(1):0,len,lenPct:totalLen>0?+(len/totalLen*100).toFixed(1):0,vol,volPct:totalVol>0?+(vol/totalVol*100).toFixed(1):0,sp:sum(ds,r=>r.sp),su:sum(ds,r=>r.su),va:sum(ds,r=>r.va),pab:sum(ds,r=>r.pab),pbb:sum(ds,r=>r.pbb),pcb:sum(ds,r=>r.pcb)};
  });
}

function hbar(items,maxVal,col){
  const c=col||'linear-gradient(90deg,var(--accent),rgba(0,212,255,.35))';
  return items.map(([lbl,val])=>{
    const raw=Number(val)||0;
    const w=maxVal>0?raw/maxVal*100:0;
    const fillW=raw>0?Math.max(2,w):0;
    const outside=fillW<9;
    const shown=typeof val==='number'&&val%1!==0?val.toFixed(1):val;
    return `<div class="hbar-row">
      <div class="hbar-lbl">${lbl}</div>
      <div class="hbar-wrap"><div class="hbar-fill" style="width:${fillW}%;background:${c}">
        <span class="hbar-cnt ${outside?'outside':''}">${shown}</span>
      </div></div>
    </div>`;
  }).join('');
}

function makeVbar(groups, maxH=120){
  // groups = [{lbl, bars:[{h,col,tip}]}]
  return groups.map(g=>`
    <div class="vbar-group">
      <div class="vbar-bars">
        ${g.bars.map(b=>{
          const ht=Math.max(3,b.v/maxH*110);
          return `<div class="vbar-rect" style="height:${ht}px;width:${b.w||14}px;background:${b.col}" data-tip="${b.tip}"></div>`;
        }).join('')}
      </div>
      <div class="vbar-lbl">${g.lbl}</div>
    </div>
  `).join('');
}

function kpi(label,val,p,cls='',deltaMarkup=''){
  return `<div class="kpi ${cls}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-val">${val}</div>
    ${deltaMarkup||''}
    ${p!==null?`<div class="kpi-pct">${p}%</div>`:''}
  </div>`;
}


function filteredPunchStats(data,ignoreArea=false){
  // Punch stats are now grouped by TP only, matching the supplied Power Query logic.
  // Area / contractor / system / stage filters are already applied in the TP list passed to this function.
  const tpSet=new Set((data||TP).map(r=>clean(r.tp)).filter(Boolean));
  const stats=(typeof PUNCH_STATS!=='undefined'&&Array.isArray(PUNCH_STATS))?PUNCH_STATS:[];
  return stats.filter(e=>e&&tpSet.has(clean(e.tp)));
}
function punchTotals(data,ignoreArea=false){
  const rows=filteredPunchStats(data,ignoreArea);
  return {
    A:{total:sum(rows,r=>r.a), cleared:sum(rows,r=>r.ac)},
    B:{total:sum(rows,r=>r.b), cleared:sum(rows,r=>r.bc)},
    C:{total:sum(rows,r=>r.c), cleared:sum(rows,r=>r.cc)}
  };
}
function filteredPunchEvents(rows){
  const tpSet=new Set(uniqueTPRows(rows||TP).map(r=>r.tp));
  const events=(typeof PUNCH_EVENTS!=='undefined'&&Array.isArray(PUNCH_EVENTS))?PUNCH_EVENTS:[];
  return events.filter(e=>{
    if(!e||!tpSet.has(e.tp)||!e.d||!e.cat)return false;
    if(!areaFilterPass(e.area))return false;
    return true;
  });
}

// OVERVIEW
function renderOverview(data){
  const total=data.length;
  const p=v=>pct(v,total);
  const cnsLC  =cnt(data,r=>hasCnsLC(r));
  const cnsPI  =cnt(data,r=>hasStage(r,'CNS Punch Issue'));
  const cnsAPC =cnt(data,r=>hasStage(r,'CNS A Punch Clear'));
  const lcQC   =cnt(data,r=>hasStage(r,'L/C Issue To QC'));
  const qcPre  =cnt(data,r=>hasStage(r,'QC PreTestPack Punch List'));
  const qcAClr =cnt(data,r=>hasStage(r,'QC Punch A Cleared'));
  const qcACnf =cnt(data,r=>hasStage(r,'QC Punch A Confirmed'));
  const rft    =cnt(data,r=>hasStage(r,'RFT'));
  const hydro  =cnt(data,r=>hasStage(r,'Hydro Testing'));
  const rmcCCC =cnt(data,r=>r.rmc_ccc);
  const rmcJGC =cnt(data,r=>r.rmc_jgc);

  const prevData=previousFilteredData();
  const prev=prevData?withDashboardSnapshot(DIFF_BASE,()=>({
    total:prevData.length,
    cnsLC:cnt(prevData,r=>hasCnsLC(r)), cnsPI:cnt(prevData,r=>hasStage(r,'CNS Punch Issue')), cnsAPC:cnt(prevData,r=>hasStage(r,'CNS A Punch Clear')),
    lcQC:cnt(prevData,r=>hasStage(r,'L/C Issue To QC')), qcPre:cnt(prevData,r=>hasStage(r,'QC PreTestPack Punch List')), qcAClr:cnt(prevData,r=>hasStage(r,'QC Punch A Cleared')),
    qcACnf:cnt(prevData,r=>hasStage(r,'QC Punch A Confirmed')), rft:cnt(prevData,r=>hasStage(r,'RFT')), hydro:cnt(prevData,r=>hasStage(r,'Hydro Testing')),
    rmcCCC:cnt(prevData,r=>r.rmc_ccc), rmcJGC:cnt(prevData,r=>r.rmc_jgc), overallLen:sum(prevData,r=>r.len), overallVol:sum(prevData,r=>r.vol), punch:punchTotalsForDisplay(prevData), mat:materialTotals(prevData)
  })):null;

  h('kpiRow',
    kpi('TP Count',total,null,'',deltaHtml(total,prev&&prev.total)) +
    kpi('CNS L/C Completed',cnsLC,p(cnsLC),'',deltaHtml(cnsLC,prev&&prev.cnsLC)) +
    kpi('CNS Punch Issue',cnsPI,p(cnsPI),'orange',deltaHtml(cnsPI,prev&&prev.cnsPI)) +
    kpi('CNS A Punch Clear',cnsAPC,p(cnsAPC),'purple',deltaHtml(cnsAPC,prev&&prev.cnsAPC)) +
    kpi('L/C Issue To QC',lcQC,p(lcQC),'green',deltaHtml(lcQC,prev&&prev.lcQC)) +
    kpi('QC PreTestPack',qcPre,p(qcPre),'amber',deltaHtml(qcPre,prev&&prev.qcPre)) +
    kpi('QC Punch A Cleared',qcAClr,p(qcAClr),'green',deltaHtml(qcAClr,prev&&prev.qcAClr)) +
    kpi('QC Punch A Confirmed',qcACnf,p(qcACnf),'',deltaHtml(qcACnf,prev&&prev.qcACnf)) +
    kpi('RFT',rft,p(rft),'green',deltaHtml(rft,prev&&prev.rft)) +
    kpi('Hydro Testing',hydro,p(hydro),'pink',deltaHtml(hydro,prev&&prev.hydro)) +
    kpi('RMC by CCC',rmcCCC,p(rmcCCC),'purple',deltaHtml(rmcCCC,prev&&prev.rmcCCC)) +
    kpi('RMC by JGC',rmcJGC,p(rmcJGC),'',deltaHtml(rmcJGC,prev&&prev.rmcJGC))
  );

  const overallLen=sum(data,r=>r.len);
  const overallVol=sum(data,r=>r.vol);
  h('overallLenVal',`${Math.round(overallLen).toLocaleString()}${deltaHtml(overallLen,prev&&prev.overallLen,1)}`);
  h('overallVolVal',`${overallVol.toLocaleString(undefined,{maximumFractionDigits:1})}${deltaHtml(overallVol,prev&&prev.overallVol,1)}`);

  const pTotals=punchTotalsForDisplay(data);
  function pb(cat,obj,col,prevObj){
    const tot=obj.total||0, clr=obj.cleared||0, bal=Math.max(tot-clr,0);
    const prevTot=prevObj?prevObj.total:null, prevClr=prevObj?prevObj.cleared:null, prevBal=prevObj?Math.max((prevObj.total||0)-(prevObj.cleared||0),0):null;
    const pc=tot>0?(clr/tot*100).toFixed(0):0;
    const fmt=v=>v>=1000?(v/1000).toFixed(1)+'K':v;
    return `<div class="punch-box">
      <div class="punch-cat">Punch ${cat}</div>
      <div class="punch-total" style="color:${col}">${fmt(tot)}</div>${deltaHtml(tot,prevTot)}
      <div class="punch-sub">Cleared: ${clr.toLocaleString()} ${deltaHtml(clr,prevClr,0,false,true)}</div>
      <div class="punch-sub" style="color:var(--red)">Balance: ${bal.toLocaleString()} ${deltaHtml(bal,prevBal,0,true,true)}</div>
      <div class="punch-prog"><div class="punch-prog-fill" style="width:${pc}%;background:${col}"></div></div>
      <div style="font-size:11px;color:var(--muted);margin-top:5px;font-weight:600">${pc}% cleared</div>
    </div>`;
  }
  h('punchCards',pb('A',pTotals.A,'var(--accent)',prev&&prev.punch&&prev.punch.A)+pb('B',pTotals.B,'var(--orange)',prev&&prev.punch&&prev.punch.B)+pb('C',pTotals.C,'var(--green)',prev&&prev.punch&&prev.punch.C));

  renderMaterialKPIs('overviewMatKpi',data);

  const chartAreas=getAllAreasFromTP().filter(a=>cnt(data,r=>tpAreas(r).includes(a))>0);
  const areaCnts=chartAreas.map(a=>[a,cnt(data,r=>tpAreas(r).includes(a))]);
  h('areaChart',areaCnts.length?hbar(areaCnts,Math.max(...areaCnts.map(x=>x[1]),1)):'<div class="muted">No area data</div>');
  const priCnts=[0,1,2,3,4,5].map(p=>[String(p),cnt(data,r=>r.pri===p)]);
  h('priChart',hbar(priCnts,Math.max(...priCnts.map(x=>x[1]),1),'linear-gradient(90deg,var(--accent3),rgba(245,158,11,.35))'));
}



// STAGES
function renderStages(data){
  const total=data.length;
  const totalLen=sum(data,r=>r.len);
  const totalVol=sum(data,r=>r.vol);
  const rows=stageMetricRows(data);
  const prevData=previousFilteredData();
  const prevRows=prevData?withDashboardSnapshot(DIFF_BASE,()=>stageMetricRows(prevData)):null;
  const prevMap=prevRows?new Map(prevRows.map(r=>[r.stage,r])):new Map();
  const active=rows.filter(r=>r.count>0);
  const maxStage=active.reduce((m,r)=>r.count>m.count?r:m,{stage:'-',count:0});
  const prevActive=prevRows?prevRows.filter(r=>r.count>0):null;
  const prevMax=prevActive&&prevActive.length?prevActive.reduce((m,r)=>r.count>m.count?r:m,{stage:'-',count:0}):null;
  h('stageKpiRow',
    kpi('Stages',rows.length,null,'')+
    kpi('Filtered TPs',total,null,'green',deltaHtml(total,prevData&&prevData.length))+
    kpi('Highest Stage',maxStage.count,null,'purple',deltaHtml(maxStage.count,prevMax&&prevMax.count))+
    kpi('Total Length',totalLen.toFixed(1),null,'',deltaHtml(totalLen,prevData?sum(prevData,r=>r.len):null,1))+
    kpi('Total Volume',totalVol.toFixed(2),null,'amber',deltaHtml(totalVol,prevData?sum(prevData,r=>r.vol):null,2))
  );
  const volItems=rows.map(r=>[r.stage,+r.vol.toFixed(2)]);
  const lenItems=rows.map(r=>[r.stage,+r.len.toFixed(1)]);
  h('stageVolumeChart',hbar(volItems,Math.max(...volItems.map(x=>x[1]),1),'linear-gradient(90deg,var(--accent2),rgba(124,58,237,.35))'));
  h('stageLengthChart',hbar(lenItems,Math.max(...lenItems.map(x=>x[1]),1),'linear-gradient(90deg,var(--green),rgba(16,185,129,.35))'));
  h('stageTblBody',rows.map((r,i)=>{
    const prevCount=i===0?r.count:rows[i-1].count;
    const delta=prevCount-r.count;
    const deltaCls=delta<0?'stage-delta neg':'stage-delta';
    const pr=prevMap.get(r.stage)||null;
    return `<tr>
      <td>${r.stage}</td>
      <td><span class="stage-pill">${r.count}</span>${deltaHtml(r.count,pr&&pr.count,0,false,true)}</td>
      <td class="${r.pct<100?'stage-pct-warn':''}">${r.pct.toFixed(1)}%</td>
      <td>${r.len.toFixed(1)}${deltaHtml(r.len,pr&&pr.len,1,false,true)}</td>
      <td class="${r.lenPct<100?'stage-pct-warn':''}">${r.lenPct.toFixed(1)}%</td>
      <td>${r.vol.toFixed(2)}${deltaHtml(r.vol,pr&&pr.vol,2,false,true)}</td>
      <td class="${r.volPct<100?'stage-pct-warn':''}">${r.volPct.toFixed(1)}%</td>
      <td><span class="${deltaCls}">${delta}</span></td>
    </tr>`;
  }).join(''));
}


// MATERIAL


function sizeSortValue(sz){
  const s=String(sz||'').replace(/"/g,'').trim().toUpperCase();
  if(!s)return Number.POSITIVE_INFINITY;
  const first=s.split(/[Xx]/)[0].trim();
  const mixed=first.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if(mixed)return Number(mixed[1])+Number(mixed[2])/Number(mixed[3]);
  const frac=first.match(/^(\d+)\/(\d+)$/);
  if(frac)return Number(frac[1])/Number(frac[2]);
  const m=first.match(/[0-9]+(?:\.[0-9]+)?/);
  return m?Number(m[0]):Number.POSITIVE_INFINITY;
}
function sizeCompare(a,b){
  const na=sizeSortValue(a), nb=sizeSortValue(b);
  if(na!==nb)return na-nb;
  return String(a).localeCompare(String(b),undefined,{numeric:true});
}


// === TEMPORARY SUPPORT EXCEPTION ===
// Requested temporary rule:
// For these 4 Test Packs, support comments remain open until an actual Punch Cleared date is entered.
// Do NOT auto-close support items only because the TP passed a later stage.
const TEMP_SUPPORT_EXCEPTION_TPS=new Set([
  '599-PC-01-TP-0006',
  '599-PC-01-TP-1088',
  '599-RL-02-TP-0221',
  '599-RL-02-TP-0236'
]);
function isTempSupportExceptionTp(tp){
  return TEMP_SUPPORT_EXCEPTION_TPS.has(clean(tp).toUpperCase());
}
function isSupportMaterialRow(row){
  const txt=normPunchText([
    rowValue(row,['Punch Item Type','PUNCH ITEM TYPE','Punch Type','Item Type','Type']),
    rowMaterial(row),
    rowPunchItem(row),
    rowComment(row)
  ].join(' '));
  return (
    txt.includes('SUPPORT') ||
    txt.includes('U BOLT') ||
    txt.includes('UBOLT') ||
    txt.includes('CLAMP') ||
    txt.includes('ON PAVE FDN') ||
    txt.includes('ONPAVE FDN') ||
    txt.includes('FOUNDATION') ||
    txt.includes('SHIM PLATE') ||
    txt.includes('INDIRECT WELD') ||
    txt.includes('DIRECT WELD')
  );
}
function tempSupportExceptionRows(data){
  const tpSet=new Set((data||TP).map(r=>clean(r.tp).toUpperCase()));
  const rows=(Array.isArray(TEST_PACK_ROWS)?TEST_PACK_ROWS:[]);
  const expected={};
  rows.forEach(r=>{
    const tp=clean(rowTPNo(r)).toUpperCase();
    if(!tp || !isTempSupportExceptionTp(tp) || !tpSet.has(tp))return;
    if(!isSupportMaterialRow(r))return;
    // Temporary rule: only real Punch Cleared date/non-empty cell closes these support items.
    if(punchRowHasClearedDate(r))return;
    expected[tp]=(expected[tp]||0)+1;
  });
  if(!Object.keys(expected).length)return [];

  // Avoid double-counting: add only the extra support rows not already counted in MAT_ROWS.
  const baseRows=(typeof MAT_ROWS!=='undefined'&&Array.isArray(MAT_ROWS))?MAT_ROWS:[];
  const existing={};
  baseRows.forEach(e=>{
    const tp=clean(e&&e.tp).toUpperCase();
    if(isTempSupportExceptionTp(tp))existing[tp]=(existing[tp]||0)+(Number(e&&e.su)||0);
  });

  const tpAreaMap=new Map((TP||[]).map(r=>[clean(r.tp).toUpperCase(),normalizeAreas(r.areaRaw||r.area)[0]||r.area||'N/A']));
  const out=[];
  Object.keys(expected).forEach(tp=>{
    const add=Math.max((expected[tp]||0)-(existing[tp]||0),0);
    const area=tpAreaMap.get(tp)||'N/A';
    for(let i=0;i<add;i++)out.push({tp,area,sp:0,su:1,va:0,size:'N/A',tempSupportException:true});
  });
  return out;
}


function filteredMaterialRows(data,ignoreArea=false){
  const tpSet=new Set((data||TP).map(r=>clean(r.tp).toUpperCase()));
  const baseRows=(typeof MAT_ROWS!=='undefined'&&Array.isArray(MAT_ROWS))?MAT_ROWS:[];
  const rows=baseRows.concat(tempSupportExceptionRows(data));
  return rows.filter(e=>{
    const tp=clean(e&&e.tp).toUpperCase();
    if(!e||!tpSet.has(tp))return false;
    if(!ignoreArea&&!areaFilterPass(e.area))return false;
    return true;
  });
}
function materialTotals(data){
  const rows=filteredMaterialRows(data);
  return {sp:sum(rows,r=>r.sp),su:sum(rows,r=>r.su),va:sum(rows,r=>r.va)};
}
function renderMaterialKPIs(elId,data){
  const t=materialTotals(data);
  const prevData=previousFilteredData();
  const pt=prevData?withDashboardSnapshot(DIFF_BASE,()=>materialTotals(prevData)):null;
  h(elId,
    `<div class="mat-big"><div class="mat-big-val" style="color:var(--accent)">${fmtNum(t.sp)}</div>${deltaHtml(t.sp,pt&&pt.sp)}<div class="mat-big-label">Spools Not Erected</div></div>`+
    `<div class="mat-big"><div class="mat-big-val" style="color:var(--accent2)">${fmtNum(t.su)}</div>${deltaHtml(t.su,pt&&pt.su)}<div class="mat-big-label">Supports Not Erected</div></div>`+
    `<div class="mat-big"><div class="mat-big-val" style="color:var(--accent3)">${fmtNum(t.va)}</div>${deltaHtml(t.va,pt&&pt.va)}<div class="mat-big-label">Valves Not Erected</div></div>`
  );
}
function renderMatSysChart(elId,data){
  const rows=filteredMaterialRows(data);
  const tpSys=new Map((data||TP).map(r=>[r.tp,r.sys]));
  const agg={};
  rows.forEach(e=>{
    const sys=tpSys.get(e.tp)||'N/A';
    if(!agg[sys])agg[sys]={sp:0,su:0,va:0};
    agg[sys].sp+=Number(e.sp)||0; agg[sys].su+=Number(e.su)||0; agg[sys].va+=Number(e.va)||0;
  });
  const sysData=Object.entries(agg).map(([sys,v])=>[sys,v.sp,v.su,v.va])
    .filter(x=>x[1]+x[2]+x[3]>0).sort((a,b)=>(b[1]+b[2]+b[3])-(a[1]+a[2]+a[3]));
  const maxM=Math.max(...sysData.map(x=>x[1]+x[2]+x[3]),1);
  h(elId,sysData.map(([sys,sp,su,va])=>{
    const hSp=Math.max(3,sp/maxM*110),hSu=Math.max(3,su/maxM*110),hVa=Math.max(3,va/maxM*110);
    const short=sys.replace(/^599-|^462-|^106-/,'');
    function barCol(val,h,col,tip){
      return `<div class="vbar-col-wrap" style="position:relative">
        ${val>0?`<div class="vbar-val">${fmtSmall(val)}</div>`:''}
        <div class="vbar-rect" style="height:${h}px;width:14px;background:${col}" data-tip="${tip}"></div>
      </div>`;
    }
    return `<div class="vbar-group">
      <div class="vbar-bars" style="height:126px;align-items:flex-end">
        ${barCol(sp,hSp,'var(--accent)',sys+' Spools: '+sp)}
        ${barCol(su,hSu,'var(--accent2)',sys+' Supports: '+su)}
        ${barCol(va,hVa,'var(--accent3)',sys+' Valves: '+va)}
      </div>
      <div class="vbar-lbl">${short}</div>
    </div>`;
  }).join(''));
}

function renderMaterial(data){
  renderMaterialKPIs('matKpi',data);
  const rows=filteredMaterialRows(data);
  const areas=getAllAreasFromTP();
  h('matAreaCharts',[["Spools",'sp','var(--accent)'],["Supports",'su','var(--accent2)'],["Valves",'va','var(--accent3)']].map(([lbl,key,col])=>{
    const ad=areas.map(a=>[a,sum(rows.filter(r=>r.area===a),r=>r[key])]).filter(x=>x[1]>0);
    return `<div class="card"><div class="card-title">${lbl} by Area</div><div class="hbar-list">${hbar(ad,Math.max(...ad.map(x=>x[1]),1),`linear-gradient(90deg,${col},${col.replace(')',',0.3)')})`)}</div></div>`;
  }).join(''));

  const vSizes={},vByAS={};
  rows.forEach(e=>{
    const c=Number(e.va)||0;
    if(!c)return;
    const sz=e.size||'N/A';
    vSizes[sz]=(vSizes[sz]||0)+c;
    if(e.area){
      if(!vByAS[e.area])vByAS[e.area]={};
      vByAS[e.area][sz]=(vByAS[e.area][sz]||0)+c;
    }
  });
  const sortedSz=Object.entries(vSizes).sort((a,b)=>sizeCompare(a[0],b[0]));
  h('valveSizeChart',
    hbar(sortedSz,Math.max(...sortedSz.map(x=>x[1]),1),'linear-gradient(90deg,var(--accent3),rgba(245,158,11,.35))')
  );

  const tableAreas=areas.filter(a=>vByAS[a]);
  const allSz=sortedSz.map(x=>x[0]);
  const totalVa=sum(rows,r=>r.va);
  h('valveTable',
    `<thead><tr><th>Size</th>${tableAreas.map(a=>`<th>${a}</th>`).join('')}<th class="tot">Total</th></tr></thead>`+
    `<tbody>${allSz.map(sz=>{
      const row=tableAreas.map(a=>(vByAS[a]&&vByAS[a][sz])||0);
      return `<tr><td>${sz}</td>${row.map(v=>`<td>${v||''}</td>`).join('')}<td class="tot">${row.reduce((s,v)=>s+v,0)}</td></tr>`;
    }).join('')}<tr><td class="tot">Total</td>${tableAreas.map(a=>`<td class="tot">${Object.values(vByAS[a]||{}).reduce((s,v)=>s+v,0)}</td>`).join('')}<td class="tot">${totalVa}</td></tr></tbody>`
  );
  renderMatSysChart('matSysChart',data);
}



// STAGES CONTROL
function stageCount(data,stage){
  return cnt(data,r=>hasStage(r,stage));
}
function currentStageOfTp(r){
  if(!r)return '';
  for(let i=STAGE_ORDER.length-1;i>=0;i--){
    const st=STAGE_ORDER[i];
    if(st==='CNS L/C Completed'){
      if(hasCnsLC(r))return st;
    }else if(hasStage(r,st))return st;
  }
  return '';
}

function bPunchActionParty(row){
  return classifyActionParty(row)==='ENG' ? 'ENG' : 'CNS';
}
function bPunchMaterialType(row){
  return classifyAPunchType(row);
}
function groupRowsByCount(rows,fn){
  const m={};
  (rows||[]).forEach(r=>{const k=fn(r)||'Other';m[k]=(m[k]||0)+1;});
  return Object.entries(m).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),undefined,{numeric:true}));
}
function miniHbar(items,color){
  const mx=Math.max(...(items||[]).map(x=>x[1]),1);
  return (items||[]).map(([label,val])=>`<div class="hbar-row">
    <div class="hbar-lbl">${label}</div>
    <div class="hbar-wrap"><div class="hbar-fill" style="width:${Math.max(2,val/mx*100)}%;background:${color||'linear-gradient(90deg,var(--accent),rgba(34,211,238,.35))'}">
      <span class="hbar-cnt ${val/mx<.18?'outside':''}">${Number(val||0).toLocaleString()}</span>
    </div></div>
  </div>`).join('');
}

function bPunchControlTotals(data){
  const {rows,tpLookup}=bItemRawRowsForFiltered(data);
  const cns={total:0,cleared:0};
  const ret={total:0,cleared:0};

  (rows||[]).forEach(r=>{
    const tp=rowTPNo(r);
    const tpInfo=tpLookup[tp]||{};
    if(isCnsBPunchSourceRow(r)){
      cns.total++;
      if(isBPunchCleared(r,tpInfo))cns.cleared++;
    }
    if(isReturnBPunchRow(r)){
      ret.total++;
      if(isReturnBPunchCleared(r,tpInfo))ret.cleared++;
    }
  });

  return {cns,ret};
}
function controlPunchBox(title,obj,color){
  const total=obj.total||0;
  const cleared=obj.cleared||0;
  const balance=Math.max(total-cleared,0);
  const pc=total>0?(cleared/total*100):0;
  const fmt=v=>Number(v||0).toLocaleString();
  return `<div class="punch-box">
    <div class="punch-cat">${title}</div>
    <div class="punch-total" style="color:${color}">${fmt(total)}</div>
    <div class="punch-sub">Cleared: ${fmt(cleared)}</div>
    <div class="punch-sub" style="color:var(--red)">Balance: ${fmt(balance)}</div>
    <div class="punch-prog"><div class="punch-prog-fill" style="width:${pc.toFixed(0)}%;background:${color}"></div></div>
    <div style="font-size:11px;color:var(--muted);margin-top:5px;font-weight:600">${pc.toFixed(0)}% cleared</div>
  </div>`;
}
function reinstatementPendingRows(data){
  const {rows,tpLookup}=bItemRawRowsForFiltered(data);
  const cnsMap={}, retMap={};

  (rows||[]).forEach(r=>{
    const tp=rowTPNo(r);
    if(!tp)return;
    const tpInfo=tpLookup[tp]||{};

    if(isCnsBPunchSourceRow(r)){
      if(!cnsMap[tp])cnsMap[tp]={tp,total:0,cleared:0,cns:0,eng:0,rows:[]};
      cnsMap[tp].total++;
      if(isBPunchCleared(r,tpInfo))cnsMap[tp].cleared++;
      if(bPunchActionParty(r)==='ENG')cnsMap[tp].eng++; else cnsMap[tp].cns++;
      cnsMap[tp].rows.push(r);
    }

    if(isReturnBPunchRow(r)){
      if(!retMap[tp])retMap[tp]={tp,total:0,cleared:0,rows:[]};
      retMap[tp].total++;
      if(isReturnBPunchCleared(r,tpInfo))retMap[tp].cleared++;
      retMap[tp].rows.push(r);
    }
  });

  const out=[];
  (data||[]).forEach(tpInfo=>{
    const tp=clean(tpInfo.tp);
    if(!tp)return;
    const between=hasStage(tpInfo,'Return for Reinstatement') && !hasStage(tpInfo,'QC Reinstatement Sign');
    if(!between)return;
    const b=cnsMap[tp]||{total:0,cleared:0,cns:0,eng:0,rows:[]};
    const rb=retMap[tp]||{total:0,cleared:0,rows:[]};
    const cnsBalance=Math.max((b.cns||0)-Math.min((b.cleared||0),(b.cns||0)),0);
    out.push({
      tp,
      current:currentStageOfTp(tpInfo)||'',
      total:b.total||0,
      cleared:b.cleared||0,
      balance:Math.max((b.total||0)-(b.cleared||0),0),
      cns:b.cns||0,
      eng:b.eng||0,
      cnsReady:cnsBalance===0,
      retTotal:rb.total||0,
      retCleared:rb.cleared||0,
      retBalance:Math.max((rb.total||0)-(rb.cleared||0),0)
    });
  });

  return out.sort((a,b)=>b.balance-a.balance || b.retBalance-a.retBalance || b.total-a.total || a.tp.localeCompare(b.tp,undefined,{numeric:true}));
}
function renderStagesControl(data){
  const total=data.length||0;
  const readyReinst=stageCount(data,'Return for Reinstatement');
  const bCleared=stageCount(data,'CNS Punch B Cleared');
  const readyQC2=stageCount(data,'L/C Issue To QC-2');
  const qcReturned=stageCount(data,'QC Punch List Return');
  const qcSigned=stageCount(data,'QC Reinstatement Sign');

  const flow=[
    ['Ready for Reinstatement',readyReinst,total,'var(--accent)'],
    ['Test Packs Cleared B Punch',bCleared,readyReinst,'var(--orange)'],
    ['Issued To QC',readyQC2,total,'var(--green)'],
    ['QC Returned With B Punch',qcReturned,total,'var(--accent3)'],
    ['QC Signed',qcSigned,total,'var(--accent2)']
  ];

  h('reinstFlowCards',flow.map(([label,value,base,color])=>{
    const pc=base?value/base*100:0;
    return `<div class="reinst-step">
      <div class="reinst-label">${label}</div>
      <div class="reinst-val" style="color:${color}">${Number(value||0).toLocaleString()}</div>
      <div class="reinst-pct">${pc.toFixed(1)}%</div>
    </div>`;
  }).join(''));

  const totals=bPunchControlTotals(data);
  h('bPunchControlBoxes',
    controlPunchBox('CNS B Punch',totals.cns,'var(--orange)')+
    controlPunchBox('QC Return B Punch',totals.ret,'var(--accent2)')
  );

  const {rows}=bItemRawRowsForFiltered(data);
  const combined=(rows||[]).filter(r=>isBPunchRow(r));

  const partyItems=[
    ['CNS',combined.filter(r=>bPunchActionParty(r)==='CNS').length],
    ['ENG',combined.filter(r=>bPunchActionParty(r)==='ENG').length]
  ];
  h('bPunchTypeChart',miniHbar(partyItems,'linear-gradient(90deg,var(--accent),rgba(34,211,238,.35))'));

  const matItems=groupRowsByCount(combined,bPunchMaterialType);
  h('bPunchMatChart',miniHbar(matItems,'linear-gradient(90deg,var(--accent2),rgba(124,58,237,.35))'));

  const pendingAll=reinstatementPendingRows(data);
  const q=clean(document.getElementById('reinstPendingSearch')&&document.getElementById('reinstPendingSearch').value).toUpperCase();
  const pending=q?pendingAll.filter(r=>String(r.tp+' '+r.current+' CNS '+r.cns+' ENG '+r.eng).toUpperCase().includes(q)):pendingAll;
  h('reinstPendingCount',`${pending.length.toLocaleString()} / ${pendingAll.length.toLocaleString()} Test Packs`);
  h('reinstPendingTable',pending.map(r=>`<tr>
    <td>${r.tp}</td>
    <td>${r.current}</td>
    <td>${Number(r.total||0).toLocaleString()}</td>
    <td><span style="color:var(--accent)">CNS ${Number(r.cns||0).toLocaleString()}</span> / <span style="color:var(--accent2)">ENG ${Number(r.eng||0).toLocaleString()}</span></td>
    <td>${(r.total||0)===0?'<span style="color:var(--muted);font-weight:800">No B Punch Received</span>':(r.cnsReady?'<span style="color:var(--green);font-weight:800">Ready from Construction</span>':'<span style="color:var(--orange);font-weight:800">CNS Open</span>')}</td>
    <td>${Number(r.cleared||0).toLocaleString()}</td>
    <td style="color:${r.balance>0?'var(--red)':'var(--green)'}">${Number(r.balance||0).toLocaleString()}</td>
    <td>${Number(r.retTotal||0).toLocaleString()}</td>
    <td>${Number(r.retCleared||0).toLocaleString()}</td>
    <td style="color:${r.retBalance>0?'var(--red)':'var(--green)'}">${Number(r.retBalance||0).toLocaleString()}</td>
  </tr>`).join('') || `<tr><td colspan="10" class="stage-note">No pending test packs in this range.</td></tr>`);
}

// SYSTEM
function renderSystem(data){
  const sysMap=buildSystemAgg(data);
  const sysArr=Object.values(sysMap).sort((a,b)=>b.n-a.n);
  const prevData=previousFilteredData();
  const prevSysMap=prevData?withDashboardSnapshot(DIFF_BASE,()=>buildSystemAgg(prevData)):{};
  const prevSysArr=Object.values(prevSysMap||{});
  h('sysKpiRow',
    kpi('Systems',sysArr.length,null,'',deltaHtml(sysArr.length,prevSysArr.length))+
    kpi('Total TPs',data.length,null,'green',deltaHtml(data.length,prevData&&prevData.length))+
    kpi('L/C to QC',cnt(data,r=>hasStage(r,'L/C Issue To QC')),null,'purple',deltaHtml(cnt(data,r=>hasStage(r,'L/C Issue To QC')),prevData?cnt(prevData,r=>hasStage(r,'L/C Issue To QC')):null))+
    kpi('RFT',cnt(data,r=>hasStage(r,'RFT')),null,'',deltaHtml(cnt(data,r=>hasStage(r,'RFT')),prevData?cnt(prevData,r=>hasStage(r,'RFT')):null))+
    kpi('Hydro Testing',cnt(data,r=>hasStage(r,'Hydro Testing')),null,'pink',deltaHtml(cnt(data,r=>hasStage(r,'Hydro Testing')),prevData?cnt(prevData,r=>hasStage(r,'Hydro Testing')):null))
  );
  window._sysArr=sysArr;
  window._sysPrevMap=prevSysMap||{};
  renderSysTable();
  const maxTP=Math.max(...sysArr.map(s=>s.n),1);
  document.getElementById('sysBarchart').innerHTML=sysArr.map(s=>{
    const hTP=Math.max(3,s.n/maxTP*110),hLC=Math.max(3,s.lcQC/maxTP*110);
    const short=s.sys.replace(/^599-|^462-|^106-/,'');
    return `<div class="vbar-group">
      <div class="vbar-bars" style="height:126px;align-items:flex-end">
        <div class="vbar-col-wrap"><div class="vbar-val">${s.n}</div><div class="vbar-rect" style="height:${hTP}px;width:14px;background:var(--accent)" data-tip="${s.sys} TPs: ${s.n}"></div></div>
        <div class="vbar-col-wrap"><div class="vbar-val">${s.lcQC}</div><div class="vbar-rect" style="height:${hLC}px;width:14px;background:var(--green)" data-tip="${s.sys} L/C QC: ${s.lcQC}"></div></div>
      </div>
      <div class="vbar-lbl">${short}</div>
    </div>`;
  }).join('');
}
function renderSysTable(){
  const arr=window._sysArr||[];
  const prevMap=window._sysPrevMap||{};
  const q=(document.getElementById('sysSearch').value||'').toLowerCase();
  const f=q?arr.filter(s=>s.sys.toLowerCase().includes(q)):arr;
  document.getElementById('sysTblCount').textContent=f.length+' Systems';
  h('sysTblBody',f.map(s=>{
    const p=prevMap[s.sys]||{};
    const incomplete=s.lcQC!==s.n;
    return `<tr class="${incomplete?'warn-row':''}">
      <td>${s.sys}</td><td>${s.n}${deltaHtml(s.n,p.n,0,false,true)}</td><td class="${incomplete?'warn-cell':''}" title="${incomplete?'Incomplete: L/C to QC is not equal to TP Count':'Complete'}">${s.lcQC}${deltaHtml(s.lcQC,p.lcQC,0,false,true)}</td><td>${s.rft}${deltaHtml(s.rft,p.rft,0,false,true)}</td><td>${s.hydro}${deltaHtml(s.hydro,p.hydro,0,false,true)}</td>
      <td>${s.len.toFixed(1)}${deltaHtml(s.len,p.len,1,false,true)}</td><td>${s.vol.toFixed(2)}${deltaHtml(s.vol,p.vol,2,false,true)}</td>
      <td>${s.sp}${deltaHtml(s.sp,p.sp,0,false,true)}</td><td>${s.su}${deltaHtml(s.su,p.su,0,false,true)}</td><td>${s.va}${deltaHtml(s.va,p.va,0,false,true)}</td>
      <td style="color:${s.pab>0?'var(--red)':'var(--green)'}">${s.pab}${deltaHtml(s.pab,p.pab,0,true,true)}</td>
    </tr>`;
  }).join(''));
}



// COMPARISON
function compDimValue(){const el=document.getElementById('compDim');return el?el.value:'con';}
function compTypeValue(){const el=document.getElementById('compType');return el?el.value:'system';}
function compSelectionValue(id){const el=document.getElementById(id);return el?el.value:'';}
function compFocusValue(){
  const el=document.getElementById('compFocus');
  if(!el)return ['ALL'];
  const vals=[...el.selectedOptions].map(o=>o.value).filter(Boolean);
  if(!vals.length||vals.includes('ALL'))return ['ALL'];
  return vals;
}
function valuesForDimension(dim){
  if(dim==='con')return ['CCC','JGC Direct MP'];
  if(dim==='area')return getAllAreasFromTP();
  if(dim==='areaGroup')return getAllAreaGroupsFromAreas(getAllAreasFromTP());
  if(dim==='sys')return [...new Set(TP.map(r=>r.sys).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(dim==='stage')return STAGE_ORDER.slice();
  return [];
}
function setSelectOptionsPreserve(sel,vals,preferredSecond=false){
  if(!sel)return;
  const old=sel.value;
  sel.innerHTML='';
  vals.forEach(v=>{const o=document.createElement('option');o.value=o.textContent=v;sel.appendChild(o);});
  if(vals.includes(old))sel.value=old;
  else sel.value=preferredSecond?(vals[1]||vals[0]||''):(vals[0]||'');
}
function populateComparisonValues(){
  const dim=compDimValue();
  const vals=valuesForDimension(dim);
  setSelectOptionsPreserve(document.getElementById('compValA'),vals,false);
  setSelectOptionsPreserve(document.getElementById('compValB'),vals,true);
}
function compDataBy(dim,val){
  return TP.filter(r=>{
    if(dim==='con')return r.con===val;
    if(dim==='area')return tpAreas(r).includes(val);
    if(dim==='areaGroup')return tpAreas(r).some(a=>areaGroupOf(a)===val);
    if(dim==='sys')return r.sys===val;
    if(dim==='stage')return val==='CNS L/C Completed'?hasCnsLC(r):hasStage(r,val);
    return true;
  });
}
function comparisonFocusOptions(){
  const type=compTypeValue();
  if(type==='system'){
    const dim=compDimValue(),a=compSelectionValue('compValA'),b=compSelectionValue('compValB');
    const rows=[...compDataBy(dim,a),...compDataBy(dim,b)];
    const systems=[...new Set(rows.map(r=>r.sys).filter(Boolean))].sort((x,y)=>x.localeCompare(y,undefined,{numeric:true}));
    return systems.length?systems:valuesForDimension('sys');
  }
  if(type==='stage')return STAGE_ORDER.slice();
  if(type==='material'||type==='area')return getAllAreasFromTP();
  if(type==='areaGroup')return getAllAreaGroupsFromAreas(getAllAreasFromTP());
  if(type==='punch')return ['Punch A','Punch B','Punch C'];
  return [];
}
function populateComparisonFocus(){
  const sel=document.getElementById('compFocus');
  if(!sel)return;
  const oldVals=compFocusValue();
  const vals=['ALL',...comparisonFocusOptions().filter(Boolean)];
  sel.innerHTML='';
  vals.forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v==='ALL'?'All Items':v;sel.appendChild(o);});
  const keep=oldVals.filter(v=>vals.includes(v));
  applyMultiSelect(sel,keep.length?keep:['ALL']);
  buildComparisonFocusDropdown();
}
function buildComparisonFocusDropdown(){
  const sel=document.getElementById('compFocus'),dd=document.getElementById('ddCompFocus');
  if(!sel||!dd)return;
  const vals=compFocusValue();
  dd.innerHTML=`<button type="button" class="multi-dd-btn"><span class="multi-dd-label"></span><span class="multi-dd-arrow">▾</span></button><div class="multi-dd-menu"><div class="multi-dd-tools"><button type="button" data-act="all">All</button><button type="button" data-act="clear">Clear</button></div><input class="multi-dd-search" type="text" placeholder="Search..." oninput="filterMultiDropdownOptions(this)"><div class="multi-dd-options"></div></div>`;
  const opts=dd.querySelector('.multi-dd-options');
  [...sel.options].forEach(o=>{
    const row=document.createElement('label');
    row.className='multi-dd-option';
    row.dataset.search=String(o.textContent||o.value).toUpperCase();
    row.innerHTML=`<input type="checkbox" value="${escapeAttr(o.value)}" ${vals.includes(o.value)?'checked':''}> <span>${escapeHtml(o.textContent||o.value)}</span>`;
    opts.appendChild(row);
  });
  const update=()=>{
    const picked=compFocusValue();
    const lab=dd.querySelector('.multi-dd-label');
    if(lab){
      if(!picked.length||picked.includes('ALL'))lab.textContent='All Items';
      else lab.textContent=picked.length<=2?picked.join(', '):`${picked.length} selected`;
    }
    dd.querySelectorAll('input[type="checkbox"]').forEach(ch=>{ch.checked=picked.includes(ch.value)||(picked.includes('ALL')&&ch.value==='ALL');});
  };
  const positionMenu=()=>{
    const btn=dd.querySelector('.multi-dd-btn');
    const menu=dd.querySelector('.multi-dd-menu');
    if(!btn||!menu)return;
    const r=btn.getBoundingClientRect();
    const width=Math.max(r.width,280);
    let left=r.left;
    if(left+width>window.innerWidth-12)left=window.innerWidth-width-12;
    let top=r.bottom+6;
    if(top+420>window.innerHeight-12)top=Math.max(12,r.top-420-6);
    menu.style.setProperty('--focus-left',`${Math.max(12,left)}px`);
    menu.style.setProperty('--focus-top',`${top}px`);
    menu.style.setProperty('--focus-width',`${width}px`);
  };
  dd.querySelector('.multi-dd-btn').onclick=(ev)=>{
    ev.stopPropagation();
    document.querySelectorAll('.multi-dd.open').forEach(x=>{if(x!==dd)x.classList.remove('open')});
    dd.classList.toggle('open');
    if(dd.classList.contains('open')){
      positionMenu();
      const s=dd.querySelector('.multi-dd-search');
      if(s)setTimeout(()=>s.focus(),50);
    }
  };
  dd.querySelector('.multi-dd-menu').onclick=(ev)=>ev.stopPropagation();
  dd.querySelectorAll('input[type="checkbox"]').forEach(ch=>{
    ch.onchange=()=>{
      let picked=[...dd.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
      if(ch.value==='ALL'&&ch.checked)picked=['ALL'];
      if(ch.value!=='ALL'&&ch.checked)picked=picked.filter(v=>v!=='ALL');
      if(!picked.length)picked=['ALL'];
      applyMultiSelect(sel,picked);
      update();
      renderComparison();
      positionMenu();
    };
  });
  dd.querySelector('[data-act="all"]').onclick=(ev)=>{ev.stopPropagation();applyMultiSelect(sel,['ALL']);update();renderComparison();positionMenu();};
  dd.querySelector('[data-act="clear"]').onclick=(ev)=>{ev.stopPropagation();applyMultiSelect(sel,['ALL']);update();renderComparison();positionMenu();};
  window.addEventListener('resize',()=>{if(dd.classList.contains('open'))positionMenu();},{passive:true});
  window.addEventListener('scroll',()=>{if(dd.classList.contains('open'))positionMenu();},{passive:true});
  update();
}
function miniKPIsFor(data){
  return `<div class="comp-mini-kpis">
    <div class="comp-mini"><div class="comp-mini-val">${fmtNum(data.length)}</div><div class="comp-mini-lbl">TP Count</div></div>
    <div class="comp-mini"><div class="comp-mini-val">${fmtNum(sum(data,r=>r.len),1)}</div><div class="comp-mini-lbl">Length</div></div>
    <div class="comp-mini"><div class="comp-mini-val">${fmtNum(sum(data,r=>r.vol),2)}</div><div class="comp-mini-lbl">Volume</div></div>
  </div>`;
}
function compHeader(title,dim,data){
  const label={con:'Contractor',area:'Area',areaGroup:'Area Group',sys:'System',stage:'Stage'}[dim]||'Selection';
  return `<div class="comp-head"><div class="comp-title">${title}</div><div class="comp-badge">${label} · ${fmtNum(data.length)} TP</div></div>`+miniKPIsFor(data);
}
function compSystemRows(data){
  const map={};
  data.forEach(r=>{if(!map[r.sys])map[r.sys]={label:r.sys,tp:0,lc:0,rft:0,hydro:0,len:0,vol:0};const s=map[r.sys];s.tp++;s.len+=Number(r.len)||0;s.vol+=Number(r.vol)||0;if(hasStage(r,'L/C Issue To QC'))s.lc++;if(hasStage(r,'RFT'))s.rft++;if(hasStage(r,'Hydro Testing'))s.hydro++;});
  return Object.values(map).sort((a,b)=>b.tp-a.tp||a.label.localeCompare(b.label,undefined,{numeric:true}));
}
function compStageRows(data){
  const total=data.length,totalLen=sum(data,r=>r.len),totalVol=sum(data,r=>r.vol);
  return STAGE_ORDER.map(stage=>{const ds=data.filter(r=>stage==='CNS L/C Completed'?hasCnsLC(r):hasStage(r,stage));return {label:stage,tp:ds.length,pct:total>0?+(ds.length/total*100).toFixed(1):0,len:sum(ds,r=>r.len),lenPct:totalLen>0?+(sum(ds,r=>r.len)/totalLen*100).toFixed(1):0,vol:sum(ds,r=>r.vol),volPct:totalVol>0?+(sum(ds,r=>r.vol)/totalVol*100).toFixed(1):0};}).filter(r=>r.tp>0);
}
function compPunchRows(data){
  const t=punchTotals(data,true);
  return ['A','B','C'].map(c=>({label:'Punch '+c,total:t[c].total,cleared:t[c].cleared,balance:Math.max((t[c].total||0)-(t[c].cleared||0),0)}));
}
function compMaterialRows(data){
  const rows=filteredMaterialRows(data,true);
  const areas=getAllAreasFromTP();
  return areas.map(a=>({label:a,sp:sum(rows.filter(r=>r.area===a),r=>r.sp),su:sum(rows.filter(r=>r.area===a),r=>r.su),va:sum(rows.filter(r=>r.area===a),r=>r.va)})).filter(r=>r.sp+r.su+r.va>0);
}
function punchAForRows(ds){
  const t=punchTotals(ds,true).A||{total:0,cleared:0};
  return {pa:t.total||0,pac:t.cleared||0,pab:Math.max((t.total||0)-(t.cleared||0),0)};
}
function compAreaRows(data){
  const areas=getAllAreasFromTP();
  return areas.map(a=>{
    const ds=data.filter(r=>tpAreas(r).includes(a));
    const p=punchAForRows(ds);
    return {label:a,tp:ds.length,lc:cnt(ds,r=>hasStage(r,'L/C Issue To QC')),len:sum(ds,r=>r.len),vol:sum(ds,r=>r.vol),pa:p.pa,pac:p.pac,pab:p.pab};
  }).filter(r=>r.tp>0);
}
function compAreaGroupRows(data){
  const groups=getAllAreaGroupsFromAreas(getAllAreasFromTP());
  return groups.map(g=>{
    const ds=data.filter(r=>tpAreas(r).some(a=>areaGroupOf(a)===g));
    const p=punchAForRows(ds);
    return {label:g,tp:ds.length,lc:cnt(ds,r=>hasStage(r,'L/C Issue To QC')),len:sum(ds,r=>r.len),vol:sum(ds,r=>r.vol),pa:p.pa,pac:p.pac,pab:p.pab};
  }).filter(r=>r.tp>0);
}
function rowDefaults(type,label){
  if(type==='system')return {label,tp:0,lc:0,rft:0,hydro:0,len:0,vol:0};
  if(type==='stage')return {label,tp:0,pct:0,len:0,lenPct:0,vol:0,volPct:0};
  if(type==='punch')return {label,total:0,cleared:0,balance:0};
  if(type==='area'||type==='areaGroup')return {label,tp:0,lc:0,len:0,vol:0,pa:0,pac:0,pab:0};
  return {label,sp:0,su:0,va:0};
}
function sortLabels(labels){return labels.sort((a,b)=>primaryAreaSort(String(a),String(b)));}
function applyFocusToRows(type,rows,focus){
  const vals=toMulti(focus);
  if(multiIsAll(vals))return rows;
  return rows.filter(r=>vals.includes(r.label));
}
function alignRows(type,aRows,bRows,focus){
  let labels;
  const vals=toMulti(focus);
  if(!multiIsAll(vals))labels=vals;
  else labels=sortLabels([...new Set([...aRows.map(r=>r.label),...bRows.map(r=>r.label)])]);
  const am=new Map(aRows.map(r=>[r.label,r])), bm=new Map(bRows.map(r=>[r.label,r]));
  return [labels.map(l=>Object.assign(rowDefaults(type,l),am.get(l)||{})), labels.map(l=>Object.assign(rowDefaults(type,l),bm.get(l)||{}))];
}
function tableFromRows(type,rows){
  if(type==='system')return `<div class="comp-table-wrap"><table class="comp-table"><thead><tr><th>System</th><th>TP</th><th>L/C QC</th><th>RFT</th><th>Hydro</th><th>Length</th><th>Volume</th></tr></thead><tbody>`+rows.map(r=>`<tr><td>${r.label}</td><td>${r.tp}</td><td>${r.lc}</td><td>${r.rft}</td><td>${r.hydro}</td><td>${Number(r.len||0).toFixed(1)}</td><td>${Number(r.vol||0).toFixed(2)}</td></tr>`).join('')+`</tbody></table></div>`;
  if(type==='stage')return `<div class="comp-table-wrap"><table class="comp-table"><thead><tr><th>Stage</th><th>TP Count</th><th>%</th><th>Length</th><th>Length %</th><th>Volume</th><th>Volume %</th></tr></thead><tbody>`+rows.map(r=>`<tr><td>${r.label}</td><td>${r.tp}</td><td class="${r.pct<100?'stage-pct-warn':''}">${Number(r.pct||0).toFixed(1)}%</td><td>${Number(r.len||0).toFixed(1)}</td><td class="${r.lenPct<100?'stage-pct-warn':''}">${Number(r.lenPct||0).toFixed(1)}%</td><td>${Number(r.vol||0).toFixed(2)}</td><td class="${r.volPct<100?'stage-pct-warn':''}">${Number(r.volPct||0).toFixed(1)}%</td></tr>`).join('')+`</tbody></table></div>`;
  if(type==='punch')return `<div class="comp-table-wrap"><table class="comp-table"><thead><tr><th>Punch</th><th>Total</th><th>Cleared</th><th>Balance</th></tr></thead><tbody>`+rows.map(r=>`<tr><td>${r.label}</td><td>${fmtNum(r.total)}</td><td>${fmtNum(r.cleared)}</td><td style="color:${r.balance>0?'var(--red)':'var(--green)'}">${fmtNum(r.balance)}</td></tr>`).join('')+`</tbody></table></div>`;
  if(type==='area'||type==='areaGroup')return `<div class="comp-table-wrap"><table class="comp-table"><thead><tr><th>${type==='areaGroup'?'Area Group':'Area'}</th><th>TP</th><th>L/C QC</th><th>Length</th><th>Volume</th><th>A Total</th><th>A Cleared</th><th>A Balance</th></tr></thead><tbody>`+rows.map(r=>`<tr><td>${r.label}</td><td>${r.tp}</td><td>${r.lc}</td><td>${Number(r.len||0).toFixed(1)}</td><td>${Number(r.vol||0).toFixed(2)}</td><td>${fmtNum(r.pa)}</td><td>${fmtNum(r.pac)}</td><td style="color:${r.pab>0?'var(--red)':'var(--green)'}">${fmtNum(r.pab)}</td></tr>`).join('')+`</tbody></table></div>`;
  return `<div class="comp-table-wrap"><table class="comp-table"><thead><tr><th>Area</th><th>Spools</th><th>Supports</th><th>Valves</th></tr></thead><tbody>`+rows.map(r=>`<tr><td>${r.label}</td><td>${r.sp}</td><td>${r.su}</td><td>${r.va}</td></tr>`).join('')+`</tbody></table></div>`;
}
function rowsForComp(type,data){if(type==='system')return compSystemRows(data);if(type==='stage')return compStageRows(data);if(type==='punch')return compPunchRows(data);if(type==='area')return compAreaRows(data);if(type==='areaGroup')return compAreaGroupRows(data);return compMaterialRows(data);}
function diffTable(type,aRows,bRows){
  const keys=new Set([...aRows.map(r=>r.label),...bRows.map(r=>r.label)]),am=new Map(aRows.map(r=>[r.label,r])),bm=new Map(bRows.map(r=>[r.label,r]));
  let cols=[];
  if(type==='system')cols=['tp','lc','rft','hydro','len','vol'];
  else if(type==='stage')cols=['tp','len','vol'];
  else if(type==='punch')cols=['total','cleared','balance'];
  else if(type==='area'||type==='areaGroup')cols=['tp','lc','len','vol','pa','pac','pab'];
  else cols=['sp','su','va'];
  const labels={tp:'TP',lc:'L/C QC',rft:'RFT',hydro:'Hydro',len:'Length',vol:'Volume',total:'Total',cleared:'Cleared',balance:'Balance',sp:'Spools',su:'Supports',va:'Valves',pa:'A Total',pac:'A Cleared',pab:'A Balance'};
  return `<div class="comp-table-wrap"><table class="comp-table"><thead><tr><th>Item</th>${cols.map(c=>`<th>${labels[c]} Δ</th>`).join('')}</tr></thead><tbody>`+sortLabels([...keys]).map(k=>{const a=am.get(k)||{},b=bm.get(k)||{};return `<tr><td>${k}</td>`+cols.map(col=>{const d=(Number(a[col])||0)-(Number(b[col])||0);return `<td class="${d<0?'comp-diff-neg':d>0?'comp-diff-pos':''}">${Number.isInteger(d)?d:d.toFixed(2)}</td>`;}).join('')+`</tr>`;}).join('')+`</tbody></table></div>`;
}
function renderComparison(){
  populateComparisonValues();
  populateComparisonFocus();
  const dim=compDimValue(),type=compTypeValue(),focus=compFocusValue(),a=compSelectionValue('compValA'),b=compSelectionValue('compValB');
  const dA=compDataBy(dim,a),dB=compDataBy(dim,b);
  let rA=rowsForComp(type,dA),rB=rowsForComp(type,dB);
  rA=applyFocusToRows(type,rA,focus); rB=applyFocusToRows(type,rB,focus);
  [rA,rB]=alignRows(type,rA,rB,focus);
  h('compA',compHeader(a||'-',dim,dA)+tableFromRows(type,rA));
  h('compB',compHeader(b||'-',dim,dB)+tableFromRows(type,rB));
  h('compDiff',diffTable(type,rA,rB));
}

// PROGRESS
const MONTHLY_TP_STAGES=['CNS L/C Completed','L/C Issue To QC'];
const WEEKLY_TP_STAGES=['CNS L/C Completed','L/C Issue To QC'];
const PROG_COLORS={
  'CNS L/C Completed':'var(--accent)',
  'CNS Punch Issue':'var(--orange)',
  'CNS A Punch Clear':'var(--accent2)',
  'L/C Issue To QC':'var(--green)',
  'A':'var(--accent)','B':'var(--orange)','C':'var(--green)'
};
function uniqueTPRows(rows){
  const m=new Map();
  (rows||[]).forEach(r=>{if(r&&r.tp&&!m.has(r.tp))m.set(r.tp,r);});
  return [...m.values()];
}
function isoDateObj(iso){
  if(!iso)return null;
  const p=String(iso).slice(0,10).split('-').map(Number);
  if(p.length<3||p.some(n=>!Number.isFinite(n)))return null;
  return new Date(p[0],p[1]-1,p[2]);
}
function dateISO(d){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;}
function monthKeyFromISO(iso,clampNov25=false){
  const d=isoDateObj(iso); if(!d)return null;
  let y=d.getFullYear(),m=d.getMonth()+1;
  if(clampNov25&&(y<2025||(y===2025&&m<11))){y=2025;m=11;}
  return `${y}-${pad2(m)}`;
}
function nextThursdayFromISO(iso){
  const d=isoDateObj(iso); if(!d)return null;
  const dow=(d.getDay()+6)%7; // Monday=0 ... Thursday=3
  const add=(3-dow+7)%7;
  d.setDate(d.getDate()+add);
  return dateISO(d);
}
function formatMonth(key){
  const d=isoDateObj(key+'-01');
  if(!d)return key;
  return d.toLocaleDateString('en-US',{month:'short',year:'2-digit'}).replace(' ',' ');
}
function formatFullDate(key){
  const d=isoDateObj(key);
  if(!d)return key;
  return d.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
}
function fmtSmall(v){return v>=1000?(v/1000).toFixed(v>=10000?0:1)+'K':String(v);}
function buildTPMonthly(rows){
  const out={};
  uniqueTPRows(rows).forEach(r=>{
    MONTHLY_TP_STAGES.forEach(stage=>{
      const d=r.st&&r.st[stage];
      const key=monthKeyFromISO(d,true);
      if(key)addAgg(out,key,stage,1);
    });
  });
  return out;
}
function buildTPWeekly(rows){
  const out={};
  uniqueTPRows(rows).forEach(r=>{
    if(!(r.st&&r.st['CNS L/C Completed']))return;
    WEEKLY_TP_STAGES.forEach(stage=>{
      const key=nextThursdayFromISO(r.st&&r.st[stage]);
      if(key)addAgg(out,key,stage,1);
    });
  });
  return out;
}
function buildPunchAgg(rows,period){
  const out={};
  filteredPunchEvents(rows).forEach(e=>{
    const key=period==='month'?monthKeyFromISO(e.d,false):nextThursdayFromISO(e.d);
    if(key)addAgg(out,key,e.cat,(Number(e.n)||1));
  });
  return out;
}
function currentMonthKey(){
  const d=new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}
function currentWeekLimit(){
  return nextThursdayFromISO(dateISO(new Date()));
}
function renderGroupedBars(elId,keys,series,map,labelFn,barWidth){
  const vals=[];
  keys.forEach(k=>series.forEach(s=>vals.push((map[k]&&map[k][s])||0)));
  const maxVal=Math.max(...vals,1);
  h(elId,keys.map(k=>{
    const bars=series.map(s=>{
      const v=(map[k]&&map[k][s])||0;
      const ht=v>0?Math.max(4,v/maxVal*118):3;
      const label=fmtSmall(v);
      const title=`${labelFn(k)} ${s}: ${v.toLocaleString()}`;
      return `<div class="vbar-col-wrap">${v>0?`<div class="vbar-val">${label}</div>`:''}<div class="vbar-rect" style="height:${ht}px;width:${barWidth||12}px;background:${PROG_COLORS[s]||'var(--accent)'}" data-tip="${title}"></div></div>`;
    }).join('');
    return `<div class="vbar-group">
      <div class="vbar-bars" style="height:142px;align-items:flex-end">
        ${bars}
      </div>
      <div class="vbar-lbl ${String(labelFn(k)).length>9?'full-date':''}">${labelFn(k)}</div>
    </div>`;
  }).join(''));
}
function renderProgress(data){
  const base=uniqueTPRows(data||TP);
  const tpMon=buildTPMonthly(base);
  const tpWek=buildTPWeekly(base);
  const punchMon=buildPunchAgg(base,'month');
  const punchWek=buildPunchAgg(base,'week');

  const monKeys=Object.keys(tpMon).sort();
  renderGroupedBars('monthlyTPChart',monKeys,MONTHLY_TP_STAGES,tpMon,formatMonth,12);

  const wkKeys=Object.keys(tpWek).filter(k=>k>='2025-12-04').sort();
  renderGroupedBars('weeklyTPChart',wkKeys,WEEKLY_TP_STAGES,tpWek,formatFullDate,12);

  const curMonth=currentMonthKey();
  const pmKeys=Object.keys(punchMon).filter(k=>k>='2025-12'&&k<=curMonth).sort();
  renderGroupedBars('punchMonthChart',pmKeys,['A','B','C'],punchMon,formatMonth,11);

  const curWeek=currentWeekLimit();
  const pwKeys=Object.keys(punchWek).filter(k=>k>='2025-12-11'&&(!curWeek||k<=curWeek)).sort();
  renderGroupedBars('punchWeekChart',pwKeys,['A','B','C'],punchWek,formatFullDate,9);
}



const REMOTE_EXCEL_URL='https://raw.githubusercontent.com/shata733-source/testpack-data/refs/heads/main/original_scope_data.xlsx.xlsx';

async function updateFromRemoteExcel(options){
  options=options||{};
  const silent=!!options.silent;
  const tStart=(typeof performance!=='undefined')?performance.now():Date.now();
  const btn=document.querySelector('.upload-btn');
  const oldLabel=btn?btn.innerHTML:'';
  const setStatus=(txt)=>{if(!silent&&btn)btn.innerHTML=txt;};
  if(!silent&&btn){btn.innerHTML='⏳ Updating...';btn.disabled=true;}
  const finish=()=>{if(!silent&&btn){btn.innerHTML=oldLabel;btn.disabled=false;}};
  if(typeof XLSX==='undefined'){
    const msg='Excel parser is not loaded. Please open the dashboard with internet access so the XLSX library can load.';
    if(silent)console.warn(msg);else alert(msg);
    finish();
    return false;
  }
  try{
    const beforeUpdateSnapshot=currentDashboardSnapshot('before-update');
    setStatus('⬇ Downloading...');
    // Always bypass the browser/local cache and overwrite the saved copy with the newest GitHub file.
    const url=REMOTE_EXCEL_URL+(REMOTE_EXCEL_URL.includes('?')?'&':'?')+'v='+Date.now()+'&rnd='+Math.random().toString(36).slice(2);
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status+' while downloading the Excel file.');
    const buffer=await res.arrayBuffer();
    setStatus('📖 Reading Excel...');
    const wb=XLSX.read(buffer,{type:'array',cellDates:false});
    setStatus('⚙ Parsing data...');
    const parsed=parseDashboardWorkbook(wb);
    if(!parsed.TP.length)throw new Error('No Test Packs found in TP Summary sheet.');
    TP=parsed.TP;
    MAT=parsed.MAT;
    MAT_ROWS=parsed.MAT_ROWS||[];
    PUNCH_STATS=parsed.PUNCH_STATS||[];
    PUNCH_MON=parsed.PUNCH_MON;
    PUNCH_WEK=parsed.PUNCH_WEK;
    PUNCH_EVENTS=parsed.PUNCH_EVENTS||[];
    TP_MON=parsed.TP_MON;
    TP_WEK=parsed.TP_WEK;
    TP_SUMMARY_ROWS=parsed.TP_SUMMARY_ROWS||[];
    TP_SUMMARY_HEADERS=parsed.TP_SUMMARY_HEADERS||[];
    TEST_PACK_HEADERS=LIGHT_TEST_PACK_HEADERS.slice();
    TEST_PACK_ROWS=compactTestPackRows(parsed.TEST_PACK_ROWS||[]);
    B_ITEM_ROWS=parsed.B_ITEM_ROWS||[];
    B_ITEM_HEADERS=parsed.B_ITEM_HEADERS||B_ITEM_SHEET_HEADERS.slice();
    DATA_VERSION++; invalidateDashboardCaches();
    F.sys=['ALL'];
    F.stage=['ALL'];
    if(typeof rebuildSidebarFilters==='function')rebuildSidebarFilters();
    const d=new Date();
    document.querySelector('.hdr-date').textContent=`${pad2(d.getDate())} / ${pad2(d.getMonth()+1)} / ${d.getFullYear()}`;
    if(!options.auto){
      await storeUpdateDiffBaseline(beforeUpdateSnapshot,'remote');
    }
    refresh();
    setStatus('💾 Saving...');
    const saved=await saveDashboardSnapshot('remote');
    if(!silent){
      const seconds=(((typeof performance!=='undefined')?performance.now():Date.now())-tStart)/1000;
      alert(`Data updated successfully from online Excel: ${TP.length} test packs loaded. Punch A: ${sum(PUNCH_STATS||[],x=>x.a).toLocaleString()}\n\nUpdate time: ${seconds.toFixed(1)} seconds.${saved?'\nSaved on this browser for next time.':'\nUpdated, but the browser could not save this copy locally. Use Download Updated HTML as a backup.'}`);
    }
    return true;
  }catch(err){
    console.error(err);
    const msg='Could not update the dashboard from the online Excel file.\n\nPlease make sure the GitHub file is public and contains Test Packs, TP Summary, Scope Arrangement, and Material sheets.\n\nDetails: '+(err&&err.message?err.message:err);
    if(silent)console.warn(msg);else alert(msg);
    return false;
  }finally{
    finish();
  }
}

function loadNewFile(input){
  const file=input.files&&input.files[0];
  if(!file)return;
  const btn=document.querySelector('.upload-btn');
  const oldLabel=btn.innerHTML;
  btn.innerHTML='⏳ Updating...';
  btn.disabled=true;
  const finish=()=>{btn.innerHTML=oldLabel;btn.disabled=false;input.value='';};
  if(typeof XLSX==='undefined'){
    alert('Excel parser is not loaded. Please open the dashboard with internet access so the XLSX library can load.');
    finish();
    return;
  }
  const reader=new FileReader();
  reader.onload=async e=>{
    try{
      btn.innerHTML='📖 Reading Excel...';
      const wb=XLSX.read(e.target.result,{type:'array',cellDates:false});
      btn.innerHTML='⚙ Parsing data...';
      const parsed=parseDashboardWorkbook(wb);
      if(!parsed.TP.length)throw new Error('No Test Packs found in TP Summary sheet.');
      const beforeUpdateSnapshot=currentDashboardSnapshot('before-update');
      TP=parsed.TP;
      MAT=parsed.MAT;
      MAT_ROWS=parsed.MAT_ROWS||[];
      PUNCH_STATS=parsed.PUNCH_STATS||[];
      PUNCH_MON=parsed.PUNCH_MON;
      PUNCH_WEK=parsed.PUNCH_WEK;
      PUNCH_EVENTS=parsed.PUNCH_EVENTS||[];
      TP_MON=parsed.TP_MON;
      TP_WEK=parsed.TP_WEK;
      TP_SUMMARY_ROWS=parsed.TP_SUMMARY_ROWS||[];
      TP_SUMMARY_HEADERS=parsed.TP_SUMMARY_HEADERS||[];
      TEST_PACK_HEADERS=LIGHT_TEST_PACK_HEADERS.slice();
      TEST_PACK_ROWS=compactTestPackRows(parsed.TEST_PACK_ROWS||[]);
      B_ITEM_ROWS=parsed.B_ITEM_ROWS||[];
      B_ITEM_HEADERS=parsed.B_ITEM_HEADERS||B_ITEM_SHEET_HEADERS.slice();
      DATA_VERSION++; invalidateDashboardCaches();
      F.sys=['ALL'];
      F.stage=['ALL'];
      populateSystems();
      if(typeof populateStageFilter==='function')populateStageFilter();
      const d=new Date();
      document.querySelector('.hdr-date').textContent=`${pad2(d.getDate())} / ${pad2(d.getMonth()+1)} / ${d.getFullYear()}`;
      await storeUpdateDiffBaseline(beforeUpdateSnapshot,'local');
      refresh();
      btn.innerHTML='💾 Saving...';
      const saved=await saveDashboardSnapshot('local');
      alert(`Data updated successfully: ${TP.length} test packs loaded. Punch A: ${sum(PUNCH_STATS||[],x=>x.a).toLocaleString()}${saved?'\n\nSaved on this browser for next time.':'\n\nUpdated, but the browser could not save this copy locally. Use Download Updated HTML as a backup.'}`);
    }catch(err){
      console.error(err);
      alert('Could not update the dashboard from this file. Please make sure it contains Test Packs, TP Summary, Scope Arrangement, and Material sheets.\n\nDetails: '+err.message);
    }finally{finish();}
  };
  reader.onerror=()=>{alert('Could not read the selected file.');finish();};
  reader.readAsArrayBuffer(file);
}

function parseDashboardWorkbook(wb){
  const summaryRows=sheetRows(wb,['TP Summary'],1);
  const summaryHeaders=sheetHeaders(wb,['TP Summary'],1);
  const scopeRows=sheetRows(wb,['Scope Arrangment','Scope Arrangement'],2);
  const materialRows=sheetRows(wb,['Material'],3);
  const bItemRows=sheetRows(wb,['B Item'],4);
  const bItemHeaders=sheetHeaders(wb,['B Item'],4);

  // Fast mode: Test Packs sheet is the heaviest sheet.
  // Read only the columns used by the dashboard, and store rows as compact arrays.
  const compactTP=sheetRowsCompact(wb,['Test Packs'],0,typeof LIGHT_TEST_PACK_HEADERS!=='undefined'?LIGHT_TEST_PACK_HEADERS:[]);
  const testPackRows=compactTP.rows||[];
  const testPackHeaders=compactTP.headers||[];

  const conMap={};
  scopeRows.forEach(r=>{const tp=clean(r['TestPackNo']);if(tp)conMap[tp]=clean(r['CCC / JGC Direct MP'])||clean(r['Contractor']);});

  const mat={},matRows=[];
  materialRows.forEach(r=>{
    const tp=clean(r['TP NUMBER']||r['TestPackNo']);
    if(!tp)return;
    if(!mat[tp])mat[tp]={sp:0,su:0,va:0,vsize:{}};
    const area=normalizeMaterialArea(r['Area']);
    const sp=rowFlag(r['SpoolCount_Row']);
    const su=rowFlag(r['SupportCount_Row']);
    const va=rowFlag(r['ValveCount_Row']);
    const size=clean(r['SizeDesc'])||clean(r['Size'])||'N/A';
    if(sp||su||va){
      matRows.push({tp,area,sp,su,va,size});
      mat[tp].sp+=sp; mat[tp].su+=su; mat[tp].va+=va;
      if(va)mat[tp].vsize[size]=(mat[tp].vsize[size]||0)+va;
    }
  });

  const seen=new Set();
  const tpData=[];
  summaryRows.forEach(r=>{
    const tp=clean(r['TestPackNo']);
    if(!tp||seen.has(tp))return;
    seen.add(tp);
    const st={};
    STAGE_ORDER.forEach(s=>{const d=excelDateToISO(r[s]);if(d)st[s]=d;});
    const m=mat[tp]||{sp:0,su:0,va:0};
    if(!mat[tp])mat[tp]={sp:0,su:0,va:0,vsize:{}};
    const sp=m.sp||0,su=m.su||0,va=m.va||0;
    const scopeCon=clean(conMap[tp]).toUpperCase();
    const con=(scopeCon==='CCC')?'CCC':'JGC Direct MP';
    const flags=rmcFlags(con,clean(r['Note']),clean(r['SystemNo']),st['L/C Issue To QC'],clean(r['Area']));
    tpData.push({
      tp,sys:clean(r['SystemNo']),area:(normalizeAreas(r['Area'])[0]||clean(r['Area'])||'N/A'),areaRaw:clean(r['Area']),areas:normalizeAreas(r['Area']),con,
      pri:num(r['Priority']),len:num(r['Length']),vol:num(r['Volume']),
      pa:num(r['Total Punch A']),pac:num(r['Total A Punch Cleared']),pab:num(r['Total A Punch Balance']),
      pb:num(r['Total Punch B']),pbc:num(r['Total B Punch Cleared']),pbb:num(r['Total B Punch Balance']),
      pcx:num(r['Total Punch C']),pcc:num(r['Total C Punch Cleared']),pcb:num(r['Total C Punch Balance']),
      sp,su,va,rmc_ccc:flags.ccc,rmc_jgc:flags.jgc,st
    });
  });

  const tpMon={},tpWek={};
  tpData.forEach(r=>{
    MONTHLY_TP_STAGES.forEach(stage=>{
      const d=r.st&&r.st[stage];
      const m=monthKeyFromISO(d,true);
      if(m)addAgg(tpMon,m,stage,1);
    });
    if(r.st&&r.st['CNS L/C Completed']){
      WEEKLY_TP_STAGES.forEach(stage=>{
        const w=nextThursdayFromISO(r.st&&r.st[stage]);
        if(w)addAgg(tpWek,w,stage,1);
      });
    }
  });

  const punchData=buildPunchDataFromRows(testPackRows,tpData,bItemRows);
  const punchByTp={};
  (punchData.stats||[]).forEach(x=>{punchByTp[clean(x.tp)]=x;});
  tpData.forEach(r=>{
    const p=punchByTp[clean(r.tp)]||{};
    r.pa=Number(p.a)||0; r.pac=Number(p.ac)||0; r.pab=(Number(p.a)||0)-(Number(p.ac)||0);
    r.pb=Number(p.b)||0; r.pbc=Number(p.bc)||0; r.pbb=(Number(p.b)||0)-(Number(p.bc)||0);
    r.pcx=Number(p.c)||0; r.pcc=Number(p.cc)||0; r.pcb=(Number(p.c)||0)-(Number(p.cc)||0);
  });
  const punchMon={},punchWek={};
  punchData.events.forEach(e=>{
    const pm=monthKeyFromISO(e.d,false),pw=nextThursdayFromISO(e.d);
    if(pm)addAgg(punchMon,pm,e.cat,Number(e.n)||1);
    if(pw)addAgg(punchWek,pw,e.cat,Number(e.n)||1);
  });

  return {TP:tpData,MAT:mat,MAT_ROWS:matRows,PUNCH_STATS:punchData.stats,PUNCH_MON:punchMon,PUNCH_WEK:punchWek,PUNCH_EVENTS:punchData.events,TP_MON:tpMon,TP_WEK:tpWek,TP_SUMMARY_ROWS:summaryRows,TP_SUMMARY_HEADERS:summaryHeaders,TEST_PACK_ROWS:testPackRows,TEST_PACK_HEADERS:testPackHeaders,B_ITEM_ROWS:bItemRows,B_ITEM_HEADERS:bItemHeaders};
}
function rmcFlags(con,note,sys,lcDate,areaRaw){
  con=clean(con); note=clean(note); sys=clean(sys);
  if(!lcDate)return {ccc:false,jgc:false};

  // Old CCC RMC logic must be applied only to the original 6 CCC areas.
  // Any JGC Test Pack outside these areas with "Stage 13 in FMS only" is JGC directly.
  const cccRmcAreas=['A211','A212','A222','A231','A232','A233'];
  const areas=extractAreas(areaRaw||'');
  const inOldCccAreas=areas.some(a=>cccRmcAreas.includes(a));

  if(con==='JGC Direct MP' && note==='Stage 13 in FMS only' && !inOldCccAreas){
    return {ccc:false,jgc:true};
  }

  const special=['599-BD-02','599-CDH-01','599-BD-01'].includes(sys);
  const threshold=special?'2026-06-01':'2026-04-01';

  const jgc=(con==='JGC Direct MP' && note==='Stage 13 in FMS only' && inOldCccAreas && lcDate>=threshold);

  let ccc=false;
  if(inOldCccAreas){
    if(con==='JGC Direct MP'&&note==='Stage 13 in FMS only'&&lcDate<threshold)ccc=true;
    else if(con==='JGC Direct MP'&&note==='Stage 13 in CCC only')ccc=true;
    else if(con==='CCC'&&note==='Stage 13 in CCC only')ccc=true;
    else if(con==='CCC'&&note==='Stage 13 in FMS only')ccc=true;
    else if(con==='CCC'&&note==='')ccc=true;
    else if(con==='JGC Direct MP'&&note==='')ccc=true;
  }

  return {ccc,jgc};
}
function normHeaderKey(v){
  return clean(v)
    .toLowerCase()
    .replace(/_x000d_/g,'')
    .replace(/_x000a_/g,'')
    .replace(/#\(lf\)|#\(cr\)/g,'')
    .replace(/\bxl?f\b/g,'')
    .replace(/[^a-z0-9]+/g,'');
}
function rowValue(row,candidates){
  if(!row)return null;
  if(Array.isArray(row)){
    const map=getTestPackHeaderMap();
    for(const c of candidates){
      const idx=map[normHeaderKey(c)];
      if(idx!==undefined)return row[idx];
    }
    return null;
  }
  let map=row.__rowValueMap;
  if(!map){
    map={};
    Object.keys(row||{}).forEach(k=>{map[normHeaderKey(k)]=k;});
    try{Object.defineProperty(row,'__rowValueMap',{value:map,enumerable:false});}catch(e){}
  }
  for(const c of candidates){
    const k=map[normHeaderKey(c)];
    if(k!==undefined)return row[k];
  }
  return null;
}
function pickAreaCode(v){
  const s=clean(v).toUpperCase();
  const m=s.match(/A(?:211|212|222|231|232|233)/);
  return m?m[0]:'';
}
function isNonEmptyCell(v){return clean(v) !== '';}
function hasExcelDate(v){return !!excelDateToISO(v);}
function punchCategoryFromRow(row){
  const rawCat=clean(rowValue(row,[
    'Punch Category (A/B/C)',
    'Punch Category\r\n(A/B/C)',
    'Punch Category\n(A/B/C)',
    'Punch Category_x000d_\n(A/B/C)',
    'Punch Category_x000d_(A/B/C)',
    'Punch Category#(lf)(A/B/C)',
    'Punch Category',
    'Category',
    'Punch Cat',
    'Punch Category A/B/C'
  ])).toUpperCase();
  if(rawCat==='A'||rawCat==='B'||rawCat==='C')return rawCat;
  const m=rawCat.match(/(^|[^A-Z])([ABC])([^A-Z]|$)/);
  return m?m[2]:'';
}
function normPunchText(v){return clean(v).toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}

function stageTextOfRow(row){return normPunchText(rowStage(row));}
function isConstructionStageQCPreTestPack(row){
  // For B Punch we must depend on the Construction Stage column only, not comments.
  return stageTextOfRow(row).includes(normPunchText('QC PreTestPack Punch List'));
}
function isConstructionStageReturnForReinstatement(row){
  return stageTextOfRow(row).includes(normPunchText('Return for Reinstatement'));
}
function isConstructionStageReturnWithBackPunch(row){
  return stageTextOfRow(row).includes(normPunchText('Return with Back Punch'));
}
function isConstructionStageSAPIDPunchList(row){
  return stageTextOfRow(row).includes(normPunchText('SAPID Punch List'));
}
function isConstructionStageQCPunchListReturn(row){
  return stageTextOfRow(row).includes(normPunchText('QC Punch List Return'));
}
function isCnsBPunchSourceRow(row){
  // CNS B Punch source rows from the dedicated B Item sheet:
  // Punch Category = B AND Construction Stage is one of:
  // QC PreTestPack Punch List, Return for Reinstatement, Return with Back Punch, SAPID Punch List.
  return punchCategoryFromRow(row)==='B' && (
    isConstructionStageQCPreTestPack(row) ||
    isConstructionStageReturnForReinstatement(row) ||
    isConstructionStageReturnWithBackPunch(row) ||
    isConstructionStageSAPIDPunchList(row)
  );
}
function isReturnBPunchRow(row){
  // QC Return B Punch source rows from the dedicated B Item sheet:
  // Punch Category = B AND Construction Stage = QC Punch List Return.
  return punchCategoryFromRow(row)==='B' && isConstructionStageQCPunchListReturn(row);
}
function isBPunchRow(row){
  // Total B Item includes both CNS B source stages and QC returned B Punch.
  return isCnsBPunchSourceRow(row) || isReturnBPunchRow(row);
}
function isBPunchCleared(row,tpInfo){
  if(isReturnBPunchRow(row))return isReturnBPunchCleared(row,tpInfo);
  return punchRowHasClearedDate(row) || !!(tpInfo && (hasStage(tpInfo,'CNS Punch B Cleared') || hasStage(tpInfo,'QC Punch List Return')));
}
function isReturnBPunchCleared(row,tpInfo){
  return punchRowHasClearedDate(row) || !!(tpInfo && hasStage(tpInfo,'QC Reinstatement Sign'));
}

function buildPunchDataFromRows(rows,tpRows,bRows){
  // Punch logic:
  // - Source: Test Packs sheet for A/C, dedicated B Item sheet for B.
  // - Group by TP NUMBER only
  // - Punch A/C totals = count rows by Punch Category A/C.
  // - Punch B total = count B Item rows where Construction Stage is one of the agreed B stages.
  // - A Cleared = Total A when the TP is closed (has L/C Issue To QC), otherwise count A rows with Punch Cleared
  // - B Cleared follows stage-based rules: CNS stages close by Punch Cleared/CNS Punch B Cleared/QC Punch List Return; QC Punch List Return closes by Punch Cleared/QC Reinstatement Sign. C Cleared = count rows with Punch Cleared
  const statsMap={},eventMap={};
  const tpLookup={};
  (tpRows||TP||[]).forEach(r=>{
    const tp=clean(r.tp);
    if(tp)tpLookup[tp]=r;
  });
  const tpSet=new Set(Object.keys(tpLookup));

  function addEffectivePunch(tp,r,tpInfo,eCat){
    const k=eCat.toLowerCase();
    if(!statsMap[tp])statsMap[tp]={tp,area:tpAreas(tpInfo)[0]||tpInfo.area||'',a:0,ac:0,b:0,bc:0,c:0,cc:0};
    statsMap[tp][k]=(statsMap[tp][k]||0)+1;
    const clearedRaw=rowValue(r,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date']);
    const d=excelDateToISO(clearedRaw);
    let isCleared=false;
    if(eCat==='B')isCleared=isBPunchCleared(r,tpInfo);
    else isCleared=isNonEmptyCell(clearedRaw) || !!d;
    if(isCleared){
      statsMap[tp][k+'c']=(statsMap[tp][k+'c']||0)+1;
      if(d){
        const ekey=tp+'|'+d+'|'+eCat;
        eventMap[ekey]=(eventMap[ekey]||0)+1;
      }
    }
  }

  // A and C still come from Test Packs comments.
  (rows||[]).forEach(r=>{
    const tp=clean(rowValue(r,['TP NUMBER','TP No','TP Number','TestPackNo','Test Pack No','TestPack No']));
    if(!tp || (tpSet.size && !tpSet.has(tp)))return;
    const cat=punchCategoryFromRow(r);
    if(cat!=='A' && cat!=='C')return;
    const tpInfo=tpLookup[tp]||{};
    addEffectivePunch(tp,r,tpInfo,cat);
  });

  // B Item now comes from the dedicated B Item sheet.
  const bSourceRows=(Array.isArray(bRows)&&bRows.length)?bRows:(rows||[]);
  (bSourceRows||[]).forEach(r=>{
    const tp=clean(rowValue(r,['TP NUMBER','TP No','TP Number','TestPackNo','Test Pack No','TestPack No']));
    if(!tp || (tpSet.size && !tpSet.has(tp)))return;
    if(!isBPunchRow(r))return;
    const tpInfo=tpLookup[tp]||{};
    addEffectivePunch(tp,r,tpInfo,'B');
  });

  Object.values(statsMap).forEach(st=>{
    const tpInfo=tpLookup[st.tp]||{};
    const isClosed=hasStage(tpInfo,'L/C Issue To QC');
    if(isClosed)st.ac=st.a||0;
    st.ab=(st.a||0)-(st.ac||0);
    st.bb=(st.b||0)-(st.bc||0);
    st.cb=(st.c||0)-(st.cc||0);
  });

  const events=Object.entries(eventMap).map(([k,n])=>{
    const p=k.split('|');
    const tp=p[0],tpInfo=tpLookup[tp]||{};
    return {tp,area:tpAreas(tpInfo)[0]||tpInfo.area||'',d:p[1],cat:p[2],n};
  });
  return {stats:Object.values(statsMap),events};
}


function findWorkbookSheetName(wb,names,index){
  const wanted=(names||[]).map(n=>normHeaderKey(n));
  let name=(wb.SheetNames||[]).find(n=>wanted.includes(normHeaderKey(n)));
  if(!name)name=(names||[]).find(n=>wb.Sheets[n])||wb.SheetNames[index];
  return name;
}
function sheetHeaders(wb,names,index){
  const name=findWorkbookSheetName(wb,names,index);
  if(!name||!wb.Sheets[name]||!wb.Sheets[name]['!ref'])return [];
  const range=XLSX.utils.decode_range(wb.Sheets[name]['!ref']);
  range.e.r=range.s.r;
  const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:true,range:XLSX.utils.encode_range(range),blankrows:false});
  return (rows&&rows[0]?rows[0]:[]).map(h=>clean(h)).filter(Boolean);
}
function sheetRows(wb,names,index){
  const name=findWorkbookSheetName(wb,names,index);
  if(!name||!wb.Sheets[name])return [];
  return XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:null,raw:true,blankrows:false});
}
function sheetRowsCompact(wb,names,index,keepHeaders){
  const name=findWorkbookSheetName(wb,names,index);
  if(!name||!wb.Sheets[name])return {headers:(keepHeaders||[]).slice(),rows:[]};
  const sh=wb.Sheets[name];
  const aoa=XLSX.utils.sheet_to_json(sh,{header:1,defval:null,raw:true,blankrows:false});
  if(!aoa||!aoa.length)return {headers:(keepHeaders||[]).slice(),rows:[]};
  const headers=(aoa[0]||[]).map(h=>clean(h));
  const keep=(keepHeaders&&keepHeaders.length?keepHeaders:headers).slice();
  const idxs=keep.map(k=>headers.findIndex(h=>normHeaderKey(h)===normHeaderKey(k)));
  const rows=[];
  for(let r=1;r<aoa.length;r++){
    const row=aoa[r]||[];
    let has=false;
    const out=idxs.map(i=>{
      const v=i>=0?row[i]:null;
      if(v!==null&&v!==undefined&&String(v).trim()!=='')has=true;
      return v===undefined?null:v;
    });
    if(has)rows.push(out);
  }
  return {headers:keep,rows};
}
function clean(v){return (v===null||v===undefined||v==='(blank)')?'':String(v).trim();}
function num(v){if(v===null||v===undefined||v===''||v==='(blank)')return 0;const n=Number(String(v).replace(/,/g,''));return Number.isFinite(n)?n:0;}
function rowFlag(v){const n=num(v);return n?Math.trunc(n):0;}
function pad2(n){return String(n).padStart(2,'0');}
function excelDateToISO(v){
  if(v===null||v===undefined||v===''||v==='(blank)')return null;
  if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${pad2(v.getMonth()+1)}-${pad2(v.getDate())}`;
  if(typeof v==='number'&&isFinite(v)){
    const d=XLSX.SSF.parse_date_code(v);
    return d?`${d.y}-${pad2(d.m)}-${pad2(d.d)}`:null;
  }
  const s=String(v).trim();
  if(!s||s==='(blank)')return null;
  if(/^\d+(\.\d+)?$/.test(s))return excelDateToISO(Number(s));
  const d=new Date(s);
  return isNaN(d)?null:`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function normalizeArea(v){const a=normalizeAreas(v);return a[0]||(clean(v).split(',')[0]||'N/A').trim();}
function normalizeMaterialArea(v){const a=normalizeAreas(v);return a[0]||'';}
function weekStart(iso){
  const d=new Date(iso+'T00:00:00');
  const day=(d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function addAgg(obj,key,stage,val){
  if(!obj[key])obj[key]={};
  obj[key][stage]=(obj[key][stage]||0)+val;
}



const DASHBOARD_CACHE_KEY='testpackDashboard.originalScope.lastUpdate.v18.bItemSource';
const LIVE_DATA_URL='/api/dashboard-data'; // V80 performance-only proxy; same dashboard_data.js content
const LIVE_REFRESH_MS=60*60*1000;
// Baseline reset key: this version treats the first loaded live data after deployment as the new baseline.
const LIVE_LAST_SNAPSHOT_KEY='testpackDashboard.originalScope.live.lastSnapshot.v4.bItemSource';
let LIVE_LAST_REFRESH_AT=null;
let LIVE_NEXT_REFRESH_AT=null;
let LIVE_REFRESH_TIMER=null;
let LIVE_COUNTDOWN_TIMER=null;
let LIVE_DATA_SOURCE='loading';
const HISTORY_DATA_URL_BASE='https://raw.githubusercontent.com/shata733-source/testpack-data/main/history/';
let CURRENT_LIVE_SNAPSHOT=null;
let CURRENT_DELTA_LABEL='Previous hourly update';

function currentDashboardSnapshot(source){
  ensureLightTestPackRows();
  return {
    savedAt:new Date().toISOString(),
    source:source||'updated',
    TP:TP||[],MAT:MAT||{},MAT_ROWS:MAT_ROWS||[],
    TP_SUMMARY_ROWS:TP_SUMMARY_ROWS||[],TP_SUMMARY_HEADERS:TP_SUMMARY_HEADERS||[],
    TEST_PACK_ROWS:TEST_PACK_ROWS||[],TEST_PACK_HEADERS:TEST_PACK_HEADERS||[],
    B_ITEM_ROWS:B_ITEM_ROWS||[],B_ITEM_HEADERS:B_ITEM_HEADERS||[],
    PUNCH_STATS:PUNCH_STATS||[],PUNCH_MON:PUNCH_MON||{},PUNCH_WEK:PUNCH_WEK||{},PUNCH_EVENTS:PUNCH_EVENTS||[],
    TP_MON:TP_MON||{},TP_WEK:TP_WEK||{}
  };
}
function applyDashboardSnapshot(snapshot){
  if(!snapshot||!Array.isArray(snapshot.TP)||!snapshot.TP.length)return false;
  TP=snapshot.TP||[];
  MAT=snapshot.MAT||{};
  MAT_ROWS=snapshot.MAT_ROWS||[];
  TP_SUMMARY_ROWS=snapshot.TP_SUMMARY_ROWS||[];
  TP_SUMMARY_HEADERS=snapshot.TP_SUMMARY_HEADERS||[];
  TEST_PACK_ROWS=snapshot.TEST_PACK_ROWS||[];
  TEST_PACK_HEADERS=snapshot.TEST_PACK_HEADERS||[];
  B_ITEM_ROWS=snapshot.B_ITEM_ROWS||[];
  B_ITEM_HEADERS=snapshot.B_ITEM_HEADERS||[];
  ensureLightTestPackRows();
  DATA_VERSION++; invalidateDashboardCaches();
  PUNCH_STATS=snapshot.PUNCH_STATS||[];
  PUNCH_MON=snapshot.PUNCH_MON||{};
  PUNCH_WEK=snapshot.PUNCH_WEK||{};
  PUNCH_EVENTS=snapshot.PUNCH_EVENTS||[];
  TP_MON=snapshot.TP_MON||{};
  TP_WEK=snapshot.TP_WEK||{};
  F={con:'ALL',areaGrp:['ALL'],area:['ALL'],sys:['ALL'],stage:['ALL']};
  if(typeof rebuildSidebarFilters==='function')rebuildSidebarFilters();
  {applyMultiSelect(document.getElementById('fAreaGrp'),['ALL']); applyMultiSelect(document.getElementById('fArea'),['ALL']); applyMultiSelect(document.getElementById('fSys'),['ALL']); applyMultiSelect(document.getElementById('fStage'),['ALL']); if(typeof updateSidebarMultiDropdownLabels==='function')updateSidebarMultiDropdownLabels();}
  document.querySelectorAll('.sidebar .fbtn').forEach((b,i)=>b.classList.toggle('active',i===0));
  return true;
}

const DASHBOARD_DB_NAME='testpackDashboardStorage';
const DASHBOARD_DB_STORE='snapshots';
function openDashboardStorage(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB is not available'));return;}
    const req=indexedDB.open(DASHBOARD_DB_NAME,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DASHBOARD_DB_STORE))db.createObjectStore(DASHBOARD_DB_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Could not open IndexedDB'));
  });
}
function idbPutSnapshot(key,value){
  return openDashboardStorage().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(DASHBOARD_DB_STORE,'readwrite');
    tx.objectStore(DASHBOARD_DB_STORE).put(value,key);
    tx.oncomplete=()=>{db.close();resolve(true);};
    tx.onerror=()=>{db.close();reject(tx.error||new Error('Could not save IndexedDB snapshot'));};
  }));
}
function idbGetSnapshot(key){
  return openDashboardStorage().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(DASHBOARD_DB_STORE,'readonly');
    const req=tx.objectStore(DASHBOARD_DB_STORE).get(key);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('Could not read IndexedDB snapshot'));
    tx.oncomplete=()=>db.close();
  }));
}
function idbDeleteSnapshot(key){
  return openDashboardStorage().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(DASHBOARD_DB_STORE,'readwrite');
    tx.objectStore(DASHBOARD_DB_STORE).delete(key);
    tx.oncomplete=()=>{db.close();resolve(true);};
    tx.onerror=()=>{db.close();reject(tx.error||new Error('Could not delete IndexedDB snapshot'));};
  })).catch(()=>false);
}

async function saveDashboardSnapshot(source){
  const snap=currentDashboardSnapshot(source);

  // IndexedDB is better for this dashboard because the Test Packs rows are large.
  // Avoid trying localStorage first; quota failures there freeze the browser for noticeable time.
  try{
    await idbPutSnapshot(DASHBOARD_CACHE_KEY,snap);
    try{localStorage.setItem(DASHBOARD_CACHE_KEY+'.meta',JSON.stringify({savedAt:snap.savedAt,source:snap.source,tpCount:(snap.TP||[]).length}));}catch(e){}
    return true;
  }catch(err){
    console.warn('IndexedDB could not save the dashboard snapshot, trying localStorage fallback:',err);
  }

  try{
    localStorage.setItem(DASHBOARD_CACHE_KEY,JSON.stringify(snap));
    return true;
  }catch(err){
    console.warn('localStorage could not save the dashboard snapshot:',err);
    return false;
  }
}
async function loadDashboardSnapshot(){
  try{
    const snap=await idbGetSnapshot(DASHBOARD_CACHE_KEY);
    if(snap)return applyDashboardSnapshot(snap);
  }catch(err){
    console.warn('Could not load saved dashboard data from IndexedDB:',err);
  }

  try{
    const raw=localStorage.getItem(DASHBOARD_CACHE_KEY);
    if(raw)return applyDashboardSnapshot(JSON.parse(raw));
  }catch(err){
    console.warn('Could not load saved dashboard data from localStorage:',err);
  }
  return false;
}
async function clearSavedDashboardSnapshot(){
  try{localStorage.removeItem(DASHBOARD_CACHE_KEY);localStorage.removeItem(DASHBOARD_CACHE_KEY+'.meta');}catch(err){}
  await idbDeleteSnapshot(DASHBOARD_CACHE_KEY);
  return true;
}
async function clearSavedDataAndReload(){
  await clearSavedDashboardSnapshot();
  clearUpdateDeltas(false);
  alert('Saved dashboard data and update deltas have been cleared. Press Update Data to load the latest online Excel.');
}
function autoRefreshFromRemoteOnOpen(){
  // Disabled intentionally for speed and correct delta calculation.
  // Press Update Data manually to pull latest server data and generate deltas.
  return false;
}

function updateTodayDate(){
  const d=new Date();
  const txt=`${pad2(d.getDate())} / ${pad2(d.getMonth()+1)} / ${d.getFullYear()}`;
  const el=document.getElementById('todayDate'); if(el)el.textContent=txt;
}
function toggleTheme(){
  document.body.classList.toggle('light');
  const light=document.body.classList.contains('light');
  localStorage.setItem('tpDashTheme',light?'light':'dark');
  const btn=document.getElementById('themeBtn'); if(btn)btn.textContent=light?'🌙 Dark':'☀ Light';
}
function applySavedTheme(){
  if(localStorage.getItem('tpDashTheme')==='light')document.body.classList.add('light');
  const btn=document.getElementById('themeBtn'); if(btn)btn.textContent=document.body.classList.contains('light')?'🌙 Dark':'☀ Light';
}
function buildEmbeddedDataBlock(){
  ensureLightTestPackRows();
  return `// DATA_START\nlet TP=${JSON.stringify(TP)};\nlet MAT=${JSON.stringify(MAT)};\nlet MAT_ROWS=${JSON.stringify(MAT_ROWS)};\nlet PUNCH_STATS=${JSON.stringify(PUNCH_STATS)};\nlet PUNCH_MON=${JSON.stringify(PUNCH_MON)};\nlet PUNCH_WEK=${JSON.stringify(PUNCH_WEK)};\nlet PUNCH_EVENTS=${JSON.stringify(PUNCH_EVENTS)};\nlet TP_MON=${JSON.stringify(TP_MON)};\nlet TP_WEK=${JSON.stringify(TP_WEK)};\nvar TP_SUMMARY_ROWS=${JSON.stringify(TP_SUMMARY_ROWS||[])};\nvar TP_SUMMARY_HEADERS=${JSON.stringify(TP_SUMMARY_HEADERS||[])};\n// DATA_END
var TP_SUMMARY_ROWS=(typeof TP_SUMMARY_ROWS==='undefined')?[]:TP_SUMMARY_ROWS;
var TP_SUMMARY_HEADERS=(typeof TP_SUMMARY_HEADERS==='undefined')?[]:TP_SUMMARY_HEADERS;
var TEST_PACK_ROWS=${JSON.stringify(TEST_PACK_ROWS||[])};
var TEST_PACK_HEADERS=${JSON.stringify(TEST_PACK_HEADERS||[])};
var B_ITEM_ROWS=${JSON.stringify(B_ITEM_ROWS||[])};
var B_ITEM_HEADERS=${JSON.stringify(B_ITEM_HEADERS||[])};`;
}

function currentFilteredTpSet(){
  const filtered=getFiltered();
  return new Set((filtered||[]).map(r=>clean(r.tp)).filter(Boolean));
}
function filteredTpSummaryExportRows(){
  const filtered=getFiltered();
  const tpSet=currentFilteredTpSet();
  let rows=(Array.isArray(TP_SUMMARY_ROWS)&&TP_SUMMARY_ROWS.length)?TP_SUMMARY_ROWS.slice():buildFallbackTpSummaryRows(filtered);
  rows=rows.filter(r=>{
    const tp=clean(rowValue(r,['TestPackNo','TP NUMBER','TP Number','Test Pack No','TestPack No']));
    return !tpSet.size || tpSet.has(tp);
  });
  const headers=tpSummaryHeaders(rows);
  const q=clean((document.getElementById('tpListSearch')||{}).value).toLowerCase();
  if(q)rows=rows.filter(r=>rowMatchesQuery(headers,r,formatTpListCell,q));
  return {headers,rows:rows.map(r=>{const o={};headers.forEach(h=>o[h]=formatTpListCell(h,r[h]));return o;})};
}
function filteredTestPackCommentsExportRows(){
  const filtered=getFiltered();
  const tpSet=new Set((filtered||[]).map(r=>clean(r.tp)).filter(Boolean));
  const areaVals=toMulti(F.area);
  let rows=(Array.isArray(TEST_PACK_ROWS)&&TEST_PACK_ROWS.length)?TEST_PACK_ROWS.slice():[];
  rows=rows.filter(r=>{
    const tp=clean(rowValue(r,['TP NUMBER','TP No','TP Number','TestPackNo','Test Pack No','TestPack No']));
    if(tpSet.size && !tpSet.has(tp))return false;
    if(!multiIsAll(areaVals)){
      const rowAreas=normalizeAreas(rowValue(r,['Area','AREA']));
      if(!rowAreas.length || !rowAreas.some(ar=>areaVals.includes(ar)))return false;
    }
    return true;
  });
  const headers=testPackCommentHeaders(rows);
  const q=clean((document.getElementById('tpCommentsSearch')||{}).value).toLowerCase();
  if(q)rows=rows.filter(r=>rowMatchesQuery(headers,r,testPackCommentCell,q));
  return {headers,rows:rows.map(r=>{const o={};headers.forEach(h=>o[h]=testPackCommentCell(h,rowValue(r,[h])));return o;})};
}
function qcAPunchListExportRows(){
  const res=computeAPunchPageRows(getFiltered());
  const q=clean((document.getElementById('punchCommentsSearch')||{}).value).toLowerCase();
  let rows=res.commentRows||[];
  if(q)rows=rows.filter(r=>[r.tp,r.stage,r.category,r.actionParty,r.type,r.area,r.iso,r.ident,r.item,r.punchItemType,r.comment].some(v=>clean(v).toLowerCase().includes(q)));
  const headers=['TP Number','Stage','Category','Action Party','Type','Status','Area','ISO','Ident Code','Punch Item Type','Punch Item','Comments','Punch Cleared'];
  return {headers,rows:rows.map(r=>({
    'TP Number':r.tp,
    'Stage':r.stage,
    'Category':r.category,
    'Action Party':r.actionParty,
    'Type':r.type,
    'Status':r.cleared?'Cleared':'Open',
    'Area':r.area,
    'ISO':r.iso,
    'Ident Code':r.ident,
    'Punch Item Type':r.punchItemType,
    'Punch Item':r.item,
    'Comments':r.comment,
    'Punch Cleared':exportDateValue(r.punchCleared)
  }))};
}

function exportDateValue(v){
  try{
    if(v===null||v===undefined||v==='')return '';
    const iso=(typeof excelDateToISO==='function')?excelDateToISO(v):null;
    if(iso){
      const parts=String(iso).split('-');
      if(parts.length===3)return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return clean(v);
  }catch(e){
    return clean(v);
  }
}



function reinstatementTestPacksExportRows(){
  const rows=reinstatementPendingRows(getFiltered());
  const headers=['Test Pack','Current Stage','B Punch','Punch Type','Construction Note','B Cleared','B Balance','Returned B Punch','Returned B Cleared','Returned B Balance'];
  return {headers,rows:rows.map(r=>({
    'Test Pack':r.tp,
    'Current Stage':r.current,
    'B Punch':r.total,
    'Punch Type':`CNS ${r.cns||0} / ENG ${r.eng||0}`,
    'Construction Note':(r.total||0)===0?'No B Punch Received':(r.cnsReady?'Ready from Construction':'CNS Open'),
    'B Cleared':r.cleared,
    'B Balance':r.balance,
    'Returned B Punch':r.retTotal,
    'Returned B Cleared':r.retCleared,
    'Returned B Balance':r.retBalance
  }))};
}

function bPunchItemsExportRows(){
  const {rows,tpLookup}=bItemRawRowsForFiltered(getFiltered());
  const out=[];
  (rows||[]).forEach(r=>{
    const tp=rowTPNo(r);
    const tpInfo=tpLookup[tp]||{};
    let type='';
    let cleared=false;
    if(isReturnBPunchRow(r)){
      type='QC Return B Punch';
      cleared=isReturnBPunchCleared(r,tpInfo);
    }else if(isCnsBPunchSourceRow(r)){
      type='CNS B Punch';
      cleared=isBPunchCleared(r,tpInfo);
    }else{
      return;
    }
    out.push({
      'B Punch Type':type,
      'TP Number':tp,
      'Current TP Stage':currentStageOfTp(tpInfo)||'',
      'Construction Stage':rowStage(r),
      'Status':cleared?'Cleared':'Open',
      'Area':pickAreaCode(rowValue(r,['Area','AREA'])),
      'ISO':clean(rowValue(r,['ISO No.','ISO','Iso No'])),
      'Ident Code':rowIdent(r),
      'Punch Item':rowPunchItem(r),
      'Punch Item Type':clean(rowValue(r,['Punch Item Type','PUNCH ITEM TYPE'])),
      'Material Type':rowMaterial(r),
      'Comments':rowComment(r),
      'Punch Cleared':exportDateValue(rowValue(r,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date']))
    });
  });
  const headers=['B Punch Type','TP Number','Current TP Stage','Construction Stage','Status','Area','ISO','Ident Code','Punch Item','Punch Item Type','Material Type','Comments','Punch Cleared'];
  return {headers,rows:out};
}

function cnsABalanceDetailsExportRows(){
  const {rows,tpLookup,backMap}=punchRawRowsForFiltered(getFiltered());
  const out=[];
  (rows||[]).filter(r=>punchCategoryFromRow(r)==='A').forEach(r=>{
    const tp=rowTPNo(r),tpInfo=tpLookup[tp]||{};
    const stage=punchACommentStage(r);
    const type=classifyAPunchType(r);
    const cleared=aBalanceItemCleared(r,tpInfo,stage,backMap);
    if(!cleared){
      out.push({
        'TP Number':tp,
        'Balance Type':type,
        'QC Stage':stage||'',
        'Area':pickAreaCode(rowValue(r,['Area','AREA'])),
        'ISO':clean(rowValue(r,['ISO No.','ISO','Iso No'])),
        'Ident Code':rowIdent(r),
        'Punch Item':rowPunchItem(r),
        'Punch Item Type':clean(rowValue(r,['Punch Item Type','PUNCH ITEM TYPE'])),
        'Material Type':rowMaterial(r),
        'Comments':rowComment(r),
        'Punch Cleared':exportDateValue(rowValue(r,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date']))
      });
    }
  });
  const headers=['TP Number','Balance Type','QC Stage','Area','ISO','Ident Code','Punch Item','Punch Item Type','Material Type','Comments','Punch Cleared'];
  return {headers,rows:out};
}
function exportRowsToWorkbook(sheetName,headers,rows,fileName){
  try{
    if(typeof XLSX==='undefined'){
      alert('Excel library is not loaded. Please open the dashboard with internet access, then try again.');
      return;
    }
    headers=headers||[];
    rows=rows||[];
    if(!headers.length){
      alert('No columns found to export.');
      return;
    }
    const wb=XLSX.utils.book_new();
    const data=rows.map(r=>{
      const o={};
      headers.forEach(h=>o[h]=r && r[h]!==undefined && r[h]!==null ? r[h] : '');
      return o;
    });

    const ws=XLSX.utils.json_to_sheet(data,{header:headers});
    if(!rows.length){
      // Keep headers visible even when the filtered list has no rows.
      XLSX.utils.sheet_add_aoa(ws,[headers],{origin:'A1'});
    }
    ws['!cols']=headers.map(h=>({wch:Math.min(Math.max(String(h).length+4,14),55)}));
    XLSX.utils.book_append_sheet(wb,ws,String(sheetName||'Export').substring(0,31));

    const out=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    const blob=new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=fileName||'Dashboard_Export.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},800);
  }catch(err){
    console.error('Export failed:',err);
    alert('Export failed: '+(err && err.message ? err.message : err));
  }
}
function downloadExcelList(){
  const msg=[
    'Choose list to export:',
    '1 - Test Pack List',
    '2 - Test Pack Comments',
    '3 - QC A Punch List',
    '4 - CNS A Punch Balance Classification DETAILS',
    '5 - B Punch Items DETAILS',
    '6 - Reinstatement Test Packs'
  ].join('\n');
  const choice=prompt(msg,'1');
  if(choice===null)return;
  const c=String(choice).trim().toLowerCase();
  const d=new Date();
  const stamp=`${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  let payload,title,file;
  if(c==='1'||c.includes('test pack list')){
    payload=filteredTpSummaryExportRows(); title='Test Pack List'; file=`Test_Pack_List_${stamp}.xlsx`;
  }else if(c==='2'||c.includes('comments')){
    payload=filteredTestPackCommentsExportRows(); title='Test Pack Comments'; file=`Test_Pack_Comments_${stamp}.xlsx`;
  }else if(c==='3'||c.includes('qc')){
    payload=qcAPunchListExportRows(); title='QC A Punch List'; file=`QC_A_Punch_List_${stamp}.xlsx`;
  }else if(c==='4'||c.includes('cns')||c.includes('balance')){
    payload=cnsABalanceDetailsExportRows(); title='CNS A Balance Details'; file=`CNS_A_Punch_Balance_Details_${stamp}.xlsx`;
  }else if(c==='5'||c.includes('b punch')||c.includes('b item')){
    payload=bPunchItemsExportRows(); title='B Punch Items Details'; file=`B_Punch_Items_Details_${stamp}.xlsx`;
  }else if(c==='6'||c.includes('reinstatement')){
    payload=reinstatementTestPacksExportRows(); title='Reinstatement Test Packs'; file=`Reinstatement_Test_Packs_${stamp}.xlsx`;
  }else{
    alert('Invalid selection. Please enter 1, 2, 3, 4, 5, or 6.');
    return;
  }
  exportRowsToWorkbook(title,payload.headers,payload.rows,file);
}

function downloadUpdatedHTML(){
  const clone=document.documentElement.cloneNode(true);
  clone.querySelectorAll('.multi-dd').forEach(el=>el.innerHTML='');
  clone.querySelectorAll('tbody').forEach(el=>el.innerHTML='');
  ['kpiRow','punchCards','overviewMatKpi','areaChart','priChart','punchPageCards','aBalanceTypeChart','aStageStatusTable','punchCommentsHead','punchCommentsBody','tpListHead','tpListBody','tpCommentsHead','tpCommentsBody'].forEach(id=>{
    const el=clone.querySelector('#'+id); if(el)el.innerHTML='';
  });
  let html='<!DOCTYPE html>\n'+clone.outerHTML;
  const block=buildEmbeddedDataBlock();
  html=html.replace(/\/\/ DATA_START[\s\S]*?\/\/ DATA_END/,block);
  const d=new Date();
  const stamp=`${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`TestPack_Dashboard_Lite_Fast_${stamp}.html`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

/* ===================== OPTIMIZED LARGE TABLE RENDERING =====================
   Test Pack List and Test Pack Comments can contain thousands of rows.
   Rendering every row on every page switch makes the dashboard heavy, so these
   overrides render one page at a time and keep search/filtering responsive.
========================================================================== */
const BIG_TABLE_STATE={
  tplist:{page:1,size:100,timer:null},
  tpcomments:{page:1,size:100,timer:null}
};
function bigTableTotalPages(kind,total){const st=BIG_TABLE_STATE[kind];return Math.max(1,Math.ceil(total/(st.size||100)));}
function clampBigTablePage(kind,total){const st=BIG_TABLE_STATE[kind];const pages=bigTableTotalPages(kind,total);st.page=Math.min(Math.max(1,st.page||1),pages);return pages;}
function setBigTablePage(kind,page){const st=BIG_TABLE_STATE[kind];st.page=Math.max(1,page||1); if(kind==='tplist')renderTestPackList(); else renderTestPackComments();}
function setBigTablePageSize(kind,size){const st=BIG_TABLE_STATE[kind];st.size=parseInt(size,10)||100;st.page=1; if(kind==='tplist')renderTestPackList(); else renderTestPackComments();}
function bigTableSearchChanged(kind,fn){const st=BIG_TABLE_STATE[kind];st.page=1;clearTimeout(st.timer);st.timer=setTimeout(fn,160);}
function tpListSearchChanged(){bigTableSearchChanged('tplist',()=>renderTestPackList());}
function tpCommentsSearchChanged(){bigTableSearchChanged('tpcomments',()=>renderTestPackComments());}
function bigTablePagerHTML(kind,total){
  const st=BIG_TABLE_STATE[kind];const pages=clampBigTablePage(kind,total);const start=total?((st.page-1)*st.size+1):0;const end=Math.min(total,st.page*st.size);
  const label=kind==='tplist'?'Test Packs':'Rows';
  const opts=[50,100,200,500].map(v=>`<option value="${v}" ${st.size===v?'selected':''}>${v} / page</option>`).join('');
  return `<div class="pager-left"><button class="pager-btn" onclick="setBigTablePage('${kind}',1)" ${st.page<=1?'disabled':''}>First</button><button class="pager-btn" onclick="setBigTablePage('${kind}',${st.page-1})" ${st.page<=1?'disabled':''}>Prev</button><span class="pager-info">Page ${st.page} / ${pages}</span><button class="pager-btn" onclick="setBigTablePage('${kind}',${st.page+1})" ${st.page>=pages?'disabled':''}>Next</button><button class="pager-btn" onclick="setBigTablePage('${kind}',${pages})" ${st.page>=pages?'disabled':''}>Last</button></div><div class="pager-right"><span class="pager-info">Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()} ${label}</span><select class="pager-size" onchange="setBigTablePageSize('${kind}',this.value)">${opts}</select></div>`;
}
function rowMatchesQuery(headers,row,formatter,q){
  if(!q)return true;
  for(const h of headers){
    const raw=rowValue(row,[h]);
    const txt=(formatter?formatter(h,raw):clean(raw)).toLowerCase();
    if(txt.includes(q))return true;
  }
  return false;
}
function renderTestPackList(filteredData){
  const filtered=filteredData||getFiltered();
  const tpSet=new Set((filtered||[]).map(r=>clean(r.tp)).filter(Boolean));
  let rows=(Array.isArray(TP_SUMMARY_ROWS)&&TP_SUMMARY_ROWS.length)?TP_SUMMARY_ROWS.slice():buildFallbackTpSummaryRows(filtered);
  rows=rows.filter(r=>{
    const tp=clean(rowValue(r,['TestPackNo','TP NUMBER','TP Number','Test Pack No','TestPack No']));
    return !tpSet.size || tpSet.has(tp);
  });
  const headers=tpSummaryHeaders(rows);
  const q=clean((document.getElementById('tpListSearch')||{}).value).toLowerCase();
  if(q)rows=rows.filter(r=>rowMatchesQuery(headers,r,formatTpListCell,q));
  const head=document.getElementById('tpListHead'),body=document.getElementById('tpListBody'),count=document.getElementById('tpListCount'),pager=document.getElementById('tpListPager');
  if(count)count.textContent=`${rows.length.toLocaleString()} Test Packs`;
  if(!head||!body)return;
  head.innerHTML='<tr>'+headers.map(h=>`<th>${escapeHTML(h)}</th>`).join('')+'</tr>';
  const st=BIG_TABLE_STATE.tplist;clampBigTablePage('tplist',rows.length);
  const pageRows=rows.slice((st.page-1)*st.size,st.page*st.size);
  if(!pageRows.length){body.innerHTML='<tr><td style="padding:18px;color:var(--dim);font-family:var(--sans)">No matching Test Packs found.</td></tr>';}
  else{body.innerHTML=pageRows.map(r=>'<tr>'+headers.map(h=>`<td>${escapeHTML(formatTpListCell(h,r[h]))}</td>`).join('')+'</tr>').join('');}
  if(pager)pager.innerHTML=bigTablePagerHTML('tplist',rows.length);
}
function testPackCommentHeaders(rows){
  const preferred=['SN','TP NUMBER','Date','Construction Stage','Area','ISO No.','Punch Item','Punch Item Type','Material TYPE','Comments','Qty','Size','SizeDesc','Ident. Code','Punch Category\n(A/B/C)','Punch Category (A/B/C)','Punch Cleared','Punch Clear Confirmed','Punch Owner'];
  const headers=(Array.isArray(TEST_PACK_HEADERS)&&TEST_PACK_HEADERS.length)?TEST_PACK_HEADERS.slice():[];
  (rows||[]).forEach(r=>{if(!Array.isArray(r))Object.keys(r||{}).forEach(k=>{if(!headers.includes(k))headers.push(k);});});
  preferred.slice().reverse().forEach(h=>{const i=headers.findIndex(x=>normHeaderKey(x)===normHeaderKey(h));if(i>0){const v=headers.splice(i,1)[0];headers.unshift(v);}});
  return headers;
}
function testPackCommentCell(header,value){
  if(value===null||value===undefined||value==='(blank)')return '';
  const h=clean(header);
  if(/date|cleared|confirmed/i.test(h)){
    const iso=excelDateToISO(value);
    if(iso){const p=iso.split('-');return `${p[2]}/${p[1]}/${p[0]}`;}
  }
  if(typeof value==='number'&&Math.abs(value)>0&&Math.abs(value)<10000000){
    return Number.isInteger(value)?String(value):String(Math.round(value*1000)/1000);
  }
  return clean(value);
}
function renderTestPackComments(filteredData){
  const filtered=filteredData||getFiltered();
  const tpSet=new Set((filtered||[]).map(r=>clean(r.tp)).filter(Boolean));
  let rows=(Array.isArray(TEST_PACK_ROWS)&&TEST_PACK_ROWS.length)?TEST_PACK_ROWS.slice():[];
  const areaVals=toMulti(F.area);

  rows=rows.filter(r=>{
    const tp=clean(rowValue(r,['TP NUMBER','TP No','TP Number','TestPackNo','Test Pack No','TestPack No']));
    if(tpSet.size && !tpSet.has(tp))return false;
    if(!multiIsAll(areaVals)){
      const rowAreas=normalizeAreas(rowValue(r,['Area','AREA']));
      if(!rowAreas.length || !rowAreas.some(ar=>areaVals.includes(ar)))return false;
    }
    return true;
  });

  const headers=testPackCommentHeaders(rows);
  const q=clean((document.getElementById('tpCommentsSearch')||{}).value).toLowerCase();
  if(q)rows=rows.filter(r=>headers.some(h=>testPackCommentCell(h,rowValue(r,[h])).toLowerCase().includes(q)));

  const head=document.getElementById('tpCommentsHead'),
        body=document.getElementById('tpCommentsBody'),
        count=document.getElementById('tpCommentsCount'),
        pager=document.getElementById('tpCommentsPager');

  if(count)count.textContent=`${rows.length.toLocaleString()} Rows`;
  if(!head||!body)return;

  if(!headers.length){
    head.innerHTML='';
    body.innerHTML='<tr><td style="padding:18px;color:var(--dim);font-family:var(--sans)">No Test Packs sheet rows loaded yet. Press Update Data or Local Upload to load the latest FMS file.</td></tr>';
    if(pager)pager.innerHTML='';
    return;
  }

  head.innerHTML='<tr>'+headers.map(h=>`<th>${escapeHTML(h)}</th>`).join('')+'</tr>';

  const st=BIG_TABLE_STATE.tpcomments;
  clampBigTablePage('tpcomments',rows.length);
  const pageRows=rows.slice((st.page-1)*st.size,st.page*st.size);

  if(!pageRows.length){
    body.innerHTML=`<tr><td colspan="${headers.length||1}" style="padding:18px;color:var(--dim);font-family:var(--sans)">No matching rows found.</td></tr>`;
  }else{
    body.innerHTML=pageRows.map(r=>'<tr>'+headers.map(h=>`<td>${escapeHTML(testPackCommentCell(h,rowValue(r,[h])))}</td>`).join('')+'</tr>').join('');
  }

  if(pager)pager.innerHTML=bigTablePagerHTML('tpcomments',rows.length);
}

/* ===================== PUNCH PAGE ===================== */
const PUNCH_A_COMMENT_STAGES=['QC PreTestPack Punch List','Return with Back Punch'];
const PUNCH_PAGE_STATE={commentsPage:1,commentsSize:100,timer:null};
function getFilteredForPunchTpBase(){
  // Punch page special rule:
  // Contractor / System / Stage still come from TP Summary.
  // Area must NOT pre-filter Test Pack numbers from TP Summary.
  // Area is applied later directly on the Area column in the Test Packs sheet.
  const sysVals=toMulti(F.sys);
  const stageVals=toMulti(F.stage);
  return TP.filter(r=>{
    if(F.con!=='ALL'&&r.con!==F.con) return false;
    if(!multiIsAll(sysVals)&&!sysVals.includes(r.sys)) return false;
    if(!multiIsAll(stageVals)){
      const ok=stageVals.some(stg=>stg==='CNS L/C Completed'?hasCnsLC(r):hasStage(r,stg));
      if(!ok)return false;
    }
    return true;
  });
}
function punchTpLookup(data){
  const map={};
  (data||getFilteredForPunchTpBase()).forEach(r=>{const tp=clean(r.tp); if(tp)map[tp]=r;});
  return map;
}
function rowTPNo(row){return clean(rowValue(row,['TP NUMBER','TP No','TP Number','TestPackNo','Test Pack No','TestPack No']));}
function rowComment(row){return clean(rowValue(row,['Comments','Comment','Remarks','Remark']));}
function rowStage(row){return clean(rowValue(row,['Construction Stage','Stage','Stages','Current Stage','Punch Stage','Last FMS Stage','CCC Last Stage']));}
function rowIdent(row){return clean(rowValue(row,['Ident. Code','Ident Code','Ident','Item Code']));}
function rowMaterial(row){return clean(rowValue(row,['Material TYPE','Material Type','Material','Mat Type']));}
function rowPunchItem(row){return clean(rowValue(row,['Punch Item','Punch Description','Description']));}
function punchACommentStage(row){
  // QC A punch rows are identified mainly by Construction Stage; Comments is a fallback for old exports.
  const src=normPunchText([rowStage(row),rowComment(row)].join(' '));
  if(!src)return '';
  if(src.includes(normPunchText('QC PreTestPack Punch List')))return 'QC PreTestPack Punch List';
  if(src.includes(normPunchText('Return with Back Punch')))return 'Return with Back Punch';
  return '';
}
function buildBackPunchClearedMap(rows){
  const m={};
  (rows||[]).forEach(r=>{
    const tp=rowTPNo(r);
    const src=normPunchText([rowStage(r),rowComment(r)].join(' '));
    if(tp && src.includes(normPunchText('Back Punch Cleared')))m[tp]=true;
  });
  return m;
}

function bItemRawRowsForFiltered(data){
  // Dedicated source for B Item calculations. Do not fall back to Test Packs.
  // Contractor/System/Stage filters restrict by TP Summary; Area/Area Group are applied directly on B Item row Area.
  const base=data||getFilteredForPunchTpBase();
  const tpLookup=punchTpLookup(base);
  const tpSet=new Set(Object.keys(tpLookup));
  const areaVals=toMulti(F.area);
  const areaGrpVals=toMulti(F.areaGrp);
  const rows=(Array.isArray(B_ITEM_ROWS)&&B_ITEM_ROWS.length)?B_ITEM_ROWS.slice():[];

  const filtered=rows.filter(r=>{
    const tp=rowTPNo(r);
    if(!tp)return false;
    if(tpSet.size && !tpSet.has(tp))return false;

    const rowAreas=normalizeAreas(rowValue(r,['Area','AREA']));
    if(!multiIsAll(areaGrpVals)){
      if(!rowAreas.length || !rowAreas.some(ar=>areaGrpVals.includes(areaGroupOf(ar))))return false;
    }
    if(!multiIsAll(areaVals)){
      if(!rowAreas.length || !rowAreas.some(ar=>areaVals.includes(ar)))return false;
    }
    return true;
  });
  return {rows:filtered,tpLookup};
}

function punchRawRowsForFiltered(data){
  // Important: use Test Packs sheet rows directly for punch details.
  // Contractor/System/Stage filters still restrict by TP Summary where possible.
  // Area and Area Group are applied directly on the Area column from Test Packs sheet.
  const tpLookup=punchTpLookup(getFilteredForPunchTpBase());
  const tpSet=new Set(Object.keys(tpLookup));
  const areaVals=toMulti(F.area);
  const areaGrpVals=toMulti(F.areaGrp);
  let rows=(Array.isArray(TEST_PACK_ROWS)&&TEST_PACK_ROWS.length)?TEST_PACK_ROWS.slice():[];

  let filtered=rows.filter(r=>{
    const tp=rowTPNo(r);
    if(!tp)return false;
    if(tpSet.size && !tpSet.has(tp))return false;

    const rowAreas=normalizeAreas(rowValue(r,['Area','AREA']));
    if(!multiIsAll(areaGrpVals)){
      if(!rowAreas.length || !rowAreas.some(ar=>areaGrpVals.includes(areaGroupOf(ar))))return false;
    }
    if(!multiIsAll(areaVals)){
      if(!rowAreas.length || !rowAreas.some(ar=>areaVals.includes(ar)))return false;
    }
    return true;
  });

  // Safety fallback: if TP number matching failed because of a source format issue,
  // still show punch rows filtered by Area/Area Group rather than rendering an empty page.
  if(!filtered.length && rows.length && F.con==='ALL' && multiIsAll(toMulti(F.sys)) && multiIsAll(toMulti(F.stage))){
    filtered=rows.filter(r=>{
      const tp=rowTPNo(r);
      if(!tp)return false;
      const rowAreas=normalizeAreas(rowValue(r,['Area','AREA']));
      if(!multiIsAll(areaGrpVals)){
        if(!rowAreas.length || !rowAreas.some(ar=>areaGrpVals.includes(areaGroupOf(ar))))return false;
      }
      if(!multiIsAll(areaVals)){
        if(!rowAreas.length || !rowAreas.some(ar=>areaVals.includes(ar)))return false;
      }
      return true;
    });
  }

  return {rows:filtered,tpLookup,backMap:buildBackPunchClearedMap(filtered)};
}
function isBPunchByComment(row){return isBPunchRow(row);}
function punchRowHasClearedDate(row){
  const v=rowValue(row,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date']);
  return isNonEmptyCell(v)||!!excelDateToISO(v);
}
function aStageItemCleared(row,tpInfo,stage,backMap){
  if(punchRowHasClearedDate(row))return true;
  if(stage==='QC PreTestPack Punch List' && tpInfo && hasStage(tpInfo,'QC Punch A Cleared'))return true;
  if(stage==='Return with Back Punch'){
    const tp=rowTPNo(row);
    if(tp && backMap && backMap[tp])return true;
  }
  return false;
}
function aBalanceItemCleared(row,tpInfo,stage,backMap){
  if(punchRowHasClearedDate(row))return true;
  if(tpInfo && hasStage(tpInfo,'L/C Issue To QC'))return true;
  if(stage && aStageItemCleared(row,tpInfo,stage,backMap))return true;
  return false;
}
function classifyAPunchType(row){
  const text=normPunchText([rowComment(row),rowMaterial(row),rowPunchItem(row),rowIdent(row),rowPunchItemType(row)].join(' '));
  const ident=normPunchText(rowIdent(row));
  const mat=normPunchText(rowMaterial(row));

  // More detailed classification based on actual B punch comment patterns.
  if(text.includes('ORIFICE')||text.includes('GAUGE')||text.includes('GUAGE')||
     text.includes('PRESSURE GAUGE')||text.includes('INSTRUMENT')||
     /\b(PG|LIT|LG|LV|PV|ZV|XV|BDV|PZV|PT|TT|FT|LT)\b/.test(text))return 'Instrument';

  if(text.includes('SPECTACLE')||text.includes('SPECTALE')||text.includes('SPADE')||
     text.includes('SPACER')||text.includes('SPADE SPACER')||text.includes('BLANK')||
     text.includes('BLIND'))return 'Spade / Blind';

  if(text.includes('BOLT TORQUE')||text.includes('BOLT TORQU')||text.includes('TORQUING')||
     text.includes(' BT ')||text.includes('BT TO')||text.includes('BT SHALL')||
     text.includes('REPORT TO ATTACH')||text.includes('REPORT TO BE ATTACHED'))return 'Bolt Torquing';

  if(text.includes('TEST REMOVAL')||text.includes('TEST REMOVALS')||
     text.includes('REINSTALLED')||text.includes('RE INSTALL')||text.includes('REINSTATED'))return 'Test Removal / Reinstatement';

  if(text.includes('ON PAVE')||text.includes('PAVE FOUNDATION')||text.includes('FOUNDATION')||
     text.includes('GROUT')||text.includes('GROUTING')||text.includes('FDN'))return 'On-pave FDN / Grouting';

  if(text.includes('TOE PLATE')||text.includes('TOE GUARD')||text.includes('GRATING')||
     text.includes('GRATINGS')||text.includes('CLEARANCE')||text.includes('MINIMUM CLEARANCE')||
     text.includes('ACCESS')||text.includes('HANDLE ACCESS'))return 'Access / Clearance';

  if(text.includes('ALIGNMENT')||text.includes('LEVEL')||text.includes('PLUMB')||
     text.includes('LINE RESTING')||text.includes('RESTING')||text.includes('SLOPE'))return 'Alignment / Level';

  if(text.includes('PICKLING')||text.includes('PASSIVATION'))return 'Pickling / Passivation';

  if(text.includes('TOUCH UP')||text.includes('TOUCHUP')||text.includes('PAINT')||
     text.includes('INSULATION')||text.includes('INSULATED')||text.includes('COATING'))return 'Paint / Insulation';

  if(text.includes('TEST LIMIT')||text.includes('P ID')||text.includes('PID')||
     text.includes('P AND ID')||text.includes('DRAWING')||text.includes('REVISION')||
     text.includes('REVISE')||text.includes('NOT MATCHING')||text.includes('MISMATCH')||
     text.includes('VERIFIED')||text.includes('VERIFY'))return 'Drawing / Verification';

  if(text.includes('VALVE')||/^\d/.test(ident)||ident.startsWith('P'))return 'Valve';
  if(text.includes('SUPPORT')||ident.startsWith('S')||/\bS\d+\b/.test(text))return 'Support';
  if(text.includes('SPOOL')||/(^|\s)(SP|SPL)(\s|\d|$)/.test(text)||ident.startsWith('A'))return 'Spool';
  if(text.includes('PLUG'))return 'Plug';
  if(text.includes('GASKET'))return 'Gasket';
  if(text.includes('BOLT')||text.includes('NUT'))return 'Bolt / Nut';
  if(text.includes('FLANGE')||text.includes('FLANGED'))return 'Flange';
  if(text.includes('WELD')||text.includes('NDE')||text.includes('JOINT')||text.includes('TACK'))return 'Weld / NDE';
  if(text.includes('PIPE')||text.includes('PIPING')||text.includes('FITTING')||
     text.includes('ELBOW')||text.includes('TEE')||text.includes('REDUCER')||
     text.includes('COUPLING')||text.includes('DRAIN')||text.includes('VENT'))return 'Pipe / Fitting';

  return 'General / Unclassified';
}
function punchTotalsFromTestPackRowsForPunchPage(data){
  const cacheKey=filterStateKey('punchTotals');
  if(PUNCH_FAST_CACHE[cacheKey])return PUNCH_FAST_CACHE[cacheKey];
  const {rows,tpLookup,backMap}=punchRawRowsForFiltered(data);
  const out={
    A:{total:0,cleared:0},
    B:{total:0,cleared:0},
    C:{total:0,cleared:0}
  };
  (rows||[]).forEach(r=>{
    const tp=rowTPNo(r);
    const tpInfo=tpLookup[tp]||{};
    const cat=punchCategoryFromRow(r);
    const stage=punchACommentStage(r);

    if(cat==='A'){
      out.A.total++;
      if(aBalanceItemCleared(r,tpInfo,stage,backMap))out.A.cleared++;
    }

    if(cat==='C'){
      out.C.total++;
      if(punchRowHasClearedDate(r))out.C.cleared++;
    }
  });

  const bSrc=bItemRawRowsForFiltered(data);
  (bSrc.rows||[]).forEach(r=>{
    const tp=rowTPNo(r);
    const tpInfo=(bSrc.tpLookup||{})[tp]||{};
    if(isBPunchRow(r)){
      out.B.total++;
      if(isBPunchCleared(r,tpInfo))out.B.cleared++;
    }
  });
  PUNCH_FAST_CACHE[cacheKey]=out;
  return out;
}

function punchTotalsForDisplay(data){
  // Punch cards use Test Packs for A/C and dedicated B Item sheet for B.
  // Before the online Excel finishes loading, fall back to the embedded TP-level punch stats
  // to avoid temporary zero cards.
  if(Array.isArray(TEST_PACK_ROWS)&&TEST_PACK_ROWS.length){
    return punchTotalsFromTestPackRowsForPunchPage(data);
  }
  return punchTotals(data);
}

function renderPunchPageCards(data){
  const pTotals=punchTotalsForDisplay(data);
  const make=(cat,obj,col)=>{
    const tot=obj.total||0,clr=obj.cleared||0,bal=Math.max(tot-clr,0),pc=tot>0?(clr/tot*100).toFixed(0):0;
    const fmt=v=>v>=1000?(v/1000).toFixed(1)+'K':v;
    return `<div class="punch-box"><div class="punch-cat">Punch ${cat}</div><div class="punch-total" style="color:${col}">${fmt(tot)}</div><div class="punch-sub">Cleared: ${clr.toLocaleString()}</div><div class="punch-sub" style="color:var(--red)">Balance: ${bal.toLocaleString()}</div><div class="punch-prog"><div class="punch-prog-fill" style="width:${pc}%;background:${col}"></div></div><div style="font-size:11px;color:var(--muted);margin-top:5px;font-weight:600">${pc}% cleared</div></div>`;
  };
  h('punchPageCards',make('A',pTotals.A,'var(--accent)')+make('B',pTotals.B,'var(--orange)')+make('C',pTotals.C,'var(--green)'));
}
function rowPunchItemType(row){
  return clean(rowValue(row,['Punch Item Type','PUNCH ITEM TYPE','Punch Type','Item Type','Type']));
}
function hasAllWords(text,words){
  const t=normPunchText(text);
  return (words||[]).every(w=>t.includes(normPunchText(w)));
}
function hasPidText(text){
  const t=normPunchText(text);
  return t.includes('P ID')||t.includes('PID')||t.includes('P AND ID')||t.includes('P I D');
}
function classifyActionParty(row){
  if(row && row.__actionPartyCached)return row.__actionPartyCached;
  const finish=(v)=>{try{if(row)row.__actionPartyCached=v;}catch(e){} return v;};
  const ptype=normPunchText(rowPunchItemType(row));
  const comment=normPunchText(rowComment(row));
  const fullText=normPunchText([rowPunchItemType(row),rowPunchItem(row),rowComment(row),rowMaterial(row)].join(' '));

  // Direct engineering ownership from Punch Item Type.
  if(ptype.includes('ENG')||ptype.includes('DRAWING REVISION')||ptype.includes('OTHER DOCUMENT'))return finish('ENG');

  // Document / drawing / engineering keywords.
  const hasPid=hasPidText(fullText);
  const hasIso=fullText.includes('ISO')||fullText.includes('ISOMETRIC');
  const hasDrawingDoc=hasPid||hasIso||fullText.includes('DRAWING')||fullText.includes('DOCUMENT')||fullText.includes('SIS SHEET')||fullText.includes('LINE INFORMATION SHEET');

  // Any drawing/document mismatch, update, reflection, addition, or missing information is ENG.
  if(hasDrawingDoc && (
    fullText.includes('UPDATE') || fullText.includes('UPDATED') ||
    fullText.includes('REFLECT') || fullText.includes('REFLECTED') ||
    fullText.includes('MISMATCH') || fullText.includes('NOT MATCH') || fullText.includes('NOT MATCHING') ||
    fullText.includes('NOT THERE') || fullText.includes('TO BE ADDED') || fullText.includes('ADD ') ||
    fullText.includes('SHOWN') || fullText.includes('LINE NUMBER') || fullText.includes('FROM TO')
  ))return finish('ENG');

  // Engineering / verification / review logic.
  if(fullText.includes('ENGINEERING') || fullText.includes('ENGINEER'))return finish('ENG');
  if((fullText.includes('VERIFY')||fullText.includes('VERIFIED')||fullText.includes('VERIFICATION')||fullText.includes('REVIEW')||fullText.includes('REVIEWED')) && (
    fullText.includes('TEST PRESSURE') || fullText.includes('PRESSURE') ||
    fullText.includes('LAY UP') || fullText.includes('LAYUP') ||
    fullText.includes('REQUIREMENT') || fullText.includes('SEAL WELD') ||
    fullText.includes('POSITION') || fullText.includes('SUMMARY') ||
    hasDrawingDoc
  ))return finish('ENG');
  if(fullText.includes('SHALL BE VERIFIED')||fullText.includes('TO BE VERIFIED'))return finish('ENG');

  // Report / certificate / attachment logic.
  const reportWords=['REPORT','SUMMARY','CALCULATION','CERTIFICATE','CHART','FLOW CHART'];
  const reportActions=['ATTACH','ATTACHED','PROVIDE','PROVIDED','SUBMIT','SUBMITTED','REVIEW','REVIEWED','MISSING'];
  if(reportWords.some(w=>fullText.includes(w)) && reportActions.some(w=>fullText.includes(w)))return finish('ENG');
  if((fullText.includes('BT')||fullText.includes('BOLT TORQUING')) && fullText.includes('REPORT'))return finish('ENG');
  if(fullText.includes('FVT') && fullText.includes('REPORT'))return finish('ENG');
  if(fullText.includes('TEST REPORT'))return finish('ENG');

  // Clearance / gap / access / clash / fouling logic that normally needs engineering decision or confirmation.
  const clearanceWords=['MINIMUM GAP','MINIMUM CLEARANCE','CLEARANCE','AIR GAP','GAP'];
  const nearbyObstructions=['HAND RAIL','HANDRAIL','CABLE TRAY','ELECTRIC CABLE','ELECTRICAL CABLE','CABLE','TRAY'];
  if(clearanceWords.some(w=>fullText.includes(w)) && (
    fullText.includes('MAINTAIN') || fullText.includes('PROVIDE') || fullText.includes('PROVIDED') ||
    fullText.includes('OBSERVED') || fullText.includes('STANDARD') ||
    nearbyObstructions.some(w=>fullText.includes(w))
  ))return finish('ENG');
  if((fullText.includes('CLASH')||fullText.includes('CLASHING')||fullText.includes('FOULING')||fullText.includes('INTERFERENCE')) &&
     nearbyObstructions.some(w=>fullText.includes(w)))return finish('ENG');
  if(fullText.includes('ACCESS') && fullText.includes('INSPECTION') && (fullText.includes('PROVIDE')||fullText.includes('PROVIDED')))return finish('ENG');

  // Extra broad patterns from the agreed examples.
  const directPatterns=[
    ['UPDATE','ISO'],
    ['SLOPE','REPORT'],
    ['WELD','SUMMARY'],
    ['MINIMUM','GAP'],
    ['MINIMUM','CLEARANCE'],
    ['SEAL','WELD','REQUIREMENT'],
    ['VERIFY','POSITION'],
    ['SIS','SHEET'],
    ['LINE','INFORMATION','SHEET'],
    ['ACCESS','INSPECTION'],
    ['AIR','GAP','STANDARD'],
    ['ENGINEERING','SIGN'],
    ['FLOW','CHART']
  ];
  if(directPatterns.some(p=>hasAllWords(fullText,p)))return finish('ENG');

  return finish('CNS');
}

function qcPunchListCategoryAllowed(row){
  const cat=punchCategoryFromRow(row);
  return cat==='A';
}
function computeAPunchPageRows(data){
  const cacheKey=filterStateKey('computeAPunchPageRows');
  if(PUNCH_FAST_CACHE[cacheKey])return PUNCH_FAST_CACHE[cacheKey];
  const {rows,tpLookup,backMap}=punchRawRowsForFiltered(data);

  const qcRows=rows.filter(r=>qcPunchListCategoryAllowed(r) && !!punchACommentStage(r));

  const stageStats={};
  PUNCH_A_COMMENT_STAGES.forEach(st=>{
    ['CNS','ENG'].forEach(ap=>{
      stageStats[st+'|'+ap]={stage:st,actionParty:ap,total:0,cleared:0,balance:0};
    });
  });

  const balanceTypes={};
  const commentRows=[];

  qcRows.forEach(r=>{
    const tp=rowTPNo(r),tpInfo=tpLookup[tp]||{};
    const stage=punchACommentStage(r);
    const type=classifyAPunchType(r);
    const cat=punchCategoryFromRow(r)||'Blank';
    const actionParty=classifyActionParty(r);
    const stageCleared=aStageItemCleared(r,tpInfo,stage,backMap);

    const key=stage+'|'+actionParty;
    const st=stageStats[key]||(stageStats[key]={stage,actionParty,total:0,cleared:0,balance:0});
    st.total++;
    if(stageCleared)st.cleared++; else st.balance++;

    commentRows.push({
      tp,stage,type,category:cat,actionParty,cleared:stageCleared,
      area:pickAreaCode(rowValue(r,['Area','AREA'])),
      iso:clean(rowValue(r,['ISO No.','ISO','Iso No'])),
      ident:rowIdent(r),
      item:rowPunchItem(r),
      punchItemType:rowPunchItemType(r),
      comment:rowComment(r),
      punchCleared:rowValue(r,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date'])
    });
  });

  const aRows=rows.filter(r=>punchCategoryFromRow(r)==='A');
  aRows.forEach(r=>{
    const tp=rowTPNo(r),tpInfo=tpLookup[tp]||{};
    const stage=punchACommentStage(r);
    const type=classifyAPunchType(r);
    const balanceCleared=aBalanceItemCleared(r,tpInfo,stage,backMap);
    if(!balanceCleared){
      if(!balanceTypes[type])balanceTypes[type]={type,total:0,cleared:0,balance:0};
      balanceTypes[type].total++;
      balanceTypes[type].balance++;
    }
  });

  const stageRows=Object.values(stageStats)
    .filter(r=>r.total>0)
    .sort((a,b)=>a.stage.localeCompare(b.stage)||a.actionParty.localeCompare(b.actionParty));

  const result={stageRows,typeRows:Object.values(balanceTypes).sort((a,b)=>b.balance-a.balance||a.type.localeCompare(b.type)),commentRows};
  PUNCH_FAST_CACHE[cacheKey]=result;
  return result;
}
function renderABalanceType(typeRows){
  const max=Math.max(1,...typeRows.map(r=>r.balance));
  h('aBalanceTypeChart',typeRows.length?hbar(typeRows.map(r=>[r.type,r.balance]),max,'linear-gradient(90deg,var(--accent),rgba(0,212,255,.35))'):'<div class="stage-note">No open A balance items.</div>');
}
function renderAStageStatus(stageRows){
  h('aStageStatusTable',stageRows.map(r=>{
    const pc=r.total>0?(r.cleared/r.total*100).toFixed(1):'0.0';
    return `<tr><td>${escapeHTML(r.stage)}</td><td><span class="punch-type-pill">${escapeHTML(r.actionParty)}</span></td><td>${r.total.toLocaleString()}</td><td class="punch-status-cleared">${r.cleared.toLocaleString()}</td><td class="punch-status-open">${r.balance.toLocaleString()}</td><td>${pc}%</td></tr>`;
  }).join(''));
}
function punchCommentsSearchChanged(){PUNCH_PAGE_STATE.commentsPage=1;clearTimeout(PUNCH_PAGE_STATE.timer);PUNCH_PAGE_STATE.timer=setTimeout(()=>renderPunchPage(),160);}
function setPunchCommentsPage(page){PUNCH_PAGE_STATE.commentsPage=Math.max(1,page||1);renderPunchPage();}
function setPunchCommentsPageSize(size){PUNCH_PAGE_STATE.commentsSize=parseInt(size,10)||100;PUNCH_PAGE_STATE.commentsPage=1;renderPunchPage();}
function punchCommentsPagerHTML(total){
  const st=PUNCH_PAGE_STATE;const pages=Math.max(1,Math.ceil(total/(st.commentsSize||100)));st.commentsPage=Math.min(Math.max(1,st.commentsPage),pages);
  const start=total?((st.commentsPage-1)*st.commentsSize+1):0,end=Math.min(total,st.commentsPage*st.commentsSize);
  const opts=[50,100,200,500].map(v=>`<option value="${v}" ${st.commentsSize===v?'selected':''}>${v} / page</option>`).join('');
  return `<div class="pager-left"><button class="pager-btn" onclick="setPunchCommentsPage(1)" ${st.commentsPage<=1?'disabled':''}>First</button><button class="pager-btn" onclick="setPunchCommentsPage(${st.commentsPage-1})" ${st.commentsPage<=1?'disabled':''}>Prev</button><span class="pager-info">Page ${st.commentsPage} / ${pages}</span><button class="pager-btn" onclick="setPunchCommentsPage(${st.commentsPage+1})" ${st.commentsPage>=pages?'disabled':''}>Next</button><button class="pager-btn" onclick="setPunchCommentsPage(${pages})" ${st.commentsPage>=pages?'disabled':''}>Last</button></div><div class="pager-right"><span class="pager-info">Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${total.toLocaleString()} Rows</span><select class="pager-size" onchange="setPunchCommentsPageSize(this.value)">${opts}</select></div>`;
}
function renderPunchCommentsList(commentRows){
  const q=clean((document.getElementById('punchCommentsSearch')||{}).value).toLowerCase();
  let rows=commentRows.slice();
  if(q){rows=rows.filter(r=>[r.tp,r.stage,r.category,r.actionParty,r.type,r.area,r.iso,r.ident,r.item,r.punchItemType,r.comment].some(v=>clean(v).toLowerCase().includes(q)));}
  const count=document.getElementById('punchCommentsCount'),head=document.getElementById('punchCommentsHead'),body=document.getElementById('punchCommentsBody'),pager=document.getElementById('punchCommentsPager');
  if(count)count.textContent=`${rows.length.toLocaleString()} A Comment Rows`;
  if(!head||!body)return;
  head.innerHTML='<tr><th>TP Number</th><th>Stage</th><th>Category</th><th>Action Party</th><th>Type</th><th>Status</th><th>Area</th><th>ISO</th><th>Ident Code</th><th>Punch Item Type</th><th>Punch Item</th><th>Comments</th></tr>';
  const st=PUNCH_PAGE_STATE;const pages=Math.max(1,Math.ceil(rows.length/(st.commentsSize||100)));st.commentsPage=Math.min(Math.max(1,st.commentsPage),pages);
  const pageRows=rows.slice((st.commentsPage-1)*st.commentsSize,st.commentsPage*st.commentsSize);
  if(!pageRows.length){body.innerHTML='<tr><td colspan="12" style="padding:18px;color:var(--dim);font-family:var(--sans)">No matching QC punch comments found.</td></tr>';}
  else body.innerHTML=pageRows.map(r=>`<tr><td>${escapeHTML(r.tp)}</td><td>${escapeHTML(r.stage)}</td><td>${escapeHTML(r.category)}</td><td><span class="punch-type-pill">${escapeHTML(r.actionParty)}</span></td><td><span class="punch-type-pill">${escapeHTML(r.type)}</span></td><td class="${r.cleared?'punch-status-cleared':'punch-status-open'}">${r.cleared?'Cleared':'Open'}</td><td>${escapeHTML(r.area)}</td><td>${escapeHTML(r.iso)}</td><td>${escapeHTML(r.ident)}</td><td>${escapeHTML(r.punchItemType)}</td><td>${escapeHTML(r.item)}</td><td>${escapeHTML(r.comment)}</td></tr>`).join('');
  if(pager)pager.innerHTML=punchCommentsPagerHTML(rows.length);
}
function renderPunchPage(data){
  try{rebuildPunchStatsFromTestPackRowsIfNeeded(true);}catch(err){console.warn('Punch rebuild failed:',err);}
  // V80 performance-only: do not clear PUNCH_FAST_CACHE on every render.
  // It is already cleared when filters/data change, so results stay identical and re-filtering is faster.
  const filtered=data||getFiltered();

  try{
    renderPunchPageCards(filtered);
  }catch(err){
    console.warn('Punch cards render failed:',err);
    h('punchPageCards','<div class="stage-note">Punch cards could not be rendered. Check console for details.</div>');
  }

  let res={stageRows:[],typeRows:[],commentRows:[]};
  try{
    res=computeAPunchPageRows(filtered)||res;
  }catch(err){
    console.warn('Punch details render failed:',err);
    h('aStageStatusTable','<tr><td colspan="6" class="stage-note">Punch details could not be calculated. Check console for details.</td></tr>');
  }

  try{renderABalanceType(res.typeRows||[]);}catch(err){console.warn(err);h('aBalanceTypeChart','<div class="stage-note">No open A balance items.</div>');}
  try{renderAStageStatus(res.stageRows||[]);}catch(err){console.warn(err);}
  try{renderPunchCommentsList(res.commentRows||[]);}catch(err){console.warn(err);}
}



function liveDateText(v){
  if(!v)return '--';
  const d=new Date(v);
  if(isNaN(d))return String(v);
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function updateLiveStatus(state,msg){
  const el=document.getElementById('liveStatus');
  if(!el)return;
  el.classList.remove('loading','error');
  if(state)el.classList.add(state);
  const nextTxt=LIVE_NEXT_REFRESH_AT?liveDateText(LIVE_NEXT_REFRESH_AT):'--';
  const lastTxt=LIVE_LAST_REFRESH_AT?liveDateText(LIVE_LAST_REFRESH_AT):'--';
  el.innerHTML=`<div>Live Data: <b>${msg||lastTxt}</b></div><div>Delta: ${CURRENT_DELTA_LABEL||'Previous hourly update'}</div><div class="live-note">Next refresh: ${nextTxt}</div>`;
}
function syncLiveFilterUi(){
  if(typeof rebuildSidebarFilters==='function')rebuildSidebarFilters();
  applyMultiSelect(document.getElementById('fAreaGrp'),F.areaGrp||['ALL']);
  applyMultiSelect(document.getElementById('fArea'),F.area||['ALL']);
  applyMultiSelect(document.getElementById('fSys'),F.sys||['ALL']);
  applyMultiSelect(document.getElementById('fStage'),F.stage||['ALL']);
  if(typeof updateSidebarMultiDropdownLabels==='function')updateSidebarMultiDropdownLabels();
}
function snapshotsHaveDifferentData(a,b){
  if(!a||!b)return true;
  return JSON.stringify({
    tp:(a.TP||[]).length,
    pa:sum(a.PUNCH_STATS||[],x=>x.a),
    pb:sum(a.PUNCH_STATS||[],x=>x.b),
    pc:sum(a.PUNCH_STATS||[],x=>x.c),
    mon:Object.keys(a.TP_MON||{}).length,
    saved:a.remoteUpdatedAt||a.savedAt||''
  })!==JSON.stringify({
    tp:(b.TP||[]).length,
    pa:sum(b.PUNCH_STATS||[],x=>x.a),
    pb:sum(b.PUNCH_STATS||[],x=>x.b),
    pc:sum(b.PUNCH_STATS||[],x=>x.c),
    mon:Object.keys(b.TP_MON||{}).length,
    saved:b.remoteUpdatedAt||b.savedAt||''
  });
}
async function loadStoredLiveSnapshot(){
  try{return await idbGetSnapshot(LIVE_LAST_SNAPSHOT_KEY);}catch(e){return null;}
}
async function storeLiveSnapshot(snap){
  try{await idbPutSnapshot(LIVE_LAST_SNAPSHOT_KEY,snap);}catch(e){console.warn('Could not store live snapshot:',e);}
}
async function fetchAndApplyLiveData(options){
  options=options||{};
  const initial=!!options.initial;
  const automatic=!!options.automatic;
  updateLiveStatus('loading',initial?'loading...':'refreshing...');
  const before=currentDashboardSnapshot('before-live-refresh');
  const previousStored=await loadStoredLiveSnapshot();
  // V80 performance-only fast boot:
  // Show the last saved snapshot immediately, then fetch the latest data in the background.
  // This does not change any calculation logic; it only avoids a blank/slow first paint.
  if(initial && previousStored && Array.isArray(previousStored.TP) && previousStored.TP.length && !window.__CCC_V80_FAST_BOOT_APPLIED__){
    window.__CCC_V80_FAST_BOOT_APPLIED__=true;
    try{
      if(applyDashboardSnapshot(previousStored)){
        CURRENT_LIVE_SNAPSHOT=previousStored;
        LIVE_DATA_SOURCE='cached-live';
        LIVE_LAST_REFRESH_AT=previousStored.remoteUpdatedAt||previousStored.savedAt||LIVE_LAST_REFRESH_AT;
        LIVE_NEXT_REFRESH_AT=Date.now()+LIVE_REFRESH_MS;
        syncLiveFilterUi();
        refresh();
        updateLiveStatus('', LIVE_LAST_REFRESH_AT?liveDateText(LIVE_LAST_REFRESH_AT):'cached');
      }
    }catch(e){console.warn('Fast cached boot failed:',e);}
  }
  try{
    const isCachedEndpoint=/^\/api\/dashboard-data(?:$|[?#])/.test(LIVE_DATA_URL);
    const url=isCachedEndpoint?LIVE_DATA_URL:(LIVE_DATA_URL+'?v='+Date.now()+'&rnd='+Math.random().toString(36).slice(2));
    const res=await fetch(url,isCachedEndpoint?{cache:'default'}:{cache:'no-store'});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const code=await res.text();
    (0,eval)(code);

    if(typeof ensureLightTestPackRows==='function')ensureLightTestPackRows();
    try{rebuildPunchStatsFromTestPackRowsIfNeeded(true);}catch(e){console.warn('Punch rebuild after live load failed:',e);}
    if(typeof invalidateDashboardCaches==='function')invalidateDashboardCaches();
    DATA_VERSION++;

    const remoteTime=(typeof window.DASHBOARD_DATA_UPDATED_AT!=='undefined')?window.DASHBOARD_DATA_UPDATED_AT:new Date().toISOString();
    LIVE_LAST_REFRESH_AT=remoteTime;
    LIVE_NEXT_REFRESH_AT=Date.now()+LIVE_REFRESH_MS;
    LIVE_DATA_SOURCE='live';

    // Rebuild system/stage filters AFTER remote data is loaded.
    syncLiveFilterUi();

    const current=currentDashboardSnapshot('live-current');
    current.remoteUpdatedAt=remoteTime;

    // Delta baseline:
    // - On initial load: compare latest remote data with the last snapshot seen by this browser.
    // - On hourly refresh while open: compare new data with the data currently displayed before refresh.
    const baseline=automatic?before:previousStored;
    if(baseline&&Array.isArray(baseline.TP)&&baseline.TP.length&&snapshotsHaveDifferentData(baseline,current)){
      DIFF_BASE=baseline;
      try{localStorage.setItem(DASHBOARD_DIFF_KEY,JSON.stringify({
        TP:baseline.TP||[],MAT:baseline.MAT||{},MAT_ROWS:baseline.MAT_ROWS||[],
        PUNCH_STATS:baseline.PUNCH_STATS||[],PUNCH_MON:baseline.PUNCH_MON||{},PUNCH_WEK:baseline.PUNCH_WEK||{},PUNCH_EVENTS:baseline.PUNCH_EVENTS||[],
        TP_MON:baseline.TP_MON||{},TP_WEK:baseline.TP_WEK||{},
        diffSavedAt:new Date().toISOString(),diffSource:'live-hourly'
      }));}catch(e){}
    }

    CURRENT_LIVE_SNAPSHOT=current;
    await storeLiveSnapshot(current);
    await saveDashboardSnapshot('live-remote');

    refresh();
    updateLiveStatus('',liveDateText(remoteTime));
    return true;
  }catch(err){
    console.warn('Could not load live dashboard_data.js:',err);
    updateLiveStatus('error','failed - using saved copy');
    if(initial){
      await loadDashboardSnapshot();
      syncLiveFilterUi();
      refresh();
    }
    return false;
  }
}

function ymdDate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function addDays(date,days){
  const d=new Date(date); d.setDate(d.getDate()+days); return d;
}
function setupDeltaDateInput(){
  const inp=document.getElementById('deltaDate');
  if(!inp)return;
  const today=new Date();
  inp.max=ymdDate(today);
  inp.min=ymdDate(addDays(today,-30));
  if(!inp.value)inp.value=ymdDate(addDays(today,-1));
}
function onDeltaModeChanged(){
  const mode=(document.getElementById('deltaMode')||{}).value||'previous';
  const inp=document.getElementById('deltaDate');
  if(inp)inp.style.display=(mode==='date')?'inline-block':'none';
  setupDeltaDateInput();
}
function snapshotFromDataJs(code){
  const fn=new Function(code+`
    return {
      savedAt:(typeof window!=='undefined'&&window.DASHBOARD_DATA_UPDATED_AT)||new Date().toISOString(),
      remoteUpdatedAt:(typeof window!=='undefined'&&window.DASHBOARD_DATA_UPDATED_AT)||'',
      source:'history',
      TP:(typeof TP!=='undefined')?TP:[],
      MAT:(typeof MAT!=='undefined')?MAT:{},
      MAT_ROWS:(typeof MAT_ROWS!=='undefined')?MAT_ROWS:[],
      TP_SUMMARY_ROWS:(typeof TP_SUMMARY_ROWS!=='undefined')?TP_SUMMARY_ROWS:[],
      TP_SUMMARY_HEADERS:(typeof TP_SUMMARY_HEADERS!=='undefined')?TP_SUMMARY_HEADERS:[],
      TEST_PACK_ROWS:(typeof TEST_PACK_ROWS!=='undefined')?TEST_PACK_ROWS:[],
      TEST_PACK_HEADERS:(typeof TEST_PACK_HEADERS!=='undefined')?TEST_PACK_HEADERS:[],
      B_ITEM_ROWS:(typeof B_ITEM_ROWS!=='undefined')?B_ITEM_ROWS:[],
      B_ITEM_HEADERS:(typeof B_ITEM_HEADERS!=='undefined')?B_ITEM_HEADERS:[],
      PUNCH_STATS:(typeof PUNCH_STATS!=='undefined')?PUNCH_STATS:[],
      PUNCH_MON:(typeof PUNCH_MON!=='undefined')?PUNCH_MON:{},
      PUNCH_WEK:(typeof PUNCH_WEK!=='undefined')?PUNCH_WEK:{},
      PUNCH_EVENTS:(typeof PUNCH_EVENTS!=='undefined')?PUNCH_EVENTS:[],
      TP_MON:(typeof TP_MON!=='undefined')?TP_MON:{},
      TP_WEK:(typeof TP_WEK!=='undefined')?TP_WEK:{}
    };
  `);
  return fn();
}
async function loadHistorySnapshotByDate(dateText){
  const url=HISTORY_DATA_URL_BASE+'dashboard_'+dateText+'.js?v='+Date.now();
  const res=await fetch(url,{cache:'no-store'});
  if(!res.ok)throw new Error('History file not found: '+dateText+' (HTTP '+res.status+')');
  const code=await res.text();
  return snapshotFromDataJs(code);
}
async function applySelectedDeltaMode(){
  const mode=(document.getElementById('deltaMode')||{}).value||'previous';
  let dateText='';
  if(mode==='yesterday')dateText=ymdDate(addDays(new Date(),-1));
  if(mode==='7days')dateText=ymdDate(addDays(new Date(),-7));
  if(mode==='date')dateText=(document.getElementById('deltaDate')||{}).value||'';
  if(mode==='previous'){
    try{
      const stored=await loadStoredLiveSnapshot();
      if(stored&&Array.isArray(stored.TP)&&stored.TP.length){
        DIFF_BASE=stored;
      }else{
        DIFF_BASE=null;
      }
    }catch(e){DIFF_BASE=null;}
    CURRENT_DELTA_LABEL='Previous hourly update';
    refresh();
    updateLiveStatus('',LIVE_LAST_REFRESH_AT?liveDateText(LIVE_LAST_REFRESH_AT):'--');
    return;
  }
  if(!dateText){alert('Please select a valid date.');return;}
  try{
    updateLiveStatus('loading','loading history...');
    const snap=await loadHistorySnapshotByDate(dateText);
    DIFF_BASE=snap;
    CURRENT_DELTA_LABEL=dateText;
    refresh();
    updateLiveStatus('',LIVE_LAST_REFRESH_AT?liveDateText(LIVE_LAST_REFRESH_AT):'--');
  }catch(err){
    console.warn(err);
    alert('History data is not available for '+dateText+'.\\n\\nThis will work after the automation starts saving daily history files.');
    updateLiveStatus('',LIVE_LAST_REFRESH_AT?liveDateText(LIVE_LAST_REFRESH_AT):'--');
  }
}

function scheduleLiveRefresh(){
  clearInterval(LIVE_REFRESH_TIMER);
  clearInterval(LIVE_COUNTDOWN_TIMER);
  LIVE_NEXT_REFRESH_AT=Date.now()+LIVE_REFRESH_MS;
  LIVE_REFRESH_TIMER=setInterval(()=>fetchAndApplyLiveData({automatic:true}),LIVE_REFRESH_MS);
  LIVE_COUNTDOWN_TIMER=setInterval(()=>updateLiveStatus('',LIVE_LAST_REFRESH_AT?liveDateText(LIVE_LAST_REFRESH_AT):'--'),30000);
}


/* === CCC Access Portal + Employer B Item Control 20260618 - history + B table fix === */
const EMPLOYER_USERNAME='ccc';
const EMPLOYER_PASSWORD='ccc2026';
let ACCESS_MODE='';
let BITEM_CTRL_PAGE=1;
let BITEM_CTRL_FILTERED=[];
let BITEM_LOADING_PROMISE=null;

function portalShow(id){
  ['portalHome','portalLogin','dashboardApp'].forEach(x=>{
    const el=document.getElementById(x);
    if(!el)return;
    el.style.display=(x===id?(x==='dashboardApp'?'flex':'flex'):'none');
  });
}
function portalRouteFromHash(){
  const h=String(location.hash||'').replace(/^#\/?/,'').trim().toLowerCase();
  if(h==='login'||h==='dashboard'||h==='bitem')return h;
  return 'home';
}
function portalUrlFor(route){
  route=route||'home';
  return route==='home' ? (location.pathname+location.search) : '#/'+route;
}
function setPortalState(route,mode,replace){
  const state={portal:true,route:route||'home',mode:mode||''};
  const url=portalUrlFor(state.route);
  try{
    if(replace)history.replaceState(state,'',url);
    else history.pushState(state,'',url);
  }catch(e){}
  applyPortalRoute(state.route,state.mode);
}
function backToPortalHome(){setPortalState('home','',false);}
function openVisitorDashboard(){enterDashboardMode('visitor');}
function openEmployerLogin(){setPortalState('login','',false);setTimeout(()=>{const u=document.getElementById('portalUser');if(u)u.focus();},80);}
function submitEmployerLogin(e){
  if(e)e.preventDefault();
  const u=(document.getElementById('portalUser')||{}).value||'';
  const p=(document.getElementById('portalPass')||{}).value||'';
  if(u.trim().toLowerCase()===EMPLOYER_USERNAME.toLowerCase()&&p===EMPLOYER_PASSWORD){
    const err=document.getElementById('portalLoginError');if(err)err.style.display='none';
    enterDashboardMode('employer',{replace:true});
    return false;
  }
  const err=document.getElementById('portalLoginError');if(err)err.style.display='block';
  return false;
}
function enterDashboardMode(mode,opts){
  opts=opts||{};
  setPortalState('dashboard',mode||'visitor',!!opts.replace);
}
function applyAccessMode(){
  const isAdmin=ACCESS_MODE==='employer';
  document.querySelectorAll('.admin-only').forEach(el=>{el.classList.toggle('access-hidden',!isAdmin);});
}
function applyPortalRoute(route,mode){
  route=route||'home';
  if(route==='login'){
    ACCESS_MODE='';
    portalShow('portalLogin');
    applyAccessMode();
    const err=document.getElementById('portalLoginError');if(err)err.style.display='none';
    return;
  }
  if(route==='dashboard'){
    ACCESS_MODE=(mode==='employer'||mode==='visitor')?mode:'visitor';
    try{sessionStorage.setItem('cccAccessMode',ACCESS_MODE);}catch(e){}
    portalShow('dashboardApp');
    applyAccessMode();
    showEmployerView('dashboard',{fromRoute:true});
    return;
  }
  if(route==='bitem'){
    ACCESS_MODE='employer';
    try{sessionStorage.setItem('cccAccessMode','employer');}catch(e){}
    portalShow('dashboardApp');
    applyAccessMode();
    showEmployerView('bitem',{fromRoute:true});
    return;
  }
  ACCESS_MODE='';
  try{sessionStorage.removeItem('cccAccessMode');}catch(e){}
  portalShow('portalHome');
  applyAccessMode();
}
function initPortalAccess(){
  const route=portalRouteFromHash();
  let mode='';
  try{mode=sessionStorage.getItem('cccAccessMode')||'';}catch(e){}
  if(route==='bitem')mode='employer';
  if(route==='dashboard' && mode!=='employer')mode='visitor';
  if(route==='login')mode='';
  if(route==='home')mode='';
  try{history.replaceState({portal:true,route,mode},'',portalUrlFor(route));}catch(e){}
  applyPortalRoute(route,mode);
}
window.addEventListener('popstate',ev=>{
  const st=ev.state||{};
  const route=st.route||portalRouteFromHash();
  applyPortalRoute(route,st.mode||'');
});
function toggleAdminMenu(ev){if(ev)ev.stopPropagation();const m=document.getElementById('adminMenu');if(m)m.classList.toggle('open');}
function closeAdminMenu(){const m=document.getElementById('adminMenu');if(m)m.classList.remove('open');}
document.addEventListener('click',ev=>{const w=document.getElementById('adminMenuWrap');if(w&&!w.contains(ev.target))closeAdminMenu();});
function showEmployerView(view,opts){
  opts=opts||{};
  closeAdminMenu();
  const layout=document.getElementById('dashboardMainLayout');
  const bpage=document.getElementById('bItemControlPage');
  const dashOpt=document.getElementById('adminDashOption');
  const bOpt=document.getElementById('adminBItemOption');
  if(view==='bitem'&&ACCESS_MODE==='employer'){
    if(!opts.fromRoute)setPortalState('bitem','employer',false);
    if(layout)layout.style.display='none';
    if(bpage)bpage.classList.add('active');
    if(dashOpt)dashOpt.classList.remove('active');
    if(bOpt)bOpt.classList.add('active');
    renderBItemControl(true);
    if(!bItemRowsAvailable())ensureBItemRowsLoadedForControl();
  }else{
    if(!opts.fromRoute && ACCESS_MODE)setPortalState('dashboard',ACCESS_MODE,false);
    if(layout)layout.style.display='flex';
    if(bpage)bpage.classList.remove('active');
    if(dashOpt)dashOpt.classList.add('active');
    if(bOpt)bOpt.classList.remove('active');
  }
}
function bItemRowsAvailable(){return Array.isArray(B_ITEM_ROWS)&&B_ITEM_ROWS.length>0;}
function bItemNumber(v){return Number(v||0).toLocaleString();}
function setBItemControlMessage(msg){
  const head=document.getElementById('bItemControlHead');
  const body=document.getElementById('bItemControlBody');
  const cnt=document.getElementById('bItemControlCount');
  const info=document.getElementById('bItemControlPageInfo');
  if(cnt)cnt.textContent=msg;
  if(info)info.textContent='Page --';
  if(head)head.innerHTML='';
  if(body)body.innerHTML=`<tr><td>${escapeHtml(msg)}</td></tr>`;
}
async function ensureBItemRowsLoadedForControl(){
  if(bItemRowsAvailable())return true;
  if(BITEM_LOADING_PROMISE)return BITEM_LOADING_PROMISE;
  setBItemControlMessage('Loading B Item sheet from the online Excel file...');
  BITEM_LOADING_PROMISE=(async()=>{
    try{
      if(typeof updateFromRemoteExcel==='function'){
        await updateFromRemoteExcel({silent:true,auto:true});
      }
    }catch(e){
      console.warn('Could not load B Item rows from online Excel:',e);
    }finally{
      BITEM_LOADING_PROMISE=null;
    }
    renderBItemControl(true);
    return bItemRowsAvailable();
  })();
  return BITEM_LOADING_PROMISE;
}
function bItemHeadersForControl(){
  if(Array.isArray(B_ITEM_HEADERS)&&B_ITEM_HEADERS.length)return B_ITEM_HEADERS.filter(h=>String(h||'').trim()!=='');
  const r=(Array.isArray(B_ITEM_ROWS)&&B_ITEM_ROWS[0])?B_ITEM_ROWS[0]:null;
  if(!r)return [];
  if(Array.isArray(r))return r.map((_,i)=>'Column '+(i+1));
  return Object.keys(r).filter(k=>!k.startsWith('__'));
}
function bItemRawValue(row,header,idx){
  if(Array.isArray(row))return row[idx];
  if(!row)return '';
  if(Object.prototype.hasOwnProperty.call(row,header))return row[header];
  const key=normHeaderKey(header);
  for(const k of Object.keys(row)){if(normHeaderKey(k)===key)return row[k];}
  return '';
}
function bItemDisplayValue(v,header){
  if(v===null||v===undefined)return '';
  const h=String(header||'').toLowerCase();
  if(h.includes('date')||h.includes('cleared')){
    const d=excelDateToISO(v);
    if(d)return d.split('-').reverse().join('/');
  }
  return clean(v);
}
function bItemTpFromRow(row){
  return clean(bItemRawValue(row,'TP NUMBER',0)||bItemRawValue(row,'TP Number',0)||bItemRawValue(row,'TestPackNo',0)||bItemRawValue(row,'Test Pack No',0));
}
function bItemContractorFromTp(tp){
  const t=clean(tp).toUpperCase();
  try{
    const rec=(Array.isArray(TP)?TP:[]).find(x=>clean(x&&x.tp).toUpperCase()===t);
    const c=clean(rec&&(rec.con||rec.contractor));
    if(/JGC/i.test(c))return 'JGC';
    if(/CCC/i.test(c))return 'CCC';
  }catch(e){}
  return 'CCC';
}
function bItemPreviewSeqForRow(row){
  const rows=Array.isArray(B_ITEM_ROWS)?B_ITEM_ROWS:[];
  const tp=bItemTpFromRow(row).toUpperCase();
  let seq=0;
  for(let i=0;i<rows.length;i++){
    if(bItemTpFromRow(rows[i]).toUpperCase()===tp)seq++;
    if(rows[i]===row)return seq;
  }
  return Math.max(1,seq||1);
}
function bItemPreviewId(row){
  const tp=bItemTpFromRow(row)||'UNKNOWN-TP';
  const contractor=bItemContractorFromTp(tp);
  const seq=String(bItemPreviewSeqForRow(row)).padStart(3,'0');
  return `${contractor}-B-${tp}-C${seq}`;
}
function bItemPreviewFingerprint(row){
  const parts=['TP NUMBER','Construction Stage','Date','Area','ISO No.','Sheet No.','Punch Category (A/B/C)','Material TYPE','Comments'].map((h,i)=>bItemDisplayValue(bItemRawValue(row,h,i),h).toUpperCase().replace(/\s+/g,' ').trim());
  return parts.join('|');
}
function bItemSetRawValue(row,header,value){
  if(!row)return;
  if(Array.isArray(row)){
    const hs=bItemHeadersForControl();
    let idx=hs.findIndex(h=>normHeaderKey(h)===normHeaderKey(header));
    if(idx>=0)row[idx]=value;
    return;
  }
  for(const k of Object.keys(row)){
    if(normHeaderKey(k)===normHeaderKey(header)){row[k]=value;return;}
  }
  row[header]=value;
}
function bItemRawIndex(row){
  const rows=Array.isArray(B_ITEM_ROWS)?B_ITEM_ROWS:[];
  const idx=rows.indexOf(row);
  if(idx>=0)return idx;
  const fp=bItemPreviewFingerprint(row);
  return rows.findIndex(r=>bItemPreviewFingerprint(r)===fp);
}
window.bitemPreviewEdit=function(rawIndex){
  const rows=Array.isArray(B_ITEM_ROWS)?B_ITEM_ROWS:[];
  const row=rows[rawIndex];
  if(!row){alert('B Item row was not found.');return;}
  const id=bItemPreviewId(row);
  const oldVal=bItemDisplayValue(bItemRawValue(row,'Punch Cleared',9),'Punch Cleared');
  const d=prompt('Preview Edit for '+id+'\n\nEnter Punch Cleared date (DD/MM/YYYY or YYYY-MM-DD):',oldVal||'');
  if(d===null)return;
  bItemSetRawValue(row,'Punch Cleared',d);
  if(typeof renderBItemControl==='function')renderBItemControl(false);
  if(typeof refresh==='function')refresh(true);
  alert('Preview updated on this browser only. Live save for all users will work after Cloudflare Functions + D1 are connected.');
};
function bItemFilteredRows(headers){
  const rows=Array.isArray(B_ITEM_ROWS)?B_ITEM_ROWS:[];
  const q=clean((document.getElementById('bItemControlSearch')||{}).value).toUpperCase();
  if(!q)return rows;
  return rows.filter(r=>headers.some((h,i)=>bItemDisplayValue(bItemRawValue(r,h,i),h).toUpperCase().includes(q)));
}
function renderBItemControl(resetPage){
  const head=document.getElementById('bItemControlHead');
  const body=document.getElementById('bItemControlBody');
  const cnt=document.getElementById('bItemControlCount');
  const info=document.getElementById('bItemControlPageInfo');
  if(!head||!body)return;
  const headers=bItemHeadersForControl();
  if(resetPage)BITEM_CTRL_PAGE=1;
  BITEM_CTRL_FILTERED=bItemFilteredRows(headers);
  const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
  const total=BITEM_CTRL_FILTERED.length;
  const pages=Math.max(1,Math.ceil(total/size));
  BITEM_CTRL_PAGE=Math.min(Math.max(1,BITEM_CTRL_PAGE),pages);
  if(cnt)cnt.textContent=`B Items: ${bItemNumber(total)} / Source Rows: ${bItemNumber((B_ITEM_ROWS||[]).length)}`;
  if(info)info.textContent=`Page ${BITEM_CTRL_PAGE} of ${pages}`;
  const displayHeaders=['Action','B Item ID'].concat(headers);
  head.innerHTML='<tr>'+displayHeaders.map((h,i)=>`<th class="${i===0?'bitem-action-col':(i===1?'bitem-id-col':'')}">${escapeHtml(h)}</th>`).join('')+'</tr>';
  const start=(BITEM_CTRL_PAGE-1)*size;
  const pageRows=BITEM_CTRL_FILTERED.slice(start,start+size);
  if(!headers.length||!pageRows.length){
    const msg=bItemRowsAvailable()?'No rows match the current search.':'No B Item rows found yet. The table will appear after dashboard_data.js is regenerated with B_ITEM_ROWS, or after the online Excel fallback finishes loading.';
    body.innerHTML=`<tr><td colspan="${Math.max(1,displayHeaders.length)}">${escapeHtml(msg)}</td></tr>`;
    return;
  }
  body.innerHTML=pageRows.map(r=>{
    const rawIdx=bItemRawIndex(r);
    const id=bItemPreviewId(r);
    const action=`<td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemPreviewEdit(${rawIdx})">✏️ Edit</button></td><td class="bitem-id-col" title="${escapeHtml(id)}">${escapeHtml(id)}</td>`;
    return '<tr>'+action+headers.map((h,i)=>{
      const val=bItemDisplayValue(bItemRawValue(r,h,i),h);
      return `<td title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
    }).join('')+'</tr>';
  }).join('');
}
function bItemPageMove(delta){BITEM_CTRL_PAGE+=(delta||0);renderBItemControl(false);}
function exportBItemControlTable(){
  const headers=bItemHeadersForControl();
  const exportHeaders=['B Item ID'].concat(headers);
  const rows=(BITEM_CTRL_FILTERED&&BITEM_CTRL_FILTERED.length?BITEM_CTRL_FILTERED:bItemFilteredRows(headers)).map(r=>[bItemPreviewId(r)].concat(headers.map((h,i)=>bItemDisplayValue(bItemRawValue(r,h,i),h))));
  const d=new Date();
  const stamp=`${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  exportRowsToWorkbook('B Item Control',exportHeaders,rows,`B_Item_Control_${stamp}.xlsx`);
}
const __cccRefresh=refresh;
refresh=function(immediate){
  const out=__cccRefresh(immediate);
  const bpage=document.getElementById('bItemControlPage');
  if(bpage&&bpage.classList.contains('active'))setTimeout(()=>renderBItemControl(false),0);
  return out;
};

async function bootDashboard(){
  updateTodayDate();
  applySavedTheme();
  await loadUpdateDiffBaseline();
  setupDeltaDateInput();
  onDeltaModeChanged();
  await fetchAndApplyLiveData({initial:true});
  scheduleLiveRefresh();
}
initPortalAccess();
bootDashboard();

;

/* B Item Tracking System client patch - include after the main dashboard script. */
(function(){
  const API = {
    tokenKey: 'ccc_bitem_auth_token',
    userKey: 'ccc_bitem_auth_user',
    stateRows: [],
    stateKpi: null,
    syncing: false
  };

  function clean(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function norm(v){return clean(v).toUpperCase();}
  function token(){try{return localStorage.getItem(API.tokenKey)||'';}catch(e){return '';}}
  function user(){try{return JSON.parse(localStorage.getItem(API.userKey)||'null');}catch(e){return null;}}
  function setAuth(t,u){try{localStorage.setItem(API.tokenKey,t);localStorage.setItem(API.userKey,JSON.stringify(u||{}));}catch(e){}}
  function clearAuth(){try{localStorage.removeItem(API.tokenKey);localStorage.removeItem(API.userKey);}catch(e){}}
  async function api(path, opts){
    opts=opts||{}; opts.headers=opts.headers||{};
    opts.headers['content-type']='application/json';
    const t=token(); if(t)opts.headers['authorization']='Bearer '+t;
    const res=await fetch(path,opts);
    const data=await res.json().catch(()=>({ok:false,error:'Bad JSON response'}));
    if(!res.ok||data.ok===false)throw new Error(data.error||('HTTP '+res.status));
    return data;
  }
  function val(row,names){
    if(!row)return '';
    for(const n of names){if(row[n]!=null&&clean(row[n])!=='')return row[n];}
    const keys=Object.keys(row||{});
    for(const n of names){
      const nn=norm(n).replace(/[^A-Z0-9]/g,'');
      const k=keys.find(x=>norm(x).replace(/[^A-Z0-9]/g,'')===nn);
      if(k&&row[k]!=null&&clean(row[k])!=='')return row[k];
    }
    return '';
  }
  function rowTP(row){return clean(val(row,['TP NUMBER','TestPackNo','Test Pack No','TP No']));}
  function toISO(v){
    if(!v)return '';
    if(typeof excelDateToISO==='function'){
      const x=excelDateToISO(v); if(x)return x;
    }
    if(typeof v==='number'){
      const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.toISOString().slice(0,10);
    }
    const s=clean(v); let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
    if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}
    const d=new Date(s);return isNaN(d.getTime())?s:d.toISOString().slice(0,10);
  }
  function buildTpStatusByTP(){
    const map={};
    const rows=Array.isArray(window.TP_SUMMARY_ROWS)&&window.TP_SUMMARY_ROWS.length?window.TP_SUMMARY_ROWS:(Array.isArray(window.TP)?window.TP:[]);
    for(const r of rows){
      const tp=norm(rowTP(r)); if(!tp)continue;
      map[tp]={
        CNS_PUNCH_B_CLEARED: toISO(val(r,['CNS Punch B Cleared'])),
        QC_PUNCH_LIST_RETURN: toISO(val(r,['QC Punch List Return'])),
        QC_REINSTATEMENT_SIGN: toISO(val(r,['QC Reinstatement Sign']))
      };
    }
    return map;
  }
  function rowsForSync(){return Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:[];}

  async function bitemRunFullSync(){
    const rows=rowsForSync();
    if(!rows.length)throw new Error('No B_ITEM_ROWS found. Regenerate dashboard_data.js first.');
    const syncId='SYNC-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
    const size=400;
    API.syncing=true;
    for(let i=0;i<rows.length;i+=size){
      const chunk=rows.slice(i,i+size);
      await api('/api/bitem/sync',{method:'POST',body:JSON.stringify({
        syncId,
        rows:chunk,
        tpStatusByTP:buildTpStatusByTP(),
        isFirst:i===0,
        isLast:i+size>=rows.length,
        totalRows:rows.length
      })});
    }
    API.syncing=false;
    await bitemLoadSystemState(true);
    return syncId;
  }

  function applyStateToDashboardRows(){
    const active=API.stateRows.filter(r=>Number(r.active)!==0);
    if(!active.length)return;
    const out=[];
    for(const rec of active){
      let row={};
      try{row=rec.row_json?JSON.parse(rec.row_json):{};}catch(e){row={};}
      row['System B Item ID']=rec.bitem_id;
      row['System Final Status']=rec.final_status;
      row['System Source Flag']=rec.source_flag;
      row['System Sync Note']=rec.sync_note;
      if(rec.final_status==='CLEARED'&&rec.final_cleared_date){
        row['Punch Cleared']=rec.final_cleared_date;
      }
      out.push(row);
    }
    window.B_ITEM_ROWS=out;
    if(Array.isArray(window.B_ITEM_HEADERS)){
      ['System B Item ID','System Final Status','System Source Flag','System Sync Note'].forEach(h=>{if(!window.B_ITEM_HEADERS.includes(h))window.B_ITEM_HEADERS.push(h);});
    }
  }

  async function bitemLoadSystemState(applyToDashboard){
    const q=clean((document.getElementById('bItemControlSearch')||{}).value||'');
    const data=await api('/api/bitem/state?include_removed=1&limit=50000&q='+encodeURIComponent(q),{method:'GET'});
    API.stateRows=data.rows||[];
    API.stateKpi=data.kpi||null;
    if(applyToDashboard){
      applyStateToDashboardRows();
      if(typeof refresh==='function')setTimeout(()=>refresh(true),0);
    }
    return data;
  }

  async function bitemEdit(bitemId,fingerprint){
    const d=prompt('Enter Punch Cleared date as YYYY-MM-DD. Leave blank to remove manual cleared date:');
    if(d===null)return;
    const remarks=prompt('Remarks / note for admin monitoring:', '') || '';
    await api('/api/bitem/edit',{method:'POST',body:JSON.stringify({bitem_id:bitemId,fingerprint,punch_cleared:d,remarks})});
    await bitemLoadSystemState(true);
    if(typeof renderBItemControl==='function')renderBItemControl(true);
    alert('Saved. B Item final status and dashboard calculations were refreshed from the system layer.');
  }

  function ensureAdminMonitoringPage(){
    if(document.getElementById('bItemMonitoringPage'))return;
    const app=document.getElementById('dashboardApp')||document.body;
    const page=document.createElement('div');
    page.id='bItemMonitoringPage';
    page.className='bitem-control-page';
    page.innerHTML=`
      <div class="bitem-head">
        <div><div class="bitem-title">B Item Monitoring</div><div class="bitem-sub">Admin audit view showing user edits, sync conflicts, new/removed comments, and status changes.</div></div>
        <div class="bitem-tools"><input id="bItemLogSearch" class="bitem-search" placeholder="Search logs..."><button class="action-btn" type="button" id="bItemLogRefresh">↻ Refresh</button><button class="action-btn" type="button" onclick="showEmployerView('dashboard')">↩ Dashboard</button></div>
      </div>
      <div class="bitem-table-card"><div class="tbl-toolbar"><div class="tbl-count" id="bItemLogCount">Logs: --</div><div class="table-note-fast">Monitoring only. No approval required.</div></div><div class="bitem-table-wrap"><table class="bitem-table"><thead><tr><th>Time</th><th>Action</th><th>B Item ID</th><th>User</th><th>Details</th></tr></thead><tbody id="bItemLogBody"></tbody></table></div></div>`;
    app.appendChild(page);
    page.querySelector('#bItemLogRefresh').onclick=renderBItemMonitoring;
    page.querySelector('#bItemLogSearch').oninput=()=>renderBItemMonitoring();
    const menu=document.getElementById('adminMenu');
    if(menu&&!document.getElementById('adminMonitorOption')){
      const btn=document.createElement('button');btn.type='button';btn.id='adminMonitorOption';btn.textContent='🕵️ B Item Monitoring';btn.onclick=()=>showEmployerView('monitoring');menu.appendChild(btn);
    }
  }

  async function renderBItemMonitoring(){
    const body=document.getElementById('bItemLogBody');const cnt=document.getElementById('bItemLogCount');if(!body)return;
    body.innerHTML='<tr><td colspan="5">Loading...</td></tr>';
    try{
      const q=clean((document.getElementById('bItemLogSearch')||{}).value||'');
      const data=await api('/api/bitem/logs?limit=500&q='+encodeURIComponent(q),{method:'GET'});
      const rows=data.rows||[]; if(cnt)cnt.textContent='Logs: '+rows.length;
      body.innerHTML=rows.map(r=>`<tr><td>${clean(r.created_at)}</td><td>${clean(r.action)}</td><td>${clean(r.bitem_id)}</td><td>${clean(r.display_name||r.username)}</td><td>${clean(r.details)}</td></tr>`).join('')||'<tr><td colspan="5">No logs yet.</td></tr>';
    }catch(e){body.innerHTML=`<tr><td colspan="5">${clean(e.message)}</td></tr>`;}
  }

  const oldSubmit=window.submitEmployerLogin;
  window.submitEmployerLogin=async function(e){
    if(e)e.preventDefault();
    const username=clean((document.getElementById('portalUser')||{}).value||'');
    const password=clean((document.getElementById('portalPass')||{}).value||'');
    try{
      const data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      setAuth(data.token,data.user);
      const err=document.getElementById('portalLoginError');if(err)err.style.display='none';
      if(typeof enterDashboardMode==='function')enterDashboardMode('employer',{replace:true});
      setTimeout(async()=>{try{await bitemRunFullSync();}catch(x){console.warn('B Item sync warning:',x.message);}},600);
      return false;
    }catch(err){
      console.warn('API login failed:',err.message);
      if(oldSubmit)return oldSubmit(e);
      const el=document.getElementById('portalLoginError');if(el){el.textContent=err.message;el.style.display='block';}
      return false;
    }
  };

  const oldShow=window.showEmployerView;
  window.showEmployerView=function(view,opts){
    ensureAdminMonitoringPage();
    const mon=document.getElementById('bItemMonitoringPage');
    const layout=document.getElementById('dashboardMainLayout');
    const bpage=document.getElementById('bItemControlPage');
    if(view==='monitoring'){
      if(layout)layout.style.display='none'; if(bpage)bpage.classList.remove('active'); if(mon)mon.classList.add('active');
      renderBItemMonitoring();return;
    }
    if(mon)mon.classList.remove('active');
    return oldShow?oldShow(view,opts):undefined;
  };

  const oldRender=window.renderBItemControl;
  window.renderBItemControl=async function(resetPage){
    try{await bitemLoadSystemState(false);}catch(e){console.warn('B Item state not available:',e.message);}
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), cnt=document.getElementById('bItemControlCount'), info=document.getElementById('bItemControlPageInfo');
    if(!head||!body)return oldRender?oldRender(resetPage):undefined;
    if(!API.stateRows.length)return oldRender?oldRender(resetPage):undefined;
    if(resetPage)window.BITEM_CTRL_PAGE=1;
    const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
    const total=API.stateRows.length; const pages=Math.max(1,Math.ceil(total/size));
    window.BITEM_CTRL_PAGE=Math.min(Math.max(1,window.BITEM_CTRL_PAGE||1),pages);
    if(cnt)cnt.textContent=`B Items: ${total} | Active: ${(API.stateKpi||{}).active_total||0} | Removed: ${(API.stateKpi||{}).removed_total||0}`;
    if(info)info.textContent=`Page ${window.BITEM_CTRL_PAGE} of ${pages}`;
    const headers=['Action','B Item ID','TP Number','Contractor','Stage','Comment','FMS / CCC Excel Sheet Status','Final Status','Punch Cleared','User Cleared','Source Flag','Sync Note','Last Edited By','Last Edited At'];
    head.innerHTML='<tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr>';
    const start=(window.BITEM_CTRL_PAGE-1)*size;
    const rows=API.stateRows.slice(start,start+size);
    body.innerHTML=rows.map(r=>{
      const red=Number(r.active)===0||r.source_flag==='REMOVED_FROM_EXCEL';
      return `<tr class="${red?'warn-row':''}"><td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemEdit('${r.bitem_id}','${r.fingerprint}')">✏️ Edit</button></td><td class="bitem-id-col">${clean(r.bitem_id)}</td><td>${clean(r.tp_no)}</td><td>${clean(r.contractor)}</td><td>${clean(r.construction_stage)}</td><td title="${clean(r.comment_text)}">${clean(r.comment_text)}</td><td>${clean(r.query_status)}</td><td>${clean(r.final_status)}</td><td>${clean(r.final_cleared_date)}</td><td>${clean(r.user_cleared_date)}</td><td>${clean(r.source_flag)}</td><td>${clean(r.sync_note)}</td><td>${clean(r.last_edited_by)}</td><td>${clean(r.last_edited_at)}</td></tr>`;
    }).join('')||'<tr><td colspan="14">No B Item records in system yet. Login as employer and run sync.</td></tr>';
  };

  const oldPageMove=window.bItemPageMove;
  window.bItemPageMove=function(delta){window.BITEM_CTRL_PAGE=(window.BITEM_CTRL_PAGE||1)+(delta||0);return window.renderBItemControl(false);};

  window.bitemRunFullSync=bitemRunFullSync;
  window.bitemLoadSystemState=bitemLoadSystemState;
  window.bitemEdit=bitemEdit;
  window.bitemSystemAPI=API;

  setInterval(()=>{bitemLoadSystemState(true).catch(()=>{});},15000);
  document.addEventListener('DOMContentLoaded',ensureAdminMonitoringPage);
})();


;

/* === UI v2 patch: inline B Item edit + header/sidebar cleanup === */
(function(){
  function esc(v){return (window.escapeHtml?window.escapeHtml(v):String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])));}
  function c(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function n(v){return c(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function enc(v){return encodeURIComponent(String(v??''));}
  function dec(v){try{return decodeURIComponent(String(v??''));}catch(e){return String(v??'');}}
  function toIsoDate(v){
    v=c(v); if(!v)return '';
    let m=v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m=v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    const d=new Date(v); if(!isNaN(d))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return '';
  }
  function isoToDisplay(v){v=c(v); if(!v)return ''; const iso=toIsoDate(v); if(!iso)return v; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`;}
  function currentAuthToken(){try{return localStorage.getItem('ccc_bitem_auth_token')||'';}catch(e){return '';}}
  async function bitemApi(path, body){
    const headers={'content-type':'application/json'}; const t=currentAuthToken(); if(t)headers.authorization='Bearer '+t;
    const res=await fetch(path,{method:'POST',headers,body:JSON.stringify(body||{})});
    const data=await res.json().catch(()=>({ok:false,error:'Bad JSON response'}));
    if(!res.ok||data.ok===false)throw new Error(data.error||('HTTP '+res.status));
    return data;
  }
  function setupRequestedUI(){
    const date=document.getElementById('todayDate'); if(date)date.remove();
    const dl=document.getElementById('downloadHtmlBtn'); if(dl)dl.remove();
    const live=document.getElementById('liveStatus');
    if(live&&!document.getElementById('topUserTools')){
      const tools=document.createElement('div');
      tools.id='topUserTools'; tools.className='top-user-tools admin-only';
      tools.innerHTML=`
        <button class="top-icon-btn" type="button" title="Notifications" onclick="window.showTopNotificationDemo()">🔔</button>
        <button class="top-icon-btn" type="button" title="Messages" onclick="window.showTopMessageDemo()">✉️</button>
        <div class="top-profile-wrap">
          <button class="top-icon-btn" type="button" title="Profile" onclick="window.toggleTopProfileMenu(event)">👤</button>
          <div class="profile-menu" id="topProfileMenu">
            <div class="profile-menu-title">CCC Employer Profile</div>
            <div class="profile-menu-sub" id="topProfileUser">Logged in user</div>
            <button type="button" onclick="window.profileChangePasswordDemo()">🔐 Change Password</button>
            <button type="button" onclick="window.employerLogout()">↩ Logout</button>
          </div>
        </div>`;
      live.parentNode.insertBefore(tools,live);
    }
    const wrap=document.getElementById('adminMenuWrap');
    const sidebar=document.querySelector('.sidebar');
    if(wrap&&sidebar&&!document.getElementById('sidebarMenuHost')){
      wrap.classList.add('sidebar-menu-wrap');
      const btn=wrap.querySelector('.hamburger-btn');
      if(btn&&!wrap.querySelector('.menu-text')){
        const sp=document.createElement('span'); sp.className='menu-text'; sp.textContent='Menu'; btn.insertAdjacentElement('afterend',sp);
      }
      const menu=document.getElementById('adminMenu');
      if(menu&&!document.getElementById('adminMonitoringOption')){
        const b=document.createElement('button');
        b.type='button'; b.id='adminMonitoringOption'; b.onclick=function(){showEmployerView('monitoring')}; b.textContent='🧭 B Item Monitoring';
        menu.appendChild(b);
      }
      const host=document.createElement('div'); host.id='sidebarMenuHost'; host.className='sidebar-menu-host admin-only';
      host.innerHTML='<div class="sidebar-menu-caption">Navigation</div>';
      host.appendChild(wrap);
      sidebar.insertBefore(host,sidebar.firstChild);
    }
    const note=document.querySelector('#portalHome .portal-note');
    if(note){note.classList.add('portal-slogan'); note.textContent='TOGETHER, BUILDING A SMARTER FUTURE. | ONE TEAM. ONE GOAL. ONE CCC';}
  }
  window.toggleTopProfileMenu=function(ev){
    if(ev)ev.stopPropagation();
    const m=document.getElementById('topProfileMenu'); if(!m)return;
    const u=c((document.getElementById('portalUser')||{}).value||'CCC Employer');
    const sub=document.getElementById('topProfileUser'); if(sub)sub.textContent='Logged in as: '+u;
    m.classList.toggle('open');
  };
  window.showTopNotificationDemo=function(){alert('Notifications panel will be connected with the B Item monitoring alerts after the backend is enabled.');};
  window.showTopMessageDemo=function(){alert('Messages panel will be connected after the backend/user system is enabled.');};
  window.profileChangePasswordDemo=function(){alert('Change password screen will be connected after the backend/user system is enabled.');};
  window.employerLogout=function(){
    try{localStorage.removeItem('ccc_bitem_auth_token');localStorage.removeItem('ccc_bitem_auth_user');}catch(e){}
    const m=document.getElementById('topProfileMenu'); if(m)m.classList.remove('open');
    if(typeof backToPortalHome==='function')backToPortalHome();
  };
  document.addEventListener('click',function(){const m=document.getElementById('topProfileMenu');if(m)m.classList.remove('open');});

  function makeInlineEditor(cell, iso, onSave){
    if(!cell)return;
    cell.classList.add('bitem-cell-editing');
    cell.innerHTML=`<div class="bitem-inline-edit"><input class="bitem-inline-input" type="date" value="${esc(iso||'')}"><button class="bitem-save-btn" type="button" title="Save">✓</button><button class="bitem-cancel-btn" type="button" title="Cancel">×</button></div>`;
    const inp=cell.querySelector('input'); const save=cell.querySelector('.bitem-save-btn'); const cancel=cell.querySelector('.bitem-cancel-btn');
    if(inp)inp.focus();
    if(save)save.onclick=()=>onSave((inp&&inp.value)||'');
    if(cancel)cancel.onclick=()=>{if(typeof renderBItemControl==='function')renderBItemControl(false);};
  }
  window.bitemStartRawClearedEdit=function(rawIndex){
    const rows=Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:[];
    const row=rows[Number(rawIndex)]; if(!row)return;
    const cell=document.querySelector(`[data-bitem-raw-cleared="${Number(rawIndex)}"]`);
    const oldVal=(typeof bItemRawValue==='function')?bItemRawValue(row,'Punch Cleared',9):'';
    makeInlineEditor(cell,toIsoDate(oldVal),function(iso){
      const display=iso?isoToDisplay(iso):'';
      if(typeof bItemSetRawValue==='function')bItemSetRawValue(row,'Punch Cleared',display);
      if(typeof renderBItemControl==='function')renderBItemControl(false);
      if(typeof refresh==='function')refresh(true);
    });
  };
  window.bitemStartSystemClearedEdit=function(eid,efp,eold){
    const id=dec(eid), fp=dec(efp), oldVal=dec(eold);
    const cell=document.querySelector(`[data-bitem-system-cleared="${CSS.escape(id)}"]`);
    makeInlineEditor(cell,toIsoDate(oldVal),async function(iso){
      try{
        await bitemApi('/api/bitem/edit',{bitem_id:id,fingerprint:fp,punch_cleared:iso,remarks:'Inline Punch Cleared update'});
        if(typeof window.bitemLoadSystemState==='function')await window.bitemLoadSystemState(true);
        if(typeof renderBItemControl==='function')renderBItemControl(false);
      }catch(e){
        alert('Live save is not available yet because Cloudflare Functions + D1 are not connected. Error: '+(e&&e.message?e.message:e));
        if(typeof renderBItemControl==='function')renderBItemControl(false);
      }
    });
  };
  window.bitemPreviewEdit=function(rawIndex){window.bitemStartRawClearedEdit(rawIndex);};
  window.bitemEdit=function(id,fp){window.bitemStartSystemClearedEdit(enc(id),enc(fp),'');};

  async function renderRawBItemTable(resetPage){
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), cnt=document.getElementById('bItemControlCount'), info=document.getElementById('bItemControlPageInfo');
    if(!head||!body)return;
    const headers=(typeof bItemHeadersForControl==='function')?bItemHeadersForControl():[];
    if(resetPage)window.BITEM_CTRL_PAGE=1;
    const q=c((document.getElementById('bItemControlSearch')||{}).value).toUpperCase();
    const rows=Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:[];
    const filtered=!q?rows:rows.filter(r=>headers.some((h,i)=>String((typeof bItemDisplayValue==='function')?bItemDisplayValue(bItemRawValue(r,h,i),h):(bItemRawValue(r,h,i)||'')).toUpperCase().includes(q)));
    window.BITEM_CTRL_FILTERED=filtered;
    const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
    const total=filtered.length, pages=Math.max(1,Math.ceil(total/size));
    window.BITEM_CTRL_PAGE=Math.min(Math.max(1,window.BITEM_CTRL_PAGE||1),pages);
    if(cnt)cnt.textContent=`B Items: ${total.toLocaleString()} / Source Rows: ${rows.length.toLocaleString()}`;
    if(info)info.textContent=`Page ${window.BITEM_CTRL_PAGE} of ${pages}`;
    const displayHeaders=['Action','B Item ID'].concat(headers);
    head.innerHTML='<tr>'+displayHeaders.map((h,i)=>`<th class="${i===0?'bitem-action-col':(i===1?'bitem-id-col':'')}">${esc(h)}</th>`).join('')+'</tr>';
    const start=(window.BITEM_CTRL_PAGE-1)*size; const pageRows=filtered.slice(start,start+size);
    if(!headers.length||!pageRows.length){body.innerHTML=`<tr><td colspan="${Math.max(1,displayHeaders.length)}">${rows.length?'No rows match the current search.':'No B Item rows found yet.'}</td></tr>`;return;}
    body.innerHTML=pageRows.map(r=>{
      const rawIdx=(typeof bItemRawIndex==='function')?bItemRawIndex(r):rows.indexOf(r);
      const id=(typeof bItemPreviewId==='function')?bItemPreviewId(r):('B-ITEM-'+String(rawIdx+1).padStart(5,'0'));
      const action=`<td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemStartRawClearedEdit(${rawIdx})">✏️ Edit</button></td><td class="bitem-id-col" title="${esc(id)}">${esc(id)}</td>`;
      return '<tr>'+action+headers.map((h,i)=>{
        const val=(typeof bItemDisplayValue==='function')?bItemDisplayValue(bItemRawValue(r,h,i),h):(bItemRawValue(r,h,i)||'');
        const isCleared=n(h)==='PUNCHCLEARED';
        return `<td class="${isCleared?'bitem-cleared-cell':''}" ${isCleared?`data-bitem-raw-cleared="${rawIdx}"`:''} title="${esc(val)}">${esc(val)}</td>`;
      }).join('')+'</tr>';
    }).join('');
  }

  window.renderBItemControl=async function(resetPage){
    try{if(typeof window.bitemLoadSystemState==='function')await window.bitemLoadSystemState(false);}catch(e){}
    const API=window.bitemSystemAPI;
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), cnt=document.getElementById('bItemControlCount'), info=document.getElementById('bItemControlPageInfo');
    if(!head||!body)return;
    if(!API||!Array.isArray(API.stateRows)||!API.stateRows.length){return renderRawBItemTable(resetPage);}
    if(resetPage)window.BITEM_CTRL_PAGE=1;
    const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
    const total=API.stateRows.length, pages=Math.max(1,Math.ceil(total/size));
    window.BITEM_CTRL_PAGE=Math.min(Math.max(1,window.BITEM_CTRL_PAGE||1),pages);
    if(cnt)cnt.textContent=`B Items: ${total.toLocaleString()} | Active: ${((API.stateKpi||{}).active_total||0).toLocaleString()} | Removed: ${((API.stateKpi||{}).removed_total||0).toLocaleString()}`;
    if(info)info.textContent=`Page ${window.BITEM_CTRL_PAGE} of ${pages}`;
    const headers=['Action','B Item ID','TP Number','Contractor','Stage','Comment','FMS / CCC Excel Sheet Status','Final Status','Punch Cleared','User Cleared','Source Flag','Sync Note','Last Edited By','Last Edited At'];
    head.innerHTML='<tr>'+headers.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr>';
    const start=(window.BITEM_CTRL_PAGE-1)*size;
    const rows=API.stateRows.slice(start,start+size);
    body.innerHTML=rows.map(r=>{
      const red=Number(r.active)===0||r.source_flag==='REMOVED_FROM_EXCEL';
      const id=c(r.bitem_id), fp=c(r.fingerprint), old=c(r.final_cleared_date||r.user_cleared_date||'');
      return `<tr class="${red?'warn-row':''}"><td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemStartSystemClearedEdit('${enc(id)}','${enc(fp)}','${enc(old)}')">✏️ Edit</button></td><td class="bitem-id-col">${esc(id)}</td><td>${esc(r.tp_no)}</td><td>${esc(r.contractor)}</td><td>${esc(r.construction_stage)}</td><td title="${esc(r.comment_text)}">${esc(r.comment_text)}</td><td>${esc(r.query_status)}</td><td>${esc(r.final_status)}</td><td class="bitem-cleared-cell" data-bitem-system-cleared="${esc(id)}">${esc(r.final_cleared_date)}</td><td>${esc(r.user_cleared_date)}</td><td>${esc(r.source_flag)}</td><td>${esc(r.sync_note)}</td><td>${esc(r.last_edited_by)}</td><td>${esc(r.last_edited_at)}</td></tr>`;
    }).join('')||'<tr><td colspan="14">No B Item records in system yet.</td></tr>';
  };
  window.bItemPageMove=function(delta){window.BITEM_CTRL_PAGE=(window.BITEM_CTRL_PAGE||1)+(delta||0);return window.renderBItemControl(false);};
  window.exportBItemControlTable=window.exportBItemControlTable||function(){alert('Export will use the current B Item Control table.');};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupRequestedUI);else setupRequestedUI();
  setTimeout(setupRequestedUI,500);
})();

;

(function(){
  function c(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function isBlankLike(v){const s=c(v).toUpperCase();return !s||s==='(BLANK)'||s==='BLANK'||s==='-'||s==='--'||s==='NULL'||s==='N/A'||s==='NA'||s==='UNDEFINED';}
  function esc(v){return (window.escapeHtml?window.escapeHtml(v):String(v??'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])));}
  function enc(v){return encodeURIComponent(String(v??''));}
  function statusText(v){const s=c(v).replace(/QUERY/gi,'FMS').replace(/EXCEL/gi,'FMS'); return s.toUpperCase()==='OPEN'?'NOT CLEARED':s;}
  function noteText(v){
    return c(v)
      .replace(/query/gi,'FMS')
      .replace(/latest source/gi,'latest FMS')
      .replace(/Excel/gi,'FMS');
  }
  function flagText(v){
    const x=c(v);
    const map={
      NEW_FROM_EXCEL:'NEW_FROM_FMS',
      REMOVED_FROM_EXCEL:'REMOVED_FROM_FMS',
      SAME_CLOSED:'SAME_CLOSED',
      SAME_OPEN:'SAME_OPEN',
      USER_CLOSED_QUERY_OPEN:'USER_CLOSED_FMS_OPEN',
      SYSTEM_CLOSED_QUERY_OPEN:'SYSTEM_CLOSED_FMS_OPEN',
      QUERY_CLOSED_SYSTEM_OPEN:'FMS_CLOSED_SYSTEM_OPEN'
    };
    return map[x]||x.replace(/QUERY/gi,'FMS').replace(/EXCEL/gi,'FMS');
  }
  function isEmployer(){try{return (typeof ACCESS_MODE!=='undefined'&&ACCESS_MODE==='employer') || sessionStorage.getItem('cccAccessMode')==='employer';}catch(e){return false;}}

  function ensureGlobalMenu(){
    let gm=document.getElementById('globalEmployerMenu');
    if(!gm){
      const app=document.getElementById('dashboardApp')||document.body;
      gm=document.createElement('div');
      gm.id='globalEmployerMenu';
      gm.className='admin-only access-hidden';
      gm.innerHTML=`
        <div class="global-menu-caption">Navigation</div>
        <button class="global-menu-main" type="button" id="globalMenuMainBtn"><span class="global-menu-icon">☰</span><span class="global-menu-word">Menu</span></button>
        <div class="global-menu-panel" id="globalMenuPanel">
          <button type="button" data-view="dashboard">📊 Dashboard</button>
          <button type="button" data-view="bitem">🧾 B Item Control</button>
          <button type="button" data-view="monitoring">🕵️ B Item Monitoring</button>
        </div>`;
      app.appendChild(gm);
      gm.querySelector('#globalMenuMainBtn').onclick=function(ev){ev.stopPropagation();gm.classList.toggle('open');};
      gm.querySelectorAll('[data-view]').forEach(b=>b.onclick=function(ev){ev.stopPropagation();gm.classList.remove('open');window.showEmployerView(this.getAttribute('data-view'));});
      document.addEventListener('click',()=>gm.classList.remove('open'));
    }
    gm.classList.toggle('access-hidden',!isEmployer());
    cleanupOldMenuDuplicates();
    return gm;
  }
  function setGlobalActive(view){
    ensureGlobalMenu();
    document.querySelectorAll('#globalMenuPanel [data-view]').forEach(b=>b.classList.toggle('active',b.getAttribute('data-view')===view));
  }
  function cleanupOldMenuDuplicates(){
    const menu=document.getElementById('adminMenu');
    if(menu){
      menu.querySelectorAll('#adminMonitorOption,#adminMonitoringOption').forEach(n=>n.remove());
      if(!document.getElementById('adminMonitoringOptionSingle')){
        const b=document.createElement('button');
        b.type='button'; b.id='adminMonitoringOptionSingle'; b.textContent='🕵️ B Item Monitoring';
        b.onclick=function(){window.showEmployerView('monitoring');};
        menu.appendChild(b);
      }
    }
  }

  const originalApplyPortalRoute = (typeof applyPortalRoute==='function') ? applyPortalRoute : null;
  try{
    portalRouteFromHash = function(){
      const h=String(location.hash||'').replace(/^#\/?/,'').trim().toLowerCase();
      if(h==='login'||h==='dashboard'||h==='bitem'||h==='monitoring')return h;
      return 'home';
    };
    portalUrlFor = function(route){route=route||'home';return route==='home' ? (location.pathname+location.search) : '#/'+route;};
    applyPortalRoute = function(route,mode){
      route=route||'home';
      if(route==='monitoring'){
        try{ACCESS_MODE='employer';sessionStorage.setItem('cccAccessMode','employer');}catch(e){}
        if(typeof portalShow==='function')portalShow('dashboardApp');
        if(typeof applyAccessMode==='function')applyAccessMode();
        window.showEmployerView('monitoring',{fromRoute:true});
        return;
      }
      return originalApplyPortalRoute?originalApplyPortalRoute(route,mode):undefined;
    };
  }catch(e){console.warn('Route override warning:',e);}

  function pushViewRoute(view,opts){
    if(opts&&opts.fromRoute)return;
    const route=view==='monitoring'?'monitoring':(view==='bitem'?'bitem':'dashboard');
    const state={portal:true,route,mode:'employer'};
    try{history.pushState(state,'',typeof portalUrlFor==='function'?portalUrlFor(route):('#/'+route));}catch(e){}
  }

  function ensureMonitoringPage(){
    if(typeof ensureAdminMonitoringPage==='function'){
      try{ensureAdminMonitoringPage();}catch(e){}
    }
    return document.getElementById('bItemMonitoringPage');
  }

  const previousShowEmployerView = window.showEmployerView;
  window.showEmployerView=function(view,opts){
    opts=opts||{}; view=view||'dashboard';
    ensureGlobalMenu(); cleanupOldMenuDuplicates();
    const mon=ensureMonitoringPage();
    const layout=document.getElementById('dashboardMainLayout');
    const bpage=document.getElementById('bItemControlPage');
    const dashOpt=document.getElementById('adminDashOption');
    const bOpt=document.getElementById('adminBItemOption');
    if(view==='monitoring'){
      pushViewRoute('monitoring',opts);
      if(layout)layout.style.display='none';
      if(bpage)bpage.classList.remove('active');
      if(mon)mon.classList.add('active');
      if(dashOpt)dashOpt.classList.remove('active'); if(bOpt)bOpt.classList.remove('active');
      setGlobalActive('monitoring');
      if(typeof renderBItemMonitoring==='function')renderBItemMonitoring();
      return;
    }
    if(mon)mon.classList.remove('active');
    if(view==='bitem'){
      pushViewRoute('bitem',opts);
      if(layout)layout.style.display='none';
      if(bpage)bpage.classList.add('active');
      if(dashOpt)dashOpt.classList.remove('active'); if(bOpt)bOpt.classList.add('active');
      setGlobalActive('bitem');
      if(typeof renderBItemControl==='function')renderBItemControl(true);
      return;
    }
    pushViewRoute('dashboard',opts);
    if(layout)layout.style.display='flex';
    if(bpage)bpage.classList.remove('active');
    if(dashOpt)dashOpt.classList.add('active'); if(bOpt)bOpt.classList.remove('active');
    setGlobalActive('dashboard');
    if(previousShowEmployerView && opts.usePrevious) return previousShowEmployerView(view,opts);
  };

  function apiRows(){return (window.bitemSystemAPI&&Array.isArray(window.bitemSystemAPI.stateRows))?window.bitemSystemAPI.stateRows:[];}
  function apiKpi(){return (window.bitemSystemAPI&&window.bitemSystemAPI.stateKpi)||{};}
  async function loadState(){try{if(typeof window.bitemLoadSystemState==='function')await window.bitemLoadSystemState(false);}catch(e){console.warn('B Item state warning:',e.message);}}

  // User-facing B Item Control: no contractor/source flag/sync note/last edited columns.
  window.renderBItemControl=async function(resetPage){
    await loadState();
    const API=window.bitemSystemAPI;
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), cnt=document.getElementById('bItemControlCount'), info=document.getElementById('bItemControlPageInfo');
    if(!head||!body)return;
    if(!API||!Array.isArray(API.stateRows)||!API.stateRows.length){
      body.innerHTML='<tr><td>No B Item records in system yet. Run Sync or reload as CCC Employer.</td></tr>';return;
    }
    const q=c((document.getElementById('bItemControlSearch')||{}).value).toUpperCase();
    let rows=API.stateRows;
    if(q){rows=rows.filter(r=>[r.bitem_id,r.tp_no,r.construction_stage,r.comment_text,r.query_status,r.final_status,r.final_cleared_date,r.user_cleared_date].some(x=>c(x).toUpperCase().includes(q)));}
    if(resetPage)window.BITEM_CTRL_PAGE=1;
    const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
    const total=rows.length, pages=Math.max(1,Math.ceil(total/size));
    window.BITEM_CTRL_PAGE=Math.min(Math.max(1,window.BITEM_CTRL_PAGE||1),pages);
    const k=apiKpi();
    if(cnt)cnt.textContent=`B Items: ${total.toLocaleString()} | Active: ${Number(k.active_total||0).toLocaleString()} | Removed: ${Number(k.removed_total||0).toLocaleString()}`;
    if(info)info.textContent=`Page ${window.BITEM_CTRL_PAGE} of ${pages}`;
    const headers=['Action','B Item ID','TP Number','Stage','Comment','FMS / CCC Excel Sheet Status','Final Status','Punch Cleared','User Cleared'];
    head.innerHTML='<tr>'+headers.map(h=>`<th>${esc(h)}</th>`).join('')+'</tr>';
    const pageRows=rows.slice((window.BITEM_CTRL_PAGE-1)*size,(window.BITEM_CTRL_PAGE-1)*size+size);
    body.innerHTML=pageRows.map(r=>{
      const red=Number(r.active)===0||r.source_flag==='REMOVED_FROM_EXCEL';
      const id=c(r.bitem_id), fp=c(r.fingerprint), old=c(r.final_cleared_date||r.user_cleared_date||'');
      return `<tr class="${red?'warn-row':''}">
        <td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemStartSystemClearedEdit('${enc(id)}','${enc(fp)}','${enc(old)}')">✏️ Edit</button></td>
        <td class="bitem-id-col">${esc(id)}</td>
        <td>${esc(r.tp_no)}</td>
        <td>${esc(r.construction_stage)}</td>
        <td title="${esc(r.comment_text)}">${esc(r.comment_text)}</td>
        <td>${esc(statusText(r.query_status))}</td>
        <td>${esc(statusText(r.final_status))}</td>
        <td class="bitem-cleared-cell" data-bitem-system-cleared="${esc(id)}">${esc(r.final_cleared_date)}</td>
        <td>${esc(r.user_cleared_date)}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="9">No B Item records match the current search.</td></tr>';
  };

  // Admin Monitoring: keep detailed monitoring but rename Query -> FMS in visible output.
  window.renderBItemMonitoring=async function(){
    const body=document.getElementById('bItemLogBody'); const cnt=document.getElementById('bItemLogCount'); if(!body)return;
    body.innerHTML='<tr><td colspan="5">Loading...</td></tr>';
    try{
      const q=c((document.getElementById('bItemLogSearch')||{}).value||'');
      const headers={'content-type':'application/json'}; const t=localStorage.getItem('ccc_bitem_auth_token')||''; if(t)headers.authorization='Bearer '+t;
      const res=await fetch('/api/bitem/logs?limit=500&q='+encodeURIComponent(q),{headers});
      const data=await res.json().catch(()=>({rows:[]})); if(!res.ok||data.ok===false)throw new Error(data.error||('HTTP '+res.status));
      const rows=data.rows||[]; if(cnt)cnt.textContent='Logs: '+rows.length;
      body.innerHTML=rows.map(r=>`<tr><td>${esc(r.created_at)}</td><td>${esc(flagText(r.action))}</td><td>${esc(r.bitem_id)}</td><td>${esc(r.display_name||r.username)}</td><td title="${esc(noteText(r.details))}">${esc(noteText(r.details))}</td></tr>`).join('')||'<tr><td colspan="5">No logs yet.</td></tr>';
    }catch(e){body.innerHTML=`<tr><td colspan="5">${esc(e.message)}</td></tr>`;}
  };

  window.bItemPageMove=function(delta){window.BITEM_CTRL_PAGE=(window.BITEM_CTRL_PAGE||1)+(delta||0);return window.renderBItemControl(false);};

  function runFixes(){ensureGlobalMenu();cleanupOldMenuDuplicates();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',runFixes);else runFixes();
  setTimeout(runFixes,400); setTimeout(runFixes,1600);
})();

;

(function(){
  const FILTERS = window.BITEM_CTRL_COLUMN_FILTERS || (window.BITEM_CTRL_COLUMN_FILTERS = {});
  function c(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function isBlankLike(v){const s=c(v).toUpperCase();return !s||s==='(BLANK)'||s==='BLANK'||s==='-'||s==='--'||s==='NULL'||s==='N/A'||s==='NA'||s==='UNDEFINED';}
  function esc(v){return (window.escapeHtml?window.escapeHtml(v):String(v??'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])));}
  function enc(v){return encodeURIComponent(String(v??''));}
  function dec(v){try{return decodeURIComponent(String(v??''));}catch(e){return String(v??'');}}
  function norm(v){return c(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function statusText(v){const s=c(v).replace(/QUERY/gi,'FMS').replace(/EXCEL/gi,'FMS'); return s.toUpperCase()==='OPEN'?'NOT CLEARED':s;}
  function flagText(v){return c(v).replace(/QUERY/gi,'FMS').replace(/EXCEL/gi,'FMS');}
  function noteText(v){return c(v).replace(/تم الإغلاق نتيجة إغلاق مرحلة الكونستركشن الحالية|تم الإغلاق نتيجة إغلاق مرحلة الكونستراكشن الحالية/g,'Closed due to the closure of the current construction stage.').replace(/query/gi,'FMS').replace(/latest source/gi,'latest FMS / CCC Excel source').replace(/latest FMS source/gi,'latest FMS / CCC Excel source').replace(/Excel/gi,'FMS / CCC Excel');}
  function parseRowJson(r){try{return r&&r.row_json?JSON.parse(r.row_json):{};}catch(e){return {};}}
  function rawVal(obj,names){
    obj=obj||{}; const keys=Object.keys(obj);
    for(const n of names){ if(obj[n]!=null && !isBlankLike(obj[n])) return obj[n]; }
    for(const n of names){ const nn=norm(n); const k=keys.find(x=>norm(x)===nn); if(k && obj[k]!=null && !isBlankLike(obj[k])) return obj[k]; }
    return '';
  }
  function excelSerialToDate(n){
    n=Number(n); if(!isFinite(n))return null;
    const d=new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000);
    return isNaN(d.getTime())?null:d;
  }
  function isLikelyExcelDateSerial(v){
    const s=c(v); if(!/^\d{4,6}$/.test(s))return false;
    const n=Number(s); return n>=25000 && n<=80000;
  }
  function displayDate(v){
    if(isBlankLike(v))return '';
    if(typeof v==='number' || isLikelyExcelDateSerial(v)){
      const d=excelSerialToDate(v); if(d)return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
    v=c(v);
    let m=v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m)return `${String(m[3]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[1]}`;
    m=v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if(m)return `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[3]}`;
    return v;
  }
  function toIsoDate(v){
    if(isBlankLike(v))return '';
    if(typeof v==='number' || isLikelyExcelDateSerial(v)){
      const d=excelSerialToDate(v); if(d)return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    }
    v=c(v);
    let m=v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m=v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    const d=new Date(v); if(!isNaN(d))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return '';
  }
  function isoToDisplay(v){v=c(v); if(!v)return ''; const iso=toIsoDate(v); if(!iso)return v; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`;}
  function cellClass(label){
    const x=norm(label);
    if(x==='COMMENT'||x==='COMMENTS')return 'bitem-comment-col';
    if(x==='DATE')return 'bitem-date-col';
    if(x==='AREA')return 'bitem-area-col';
    if(x==='ISONO')return 'bitem-iso-col';
    if(x==='SHEETNO')return 'bitem-sheet-col';
    if(x.includes('PUNCHCATEGORY'))return 'bitem-cat-col';
    if(x==='MATERIALTYPE')return 'bitem-mat-col';
    if(x.includes('STATUS'))return 'bitem-status-col';
    return '';
  }
  function recordToDisplay(r){
    const raw=parseRowJson(r);
    return {
      action:'',
      bitem_id:c(r.bitem_id),
      tp_no:c(r.tp_no||rawVal(raw,['TP NUMBER','TestPackNo','TP No'])),
      stage:c(r.construction_stage||rawVal(raw,['Construction Stage'])),
      date:displayDate(rawVal(raw,['Date'])),
      area:c(rawVal(raw,['Area'])),
      iso_no:c(rawVal(raw,['ISO No.','ISO No','ISO NO.'])),
      sheet_no:c(rawVal(raw,['Sheet No.','Sheet No','SHEET NO.'])),
      punch_category:c(rawVal(raw,['Punch Category\n(A/B/C)','Punch Category (A/B/C)','Punch Category','PUNCH CATEGORY (A/B/C)'])),
      material_type:c(r.material_type||rawVal(raw,['Material TYPE','Material Type','MATERIAL TYPE'])),
      comment:c(r.comment_text||rawVal(raw,['Comments','Comment'])),
      fms_status:statusText(r.query_status),
      final_status:statusText(r.final_status),
      punch_cleared:displayDate(r.query_cleared_date||rawVal(raw,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date'])),
      user_cleared:displayDate(r.user_cleared_date),
      active:r.active,
      source_flag:flagText(r.source_flag),
      sync_note:noteText(r.sync_note),
      last_edited_by:c(r.last_edited_by),
      last_edited_at:c(r.last_edited_at),
      fingerprint:c(r.fingerprint)
    };
  }
  const COLS=[
    ['Action','action'],
    ['B Item ID','bitem_id'],
    ['TP Number','tp_no'],
    ['Stage','stage'],
    ['Date','date'],
    ['Area','area'],
    ['ISO No.','iso_no'],
    ['Sheet No.','sheet_no'],
    ['Punch Category (A/B/C)','punch_category'],
    ['Material TYPE','material_type'],
    ['Comments','comment'],
    ['FMS / CCC Excel Sheet Status','fms_status'],
    ['Final Status','final_status'],
    ['Punch Cleared','punch_cleared'],
    ['User Cleared','user_cleared']
  ];
  function filterRows(rows){
    const global=c((document.getElementById('bItemControlSearch')||{}).value).toUpperCase();
    let mapped=rows.map(r=>({rec:r,disp:recordToDisplay(r)}));
    if(global){mapped=mapped.filter(x=>COLS.some(([_,k])=>k!=='action'&&c(x.disp[k]).toUpperCase().includes(global)));}
    mapped=mapped.filter(x=>COLS.every(([_,k])=>{
      if(k==='action')return true;
      const f=c(FILTERS[k]).toUpperCase();
      if(!f)return true;
      return c(x.disp[k]).toUpperCase().includes(f);
    }));
    return mapped;
  }
  function headerHtml(){
    const h1='<tr>'+COLS.map(([label,k],i)=>`<th class="${i===0?'bitem-action-col':(k==='bitem_id'?'bitem-id-col':cellClass(label))}">${esc(label)}</th>`).join('')+'</tr>';
    const h2='<tr class="bitem-filter-row">'+COLS.map(([label,k],i)=>{
      if(k==='action')return `<th><button type="button" class="bitem-filter-reset" title="Clear all filters" onclick="window.bitemClearColumnFilters()">Reset</button></th>`;
      return `<th class="${cellClass(label)}"><input class="bitem-col-filter" data-bitem-col-filter="${esc(k)}" value="${esc(FILTERS[k]||'')}" placeholder="Filter..." title="Filter ${esc(label)}"></th>`;
    }).join('')+'</tr>';
    return h1+h2;
  }
  window.bitemClearColumnFilters=function(){Object.keys(FILTERS).forEach(k=>delete FILTERS[k]); if(typeof window.renderBItemControl==='function')window.renderBItemControl(true);};
  function bindFilters(){
    document.querySelectorAll('[data-bitem-col-filter]').forEach(inp=>{
      inp.oninput=function(){FILTERS[this.getAttribute('data-bitem-col-filter')]=this.value; clearTimeout(window.__bitemFilterTimer); window.__bitemFilterTimer=setTimeout(()=>window.renderBItemControl(true),180);};
      inp.onclick=function(ev){ev.stopPropagation();};
    });
  }
  async function loadState(){try{if(typeof window.bitemLoadSystemState==='function')await window.bitemLoadSystemState(false);}catch(e){console.warn('B Item state warning:',e.message);}}
  function apiKpi(){return (window.bitemSystemAPI&&window.bitemSystemAPI.stateKpi)||{};}
  window.renderBItemControl=async function(resetPage){
    await loadState();
    const API=window.bitemSystemAPI;
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), cnt=document.getElementById('bItemControlCount'), info=document.getElementById('bItemControlPageInfo');
    if(!head||!body)return;
    if(!API||!Array.isArray(API.stateRows)||!API.stateRows.length){
      head.innerHTML=headerHtml(); bindFilters();
      body.innerHTML='<tr><td colspan="15">No B Item records in system yet. Run Sync or reload as CCC Employer.</td></tr>'; return;
    }
    const filtered=filterRows(API.stateRows);
    if(resetPage)window.BITEM_CTRL_PAGE=1;
    const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
    const total=filtered.length, pages=Math.max(1,Math.ceil(total/size));
    window.BITEM_CTRL_PAGE=Math.min(Math.max(1,window.BITEM_CTRL_PAGE||1),pages);
    const k=apiKpi();
    if(cnt)cnt.textContent=`B Items: ${total.toLocaleString()} | Active: ${Number(k.active_total||0).toLocaleString()} | Removed: ${Number(k.removed_total||0).toLocaleString()}`;
    if(info)info.textContent=`Page ${window.BITEM_CTRL_PAGE} of ${pages}`;
    head.innerHTML=headerHtml(); bindFilters();
    const pageRows=filtered.slice((window.BITEM_CTRL_PAGE-1)*size,(window.BITEM_CTRL_PAGE-1)*size+size);
    body.innerHTML=pageRows.map(({rec:r,disp:d})=>{
      const red=Number(d.active)===0||c(r.source_flag)==='REMOVED_FROM_EXCEL';
      const id=c(r.bitem_id), fp=c(r.fingerprint), old=c(r.final_cleared_date||r.user_cleared_date||'');
      return `<tr class="${red?'warn-row':''}">
        <td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemStartSystemClearedEdit('${enc(id)}','${enc(fp)}','${enc(old)}')">✏️ Edit</button></td>
        <td class="bitem-id-col">${esc(d.bitem_id)}</td>
        <td>${esc(d.tp_no)}</td>
        <td>${esc(d.stage)}</td>
        <td class="bitem-date-col">${esc(d.date)}</td>
        <td class="bitem-area-col">${esc(d.area)}</td>
        <td class="bitem-iso-col">${esc(d.iso_no)}</td>
        <td class="bitem-sheet-col">${esc(d.sheet_no)}</td>
        <td class="bitem-cat-col">${esc(d.punch_category)}</td>
        <td class="bitem-mat-col">${esc(d.material_type)}</td>
        <td class="bitem-comment-cell" title="${esc(d.comment)}">${esc(d.comment)}</td>
        <td class="bitem-status-col">${esc(d.fms_status)}</td>
        <td class="bitem-status-col">${esc(d.final_status)}</td>
        <td class="bitem-cleared-cell bitem-date-col" data-bitem-system-cleared="${esc(id)}" onclick="window.bitemStartSystemClearedEdit('${enc(id)}','${enc(fp)}','${enc(old)}')">${esc(d.punch_cleared)}</td>
        <td class="bitem-date-col">${esc(d.user_cleared)}</td>
      </tr>`;
    }).join('')||'<tr><td colspan="15">No B Item records match the current filters.</td></tr>';
  };
  // raw fallback table also gets the same visible sheet columns and filters
  window.bitemStartRawClearedEdit = window.bitemStartRawClearedEdit || function(rawIndex){ if(typeof window.bitemPreviewEdit==='function')window.bitemPreviewEdit(rawIndex); };
  const oldStartSystem=window.bitemStartSystemClearedEdit;
  window.bitemStartSystemClearedEdit=function(eid,efp,eold){
    if(typeof oldStartSystem==='function'){
      oldStartSystem(eid,efp,eold);
      setTimeout(()=>{
        const id=dec(eid);
        const cell=document.querySelector(`[data-bitem-system-cleared="${CSS.escape(id)}"]`);
        const inp=cell&&cell.querySelector('input[type="date"]');
        if(inp){try{inp.focus(); if(inp.showPicker)inp.showPicker();}catch(e){}}
      },60);
    }
  };
  window.bItemPageMove=function(delta){window.BITEM_CTRL_PAGE=(window.BITEM_CTRL_PAGE||1)+(delta||0);return window.renderBItemControl(false);};
})();

;

(function(){
  // Preserve raw FMS B Item rows so sync never uses the system-filtered/overridden rows by mistake.
  if(!Array.isArray(window.B_ITEM_SOURCE_ROWS) || !window.B_ITEM_SOURCE_ROWS.length){
    window.B_ITEM_SOURCE_ROWS = Array.isArray(window.B_ITEM_ROWS) ? window.B_ITEM_ROWS.slice() : [];
  }
  const FILTERS = window.BITEM_CTRL_COLUMN_FILTERS || (window.BITEM_CTRL_COLUMN_FILTERS = {});
  const API = window.bitemSystemAPI || (window.bitemSystemAPI = {stateRows:[],stateKpi:null,syncing:false});
  function c(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function isBlankLike(v){const s=c(v).toUpperCase();return !s||s==='(BLANK)'||s==='BLANK'||s==='-'||s==='--'||s==='NULL'||s==='N/A'||s==='NA'||s==='UNDEFINED';}
  function esc(v){return (window.escapeHtml?window.escapeHtml(v):String(v??'').replace(/[&<>\"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])));}
  function enc(v){return encodeURIComponent(String(v??''));}
  function dec(v){try{return decodeURIComponent(String(v??''));}catch(e){return String(v??'');}}
  function norm(v){return c(v).toUpperCase().replace(/[^A-Z0-9]/g,'');}
  function rowVal(row,names){
    row=row||{}; const keys=Object.keys(row);
    for(const n of names){ if(row[n]!=null && !isBlankLike(row[n])) return row[n]; }
    for(const n of names){ const nn=norm(n); const k=keys.find(x=>norm(x)===nn); if(k && row[k]!=null && !isBlankLike(row[k])) return row[k]; }
    return '';
  }
  function excelSerialToDate(v){
    let n;
    if(typeof v==='number') n=v;
    else { const s=c(v).replace(/\.0+$/,''); if(!/^\d{4,6}$/.test(s))return null; n=Number(s); }
    if(!isFinite(n) || n<25000 || n>80000)return null;
    const d=new Date(Date.UTC(1899,11,30)+Math.round(n)*86400000);
    return isNaN(d.getTime())?null:d;
  }
  function toIsoDate(v){
    if(isBlankLike(v))return '';
    const sd=excelSerialToDate(v); if(sd)return `${sd.getUTCFullYear()}-${String(sd.getUTCMonth()+1).padStart(2,'0')}-${String(sd.getUTCDate()).padStart(2,'0')}`;
    const s=c(v);
    let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/); if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}
    const d=new Date(s); if(!isNaN(d.getTime()))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return '';
  }
  function displayDate(v){
    if(isBlankLike(v))return '';
    const iso=toIsoDate(v); if(iso){const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;}
    return c(v);
  }
  function statusText(v){const s=c(v).replace(/QUERY/gi,'FMS').replace(/EXCEL/gi,'FMS'); return s.toUpperCase()==='OPEN'?'NOT CLEARED':s;}
  function noteText(v){return c(v).replace(/تم الإغلاق نتيجة إغلاق مرحلة الكونستركشن الحالية|تم الإغلاق نتيجة إغلاق مرحلة الكونستراكشن الحالية/g,'Closed due to the closure of the current construction stage.').replace(/query/gi,'FMS').replace(/latest source/gi,'latest FMS / CCC Excel source').replace(/latest FMS source/gi,'latest FMS / CCC Excel source').replace(/Excel/gi,'FMS / CCC Excel');}
  function statusPill(v){
    const s=statusText(v).toUpperCase();
    const cls=s==='CLEARED'?'cleared':((s==='OPEN'||s==='NOT CLEARED')?'open':(s.includes('REMOVED')?'removed':''));
    return `<span class="bitem-status-pill ${cls}">${esc(s||'')}</span>`;
  }
  function parseRowJson(r){try{return r&&r.row_json?JSON.parse(r.row_json):{};}catch(e){return {};}}
  function userNote(r){
    const n=noteText(r.sync_note||'');
    const f=statusText(r.source_flag||'').toUpperCase();
    if(n.includes('Closed due to')) return n;
    if(f.includes('STAGE_CLOSED')) return 'Closed due to the closure of the current construction stage.';
    if(f.includes('REMOVED')) return 'This comment did not return in the latest FMS / CCC Excel source.';
    return '';
  }  function cleanRawRows(){return Array.isArray(window.B_ITEM_SOURCE_ROWS)&&window.B_ITEM_SOURCE_ROWS.length?window.B_ITEM_SOURCE_ROWS:(Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:[]);}
  function buildTpStatusByTP(){
    const map={};
    const rows=Array.isArray(window.TP_SUMMARY_ROWS)&&window.TP_SUMMARY_ROWS.length?window.TP_SUMMARY_ROWS:(Array.isArray(window.TP)?window.TP:[]);
    const getTp=(r)=>rowVal(r,['TestPackNo','TP NUMBER','Test Pack No','TP No','TestPack No']);
    for(const r of rows){
      const tp=norm(getTp(r)); if(!tp)continue;
      map[tp]={
        CNS_PUNCH_B_CLEARED: toIsoDate(rowVal(r,['CNS Punch B Cleared'])),
        QC_PUNCH_LIST_RETURN: toIsoDate(rowVal(r,['QC Punch List Return'])),
        QC_REINSTATEMENT_SIGN: toIsoDate(rowVal(r,['QC Reinstatement Sign']))
      };
    }
    return map;
  }
  async function bitemApi(path,opts){
    opts=opts||{}; opts.headers=Object.assign({'content-type':'application/json'},opts.headers||{});
    const t=localStorage.getItem('ccc_bitem_auth_token')||''; if(t)opts.headers.authorization='Bearer '+t;
    const res=await fetch(path,opts); const data=await res.json().catch(()=>({}));
    if(!res.ok || data.ok===false)throw new Error(data.error||('HTTP '+res.status));
    return data;
  }
  function applyStateToDashboardRows(){
    const active=(API.stateRows||[]).filter(r=>Number(r.active)!==0);
    if(!active.length)return;
    const out=[];
    for(const rec of active){
      let row=parseRowJson(rec);
      row['System B Item ID']=rec.bitem_id;
      row['System Final Status']=rec.final_status;
      row['System Source Flag']=rec.source_flag;
      row['System Sync Note']=rec.sync_note;
      if(rec.final_status==='CLEARED' && (rec.final_cleared_date||rec.user_cleared_date)) row['Punch Cleared']=rec.final_cleared_date||rec.user_cleared_date;
      out.push(row);
    }
    window.B_ITEM_ROWS=out;
    if(Array.isArray(window.B_ITEM_HEADERS))['System B Item ID','System Final Status','System Source Flag','System Sync Note'].forEach(h=>{if(!window.B_ITEM_HEADERS.includes(h))window.B_ITEM_HEADERS.push(h);});
  }
  window.bitemLoadSystemState=async function(applyToDashboard){
    const q=c((document.getElementById('bItemControlSearch')||{}).value||'');
    const data=await bitemApi('/api/bitem/state?include_removed=1&limit=50000&q='+encodeURIComponent(q),{method:'GET'});
    API.stateRows=data.rows||[]; API.stateKpi=data.kpi||null;
    if(applyToDashboard){applyStateToDashboardRows(); if(typeof refresh==='function')setTimeout(()=>refresh(true),0);}
    return data;
  };
  window.bitemRunFullSync=async function(){
    const rows=cleanRawRows();
    if(!rows.length)throw new Error('No source B_ITEM_ROWS found. Regenerate dashboard_data.js first.');
    const syncId='SYNC-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
    const size=400; API.syncing=true;
    const tpStatusByTP=buildTpStatusByTP();
    for(let i=0;i<rows.length;i+=size){
      await bitemApi('/api/bitem/sync',{method:'POST',body:JSON.stringify({syncId,rows:rows.slice(i,i+size),tpStatusByTP,isFirst:i===0,isLast:i+size>=rows.length,totalRows:rows.length})});
    }
    API.syncing=false;
    await window.bitemLoadSystemState(true);
    return syncId;
  };
  const COLS=[
    ['Action','action','bitem-action-col'],['B Item ID','bitem_id','bitem-id-col'],['TP Number','tp_no','bitem-tp-col'],['Stage','stage','bitem-stage-col'],['Date','date','bitem-date-col'],['Area','area','bitem-area-col'],['ISO No.','iso_no','bitem-iso-col'],['Sheet No.','sheet_no','bitem-sheet-col'],['Punch Category','punch_category','bitem-cat-col'],['Material TYPE','material_type','bitem-mat-col'],['Comments','comment','bitem-comment-col'],['FMS / CCC Excel Sheet Status','fms_status','bitem-status-col'],['Final Status','final_status','bitem-status-col'],['Punch Cleared','punch_cleared','bitem-cleared-col'],['User Cleared','user_cleared','bitem-cleared-col'],['Note','note','bitem-note-col']
  ];
  function recordToDisplay(r){
    const raw=parseRowJson(r);
    return {bitem_id:c(r.bitem_id),tp_no:c(r.tp_no||rowVal(raw,['TP NUMBER','TestPackNo','TP No'])),stage:c(r.construction_stage||rowVal(raw,['Construction Stage'])),date:displayDate(rowVal(raw,['Date'])),area:c(rowVal(raw,['Area'])),iso_no:c(rowVal(raw,['ISO No.','ISO No','ISO NO.'])),sheet_no:c(rowVal(raw,['Sheet No.','Sheet No','SHEET NO.'])),punch_category:c(rowVal(raw,['Punch Category\n(A/B/C)','Punch Category (A/B/C)','Punch Category','PUNCH CATEGORY (A/B/C)'])),material_type:c(r.material_type||rowVal(raw,['Material TYPE','Material Type','MATERIAL TYPE'])),comment:c(r.comment_text||rowVal(raw,['Comments','Comment'])),fms_status:statusText(r.query_status),final_status:statusText(r.final_status),punch_cleared:displayDate(rowVal(raw,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date'])),user_cleared:displayDate(r.user_cleared_date),note:userNote(r),active:r.active,fingerprint:c(r.fingerprint)};
  }
  function filterRows(rows){
    const global=c((document.getElementById('bItemControlSearch')||{}).value).toUpperCase();
    let mapped=rows.map(r=>({rec:r,disp:recordToDisplay(r)}));
    if(global)mapped=mapped.filter(x=>COLS.some(([_,k])=>k==='action'?false:c(x.disp[k]).toUpperCase().includes(global)));
    mapped=mapped.filter(x=>COLS.every(([_,k])=>{if(k==='action')return true;const f=c(FILTERS[k]).toUpperCase();return !f||c(x.disp[k]).toUpperCase().includes(f);}));
    return mapped;
  }
  function headerHtml(){
    const h1='<tr>'+COLS.map(([label,k,cls])=>`<th class="${cls||''}">${esc(label)}</th>`).join('')+'</tr>';
    const h2='<tr class="bitem-filter-row">'+COLS.map(([label,k,cls])=>k==='action'?`<th><button type="button" class="bitem-filter-reset" onclick="window.bitemClearColumnFilters()">Reset</button></th>`:`<th class="${cls||''}"><input class="bitem-col-filter" data-bitem-col-filter="${esc(k)}" value="${esc(FILTERS[k]||'')}" placeholder="Filter..."></th>`).join('')+'</tr>';
    return h1+h2;
  }
  window.bitemClearColumnFilters=function(){Object.keys(FILTERS).forEach(k=>delete FILTERS[k]); if(typeof window.renderBItemControl==='function')window.renderBItemControl(true);};
  function bindFilters(){document.querySelectorAll('[data-bitem-col-filter]').forEach(inp=>{inp.oninput=function(){FILTERS[this.getAttribute('data-bitem-col-filter')]=this.value;clearTimeout(window.__bitemFilterTimer);window.__bitemFilterTimer=setTimeout(()=>window.renderBItemControl(true),180);};inp.onclick=e=>e.stopPropagation();});}
  window.renderBItemControl=async function(resetPage){
    try{await window.bitemLoadSystemState(false);}catch(e){console.warn('B Item state warning:',e.message);}
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), cnt=document.getElementById('bItemControlCount'), info=document.getElementById('bItemControlPageInfo'); if(!head||!body)return;
    const rows=Array.isArray(API.stateRows)?API.stateRows:[]; head.innerHTML=headerHtml(); bindFilters();
    if(!rows.length){body.innerHTML='<tr><td colspan="16">No B Item records in system yet. Run Sync or reload as CCC Employer.</td></tr>';return;}
    const filtered=filterRows(rows); if(resetPage)window.BITEM_CTRL_PAGE=1;
    const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
    const pages=Math.max(1,Math.ceil(filtered.length/size)); window.BITEM_CTRL_PAGE=Math.min(Math.max(1,window.BITEM_CTRL_PAGE||1),pages);
    const k=API.stateKpi||{}; if(cnt)cnt.textContent=`B Items: ${filtered.length.toLocaleString()} | Active: ${Number(k.active_total||0).toLocaleString()} | Removed: ${Number(k.removed_total||0).toLocaleString()}`; if(info)info.textContent=`Page ${window.BITEM_CTRL_PAGE} of ${pages}`;
    const pageRows=filtered.slice((window.BITEM_CTRL_PAGE-1)*size,(window.BITEM_CTRL_PAGE-1)*size+size);
    body.innerHTML=pageRows.map(({rec:r,disp:d})=>{
      const red=Number(d.active)===0||c(r.source_flag).includes('REMOVED'); const id=c(r.bitem_id), fp=c(r.fingerprint), old=c(r.user_cleared_date||'');
      return `<tr class="${red?'warn-row':''}"><td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemStartSystemClearedEdit('${enc(id)}','${enc(fp)}','${enc(old)}')">✏️ Edit</button></td><td class="bitem-id-col">${esc(d.bitem_id)}</td><td class="bitem-tp-col">${esc(d.tp_no)}</td><td class="bitem-stage-col">${esc(d.stage)}</td><td class="bitem-date-col">${esc(d.date)}</td><td class="bitem-area-col">${esc(d.area)}</td><td class="bitem-iso-col">${esc(d.iso_no)}</td><td class="bitem-sheet-col">${esc(d.sheet_no)}</td><td class="bitem-cat-col">${esc(d.punch_category)}</td><td class="bitem-mat-col">${esc(d.material_type)}</td><td class="bitem-comment-cell" title="${esc(d.comment)}">${esc(d.comment)}</td><td class="bitem-status-col">${statusPill(d.fms_status)}</td><td class="bitem-status-col">${statusPill(d.final_status)}</td><td class="bitem-cleared-cell bitem-cleared-col" data-bitem-system-cleared="${esc(id)}" onclick="window.bitemStartSystemClearedEdit('${enc(id)}','${enc(fp)}','${enc(old)}')">${esc(d.punch_cleared)}</td><td class="bitem-cleared-col">${esc(d.user_cleared)}</td><td class="bitem-note-cell">${esc(d.note)}</td></tr>`;
    }).join('')||'<tr><td colspan="16">No B Item records match the current filters.</td></tr>';
  };
  const oldStartSystem=window.bitemStartSystemClearedEdit;
  window.bitemStartSystemClearedEdit=function(eid,efp,eold){
    if(typeof oldStartSystem==='function'){
      oldStartSystem(eid,efp,eold);
      setTimeout(()=>{const id=dec(eid);const cell=document.querySelector(`[data-bitem-system-cleared="${CSS.escape(id)}"]`);const inp=cell&&cell.querySelector('input[type="date"]');if(inp){try{inp.focus(); if(inp.showPicker)inp.showPicker();}catch(e){}}},60);
    }
  };
  window.bItemPageMove=function(delta){window.BITEM_CTRL_PAGE=(window.BITEM_CTRL_PAGE||1)+(delta||0);return window.renderBItemControl(false);};
})();

;

(function(){
  function clean(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function norm(v){return clean(v).toUpperCase();}
  function apiToken(){try{return localStorage.getItem('ccc_bitem_auth_token')||'';}catch(e){return '';}}
  function setAuth(t,u){try{localStorage.setItem('ccc_bitem_auth_token',t);localStorage.setItem('ccc_bitem_auth_user',JSON.stringify(u||{}));}catch(e){}}
  async function api(path, opts){
    opts=opts||{}; opts.headers=opts.headers||{}; opts.headers['content-type']='application/json';
    const t=apiToken(); if(t)opts.headers['authorization']='Bearer '+t;
    const res=await fetch(path,opts);
    const data=await res.json().catch(()=>({ok:false,error:'Bad JSON response'}));
    if(!res.ok||data.ok===false)throw new Error(data.error||('HTTP '+res.status));
    return data;
  }
  function saveOriginalBItemSource(){
    try{
      if(!window.BITEM_SOURCE_ROWS && Array.isArray(window.B_ITEM_ROWS)){
        window.BITEM_SOURCE_ROWS = JSON.parse(JSON.stringify(window.B_ITEM_ROWS));
      }
    }catch(e){window.BITEM_SOURCE_ROWS = Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS.slice():[];}
  }
  function sourceRows(){
    saveOriginalBItemSource();
    return Array.isArray(window.BITEM_SOURCE_ROWS) ? window.BITEM_SOURCE_ROWS : (Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:[]);
  }
  function val(row,names){
    if(!row)return '';
    for(const n of names){if(row[n]!=null&&clean(row[n])!=='')return row[n];}
    const keys=Object.keys(row||{});
    for(const n of names){const nn=norm(n).replace(/[^A-Z0-9]/g,'');const k=keys.find(x=>norm(x).replace(/[^A-Z0-9]/g,'')===nn);if(k&&row[k]!=null&&clean(row[k])!=='')return row[k];}
    return '';
  }
  function toISO(v){
    if(v==null||v==='')return '';
    if(typeof window.excelDateToISO==='function'){const x=window.excelDateToISO(v); if(x)return x;}
    if(typeof v==='number'&&isFinite(v)){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return d.toISOString().slice(0,10);}
    const s=clean(v); let m=s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m)return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    m=s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/); if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}
    const d=new Date(s); return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);
  }
  function rowTP(row){return clean(val(row,['TP NUMBER','TestPackNo','Test Pack No','TP No']));}
  function buildTpStatusByTP(){
    const map={};
    const rows=Array.isArray(window.TP_SUMMARY_ROWS)&&window.TP_SUMMARY_ROWS.length?window.TP_SUMMARY_ROWS:(Array.isArray(window.TP)?window.TP:[]);
    for(const r of rows){
      const tp=norm(rowTP(r)); if(!tp)continue;
      map[tp]={
        CNS_PUNCH_B_CLEARED: toISO(val(r,['CNS Punch B Cleared'])),
        QC_PUNCH_LIST_RETURN: toISO(val(r,['QC Punch List Return'])),
        QC_REINSTATEMENT_SIGN: toISO(val(r,['QC Reinstatement Sign']))
      };
    }
    return map;
  }
  function setCountMsg(msg){const cnt=document.getElementById('bItemControlCount'); if(cnt)cnt.textContent=msg;}

  window.bitemLoadSystemState = async function(applyToDashboard){
    const q=clean((document.getElementById('bItemControlSearch')||{}).value||'');
    const data=await api('/api/bitem/state?include_removed=1&limit=50000&q='+encodeURIComponent(q),{method:'GET'});
    const API=window.bitemSystemAPI || (window.bitemSystemAPI={});
    API.stateRows=data.rows||[]; API.stateKpi=data.kpi||null; API.total=data.total||API.stateRows.length;
    if(applyToDashboard && typeof window.refresh==='function'){
      // Do not rewrite B_ITEM_ROWS here. The raw Excel rows must stay raw for future syncs.
      setTimeout(()=>window.refresh(true),0);
    }
    return data;
  };

  window.bitemRunFullSyncFast = async function(){
    const rows=sourceRows();
    if(!rows.length)throw new Error('No B_ITEM_ROWS found. Regenerate dashboard_data.js first.');
    const syncId='SYNC-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
    const size=500;
    const total=rows.length;
    setCountMsg(`Syncing B Items: 0 / ${total.toLocaleString()}`);
    for(let i=0;i<rows.length;i+=size){
      const chunk=rows.slice(i,i+size);
      const res=await api('/api/bitem/sync',{method:'POST',body:JSON.stringify({
        syncId, rows:chunk, tpStatusByTP:buildTpStatusByTP(), isFirst:i===0, isLast:i+size>=rows.length, totalRows:total
      })});
      const done=Math.min(i+size,total);
      setCountMsg(`Syncing B Items: ${done.toLocaleString()} / ${total.toLocaleString()} | inserted ${res.inserted||0}, updated ${res.updated||0}, skipped ${res.skipped||0}`);
      await new Promise(r=>setTimeout(r,25));
    }
    await window.bitemLoadSystemState(false);
    if(typeof window.renderBItemControl==='function')await window.renderBItemControl(true);
    setCountMsg(`B Items: ${(window.bitemSystemAPI.stateRows||[]).length.toLocaleString()} | Active: ${((window.bitemSystemAPI.stateKpi||{}).active_total||0).toLocaleString()} | Removed: ${((window.bitemSystemAPI.stateKpi||{}).removed_total||0).toLocaleString()}`);
    return syncId;
  };
  window.bitemRunFullSync = window.bitemRunFullSyncFast;

  const previousSubmit = window.submitEmployerLogin;
  window.submitEmployerLogin = async function(e){
    if(e)e.preventDefault();
    const username=clean((document.getElementById('portalUser')||{}).value||'');
    const password=clean((document.getElementById('portalPass')||{}).value||'');
    try{
      const data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      setAuth(data.token,data.user);
      const err=document.getElementById('portalLoginError');if(err)err.style.display='none';
      if(typeof window.enterDashboardMode==='function')window.enterDashboardMode('employer',{replace:true});
      setTimeout(async()=>{
        try{
          await window.bitemLoadSystemState(false);
          const active=Number(((window.bitemSystemAPI||{}).stateKpi||{}).active_total||0);
          const src=sourceRows().length;
          // Run sync only when the system is clearly behind the current Excel source.
          if(src && active < Math.max(1, Math.floor(src*0.95))) await window.bitemRunFullSyncFast();
          else if(typeof window.renderBItemControl==='function') await window.renderBItemControl(true);
        }catch(x){console.warn('B Item fast sync warning:',x.message);}
      },500);
      return false;
    }catch(err){
      console.warn('API login failed:',err.message);
      if(previousSubmit)return previousSubmit(e);
      const el=document.getElementById('portalLoginError');if(el){el.textContent=err.message;el.style.display='block';}
      return false;
    }
  };

  saveOriginalBItemSource();
})();

;

(function(){
  function clean(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function token(){try{return localStorage.getItem('ccc_bitem_auth_token')||'';}catch(e){return '';}}
  function bodyCell(msg){
    const body=document.getElementById('bItemControlBody');
    if(body)body.innerHTML='<tr><td colspan="16" class="bitem-empty-sync">'+msg+'</td></tr>';
  }
  function cntMsg(msg){const c=document.getElementById('bItemControlCount'); if(c)c.textContent=msg;}
  async function waitForSourceRows(){
    if(Array.isArray(window.B_ITEM_ROWS)&&window.B_ITEM_ROWS.length)return window.B_ITEM_ROWS;
    try{
      if(typeof window.ensureBItemRowsLoadedForControl==='function')await window.ensureBItemRowsLoadedForControl();
    }catch(e){}
    if(Array.isArray(window.B_ITEM_ROWS)&&window.B_ITEM_ROWS.length)return window.B_ITEM_ROWS;
    try{
      if(typeof window.updateFromRemoteExcel==='function'){
        cntMsg('Loading B Item rows from Excel source...');
        await window.updateFromRemoteExcel({silent:true,auto:true});
      }
    }catch(e){console.warn('B Item source load failed:',e);}
    return Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:[];
  }
  async function prepareSourceForSync(){
    const rows=await waitForSourceRows();
    if(rows.length){
      try{window.BITEM_SOURCE_ROWS=JSON.parse(JSON.stringify(rows));}
      catch(e){window.BITEM_SOURCE_ROWS=rows.slice();}
    }
    return rows;
  }
  window.bitemManualSyncFromUI=async function(){
    const btn=document.getElementById('bItemSyncNowBtn');
    try{
      if(!token())throw new Error('Please login as CCC Employer first.');
      if(btn)btn.disabled=true;
      bodyCell('<b>Sync started...</b><br>Reading B Item rows from dashboard_data.js / Excel source. Please wait.');
      const rows=await prepareSourceForSync();
      if(!rows.length)throw new Error('No B_ITEM_ROWS found in dashboard data. Regenerate dashboard_data.js first, then retry.');
      if(typeof window.bitemRunFullSyncFast==='function')await window.bitemRunFullSyncFast();
      else if(typeof window.bitemRunFullSync==='function')await window.bitemRunFullSync();
      else throw new Error('Sync function is not available in this index file.');
      if(typeof window.bitemLoadSystemState==='function')await window.bitemLoadSystemState(false);
      if(typeof window.renderBItemControl==='function')await window.renderBItemControl(true);
    }catch(e){
      console.error(e);
      cntMsg('B Item Sync failed');
      bodyCell('<b>Sync failed:</b> '+esc(e.message||e)+'<br>Check that you are logged in as CCC Employer and dashboard_data.js contains B_ITEM_ROWS.');
    }finally{
      if(btn)btn.disabled=false;
    }
  };
  function addSyncButton(){
    const host=document.querySelector('#page-bitem .tbl-toolbar') || document.querySelector('#page-bitem .sec') || document.querySelector('#page-bitem');
    const actions=document.querySelector('#page-bitem .page-actions') || document.querySelector('#page-bitem .bitem-top-actions') || null;
    if(document.getElementById('bItemSyncNowBtn'))return;
    let target=document.querySelector('#page-bitem .bitem-toolbar-actions') || document.querySelector('#page-bitem .bitem-actions') || null;
    const exportBtn=[...document.querySelectorAll('button,a')].find(x=>/Export B Item/i.test(x.textContent||''));
    const btn=document.createElement('button');
    btn.id='bItemSyncNowBtn'; btn.type='button'; btn.className='bitem-sync-btn'; btn.innerHTML='↻ Sync B Item';
    btn.onclick=window.bitemManualSyncFromUI;
    if(exportBtn&&exportBtn.parentNode)exportBtn.parentNode.insertBefore(btn,exportBtn);
    else if(target)target.prepend(btn);
    else if(host)host.prepend(btn);
  }
  const oldRender=window.renderBItemControl;
  window.renderBItemControl=async function(resetPage){
    addSyncButton();
    if(oldRender)await oldRender(resetPage);
    const rows=((window.bitemSystemAPI||{}).stateRows||[]);
    const body=document.getElementById('bItemControlBody');
    if((!rows||!rows.length)&&body){
      body.innerHTML='<tr><td colspan="16" class="bitem-empty-sync"><b>No B Item records are loaded in D1 yet.</b><br>Click <b>↻ Sync B Item</b>. This will import all B Item rows from the current dashboard_data.js into the system.</td></tr>';
      if(token()&&!window.__bitemV9AutoSyncStarted){
        window.__bitemV9AutoSyncStarted=true;
        setTimeout(()=>window.bitemManualSyncFromUI(),800);
      }
    }
  };
  document.addEventListener('DOMContentLoaded',()=>setTimeout(addSyncButton,500));
  setTimeout(addSyncButton,1000);
})();

;

(function(){
  if(window.__BITEM_FINAL_UI_NAV_RELOAD_FIX__) return;
  window.__BITEM_FINAL_UI_NAV_RELOAD_FIX__=true;

  const STATE={rows:[],kpi:null,total:0,loaded:false,loading:false,error:''};
  const FILTERS=window.__BITEM_FINAL_FILTERS__ || (window.__BITEM_FINAL_FILTERS__={});
  const COLS=[
    ['Action','action','bitem-action-col'],['B Item ID','bitem_id','bitem-id-col'],['TP Number','tp_no','bitem-tp-col'],['Stage','stage','bitem-stage-col'],['Date','date','bitem-date-col'],['Area','area','bitem-area-col'],['ISO No.','iso_no','bitem-iso-col'],['Sheet No.','sheet_no','bitem-sheet-col'],['Punch Category','punch_category','bitem-cat-col'],['Material TYPE','material_type','bitem-mat-col'],['Comments','comment','bitem-comment-col'],['FMS / CCC Excel Sheet Status','fms_status','bitem-status-col'],['Final Status','final_status','bitem-status-col'],['Punch Cleared','punch_cleared','bitem-cleared-col'],['User Cleared','user_cleared','bitem-cleared-col'],['Note','note','bitem-note-col']
  ];
  function clean(v){return v==null?'':String(v).replace(/\s+/g,' ').trim();}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function norm(v){return clean(v).toUpperCase();}
  function token(){try{return localStorage.getItem('ccc_bitem_auth_token')||'';}catch(e){return '';}}
  async function apiGet(path){
    const headers={}; const t=token(); if(t)headers.authorization='Bearer '+t;
    const res=await fetch(path,{method:'GET',headers,cache:'no-store'});
    const data=await res.json().catch(()=>({ok:false,error:'Bad JSON response'}));
    if(!res.ok||data.ok===false) throw new Error(data.error||data.message||('HTTP '+res.status));
    return data;
  }
  async function apiPost(path,body){
    const headers={'content-type':'application/json'}; const t=token(); if(t)headers.authorization='Bearer '+t;
    const res=await fetch(path,{method:'POST',headers,body:JSON.stringify(body||{}),cache:'no-store'});
    const data=await res.json().catch(()=>({ok:false,error:'Bad JSON response'}));
    if(!res.ok||data.ok===false) throw new Error(data.error||data.message||('HTTP '+res.status));
    return data;
  }
  function parseJson(s){try{return s?JSON.parse(s):{};}catch(e){return {};}}
  function rowVal(r,names){for(const n of names){if(r&&Object.prototype.hasOwnProperty.call(r,n)&&clean(r[n])!=='')return r[n];}return '';}
  function excelSerialToDate(v){
    if(v===null||v===undefined||v==='')return '';
    if(typeof v==='number'&&isFinite(v)&&v>20000&&v<90000){const d=new Date(Date.UTC(1899,11,30)+Math.round(v)*86400000);return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;}
    return '';
  }
  function displayDate(v){
    v=clean(v); if(!v)return '';
    const serial=Number(v); const sd=excelSerialToDate(serial); if(sd)return sd;
    let m=v.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/); if(m)return `${String(m[3]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[1]}`;
    m=v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/); if(m)return `${String(m[1]).padStart(2,'0')}/${String(m[2]).padStart(2,'0')}/${m[3].length===2?'20'+m[3]:m[3]}`;
    return v;
  }
  function statusText(v){const s=clean(v).replace(/QUERY/gi,'FMS').replace(/EXCEL/gi,'FMS');return s.toUpperCase()==='OPEN'?'NOT CLEARED':s;}
  function noteText(v){return clean(v).replace(/تم الإغلاق نتيجة إغلاق مرحلة الكونستركشن الحالية|تم الإغلاق نتيجة إغلاق مرحلة الكونستراكشن الحالية/g,'Closed due to the closure of the current construction stage.').replace(/query/gi,'FMS').replace(/latest source/gi,'latest FMS / CCC Excel source').replace(/latest FMS source/gi,'latest FMS / CCC Excel source').replace(/Excel/gi,'FMS / CCC Excel');}
  function pill(v){const s=statusText(v);const u=s.toUpperCase();const cls=u==='CLEARED'?'cleared':(u==='NOT CLEARED'||u==='OPEN'?'open':(u.includes('REMOVED')?'removed':''));return `<span class="bitem-status-pill ${cls}">${esc(s)}</span>`;}
  function userNote(r){const n=noteText(r.sync_note||'');const f=statusText(r.source_flag||'').toUpperCase();if(n)return n;if(f.includes('STAGE_CLOSED'))return 'Closed due to the closure of the current construction stage.';if(f.includes('REMOVED'))return 'This comment did not return in the latest FMS / CCC Excel source.';return '';}
  function recordToDisplay(r){
    const raw=parseJson(r.row_json);
    return {
      bitem_id:clean(r.bitem_id),
      tp_no:clean(r.tp_no||rowVal(raw,['TP NUMBER','TestPackNo','TP No','Test Pack No'])),
      stage:clean(r.construction_stage||rowVal(raw,['Construction Stage'])),
      date:displayDate(rowVal(raw,['Date'])),
      area:clean(r.area||rowVal(raw,['Area'])),
      iso_no:clean(r.iso_or_spool||rowVal(raw,['ISO No.','ISO No','ISO NO.'])),
      sheet_no:clean(rowVal(raw,['Sheet No.','Sheet No','SHEET NO.'])),
      punch_category:clean(r.punch_category||rowVal(raw,['Punch Category\n(A/B/C)','Punch Category (A/B/C)','Punch Category','PUNCH CATEGORY (A/B/C)'])),
      material_type:clean(r.material_type||rowVal(raw,['Material TYPE','Material Type','MATERIAL TYPE'])),
      comment:clean(r.comment_text||rowVal(raw,['Comments','Comment'])),
      fms_status:statusText(r.query_status),
      final_status:statusText(r.final_status),
      punch_cleared:displayDate(rowVal(raw,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date'])||r.query_cleared_date),
      user_cleared:displayDate(r.user_cleared_date),
      note:userNote(r),
      active:r.active,
      fingerprint:clean(r.fingerprint)
    };
  }
  function headerHtml(){
    const h1='<tr>'+COLS.map(([label,k,cls])=>`<th class="${cls||''}">${esc(label)}</th>`).join('')+'</tr>';
    const h2='<tr class="bitem-filter-row">'+COLS.map(([label,k,cls])=>k==='action'?`<th><button type="button" class="bitem-filter-reset" onclick="window.bitemClearColumnFilters()">Reset</button></th>`:`<th class="${cls||''}"><input class="bitem-col-filter" data-bitem-col-filter="${esc(k)}" value="${esc(FILTERS[k]||'')}" placeholder="Filter..."></th>`).join('')+'</tr>';
    return h1+h2;
  }
  function bindFilters(){document.querySelectorAll('[data-bitem-col-filter]').forEach(inp=>{inp.oninput=function(){FILTERS[this.getAttribute('data-bitem-col-filter')]=this.value;clearTimeout(window.__bitemFinalFilterTimer);window.__bitemFinalFilterTimer=setTimeout(()=>window.renderBItemControl(true),180);};inp.onclick=e=>e.stopPropagation();});}
  function filterRows(rows){
    const global=norm((document.getElementById('bItemControlSearch')||{}).value||'');
    let mapped=rows.map(r=>({rec:r,disp:recordToDisplay(r)}));
    if(global)mapped=mapped.filter(x=>COLS.some(([_,k])=>k!=='action'&&norm(x.disp[k]).includes(global)));
    mapped=mapped.filter(x=>COLS.every(([_,k])=>{if(k==='action')return true;const f=norm(FILTERS[k]||'');return !f||norm(x.disp[k]).includes(f);}));
    return mapped;
  }
  function ensureReloadButton(){
    const old=document.getElementById('bItemSyncNowBtn');
    if(old){old.className='bitem-reload-btn';old.innerHTML='↻ Reload B Item';old.onclick=()=>window.bitemReloadState();return;}
    const exportBtn=[...document.querySelectorAll('button,a')].find(x=>/Export B Item/i.test(x.textContent||''));
    const btn=document.createElement('button');btn.id='bItemSyncNowBtn';btn.type='button';btn.className='bitem-reload-btn';btn.innerHTML='↻ Reload B Item';btn.onclick=()=>window.bitemReloadState();
    if(exportBtn&&exportBtn.parentNode)exportBtn.parentNode.insertBefore(btn,exportBtn);
  }
  async function fetchState(force){
    if(STATE.loading)return;
    if(STATE.loaded&&!force)return;
    STATE.loading=true;STATE.error='';
    try{
      const data=await apiGet('/api/bitem/state?include_removed=1&limit=50000&t='+Date.now());
      STATE.rows=Array.isArray(data.rows)?data.rows:[];STATE.kpi=data.kpi||null;STATE.total=Number(data.total||STATE.rows.length||0);STATE.loaded=true;
      const API=window.bitemSystemAPI||(window.bitemSystemAPI={});API.stateRows=STATE.rows;API.stateKpi=STATE.kpi;API.total=STATE.total;
    }catch(e){STATE.error=e.message||String(e);console.warn('B Item state reload failed:',STATE.error);}finally{STATE.loading=false;}
  }
  window.bitemLoadSystemState=async function(applyToDashboard){await fetchState(true);return {ok:!STATE.error,rows:STATE.rows,kpi:STATE.kpi,total:STATE.total,error:STATE.error};};
  window.bitemManualSyncFromUI=async function(){return window.bitemReloadState();};
  window.bitemReloadState=async function(){
    const btn=document.getElementById('bItemSyncNowBtn');if(btn)btn.disabled=true;
    await fetchState(true);
    await window.renderBItemControl(true);
    if(btn)btn.disabled=false;
  };
  window.bitemClearColumnFilters=function(){Object.keys(FILTERS).forEach(k=>delete FILTERS[k]);window.renderBItemControl(true);};
  window.bitemStartSystemClearedEdit=window.bitemStartSystemClearedEdit||async function(eid,efp,eold){
    const bitem_id=decodeURIComponent(eid), fingerprint=decodeURIComponent(efp), old=decodeURIComponent(eold||'');
    const d=prompt('User Cleared date YYYY-MM-DD. Leave blank to clear:', old||''); if(d===null)return;
    await apiPost('/api/bitem/edit',{bitem_id,fingerprint,punch_cleared:d,remarks:'Inline User Cleared update'});
    await window.bitemReloadState();
  };
  window.renderBItemControl=async function(resetPage){
    ensureReloadButton();
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), cnt=document.getElementById('bItemControlCount'), info=document.getElementById('bItemControlPageInfo');
    if(!head||!body)return;
    head.innerHTML=headerHtml();bindFilters();
    if(!STATE.loaded&&!STATE.loading)await fetchState(false);
    const rows=Array.isArray(STATE.rows)?STATE.rows:[];
    if(!rows.length){
      const msg=STATE.error?`<b class="bitem-state-warning">B Item state reload failed:</b> ${esc(STATE.error)}<br>Click <b>↻ Reload B Item</b>. If this keeps happening, the issue is the /api/bitem/state endpoint, not the sync data.`:'<b>No B Item records returned from D1.</b><br>Do not run browser sync. Run the local SAFE10 automation only, then click <b>↻ Reload B Item</b>.';
      body.innerHTML=`<tr><td colspan="16" class="bitem-empty-sync">${msg}</td></tr>`; if(cnt)cnt.textContent=STATE.error?'B Item State Load Failed':'B Items: 0'; if(info)info.textContent='Page --'; return;
    }
    if(resetPage)window.BITEM_CTRL_PAGE=1;
    const filtered=filterRows(rows);
    const size=parseInt((document.getElementById('bItemControlPageSize')||{}).value||'100',10)||100;
    const pages=Math.max(1,Math.ceil(filtered.length/size));window.BITEM_CTRL_PAGE=Math.min(Math.max(1,window.BITEM_CTRL_PAGE||1),pages);
    const k=STATE.kpi||{}; if(cnt)cnt.textContent=`B Items: ${filtered.length.toLocaleString()} | Total D1: ${STATE.total.toLocaleString()} | Active: ${Number(k.active_total||0).toLocaleString()} | Removed: ${Number(k.removed_total||0).toLocaleString()}`; if(info)info.textContent=`Page ${window.BITEM_CTRL_PAGE} of ${pages}`;
    const start=(window.BITEM_CTRL_PAGE-1)*size;
    const page=filtered.slice(start,start+size);
    body.innerHTML=page.map(x=>{
      const r=x.rec,d=x.disp; const warn=Number(d.active)===0;
      return `<tr class="${warn?'warn-row':''}"><td class="bitem-action-col"><button class="bitem-edit-btn" type="button" onclick="window.bitemStartSystemClearedEdit('${encodeURIComponent(d.bitem_id)}','${encodeURIComponent(d.fingerprint)}','${encodeURIComponent(d.user_cleared||'')}')">✏️ Edit</button></td><td class="bitem-id-col">${esc(d.bitem_id)}</td><td>${esc(d.tp_no)}</td><td>${esc(d.stage)}</td><td>${esc(d.date)}</td><td>${esc(d.area)}</td><td>${esc(d.iso_no)}</td><td>${esc(d.sheet_no)}</td><td>${esc(d.punch_category)}</td><td>${esc(d.material_type)}</td><td class="bitem-comment-cell" title="${esc(d.comment)}">${esc(d.comment)}</td><td>${pill(d.fms_status)}</td><td>${pill(d.final_status)}</td><td>${esc(d.punch_cleared)}</td><td data-bitem-system-cleared="${esc(d.bitem_id)}">${esc(d.user_cleared)}</td><td>${esc(d.note)}</td></tr>`;
    }).join('')||'<tr><td colspan="16" class="bitem-empty-sync">No rows match current filters.</td></tr>';
  };
  window.bItemPageMove=function(delta){window.BITEM_CTRL_PAGE=(window.BITEM_CTRL_PAGE||1)+(delta||0);return window.renderBItemControl(false);};
  const oldShow=window.showEmployerView;
  window.showEmployerView=function(view,opts){
    const ret=oldShow?oldShow.apply(this,arguments):undefined;
    if(view==='bitem')setTimeout(()=>window.bitemReloadState(),250);
    return ret;
  };
  window.addEventListener('hashchange',()=>{if(location.hash.includes('bitem'))setTimeout(()=>window.bitemReloadState(),300);});
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{ensureReloadButton();if(location.hash.includes('bitem'))window.bitemReloadState();},500);});
})();

;

(function(){
  if(window.__FINAL_V12_STABLE_ROUTER__) return;
  window.__FINAL_V12_STABLE_ROUTER__=true;
  const $=id=>document.getElementById(id);
  const q=s=>document.querySelector(s);
  function safe(fn){try{return fn&&fn();}catch(e){console.warn('[V12]',e.message||e);}}
  function routeFromHash(){const h=String(location.hash||'').toLowerCase(); if(h.includes('monitor'))return 'monitoring'; if(h.includes('bitem'))return 'bitem'; if(h.includes('dashboard'))return 'dashboard'; if(h.includes('login'))return 'login'; return 'home';}
  function appMode(on){document.body.classList.toggle('v12-app-mode',!!on);}
  function contentDiv(){const layout=$('dashboardMainLayout');return layout?[...layout.children].find(el=>!el.classList.contains('sidebar')):null;}
  function ensureMonitoring(){ if(typeof window.ensureAdminMonitoringPage==='function') safe(()=>window.ensureAdminMonitoringPage()); }
  function ensureSideNav(){
    const side=q('#dashboardMainLayout>.sidebar')||q('.sidebar'); if(!side)return;
    ['globalEmployerMenu','adminMenuWrap','sidebarMenuHost','v10SideMenu'].forEach(id=>{const e=$(id); if(e)e.style.display='none';});
    let nav=$('v12SideNav');
    if(!nav){
      nav=document.createElement('div'); nav.id='v12SideNav';
      nav.innerHTML=`<div class="v12-menu-label">Navigation</div><button type="button" class="v12-menu-main" onclick="location.href='/projects.html'"><span>🏠</span><span>Home</span></button><div class="v12-menu-panel"><button type="button" data-v12-view="dashboard">📊 Dashboard</button><button type="button" data-v12-view="bitem">🧾 B Item Control</button><button type="button" data-v12-view="monitoring">🕵️ B Item Monitoring</button></div>`;
      side.insertBefore(nav,side.firstChild);
      nav.querySelector('.v12-menu-main').onclick=function(ev){ev.stopPropagation();nav.classList.toggle('open');};
      nav.querySelectorAll('[data-v12-view]').forEach(b=>b.onclick=function(ev){ev.stopPropagation();nav.classList.remove('open');setView(this.dataset.v12View,{push:true});});
      document.addEventListener('click',ev=>{if(nav&&!nav.contains(ev.target))nav.classList.remove('open');});
    }
    nav.style.display='block';
    const r=routeFromHash()==='home'?'dashboard':routeFromHash();
    nav.querySelectorAll('[data-v12-view]').forEach(b=>b.classList.toggle('active',b.dataset.v12View===r));
  }
  function setHash(view,replace){const h=view==='dashboard'?'#/dashboard':(view==='bitem'?'#/bitem':'#/monitoring'); if(location.hash!==h){try{(replace?history.replaceState:history.pushState).call(history,{route:view,mode:'employer'},'',h);}catch(e){location.hash=h;}}}
  function showPortal(which){appMode(false); if($('dashboardApp'))$('dashboardApp').style.display='none'; if($('portalHome'))$('portalHome').style.display=(which==='home'?'flex':'none'); if($('portalLogin'))$('portalLogin').style.display=(which==='login'?'flex':'none');}
  async function setView(view,opts){
    opts=opts||{}; view=view||'dashboard'; if(view==='home'||view==='login'){showPortal(view);return;}
    appMode(true); try{sessionStorage.setItem('cccAccessMode','employer');}catch(e){}
    if($('portalHome'))$('portalHome').style.display='none'; if($('portalLogin'))$('portalLogin').style.display='none';
    const app=$('dashboardApp'), layout=$('dashboardMainLayout'), b=$('bItemControlPage'); ensureMonitoring(); const m=$('bItemMonitoringPage');
    if(app)app.style.display='flex';
    if(layout){layout.style.display='block'; layout.classList.remove('v12-route-dashboard','v12-route-bitem','v12-route-monitoring'); layout.classList.add('v12-route-'+view);}
    const c=contentDiv(); if(c)c.style.display=(view==='dashboard'?'flex':'none');
    if(b)b.classList.toggle('active',view==='bitem'); if(m)m.classList.toggle('active',view==='monitoring');
    ensureSideNav(); setHash(view,!!opts.replace);
    if(view==='dashboard') setTimeout(()=>safe(()=>window.refresh&&window.refresh(true)),60);
    if(view==='bitem') setTimeout(()=>safe(()=>window.bitemReloadState?window.bitemReloadState():window.renderBItemControl&&window.renderBItemControl(true)),120);
    if(view==='monitoring') setTimeout(()=>safe(()=>window.renderBItemMonitoring&&window.renderBItemMonitoring()),120);
  }
  window.showEmployerView=function(view,opts){return setView(view,opts||{});};
  window.enterDashboardMode=function(mode,opts){try{sessionStorage.setItem('cccAccessMode',mode||'employer');}catch(e){};return setView('dashboard',opts||{replace:true});};
  const oldLogin=window.submitEmployerLogin;
  window.submitEmployerLogin=function(e){
    if(e)e.preventDefault();
    const u=($('portalUser')||{}).value||'', p=($('portalPass')||{}).value||'';
    if(u.trim().toLowerCase()==='ccc'&&p==='ccc2026'){const err=$('portalLoginError');if(err)err.style.display='none';return setView('dashboard',{replace:true}),false;}
    return oldLogin?oldLogin(e):false;
  };
  window.openEmployerLogin=function(){showPortal('login');try{history.pushState({route:'login'},'','#/login');}catch(e){location.hash='#/login';} setTimeout(()=>{const u=$('portalUser');if(u)u.focus();},80);};
  window.openVisitorDashboard=function(){return setView('dashboard',{replace:true});};
  window.backToPortalHome=function(){try{history.pushState({route:'home'},'',location.pathname+location.search);}catch(e){location.hash='';}showPortal('home');};
  function boot(){const r=routeFromHash(); if(r==='home')showPortal('home'); else if(r==='login')showPortal('login'); else setView(r,{replace:true});}
  window.addEventListener('hashchange',()=>{const r=routeFromHash(); if(r==='home')showPortal('home'); else if(r==='login')showPortal('login'); else setView(r,{replace:true});});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();
  setTimeout(boot,500); setTimeout(()=>{if(document.body.classList.contains('v12-app-mode'))ensureSideNav();},1400);
})();

;

(function(){
  if(window.__FINAL_V16_BITEM_D1_CALC_FIX__) return;
  window.__FINAL_V16_BITEM_D1_CALC_FIX__ = true;

  const originalPunchTotalsForDisplay = window.punchTotalsForDisplay || (typeof punchTotalsForDisplay === 'function' ? punchTotalsForDisplay : null);
  const originalBItemRawRowsForFiltered = window.bItemRawRowsForFiltered || (typeof bItemRawRowsForFiltered === 'function' ? bItemRawRowsForFiltered : null);
  const originalIsBPunchCleared = window.isBPunchCleared || (typeof isBPunchCleared === 'function' ? isBPunchCleared : null);
  const originalIsReturnBPunchCleared = window.isReturnBPunchCleared || (typeof isReturnBPunchCleared === 'function' ? isReturnBPunchCleared : null);
  const originalRenderStagesControl = window.renderStagesControl || (typeof renderStagesControl === 'function' ? renderStagesControl : null);
  const originalRefresh = window.refresh || (typeof refresh === 'function' ? refresh : null);

  function C(v){return (v===null||v===undefined||v==='(blank)')?'':String(v).replace(/\s+/g,' ').trim();}
  function U(v){return C(v).toUpperCase();}
  function parseJson(v){try{return v?JSON.parse(v):{};}catch(e){return {};}}
  function rowGet(row,names){
    if(!row)return '';
    try{if(typeof rowValue==='function')return rowValue(row,names)||'';}catch(e){}
    const keys=Object.keys(row||{}), nk=x=>C(x).toUpperCase().replace(/[^A-Z0-9]/g,'');
    for(const n of names){if(row[n]!==undefined&&row[n]!==null&&C(row[n])!=='')return row[n];}
    for(const n of names){const nn=nk(n);const k=keys.find(x=>nk(x)===nn);if(k&&row[k]!==undefined&&row[k]!==null&&C(row[k])!=='')return row[k];}
    return '';
  }
  function tpOf(row){return C(row&&(row.__d1_tp||row.tp_no||row['TP NUMBER']||row['TP Number']||row.TestPackNo||row['TestPack No']||row['Test Pack No']||row['TP No']))||C(rowGet(row,['TP NUMBER','TP No','TP Number','TestPackNo','Test Pack No','TestPack No']));}
  function stageOf(row){return C(row&&(row.__d1_stage||row.construction_stage||row['Construction Stage']||row.Stage))||C(rowGet(row,['Construction Stage','Stage','Current Stage']));}
  function areaOf(row){return C(row&&(row.__d1_area||row.area||row.Area||row.AREA||row['Drawing Areas']))||C(rowGet(row,['Area','AREA','Drawing Areas']));}
  function matOf(row){try{if(typeof bPunchMaterialType==='function')return bPunchMaterialType(row);}catch(e){} return C(row&&(row.__d1_material_type||row.material_type||row['Material TYPE']||row['Material Type']))||C(rowGet(row,['Material TYPE','Material Type','Punch Item Type']))||'Other';}
  function partyOf(row){try{if(typeof bPunchActionParty==='function')return bPunchActionParty(row);}catch(e){} const t=U(row&&(row.Comments||row.Comment||row.__d1_comment));return (t.includes('ENG')||t.includes('ENGINEER'))?'ENG':'CNS';}
  function arr(v){try{if(typeof toMulti==='function')return toMulti(v);}catch(e){} return Array.isArray(v)?(v.length?v:['ALL']):(!C(v)||U(v)==='ALL'?['ALL']:[C(v)]);}
  function isAll(v){return Array.isArray(v)?(!v.length||v.map(U).includes('ALL')):(!C(v)||U(v)==='ALL');}
  function tpMapAll(){const m={};(Array.isArray(window.TP)?window.TP:[]).forEach(r=>{const tp=C(r&&r.tp);if(tp)m[U(tp)]=r;});return m;}
  function filteredTpSet(data){const s=new Set();(Array.isArray(data)?data:(Array.isArray(window.TP)?window.TP:[])).forEach(r=>{const tp=C(r&&r.tp);if(tp)s.add(U(tp));});return s;}
  function rowAreas(row){const raw=areaOf(row);try{return (typeof normalizeAreas==='function'?normalizeAreas(raw):[raw]).map(x=>U(x)).filter(Boolean);}catch(e){return raw?[U(raw)]:[];}}
  function passesArea(row){
    const areaVals=arr(window.F&&window.F.area).map(U), grpVals=arr(window.F&&window.F.areaGrp).map(U);
    if(isAll(areaVals)&&isAll(grpVals))return true;
    const areas=rowAreas(row); if(!areas.length)return false;
    if(!isAll(grpVals)){const ok=areas.some(a=>grpVals.includes(U(typeof areaGroupOf==='function'?areaGroupOf(a):a.charAt(0)))); if(!ok)return false;}
    if(!isAll(areaVals)&&!areas.some(a=>areaVals.includes(a)))return false;
    return true;
  }
  function contractorFromTpInfo(info){const con=U(info&&(info.con||info.contractor||info['CCC / JGC Direct MP']));return con==='CCC'?'CCC':'JGC Direct MP';}
  function d1RowsRaw(){const api=window.bitemSystemAPI||{};return (Array.isArray(api.stateRows)?api.stateRows:[]).filter(r=>Number((r&&r.active)!==undefined?r.active:1)!==0);}
  function d1ToLegacy(r){
    const raw=parseJson(r&&r.row_json); const out=Object.assign({},raw);
    out.__d1=true; out.__d1_tp=C(r&&r.tp_no); out.__d1_stage=C(r&&r.construction_stage); out.__d1_final_status=C(r&&r.final_status);
    out.__d1_final_cleared_date=C(r&&r.final_cleared_date); out.__d1_user_cleared_date=C(r&&r.user_cleared_date); out.__d1_query_cleared_date=C(r&&r.query_cleared_date);
    out.__d1_material_type=C(r&&r.material_type); out.__d1_punch_category=C(r&&r.punch_category)||'B'; out.__d1_area=C(r&&r.area); out.__d1_comment=C(r&&r.comment_text);
    out['TP NUMBER']=out.__d1_tp||C(out['TP NUMBER'])||C(out.TestPackNo)||C(out['TP No']);
    out['Construction Stage']=out.__d1_stage||C(out['Construction Stage'])||C(out.Stage);
    out['Punch Category\n(A/B/C)']=out.__d1_punch_category||C(out['Punch Category\n(A/B/C)'])||C(out['Punch Category (A/B/C)'])||C(out['Punch Category'])||'B';
    out['Material TYPE']=out.__d1_material_type||C(out['Material TYPE'])||C(out['Material Type']); out['Comments']=out.__d1_comment||C(out.Comments)||C(out.Comment); out['Area']=out.__d1_area||C(out.Area);
    if(out.__d1_query_cleared_date)out['Punch Cleared']=out.__d1_query_cleared_date;
    return out;
  }
  function isBRow(row){if(row&&row.__d1)return U(row.__d1_punch_category||'B')==='B';try{return typeof punchCategoryFromRow==='function'?punchCategoryFromRow(row)==='B':U(rowGet(row,['Punch Category\n(A/B/C)','Punch Category (A/B/C)','Punch Category']))==='B';}catch(e){return U(rowGet(row,['Punch Category\n(A/B/C)','Punch Category (A/B/C)','Punch Category']))==='B';}}
  function isStageCnsB(row){const s=U(stageOf(row));return s.includes('QC PRETESTPACK PUNCH LIST')||s.includes('RETURN FOR REINSTATEMENT')||s.includes('RETURN WITH BACK PUNCH')||s.includes('SAPID PUNCH LIST');}
  function isStageReturnB(row){return U(stageOf(row)).includes('QC PUNCH LIST RETURN');}
  function isCleared(row){if(row&&row.__d1){if(U(row.__d1_final_status)==='CLEARED')return true; if(C(row.__d1_final_cleared_date)||C(row.__d1_user_cleared_date))return true; return false;} try{return originalIsBPunchCleared?originalIsBPunchCleared(row,{}):!!C(rowGet(row,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date']));}catch(e){return !!C(rowGet(row,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date']));}}
  function filteredBRowsForCurrent(data){
    const d1=d1RowsRaw(); let source=d1.length?d1.map(d1ToLegacy):(originalBItemRawRowsForFiltered?(originalBItemRawRowsForFiltered(data).rows||[]):(Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:[]));
    const allTp=tpMapAll(), tps=filteredTpSet(data), conFilter=C(window.F&&window.F.con); const rows=[], tpLookup={};
    source.forEach(row=>{
      if(!isBRow(row))return; const tp=U(tpOf(row)); const info=allTp[tp]||null;
      if(tp&&allTp[tp]){if(tps.size&&!tps.has(tp))return;} else if(conFilter==='CCC') return;
      const derived=info?contractorFromTpInfo(info):'JGC Direct MP';
      if(conFilter==='CCC'&&derived!=='CCC')return; if(conFilter==='JGC Direct MP'&&derived!=='JGC Direct MP')return;
      if(!passesArea(row))return; rows.push(row); if(info&&tp)tpLookup[tpOf(row)]=info;
    });
    return {rows,tpLookup,fromD1:!!d1.length};
  }
  function allBTotals(data){const src=filteredBRowsForCurrent(data); const b={total:0,cleared:0}; src.rows.forEach(r=>{b.total++; if(isCleared(r))b.cleared++;}); return b;}
  function stageBTotals(data){const src=filteredBRowsForCurrent(data); const cns={total:0,cleared:0}, ret={total:0,cleared:0}, rows=[]; src.rows.forEach(r=>{if(isStageCnsB(r)){cns.total++; if(isCleared(r))cns.cleared++; rows.push(r);} else if(isStageReturnB(r)){ret.total++; if(isCleared(r))ret.cleared++; rows.push(r);}}); return {cns,ret,rows};}

  window.bItemRawRowsForFiltered=function(data){return filteredBRowsForCurrent(data);}; try{bItemRawRowsForFiltered=window.bItemRawRowsForFiltered;}catch(e){}
  window.isBPunchCleared=function(row,tpInfo){return isCleared(row);}; try{isBPunchCleared=window.isBPunchCleared;}catch(e){}
  window.isReturnBPunchCleared=function(row,tpInfo){return isCleared(row);}; try{isReturnBPunchCleared=window.isReturnBPunchCleared;}catch(e){}
  window.punchTotalsForDisplay=function(data){const base=originalPunchTotalsForDisplay?originalPunchTotalsForDisplay(data):(typeof punchTotals==='function'?punchTotals(data):{A:{total:0,cleared:0},B:{total:0,cleared:0},C:{total:0,cleared:0}}); return {A:base.A||{total:0,cleared:0},B:allBTotals(data),C:base.C||{total:0,cleared:0}};}; try{punchTotalsForDisplay=window.punchTotalsForDisplay;}catch(e){}
  window.bPunchControlTotals=function(data){const s=stageBTotals(data); return {cns:s.cns,ret:s.ret};}; try{bPunchControlTotals=window.bPunchControlTotals;}catch(e){}

  function repaintStageControl(){try{if(window.__V46_BITEM_D1_REQUEST_CONTROLLER__||window.__V48_STAGE_CONTROL_BITEM_SINGLE_OWNER__)return; if(window.currentPage!=='stagescontrol')return; const data=typeof getFiltered==='function'?getFiltered():[]; const s=stageBTotals(data); const box=document.getElementById('bPunchControlBoxes'); if(box&&typeof controlPunchBox==='function')box.innerHTML=controlPunchBox('CNS B Punch',s.cns,'var(--orange)')+controlPunchBox('QC Return B Punch',s.ret,'var(--accent2)'); const pEl=document.getElementById('bPunchTypeChart'); if(pEl&&typeof miniHbar==='function')pEl.innerHTML=miniHbar([['CNS',s.rows.filter(r=>partyOf(r)==='CNS').length],['ENG',s.rows.filter(r=>partyOf(r)==='ENG').length]],'linear-gradient(90deg,var(--accent),rgba(34,211,238,.35))'); const mEl=document.getElementById('bPunchMatChart'); if(mEl&&typeof miniHbar==='function'&&typeof groupRowsByCount==='function')mEl.innerHTML=miniHbar(groupRowsByCount(s.rows,matOf),'linear-gradient(90deg,var(--accent2),rgba(124,58,237,.35))');}catch(e){console.warn('[V16] stage repaint failed:',e);}}
  window.renderStagesControl=function(data){const out=originalRenderStagesControl?originalRenderStagesControl.apply(this,arguments):undefined; setTimeout(repaintStageControl,0); return out;}; try{renderStagesControl=window.renderStagesControl;}catch(e){}
  async function loadD1ForPunch(){const api=window.bitemSystemAPI||(window.bitemSystemAPI={}); if(Array.isArray(api.stateRows)&&api.stateRows.length)return true; if(location.protocol==='file:'||api.__v16Loading)return false; api.__v16Loading=true; try{const headers={'content-type':'application/json'}; try{const t=localStorage.getItem('ccc_bitem_auth_token')||''; if(t)headers.authorization='Bearer '+t;}catch(e){} const res=await fetch('/api/bitem/state?include_removed=1&limit=50000&t='+Date.now(),{headers,cache:'no-store'}); const data=await res.json().catch(()=>({})); if(res.ok&&Array.isArray(data.rows)){api.stateRows=data.rows; api.stateKpi=data.kpi||{}; api.total=Number(data.total||data.rows.length||0); window.__BITEM_D1_FULL_READY=true; return true;}}catch(e){console.warn('[V16] D1 punch load skipped:',e.message||e);}finally{api.__v16Loading=false;} return false;}
  function rerender(){try{if(typeof refresh==='function')refresh(true);}catch(e){} try{repaintStageControl();}catch(e){}}
  function boot(){loadD1ForPunch().then(ok=>{if(ok)rerender();});}
  if(originalRefresh){window.refresh=function(){const out=originalRefresh.apply(this,arguments); setTimeout(()=>{loadD1ForPunch().then(ok=>{if(ok)repaintStageControl();});},0); return out;}; try{refresh=window.refresh;}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,500)); else setTimeout(boot,500);
  window.addEventListener('hashchange',()=>setTimeout(boot,500));
})();

;

(function(){
  if(window.__FINAL_V21_REINST_FILTER_BITEM_FIX__) return;
  window.__FINAL_V21_REINST_FILTER_BITEM_FIX__=true;

  const REINST_CCC = new Set(["DPCU-FW-TP-033", "599-PC-01-TP-0001", "599-PC-01-TP-0002", "599-PC-01-TP-0003", "599-PC-01-TP-0004", "599-PC-01-TP-0006", "599-PC-01-TP-0007", "599-NT-01-TP-0092", "599-NT-01-TP-0116", "599-OW-01-TP-0220", "599-PC-01-TP-0029", "599-OW-01-TP-0510", "599-OW-01-TP-0521", "599-PC-01-TP-0035", "599-WG-01-TP-0110", "599-WG-01-TP-0107", "599-PC-01-TP-0036", "599-PC-01-TP-0037", "599-PC-01-TP-0040", "599-WG-01-TP-0056", "599-HS-01-TP-0524", "599-NT-01-TP-0533", "599-OW-01-TP-0527", "599-OW-01-TP-0536", "599-OW-01-TP-0537", "599-OW-01-TP-0359", "599-PR-01-TP-0098", "599-OW-01-TP-0129", "599-DG-01-TP-0902", "599-DG-01-TP-0903", "599-DG-01-TP-0905", "599-DG-01-TP-0906", "599-DG-01-TP-0907", "599-DG-01-TP-0923", "599-WG-01-TP-0113", "599-WG-01-TP-0114", "599-WG-01-TP-0115", "599-WG-01-TP-0120", "599-PC-01-TP-0001A", "599-WG-01-TP-0900", "599-PR-01-TP-0922", "599-PR-01-TP-0921", "599-PR-01-TP-0920", "599-PR-01-TP-0919", "599-PR-01-TP-0917", "599-DG-01-TP-0901", "599-WG-01-TP-0913", "599-PR-01-TP-0948", "599-PR-01-TP-0960", "599-PR-01-TP-0954", "599-PR-01-TP-0961", "599-PR-01-TP-0964", "599-FG-01-TP-1034", "599-SC-01-TP-0074", "599-FG-01-TP-1035", "599-DG-01-TP-0401", "599-SC-01-TP-0075", "599-OW-01-TP-1057", "599-OW-01-TP-1197", "599-OW-01-TP-0858", "599-OW-01-TP-0856", "599-OW-01-TP-1373", "599-OW-01-TP-1355", "599-OW-01-TP-0506", "599-OW-01-TP-0322", "599-FG-01-TP-0349", "599-NT-01-TP-0326", "599-OW-01-TP-0362", "599-WG-01-TP-0400", "599-OW-01-TP-0296", "599-OW-01-TP-0295", "599-OW-01-TP-0292", "599-OW-01-TP-0297", "599-PR-01-TP-1183", "599-PR-01-TP-1202", "599-WG-01-TP-1091", "599-DG-01-TP-0275", "DPCU-FW-TP-088", "599-NT-01-TP-1175", "599-PR-01-TP-0869", "599-NT-01-TP-1173", "599-PR-01-TP-1162", "599-FG-01-TP-1242", "599-DG-01-TP-1111", "599-PR-01-TP-0975", "599-NT-01-TP-1174", "599-PC-01-TP-0054", "599-WG-01-TP-1096", "599-WG-01-TP-1498", "599-WG-01-TP-0122", "599-WG-01-TP-1094", "599-PR-01-TP-1214", "599-PR-01-TP-1146", "599-WG-01-TP-1093", "599-PC-01-TP-1359", "599-PC-01-TP-1360", "599-DG-01-TP-0403", "599-OW-01-TP-0364", "599-PC-01-TP-1358", "599-WG-01-TP-1095", "599-PC-01-TP-1361", "599-PC-01-TP-1363", "599-PR-01-TP-1145", "599-PR-01-TP-1365", "599-DG-01-TP-1113", "599-DG-01-TP-1102", "599-PR-01-TP-1185", "599-PR-01-TP-1217", "599-PR-01-TP-1218", "599-OW-01-TP-0577", "599-PR-01-TP-0949", "599-UA-01-TP-1237", "599-IA-01-TP-1059", "599-IA-01-TP-1060", "599-IA-01-TP-1061", "599-IA-01-TP-1062", "599-IA-01-TP-1063", "599-IA-01-TP-1064", "599-IA-01-TP-1066", "599-IA-01-TP-1070", "599-IA-01-TP-1065", "599-IA-01-TP-1067", "599-IA-01-TP-1068", "599-FW-02-TP-1444", "599-FW-02-TP-1441", "599-FW-02-TP-1442", "599-FW-02-TP-1443", "599-FG-01-TP-0350", "599-DG-01-TP-1114", "599-DG-01-TP-0874", "599-DG-01-TP-1110", "599-DG-01-TP-0601", "599-WG-01-TP-0103", "599-WG-01-TP-0105", "599-WG-01-TP-0099", "599-WG-01-TP-0100", "599-WG-01-TP-0101", "599-WG-01-TP-0121", "599-WG-01-TP-0371", "599-WG-01-TP-0898", "599-WG-01-TP-0899", "599-WG-01-TP-1530", "599-DG-01-TP-1109", "599-DG-01-TP-1117", "599-DG-01-TP-1126", "599-DG-01-TP-1528", "599-OW-01-TP-1054", "599-OW-01-TP-1056", "599-OW-01-TP-0365", "599-OW-01-TP-0502", "599-OW-01-TP-0504", "599-OW-01-TP-0518", "599-OW-01-TP-0519", "599-OW-01-TP-0529", "599-HS-01-TP-1189", "599-SC-01-TP-0130", "599-SC-01-TP-0207", "599-SC-01-TP-0209", "599-SC-01-TP-0245", "599-SC-01-TP-0246", "599-SC-01-TP-0834", "599-SC-01-TP-0837", "599-SC-01-TP-0243", "599-SC-01-TP-0244", "599-SC-01-TP-0257", "599-SC-01-TP-0073", "599-PR-01-TP-0165", "599-PR-01-TP-0168", "599-PR-01-TP-1216", "599-PR-01-TP-1148", "599-PR-01-TP-1176", "599-PR-01-TP-0167", "599-PR-01-TP-0171", "599-PR-01-TP-0231", "599-PR-01-TP-0234", "599-PR-01-TP-0278", "599-PR-01-TP-0284", "599-PR-01-TP-0288", "599-PR-01-TP-0409", "599-PR-01-TP-0410", "599-PR-01-TP-0411", "599-PR-01-TP-0412", "599-PR-01-TP-0413", "599-PR-01-TP-0414", "599-PR-01-TP-0873", "599-PR-01-TP-0974", "599-PR-01-TP-1122", "599-PR-01-TP-0866", "599-PR-01-TP-0868", "599-PR-01-TP-1143", "599-PR-01-TP-1178", "599-WG-01-TP-1235", "599-WG-01-TP-1354", "599-DG-01-TP-0294", "599-PC-01-TP-1523", "599-PC-01-TP-1531", "599-RL-02-TP-0236", "599-FG-01-TP-1232", "599-FG-01-TP-1233", "599-FG-01-TP-1234", "599-PC-01-TP-0301", "599-PC-01-TP-0302", "599-PC-01-TP-1131", "599-PC-01-TP-1132", "599-DG-01-TP-1537", "599-PC-01-TP-1548", "599-PC-01-TP-0307", "599-PC-01-TP-0308", "599-PC-01-TP-1135", "599-OW-01-TP-1254", "599-FG-01-TP-1243", "599-FG-01-TP-0814", "599-FG-01-TP-0872", "599-FG-01-TP-0343", "599-FG-01-TP-0341", "599-FG-01-TP-0342", "599-FG-01-TP-1033", "599-FG-01-TP-1375", "599-WG-01-TP-0128", "599-WG-01-TP-0132", "599-WG-01-TP-0133", "599-PC-01-TP-1088", "599-RL-02-TP-0221", "599-HS-01-TP-1187", "599-HS-01-TP-1193", "599-HS-01-TP-1206", "599-WG-01-TP-0273", "599-NT-01-TP-0323", "599-NT-01-TP-0840", "599-NT-01-TP-1352", "599-NT-01-TP-0156", "599-NT-01-TP-0331", "599-NT-01-TP-0340", "599-NT-01-TP-1099", "599-NT-01-TP-0269", "599-NT-01-TP-0271", "599-NT-01-TP-0293", "599-NT-01-TP-0418", "599-NT-01-TP-0419", "599-NT-01-TP-1104", "599-NT-01-TP-1105", "599-NT-01-TP-1118", "599-NT-01-TP-0330", "599-NT-01-TP-1180", "599-WG-01-TP-0089", "599-WG-01-TP-0117", "599-WG-01-TP-0914", "599-WG-01-TP-1532", "599-DG-01-TP-1124", "599-DG-01-TP-1127", "599-DG-01-TP-1533", "599-WG-01-TP-0051", "599-DG-01-TP-1112", "599-PC-01-TP-1529", "599-PC-01-TP-1543", "599-PC-01-TP-0318", "599-PC-01-TP-1128", "599-PC-01-TP-0320", "599-OW-01-TP-0579", "599-OW-01-TP-0578", "599-SO-01-TP-0772", "599-PR-01-TP-0953", "599-PR-01-TP-0965", "599-PR-01-TP-0966", "599-PR-01-TP-1181", "599-PR-01-TP-1182", "599-PR-01-TP-1186", "599-PR-01-TP-1201", "599-PR-01-TP-1203", "599-PR-01-TP-1204", "599-PR-01-TP-1205", "599-IA-01-TP-1073", "599-FW-02-TP-1438", "599-FW-02-TP-1439", "599-FW-02-TP-1440", "599-FW-02-TP-1410", "599-FW-02-TP-1411", "599-FW-02-TP-1412", "599-FW-02-TP-1413", "599-FW-02-TP-1414", "599-FW-02-TP-1415", "599-FW-02-TP-1416", "599-FW-02-TP-1417", "599-FW-02-TP-1418", "599-FW-02-TP-1419", "599-FW-02-TP-1420", "599-FW-02-TP-1421", "599-FW-02-TP-1422", "599-FW-02-TP-1423", "599-FW-02-TP-1424", "599-FW-02-TP-1425", "599-FW-02-TP-1426", "599-FW-02-TP-1427", "599-FW-02-TP-1428", "599-FW-02-TP-1429", "599-FW-02-TP-1430", "599-FW-02-TP-1431", "599-FW-02-TP-1432", "599-FW-02-TP-1433", "599-FW-02-TP-1434", "599-FW-02-TP-1435", "599-FW-02-TP-1436", "599-FW-02-TP-1437", "599-OW-01-TP-0111", "599-HS-01-TP-1188", "599-HS-01-TP-1207", "599-WG-01-TP-1090", "599-PC-01-TP-1362", "599-PR-01-TP-0867", "599-PR-01-TP-1147", "DPCU-FW-TP-087", "DPCU-FW-TP-09", "DPCU-FW-TP-014", "DPCU-FW-TP-016", "DPCU-FW-TP-023", "DPCU-FW-TP-027", "DPCU-FW-TP-028", "DPCU-FW-TP-032", "DPCU-FW-TP-034", "DPCU-FW-TP-035", "DPCU-FW-TP-036", "DPCU-FW-TP-037", "DPCU-FW-TP-04", "DPCU-FW-TP-040", "DPCU-FW-TP-041", "DPCU-FW-TP-042", "DPCU-FW-TP-049", "DPCU-FW-TP-054", "DPCU-FW-TP-061", "DPCU-FW-TP-065", "DPCU-FW-TP-066", "DPCU-FW-TP-070", "DPCU-FW-TP-071", "DPCU-FW-TP-072", "DPCU-FW-TP-073", "DPCU-FW-TP-074", "DPCU-FW-TP-075", "DPCU-FW-TP-077", "DPCU-FW-TP-078", "DPCU-FW-TP-082", "DPCU-FW-TP-083", "DPCU-FW-TP-084", "DPCU-FW-TP-085", "DPCU-FW-TP-017", "DPCU-FW-TP-018", "DPCU-FW-TP-022", "DPCU-FW-TP-024", "DPCU-FW-TP-038", "DPCU-FW-TP-039", "DPCU-FW-TP-050", "DPCU-FW-TP-051", "DPCU-FW-TP-059", "DPCU-FW-TP-060", "DPCU-FW-TP-062", "DPCU-FW-TP-064", "DPCU-FW-TP-076", "DPCU-FW-TP-080", "DPCU-FW-TP-081", "DPCU-FW-TP-015", "DPCU-FW-TP-019", "DPCU-FW-TP-020", "DPCU-FW-TP-021", "DPCU-FW-TP-025", "DPCU-FW-TP-026", "DPCU-FW-TP-029", "DPCU-FW-TP-031", "DPCU-FW-TP-043", "DPCU-FW-TP-045", "DPCU-FW-TP-046", "DPCU-FW-TP-047", "DPCU-FW-TP-048", "DPCU-FW-TP-052", "DPCU-FW-TP-055", "DPCU-FW-TP-056", "DPCU-FW-TP-057", "DPCU-FW-TP-058", "DPCU-FW-TP-079", "DPCU-FW-TP-086", "599-PC-01-TP-1129", "599-PC-01-TP-1133", "599-PC-01-TP-0303", "599-IA-01-TP-1073K", "599-IA-01-TP-1073L", "599-IA-01-TP-1073S", "599-IA-01-TP-1073T", "599-IA-01-TP-1073U", "599-IA-01-TP-1073M", "599-IA-01-TP-1073B", "599-IA-01-TP-1073A", "599-IA-01-TP-1073E", "599-IA-01-TP-1073V", "599-IA-01-TP-1073F", "599-IA-01-TP-1073G", "599-IA-01-TP-1073I", "599-IA-01-TP-1073J", "599-IA-01-TP-1073Q", "599-IA-01-TP-1073H", "599-IA-01-TP-1073R", "599-IA-01-TP-1073N", "599-IA-01-TP-1073D", "599-IA-01-TP-1073O", "599-IA-01-TP-1073P", "599-IA-01-TP-1073C", "599-FW-02-TP-1696", "599-FW-02-TP-1697", "599-FW-02-TP-1698", "599-FW-02-TP-1699", "599-FW-02-TP-1700", "599-IA-01-TP-1073W", "599-PR-01-TP-1716", "599-PR-01-TP-1724", "599-RL-02-TP-0236A", "599-SC-01-TP-0251A", "599-WG-01-TP-1731", "599-NT-01-TP-0156A", "599-PR-01-TP-1143A", "599-RL-02-TP-1735", "599-WG-01-TP-0100A", "599-WG-01-TP-0100B", "599-WG-01-TP-0100C", "599-DG-01-TP-1109A", "599-DG-01-TP-1109B", "599-DG-01-TP-1109C", "599-DG-01-TP-1109D", "599-PR-01-TP-0869A", "599-UA-01-TP-1237A", "599-WG-01-TP-0104A", "599-NT-01-TP-1736", "599-PR-01-TP-1146R1"].map(x=>String(x||'').trim().toUpperCase()).filter(Boolean));

  const oldPunchTotalsForDisplay = (typeof punchTotalsForDisplay==='function') ? punchTotalsForDisplay : window.punchTotalsForDisplay;
  const oldRenderStagesControl = (typeof renderStagesControl==='function') ? renderStagesControl : window.renderStagesControl;
  const oldRefresh = (typeof refresh==='function') ? refresh : window.refresh;
  const oldSetF = (typeof setF==='function') ? setF : window.setF;
  const oldResetFilters = (typeof resetFilters==='function') ? resetFilters : window.resetFilters;

  function C(v){return (v===null||v===undefined||v==='(blank)')?'':String(v).replace(/\s+/g,' ').trim();}
  function U(v){return C(v).toUpperCase();}
  function esc(v){return C(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function FObj(){try{return F||{};}catch(e){return window.F||{};}}
  function toArr(v){try{return (typeof toMulti==='function')?toMulti(v):(Array.isArray(v)?v:[v]);}catch(e){return Array.isArray(v)?v:[v];}}
  function all(v){const a=toArr(v).map(U).filter(Boolean);return !a.length||a.includes('ALL');}
  function normArr(v){return toArr(v).map(U).filter(Boolean);}
  function rowGet(row,names){
    if(!row)return '';
    try{if(typeof rowValue==='function'){const x=rowValue(row,names); if(C(x))return x;}}catch(e){}
    const keys=Object.keys(row||{}), nk=x=>U(x).replace(/[^A-Z0-9]/g,'');
    for(const n of names){if(row[n]!==undefined&&C(row[n]))return row[n];}
    for(const n of names){const nn=nk(n); const k=keys.find(x=>nk(x)===nn); if(k&&C(row[k]))return row[k];}
    return '';
  }
  function tpOfRow(r){return C(r&&(r.__d1_tp||r.tp_no||r.tp||r['TP NUMBER']||r['TP Number']||r.TestPackNo||r['Test Pack No']||r['TP No'])) || C(rowGet(r,['TP NUMBER','TP No','TP Number','TestPackNo','Test Pack No','TestPack No']));}
  function stageOfRow(r){return C(r&&(r.__d1_stage||r.construction_stage||r['Construction Stage']||r.Stage)) || C(rowGet(r,['Construction Stage','Stage','Current Stage','Punch Stage']));}
  function areaOfRow(r){return C(r&&(r.__d1_area||r.area||r.Area||r.AREA)) || C(rowGet(r,['Area','AREA','Drawing Areas']));}
  function matOfRow(r){return C(r&&(r.__d1_material_type||r.material_type||r['Material TYPE']||r['Material Type'])) || C(rowGet(r,['Material TYPE','Material Type','Material','Punch Item Type'])) || 'Other';}
  function commentOfRow(r){return C(r&&(r.__d1_comment||r.comment_text||r.Comments||r.Comment)) || C(rowGet(r,['Comments','Comment','Remarks','Remark']));}
  function punchCatOfRow(r){return U(r&&(r.__d1_punch_category||r.punch_category)) || U(rowGet(r,['Punch Category\n(A/B/C)','Punch Category (A/B/C)','Punch Category','Category']));}
  function isBRow(r){const p=punchCatOfRow(r); if(p)return p==='B'; try{return typeof punchCategoryFromRow==='function' ? punchCategoryFromRow(r)==='B' : true;}catch(e){return true;}}
  function isReinstCCC(tp){return REINST_CCC.has(U(tp));}
  function reinstContractorOfTp(tp){return isReinstCCC(tp)?'CCC':'JGC Direct MP';}
  function tpInfoMap(){const m={}; (Array.isArray(window.TP)?window.TP:(typeof TP!=='undefined'?TP:[])).forEach(r=>{const tp=U(r&&r.tp); if(tp)m[tp]=r;}); return m;}
  function areasOfRow(r){
    const raw=areaOfRow(r);
    try{return (typeof normalizeAreas==='function'?normalizeAreas(raw):[raw]).map(U).filter(Boolean);}catch(e){return raw?[U(raw)]:[];}
  }
  function areaPassRow(r){
    const f=FObj(), areaVals=normArr(f.area), grpVals=normArr(f.areaGrp);
    if(all(f.area)&&all(f.areaGrp))return true;
    const a=areasOfRow(r); if(!a.length)return false;
    if(!all(f.areaGrp)){
      const ok=a.some(x=>{let g=x; try{g=U(areaGroupOf(x));}catch(e){g=U(x.charAt(0));} return grpVals.includes(g);});
      if(!ok)return false;
    }
    if(!all(f.area)&&!a.some(x=>areaVals.includes(x)))return false;
    return true;
  }
  function systemPassTpInfo(info){const f=FObj(); if(all(f.sys))return true; if(!info)return true; return normArr(f.sys).includes(U(info.sys));}
  function stagePassRowOrTp(r,info){
    const f=FObj(); if(all(f.stage))return true;
    const vals=normArr(f.stage); const rs=U(stageOfRow(r));
    if(rs && vals.some(v=>rs===v||rs.includes(v)))return true;
    if(info){try{return vals.some(st=>st==='CNS L/C COMPLETED'?hasCnsLC(info):hasStage(info,st));}catch(e){}}
    return false;
  }
  function specialBaseTpData(){
    const f=FObj(); let oldCon=f.con, out=[];
    try{ f.con='ALL'; if(typeof FILTER_CACHE!=='undefined')FILTER_CACHE={key:'',data:null}; out=(typeof getFiltered==='function'?getFiltered():((typeof TP!=='undefined'&&Array.isArray(TP))?TP:[])).slice(); }
    catch(e){ out=((typeof TP!=='undefined'&&Array.isArray(TP))?TP:[]).slice(); }
    finally{ try{f.con=oldCon; if(typeof FILTER_CACHE!=='undefined')FILTER_CACHE={key:'',data:null};}catch(e){} }
    const con=C(oldCon);
    if(con==='CCC')out=out.filter(r=>isReinstCCC(r&&r.tp));
    else if(con==='JGC Direct MP')out=out.filter(r=>!isReinstCCC(r&&r.tp));
    return out;
  }
  function d1RawRows(){const api=window.bitemSystemAPI||{}; return Array.isArray(api.stateRows)?api.stateRows.filter(r=>Number(r&&r.active!==undefined?r.active:1)!==0):[];}
  function parseJson(v){try{return v?JSON.parse(v):{};}catch(e){return {};}}
  function d1ToRow(r){
    const raw=parseJson(r&&r.row_json); const o=Object.assign({},raw);
    o.__d1=true; o.__source=r;
    o.__d1_tp=C(r&&r.tp_no); o.__d1_stage=C(r&&r.construction_stage); o.__d1_area=C(r&&r.area);
    o.__d1_comment=C(r&&r.comment_text); o.__d1_material_type=C(r&&r.material_type); o.__d1_punch_category=C(r&&r.punch_category)||'B';
    o.__d1_final_status=C(r&&r.final_status); o.__d1_final_cleared_date=C(r&&r.final_cleared_date); o.__d1_user_cleared_date=C(r&&r.user_cleared_date); o.__d1_query_cleared_date=C(r&&r.query_cleared_date);
    o['TP NUMBER']=o.__d1_tp||C(o['TP NUMBER'])||C(o.TestPackNo)||C(o['TP No']);
    o['Construction Stage']=o.__d1_stage||C(o['Construction Stage'])||C(o.Stage);
    o['Area']=o.__d1_area||C(o.Area); o['Comments']=o.__d1_comment||C(o.Comments)||C(o.Comment);
    o['Material TYPE']=o.__d1_material_type||C(o['Material TYPE'])||C(o['Material Type']);
    o['Punch Category\n(A/B/C)']=o.__d1_punch_category||C(o['Punch Category\n(A/B/C)'])||'B';
    if(o.__d1_query_cleared_date)o['Punch Cleared']=o.__d1_query_cleared_date;
    return o;
  }
  function bItemSourceRows(){
    const d=d1RawRows();
    if(d.length)return d.map(d1ToRow);
    return (Array.isArray(window.B_ITEM_ROWS)?window.B_ITEM_ROWS:(typeof B_ITEM_ROWS!=='undefined'?B_ITEM_ROWS:[])).slice();
  }
  function isCleared(r){
    if(r&&r.__d1){return U(r.__d1_final_status)==='CLEARED'||!!C(r.__d1_final_cleared_date)||!!C(r.__d1_user_cleared_date);}
    try{if(typeof punchRowHasClearedDate==='function'&&punchRowHasClearedDate(r))return true;}catch(e){}
    return !!C(rowGet(r,['Punch Cleared','Punched Cleared','Punch Clear Date','Cleared Date']));
  }
  function cnsBStage(r){const s=U(stageOfRow(r)); return s.includes('QC PRETESTPACK PUNCH LIST')||s.includes('RETURN FOR REINSTATEMENT')||s.includes('RETURN WITH BACK PUNCH')||s.includes('SAPID PUNCH LIST');}
  function retBStage(r){return U(stageOfRow(r)).includes('QC PUNCH LIST RETURN');}
  function actionParty(r){try{return bPunchActionParty(r)==='ENG'?'ENG':'CNS';}catch(e){const t=U(commentOfRow(r)); return (t.includes('ENG')||t.includes('ENGINEER'))?'ENG':'CNS';}}
  function matType(r){try{return bPunchMaterialType(r)||matOfRow(r);}catch(e){return matOfRow(r)||'Other';}}
  function rowPassSpecialBItem(r){
    if(!isBRow(r))return false;
    const f=FObj(), con=C(f.con), tp=tpOfRow(r), info=tpInfoMap()[U(tp)]||null;
    if(con==='CCC'&&!isReinstCCC(tp))return false;
    if(con==='JGC Direct MP'&&isReinstCCC(tp))return false;
    if(!areaPassRow(r))return false;
    if(!systemPassTpInfo(info))return false;
    if(!stagePassRowOrTp(r,info))return false;
    return true;
  }
  const cache={key:'',rows:null,stamp:0};
  function specialBRows(){
    const f=FObj(); const src=bItemSourceRows(); const key=JSON.stringify({con:f.con,area:f.area,areaGrp:f.areaGrp,sys:f.sys,stage:f.stage,n:src.length,ready:!!(window.bitemSystemAPI&&window.bitemSystemAPI.stateRows&&window.bitemSystemAPI.stateRows.length)});
    if(cache.key===key&&cache.rows)return cache.rows;
    const tpLookup=tpInfoMap();
    const rows=src.filter(rowPassSpecialBItem);
    const out={rows,tpLookup,fromD1:!!d1RawRows().length};
    cache.key=key; cache.rows=out; cache.stamp=Date.now(); return out;
  }
  function allBTotals(){const s=specialBRows(); let total=0,cleared=0; s.rows.forEach(r=>{total++; if(isCleared(r))cleared++;}); return {total,cleared};}
  function stageBTotals(){const s=specialBRows(); const cns={total:0,cleared:0}, ret={total:0,cleared:0}, rows=[]; s.rows.forEach(r=>{if(cnsBStage(r)){cns.total++; if(isCleared(r))cns.cleared++; rows.push(r);} if(retBStage(r)){ret.total++; if(isCleared(r))ret.cleared++; rows.push(r);}}); return {cns,ret,rows};}

  window.bItemRawRowsForFiltered=function(data){return specialBRows();}; try{bItemRawRowsForFiltered=window.bItemRawRowsForFiltered;}catch(e){}
  window.isBPunchCleared=function(r,tp){return isCleared(r);}; try{isBPunchCleared=window.isBPunchCleared;}catch(e){}
  window.isReturnBPunchCleared=function(r,tp){return isCleared(r);}; try{isReturnBPunchCleared=window.isReturnBPunchCleared;}catch(e){}
  window.punchTotalsForDisplay=function(data){
    const base=oldPunchTotalsForDisplay?oldPunchTotalsForDisplay(data):(typeof punchTotals==='function'?punchTotals(data):{A:{total:0,cleared:0},B:{total:0,cleared:0},C:{total:0,cleared:0}});
    return {A:base.A||{total:0,cleared:0}, B:allBTotals(), C:base.C||{total:0,cleared:0}};
  }; try{punchTotalsForDisplay=window.punchTotalsForDisplay;}catch(e){}
  window.bPunchControlTotals=function(data){const s=stageBTotals(); return {cns:s.cns, ret:s.ret};}; try{bPunchControlTotals=window.bPunchControlTotals;}catch(e){}
  window.reinstatementPendingRows=function(data){
    const tpData=specialBaseTpData(); const byTp={}, retByTp={};
    specialBRows().rows.forEach(r=>{const tp=U(tpOfRow(r)); if(!tp)return; if(cnsBStage(r)){const x=byTp[tp]||(byTp[tp]={total:0,cleared:0,cns:0,eng:0}); x.total++; if(isCleared(r))x.cleared++; if(actionParty(r)==='ENG')x.eng++; else x.cns++;} if(retBStage(r)){const y=retByTp[tp]||(retByTp[tp]={total:0,cleared:0}); y.total++; if(isCleared(r))y.cleared++;} });
    return tpData.filter(info=>{try{return hasStage(info,'Return for Reinstatement')&&!hasStage(info,'QC Reinstatement Sign');}catch(e){return false;}}).map(info=>{const tp=U(info.tp), b=byTp[tp]||{total:0,cleared:0,cns:0,eng:0}, rb=retByTp[tp]||{total:0,cleared:0}; const cnsBalance=Math.max((b.cns||0)-Math.min((b.cleared||0),(b.cns||0)),0); return {tp:C(info.tp),current:(typeof currentStageOfTp==='function'?currentStageOfTp(info):''),total:b.total,cleared:b.cleared,balance:Math.max(b.total-b.cleared,0),cns:b.cns,eng:b.eng,cnsReady:cnsBalance===0,retTotal:rb.total,retCleared:rb.cleared,retBalance:Math.max(rb.total-rb.cleared,0)};}).sort((a,b)=>b.balance-a.balance||b.retBalance-a.retBalance||b.total-a.total||a.tp.localeCompare(b.tp,undefined,{numeric:true}));
  }; try{reinstatementPendingRows=window.reinstatementPendingRows;}catch(e){}

  window.renderStagesControl=function(data){
    const specialData=specialBaseTpData();
    const out=oldRenderStagesControl?oldRenderStagesControl.call(this,specialData):undefined;
    setTimeout(()=>{try{
      if(window.__V46_BITEM_D1_REQUEST_CONTROLLER__||window.__V48_STAGE_CONTROL_BITEM_SINGLE_OWNER__)return;
      const s=stageBTotals();
      const box=document.getElementById('bPunchControlBoxes'); if(box&&typeof controlPunchBox==='function')box.innerHTML=controlPunchBox('CNS B Punch',s.cns,'var(--orange)')+controlPunchBox('QC Return B Punch',s.ret,'var(--accent2)');
      const p=document.getElementById('bPunchTypeChart'); if(p&&typeof miniHbar==='function')p.innerHTML=miniHbar([['CNS',s.rows.filter(r=>actionParty(r)==='CNS').length],['ENG',s.rows.filter(r=>actionParty(r)==='ENG').length]],'linear-gradient(90deg,var(--accent),rgba(34,211,238,.35))');
      const m=document.getElementById('bPunchMatChart'); if(m&&typeof miniHbar==='function'&&typeof groupRowsByCount==='function')m.innerHTML=miniHbar(groupRowsByCount(s.rows,matType),'linear-gradient(90deg,var(--accent2),rgba(124,58,237,.35))');
    }catch(e){console.warn('[V21] repaint stage failed',e);}},0);
    return out;
  }; try{renderStagesControl=window.renderStagesControl;}catch(e){}

  function displayId(r){
    const tp=tpOfRow(r); const actual=C(r&&r.__source&&r.__source.bitem_id)||C(r&&r.bitem_id)||C(rowGet(r,['B Item ID','System B Item ID']));
    const suf=(actual.match(/-C\d+$/i)||['-C001'])[0].toUpperCase();
    return (isReinstCCC(tp)?'CCC-B-':'JGC-B-')+tp+suf;
  }
  function actualId(r){return C(r&&r.__source&&r.__source.bitem_id)||C(r&&r.bitem_id)||displayId(r);}
  function fingerprint(r){return C(r&&r.__source&&r.__source.fingerprint)||C(r&&r.fingerprint)||'';}
  function finalStatus(r){return C(r&&r.__source&&r.__source.final_status)||C(r&&r.__d1_final_status)||(isCleared(r)?'CLEARED':'NOT CLEARED');}
  function finalDate(r){return C(r&&r.__source&&r.__source.final_cleared_date)||C(r&&r.__d1_final_cleared_date)||C(rowGet(r,['Punch Cleared','Cleared Date']));}
  function queryStatus(r){return C(r&&r.__source&&r.__source.query_status)||C(r&&r.query_status)||'';}
  function dateOfRow(r){return C(rowGet(r,['Date','DATE']))||C(r&&r.__source&&r.__source.date)||'';}
  function isoOfRow(r){return C(rowGet(r,['ISO No.','ISO No','ISO','Spool','ISO / Spool']))||'';}
  function sheetOfRow(r){return C(rowGet(r,['Sheet No.','Sheet No','Sheet','Sheet Number']))||'';}
  function applySearch(rows){const q=U(document.getElementById('bItemControlSearch')&&document.getElementById('bItemControlSearch').value); if(!q)return rows; return rows.filter(r=>[displayId(r),actualId(r),tpOfRow(r),stageOfRow(r),areaOfRow(r),matOfRow(r),commentOfRow(r),finalStatus(r),queryStatus(r),isoOfRow(r),sheetOfRow(r)].some(x=>U(x).includes(q)));}

  window.__BITEM_COL_FILTERS=window.__BITEM_COL_FILTERS||{};
  function bitemColValue(r,i){
    switch(Number(i)){
      case 1:return displayId(r);
      case 2:return tpOfRow(r);
      case 3:return stageOfRow(r);
      case 4:return dateOfRow(r);
      case 5:return areaOfRow(r);
      case 6:return isoOfRow(r);
      case 7:return sheetOfRow(r);
      case 8:return punchCatOfRow(r)||'B';
      case 9:return matOfRow(r);
      case 10:return commentOfRow(r);
      case 11:return queryStatus(r);
      case 12:return finalStatus(r);
      case 13:return finalDate(r);
      case 14:return v24UserCleared(r);
      case 15:return v24Note(r);
      case 16:return reinstContractorOfTp(tpOfRow(r));
      default:return '';
    }
  }
  function applyBItemColumnFilters(rows){
    const filters=window.__BITEM_COL_FILTERS||{};
    const active=Object.keys(filters).filter(k=>C(filters[k])!=='');
    if(!active.length)return rows;
    return rows.filter(r=>active.every(k=>U(bitemColValue(r,k)).includes(U(filters[k]))));
  }
  window.setBItemColumnFilter=function(i,v){
    window.__BITEM_COL_FILTERS=window.__BITEM_COL_FILTERS||{};
    window.__BITEM_COL_FILTERS[i]=v||'';
    const el=document.activeElement;
    window.__BITEM_COL_FOCUS={i:Number(i),pos:el&&typeof el.selectionStart==='number'?el.selectionStart:String(v||'').length};
    window.__V21_BITEM_PAGE=1;
    clearTimeout(window.__bitemColFilterTimer);
    window.__bitemColFilterTimer=setTimeout(()=>window.renderBItemControl(false),160);
  };
  window.bitemClearColumnFilters=function(){
    window.__BITEM_COL_FILTERS={};
    window.__V21_BITEM_PAGE=1;
    window.renderBItemControl(false);
  };
  function renderBItemFilterCell(h,i,cls){
    if(i===0)return `<th class="${cls}"><button type="button" class="bitem-filter-reset" onclick="window.bitemClearColumnFilters()">Clear</button></th>`;
    const val=(window.__BITEM_COL_FILTERS&&window.__BITEM_COL_FILTERS[i])||'';
    return `<th class="${cls}"><input class="bitem-col-filter" data-bitem-col-filter="${i}" value="${esc(val)}" placeholder="Filter..." title="Filter ${esc(h)}" oninput="window.setBItemColumnFilter(${i},this.value)" onclick="event.stopPropagation()"></th>`;
  }
  function restoreBItemFilterFocus(){
    const f=window.__BITEM_COL_FOCUS; if(!f)return;
    const el=document.querySelector(`[data-bitem-col-filter="${f.i}"]`);
    if(el){try{el.focus(); const p=Math.min(f.pos||0,el.value.length); el.setSelectionRange(p,p);}catch(e){}}
  }
  function v24StatusText(v){
    const raw=C(v);
    const u=U(raw);
    if(!u||u==='OPEN'||u==='NOT CLEARED') return 'NOT CLEARED';
    if(u==='CLEARED') return 'CLEARED';
    return raw;
  }
  function v24StatusPill(v){
    const s=v24StatusText(v), u=U(s);
    const cls=u==='CLEARED'?'cleared':(u.includes('REMOVED')?'removed':'open');
    const label=u==='CLEARED'?'✓ CLEARED':s;
    return `<span class="bitem-status-pill ${cls}">${esc(label)}</span>`;
  }
  function v24Note(r){
    const src=(r&&r.__source)||r||{};
    const n=C(src.sync_note)||C(src.source_flag)||C(rowGet(r,['Note','NOTES','Sync Note','Source Flag']));
    const u=U(n);
    if(u.includes('STAGE_CLOSED')||u.includes('CLOSURE OF THE CURRENT CONSTRUCTION STAGE')) return 'Closed due to the closure of the current construction stage.';
    if(u.includes('REMOVED_FROM_EXCEL')||u.includes('REMOVED')) return 'This comment did not return in the latest FMS / CCC Excel source.';
    return n;
  }
  function v24UserCleared(r){return C(r&&r.__source&&r.__source.user_cleared_date)||C(r&&r.__d1_user_cleared_date)||C(r&&r.user_cleared_date);}
  function v24EnsureBItemTools(){
    try{
      const tools=document.querySelector('#bItemControlPage .bitem-tools'); if(!tools)return;
      if(!document.getElementById('bItemReloadBtnV24')){
        const btn=document.createElement('button'); btn.className='action-btn'; btn.type='button'; btn.id='bItemReloadBtnV24'; btn.textContent='↻ Reload B Item'; btn.onclick=function(){ if(window.bitemReloadState) window.bitemReloadState(); else if(window.renderBItemControl) window.renderBItemControl(true); };
        const search=document.getElementById('bItemControlSearch'); if(search&&search.nextSibling) tools.insertBefore(btn,search.nextSibling); else tools.appendChild(btn);
      }
      let exp=[...tools.querySelectorAll('button')].find(b=>/Export B Item/i.test(b.textContent||''));
      if(!exp){
        exp=document.createElement('button'); exp.className='action-btn'; exp.type='button'; exp.textContent='📤 Export B Item'; exp.onclick=function(){ if(window.exportBItemControlTable) window.exportBItemControlTable(); };
        const dash=[...tools.querySelectorAll('button')].find(b=>/Dashboard/i.test(b.textContent||'')); if(dash)tools.insertBefore(exp,dash); else tools.appendChild(exp);
      }
    }catch(e){}
  }
  window.__V21_BITEM_PAGE=window.__V21_BITEM_PAGE||1;
  window.renderBItemControl=function(resetPage){
    v24EnsureBItemTools();
    const head=document.getElementById('bItemControlHead'), body=document.getElementById('bItemControlBody'), info=document.getElementById('bItemControlPageInfo'), count=document.getElementById('bItemControlCount');
    if(!head||!body)return;
    if(resetPage)window.__V21_BITEM_PAGE=1;
    const headers=['ACTION','B ITEM ID','TP NUMBER','STAGE','DATE','AREA','ISO NO.','SHEET NO.','PUNCH CATEGORY','MATERIAL TYPE','COMMENT','FMS / CCC Excel Status','FINAL STATUS','Punch Cleared Date','USER CLEARED','NOTE','SCOPE'];
    const classOf=(i)=>({0:'bitem-action-col',1:'bitem-id-col',10:'bitem-comment-col',11:'bitem-status-col',12:'bitem-status-col',13:'bitem-cleared-col',14:'bitem-cleared-col',15:'bitem-note-col'}[i]||'');
    head.innerHTML='<tr>'+headers.map((h,i)=>`<th class="${classOf(i)}">${esc(h)}</th>`).join('')+'</tr>'+
      '<tr class="bitem-filter-row">'+headers.map((h,i)=>renderBItemFilterCell(h,i,classOf(i))).join('')+'</tr>';
    let rows=applyBItemColumnFilters(applySearch(specialBRows().rows.slice()));
    rows.sort((a,b)=>tpOfRow(a).localeCompare(tpOfRow(b),undefined,{numeric:true})||displayId(a).localeCompare(displayId(b),undefined,{numeric:true}));
    const sel=document.getElementById('bItemControlPageSize'); const size=Math.max(25,Number(sel&&sel.value)||100); const pages=Math.max(1,Math.ceil(rows.length/size)); if(window.__V21_BITEM_PAGE>pages)window.__V21_BITEM_PAGE=pages; const start=(window.__V21_BITEM_PAGE-1)*size; const page=rows.slice(start,start+size);
    body.innerHTML=page.map(r=>{const id=actualId(r), fp=fingerprint(r), old=finalDate(r), note=v24Note(r); const eid=encodeURIComponent(id), efp=encodeURIComponent(fp), eold=encodeURIComponent(old); const btn=`<button class="bitem-edit-btn" type="button" onclick="window.bitemStartSystemClearedEdit&&window.bitemStartSystemClearedEdit('${eid}','${efp}','${eold}')">✏️ Edit</button>`; return `<tr>
      <td class="bitem-action-col">${btn}</td><td class="bitem-id-col" title="Actual ID: ${esc(id)}">${esc(displayId(r))}</td><td>${esc(tpOfRow(r))}</td><td>${esc(stageOfRow(r))}</td><td>${esc(dateOfRow(r))}</td><td>${esc(areaOfRow(r))}</td><td>${esc(isoOfRow(r))}</td><td>${esc(sheetOfRow(r))}</td><td>${esc(punchCatOfRow(r)||'B')}</td><td>${esc(matOfRow(r))}</td><td class="bitem-comment-cell" title="${esc(commentOfRow(r))}">${esc(commentOfRow(r))}</td><td class="bitem-status-col">${v24StatusPill(queryStatus(r))}</td><td class="bitem-status-col">${v24StatusPill(finalStatus(r))}</td><td class="bitem-cleared-cell bitem-cleared-col" data-bitem-system-cleared="${esc(id)}" onclick="window.bitemStartSystemClearedEdit&&window.bitemStartSystemClearedEdit('${eid}','${efp}','${eold}')">${esc(finalDate(r))}</td><td class="bitem-cleared-col">${esc(v24UserCleared(r))}</td><td class="bitem-note-cell bitem-note-col" title="${esc(note)}">${esc(note)}</td><td>${esc(reinstContractorOfTp(tpOfRow(r)))}</td>
    </tr>`;}).join('') || '<tr><td colspan="17" class="stage-note">No B Item rows for current filters.</td></tr>';
    if(info)info.textContent=`Page ${window.__V21_BITEM_PAGE} / ${pages}`;
    if(count)count.textContent=`B Item Rows: ${rows.length.toLocaleString()}`;
    setTimeout(restoreBItemFilterFocus,0);
  }; try{renderBItemControl=window.renderBItemControl;}catch(e){}
  window.bItemPrevPage=function(){window.__V21_BITEM_PAGE=Math.max(1,(window.__V21_BITEM_PAGE||1)-1); window.renderBItemControl(false);};
  window.bItemNextPage=function(){window.__V21_BITEM_PAGE=(window.__V21_BITEM_PAGE||1)+1; window.renderBItemControl(false);};
  window.bitemReloadState=function(){window.renderBItemControl(true);};
  function bitemActive(){const p=document.getElementById('bItemControlPage'); return !!(p&&p.classList.contains('active'));}
  window.setF=function(k,v,btn){const out=oldSetF?oldSetF(k,v,btn):undefined; setTimeout(()=>{if(bitemActive())window.renderBItemControl(true);},0); return out;}; try{setF=window.setF;}catch(e){}
  window.resetFilters=function(){const out=oldResetFilters?oldResetFilters():undefined; setTimeout(()=>{if(bitemActive())window.renderBItemControl(true);},0); return out;}; try{resetFilters=window.resetFilters;}catch(e){}
  if(oldRefresh){window.refresh=function(){const out=oldRefresh.apply(this,arguments); setTimeout(()=>{if(bitemActive())window.renderBItemControl(false);},0); return out;}; try{refresh=window.refresh;}catch(e){}}

  async function ensureRowsOnce(){
    if(d1RawRows().length)return true;
    try{const headers={'content-type':'application/json'}; const t=localStorage.getItem('ccc_bitem_auth_token')||''; if(t)headers.authorization='Bearer '+t; const res=await fetch('/api/bitem/state?include_removed=1&limit=50000&t='+Date.now(),{headers,cache:'no-store'}); const txt=await res.text(); let data={}; try{data=JSON.parse(txt);}catch(e){return false;} if(res.ok&&Array.isArray(data.rows)){window.bitemSystemAPI=window.bitemSystemAPI||{}; window.bitemSystemAPI.stateRows=data.rows; window.bitemSystemAPI.stateKpi=data.kpi||{}; cache.key=''; cache.rows=null; return true;} }catch(e){}
    return false;
  }
  function rerenderAll(){try{if(typeof refresh==='function')refresh(true);}catch(e){} if(bitemActive())try{window.renderBItemControl(true);}catch(e){}}
  setTimeout(()=>ensureRowsOnce().then(ok=>{if(ok)rerenderAll();}),600);
  window.addEventListener('hashchange',()=>setTimeout(()=>{if(bitemActive()){ensureRowsOnce().then(()=>window.renderBItemControl(true));}},300));
})();

;

(function(){
  if(window.__V13_ROLE_GUARD_DASH__)return; window.__V13_ROLE_GUARD_DASH__=true;
  function token(){try{return localStorage.getItem('ccc_bitem_auth_token')||sessionStorage.getItem('ccc_bitem_auth_token_session')||'';}catch(e){return '';}}
  function localUser(){try{return JSON.parse(localStorage.getItem('ccc_bitem_auth_user')||sessionStorage.getItem('ccc_bitem_auth_user_session')||'null');}catch(e){return null;}}
  function isVisitor(){try{return new URLSearchParams(location.search).get('visitor')==='1'||sessionStorage.getItem('cccVisitorMode')==='1';}catch(e){return false;}}
  function login(){location.href='/login.html?next='+encodeURIComponent(location.pathname+location.search+location.hash);}
  function arr(v){if(Array.isArray(v))return v; if(v==null)return[]; try{var j=JSON.parse(String(v)); if(Array.isArray(j))return j;}catch(e){} return String(v).split(',').map(function(x){return x.trim();}).filter(Boolean);}
  function canViewDashboard(u){if(!u)return false; if(String(u.role||'').toLowerCase()==='admin')return true; var p=u.view_pages || (u.permissions&&u.permissions.view); if(p==null)return true; return arr(p).indexOf('dashboard')>=0;}
  function block(){document.body.innerHTML='<div style="min-height:100vh;background:#06101c;color:#f4f7fb;font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px"><div style="max-width:520px;background:#0e1b2c;border:1px solid #203a5b;border-radius:18px;padding:28px;text-align:center"><h2>Unauthorized</h2><p style="color:#9fb3ca">Test Pack Dashboard is not enabled for your account.</p><a href="/projects.html" style="display:inline-block;margin-top:12px;border:1px solid #00d4ff;color:#00d4ff;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:800">🏠 Home</a></div></div>';}
  async function guard(){
    if(isVisitor()){try{sessionStorage.setItem('cccVisitorMode','1');}catch(e){} return;}
    var t=token(); if(!t){login();return;}
    try{
      var res=await fetch('/api/auth/me',{cache:'no-store',headers:{authorization:'Bearer '+t}});
      var d=await res.json().catch(function(){return null;});
      if(res.status===401||res.status===403){login();return;}
      if(d&&d.ok&&d.user){try{localStorage.setItem('ccc_bitem_auth_user',JSON.stringify(d.user));sessionStorage.setItem('ccc_bitem_auth_user_session',JSON.stringify(d.user));}catch(e){} if(!canViewDashboard(d.user))block(); return;}
    }catch(e){}
    var u=localUser(); if(u&&canViewDashboard(u))return; if(u)block(); else login();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',guard); else guard();
})();

;

(function(){
  if(window.__MP_V4_SHAPE_HARD_FIX__) return;
  window.__MP_V4_SHAPE_HARD_FIX__ = true;
  function q(s,r){return (r||document).querySelector(s)}
  function qa(s,r){return Array.from((r||document).querySelectorAll(s))}
  function path(){return String(location.pathname||'').toLowerCase()}
  function isBitemPage(){var p=path().replace(/\/+$/,'');return p.endsWith('/bitem') || p.endsWith('/bitem.html') || p.includes('bitem.html')}
  function isMonitorPage(){var p=path().replace(/\/+$/,'');return p.endsWith('/bitem-monitoring') || p.endsWith('/bitem-monitoring.html') || p.includes('bitem-monitoring')}
  function isDashPage(){var p=path().replace(/\/+$/,'');return (p.endsWith('/dashboard') || p.endsWith('/dashboard.html') || p.includes('dashboard')) && !isBitemPage() && !isMonitorPage()}
  function goHome(){ location.href='/projects.html'; }
  window.mpGoHome = goHome;

  function addHeaderHome(){
    var hdr=q('.hdr'); if(!hdr || q('#mpHardHomeBtn')) return;
    var btn=document.createElement('button');
    btn.id='mpHardHomeBtn'; btn.type='button'; btn.className='action-btn'; btn.innerHTML='🏠 Home';
    btn.onclick=goHome;
    var live=q('.live-status');
    if(live) hdr.insertBefore(btn, live); else hdr.appendChild(btn);
  }

  function disableOldMenus(){
    ['adminMenuWrap','globalEmployerMenu','sidebarMenuHost','v10SideMenu','v12SideNav'].forEach(function(id){var e=document.getElementById(id); if(e)e.style.display='none';});
  }

  function cleanBitemTools(){
    var tools=q('#bItemControlPage .bitem-tools'); if(!tools) return;
    // remove any dashboard/back-to-dashboard button inside B Item Control
    qa('button',tools).forEach(function(b){ if(/Dashboard/i.test((b.textContent||''))) b.remove(); });
    // keep one Reload B Item only
    var reloads=qa('button',tools).filter(function(b){return /Reload B Item/i.test((b.textContent||''));});
    reloads.forEach(function(b,i){ if(i>0) b.remove(); });
    if(!reloads.length){
      var btn=document.createElement('button'); btn.type='button'; btn.className='action-btn'; btn.id='mpSingleReloadBItem'; btn.textContent='↻ Reload B Item';
      btn.onclick=function(){ if(window.bitemReloadState) window.bitemReloadState(); else if(window.renderBItemControl) window.renderBItemControl(true); };
      var exp=qa('button',tools).find(function(b){return /Export B Item/i.test((b.textContent||''));});
      if(exp) tools.insertBefore(btn,exp); else tools.appendChild(btn);
    }
  }

  function ensureMonitoringPageThenShow(){
    try{ sessionStorage.setItem('cccAccessMode','employer'); }catch(e){}
    try{ if(typeof ensureAdminMonitoringPage==='function') ensureAdminMonitoringPage(); }catch(e){}
    try{ if(typeof showEmployerView==='function') showEmployerView('monitoring',{fromRoute:true,replace:true}); }catch(e){}
    try{ if(typeof renderBItemMonitoring==='function') renderBItemMonitoring(); }catch(e){}
    var app=q('#dashboardApp'); if(app) app.style.display='flex';
    var ph=q('#portalHome'); if(ph) ph.style.display='none';
    var pl=q('#portalLogin'); if(pl) pl.style.display='none';
    document.body.classList.add('v12-app-mode');
  }

  function ensureBitemThenShow(){
    try{ sessionStorage.setItem('cccAccessMode','employer'); }catch(e){}
    try{ if(typeof showEmployerView==='function') showEmployerView('bitem',{fromRoute:true,replace:true}); }catch(e){}
    var app=q('#dashboardApp'); if(app) app.style.display='flex';
    var ph=q('#portalHome'); if(ph) ph.style.display='none';
    var pl=q('#portalLogin'); if(pl) pl.style.display='none';
    document.body.classList.add('v12-app-mode');
    cleanBitemTools();
  }

  function ensureDashboardThenShow(){
    try{ sessionStorage.setItem('cccAccessMode','employer'); }catch(e){}
    try{ if(typeof showEmployerView==='function') showEmployerView('dashboard',{fromRoute:true,replace:true}); }catch(e){}
    var app=q('#dashboardApp'); if(app) app.style.display='flex';
    var ph=q('#portalHome'); if(ph) ph.style.display='none';
    var pl=q('#portalLogin'); if(pl) pl.style.display='none';
    document.body.classList.add('v12-app-mode');
  }

  function hardRoute(){
    addHeaderHome(); disableOldMenus(); cleanBitemTools();
    if(isMonitorPage()){
      if(location.hash !== '#/monitoring') { try{ history.replaceState({route:'monitoring',mode:'employer'},'', '/bitem-monitoring#/monitoring'); }catch(e){} }
      ensureMonitoringPageThenShow();
    } else if(isBitemPage()){
      if(location.hash !== '#/bitem') { try{ history.replaceState({route:'bitem',mode:'employer'},'', '/bitem#/bitem'); }catch(e){} }
      ensureBitemThenShow();
    } else if(isDashPage()){
      if(location.hash !== '#/dashboard') { try{ history.replaceState({route:'dashboard',mode:'employer'},'', '/dashboard#/dashboard'); }catch(e){} }
      ensureDashboardThenShow();
    }
  }
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(hardRoute,50); setTimeout(hardRoute,500); setTimeout(hardRoute,1500); setTimeout(hardRoute,3500); });
  window.addEventListener('load',function(){ setTimeout(hardRoute,100); setTimeout(hardRoute,1200); });
  // V80 performance-only: no repeated 2.5s hardRoute repaint. One-shot route fixes above remain active.
})();

;

/* === V46 B Item D1 Request Controller ===
   Clean replacement for old B Item dashboard overlays.
   Purpose:
   - one request controller for D1 B Item KPI / Stage Control / Pending table
   - ignore stale backend responses after filters change
   - no periodic repaint / no old snapshot values winning over D1 values
   - keep V44 calculations and reinstatement scope logic intact
*/
(function(){
  if (window.__V46_BITEM_D1_REQUEST_CONTROLLER__) return;
  window.__V46_BITEM_D1_REQUEST_CONTROLLER__ = true;

  function C(v){ return v == null ? '' : String(v).replace(/\s+/g,' ').trim(); }
  function U(v){ return C(v).toUpperCase(); }
  function fmt(v){ return Number(v || 0).toLocaleString(); }
  function fmtTotal(v){ v = Number(v || 0); return v >= 1000 ? (v/1000).toFixed(1)+'K' : v.toLocaleString(); }
  function esc(v){ return C(v).replace(/[&<>"']/g,function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]); }); }
  function pct(c,t){ t = Number(t||0); c = Number(c||0); return t > 0 ? Math.round(c/t*100) : 0; }
  function tokenHeaders(){
    var h = {'Accept':'application/json'};
    try {
      var t = localStorage.getItem('ccc_bitem_auth_token') || localStorage.getItem('ccc_auth_token') || localStorage.getItem('cccToken') || '';
      if (t) h.Authorization = 'Bearer ' + t;
    } catch(e) {}
    return h;
  }

  /* expose the real dashboard filter object for every late script */
  try {
    Object.defineProperty(window, 'F', {
      configurable: true,
      enumerable: false,
      get: function(){ return F; },
      set: function(v){ F = v || {con:'ALL',areaGrp:['ALL'],area:['ALL'],sys:['ALL'],stage:['ALL']}; }
    });
  } catch(e) { try { window.F = F; } catch(_) {} }

  function getF(){ try { return F || window.F || {}; } catch(e){ return window.F || {}; } }
  function arr(v){
    if (Array.isArray(v)) return v.filter(Boolean).filter(function(x){ return U(x) !== 'ALL'; });
    if (!C(v) || U(v) === 'ALL') return [];
    return [C(v)];
  }
  function conValue(){
    var c = C(getF().con || 'ALL');
    if (!c || U(c) === 'ALL') return 'ALL';
    if (/JGC/i.test(c)) return 'JGC Direct MP';
    if (/CCC/i.test(c)) return 'CCC';
    return c;
  }
  function currentParams(){
    var f = getF();
    var p = new URLSearchParams();
    p.set('contractor', conValue());
    var areas = arr(f.area); if (areas.length) p.set('area', areas.join(','));
    var stages = arr(f.stage); if (stages.length) p.set('stage', stages.join(','));
    return p;
  }
  function currentKey(){ return currentParams().toString(); }
  function paramsForContractor(con){ var p = currentParams(); p.set('contractor', con || 'ALL'); return p; }
  function keyForContractor(con){ return paramsForContractor(con).toString(); }
  window.getDashboardBItemContractorFilter = conValue;

  function clearDashboardCaches(){
    try { FILTER_CACHE = { key:'', data:null }; } catch(e) {}
    try { PUNCH_FAST_CACHE = {}; } catch(e) {}
  }
  function isPage(pg){ try { return currentPage === pg; } catch(e){ return false; } }
  function isVisible(id){ var el=document.getElementById(id); return !!(el && el.offsetParent !== null); }

  /* ---------------- Overview / Punch B KPI ---------------- */
  var kpiCache = new Map();
  var kpiSeq = 0;
  var kpiAbort = null;
  var kpiTimer = null;
  var kpiApplying = false;

  function bPunchCardHTML(obj, key, loading){
    if (loading) {
      return '<div class="punch-box" data-bitem-registry="v46" data-bitem-key="'+esc(key)+'" data-bitem-loading="1">' +
        '<div class="punch-cat">Punch B</div>' +
        '<div class="punch-total" style="color:var(--orange)">--</div>' +
        '<div class="punch-sub">Loading from B Item Control...</div>' +
        '<div class="punch-sub" style="color:var(--muted)">D1 source</div>' +
        '<div class="punch-prog"><div class="punch-prog-fill" style="width:0%;background:var(--orange)"></div></div>' +
      '</div>';
    }
    obj = obj || {};
    var total = Number(obj.total || 0);
    var cleared = Number(obj.cleared || 0);
    var balance = Number(obj.balance);
    if (!Number.isFinite(balance)) balance = Math.max(total - cleared, 0);
    var pc = pct(cleared,total);
    return '<div class="punch-box" data-bitem-registry="v46" data-bitem-key="'+esc(key)+'" data-bitem-total="'+total+'" data-bitem-cleared="'+cleared+'" data-bitem-balance="'+balance+'">' +
      '<div class="punch-cat">Punch B</div>' +
      '<div class="punch-total" style="color:var(--orange)">'+fmtTotal(total)+'</div>' +
      '<div class="punch-sub">Cleared: '+fmt(cleared)+'</div>' +
      '<div class="punch-sub" style="color:var(--red)">Balance: '+fmt(balance)+'</div>' +
      '<div class="punch-prog"><div class="punch-prog-fill" style="width:'+pc+'%;background:var(--orange)"></div></div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:5px;font-weight:600">'+pc+'% cleared</div>' +
    '</div>';
  }
  function replacePunchB(containerId, data, key, loading){
    var wrap = document.getElementById(containerId);
    if (!wrap) return;
    var cards = Array.prototype.slice.call(wrap.children || []);
    var card = cards.find(function(x){ var c=x.querySelector && x.querySelector('.punch-cat'); return c && /Punch\s*B/i.test(c.textContent||''); }) || cards[1];
    if (!card) return;
    card.outerHTML = bPunchCardHTML(data && (data.punchB || data), key, loading);
  }
  function applyKpiForKey(key, data, loading){
    if (key !== currentKey()) return;
    kpiApplying = true;
    replacePunchB('punchCards', data, key, loading);
    replacePunchB('punchPageCards', data, key, loading);
    setTimeout(function(){ kpiApplying = false; }, 30);
  }
  function reconcileKpi(){
    var key = currentKey();
    if (kpiCache.has(key)) applyKpiForKey(key, kpiCache.get(key), false);
    else applyKpiForKey(key, null, true);
  }
  function fetchKpi(force){
    var key = currentKey();
    if (!force && kpiCache.has(key)) { applyKpiForKey(key, kpiCache.get(key), false); return Promise.resolve(kpiCache.get(key)); }
    if (kpiAbort) { try { kpiAbort.abort(); } catch(e) {} }
    kpiAbort = ('AbortController' in window) ? new AbortController() : null;
    var seq = ++kpiSeq;
    applyKpiForKey(key, kpiCache.get(key) || null, !kpiCache.has(key));
    var p = new URLSearchParams(key); p.set('_v46', Date.now());
    return fetch('/api/bitem/kpi?' + p.toString(), { headers: tokenHeaders(), cache:'no-store', signal: kpiAbort ? kpiAbort.signal : undefined })
      .then(function(r){ return r.text().then(function(t){
        var j; try { j = JSON.parse(t); } catch(e){ throw new Error('B Item KPI non-JSON: '+t.slice(0,120)); }
        if (!r.ok || !j.ok) throw new Error(j && j.error ? j.error : ('HTTP '+r.status));
        if (seq !== kpiSeq || key !== currentKey()) return j; // stale response, ignore visually
        kpiCache.set(key, j);
        applyKpiForKey(key, j, false);
        return j;
      }); })
      .catch(function(e){ if (!(e && e.name === 'AbortError')) console.warn('V46 B Item KPI failed:', e && e.message || e); if (key === currentKey()) reconcileKpi(); });
  }
  function scheduleKpi(force, delay){ clearTimeout(kpiTimer); kpiTimer = setTimeout(function(){ fetchKpi(!!force); }, delay == null ? 60 : delay); }
  window.refreshDashboardBItemKpi = function(force){ return fetchKpi(!!force); };

  /* ---------------- Stage Control D1 ---------------- */
  var stageCache = new Map();
  var stageSeq = 0;
  var stageAbort = null;
  var stageTimer = null;
  var stageApplying = false;
  var stageInFlightKey = '';
  var stageInFlightPromise = null;

  function controlBox(title, obj, color, loading){
    if (loading) {
      return '<div class="punch-box" data-v46-stage-d1="1" data-loading="1"><div class="punch-cat">'+title+'</div><div class="punch-total" style="color:'+color+'">--</div><div class="punch-sub">Loading from D1...</div><div class="punch-sub" style="color:var(--muted)">B Item Control source</div><div class="punch-prog"><div class="punch-prog-fill" style="width:0%;background:'+color+'"></div></div></div>';
    }
    obj = obj || {};
    var total = Number(obj.total || 0);
    var cleared = Number(obj.cleared || 0);
    var balance = Number(obj.balance);
    if (!Number.isFinite(balance)) balance = Math.max(total - cleared, 0);
    var pc = pct(cleared,total);
    return '<div class="punch-box" data-v46-stage-d1="1" data-total="'+total+'" data-cleared="'+cleared+'" data-balance="'+balance+'">' +
      '<div class="punch-cat">'+title+'</div>' +
      '<div class="punch-total" style="color:'+color+'">'+fmt(total)+'</div>' +
      '<div class="punch-sub">Cleared: '+fmt(cleared)+'</div>' +
      '<div class="punch-sub" style="color:var(--red)">Balance: '+fmt(balance)+'</div>' +
      '<div class="punch-prog"><div class="punch-prog-fill" style="width:'+pc+'%;background:'+color+'"></div></div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:5px;font-weight:600">'+pc+'% cleared</div>' +
    '</div>';
  }
  function miniBars(items, color, loading){
    if (loading) return '<div class="hbar-row" data-v46-stage-d1="1"><div class="hbar-lbl">Loading...</div><div class="hbar-wrap"><div class="hbar-fill" style="width:2%;background:'+color+'"><span class="hbar-cnt outside">--</span></div></div></div>';
    items = Array.isArray(items) ? items : [];
    var mx = Math.max.apply(null, items.map(function(x){ return Number(x[1]||0); }).concat([1]));
    return items.map(function(x){
      var label = C(x[0]) || 'Other';
      var val = Number(x[1] || 0);
      var w = val > 0 ? Math.max(2, val / mx * 100) : 0;
      return '<div class="hbar-row" data-v46-stage-d1="1">' +
        '<div class="hbar-lbl">'+esc(label)+'</div>' +
        '<div class="hbar-wrap"><div class="hbar-fill" style="width:'+w+'%;background:'+color+'">' +
          '<span class="hbar-cnt '+(val/mx < .18 ? 'outside' : '')+'">'+fmt(val)+'</span>' +
        '</div></div>' +
      '</div>';
    }).join('');
  }
  function isStageControlVisible(){ return isPage('stagescontrol') || isVisible('page-stagescontrol'); }
  function getCurrentFilteredData(){ try { return (typeof getFiltered === 'function') ? (getFiltered() || []) : []; } catch(e){ try { return Array.isArray(TP) ? TP : []; } catch(_) { return []; } } }
  function pendingBaseRows(){
    var current = getCurrentFilteredData();
    try { if (typeof window.reinstatementPendingRows === 'function') return window.reinstatementPendingRows(current) || []; } catch(e) {}
    try { if (typeof reinstatementPendingRows === 'function') return reinstatementPendingRows(current) || []; } catch(e) {}
    return [];
  }
  function pendingBaseRowsForContractor(con){
    var f = getF(), oldCon = f.con;
    try {
      f.con = con || 'ALL';
      clearDashboardCaches();
      return pendingBaseRows();
    } catch(e) {
      return [];
    } finally {
      try { f.con = oldCon; clearDashboardCaches(); } catch(_) {}
    }
  }
  function d1Map(data){
    var m = {};
    (data && Array.isArray(data.by_tp) ? data.by_tp : []).forEach(function(x){ var tp = U(x.tp || x.tp_no || x.test_pack || ''); if (tp) m[tp] = x; });
    return m;
  }
  function scopedReturnPunchTotalsForContractor(con, data){
    var base = pendingBaseRowsForContractor(con || conValue());
    if (!base.length || !data || !Array.isArray(data.by_tp)) return data && data.ret || {};
    var map = d1Map(data), total = 0, cleared = 0;
    base.forEach(function(r){
      var x = map[U(r.tp || r.tp_no || '')] || {};
      var rt = Number(x.retTotal != null ? x.retTotal : (x.ret_total != null ? x.ret_total : (r.retTotal || 0))) || 0;
      var rc = Number(x.retCleared != null ? x.retCleared : (x.ret_cleared != null ? x.ret_cleared : (r.retCleared || 0))) || 0;
      total += rt; cleared += rc;
    });
    return { total: total, cleared: cleared, balance: Math.max(total - cleared, 0), source: 'pending_reinstatement_scope_' + (con || conValue()) };
  }
  function scopedReturnPunchTotals(data){
    if (data && data.__splitRetTotal) return data.__splitRetTotal;
    if (conValue() === 'ALL') {
      var cData = stageCache.get(keyForContractor('CCC'));
      var jData = stageCache.get(keyForContractor('JGC Direct MP'));
      if (cData && jData) {
        var c = scopedReturnPunchTotalsForContractor('CCC', cData);
        var j = scopedReturnPunchTotalsForContractor('JGC Direct MP', jData);
        var total = Number(c.total || 0) + Number(j.total || 0);
        var cleared = Number(c.cleared || 0) + Number(j.cleared || 0);
        return { total: total, cleared: cleared, balance: Math.max(total - cleared, 0), source: 'sum_ccc_jgc_reinstatement_scope' };
      }
    }
    return scopedReturnPunchTotalsForContractor(conValue(), data);
  }
  function enrichPendingRows(baseRows, data){
    var map = d1Map(data || {});
    return (baseRows || []).map(function(r){
      var tp = C(r.tp);
      var x = map[U(tp)] || {};
      var total = Number(x.total != null ? x.total : r.total || 0);
      var cleared = Number(x.cleared != null ? x.cleared : r.cleared || 0);
      var cns = Number(x.cns != null ? x.cns : r.cns || 0);
      var eng = Number(x.eng != null ? x.eng : r.eng || 0);
      var retTotal = Number((x.retTotal != null ? x.retTotal : (x.ret_total != null ? x.ret_total : r.retTotal)) || 0);
      var retCleared = Number((x.retCleared != null ? x.retCleared : (x.ret_cleared != null ? x.ret_cleared : r.retCleared)) || 0);
      var balance = Number(x.balance != null ? x.balance : Math.max(total - cleared, 0));
      var retBalance = Number((x.retBalance != null ? x.retBalance : (x.ret_balance != null ? x.ret_balance : Math.max(retTotal - retCleared, 0))));
      var cnsBalance = Math.max(cns - Math.min(cleared, cns), 0);
      return { tp:tp, current:C(r.current), total:total, cleared:cleared, balance:Number.isFinite(balance)?balance:Math.max(total-cleared,0), cns:cns, eng:eng, cnsReady:cnsBalance===0, retTotal:retTotal, retCleared:retCleared, retBalance:Number.isFinite(retBalance)?retBalance:Math.max(retTotal-retCleared,0) };
    }).sort(function(a,b){ return (b.balance-a.balance) || (b.retBalance-a.retBalance) || (b.total-a.total) || String(a.tp).localeCompare(String(b.tp), undefined, {numeric:true}); });
  }
  function applyStageDataForKey(key, data, loading){
    if (key !== currentKey() || !isStageControlVisible()) return;
    stageApplying = true;
    var box = document.getElementById('bPunchControlBoxes');
    if (box) box.innerHTML = controlBox('CNS B Punch', data && data.cns || {}, 'var(--orange)', loading) + controlBox('QC Return B Punch', data ? scopedReturnPunchTotals(data) : {}, 'var(--accent2)', loading);
    var party = document.getElementById('bPunchTypeChart');
    if (party) party.innerHTML = miniBars(data && data.party_counts || [['CNS',0],['ENG',0]], 'linear-gradient(90deg,var(--accent),rgba(34,211,238,.35))', loading);
    var mat = document.getElementById('bPunchMatChart');
    if (mat) mat.innerHTML = miniBars(data && data.material_counts || [], 'linear-gradient(90deg,var(--accent2),rgba(124,58,237,.35))', loading);
    renderPendingTable(data, loading);
    setTimeout(function(){ stageApplying = false; }, 40);
  }
  function renderPendingTable(data, loading){
    var countEl = document.getElementById('reinstPendingCount');
    var tableEl = document.getElementById('reinstPendingTable');
    if (!countEl || !tableEl) return;
    var rows = enrichPendingRows(pendingBaseRows(), data || {});
    var qEl = document.getElementById('reinstPendingSearch');
    var q = U(qEl && qEl.value || '');
    var shown = q ? rows.filter(function(r){ return U(r.tp + ' ' + r.current + ' CNS ' + r.cns + ' ENG ' + r.eng).indexOf(q) >= 0; }) : rows;
    countEl.textContent = fmt(shown.length) + ' / ' + fmt(rows.length) + ' Test Packs' + (loading ? ' · Loading B Punch...' : '');
    tableEl.innerHTML = shown.map(function(r){
      var note = (r.total || 0) === 0 ? '<span style="color:var(--muted);font-weight:800">No B Punch Received</span>' : (r.cnsReady ? '<span style="color:var(--green);font-weight:800">Ready from Construction</span>' : '<span style="color:var(--orange);font-weight:800">CNS Open</span>');
      return '<tr data-v46-pending-reinst-scope="1">' +
        '<td>'+esc(r.tp)+'</td><td>'+esc(r.current)+'</td><td>'+fmt(r.total)+'</td>' +
        '<td><span style="color:var(--accent)">CNS '+fmt(r.cns)+'</span> / <span style="color:var(--accent2)">ENG '+fmt(r.eng)+'</span></td>' +
        '<td>'+note+'</td><td>'+fmt(r.cleared)+'</td><td style="color:'+(r.balance>0?'var(--red)':'var(--green)')+'">'+fmt(r.balance)+'</td>' +
        '<td>'+fmt(r.retTotal)+'</td><td>'+fmt(r.retCleared)+'</td><td style="color:'+(r.retBalance>0?'var(--red)':'var(--green)')+'">'+fmt(r.retBalance)+'</td>' +
      '</tr>';
    }).join('') || '<tr data-v46-pending-reinst-scope="1"><td colspan="10" class="stage-note">No pending test packs in this reinstatement scope range.</td></tr>';
  }
  function reconcileStage(){
    var key = currentKey();
    if (stageCache.has(key)) applyStageDataForKey(key, stageCache.get(key), false);
    else applyStageDataForKey(key, null, true);
  }
  function fetchStageJsonForKey(key, signal){
    var p = new URLSearchParams(key); p.set('_v49', Date.now());
    return fetch('/api/bitem/stage-control?' + p.toString(), { headers: tokenHeaders(), cache:'no-store', signal: signal })
      .then(function(r){ return r.text().then(function(t){
        var j; try { j = JSON.parse(t); } catch(e){ throw new Error('stage-control non-JSON: '+t.slice(0,120)); }
        if (!r.ok || !j.ok) throw new Error(j && j.error ? j.error : ('HTTP '+r.status));
        return j;
      }); });
  }
  function attachAllSplitReturn(key, data, signal){
    var contractor = (new URLSearchParams(key)).get('contractor') || 'ALL';
    if (contractor !== 'ALL') return Promise.resolve(data);
    var cKey = keyForContractor('CCC');
    var jKey = keyForContractor('JGC Direct MP');
    var cPromise = stageCache.has(cKey) ? Promise.resolve(stageCache.get(cKey)) : fetchStageJsonForKey(cKey, signal).then(function(d){ stageCache.set(cKey, d); return d; });
    var jPromise = stageCache.has(jKey) ? Promise.resolve(stageCache.get(jKey)) : fetchStageJsonForKey(jKey, signal).then(function(d){ stageCache.set(jKey, d); return d; });
    return Promise.all([cPromise, jPromise]).then(function(pair){
      var c = scopedReturnPunchTotalsForContractor('CCC', pair[0]);
      var j = scopedReturnPunchTotalsForContractor('JGC Direct MP', pair[1]);
      var total = Number(c.total || 0) + Number(j.total || 0);
      var cleared = Number(c.cleared || 0) + Number(j.cleared || 0);
      data.__splitRetTotal = { total: total, cleared: cleared, balance: Math.max(total - cleared, 0), source: 'sum_ccc_jgc_reinstatement_scope' };
      return data;
    }).catch(function(e){
      if (!(e && e.name === 'AbortError')) console.warn('V49 split return total failed:', e && e.message || e);
      return data;
    });
  }
  function fetchStage(force){
    var key = currentKey();
    if (!force && stageCache.has(key)) { applyStageDataForKey(key, stageCache.get(key), false); return Promise.resolve(stageCache.get(key)); }
    if (stageInFlightPromise && stageInFlightKey === key) {
      return stageInFlightPromise;
    }
    if (stageAbort && stageInFlightKey && stageInFlightKey !== key) { try { stageAbort.abort(); } catch(e){} }
    stageAbort = ('AbortController' in window) ? new AbortController() : null;
    var seq = ++stageSeq;
    applyStageDataForKey(key, stageCache.get(key) || null, !stageCache.has(key));
    stageInFlightKey = key;
    stageInFlightPromise = fetchStageJsonForKey(key, stageAbort ? stageAbort.signal : undefined)
      .then(function(j){ return attachAllSplitReturn(key, j, stageAbort ? stageAbort.signal : undefined); })
      .then(function(j){
        if (seq !== stageSeq || key !== currentKey()) return j;
        stageCache.set(key, j);
        applyStageDataForKey(key, j, false);
        return j;
      })
      .catch(function(e){ if (!(e && e.name === 'AbortError')) console.warn('V49 Stage Control D1 failed:', e && e.message || e); if (key === currentKey()) reconcileStage(); })
      .then(function(j){
        if (stageInFlightKey === key) { stageInFlightKey = ''; stageInFlightPromise = null; }
        return j;
      }, function(e){
        if (stageInFlightKey === key) { stageInFlightKey = ''; stageInFlightPromise = null; }
        throw e;
      });
    return stageInFlightPromise;
  }
  function scheduleStage(force, delay){ clearTimeout(stageTimer); stageTimer = setTimeout(function(){ fetchStage(!!force); }, delay == null ? 80 : delay); }
  window.refreshStageControlBItemD1 = function(force){ return fetchStage(!!force); };
  window.refreshStagePendingReinstScopeD1 = function(force){ return fetchStage(false); };

  function onFilterChanged(){
    clearDashboardCaches();
    reconcileKpi();
    reconcileStage();
    scheduleKpi(true, 20);
    scheduleStage(true, 30);
  }

  function patchFilters(){
    if (typeof setF === 'function' && !setF.__v46BitemD1) {
      var oldSet = setF;
      setF = window.setF = function(){
        var out = oldSet.apply(this, arguments);
        onFilterChanged();
        return out;
      };
      setF.__v46BitemD1 = true;
    }
    if (typeof resetFilters === 'function' && !resetFilters.__v46BitemD1) {
      var oldReset = resetFilters;
      resetFilters = window.resetFilters = function(){
        var out = oldReset.apply(this, arguments);
        onFilterChanged();
        return out;
      };
      resetFilters.__v46BitemD1 = true;
    }
  }
  function patchRenderers(){
    try {
      if (typeof renderOverview === 'function' && !renderOverview.__v46BitemD1) {
        var oldOverview = renderOverview;
        renderOverview = window.renderOverview = function(){ var out = oldOverview.apply(this, arguments); reconcileKpi(); scheduleKpi(false, 40); return out; };
        renderOverview.__v46BitemD1 = true;
      }
    } catch(e) {}
    try {
      if (typeof renderPunchPage === 'function' && !renderPunchPage.__v46BitemD1) {
        var oldPunch = renderPunchPage;
        renderPunchPage = window.renderPunchPage = function(){ var out = oldPunch.apply(this, arguments); reconcileKpi(); scheduleKpi(false, 40); return out; };
        renderPunchPage.__v46BitemD1 = true;
      }
    } catch(e) {}
    try {
      if (typeof renderStagesControl === 'function' && !renderStagesControl.__v46BitemD1) {
        var oldStage = renderStagesControl;
        renderStagesControl = window.renderStagesControl = function(){ var out = oldStage.apply(this, arguments); if (isStageControlVisible()) { reconcileStage(); scheduleStage(false, 60); } return out; };
        renderStagesControl.__v46BitemD1 = true;
      }
    } catch(e) {}
  }
  function observeCurrentAreas(){
    if (!('MutationObserver' in window)) return;
    ['punchCards','punchPageCards'].forEach(function(id){
      var el = document.getElementById(id);
      if (!el || el.__v46BitemKpiObs) return;
      el.__v46BitemKpiObs = true;
      new MutationObserver(function(){ if (kpiApplying) return; setTimeout(reconcileKpi, 0); }).observe(el, {childList:true, subtree:false});
    });
    // V48: Stage Control B Item has a single owner now (the request controller). Do not attach a MutationObserver
    // that re-applies old values on every DOM change; renderStagesControl already calls reconcileStage once.
  }
  function boot(){
    patchFilters(); patchRenderers(); observeCurrentAreas();
    reconcileKpi(); scheduleKpi(false, 250);
    if (isStageControlVisible()) { reconcileStage(); scheduleStage(false, 250); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('hashchange', function(){ setTimeout(boot, 150); });
  document.addEventListener('click', function(){ setTimeout(function(){ observeCurrentAreas(); if(isStageControlVisible()) { reconcileStage(); scheduleStage(false, 80); } }, 120); }, true);
})();

;

/* === V45 Dashboard Render Cleanup Marker ===
   Clean-up patch only. It removes duplicate V31/V32 overlay renderers and disables
   periodic repaint intervals/log spam while preserving V44 calculations and layout.
*/
(function(){
  window.__V45_DASHBOARD_RENDER_CLEANUP__ = true;
})();

;

/* === V47 Global Dashboard Filter Stability ===
   Extends V46. Purpose:
   - filter changes must refresh the whole dashboard, not only D1 B Item numbers
   - remove stale FILTER_CACHE/PUNCH_FAST_CACHE impact when user selects/unselects filters
   - keep V44/V46 logic and do not touch Export / functions / layout
*/
(function(){
  if (window.__V47_GLOBAL_FILTER_STABILITY__) return;
  window.__V47_GLOBAL_FILTER_STABILITY__ = true;

  function C(v){ return v == null ? '' : String(v).replace(/\s+/g,' ').trim(); }
  function A(v){
    if (Array.isArray(v)) return v.map(C).filter(Boolean);
    if (!C(v)) return ['ALL'];
    return [C(v)];
  }
  function fObj(){
    try { return F || window.F || {}; } catch(e) { return window.F || {}; }
  }
  function sig(){
    var f = fObj();
    return [
      C(f.con || 'ALL'),
      A(f.areaGrp).join('|'),
      A(f.area).join('|'),
      A(f.sys).join('|'),
      A(f.stage).join('|'),
      (function(){ try { return currentPage || window.currentPage || ''; } catch(e){ return window.currentPage || ''; } })()
    ].join('§');
  }
  function hardInvalidate(){
    try { FILTER_CACHE = {key:'', data:null}; } catch(e) {}
    try { PUNCH_FAST_CACHE = {}; } catch(e) {}
    try { TEST_PACK_HEADER_MAP = null; } catch(e) {}
  }

  var lastSig = sig();
  var afterTimer = null;
  var refreshing = false;

  function afterFilterChanged(reason){
    clearTimeout(afterTimer);
    afterTimer = setTimeout(function(){
      var now = sig();
      if (now !== lastSig || reason === 'force') {
        lastSig = now;
        hardInvalidate();
        try { if (typeof window.refreshDashboardBItemKpi === 'function') window.refreshDashboardBItemKpi(true); } catch(e) {}
        try { if (typeof window.refreshStageControlBItemD1 === 'function') window.refreshStageControlBItemD1(true); } catch(e) {}
        // V48: pending table uses the same stage-control endpoint, so do not fire a second forced request.
      }
    }, 40);
  }

  // Make getFiltered always calculate against the current F. This is the safest fix for stale dashboard-wide numbers.
  try {
    if (typeof getFiltered === 'function' && !getFiltered.__v47NoStaleCache) {
      var baseGetFiltered = getFiltered;
      getFiltered = window.getFiltered = function(){
        hardInvalidate();
        return baseGetFiltered.apply(this, arguments);
      };
      getFiltered.__v47NoStaleCache = true;
    }
  } catch(e) {}

  try {
    if (typeof refresh === 'function' && !refresh.__v47FilterStable) {
      var baseRefresh = refresh;
      refresh = window.refresh = function(){
        var before = sig();
        hardInvalidate();
        var out;
        if (refreshing) return baseRefresh.apply(this, arguments);
        refreshing = true;
        try { out = baseRefresh.apply(this, arguments); }
        finally { refreshing = false; }
        if (sig() !== before) afterFilterChanged('refresh-filter-change');
        else afterFilterChanged('refresh');
        return out;
      };
      refresh.__v47FilterStable = true;
    }
  } catch(e) {}

  try {
    if (typeof setF === 'function' && !setF.__v47FilterStable) {
      var baseSetF = setF;
      setF = window.setF = function(){
        hardInvalidate();
        var out = baseSetF.apply(this, arguments);
        hardInvalidate();
        afterFilterChanged('setF');
        return out;
      };
      setF.__v47FilterStable = true;
    }
  } catch(e) {}

  try {
    if (typeof setMultiF === 'function' && !setMultiF.__v47FilterStable) {
      var baseSetMultiF = setMultiF;
      setMultiF = window.setMultiF = function(){
        hardInvalidate();
        var out = baseSetMultiF.apply(this, arguments);
        hardInvalidate();
        afterFilterChanged('setMultiF');
        return out;
      };
      setMultiF.__v47FilterStable = true;
    }
  } catch(e) {}

  try {
    if (typeof resetFilters === 'function' && !resetFilters.__v47FilterStable) {
      var baseResetFilters = resetFilters;
      resetFilters = window.resetFilters = function(){
        hardInvalidate();
        var out = baseResetFilters.apply(this, arguments);
        hardInvalidate();
        afterFilterChanged('resetFilters');
        return out;
      };
      resetFilters.__v47FilterStable = true;
    }
  } catch(e) {}

  // Catch direct DOM changes from multi-selects / buttons even if an older wrapper handles them.
  document.addEventListener('change', function(ev){
    var t = ev.target;
    if (!t) return;
    if (t.id === 'fAreaGrp' || t.id === 'fArea' || t.id === 'fSys' || t.id === 'fStage' || (t.closest && t.closest('.multi-dd'))) {
      hardInvalidate();
      afterFilterChanged('dom-change');
    }
  }, true);
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if (!t) return;
    if ((t.closest && (t.closest('.fbtn') || t.closest('.reset-btn') || t.closest('.multi-dd-tools')))) {
      hardInvalidate();
      afterFilterChanged('dom-click');
    }
  }, true);

  setTimeout(function(){ hardInvalidate(); afterFilterChanged('force'); }, 300);
})();

;

(function(){
  if(window.__V48_STAGE_CONTROL_BITEM_SINGLE_OWNER__) return;
  window.__V48_STAGE_CONTROL_BITEM_SINGLE_OWNER__ = true;
  // Light background warm-up for the common contractor filters. It does not render anything by itself.
  function tokenHeaders(){
    var h={'Accept':'application/json'};
    try{var t=localStorage.getItem('ccc_bitem_auth_token')||localStorage.getItem('ccc_auth_token')||localStorage.getItem('cccToken')||''; if(t)h.Authorization='Bearer '+t;}catch(e){}
    return h;
  }
  function warmStage(contractor){
    try{
      var p=new URLSearchParams(); p.set('contractor', contractor); p.set('_warm','v48');
      fetch('/api/bitem/stage-control?'+p.toString(), {headers:tokenHeaders(), cache:'no-store'}).catch(function(){});
    }catch(e){}
  }
  function bootWarm(){
    setTimeout(function(){ warmStage('ALL'); }, 700);
    setTimeout(function(){ warmStage('CCC'); }, 1200);
    setTimeout(function(){ warmStage('JGC Direct MP'); }, 1700);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootWarm); else bootWarm();
})();

;

/* V59 — Dashboard must never request the heavy B Item table endpoint.
   B Item Control owns table paging. Dashboard owns only KPI and stage-control aggregates.
   This prevents /api/bitem/state?limit=50000 from exhausting D1 and breaking B Item/Login JSON responses after navigation. */
(function(){
  if (window.__V59_DASHBOARD_BITEM_STATE_FIREWALL__) return;
  window.__V59_DASHBOARD_BITEM_STATE_FIREWALL__ = true;

  function isDashboard(){
    try { return /dashboard/i.test(location.pathname + location.hash); } catch(e) { return true; }
  }
  function isHeavyBitemStateUrl(u){
    try {
      var url = String(u || '');
      if (!/\/api\/bitem\/state/i.test(url)) return false;
      return /limit=50000/i.test(url) || /include_removed=1/i.test(url);
    } catch(e) { return false; }
  }
  function jsonResponse(obj){
    return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'x-v59-bitem-state-firewall': '1' } });
  }

  // Stop old dashboard overlays from loading the full B Item registry. Final dashboard B numbers come from /api/bitem/kpi and /api/bitem/stage-control only.
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch && !nativeFetch.__v59Wrapped) {
    var wrapped = function(input, init){
      var raw = (typeof input === 'string') ? input : (input && input.url) || '';
      if (isDashboard() && isHeavyBitemStateUrl(raw)) {
        return Promise.resolve(jsonResponse({ ok: true, rows: [], total: 0, skipped: true, source: 'v59_dashboard_bitem_state_firewall' }));
      }
      return nativeFetch(input, init);
    };
    wrapped.__v59Wrapped = true;
    window.fetch = wrapped;
  }

  // If old inline scripts call these helpers, make them harmless on dashboard pages.
  window.__V46_BITEM_D1_REQUEST_CONTROLLER__ = true;
  window.__V48_STAGE_CONTROL_BITEM_SINGLE_OWNER__ = true;
  window.bitemLoadSystemState = async function(){
    return { ok: true, rows: [], total: 0, skipped: true, source: 'v59_dashboard_no_full_state' };
  };
})();

;

/* V72 Dashboard Turbo Performance
   - Keeps the existing UI and calculations.
   - Stops old dashboard wrappers from invalidating caches on every getFiltered()/refresh().
   - Renders only the currently active tab.
   - Adds a fast memoized Test Pack filter for sidebar filters.
   - De-duplicates B Item KPI and Stage Control aggregate requests.
*/
(function(){
  if (window.__V72_DASHBOARD_TURBO_PERFORMANCE__) return;
  window.__V72_DASHBOARD_TURBO_PERFORMANCE__ = true;

  function txt(v){ return v == null ? '' : String(v).replace(/\s+/g,' ').trim(); }
  function upper(v){ return txt(v).toUpperCase(); }
  function arr(v){
    if (Array.isArray(v)) return v.length ? v.map(txt).filter(Boolean) : ['ALL'];
    var s = txt(v);
    if (!s || s === 'ALL') return ['ALL'];
    return [s];
  }
  function all(v){ return arr(v).indexOf('ALL') >= 0; }
  function f(){ try { return window.F || F || {}; } catch(e) { return window.F || {}; } }
  function page(){ try { return window.currentPage || currentPage || 'overview'; } catch(e) { return window.currentPage || 'overview'; } }
  function fKey(){
    var x = f();
    return [txt(x.con || 'ALL'), arr(x.areaGrp).join('|'), arr(x.area).join('|'), arr(x.sys).join('|'), arr(x.stage).join('|')].join('§');
  }
  function rowMeta(r){
    if (!r) return {areas:[], grps:[], stage:{}};
    if (r.__v72_meta) return r.__v72_meta;
    var areas = [];
    try { if (typeof tpAreas === 'function') areas = tpAreas(r) || []; } catch(e) { areas = []; }
    if (!areas.length) {
      try {
        var raw = txt((r.areaRaw || r.area || ''));
        if (typeof extractAreas === 'function') areas = extractAreas(raw) || [];
        else areas = raw ? raw.split(/[;,\/]+/).map(upper).filter(Boolean) : [];
      } catch(e) { areas = []; }
    }
    areas = Array.from(new Set((areas || []).map(upper).filter(Boolean)));
    var grps = areas.map(function(a){ try { return typeof areaGroupOf === 'function' ? areaGroupOf(a) : a.charAt(0); } catch(e) { return a.charAt(0); } }).filter(Boolean);
    var st = r.st || {};
    r.__v72_meta = { areas: areas, grps: Array.from(new Set(grps)), stage: st };
    return r.__v72_meta;
  }

  var filterCache = new Map();
  function invalidate(){
    filterCache.clear();
    try { FILTER_CACHE = { key:'', data:null }; } catch(e) {}
    try { TEST_PACK_HEADER_MAP = null; } catch(e) {}
    // Do not clear PUNCH_FAST_CACHE on every render; it is expensive. It is cleared only when filters change.
    try { PUNCH_FAST_CACHE = {}; } catch(e) {}
  }

  function fastFiltered(){
    var key = fKey();
    if (filterCache.has(key)) return filterCache.get(key);
    var x = f();
    var con = txt(x.con || 'ALL');
    var areaGrpVals = arr(x.areaGrp);
    var areaVals = arr(x.area);
    var sysVals = arr(x.sys);
    var stageVals = arr(x.stage);
    var source = [];
    try { source = Array.isArray(TP) ? TP : []; } catch(e) { source = []; }
    var out = source.filter(function(r){
      if (con !== 'ALL' && txt(r && r.con) !== con) return false;
      var m = rowMeta(r);
      if (!all(areaGrpVals)) {
        if (!m.grps.length || !m.grps.some(function(g){ return areaGrpVals.indexOf(g) >= 0; })) return false;
      }
      if (!all(areaVals)) {
        if (!m.areas.length || !m.areas.some(function(a){ return areaVals.indexOf(a) >= 0; })) return false;
      }
      if (!all(sysVals) && sysVals.indexOf(txt(r && r.sys)) < 0) return false;
      if (!all(stageVals)) {
        var ok = stageVals.some(function(stg){
          if (stg === 'CNS L/C Completed') {
            try { return typeof hasCnsLC === 'function' ? hasCnsLC(r) : !!(m.stage && m.stage[stg]); } catch(e) { return !!(m.stage && m.stage[stg]); }
          }
          return !!(m.stage && m.stage[stg]);
        });
        if (!ok) return false;
      }
      return true;
    });
    filterCache.set(key, out);
    try { FILTER_CACHE = { key: key, data: out }; } catch(e) {}
    return out;
  }

  window.getFiltered = fastFiltered;
  try { getFiltered = window.getFiltered; } catch(e) {}

  var renderTimer = null;
  var renderFrame = null;
  var rendering = false;
  var liveForce = false;
  function activeTabData(){ return fastFiltered(); }
  function callRender(pg, data){
    if (pg === 'overview' && typeof renderOverview === 'function') return renderOverview(data);
    if (pg === 'stages' && typeof renderStages === 'function') return renderStages(data);
    if (pg === 'stagescontrol' && typeof renderStagesControl === 'function') return renderStagesControl(data);
    if (pg === 'material' && typeof renderMaterial === 'function') return renderMaterial(data);
    if (pg === 'punch' && typeof renderPunchPage === 'function') return renderPunchPage(data);
    if (pg === 'system' && typeof renderSystem === 'function') return renderSystem(data);
    if (pg === 'comparison' && typeof renderComparison === 'function') return renderComparison();
    if (pg === 'tplist' && typeof renderTestPackList === 'function') return renderTestPackList(data);
    if (pg === 'tpcomments' && typeof renderTestPackComments === 'function') return renderTestPackComments(data);
    if (pg === 'progress' && typeof renderProgress === 'function') return renderProgress(data);
  }
  function runLive(pg, force){
    if ((pg === 'overview' || pg === 'punch') && typeof window.refreshDashboardBItemKpi === 'function') {
      try { window.refreshDashboardBItemKpi(!!force); } catch(e) {}
    }
    if (pg === 'stagescontrol' && typeof window.refreshStageControlBItemD1 === 'function') {
      try { window.refreshStageControlBItemD1(!!force); } catch(e) {}
    }
  }
  function doRefresh(){
    if (rendering) return;
    rendering = true;
    var pg = page();
    try { callRender(pg, activeTabData()); } catch(e) { console.error('Dashboard render failed:', e); }
    var force = liveForce; liveForce = false;
    try { runLive(pg, force); } catch(e) {}
    rendering = false;
  }
  function turboRefresh(immediate){
    clearTimeout(renderTimer);
    if (renderFrame) { try { cancelAnimationFrame(renderFrame); } catch(e) {} renderFrame = null; }
    var run = function(){ renderFrame = requestAnimationFrame(function(){ renderFrame = null; doRefresh(); }); };
    if (immediate) run(); else renderTimer = setTimeout(run, 35);
  }
  window.refresh = turboRefresh;
  try { refresh = window.refresh; } catch(e) {}

  window.showPage = function(pg, btn){
    try {
      if (window.currentPage === pg && document.getElementById('page-' + pg) && document.getElementById('page-' + pg).classList.contains('active')) return;
    } catch(e) {}
    try { window.currentPage = pg; currentPage = pg; } catch(e) { window.currentPage = pg; }
    document.querySelectorAll('.page.active').forEach(function(p){ p.classList.remove('active'); });
    var p = document.getElementById('page-' + pg); if (p) p.classList.add('active');
    document.querySelectorAll('.tab.active').forEach(function(t){ t.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    liveForce = false;
    turboRefresh(true);
  };
  try { showPage = window.showPage; } catch(e) {}

  window.setF = function(key, val, btn){
    try { F[key] = val; window.F = F; } catch(e) { window.F = window.F || {}; window.F[key] = val; }
    if (key === 'con' && btn) document.querySelectorAll('.sidebar .fbtn').forEach(function(b){ b.classList.toggle('active', b === btn); });
    invalidate();
    liveForce = true;
    turboRefresh(true);
  };
  try { setF = window.setF; } catch(e) {}

  window.setMultiF = function(key, el){
    var vals;
    try { vals = typeof selectValues === 'function' ? selectValues(el) : ['ALL']; } catch(e) { vals = ['ALL']; }
    try { F[key] = vals; window.F = F; } catch(e) { window.F = window.F || {}; window.F[key] = vals; }
    try { if (typeof multiIsAll === 'function' && multiIsAll(vals) && typeof applyMultiSelect === 'function') applyMultiSelect(el, ['ALL']); } catch(e) {}
    invalidate();
    liveForce = true;
    turboRefresh(true);
  };
  try { setMultiF = window.setMultiF; } catch(e) {}

  window.resetFilters = function(){
    try { F = { con:'ALL', areaGrp:['ALL'], area:['ALL'], sys:['ALL'], stage:['ALL'] }; window.F = F; } catch(e) { window.F = { con:'ALL', areaGrp:['ALL'], area:['ALL'], sys:['ALL'], stage:['ALL'] }; }
    try { applyMultiSelect(document.getElementById('fAreaGrp'), ['ALL']); } catch(e) {}
    try { applyMultiSelect(document.getElementById('fArea'), ['ALL']); } catch(e) {}
    try { applyMultiSelect(document.getElementById('fSys'), ['ALL']); } catch(e) {}
    try { applyMultiSelect(document.getElementById('fStage'), ['ALL']); } catch(e) {}
    try { if (typeof updateSidebarMultiDropdownLabels === 'function') updateSidebarMultiDropdownLabels(); } catch(e) {}
    document.querySelectorAll('.sidebar .fbtn').forEach(function(b,i){ b.classList.toggle('active', i === 0); });
    invalidate();
    liveForce = true;
    turboRefresh(true);
  };
  try { resetFilters = window.resetFilters; } catch(e) {}

  // De-duplicate aggregate API requests that older dashboard patches may still trigger.
  function wrapRequest(name){
    var old = window[name];
    if (typeof old !== 'function' || old.__v72Wrapped) return;
    var pending = new Map();
    var lastRun = new Map();
    var wrapped = function(force){
      var key = fKey();
      if (pending.has(key)) return pending.get(key);
      if (!force && lastRun.has(key) && Date.now() - lastRun.get(key) < 45000) return Promise.resolve(null);
      var p;
      try { p = Promise.resolve(old.call(this, !!force)); }
      catch(e) { return Promise.reject(e); }
      pending.set(key, p);
      return p.finally(function(){ pending.delete(key); lastRun.set(key, Date.now()); });
    };
    wrapped.__v72Wrapped = true;
    window[name] = wrapped;
  }
  wrapRequest('refreshDashboardBItemKpi');
  wrapRequest('refreshStageControlBItemD1');
  wrapRequest('refreshStagePendingReinstScopeD1');

  // Avoid old warm-up calls adding load while the user is working.
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (nativeFetch && !window.__V72_FETCH_GUARD__) {
    window.__V72_FETCH_GUARD__ = true;
    window.fetch = function(input, init){
      var raw = (typeof input === 'string') ? input : (input && input.url) || '';
      if (/\/api\/bitem\/stage-control/i.test(raw) && /[?&]_warm=/.test(raw)) {
        return Promise.resolve(new Response(JSON.stringify({ ok:true, skipped:true, source:'v72_warm_guard' }), { status:200, headers:{'content-type':'application/json'} }));
      }
      return nativeFetch(input, init);
    };
  }

  invalidate();
  setTimeout(function(){ turboRefresh(true); }, 80);
})();
