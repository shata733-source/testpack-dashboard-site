async function api(path, opts={}){
  const res=await fetch(path,{credentials:'include',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
  const text=await res.text();
  let data; try{data=text?JSON.parse(text):{};}catch(e){data={ok:false,error:'Bad JSON response',raw:text.slice(0,300)}}
  if(!res.ok) throw Object.assign(new Error(data.error||data.message||res.statusText),{status:res.status,data});
  return data;
}
async function me(){ try{return await api('/api/auth/me');}catch(e){return {ok:false}} }
async function requireAdmin(){ const u=await me(); if(!u.ok){ location.href='/login.html?next='+encodeURIComponent(location.pathname); return null; } const role=(u.user&&u.user.role)||u.role||'admin'; if(role!=='admin'){ document.body.innerHTML='<div class="wrap"><div class="card"><h2>Unauthorized</h2><p class="muted">Admin only page.</p><a class="btn" href="/dashboard.html">Back to Dashboard</a></div></div>'; return null;} return u; }
function navHtml(active){return `<div class="topbar"><div class="brand">Test Pack Dashboard<small>CCC · Saudi Aramco · DPCU</small></div><div class="nav"><a ${active==='dashboard'?'style="border-color:var(--cyan)"':''} href="/dashboard.html">📊 Dashboard</a><a ${active==='bitem'?'style="border-color:var(--cyan)"':''} href="/bitem.html">📋 B Item Control</a><a ${active==='monitor'?'style="border-color:var(--cyan)"':''} href="/bitem-monitoring.html">🔎 B Item Monitoring</a><a ${active==='users'?'style="border-color:var(--cyan)"':''} href="/users.html">👥 User Management</a></div></div>`}
