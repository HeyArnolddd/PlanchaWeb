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
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_stock INTEGER NOT NULL DEFAULT 1;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'implementos';
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

const attempts = new Map();
app.post('/api/login', wrap(async (req, res) => {
  const key = req.ip;
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.');
  const u = await D.get('SELECT * FROM users WHERE username=$1 AND active=1', [String(req.body.username || '').trim().toLowerCase()]);
  if (!u || !bcrypt.compareSync(String(req.body.password || ''), u.password_hash)) {
    a.n++; attempts.set(key, a);
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  attempts.delete(key);
  const token = crypto.randomBytes(32).toString('hex');
  await D.run('INSERT INTO sessions (token,user_id,created_at) VALUES ($1,$2,$3)', [token, u.id, now()]);
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
    return await D.get('INSERT INTO users (username,name,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id',
      [username, name, bcrypt.hashSync(password, 10), role]);
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
  return { ok: true };
}));

// ---------- Categorías ----------
app.get('/api/categories', auth, wrap(() => D.all('SELECT * FROM categories ORDER BY name')));
app.post('/api/categories', auth, admin, wrap(async (req) => {
  const name = str(req.body.name, 'Nombre', 40);
  try { return await D.get('INSERT INTO categories (name) VALUES ($1) RETURNING id', [name]); }
  catch (e) { dup(e, 'Esa categoría ya existe'); }
}));
app.put('/api/categories/:id', auth, admin, wrap(async (req) => {
  const name = str(req.body.name, 'Nombre', 40);
  try { await D.run('UPDATE categories SET name=$1 WHERE id=$2', [name, int(req.params.id, 'id')]); return { ok: true }; }
  catch (e) { dup(e, 'Esa categoría ya existe'); }
}));
app.delete('/api/categories/:id', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  if (await D.get('SELECT 1 FROM products WHERE category_id=$1', [id])) throw bad('Hay productos en esta categoría; muévelos primero');
  await D.run('DELETE FROM categories WHERE id=$1', [id]);
  return { ok: true };
}));

// ---------- Productos / stock ----------
app.get('/api/products', auth, wrap(async (req) => {
  const rows = await D.all(`SELECT p.*, c.name AS category,
    (SELECT extract(epoch FROM updated_at)::bigint FROM product_photos f WHERE f.product_id=p.id) AS photo
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.active DESC, c.name, p.name`);
  if (req.user.role !== 'admin') rows.forEach((r) => { delete r.buy_price; });
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
    return { id };
  });
}));
app.put('/api/products/:id', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  const p = await productBody(req.body);
  const active = req.body.active === undefined ? 1 : (req.body.active ? 1 : 0);
  await D.run(`UPDATE products SET name=$1,category_id=$2,buy_price=$3,sell_price=$4,min_stock=$5,active=$6,track_stock=$7 WHERE id=$8`,
    [p.name, p.category_id, p.buy_price, p.sell_price, p.min_stock, active, p.track_stock, id]);
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
    return { ok: true };
  });
}));
// Corrección de inventario (conteo físico)
app.post('/api/products/:id/set-stock', auth, admin, wrap(async (req) => {
  await D.run('UPDATE products SET stock=$1 WHERE id=$2', [int(req.body.stock, 'stock'), int(req.params.id, 'id')]);
  return { ok: true };
}));
app.get('/api/stock-entries', auth, admin, wrap(() =>
  D.all(`SELECT e.*, p.name AS product, u.name AS "user" FROM stock_entries e
    JOIN products p ON p.id=e.product_id JOIN users u ON u.id=e.user_id
    ORDER BY e.id DESC LIMIT 100`)));

