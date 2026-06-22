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
      .bind(action, extra.bitem_id || '', extra.fingerprint || '', user?.username || '', user?.display_name || user?.name || '', user?.role || '', extra.ip || '', JSON.stringify(details || {})).run();
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
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify({
    sub: user.username,
    username: user.username,
    name: user.display_name || user.username,
    display_name: user.display_name || user.username,
    role: user.role || 'user',
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
    return payload;
  } catch (e) {
    return null;
  }
}

export async function requireUser(context, roles = []) {
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const user = await verifyToken(context.env, token);
  if (!user) return { error: json({ ok: false, error: 'Unauthorized' }, 401) };
  if (roles.length && !roles.includes(user.role)) {
    return { error: json({ ok: false, error: 'Forbidden' }, 403) };
  }
  return { user };
}

export function getClientIP(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
}
