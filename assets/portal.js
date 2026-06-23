const CCC_AUTH_TOKEN_KEY = 'ccc_bitem_auth_token';
const CCC_AUTH_USER_KEY  = 'ccc_bitem_auth_user';
const CCC_PAGES = {
  dashboard: { title: 'Test Pack Dashboard', href: '/dashboard.html#/dashboard' },
  bitem: { title: 'B Punch Edit', href: '/bitem.html#/bitem' },
  'bitem-monitoring': { title: 'B Item Monitoring', href: '/bitem-monitoring.html#/monitoring' },
  users: { title: 'User Management', href: '/users.html' }
};
const CCC_EDIT_PAGES = ['bitem','users'];

function authToken(){
  try{return localStorage.getItem(CCC_AUTH_TOKEN_KEY)||'';}catch(e){return '';}
}
function authUser(){
  try{return JSON.parse(localStorage.getItem(CCC_AUTH_USER_KEY)||'null');}catch(e){return null;}
}
function setPortalAuth(token,user){
  try{
    if(token)localStorage.setItem(CCC_AUTH_TOKEN_KEY,token);
    if(user)localStorage.setItem(CCC_AUTH_USER_KEY,JSON.stringify(user||{}));
  }catch(e){}
}
function clearPortalAuth(){
  try{localStorage.removeItem(CCC_AUTH_TOKEN_KEY);localStorage.removeItem(CCC_AUTH_USER_KEY);}catch(e){}
}
function nextUrl(){return location.pathname + location.search + location.hash;}

async function api(path, opts={}){
  opts = opts || {};
  const headers = {'Content-Type':'application/json', ...(opts.headers||{})};
  const t = authToken();
  if(t && !headers.authorization && !headers.Authorization) headers.authorization = 'Bearer '+t;
  const res=await fetch(path,{credentials:'include',cache:'no-store',...opts,headers});
  const text=await res.text();
  let data;try{data=text?JSON.parse(text):{}}catch(e){data={ok:false,error:'Bad JSON response',raw:text.slice(0,300)}}
  if(!res.ok)throw Object.assign(new Error(data.error||data.message||res.statusText),{status:res.status,data});
  return data;
}
async function currentUser(){
  try{
    const d=await api('/api/auth/me');
    if(d && d.user) setPortalAuth(null,d.user);
    return d;
  }catch(e){return {ok:false,user:null}}
}
function roleOf(data){return (data&&data.user&&(data.user.role||data.user.role_name)) || (data&&data.role) || (authUser()&&authUser().role) || '';}
function arr(v){
  if(Array.isArray(v))return v.map(String);
  if(v==null)return [];
  try{const j=JSON.parse(String(v)); if(Array.isArray(j))return j.map(String);}catch(e){}
  return String(v).split(',').map(x=>x.trim()).filter(Boolean);
}
function defaultPerms(role){
  role=String(role||'viewer').toLowerCase();
  if(role==='admin')return {view:Object.keys(CCC_PAGES), edit:CCC_EDIT_PAGES.slice()};
  if(role==='user')return {view:['bitem'], edit:['bitem']};
  return {view:['dashboard'], edit:[]};
}
function hasOwn(obj,key){return !!obj && Object.prototype.hasOwnProperty.call(obj,key);}
function userPerms(user){
  user=user || authUser() || {};
  const role=String(user.role||'viewer').toLowerCase();
  if(role==='admin')return defaultPerms('admin');
  const def=defaultPerms(role);
  // Explicit [] means the user can see no pages. Only missing/null falls back to role preset.
  const rawView = hasOwn(user,'view_pages') ? user.view_pages : (user.permissions && hasOwn(user.permissions,'view') ? user.permissions.view : null);
  const rawEdit = hasOwn(user,'edit_pages') ? user.edit_pages : (user.permissions && hasOwn(user.permissions,'edit') ? user.permissions.edit : null);
  let view = rawView == null ? def.view : arr(rawView);
  let edit = rawEdit == null ? def.edit : arr(rawEdit);
  if(role==='viewer')edit=[];
  edit.forEach(p=>{if(!view.includes(p))view.push(p)});
  return {view,edit};
}
function canViewPage(page,user){
  user=user || authUser() || {};
  if(String(user.role||'').toLowerCase()==='admin')return true;
  return userPerms(user).view.includes(page);
}
function canEditPage(page,user){
  user=user || authUser() || {};
  if(String(user.role||'').toLowerCase()==='admin')return true;
  return userPerms(user).edit.includes(page);
}
function unauthorizedHtml(message){
  return '<div style="min-height:100vh;background:#06101c;color:#f4f7fb;font-family:Inter,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px"><div style="max-width:520px;background:#0e1b2c;border:1px solid #203a5b;border-radius:18px;padding:28px;text-align:center"><h2 style="margin:0 0 10px">Unauthorized</h2><p style="color:#9fb3ca">'+(message||'Your account does not have access to this page.')+'</p><a href="/projects.html" style="display:inline-block;margin-top:12px;border:1px solid #00d4ff;color:#00d4ff;padding:10px 14px;border-radius:10px;text-decoration:none;font-weight:800">🏠 Home</a></div></div>';
}

