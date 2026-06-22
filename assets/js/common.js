const DATA_URL='https://raw.githubusercontent.com/shata733-source/testpack-data/main/dashboard_data.js';
const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const fmt=n=>Number(n||0).toLocaleString();
const norm=x=>String(x??'').trim(); const up=x=>norm(x).toUpperCase();
function getUser(){try{return JSON.parse(localStorage.getItem('tpc_user')||'null')}catch{return null}}
function setUser(u){localStorage.setItem('tpc_user',JSON.stringify(u||{}))}
function logout(){localStorage.removeItem('tpc_user'); location.href='index.html'}
async function api(path,opt={}){const res=await fetch(path,{credentials:'include',headers:{'content-type':'application/json',...(opt.headers||{})},...opt}); const txt=await res.text(); try{return JSON.parse(txt)}catch{return {ok:false,error:'Bad JSON',text:txt,status:res.status}}}
async function loadDashboardData(){if(window.__dashboardLoaded)return window.__dashboardLoaded; window.__dashboardLoaded=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=DATA_URL+'?v='+Date.now();s.onload=()=>resolve(window);s.onerror=()=>reject(new Error('dashboard_data.js failed'));document.head.appendChild(s)});return window.__dashboardLoaded}
function rowVal(r,names){for(const n of names){if(r&&r[n]!=null&&String(r[n]).trim()!=='')return r[n]}return ''}
function tpNo(r){return norm(rowVal(r,['TestPackNo','Test Pack No','TP Number','TP NUMBER','Test Pack','testpack','tp_no']))}
function stageVal(r){return norm(rowVal(r,['Construction Stage','Stage','Last FMS Stage','CCC Last Stage','stage','construction_stage']))}
function areaVal(r){return norm(rowVal(r,['Area','AREA','area']))}
function systemVal(r){return norm(rowVal(r,['SystemNo','System','system','System No']))}
function contractorVal(r){const v=up(rowVal(r,['CCC / JGC Direct MP','Contractor','contractor','Scope'])); if(v.includes('CCC'))return 'CCC'; if(v.includes('JGC'))return 'JGC Direct MP'; return ''}
function statusPill(v){const t=norm(v)||'NOT CLEARED'; const ok=up(t).includes('CLEAR')&&!up(t).includes('NOT'); return `<span class="pill ${ok?'green':''}">${ok?'✓ ':''}${t}</span>`}
function shell(active,title){const user=getUser()||{displayName:'Mohamed Shata',role:'admin'}; const monitor=(up(user.role||'admin')==='ADMIN'); document.write(`
<div class="topbar"><div class="brand"><img src="assets/img/ccc-logo.png"><span>CCC</span> <span>Control Platform</span></div>
<a class="navitem" href="projects.html">HOME</a>
<div class="navitem">DASHBOARD<div class="dropdown"><a href="dashboard.html">▣ Test Pack Dashboard</a></div></div>
<div class="navitem">CONSTRUCTION<div class="dropdown"><a href="bitem.html">▣ B Punch Edit</a></div></div>
${monitor?`<div class="navitem">MONITOR<div class="dropdown"><a href="bitem-monitoring.html">▣ B Item Monitoring</a><a href="users.html">▣ User Management</a></div></div>`:''}
<div class="top-right"><b>PROJECT</b><select class="project-select"><option>DPCU</option></select><div class="profile"><button class="btn ghost">👤 ${user.displayName||user.username||'Profile'}</button><div class="profile-menu"><a href="profile.html">My Profile</a><a href="profile.html#password">Change Password</a><a href="javascript:logout()">Logout</a></div></div></div></div>`)}
