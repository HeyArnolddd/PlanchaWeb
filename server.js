const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool, types } = require('pg');

// COUNT/SUM llegan como bigint (texto); los volvemos números
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => Number(v)); // SUM() de bigint llega como numeric

if (!process.env.DATABASE_URL) {
  console.error('Falta la variable DATABASE_URL (conexión a PostgreSQL).');
}
const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: local ? false : { rejectUnauthorized: false },
  max: process.env.VERCEL ? 3 : 10,
});

const exec = (c) => ({
  all: async (sql, p = []) => (await c.query(sql, p)).rows,
  get: async (sql, p = []) => (await c.query(sql, p)).rows[0],
  run: (sql, p = []) => c.query(sql, p),
});
const D = exec(pool);
async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(exec(c));
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','turno')),
  active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  buy_price BIGINT NOT NULL DEFAULT 0,
  sell_price BIGINT NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS stock_entries (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  buy_price BIGINT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  open_cash BIGINT NOT NULL,
  open_nequi BIGINT NOT NULL,
  sys_open_cash BIGINT NOT NULL,
  sys_open_nequi BIGINT NOT NULL,
  close_cash BIGINT,
  close_nequi BIGINT,
  sys_close_cash BIGINT,
  sys_close_nequi BIGINT,
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_shift ON shifts ((1)) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  method TEXT NOT NULL CHECK (method IN ('efectivo','nequi')),
  total BIGINT NOT NULL,
  voided INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sales_shift ON sales (shift_id);
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  price BIGINT NOT NULL,
  cost BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_items_sale ON sale_items (sale_id);
CREATE TABLE IF NOT EXISTS register (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cash BIGINT NOT NULL DEFAULT 0,
  nequi BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS adjustments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  method TEXT NOT NULL CHECK (method IN ('efectivo','nequi')),
  amount BIGINT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  amount BIGINT NOT NULL,
  method TEXT CHECK (method IN ('efectivo','nequi')),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS product_photos (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  data BYTEA NOT NULL,
  mime TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL,
  fee BIGINT NOT NULL,
  fee_method TEXT NOT NULL CHECK (fee_method IN ('efectivo','nequi')),
  voided INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'nequi_efectivo';
CREATE INDEX IF NOT EXISTS withdrawals_shift ON withdrawals (shift_id);
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_method_check CHECK (method IN ('efectivo','nequi','mixto'));
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_amount BIGINT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS nequi_amount BIGINT;
UPDATE sales SET cash_amount=CASE WHEN method='efectivo' THEN total ELSE 0 END,
  nequi_amount=CASE WHEN method='nequi' THEN total ELSE 0 END WHERE cash_amount IS NULL;
ALTER TABLE sales ALTER COLUMN cash_amount SET NOT NULL;
ALTER TABLE sales ALTER COLUMN nequi_amount SET NOT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS write_offs (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  cost BIGINT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS payouts (
  id SERIAL PRIMARY KEY,
  category_id INTEGER,
  category TEXT NOT NULL,
  sold_cost BIGINT NOT NULL,
  lost_cost BIGINT NOT NULL,
  total BIGINT NOT NULL,
  method TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS payee TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS product_id INTEGER;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS sold_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS lost_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS payout_id INTEGER;
ALTER TABLE write_offs ADD COLUMN IF NOT EXISTS payout_id INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'implementos';
CREATE TABLE IF NOT EXISTS benefit_uses (
  user_id INTEGER NOT NULL REFERENCES users(id),
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE benefit_uses DROP CONSTRAINT IF EXISTS benefit_uses_pkey;
ALTER TABLE benefit_uses ADD COLUMN IF NOT EXISTS day DATE;
UPDATE benefit_uses SET day=(created_at AT TIME ZONE 'America/Bogota')::date WHERE day IS NULL;
ALTER TABLE benefit_uses ALTER COLUMN day SET NOT NULL;
DROP INDEX IF EXISTS benefit_user_day;
ALTER TABLE benefit_uses ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE benefit_uses ADD COLUMN IF NOT EXISTS person_name TEXT;
ALTER TABLE benefit_uses ADD COLUMN IF NOT EXISTS person_key TEXT;
UPDATE benefit_uses b SET person_name=u.name, person_key=lower(u.name) FROM users u WHERE b.user_id=u.id AND b.person_key IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS benefit_person_day ON benefit_uses (person_key, day);
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS recipient_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS chat_messages_pair ON chat_messages (user_id, recipient_id);
CREATE TABLE IF NOT EXISTS chat_reads (
  user_id INTEGER NOT NULL REFERENCES users(id),
  peer_id INTEGER NOT NULL,
  last_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, peer_id)
);
CREATE TABLE IF NOT EXISTS stickers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  data BYTEA NOT NULL,
  mime TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sticker_id INTEGER REFERENCES stickers(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log (created_at DESC);
INSERT INTO register (id, cash, nequi) VALUES (1, 0, 0) ON CONFLICT DO NOTHING;
`;

async function init() {
  await tx(async (t) => {
    await t.run('SELECT pg_advisory_xact_lock(7001)'); // evita carreras entre arranques simultáneos
    await t.run(SCHEMA);
    if ((await t.get('SELECT COUNT(*) c FROM users')).c === 0) {
      const username = (process.env.ADMIN_USER || 'admin').toLowerCase();
      const pass = process.env.ADMIN_PASSWORD || 'admin123';
      await t.run('INSERT INTO users (username,name,password_hash,role,must_change) VALUES ($1,$2,$3,$4,$5)',
        [username, 'Administrador', bcrypt.hashSync(pass, 10), 'admin', process.env.ADMIN_PASSWORD ? 0 : 1]);
      console.log(`Usuario administrador creado: ${username}`);
    }
    if ((await t.get('SELECT COUNT(*) c FROM categories')).c === 0) {
      for (const n of ['Postobon', 'Coca cola', 'Confiteria', 'Empanadas', 'Emprendimientos', 'Crema Helado'])
        await t.run('INSERT INTO categories (name) VALUES ($1)', [n]);
    }
    await t.run(`DELETE FROM sessions WHERE created_at < now() - interval '14 days'`);
  });
}
let ready;
const ensureReady = () => (ready ||= init().catch((e) => { ready = null; throw e; }));

// ---------- Utilidades ----------
const now = () => new Date();
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '400kb' }));
app.use((req, res, next) => (req.path.startsWith('/api') ? ensureReady().then(() => next(), next) : next()));

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);
const wrap = (fn) => (req, res, next) =>
  Promise.resolve().then(() => fn(req, res)).then((r) => { if (r !== undefined) res.json(r); }, next);
const int = (v, name, { min = 0, max = 1e9 } = {}) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isInteger(n) || n < min || n > max) throw bad(`Valor inválido: ${name}`);
  return n;
};
const str = (v, name, max = 100) => {
  const s = String(v ?? '').trim();
  if (!s) throw bad(`Falta: ${name}`);
  if (s.length > max) throw bad(`${name} es demasiado largo`);
  return s;
};
const method = (v) => {
  if (v !== 'efectivo' && v !== 'nequi') throw bad('Medio de pago inválido');
  return v;
};
const col = (m) => (m === 'efectivo' ? 'cash' : 'nequi'); // nombre de columna seguro
// Registro de actividad (quién hizo qué); x es D o la transacción t
const audit = (x, u, action, detail = null) =>
  x.run('INSERT INTO audit_log (user_id,user_name,action,detail,created_at) VALUES ($1,$2,$3,$4,$5)',
    [u.id, u.name, action, detail, now()]);
const dup = (e, msg) => { if (e.code === '23505') throw bad(msg); throw e; };

// ---------- Autenticación ----------
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function cookieOpts(req, maxAge) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

app.use('/api', (req, res, next) => {
  const token = parseCookies(req).sid;
  if (!token) return next();
  req.token = token;
  D.get(`SELECT u.id,u.username,u.name,u.role,u.must_change FROM sessions s
    JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND u.active=1`, [token])
    .then((u) => { req.user = u; next(); }, next);
});
const auth = (req, res, next) => (req.user ? next() : next(new HttpError(401, 'Inicia sesión')));
const admin = (req, res, next) => (req.user?.role === 'admin' ? next() : next(new HttpError(403, 'Solo administrador')));

app.post('/api/login', wrap(async (req, res) => {
  const u = await D.get('SELECT * FROM users WHERE username=$1 AND active=1', [String(req.body.username || '').trim().toLowerCase()]);
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  const token = crypto.randomBytes(32).toString('hex');
  await D.run('INSERT INTO sessions (token,user_id,created_at) VALUES ($1,$2,$3)', [token, u.id, now()]);
  await audit(D, u, 'Inició sesión');
  res.setHeader('Set-Cookie', `sid=${token}; ${cookieOpts(req, 60 * 60 * 24 * 14)}`);
  return { id: u.id, username: u.username, name: u.name, role: u.role, must_change: u.must_change };
}));
app.post('/api/logout', wrap(async (req, res) => {
  if (req.token) await D.run('DELETE FROM sessions WHERE token=$1', [req.token]);
  res.setHeader('Set-Cookie', `sid=; ${cookieOpts(req, 0)}`);
  return { ok: true };
}));
app.get('/api/me', wrap((req) => req.user || null));
app.post('/api/password', auth, wrap(async (req) => {
  const u = await D.get('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (!bcrypt.compareSync(String(req.body.current || ''), u.password_hash)) throw bad('La contraseña actual no es correcta');
  const np = String(req.body.password || '');
  if (np.length < 6) throw bad('La nueva contraseña debe tener al menos 6 caracteres');
  await D.run('UPDATE users SET password_hash=$1, must_change=0 WHERE id=$2', [bcrypt.hashSync(np, 10), u.id]);
  await audit(D, req.user, 'Cambió su contraseña');
  return { ok: true };
}));

// ---------- Usuarios ----------
app.get('/api/users', auth, admin, wrap(() =>
  D.all('SELECT id,username,name,role,active FROM users ORDER BY active DESC, name')));
app.post('/api/users', auth, admin, wrap(async (req) => {
  const username = str(req.body.username, 'Usuario', 30).toLowerCase();
  const name = str(req.body.name, 'Nombre', 60);
  const password = String(req.body.password || '');
  if (password.length < 6) throw bad('La contraseña debe tener al menos 6 caracteres');
  const role = req.body.role === 'admin' ? 'admin' : 'turno';
  try {
    const r = await D.get('INSERT INTO users (username,name,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id',
      [username, name, bcrypt.hashSync(password, 10), role]);
    await audit(D, req.user, 'Creó usuario', `${name} (${username}) · ${role === 'admin' ? 'Admin' : 'Turno'}`);
    return r;
  } catch (e) { dup(e, 'Ese usuario ya existe'); }
}));
app.put('/api/users/:id', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  const u = await D.get('SELECT * FROM users WHERE id=$1', [id]);
  if (!u) throw new HttpError(404, 'No existe');
  const name = req.body.name ? str(req.body.name, 'Nombre', 60) : u.name;
  const role = req.body.role ? (req.body.role === 'admin' ? 'admin' : 'turno') : u.role;
  const active = req.body.active === undefined ? u.active : (req.body.active ? 1 : 0);
  if (id === req.user.id && (!active || role !== 'admin')) throw bad('No puedes quitarte el acceso de administrador a ti mismo');
  if (!active && await D.get('SELECT 1 FROM shifts WHERE user_id=$1 AND closed_at IS NULL', [id]))
    throw bad('Este usuario tiene la caja abierta; ciérrala antes de desactivarlo');
  await D.run('UPDATE users SET name=$1, role=$2, active=$3 WHERE id=$4', [name, role, active, id]);
  if (req.body.password) {
    const p = String(req.body.password);
    if (p.length < 6) throw bad('La contraseña debe tener al menos 6 caracteres');
    await D.run('UPDATE users SET password_hash=$1, must_change=0 WHERE id=$2', [bcrypt.hashSync(p, 10), id]);
  }
  if (!active) await D.run('DELETE FROM sessions WHERE user_id=$1', [id]);
  const ch = [];
  if (name !== u.name) ch.push(`nombre → ${name}`);
  if (role !== u.role) ch.push(`rol → ${role === 'admin' ? 'Admin' : 'Turno'}`);
  if (active !== u.active) ch.push(active ? 'activado' : 'desactivado');
  if (req.body.password) ch.push('nueva contraseña');
  await audit(D, req.user, 'Editó usuario', `${u.name} (${u.username})${ch.length ? ': ' + ch.join(', ') : ''}`);
  return { ok: true };
}));

// ---------- Categorías ----------
app.get('/api/categories', auth, wrap(() => D.all('SELECT * FROM categories ORDER BY name')));
app.post('/api/categories', auth, admin, wrap(async (req) => {
  const name = str(req.body.name, 'Nombre', 40);
  try { const r = await D.get('INSERT INTO categories (name) VALUES ($1) RETURNING id', [name]); await audit(D, req.user, 'Creó categoría', name); return r; }
  catch (e) { dup(e, 'Esa categoría ya existe'); }
}));
app.put('/api/categories/:id', auth, admin, wrap(async (req) => {
  const name = str(req.body.name, 'Nombre', 40);
  try {
    const id = int(req.params.id, 'id');
    const old = await D.get('SELECT name FROM categories WHERE id=$1', [id]);
    await D.run('UPDATE categories SET name=$1 WHERE id=$2', [name, id]);
    await audit(D, req.user, 'Renombró categoría', `${old ? old.name : id} → ${name}`);
    return { ok: true };
  }
  catch (e) { dup(e, 'Esa categoría ya existe'); }
}));
app.delete('/api/categories/:id', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  if (await D.get('SELECT 1 FROM products WHERE category_id=$1', [id])) throw bad('Hay productos en esta categoría; muévelos primero');
  const c = await D.get('DELETE FROM categories WHERE id=$1 RETURNING name', [id]);
  if (c) await audit(D, req.user, 'Eliminó categoría', c.name);
  return { ok: true };
}));

// ---------- Productos / stock ----------
app.get('/api/products', auth, wrap(async (req) => {
  const rows = await D.all(`SELECT p.*, c.name AS category,
    (SELECT extract(epoch FROM updated_at)::bigint FROM product_photos f WHERE f.product_id=p.id) AS photo
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.active DESC, c.name, p.name`);
  if (req.user.role !== 'admin') rows.forEach((r) => {
    if (/^empanada/i.test(r.category || '')) r.benefit_price = r.buy_price;
    delete r.buy_price;
  });
  return rows;
}));
async function productBody(b) {
  const category_id = b.category_id ? int(b.category_id, 'categoría') : null;
  if (category_id && !await D.get('SELECT 1 FROM categories WHERE id=$1', [category_id])) throw bad('Categoría inválida');
  return {
    name: str(b.name, 'Nombre', 80),
    category_id,
    buy_price: int(b.buy_price, 'precio de compra'),
    sell_price: int(b.sell_price, 'precio de venta'),
    min_stock: int(b.min_stock ?? 0, 'stock mínimo'),
    track_stock: b.track_stock === false || b.track_stock === 0 ? 0 : 1,
  };
}
app.post('/api/products', auth, admin, wrap(async (req) => {
  const p = await productBody(req.body);
  const qty = p.track_stock ? int(req.body.stock ?? 0, 'cantidad inicial') : 0;
  return tx(async (t) => {
    const { id } = await t.get(`INSERT INTO products (name,category_id,buy_price,sell_price,stock,min_stock,track_stock)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [p.name, p.category_id, p.buy_price, p.sell_price, qty, p.min_stock, p.track_stock]);
    if (qty > 0) await t.run('INSERT INTO stock_entries (product_id,qty,buy_price,user_id,note,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, qty, p.buy_price, req.user.id, 'Stock inicial', now()]);
    await audit(t, req.user, 'Creó producto', `${p.name} · compra ${p.buy_price} · venta ${p.sell_price}${qty ? ` · stock inicial ${qty}` : ''}`);
    return { id };
  });
}));
app.put('/api/products/:id', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  const p = await productBody(req.body);
  const active = req.body.active === undefined ? 1 : (req.body.active ? 1 : 0);
  const old = await D.get('SELECT * FROM products WHERE id=$1', [id]);
  await D.run(`UPDATE products SET name=$1,category_id=$2,buy_price=$3,sell_price=$4,min_stock=$5,active=$6,track_stock=$7 WHERE id=$8`,
    [p.name, p.category_id, p.buy_price, p.sell_price, p.min_stock, active, p.track_stock, id]);
  if (old) {
    const ch = [];
    if (old.name !== p.name) ch.push(`nombre → ${p.name}`);
    if (old.buy_price !== p.buy_price) ch.push(`compra ${old.buy_price} → ${p.buy_price}`);
    if (old.sell_price !== p.sell_price) ch.push(`venta ${old.sell_price} → ${p.sell_price}`);
    if (old.active !== active) ch.push(active ? 'activado' : 'desactivado');
    if (old.min_stock !== p.min_stock) ch.push(`stock mínimo ${old.min_stock} → ${p.min_stock}`);
    if (old.category_id !== p.category_id) ch.push('cambió de categoría');
    if (old.track_stock !== p.track_stock) ch.push(p.track_stock ? 'controla stock' : 'sin control de stock');
    // Corrección de digitación: cambia el stock sin registrar pérdida ni ingreso
    if (p.track_stock && req.body.stock !== undefined && req.body.stock !== '') {
      const ns = int(req.body.stock, 'stock');
      if (ns !== old.stock) {
        await D.run('UPDATE products SET stock=$1 WHERE id=$2', [ns, id]);
        ch.push(`stock corregido ${old.stock} → ${ns} (sin pérdida)`);
      }
    }
    if (ch.length) await audit(D, req.user, 'Editó producto', `${old.name}: ${ch.join(', ')}`);
  }
  return { ok: true };
}));
// Foto del producto (el navegador la reduce antes de enviarla)
app.get('/api/products/:id/photo', auth, wrap(async (req, res) => {
  const f = await D.get('SELECT data, mime FROM product_photos WHERE product_id=$1', [int(req.params.id, 'id')]);
  if (!f) throw new HttpError(404, 'Sin foto');
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=31536000' });
  res.end(f.data);
}));
app.put('/api/products/:id/photo', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image || ''));
  if (!m) throw bad('Imagen inválida');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > 200 * 1024) throw bad('La imagen es demasiado grande');
  if (!await D.get('SELECT 1 FROM products WHERE id=$1', [id])) throw new HttpError(404, 'No existe');
  await D.run(`INSERT INTO product_photos (product_id,data,mime,updated_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (product_id) DO UPDATE SET data=EXCLUDED.data, mime=EXCLUDED.mime, updated_at=EXCLUDED.updated_at`,
    [id, data, m[1], now()]);
  await audit(D, req.user, 'Cambió foto de producto', (await D.get('SELECT name FROM products WHERE id=$1', [id])).name);
  return { ok: true };
}));
app.delete('/api/products/:id/photo', auth, admin, wrap(async (req) => {
  await D.run('DELETE FROM product_photos WHERE product_id=$1', [int(req.params.id, 'id')]);
  return { ok: true };
}));
// Ingreso de stock (llegó mercancía nueva)
app.post('/api/products/:id/stock', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  const qty = int(req.body.qty, 'cantidad', { min: 1 });
  return tx(async (t) => {
    const p = await t.get('SELECT * FROM products WHERE id=$1 FOR UPDATE', [id]);
    if (!p) throw new HttpError(404, 'No existe');
    const buy = req.body.buy_price === undefined || req.body.buy_price === '' ? p.buy_price : int(req.body.buy_price, 'precio de compra');
    await t.run('UPDATE products SET stock=stock+$1, buy_price=$2 WHERE id=$3', [qty, buy, id]);
    await t.run('INSERT INTO stock_entries (product_id,qty,buy_price,user_id,note,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, qty, buy, req.user.id, String(req.body.note || '').slice(0, 200) || null, now()]);
    await audit(t, req.user, 'Ingresó stock', `${p.name}: +${qty} (stock ${p.stock} → ${p.stock + qty}) · compra ${buy}`);
    return { ok: true };
  });
}));
// Corrección de inventario (conteo físico)
app.post('/api/products/:id/set-stock', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id'), stock = int(req.body.stock, 'stock');
  const p = await D.get('SELECT name, stock FROM products WHERE id=$1', [id]);
  await D.run('UPDATE products SET stock=$1 WHERE id=$2', [stock, id]);
  if (p) await audit(D, req.user, 'Corrigió stock', `${p.name}: ${p.stock} → ${stock}`);
  return { ok: true };
}));
app.get('/api/stock-entries', auth, admin, wrap(() =>
  D.all(`SELECT e.*, p.name AS product, u.name AS "user" FROM stock_entries e
    JOIN products p ON p.id=e.product_id JOIN users u ON u.id=e.user_id
    ORDER BY e.id DESC LIMIT 100`)));