async function enforcePageAccess(roles=[], options={}){
  const allowVisitor = !!options.allowVisitor;
  const page = options.page || '';
  const mode = options.mode || 'view';
  const isVisitor = new URLSearchParams(location.search).get('visitor') === '1' || sessionStorage.getItem('cccVisitorMode') === '1';
  if(allowVisitor && isVisitor) return {ok:true, role:'visitor', user:null, canEdit:false};
  const u = await currentUser();
  if(!u.ok || !u.user){
    if(options.soft) return {ok:false, role:'', user:null, canEdit:false};
    location.href='/login.html?next='+encodeURIComponent(nextUrl());
    return {ok:false, role:'', user:null, canEdit:false};
  }
  const role = roleOf(u);
  if(roles.length && !roles.includes(role)){
    if(options.soft) return {ok:false, role, user:u.user, canEdit:false};
    document.body.innerHTML=unauthorizedHtml('Your account role does not have access to this page.');
    return {ok:false, role, user:u.user, canEdit:false};
  }
  if(page){
    const ok = (mode==='edit') ? canEditPage(page,u.user) : canViewPage(page,u.user);
    if(!ok){
      if(options.soft) return {ok:false, role, user:u.user, canEdit:canEditPage(page,u.user)};
      document.body.innerHTML=unauthorizedHtml('This page is not enabled for your account.');
      return {ok:false, role, user:u.user, canEdit:false};
    }
  }
  return {ok:true, role, user:u.user, canEdit: page ? canEditPage(page,u.user) : false};
}

function fmsNav(active='', role='', userArg=null) {
  const user = userArg || authUser() || {role};
  role = role || String(user.role||'');
  const dash = canViewPage('dashboard',user) ? `<div class="fms-item ${active==='dashboard'?'active':''}">DASHBOARD<div class="fms-drop"><div class="drop-section"><div class="drop-title">📊 Project Dashboards</div><a class="drop-link" href="/dashboard.html#/dashboard">Test Pack Dashboard</a></div></div></div>` : '';
  const construction = canViewPage('bitem',user) ? `<div class="fms-item ${active==='construction'?'active':''}">CONSTRUCTION<div class="fms-drop"><div class="drop-section"><div class="drop-title">🔧 Construction Control</div><a class="drop-link" href="/bitem.html#/bitem">B Punch Edit</a></div></div></div>` : '';
  const monitorLinks = [];
  if(canViewPage('bitem-monitoring',user)) monitorLinks.push('<a class="drop-link" href="/bitem-monitoring.html#/monitoring">B Item Monitoring</a>');
  if(canViewPage('users',user)) monitorLinks.push('<a class="drop-link" href="/users.html">User Management</a>');
  const monitor = monitorLinks.length ? `<div class="fms-item ${active==='monitor'?'active':''}" id="monitorMenu">MONITOR<div class="fms-drop"><div class="drop-section"><div class="drop-title">🧭 Admin Monitoring</div>${monitorLinks.join('')}</div></div></div>` : '';
  return `<div class="fms-bar"><div class="fms-logo"><img src="/assets/ccc-logo.png" alt="CCC"><div><span>CCC</span> Control Platform</div></div><nav class="fms-menu"><a class="fms-item" href="/projects.html">HOME</a>${dash}${construction}${monitor}</nav><div class="project-select"><span>PROJECT</span><select><option>DPCU</option><option disabled>Future Project</option></select></div><div class="profile-menu"><button class="profile-btn" type="button">👤 Profile ▾</button><div class="profile-drop"><a href="/profile.html">My Profile</a><a href="/profile.html#password">Change Password</a><button type="button" onclick="logoutPortal()">Logout</button></div></div></div>`
}
async function renderNav(active=''){
  const host=document.getElementById('nav');
  if(!host)return;
  const u=await currentUser();
  const role=roleOf(u);
  host.innerHTML=fmsNav(active,role,u.user||null);
}
async function logoutPortal(){try{clearPortalAuth();sessionStorage.clear();await fetch('/api/auth/logout',{method:'POST',credentials:'include'}).catch(()=>null);}catch(e){} location.href='/index.html';}
async function applyRoleNav(){
  const u=await currentUser();
  const role=roleOf(u);
  const m=document.getElementById('monitorMenu');
  if(m && role!=='admin' && !canViewPage('bitem-monitoring',u.user))m.style.display='none';
}
