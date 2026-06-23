function b64urlEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
  str = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

function hex(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); }
function randomSalt() { const a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s || '')));
  return hex(new Uint8Array(buf));
}

export const PAGE_KEYS = ['dashboard', 'bitem', 'bitem-monitoring', 'users'];
export const EDIT_PAGE_KEYS = ['bitem', 'users'];

export async function makePasswordHash(password) {
  const salt = randomSalt();
  return { salt, hash: await sha256Hex(`${salt}:${password}`) };
}

export async function verifyPasswordRecord(row, password) {
  if (!row) return false;
  if (row.password_hash && row.password_salt) {
    const h = await sha256Hex(`${row.password_salt}:${password}`);
    return h === row.password_hash;
  }
  if (row.password_plain != null && String(row.password_plain) === String(password)) return true;
  return false;
}

function toArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  const s = String(value || '').trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map(String);
  } catch (_) {}
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function uniqValid(list, valid) {
  const allow = new Set(valid);
  const out = [];
  for (const v of toArray(list)) {
    const k = String(v || '').trim().toLowerCase();
    if (allow.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

export function defaultPagePermissions(role) {
  // Role is only a quick preset. Actual access is stored in view_pages/edit_pages.
  // Admin remains full-access as a safety fallback.
  role = String(role || 'viewer').toLowerCase();
  if (role === 'admin') return { view_pages: [...PAGE_KEYS], edit_pages: [...EDIT_PAGE_KEYS] };
  if (role === 'user') return { view_pages: ['bitem'], edit_pages: ['bitem'] };
  return { view_pages: ['dashboard'], edit_pages: [] };
}

function wasProvided(value) {
  return value !== undefined && value !== null;
}

export function normalizePagePermissions(role, viewPages, editPages) {
  role = String(role || 'viewer').toLowerCase();
  const defaults = defaultPagePermissions(role);
  // Important: [] is a valid explicit choice meaning "no page access".
  // Only undefined/null means "use role default".
  let view = wasProvided(viewPages) ? uniqValid(viewPages, PAGE_KEYS) : defaults.view_pages;
  let edit = wasProvided(editPages) ? uniqValid(editPages, EDIT_PAGE_KEYS) : defaults.edit_pages;

  if (role === 'admin') {
    view = [...PAGE_KEYS];
    edit = [...EDIT_PAGE_KEYS];
  }
  if (role === 'viewer') {
    edit = [];
  }
  // Any page with edit permission must be viewable as well.
  for (const p of edit) if (!view.includes(p)) view.push(p);
  return { view_pages: view, edit_pages: edit };
}

export function userForClient(rowOrUser) {
  const username = rowOrUser?.username || rowOrUser?.sub || '';
  const display_name = rowOrUser?.display_name || rowOrUser?.name || username;
  const role = String(rowOrUser?.role || 'user').toLowerCase();
  const perms = normalizePagePermissions(role, rowOrUser?.view_pages, rowOrUser?.edit_pages);
  return {
    username,
    sub: username,
    display_name,
    name: display_name,
    role,
    is_active: Number(rowOrUser?.is_active ?? 1) === 1 ? 1 : 0,
    view_pages: perms.view_pages,
    edit_pages: perms.edit_pages,
    permissions: { view: perms.view_pages, edit: perms.edit_pages }
  };
}

export async function ensureAuthTables(env) {
  if (!env || !env.DB) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    display_name TEXT,
    role TEXT DEFAULT 'user',
    password_plain TEXT,
    password_hash TEXT,
    password_salt TEXT,
    is_active INTEGER DEFAULT 1,
    view_pages TEXT,
    edit_pages TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT,
    last_login_ip TEXT
  )`).run();
  const alters = [
    "ALTER TABLE users ADD COLUMN display_name TEXT",
    "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
    "ALTER TABLE users ADD COLUMN password_plain TEXT",
    "ALTER TABLE users ADD COLUMN password_hash TEXT",
    "ALTER TABLE users ADD COLUMN password_salt TEXT",
    "ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1",
    "ALTER TABLE users ADD COLUMN view_pages TEXT",
    "ALTER TABLE users ADD COLUMN edit_pages TEXT",
    "ALTER TABLE users ADD COLUMN created_by TEXT",
    "ALTER TABLE users ADD COLUMN created_at TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))",
    "ALTER TABLE users ADD COLUMN last_login_at TEXT",
    "ALTER TABLE users ADD COLUMN last_login_ip TEXT"
  ];
  for (const sql of alters) { try { await env.DB.prepare(sql).run(); } catch (_) {} }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bitem_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    bitem_id TEXT,
    fingerprint TEXT,
    username TEXT,
    display_name TEXT,
    role TEXT,
    ip TEXT,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run().catch(() => null);
}

export async function audit(env, action, user, details = {}, extra = {}) {
  if (!env || !env.DB) return;
  try {
    await env.DB.prepare(`INSERT INTO bitem_audit_log(action, bitem_id, fingerprint, username, display_name, role, ip, details, created_at)
      VALUES(?,?,?,?,?,?,?,?,datetime('now'))`)
      .bind(action, extra.bitem_id || '', extra.fingerprint || '', user?.username || user?.sub || '', user?.display_name || user?.name || '', user?.role || '', extra.ip || '', JSON.stringify(details || {})).run();
  } catch (_) {}
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function createToken(env, user) {
  const secret = env.AUTH_SECRET || env.ADMIN_PASSWORD || 'CHANGE_ME';
  const now = Math.floor(Date.now() / 1000);
  const safeUser = userForClient(user || {});
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify({
    sub: safeUser.username,
    username: safeUser.username,
    name: safeUser.display_name,
    display_name: safeUser.display_name,
    role: safeUser.role,
    view_pages: safeUser.view_pages,
    edit_pages: safeUser.edit_pages,
    permissions: safeUser.permissions,
    iat: now,
    exp: now + 60 * 60 * 12
  }));
  const unsigned = `${header}.${payload}`;
  const sig = await hmac(secret, unsigned);
  return `${unsigned}.${sig}`;
}

export async function verifyToken(env, token) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = await hmac(env.AUTH_SECRET || env.ADMIN_PASSWORD || 'CHANGE_ME', unsigned);
    if (expected !== parts[2]) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return userForClient(payload);
  } catch (e) {
    return null;
  }
}

export async function getDbUser(env, tokenUser) {
  if (!env || !env.DB || !tokenUser) return tokenUser ? userForClient(tokenUser) : null;
  await ensureAuthTables(env);
  const username = String(tokenUser.username || tokenUser.sub || '').toLowerCase();
  if (!username) return null;
  const row = await env.DB.prepare('SELECT username, display_name, role, is_active, view_pages, edit_pages, updated_at, last_login_at FROM users WHERE username=?').bind(username).first();
  if (!row) return userForClient(tokenUser);
  if (Number(row.is_active) !== 1) return null;
  return userForClient(row);
}

export async function requireUser(context, roles = []) {
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const tokenUser = await verifyToken(context.env, token);
  if (!tokenUser) return { error: json({ ok: false, error: 'Unauthorized' }, 401) };
  const user = await getDbUser(context.env, tokenUser);
  if (!user) return { error: json({ ok: false, error: 'Unauthorized or disabled account' }, 401) };
  if (roles.length && !roles.includes(user.role)) {
    return { error: json({ ok: false, error: 'Forbidden' }, 403) };
  }
  return { user };
}

export function hasPagePermission(user, page, mode = 'view') {
  const u = userForClient(user || {});
  if (u.role === 'admin') return true;
  page = String(page || '').toLowerCase();
  mode = String(mode || 'view').toLowerCase();
  if (mode === 'edit') return u.edit_pages.includes(page);
  return u.view_pages.includes(page);
}

export async function requirePagePermission(context, page, mode = 'view') {
  const auth = await requireUser(context, []);
  if (auth.error) return auth;
  if (!hasPagePermission(auth.user, page, mode)) {
    return { error: json({ ok: false, error: `No ${mode} permission for ${page}` }, 403), user: auth.user };
  }
  return auth;
}

export function getClientIP(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
}