// ---------- Caja / turnos ----------
const reg = (x = D) => x.get('SELECT cash,nequi FROM register WHERE id=1');
const SHIFT_SQL = `SELECT s.*, u.name AS user_name,
  COALESCE((SELECT SUM(total) FROM sales x WHERE x.shift_id=s.id AND x.voided=0 AND x.method='efectivo'),0) AS sales_cash,
  COALESCE((SELECT SUM(total) FROM sales x WHERE x.shift_id=s.id AND x.voided=0 AND x.method='nequi'),0) AS sales_nequi,
  (SELECT COUNT(*) FROM sales x WHERE x.shift_id=s.id AND x.voided=0) AS sales_count,
  COALESCE((SELECT SUM((i.price-i.cost)*i.qty) FROM sale_items i JOIN sales x ON x.id=i.sale_id
    WHERE x.shift_id=s.id AND x.voided=0),0) AS profit
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
  return { ...s, sales: await salesOf(s.id) };
}));

// ---------- Ventas ----------
async function salesOf(shiftId) {
  const sales = await D.all('SELECT * FROM sales WHERE shift_id=$1 ORDER BY id DESC', [shiftId]);
  const items = sales.length ? await D.all('SELECT * FROM sale_items WHERE sale_id = ANY($1::int[])', [sales.map((s) => s.id)]) : [];
  sales.forEach((s) => { s.items = items.filter((i) => i.sale_id === s.id); });
  return sales;
}
app.get('/api/sales/current', auth, wrap(async () => {
  const s = await openShift();
  return s ? salesOf(s.id) : [];
}));
app.post('/api/sales', auth, wrap(async (req) => {
  const m = method(req.body.method);
  const lines = req.body.items;
  if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw bad('Agrega al menos un producto');
  const merged = new Map();
  for (const l of lines) {
    const pid = int(l.product_id, 'producto');
    merged.set(pid, (merged.get(pid) || 0) + int(l.qty, 'cantidad', { min: 1, max: 10000 }));
  }
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
      rows.push({ p, qty });
      total += p.sell_price * qty;
    }
    const { id } = await t.get('INSERT INTO sales (shift_id,user_id,method,total,created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [s.id, req.user.id, m, total, now()]);
    for (const { p, qty } of rows) {
      await t.run('INSERT INTO sale_items (sale_id,product_id,name,qty,price,cost) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, p.id, p.name, qty, p.sell_price, p.buy_price]);
      if (p.track_stock) await t.run('UPDATE products SET stock=stock-$1 WHERE id=$2', [qty, p.id]);
    }
    await t.run(`UPDATE register SET ${col(m)}=${col(m)}+$1 WHERE id=1`, [total]);
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
    for (const i of await t.all('SELECT * FROM sale_items WHERE sale_id=$1', [id]))
      await t.run('UPDATE products SET stock=stock+$1 WHERE id=$2 AND track_stock=1', [i.qty, i.product_id]);
    await t.run(`UPDATE register SET ${col(sale.method)}=${col(sale.method)}-$1 WHERE id=1`, [sale.total]);
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
  });
  return { ok: true };
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
  });
  return { ok: true };
}));
app.delete('/api/expenses/:id', auth, admin, wrap(async (req) => {
  const id = int(req.params.id, 'id');
  await tx(async (t) => {
    const e = await t.get('DELETE FROM expenses WHERE id=$1 RETURNING *', [id]);
    if (!e) throw new HttpError(404, 'No existe');
    if (e.method) await t.run(`UPDATE register SET ${col(e.method)}=${col(e.method)}+$1 WHERE id=1`, [e.amount]);
  });
  return { ok: true };
}));

// ---------- Resumen ----------
app.get('/api/dashboard', auth, admin, wrap(async () => {
  const start = new Date(); start.setUTCHours(5, 0, 0, 0); // medianoche Colombia (UTC-5)
  if (start > new Date()) start.setUTCDate(start.getUTCDate() - 1);
  const [t, profit, exp, top, low, inv, shift, register] = await Promise.all([
    D.get('SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS n FROM sales WHERE voided=0 AND created_at>=$1', [start]),
    D.get(`SELECT COALESCE(SUM((i.price-i.cost)*i.qty),0) AS p FROM sale_items i
      JOIN sales s ON s.id=i.sale_id WHERE s.voided=0 AND s.created_at>=$1`, [start]),
    D.get(`SELECT COALESCE(SUM(amount) FILTER (WHERE kind='implementos'),0) AS impl,
      COALESCE(SUM(amount) FILTER (WHERE kind='pedido'),0) AS ped FROM expenses WHERE created_at>=$1`, [start]),
    D.all(`SELECT i.name, SUM(i.qty) AS qty FROM sale_items i JOIN sales s ON s.id=i.sale_id
      WHERE s.voided=0 AND s.created_at>=now() - interval '30 days' GROUP BY i.product_id, i.name ORDER BY qty DESC LIMIT 5`),
    D.all('SELECT name, stock, min_stock FROM products WHERE active=1 AND track_stock=1 AND stock<=min_stock ORDER BY stock'),
    D.get(`SELECT COALESCE(SUM(stock::bigint*buy_price),0) AS cost, COALESCE(SUM(stock::bigint*sell_price),0) AS value
      FROM products WHERE active=1 AND track_stock=1`),
    openShift(),
    reg(),
  ]);
  return { register, today: { ...t, profit: profit.p, expenses: exp.impl, orders: exp.ped }, top, low, inventory: inv, open_shift: shift || null };
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