// ---------- Caja / turnos ----------
const reg = (x = D) => x.get('SELECT cash,nequi FROM register WHERE id=1');
const SHIFT_SQL = `SELECT s.*, u.name AS user_name,
  COALESCE((SELECT SUM(cash_amount) FROM sales x WHERE x.shift_id=s.id AND x.voided=0),0) AS sales_cash,
  COALESCE((SELECT SUM(nequi_amount) FROM sales x WHERE x.shift_id=s.id AND x.voided=0),0) AS sales_nequi,
  (SELECT COUNT(*) FROM sales x WHERE x.shift_id=s.id AND x.voided=0) AS sales_count,
  COALESCE((SELECT SUM((i.price-i.cost)*i.qty) FROM sale_items i JOIN sales x ON x.id=i.sale_id
    WHERE x.shift_id=s.id AND x.voided=0),0)
    + COALESCE((SELECT SUM(fee) FROM withdrawals w WHERE w.shift_id=s.id AND w.voided=0),0) AS profit,
  (SELECT COUNT(*) FROM withdrawals w WHERE w.shift_id=s.id AND w.voided=0) AS wd_count,
  COALESCE((SELECT SUM(amount) FROM withdrawals w WHERE w.shift_id=s.id AND w.voided=0),0) AS wd_amount,
  COALESCE((SELECT SUM(fee) FROM withdrawals w WHERE w.shift_id=s.id AND w.voided=0),0) AS wd_fees
  FROM shifts s JOIN users u ON u.id=s.user_id`;
