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
    const data=await api('/api/bitem/state?include_removed=1&limit=2000&q='+encodeURIComponent(q),{method:'GET'});
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
    const headers=['Action','B Item ID','TP Number','Contractor','Stage','Comment','Query Status','Final Status','Punch Cleared','User Cleared','Source Flag','Sync Note','Last Edited By','Last Edited At'];
    head.innerHTML='<tr>'+headers.map(h=>`<th>${h}</th>`).join('')+'</tr>';
    const start=(window.BITEM_CTRL_PAGE-1)*size;
    const rows=API.stateRows.slice(start,start+size);
    body.innerHTML=rows.map(r=>{
      const red=Number(r.active)===0||r.source_flag==='REMOVED_FROM_EXCEL';
      return `<tr class="${red?'warn-row':''}"><td><button class="pager-btn" type="button" onclick="window.bitemEdit('${r.bitem_id}','${r.fingerprint}')">✏️ Edit</button></td><td>${clean(r.bitem_id)}</td><td>${clean(r.tp_no)}</td><td>${clean(r.contractor)}</td><td>${clean(r.construction_stage)}</td><td title="${clean(r.comment_text)}">${clean(r.comment_text)}</td><td>${clean(r.query_status)}</td><td>${clean(r.final_status)}</td><td>${clean(r.final_cleared_date)}</td><td>${clean(r.user_cleared_date)}</td><td>${clean(r.source_flag)}</td><td>${clean(r.sync_note)}</td><td>${clean(r.last_edited_by)}</td><td>${clean(r.last_edited_at)}</td></tr>`;
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