const openShift = (x = D) => x.get(`${SHIFT_SQL} WHERE s.closed_at IS NULL`);

app.get('/api/shift/current', auth, wrap(async () => ({ shift: (await openShift()) || null, register: await reg() })));
app.post('/api/shift/open', auth, wrap(async (req) => {
  const cash = int(req.body.cash, 'efectivo');
  const nequi = int(req.body.nequi, 'nequi');
  try {
    return await tx(async (t) => {
      const r = await t.get('SELECT cash,nequi FROM register WHERE id=1 FOR UPDATE');
      const cur = await openShift(t);
      if (cur) throw bad(`${cur.user_name} ya tiene la caja abierta`);
      const { id } = await t.get(`INSERT INTO shifts (user_id,opened_at,open_cash,open_nequi,sys_open_cash,sys_open_nequi)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [req.user.id, now(), cash, nequi, r.cash, r.nequi]);
      // La caja parte de lo que el turno declara tener realmente
      await t.run('UPDATE register SET cash=$1, nequi=$2 WHERE id=1', [cash, nequi]);
      await audit(t, req.user, 'Abrió caja', `Efectivo ${cash} · Nequi ${nequi} (sistema: ${r.cash} / ${r.nequi})`);
      return { id, diff_cash: cash - r.cash, diff_nequi: nequi - r.nequi };
    });
  } catch (e) { dup(e, 'Ya hay una caja abierta'); }
}));
app.post('/api/shift/close', auth, wrap(async (req) => {
  const cash = int(req.body.cash, 'efectivo contado');
  const nequi = int(req.body.nequi, 'nequi contado');
  return tx(async (t) => {
    const r = await t.get('SELECT cash,nequi FROM register WHERE id=1 FOR UPDATE');
    const s = await openShift(t);
    if (!s) throw bad('No hay caja abierta');
    if (s.user_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'La caja la abrió otra persona');
    await t.run(`UPDATE shifts SET closed_at=$1, close_cash=$2, close_nequi=$3, sys_close_cash=$4, sys_close_nequi=$5, notes=$6
      WHERE id=$7`, [now(), cash, nequi, r.cash, r.nequi, String(req.body.notes || '').slice(0, 300) || null, s.id]);
    await t.run('UPDATE register SET cash=$1, nequi=$2 WHERE id=1', [cash, nequi]);
    await audit(t, req.user, 'Cerró caja', `Efectivo ${cash} · Nequi ${nequi} (sistema: ${r.cash} / ${r.nequi}) · turno de ${s.user_name}`);
    return { diff_cash: cash - r.cash, diff_nequi: nequi - r.nequi, expected_cash: r.cash, expected_nequi: r.nequi };
  });
}));

app.get('/api/shifts', auth, wrap((req) =>
  req.user.role === 'admin'
    ? D.all(`${SHIFT_SQL} ORDER BY s.id DESC LIMIT 100`)
    : D.all(`${SHIFT_SQL} WHERE s.user_id=$1 ORDER BY s.id DESC LIMIT 100`, [req.user.id])));
app.get('/api/shifts/:id', auth, wrap(async (req) => {
  const s = await D.get(`${SHIFT_SQL} WHERE s.id=$1`, [int(req.params.id, 'id')]);
  if (!s) throw new HttpError(404, 'No existe');
  if (req.user.role !== 'admin' && s.user_id !== req.user.id) throw new HttpError(403, 'Sin acceso');
  return { ...s, sales: await salesOf(s.id), withdrawals: await D.all('SELECT * FROM withdrawals WHERE shift_id=$1 ORDER BY id DESC', [s.id]) };
}));

// ---------- Ventas ----------
async function salesOf(shiftId) {
  const sales = await D.all('SELECT * FROM sales WHERE shift_id=$1 ORDER BY id DESC', [shiftId]);
  const items = sales.length ? await D.all('SELECT * FROM sale_items WHERE sale_id = ANY($1::int[])', [sales.map((s) => s.id)]) : [];
  sales.forEach((s) => { s.items = items.filter((i) => i.sale_id === s.id); });
  return sales;
}
// Beneficio: la primera empanada de cada usuario se vende al precio de compra, una sola vez por usuario.
// ---------- Chat: sala general del equipo (peer 0) y mensajes privados entre usuarios ----------
// peer = 0 → sala general; peer = id de usuario → conversación privada con esa persona. Se consulta por polling.
const peerOf = (v) => (Number(v) > 0 ? int(v, 'usuario') : 0);
const convo = (me, peer) => (peer
  ? { where: '((user_id=$1 AND recipient_id=$2) OR (user_id=$2 AND recipient_id=$1))', args: [me, peer] }
  : { where: 'recipient_id IS NULL', args: [] });
app.get('/api/chat/users', auth, wrap(async (req) => {
  const me = req.user.id;
  const users = await D.all(`SELECT u.id, u.name,
    (SELECT COUNT(*) FROM chat_messages m WHERE m.user_id=u.id AND m.recipient_id=$1
      AND m.id > COALESCE((SELECT last_id FROM chat_reads r WHERE r.user_id=$1 AND r.peer_id=u.id),0))::int AS unread,
    (SELECT MAX(id) FROM chat_messages m WHERE (m.user_id=u.id AND m.recipient_id=$1) OR (m.user_id=$1 AND m.recipient_id=u.id)) AS last_id
    FROM users u WHERE u.active=1 AND u.id<>$1 ORDER BY last_id DESC NULLS LAST, u.name`, [me]);
  const general = await D.get(`SELECT COUNT(*)::int AS unread FROM chat_messages m WHERE m.recipient_id IS NULL AND m.user_id<>$1
    AND m.id > COALESCE((SELECT last_id FROM chat_reads r WHERE r.user_id=$1 AND r.peer_id=0),0)`, [me]);
  return { general: general.unread, users };
}));
app.get('/api/chat', auth, wrap(async (req) => {
  const peer = peerOf(req.query.with), after = Number(req.query.after) || 0;
  const c = convo(req.user.id, peer), n = c.args.length;
  const rows = await D.all(`SELECT id, user_id, user_name, recipient_id, body, sticker_id, created_at FROM chat_messages
    WHERE ${c.where} ${after ? `AND id>$${n + 1}` : ''} ORDER BY id ${after ? 'ASC' : 'DESC'} LIMIT ${after ? 200 : 100}`,
    after ? [...c.args, after] : c.args);
  // peer_read: hasta qué mensaje de esta conversación ha leído la otra persona (para mostrar "Visto")
  const r = peer && await D.get('SELECT last_id FROM chat_reads WHERE user_id=$1 AND peer_id=$2', [peer, req.user.id]);
  return { rows: after ? rows : rows.reverse(), peer_read: r ? r.last_id : 0 };
}));
app.post('/api/chat', auth, wrap(async (req) => {
  const sticker = req.body.sticker_id ? int(req.body.sticker_id, 'sticker') : null;
  const body = sticker ? '' : str(req.body.body, 'Mensaje', 500);
  if (sticker && !await D.get('SELECT 1 FROM stickers WHERE id=$1', [sticker])) throw bad('Ese sticker ya no existe');
  const peer = peerOf(req.body.to);
  if (peer && !await D.get('SELECT 1 FROM users WHERE id=$1 AND active=1', [peer])) throw bad('Usuario inválido');
  const m = await D.get('INSERT INTO chat_messages (user_id,user_name,recipient_id,body,sticker_id,created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, user_id, user_name, recipient_id, body, sticker_id, created_at',
    [req.user.id, req.user.name, peer || null, body, sticker, now()]);
  await D.run(`DELETE FROM chat_messages WHERE created_at < now() - interval '30 days'`);
  return m;
}));
// Stickers con imagen: biblioteca compartida; cada imagen se reduce en el cliente y se limita su tamaño y cantidad
app.get('/api/stickers', auth, wrap(() => D.all('SELECT id, user_id FROM stickers ORDER BY id DESC')));
app.get('/api/stickers/:id/img', auth, wrap(async (req, res) => {
  const f = await D.get('SELECT data, mime FROM stickers WHERE id=$1', [int(req.params.id, 'id')]);
  if (!f) throw new HttpError(404, 'Sin sticker');
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=31536000, immutable' });
  res.end(f.data);
}));
app.post('/api/stickers', auth, wrap(async (req) => {
  const m = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image || ''));
  if (!m) throw bad('Imagen inválida');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > 150 * 1024) throw bad('La imagen es demasiado grande');
  if ((await D.get('SELECT COUNT(*) c FROM stickers')).c >= 60) throw bad('Ya hay 60 stickers; borra alguno para agregar más');
  const r = await D.get('INSERT INTO stickers (user_id,data,mime,created_at) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, data, m[1], now()]);
  await audit(D, req.user, 'Agregó sticker', `#${r.id}`);
  return r;
}));
app.delete('/api/stickers/:id', auth, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  const st = await D.get('SELECT user_id FROM stickers WHERE id=$1', [id]);
  if (!st) return { ok: true };
  if (st.user_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'Solo quien lo agregó o un admin puede borrarlo');
  await D.run('DELETE FROM stickers WHERE id=$1', [id]);
  await audit(D, req.user, 'Borró sticker', `#${id}`);
  return { ok: true };
}));
app.post('/api/chat/read', auth, wrap(async (req) => {
  const peer = peerOf(req.body.with), c = convo(req.user.id, peer);
  const last = (await D.get(`SELECT COALESCE(MAX(id),0) AS id FROM chat_messages WHERE ${c.where}`, c.args)).id;
  await D.run(`INSERT INTO chat_reads (user_id,peer_id,last_id) VALUES ($1,$2,$3)
    ON CONFLICT (user_id,peer_id) DO UPDATE SET last_id=GREATEST(chat_reads.last_id, EXCLUDED.last_id)`, [req.user.id, peer, last]);
  return { ok: true };
}));
app.get('/api/sales/current', auth, wrap(async () => {
  const s = await openShift();
  return s ? salesOf(s.id) : [];
}));
app.post('/api/sales', auth, wrap(async (req) => {
  const m = req.body.method === 'mixto' ? 'mixto' : method(req.body.method);
  const lines = req.body.items;
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw bad('Agrega al menos un producto');
  const merged = new Map();
  for (const l of lines) {
    const pid = int(l.product_id, 'producto');
    merged.set(pid, (merged.get(pid) || 0) + int(l.qty, 'cantidad', { min: 1, max: 10000 }));
  }
  let benefit = null;
  if (req.body.benefit) {
    const name = str(req.body.benefit.name, 'Nombre', 60);
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
    benefit = { name, key, product_id: int(req.body.benefit.product_id, 'producto') };
  }
  if (benefit && !merged.has(benefit.product_id)) throw bad('El beneficio debe aplicarse a una empanada de la venta');
  const ids = [...merged.keys()].sort((a, b) => a - b); // orden fijo para evitar bloqueos cruzados
  return tx(async (t) => {
    const s = await openShift(t);
    if (!s) throw bad('Primero debes abrir caja');
    if (s.user_id !== req.user.id) throw bad(`La caja la abrió ${s.user_name}`);
    let total = 0;
    const rows = [];
    for (const pid of ids) {
      const qty = merged.get(pid);
      const p = await t.get('SELECT * FROM products WHERE id=$1 AND active=1 FOR UPDATE', [pid]);
      if (!p) throw bad('Producto no disponible');
      if (p.track_stock && p.stock < qty) throw bad(`Stock insuficiente de "${p.name}" (quedan ${p.stock})`);
      const row = { p, qty, bq: 0 };
      if (benefit && benefit.product_id === pid) {
        const c = p.category_id && await t.get('SELECT name FROM categories WHERE id=$1', [p.category_id]);
        if (!c || !/^empanada/i.test(c.name)) throw bad('El beneficio solo aplica a empanadas');
        if (await t.get('SELECT 1 FROM benefit_uses WHERE person_key=$1 AND day=$2', [benefit.key, today()])) throw bad(`${benefit.name} ya usó su beneficio de hoy`);
        row.bq = 1; row.bname = benefit.name;
        total -= p.sell_price - p.buy_price;
      }
      rows.push(row);
      total += p.sell_price * qty;
    }
    let nq = m === 'nequi' ? total : 0;
    if (m === 'mixto') {
      nq = int(req.body.nequi_amount, 'monto por Nequi', { min: 0, max: 1e12 });
      if (nq <= 0 || nq >= total) throw bad('En pago mixto el monto por Nequi debe ser mayor a 0 y menor al total');
    }
    const cash = total - nq;
    const { id } = await t.get('INSERT INTO sales (shift_id,user_id,method,total,cash_amount,nequi_amount,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [s.id, req.user.id, m, total, cash, nq, now()]);
    for (const { p, qty, bq, bname } of rows) {
      if (bq) {
        await t.run('INSERT INTO sale_items (sale_id,product_id,name,qty,price,cost) VALUES ($1,$2,$3,1,$4,$4)',
          [id, p.id, `${p.name} (beneficio ${bname})`, p.buy_price]);
        try { await t.run('INSERT INTO benefit_uses (person_name,person_key,sale_id,created_at,day) VALUES ($1,$2,$3,$4,$5)', [benefit.name, benefit.key, id, now(), today()]); }
        catch (e) { dup(e, `${bname} ya usó su beneficio de hoy`); }
      }
      if (qty - bq > 0) await t.run('INSERT INTO sale_items (sale_id,product_id,name,qty,price,cost) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, p.id, p.name, qty - bq, p.sell_price, p.buy_price]);
      if (p.track_stock) await t.run('UPDATE products SET stock=stock-$1 WHERE id=$2', [qty, p.id]);
    }
    await t.run('UPDATE register SET cash=cash+$1, nequi=nequi+$2 WHERE id=1', [cash, nq]);
    await audit(t, req.user, 'Registró venta', `#${id} · ${rows.map(({ p, qty }) => `${qty}× ${p.name}`).join(', ')} · ${total} (${m === 'mixto' ? `efectivo ${cash} + Nequi ${nq}` : m})`);
    return { id, total };
  });
}));
app.post('/api/sales/:id/void', auth, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  return tx(async (t) => {
    const sale = await t.get(`SELECT s.*, h.closed_at FROM sales s JOIN shifts h ON h.id=s.shift_id WHERE s.id=$1 FOR UPDATE OF s`, [id]);
    if (!sale) throw new HttpError(404, 'No existe');
    if (sale.voided) throw bad('Ya estaba anulada');
    if (req.user.role !== 'admin' && (sale.user_id !== req.user.id || sale.closed_at))
      throw new HttpError(403, 'Solo puedes anular tus ventas mientras tu caja está abierta');
    await t.run('UPDATE sales SET voided=1 WHERE id=$1', [id]);
    await t.run('DELETE FROM benefit_uses WHERE sale_id=$1', [id]); // al anular, el beneficio queda disponible de nuevo
    for (const i of await t.all('SELECT * FROM sale_items WHERE sale_id=$1', [id]))
      await t.run('UPDATE products SET stock=stock+$1 WHERE id=$2 AND track_stock=1', [i.qty, i.product_id]);
    await t.run('UPDATE register SET cash=cash-$1, nequi=nequi-$2 WHERE id=1', [sale.cash_amount, sale.nequi_amount]);
    await audit(t, req.user, 'Anuló venta', `#${id} · ${sale.total} (${sale.method})`);
    return { ok: true };
  });
}));

// ---------- Retiros de efectivo por Nequi ----------
// El cliente transfiere por Nequi y el turno le entrega efectivo. La comisión se cobra por Nequi o en efectivo.
app.get('/api/withdrawals/current', auth, wrap(async () => {
  const s = await openShift();
  return s ? D.all('SELECT * FROM withdrawals WHERE shift_id=$1 ORDER BY id DESC', [s.id]) : [];
}));
// Retiro: 'nequi_efectivo' = el cliente transfiere por Nequi y se le da efectivo;
// 'efectivo_nequi' = el cliente da efectivo y se le transfiere por Nequi. La comisión entra por fee_method.
const wdDir = (v) => (v === 'efectivo_nequi' ? 'efectivo_nequi' : 'nequi_efectivo');
const wdDelta = (w) => {
  const sign = w.direction === 'efectivo_nequi' ? 1 : -1; // efecto del monto sobre el efectivo
  return {
    cash: sign * w.amount + (w.fee_method === 'efectivo' ? w.fee : 0),
    nequi: -sign * w.amount + (w.fee_method === 'nequi' ? w.fee : 0),
  };
};
app.post('/api/withdrawals', auth, wrap(async (req) => {
  const amount = int(req.body.amount, 'monto', { min: 1 });
  const fee = int(req.body.fee ?? 0, 'comisión');
  const fm = method(req.body.fee_method || 'nequi');
  const direction = wdDir(req.body.direction);
  return tx(async (t) => {
    const s = await openShift(t);
    if (!s) throw bad('Primero debes abrir caja');
    if (s.user_id !== req.user.id) throw bad(`La caja la abrió ${s.user_name}`);
    const r = await t.get('SELECT cash, nequi FROM register WHERE id=1 FOR UPDATE');
    const d = wdDelta({ amount, fee, fee_method: fm, direction });
    if (r.cash + d.cash < 0) throw bad('No hay suficiente efectivo en caja para este retiro');
    if (r.nequi + d.nequi < 0) throw bad('No hay suficiente saldo en Nequi para este retiro');
    await t.run('UPDATE register SET cash=cash+$1, nequi=nequi+$2 WHERE id=1', [d.cash, d.nequi]);
    const { id } = await t.get(`INSERT INTO withdrawals (shift_id,user_id,amount,fee,fee_method,direction,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [s.id, req.user.id, amount, fee, fm, direction, now()]);
    await audit(t, req.user, 'Registró retiro Nequi', `#${id} · ${direction === 'efectivo_nequi' ? 'efectivo → Nequi' : 'Nequi → efectivo'} · ${amount} · comisión ${fee} (${fm})`);
    return { id };
  });
}));
app.post('/api/withdrawals/:id/void', auth, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  return tx(async (t) => {
    const w = await t.get(`SELECT w.*, h.closed_at FROM withdrawals w JOIN shifts h ON h.id=w.shift_id WHERE w.id=$1 FOR UPDATE OF w`, [id]);
    if (!w) throw new HttpError(404, 'No existe');
    if (w.voided) throw bad('Ya estaba anulado');
    if (req.user.role !== 'admin' && (w.user_id !== req.user.id || w.closed_at))
      throw new HttpError(403, 'Solo puedes anular tus retiros mientras tu caja está abierta');
    const d = wdDelta(w);
    await t.run('UPDATE withdrawals SET voided=1 WHERE id=$1', [id]);
    await t.run('UPDATE register SET cash=cash-$1, nequi=nequi-$2 WHERE id=1', [d.cash, d.nequi]);
    await audit(t, req.user, 'Anuló retiro Nequi', `#${id} · ${w.amount} · comisión ${w.fee}`);
    return { ok: true };
  });
}));

// ---------- Administración de dinero ----------
app.get('/api/register', auth, admin, wrap(async () => ({
  register: await reg(),
  adjustments: await D.all(`SELECT a.*, u.name AS "user" FROM adjustments a JOIN users u ON u.id=a.user_id
    ORDER BY a.id DESC LIMIT 50`),
})));
// Ingresos/retiros manuales (consignar, sacar para comprar mercancía, base inicial, etc.)
app.post('/api/register/adjust', auth, admin, wrap(async (req) => {
  const m = method(req.body.method);
  const amount = int(req.body.amount, 'monto', { min: -1e9 });
  if (amount === 0) throw bad('El monto no puede ser 0');
  const note = str(req.body.note, 'Motivo', 200);
  await tx(async (t) => {
    await t.run(`UPDATE register SET ${col(m)}=${col(m)}+$1 WHERE id=1`, [amount]);
    await t.run('INSERT INTO adjustments (user_id,method,amount,note,created_at) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, m, amount, note, now()]);
    await audit(t, req.user, 'Ajuste de dinero', `${amount > 0 ? '+' : ''}${amount} (${m}) · ${note}`);
  });
  return { ok: true };
}));

// ---------- Productos descartados: salen del stock y cuentan como pérdida (al costo), sin tocar la caja ----------
app.post('/api/write-offs', auth, admin, wrap(async (req) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length || items.length > 500) throw bad('Elige al menos un producto');
  const note = String(req.body.note || '').trim().slice(0, 200) || null;
  return tx(async (t) => {
    let total = 0, n = 0;
    for (const it of items) {
      const id = int(it.product_id, 'producto'), qty = int(it.qty, 'cantidad', { min: 1 });
      const p = await t.get('SELECT p.*, (SELECT c.name FROM categories c WHERE c.id=p.category_id) AS category FROM products p WHERE p.id=$1 FOR UPDATE OF p', [id]);
      if (!p) throw new HttpError(404, 'No existe el producto');
      const free = /^empanada/i.test(p.category || ''); // las empanadas se pagan en gastos de pedidos: salen del stock sin pérdida
      if (!p.track_stock) throw bad(`"${p.name}" no controla stock`);
      if (qty > p.stock) throw bad(`Solo quedan ${p.stock} de "${p.name}"`);
      await t.run('UPDATE products SET stock=stock-$1 WHERE id=$2', [qty, id]);
      await t.run('INSERT INTO write_offs (product_id,qty,cost,user_id,note,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, qty, free ? 0 : p.buy_price, req.user.id, note, now()]);
      const loss = free ? 0 : qty * p.buy_price;
      await audit(t, req.user, 'Descartó producto', `${p.name}: -${qty} (stock ${p.stock} → ${p.stock - qty}) · ${free ? 'sin pérdida' : 'pérdida ' + loss}${note ? ' · ' + note : ''}`);
      total += loss; n++;
    }
    return { ok: true, total, n };
  });
}));
app.get('/api/write-offs', auth, admin, wrap(async (req) => {
  const { a, b } = range(req.query);
  const rows = await D.all(`SELECT w.*, p.name AS product, u.name AS "user" FROM write_offs w
    JOIN products p ON p.id=w.product_id JOIN users u ON u.id=w.user_id
    WHERE w.created_at>=$1 AND w.created_at<$2 ORDER BY w.id DESC`, [a, b]);
  return { rows, total: rows.reduce((t, r) => t + r.qty * r.cost, 0) };
}));

// ---------- Pago a emprendimientos (viernes): costo de lo vendido + 60% del costo de lo descartado ----------
const LOST_PAY = 0.6; // de lo descartado solo se paga el 60% del precio de compra acordado
const isEmp = (name) => /^emprendimiento/i.test(name || '');
async function pendingPayouts(x, productId, lock = false) {
  const [sold, lost] = await Promise.all([
    x.all(`SELECT i.id, i.qty, i.cost FROM sale_items i JOIN sales s ON s.id=i.sale_id
      WHERE s.voided=0 AND i.payout_id IS NULL AND i.product_id=$1${lock ? ' FOR UPDATE OF i' : ''}`, [productId]),
    x.all(`SELECT w.id, w.qty, w.cost FROM write_offs w WHERE w.payout_id IS NULL AND w.product_id=$1${lock ? ' FOR UPDATE OF w' : ''}`, [productId]),
  ]);
  const f = (rows) => rows.reduce((t, r) => t + r.qty * r.cost, 0);
  return { sold, lost, sold_cost: f(sold), lost_cost: Math.round(f(lost) * LOST_PAY), sold_qty: sold.reduce((t, r) => t + r.qty, 0), lost_qty: lost.reduce((t, r) => t + r.qty, 0) };
}
app.get('/api/payouts', auth, admin, wrap(async () => {
  const prods = (await D.all(`SELECT p.id, p.name, c.name AS category FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.name`))
    .filter((p) => isEmp(p.category));
  const pending = [];
  for (const p of prods) {
    const x = await pendingPayouts(D, p.id);
    if (x.sold_qty || x.lost_qty) pending.push({ product_id: p.id, product: p.name, sold_qty: x.sold_qty, sold_cost: x.sold_cost,
      lost_qty: x.lost_qty, lost_cost: x.lost_cost, total: x.sold_cost + x.lost_cost });
  }
  const history = await D.all(`SELECT y.*, u.name AS "user" FROM payouts y JOIN users u ON u.id=y.user_id ORDER BY y.id DESC LIMIT 100`);
  return { pending, history, register: await reg() };
}));
app.post('/api/payouts', auth, admin, wrap(async (req) => {
  const m = method(req.body.method);
  const productId = int(req.body.product_id, 'producto');
  const payee = str(req.body.payee, 'A nombre de quién se paga', 100);
  return tx(async (t) => {
    const pr = await t.get('SELECT p.name, c.name AS category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.id=$1', [productId]);
    if (!pr || !isEmp(pr.category)) throw new HttpError(404, 'No existe el producto de emprendimiento');
    const p = await pendingPayouts(t, productId, true);
    const total = p.sold_cost + p.lost_cost;
    if (total <= 0) throw bad('No hay nada pendiente por pagar');
    const r = await t.get('SELECT cash,nequi FROM register WHERE id=1 FOR UPDATE');
    if (r[col(m)] < total) throw bad(`No hay suficiente ${m} en caja para este pago`);
    const { id } = await t.get(`INSERT INTO payouts (category_id,category,sold_cost,lost_cost,total,method,user_id,created_at,payee,product_id,sold_qty,lost_qty)
      VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [pr.name, p.sold_cost, p.lost_cost, total, m, req.user.id, now(), payee, productId, p.sold_qty, p.lost_qty]);
    if (p.sold.length) await t.run('UPDATE sale_items SET payout_id=$1 WHERE id = ANY($2::int[])', [id, p.sold.map((x) => x.id)]);
    if (p.lost.length) await t.run('UPDATE write_offs SET payout_id=$1 WHERE id = ANY($2::int[])', [id, p.lost.map((x) => x.id)]);
    await t.run(`UPDATE register SET ${col(m)}=${col(m)}-$1 WHERE id=1`, [total]);
    await t.run('INSERT INTO expenses (user_id,description,amount,method,kind,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, `Pago emprendimiento ${pr.name} a nombre de ${payee} · vendidos ${p.sold_qty} (${p.sold_cost}) + perdidos ${p.lost_qty} al 60% (${p.lost_cost})`, total, m, 'pedido', now()]);
    await audit(t, req.user, 'Pagó a emprendimiento', `${pr.name} a nombre de ${payee} · ${total} (${m}) · vendidos ${p.sold_qty} · perdidos ${p.lost_qty} (60%: ${p.lost_cost})`);
    return { ok: true, total };
  });
}));

// ---------- Gastos: implementos (cucharas, vasos, etc.) y pagos de pedidos a proveedores ----------
// method = de dónde salió la plata; si es null, no se descuenta de la caja.
app.get('/api/expenses', auth, admin, wrap(() =>
  D.all(`SELECT e.*, u.name AS "user" FROM expenses e JOIN users u ON u.id=e.user_id ORDER BY e.id DESC LIMIT 200`)));
app.post('/api/expenses', auth, admin, wrap(async (req) => {
  const description = str(req.body.description, 'Descripción', 150);
  const amount = int(req.body.amount, 'monto', { min: 1 });
  const m = req.body.method ? method(req.body.method) : null;
  const kind = req.body.kind === 'pedido' ? 'pedido' : 'implementos';
  await tx(async (t) => {
    await t.run('INSERT INTO expenses (user_id,description,amount,method,kind,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, description, amount, m, kind, now()]);
    if (m) await t.run(`UPDATE register SET ${col(m)}=${col(m)}-$1 WHERE id=1`, [amount]);
    await audit(t, req.user, kind === 'pedido' ? 'Registró pago de pedido' : 'Registró gasto', `${description} · ${amount} (${m || 'fuera de caja'})`);
  });
  return { ok: true };
}));
app.delete('/api/expenses/:id', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  await tx(async (t) => {
    const e = await t.get('DELETE FROM expenses WHERE id=$1 RETURNING *', [id]);
    if (!e) throw new HttpError(404, 'No existe');
    if (e.method) await t.run(`UPDATE register SET ${col(e.method)}=${col(e.method)}+$1 WHERE id=1`, [e.amount]);
    await audit(t, req.user, 'Borró gasto', `${e.description} · ${e.amount}`);
  });
  return { ok: true };
}));

// ---------- Resumen ----------
app.get('/api/dashboard', auth, admin, wrap(async () => {
  const start = new Date(); start.setUTCHours(5, 0, 0, 0); // medianoche Colombia (UTC-5)
  if (start > new Date()) start.setUTCDate(start.getUTCDate() - 1);
  const [t, profit, exp, top, low, inv, shift, register, wd] = await Promise.all([
    D.get('SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM sales WHERE voided=0 AND created_at>=$1', [start]),
    D.get(`SELECT COALESCE(SUM((i.price-i.cost)*i.qty),0) AS p FROM sale_items i
      JOIN sales s ON s.id=i.sale_id WHERE s.voided=0 AND s.created_at>=$1`, [start]),
    D.get(`SELECT COALESCE(SUM(amount) FILTER (WHERE kind='implementos'),0) AS impl,
      COALESCE(SUM(amount) FILTER (WHERE kind='pedido'),0) AS ped FROM expenses WHERE created_at>=$1`, [start]),
    D.all(`SELECT category, name, qty FROM (
      SELECT COALESCE(c.name,'Sin categoría') AS category, i.name, SUM(i.qty) AS qty,
        ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY SUM(i.qty) DESC) AS rn
      FROM sale_items i JOIN sales s ON s.id=i.sale_id
      LEFT JOIN products p ON p.id=i.product_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE s.voided=0 AND s.created_at>=now() - interval '30 days' GROUP BY c.id, c.name, i.product_id, i.name) t
      WHERE rn<=5 ORDER BY category, qty DESC`),
    D.all('SELECT name, stock, min_stock FROM products WHERE active=1 AND track_stock=1 AND stock<=min_stock ORDER BY stock'),
    D.get(`SELECT COALESCE(SUM(stock::bigint*buy_price),0) AS cost, COALESCE(SUM(stock::bigint*sell_price),0) AS value
      FROM products WHERE active=1 AND track_stock=1`),
    openShift(),
    reg(),
    D.get('SELECT COUNT(*) AS n, COALESCE(SUM(fee),0) AS fees FROM withdrawals WHERE voided=0 AND created_at>=$1', [start]),
  ]);
  return { register, today: { ...t, profit: profit.p + wd.fees, expenses: exp.impl, orders: exp.ped, withdrawals: wd.n, fees: wd.fees }, top, low, inventory: inv, open_shift: shift || null };
}));

// Resumen para quien atiende: sin dinero en caja, costos ni ganancias
app.get('/api/summary', auth, wrap(async () => {
  const start = new Date(); start.setUTCHours(5, 0, 0, 0);
  if (start > new Date()) start.setUTCDate(start.getUTCDate() - 1);
  const [t, top, low, shift] = await Promise.all([
    D.get('SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM sales WHERE voided=0 AND created_at>=$1', [start]),
    D.all(`SELECT i.name, SUM(i.qty) AS qty FROM sale_items i JOIN sales s ON s.id=i.sale_id
      WHERE s.voided=0 AND s.created_at>=$1 GROUP BY i.product_id, i.name ORDER BY qty DESC LIMIT 8`, [start]),
    D.all('SELECT name, stock, min_stock FROM products WHERE active=1 AND track_stock=1 AND stock<=min_stock ORDER BY stock'),
    openShift(),
  ]);
  return { today: t, top, low, open_shift: shift || null };
}));

// ---------- Reportes, extracto CSV y registro de actividad (admin) ----------
const TZ = 'America/Bogota';
const ymd = (v, name) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) || isNaN(new Date(`${v}T00:00:00Z`))) throw bad(`Fecha inválida: ${name}`);
  return v;
};
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const startOf = (d) => new Date(`${d}T00:00:00-05:00`); // Colombia no tiene horario de verano
const today = () => new Date(Date.now() - 5 * 36e5).toISOString().slice(0, 10);
const mondayOf = (d) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));
const DAY = `(created_at AT TIME ZONE '${TZ}')::date`;
function range(q, maxDays = 366) {
  const from = ymd(q.from, 'desde'), to = ymd(q.to, 'hasta');
  if (to < from) throw bad('El rango es inválido');
  if ((new Date(to) - new Date(from)) / 864e5 > maxDays) throw bad(`El rango máximo es de ${maxDays} días`);
  return { from, to, a: startOf(from), b: startOf(addDays(to, 1)) };
}

async function weekTotals(a, b) {
  const [sales, items, exp, wd, lost] = await Promise.all([
    D.all(`SELECT to_char(${DAY},'YYYY-MM-DD') AS day, SUM(total) AS total, COUNT(*) AS n FROM sales
      WHERE voided=0 AND created_at>=$1 AND created_at<$2 GROUP BY 1`, [a, b]),
    D.all(`SELECT to_char((s.created_at AT TIME ZONE '${TZ}')::date,'YYYY-MM-DD') AS day, SUM((i.price-i.cost)*i.qty) AS profit
      FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.voided=0 AND s.created_at>=$1 AND s.created_at<$2 GROUP BY 1`, [a, b]),
    D.all(`SELECT to_char(${DAY},'YYYY-MM-DD') AS day, COALESCE(SUM(amount) FILTER (WHERE kind='implementos'),0) AS impl,
      COALESCE(SUM(amount) FILTER (WHERE kind='pedido'),0) AS ped FROM expenses WHERE created_at>=$1 AND created_at<$2 GROUP BY 1`, [a, b]),
    D.all(`SELECT to_char(${DAY},'YYYY-MM-DD') AS day, SUM(fee) AS fees FROM withdrawals
      WHERE voided=0 AND created_at>=$1 AND created_at<$2 GROUP BY 1`, [a, b]),
    D.all(`SELECT to_char(${DAY},'YYYY-MM-DD') AS day, SUM(lost_cost) AS lost FROM payouts
      WHERE created_at>=$1 AND created_at<$2 GROUP BY 1`, [a, b]),
  ]);
  return { sales, items, exp, wd, lost };
}
app.get('/api/reports/week', auth, admin, wrap(async (req) => {
  const start = mondayOf(req.query.start ? ymd(req.query.start, 'semana') : today());
  const prev = addDays(start, -7);
  const [cur, old, top] = await Promise.all([
    weekTotals(startOf(start), startOf(addDays(start, 7))),
    weekTotals(startOf(prev), startOf(start)),
    D.all(`SELECT i.name, SUM(i.qty) AS qty, SUM(i.price*i.qty) AS total FROM sale_items i JOIN sales s ON s.id=i.sale_id
      WHERE s.voided=0 AND s.created_at>=$1 AND s.created_at<$2 GROUP BY i.product_id, i.name ORDER BY qty DESC LIMIT 10`,
      [startOf(start), startOf(addDays(start, 7))]),
  ]);
  const find = (rows, day) => rows.find((r) => r.day === day) || {};
  const days = Array.from({ length: 7 }, (_, k) => {
    const day = addDays(start, k);
    const e = find(cur.exp, day);
    return { day, total: find(cur.sales, day).total || 0, n: find(cur.sales, day).n || 0,
      profit: (find(cur.items, day).profit || 0) + (find(cur.wd, day).fees || 0), impl: e.impl || 0, ped: e.ped || 0, lost: find(cur.lost, day).lost || 0 };
  });
  const sum = (w) => {
    const f = (rows, k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
    return { total: f(w.sales, 'total'), n: f(w.sales, 'n'), profit: f(w.items, 'profit') + f(w.wd, 'fees'), impl: f(w.exp, 'impl'), ped: f(w.exp, 'ped'), lost: f(w.lost, 'lost') };
  };
  return { start, end: addDays(start, 6), days, totals: sum(cur), previous: sum(old), top };
}));

// Ventas por hora del día y por día de la semana (hora de Colombia)
app.get('/api/reports/hours', auth, admin, wrap(async (req) => {
  const { a, b } = range(req.query, 366);
  const [hours, dows] = await Promise.all([
    D.all(`SELECT extract(hour from created_at AT TIME ZONE '${TZ}')::int AS h, COUNT(*) AS n, SUM(total) AS total FROM sales
      WHERE voided=0 AND created_at>=$1 AND created_at<$2 GROUP BY 1 ORDER BY 1`, [a, b]),
    D.all(`SELECT extract(isodow from created_at AT TIME ZONE '${TZ}')::int AS d, COUNT(*) AS n, SUM(total) AS total FROM sales
      WHERE voided=0 AND created_at>=$1 AND created_at<$2 GROUP BY 1 ORDER BY 1`, [a, b]),
  ]);
  return { hours, dows };
}));

// Extracto para rendición de cuentas: todos los movimientos del rango, en CSV (Excel en español: separador ;)
app.get('/api/export.csv', auth, admin, wrap(async (req, res) => {
  const { from, to, a, b } = range(req.query, 366);
  const p = [a, b];
  const [sales, items, wds, exps, adjs, shifts, stocks] = await Promise.all([
    D.all(`SELECT s.*, u.name AS who FROM sales s JOIN users u ON u.id=s.user_id WHERE s.created_at>=$1 AND s.created_at<$2`, p),
    D.all(`SELECT i.* FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.created_at>=$1 AND s.created_at<$2`, p),
    D.all(`SELECT w.*, u.name AS who FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.created_at>=$1 AND w.created_at<$2`, p),
    D.all(`SELECT e.*, u.name AS who FROM expenses e JOIN users u ON u.id=e.user_id WHERE e.created_at>=$1 AND e.created_at<$2`, p),
    D.all(`SELECT a.*, u.name AS who FROM adjustments a JOIN users u ON u.id=a.user_id WHERE a.created_at>=$1 AND a.created_at<$2`, p),
    D.all(`SELECT h.*, u.name AS who FROM shifts h JOIN users u ON u.id=h.user_id WHERE (h.opened_at>=$1 AND h.opened_at<$2) OR (h.closed_at>=$1 AND h.closed_at<$2)`, p),
    D.all(`SELECT e.*, pr.name AS product, u.name AS who FROM stock_entries e JOIN products pr ON pr.id=e.product_id JOIN users u ON u.id=e.user_id
      WHERE e.created_at>=$1 AND e.created_at<$2`, p),
  ]);
  const rows = []; // { at, tipo, detalle, who, turno, monto, cash, nequi }
  const eff = (m, v) => ({ cash: m === 'efectivo' ? v : 0, nequi: m === 'nequi' ? v : 0 });
  for (const s of sales) {
    const det = items.filter((i) => i.sale_id === s.id).map((i) => `${i.qty}x ${i.name}`).join(', ');
    rows.push({ at: s.created_at, tipo: s.voided ? 'Venta anulada' : 'Venta', detalle: `#${s.id} ${det} (${s.method})`, who: s.who, turno: s.shift_id,
      monto: s.total, ...(s.voided ? { cash: 0, nequi: 0 } : { cash: Number(s.cash_amount), nequi: Number(s.nequi_amount) }) });
  }
  for (const w of wds) {
    const d = wdDelta(w);
    rows.push({ at: w.created_at, tipo: w.voided ? 'Retiro Nequi anulado' : 'Retiro Nequi',
      detalle: `#${w.id} ${w.direction === 'efectivo_nequi' ? 'recibió efectivo y transfirió por Nequi' : 'recibió Nequi y entregó efectivo'} ${w.amount}; comisión ${w.fee} cobrada en ${w.fee_method}`, who: w.who, turno: w.shift_id, monto: w.amount,
      cash: w.voided ? 0 : d.cash, nequi: w.voided ? 0 : d.nequi });
  }
  for (const e of exps) {
    rows.push({ at: e.created_at, tipo: e.kind === 'pedido' ? 'Pago de pedido' : 'Gasto de implementos',
      detalle: `${e.description} (${e.method ? 'de ' + e.method : 'fuera de caja'})`, who: e.who, turno: '', monto: e.amount, ...(e.method ? eff(e.method, -e.amount) : { cash: 0, nequi: 0 }) });
  }
  for (const x of adjs) rows.push({ at: x.created_at, tipo: 'Ajuste de dinero', detalle: `${x.note} (${x.method})`, who: x.who, turno: '', monto: x.amount, ...eff(x.method, x.amount) });
  for (const h of shifts) {
    if (h.opened_at >= a && h.opened_at < b) rows.push({ at: h.opened_at, tipo: 'Apertura de caja',
      detalle: `Declaró efectivo ${h.open_cash} y Nequi ${h.open_nequi} (sistema: ${h.sys_open_cash} / ${h.sys_open_nequi})`, who: h.who, turno: h.id, monto: '', cash: 0, nequi: 0 });
    if (h.closed_at && h.closed_at >= a && h.closed_at < b) rows.push({ at: h.closed_at, tipo: 'Cierre de caja',
      detalle: `Contó efectivo ${h.close_cash} y Nequi ${h.close_nequi} (sistema: ${h.sys_close_cash} / ${h.sys_close_nequi}); diferencia efectivo ${h.close_cash - h.sys_close_cash}, Nequi ${h.close_nequi - h.sys_close_nequi}${h.notes ? '; ' + h.notes : ''}`,
      who: h.who, turno: h.id, monto: '', cash: 0, nequi: 0 });
  }
  for (const e of stocks) rows.push({ at: e.created_at, tipo: 'Ingreso de stock', detalle: `${e.product}: +${e.qty} a ${e.buy_price} c/u${e.note ? ' (' + e.note + ')' : ''}`, who: e.who, turno: '', monto: e.qty * e.buy_price, cash: 0, nequi: 0 });
  rows.sort((x, y) => x.at - y.at);

  const cell = (v) => {
    if (typeof v === 'number') return String(v);
    let t = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita fórmulas al abrir en Excel
    return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const when = (d) => d.toLocaleString('sv-SE', { timeZone: TZ }).split(' ');
  const lines = [['Fecha', 'Hora', 'Tipo', 'Detalle', 'Usuario', 'Turno', 'Valor', 'Efecto efectivo', 'Efecto Nequi']];
  for (const r of rows) { const [d, h] = when(r.at); lines.push([d, h, r.tipo, r.detalle, r.who, r.turno, r.monto, r.cash, r.nequi]); }
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  lines.push([], ['', '', 'TOTAL', `Del ${from} al ${to}`, '', '', '', sum('cash'), sum('nequi')]);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="extracto-plancha-${from}_a_${to}.csv"`,
  });
  res.send('﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n'));
  await audit(D, req.user, 'Descargó extracto CSV', `${from} a ${to}`);
}));

app.get('/api/audit', auth, admin, wrap((req) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  return D.all(`SELECT id, user_name, action, detail, created_at FROM audit_log
    WHERE ($1='' OR user_name ILIKE '%'||$1||'%' OR action ILIKE '%'||$1||'%' OR detail ILIKE '%'||$1||'%')
    ORDER BY id DESC LIMIT 300`, [q]);
}));

// ---------- Archivos estáticos y errores ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`La Plancha corriendo en http://localhost:${PORT}`));
}
