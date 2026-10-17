const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const dt = (s) => s ? new Date(s).toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const diffTag = (d) => d === 0 ? '<span class="tag ok">Cuadra</span>'
  : `<span class="tag ${d > 0 ? 'warn' : 'err'}">${d > 0 ? 'Sobran' : 'Faltan'} ${money(Math.abs(d))}</span>`;

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Error');
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2500);
}
async function act(fn, ok) {
  try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e.message); return null; }
}

const S = { user: null, view: null, cart: [], method: 'efectivo', cat: 'all', q: '' };
const ADMIN_TABS = [['resumen', 'Resumen'], ['vender', 'Vender'], ['caja', 'Mi caja'], ['productos', 'Productos'], ['dinero', 'Dinero'], ['gastos', 'Gastos'], ['turnos', 'Turnos'], ['usuarios', 'Usuarios']];
const TURNO_TABS = [['caja', 'Caja'], ['vender', 'Vender'], ['turnos', 'Mis turnos']];

function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div>${html}</div>`;
  m.addEventListener('mousedown', (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  const f = m.querySelector('input,select'); if (f) f.focus();
  return m;
}
const closeModal = () => document.querySelectorAll('.modal').forEach((m) => m.remove());
const val = (id) => $('#' + id).value;

// ---------- Shell ----------
async function boot() {
  S.user = await api('/me').catch(() => null);
  if (!S.user) return loginView();
  const tabs = S.user.role === 'admin' ? ADMIN_TABS : TURNO_TABS;
  if (!S.view || !tabs.find((t) => t[0] === S.view)) S.view = tabs[0][0];
  $('#app').innerHTML = `
    <div class="top"><b>🥤 La Plancha</b><span class="sp"></span>
      <small>${esc(S.user.name)} · ${S.user.role === 'admin' ? 'Admin' : 'Turno'}</small>
      <button class="btn sec sm" onclick="A.password()">Contraseña</button>
      <button class="btn sec sm" onclick="A.logout()">Salir</button></div>
    <nav>${tabs.map(([k, l]) => `<button class="${k === S.view ? 'on' : ''}" onclick="go('${k}')">${l}</button>`).join('')}</nav>
    <main id="main"></main>`;
  await views[S.view]();
  if (S.user.must_change) $('#main').insertAdjacentHTML('afterbegin',
    '<div class="alert bad">Estás usando la contraseña por defecto. <a href="#" onclick="A.password();return false">Cámbiala ahora</a>.</div>');
}
window.go = (v) => { S.view = v; boot(); };

function loginView() {
  $('#app').innerHTML = `<div class="login card"><h2>🥤 La Plancha</h2><p class="mute">Asociación de Ingeniería de Sistemas</p>
    <label>Usuario</label><input id="lu" autocomplete="username" autocapitalize="none">
    <label>Contraseña</label><input id="lp" type="password" autocomplete="current-password">
    <p><button class="btn" style="width:100%" id="lb">Ingresar</button></p></div>`;
  const go = async () => {
    const u = await act(() => api('/login', 'POST', { username: val('lu'), password: val('lp') }));
    if (u) boot();
  };
  $('#lb').onclick = go;
  $('#lp').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ---------- Vistas ----------
const views = {
  async resumen() {
    const d = await api('/dashboard');
    const s = d.open_shift;
    $('#main').innerHTML = `
      <h2>Resumen</h2>
      <div class="grid">
        <div class="stat"><span>Efectivo en caja (según sistema)</span><b>${money(d.register.cash)}</b></div>
        <div class="stat"><span>Nequi (según sistema)</span><b>${money(d.register.nequi)}</b></div>
        <div class="stat"><span>Total esperado</span><b>${money(d.register.cash + d.register.nequi)}</b></div>
        <div class="stat"><span>Ventas de hoy (${d.today.n})</span><b>${money(d.today.total)}</b></div>
        <div class="stat"><span>Ganancia hoy</span><b>${money(d.today.profit)}</b></div>
        <div class="stat"><span>Gastos de implementos hoy</span><b>${money(d.today.expenses)}</b></div>
        <div class="stat"><span>Ganancia neta hoy</span><b>${money(d.today.profit - d.today.expenses)}</b></div>
        <div class="stat"><span>Inventario (costo → venta)</span><b style="font-size:1.1rem">${money(d.inventory.cost)} → ${money(d.inventory.value)}</b></div>
      </div><br>
      <div class="card"><h3>Turno actual</h3>${s ? `<b>${esc(s.user_name)}</b> abrió caja ${dt(s.opened_at)} · ${s.sales_count} ventas · ${money(s.sales_cash + s.sales_nequi)}`
        : '<span class="mute">No hay caja abierta.</span>'}</div>
      <div class="grid">
        <div class="card"><h3>⚠️ Stock bajo</h3>${d.low.length ? `<table>${d.low.map((p) => `<tr><td>${esc(p.name)}</td><td class="n ${p.stock === 0 ? 'err' : 'warn'}">${p.stock}</td></tr>`).join('')}</table>` : '<span class="mute">Todo bien.</span>'}</div>
        <div class="card"><h3>Más vendidos (30 días)</h3>${d.top.length ? `<table>${d.top.map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td></tr>`).join('')}</table>` : '<span class="mute">Sin ventas aún.</span>'}</div>
      </div>`;
  },

  async caja() {
    const { shift: s, register } = await api('/shift/current');
    const mine = s && s.user_id === S.user.id;
    let html = '<h2>Caja</h2>';
    if (!s) {
      html += `<div class="card"><h3>Abrir caja</h3><p class="mute">Cuenta el dinero con el que empiezas tu turno.</p>
        <div class="row"><div><label>Efectivo en caja</label><input id="oc" type="number" inputmode="numeric" min="0" value="${register.cash}"></div>
        <div><label>Saldo Nequi</label><input id="on" type="number" inputmode="numeric" min="0" value="${register.nequi}"></div></div>
        <p class="mute">El sistema esperaba: ${money(register.cash)} efectivo · ${money(register.nequi)} Nequi.</p>
        <button class="btn" onclick="A.openShift()">Abrir caja</button></div>`;
    } else {
      const expC = register.cash, expN = register.nequi;
      html += `<div class="card"><h3>Turno abierto${mine ? '' : ' por ' + esc(s.user_name)}</h3>
        <p class="mute">Desde ${dt(s.opened_at)}</p>
        <div class="grid">
          <div class="stat"><span>Inicio</span><b style="font-size:1.1rem">${money(s.open_cash)} ef · ${money(s.open_nequi)} nq</b></div>
          <div class="stat"><span>Ventas (${s.sales_count})</span><b style="font-size:1.1rem">${money(s.sales_cash)} ef · ${money(s.sales_nequi)} nq</b></div>
          <div class="stat"><span>Debería haber</span><b style="font-size:1.1rem">${money(expC)} ef · ${money(expN)} nq</b></div>
        </div></div>`;
      if (mine || S.user.role === 'admin') html += `<div class="card"><h3>Cerrar caja</h3>
        <p class="mute">Cuenta el dinero real y escríbelo. El sistema comparará con lo que debería haber.</p>
        <div class="row"><div><label>Efectivo contado</label><input id="cc" type="number" inputmode="numeric" min="0"></div>
        <div><label>Saldo Nequi</label><input id="cn" type="number" inputmode="numeric" min="0"></div></div>
        <label>Observaciones (opcional)</label><input id="cnote" maxlength="300">
        <p><button class="btn danger" onclick="A.closeShift()">Cerrar caja</button></p></div>`;
    }
    $('#main').innerHTML = html;
  },

  async vender() {
    const [{ shift: s }, prods, sales] = await Promise.all([api('/shift/current'), api('/products'), api('/sales/current')]);
    if (!s) { $('#main').innerHTML = '<div class="alert">Abre caja primero para poder vender.</div>'; return; }
    if (s.user_id !== S.user.id) { $('#main').innerHTML = `<div class="alert">La caja la abrió ${esc(s.user_name)}.</div>`; return; }
    S.prods = prods.filter((p) => p.active);
    S.cart = S.cart.filter((c) => S.prods.find((p) => p.id === c.id));
    const cats = [...new Set(S.prods.map((p) => p.category || 'Sin categoría'))];
    $('#main').innerHTML = `<div class="pos">
      <div><input id="q" placeholder="Buscar producto…" value="${esc(S.q)}" oninput="S.q=this.value;A.grid()">
        <div class="chips"><button class="${S.cat === 'all' ? 'on' : ''}" onclick="S.cat='all';views.vender()">Todos</button>
        ${cats.map((c) => `<button class="${S.cat === c ? 'on' : ''}" data-c="${esc(c)}" onclick="S.cat=this.dataset.c;views.vender()">${esc(c)}</button>`).join('')}</div>
        <div class="prods" id="grid"></div></div>
      <div class="card"><h3>Venta</h3><div id="cart"></div></div></div>
      <div class="card"><h3>Ventas de este turno</h3><div class="tw">${salesTable(sales, true)}</div></div>`;
    A.grid(); A.cart();
  },

  async productos() {
    const [prods, cats] = await Promise.all([api('/products'), api('/categories')]);
    S.prods = prods; S.cats = cats;
    $('#main').innerHTML = `<div class="row" style="align-items:center"><h2 style="flex:3">Productos y stock</h2>
      <button class="btn" onclick="A.productForm()">+ Producto</button>
      <button class="btn sec" onclick="A.catManager()">Categorías</button></div>
      <div class="card tw"><table><tr><th>Producto</th><th>Categoría</th><th class="n">Compra</th><th class="n">Venta</th><th class="n">Stock</th><th></th></tr>
      ${prods.map((p) => `<tr style="${p.active ? '' : 'opacity:.5'}"><td>${esc(p.name)}</td><td>${esc(p.category || '—')}</td>
        <td class="n">${money(p.buy_price)}</td><td class="n">${money(p.sell_price)}</td>
        <td class="n ${p.stock <= p.min_stock ? 'err' : ''}"><b>${p.stock}</b></td>
        <td class="n"><button class="btn sm" onclick="A.stockForm(${p.id})">+ Stock</button>
        <button class="btn sec sm" onclick="A.productForm(${p.id})">Editar</button></td></tr>`).join('') || '<tr><td colspan="6" class="mute">Aún no hay productos.</td></tr>'}</table></div>`;
  },

  async dinero() {
    const { register, adjustments } = await api('/register');
    $('#main').innerHTML = `<h2>Dinero total en caja</h2>
      <div class="grid"><div class="stat"><span>Efectivo</span><b>${money(register.cash)}</b></div>
      <div class="stat"><span>Nequi</span><b>${money(register.nequi)}</b></div>
      <div class="stat"><span>Total</span><b>${money(register.cash + register.nequi)}</b></div></div><br>
      <div class="card"><h3>Registrar ingreso o retiro</h3>
        <p class="mute">Úsalo para fijar la base inicial, consignar, o sacar dinero (ej. para comprar mercancía). Usa un valor negativo para retirar.</p>
        <div class="row"><div><label>Medio</label><select id="am"><option value="efectivo">Efectivo</option><option value="nequi">Nequi</option></select></div>
        <div><label>Monto (+ ingreso / − retiro)</label><input id="aa" type="number" inputmode="numeric"></div>
        <div><label>Motivo</label><input id="an" maxlength="200"></div></div>
        <p><button class="btn" onclick="A.adjust()">Registrar</button></p></div>
      <div class="card tw"><h3>Movimientos manuales</h3><table><tr><th>Fecha</th><th>Quién</th><th>Medio</th><th class="n">Monto</th><th>Motivo</th></tr>
      ${adjustments.map((a) => `<tr><td>${dt(a.created_at)}</td><td>${esc(a.user)}</td><td>${a.method}</td><td class="n ${a.amount < 0 ? 'err' : 'ok'}">${money(a.amount)}</td><td>${esc(a.note)}</td></tr>`).join('') || '<tr><td colspan="5" class="mute">Sin movimientos.</td></tr>'}</table></div>`;
  },

  async gastos() {
    const rows = await api('/expenses');
    const total = rows.reduce((t, e) => t + e.amount, 0);
    $('#main').innerHTML = `<h2>Gastos de implementos</h2>
      <div class="card"><p class="mute">Cucharas, vasos, servilletas y todo lo que se gasta pero no genera ganancia directa.</p>
        <div class="row"><div style="flex:2"><label>Descripción</label><input id="gd" maxlength="150" placeholder="Ej: Paquete de vasos"></div>
        <div><label>Monto</label><input id="ga" type="number" inputmode="numeric" min="1"></div>
        <div><label>¿De dónde salió?</label><select id="gm"><option value="">Fuera de la caja</option><option value="efectivo">Efectivo de la caja</option><option value="nequi">Nequi de la caja</option></select></div></div>
        <p><button class="btn" onclick="A.addExpense()">Registrar gasto</button></p></div>
      <div class="card tw"><h3>Historial · total ${money(total)}</h3><table><tr><th>Fecha</th><th>Descripción</th><th>Salió de</th><th class="n">Monto</th><th></th></tr>
      ${rows.map((e) => `<tr><td>${dt(e.created_at)}</td><td>${esc(e.description)}</td><td>${e.method || 'Fuera de caja'}</td><td class="n">${money(e.amount)}</td>
        <td class="n"><button class="btn sec sm" onclick="A.delExpense(${e.id})">Borrar</button></td></tr>`).join('') || '<tr><td colspan="5" class="mute">Sin gastos.</td></tr>'}</table></div>`;
  },

  async turnos() {
    const rows = await api('/shifts');
    const admin = S.user.role === 'admin';
    $('#main').innerHTML = `<h2>${admin ? 'Turnos' : 'Mis turnos'}</h2><div class="card tw"><table>
      <tr><th>Fecha</th>${admin ? '<th>Quién</th>' : ''}<th class="n">Ventas</th><th>Efectivo</th><th>Nequi</th><th></th></tr>
      ${rows.map((s) => {
        const closed = !!s.closed_at;
        const dc = closed ? s.close_cash - s.sys_close_cash : 0, dn = closed ? s.close_nequi - s.sys_close_nequi : 0;
        return `<tr><td>${dt(s.opened_at)}<br><small class="mute">${closed ? 'hasta ' + dt(s.closed_at) : '<span class="tag warn">Abierto</span>'}</small></td>
        ${admin ? `<td>${esc(s.user_name)}</td>` : ''}<td class="n">${s.sales_count}<br>${money(s.sales_cash + s.sales_nequi)}</td>
        <td>${closed ? diffTag(dc) : '—'}</td><td>${closed ? diffTag(dn) : '—'}</td>
        <td class="n"><button class="btn sec sm" onclick="A.shiftDetail(${s.id})">Ver</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="mute">Sin turnos.</td></tr>'}</table></div>`;
  },

  async usuarios() {
    const users = await api('/users');
    $('#main').innerHTML = `<div class="row" style="align-items:center"><h2 style="flex:3">Usuarios</h2><button class="btn" onclick="A.userForm()">+ Usuario</button></div>
      <div class="card tw"><table><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th></th></tr>
      ${users.map((u) => `<tr style="${u.active ? '' : 'opacity:.5'}"><td>${esc(u.name)}</td><td>${esc(u.username)}</td>
        <td>${u.role === 'admin' ? 'Admin' : 'Turno'}${u.active ? '' : ' (inactivo)'}</td>
        <td class="n"><button class="btn sec sm" onclick="A.userForm(${u.id})">Editar</button></td></tr>`).join('')}</table></div>`;
    S.users = users;
  },
};
window.views = views; window.S = S;

function salesTable(sales, canVoid) {
  if (!sales.length) return '<span class="mute">Sin ventas.</span>';
  return `<table><tr><th>Hora</th><th>Detalle</th><th>Pago</th><th class="n">Total</th><th></th></tr>${sales.map((s) =>
    `<tr style="${s.voided ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${dt(s.created_at).split(', ').pop()}</td>
    <td>${s.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}</td><td>${s.method}</td><td class="n">${money(s.total)}</td>
    <td class="n">${canVoid && !s.voided ? `<button class="btn sec sm" onclick="A.voidSale(${s.id})">Anular</button>` : (s.voided ? '<span class="tag err">Anulada</span>' : '')}</td></tr>`).join('')}</table>`;
}

// ---------- Acciones ----------
const A = window.A = {
  async logout() { await api('/logout', 'POST'); S.view = null; S.cart = []; boot(); },
  password() {
    modal(`<h3>Cambiar contraseña</h3><label>Actual</label><input id="p0" type="password"><label>Nueva (mín. 6)</label><input id="p1" type="password">
      <p><button class="btn" onclick="A.savePassword()">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async savePassword() {
    if (await act(() => api('/password', 'POST', { current: val('p0'), password: val('p1') }), 'Contraseña actualizada')) { closeModal(); boot(); }
  },

  // Caja
  async openShift() {
    const r = await act(() => api('/shift/open', 'POST', { cash: val('oc'), nequi: val('on') }));
    if (!r) return;
    if (r.diff_cash || r.diff_nequi) alert(`Ojo: lo que declaraste difiere de lo que esperaba el sistema.\nEfectivo: ${r.diff_cash >= 0 ? '+' : ''}${r.diff_cash}\nNequi: ${r.diff_nequi >= 0 ? '+' : ''}${r.diff_nequi}\nQuedó registrado en el turno.`);
    S.view = 'vender'; boot();
  },
  async closeShift() {
    if (val('cc') === '' || val('cn') === '') return toast('Escribe el efectivo y el Nequi contados');
    if (!confirm('¿Cerrar caja con estos valores?')) return;
    const r = await act(() => api('/shift/close', 'POST', { cash: val('cc'), nequi: val('cn'), notes: val('cnote') }));
    if (!r) return;
    const line = (n, d, e) => `<p><b>${n}</b>: esperado ${money(e)} → ${diffTag(d)}</p>`;
    modal(`<h3>Caja cerrada</h3>${line('Efectivo', r.diff_cash, r.expected_cash)}${line('Nequi', r.diff_nequi, r.expected_nequi)}
      <p><button class="btn" onclick="closeModal();boot()">Listo</button></p>`);
  },

  // Venta
  grid() {
    const q = S.q.toLowerCase();
    const list = S.prods.filter((p) => (S.cat === 'all' || (p.category || 'Sin categoría') === S.cat) && p.name.toLowerCase().includes(q));
    $('#grid').innerHTML = list.map((p) => `<button class="prod" ${p.stock <= 0 ? 'disabled' : ''} onclick="A.add(${p.id})">
      <b>${esc(p.name)}</b>${money(p.sell_price)}<br><small>${p.stock} disp.</small></button>`).join('') || '<span class="mute">Sin resultados.</span>';
  },
  add(id) {
    const p = S.prods.find((x) => x.id === id), c = S.cart.find((x) => x.id === id);
    if (c) { if (c.qty < p.stock) c.qty++; else toast('No hay más stock'); } else S.cart.push({ id, qty: 1 });
    A.cart();
  },
  chg(id, d) {
    const c = S.cart.find((x) => x.id === id), p = S.prods.find((x) => x.id === id);
    c.qty += d;
    if (c.qty > p.stock) { c.qty = p.stock; toast('No hay más stock'); }
    if (c.qty <= 0) S.cart = S.cart.filter((x) => x.id !== id);
    A.cart();
  },
  cart() {
    const total = S.cart.reduce((t, c) => t + c.qty * S.prods.find((p) => p.id === c.id).sell_price, 0);
    $('#cart').innerHTML = (S.cart.length ? `<table>${S.cart.map((c) => {
      const p = S.prods.find((x) => x.id === c.id);
      return `<tr><td>${esc(p.name)}<br><small class="mute">${money(p.sell_price)}</small></td>
        <td><div class="qty"><button onclick="A.chg(${c.id},-1)">−</button>${c.qty}<button onclick="A.chg(${c.id},1)">+</button></div></td>
        <td class="n">${money(c.qty * p.sell_price)}</td></tr>`;
    }).join('')}</table>` : '<span class="mute">Toca un producto para agregarlo.</span>') +
      `<p class="total">${money(total)}</p>
      <div class="seg"><button class="${S.method === 'efectivo' ? 'on' : ''}" onclick="S.method='efectivo';A.cart()">💵 Efectivo</button>
      <button class="${S.method === 'nequi' ? 'on' : ''}" onclick="S.method='nequi';A.cart()">📱 Nequi</button></div>
      <p><button class="btn" style="width:100%" ${S.cart.length ? '' : 'disabled'} onclick="A.sell()">Registrar venta</button></p>
      ${S.cart.length ? '<button class="btn sec sm" onclick="S.cart=[];A.cart()">Vaciar</button>' : ''}`;
  },
  async sell() {
    const r = await act(() => api('/sales', 'POST', { method: S.method, items: S.cart.map((c) => ({ product_id: c.id, qty: c.qty })) }));
    if (r) { S.cart = []; toast('Venta registrada: ' + money(r.total)); views.vender(); }
  },
  async voidSale(id) {
    if (!confirm('¿Anular esta venta? El stock y el dinero se revierten.')) return;
    if (await act(() => api(`/sales/${id}/void`, 'POST'), 'Venta anulada')) boot();
  },

  // Productos
  productForm(id) {
    const p = id ? S.prods.find((x) => x.id === id) : { name: '', category_id: '', buy_price: '', sell_price: '', min_stock: 0, active: 1 };
    modal(`<h3>${id ? 'Editar' : 'Nuevo'} producto</h3>
      <label>Nombre</label><input id="pn" value="${esc(p.name)}">
      <label>Categoría</label><select id="pc"><option value="">Sin categoría</option>${S.cats.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <div class="row"><div><label>Precio de compra</label><input id="pb" type="number" inputmode="numeric" min="0" value="${p.buy_price}"></div>
      <div><label>Precio de venta</label><input id="ps" type="number" inputmode="numeric" min="0" value="${p.sell_price}"></div></div>
      <div class="row">${id ? '' : '<div><label>Cantidad inicial</label><input id="pq" type="number" min="0" value="0"></div>'}
      <div><label>Avisar si stock ≤</label><input id="pm" type="number" min="0" value="${p.min_stock}"></div></div>
      ${id ? `<label><input type="checkbox" id="pa" style="width:auto" ${p.active ? 'checked' : ''}> Activo (visible para vender)</label>` : ''}
      <p><button class="btn" onclick="A.saveProduct(${id || 0})">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async saveProduct(id) {
    const body = { name: val('pn'), category_id: val('pc'), buy_price: val('pb'), sell_price: val('ps'), min_stock: val('pm') };
    if (id) body.active = $('#pa').checked; else body.stock = val('pq');
    if (await act(() => api(id ? `/products/${id}` : '/products', id ? 'PUT' : 'POST', body), 'Guardado')) { closeModal(); boot(); }
  },
  stockForm(id) {
    const p = S.prods.find((x) => x.id === id);
    modal(`<h3>Ingresar stock</h3><p><b>${esc(p.name)}</b> · hay ${p.stock}</p>
      <div class="row"><div><label>Cantidad que llegó</label><input id="sq" type="number" inputmode="numeric" min="1"></div>
      <div><label>Precio de compra (unidad)</label><input id="sb" type="number" inputmode="numeric" min="0" value="${p.buy_price}"></div></div>
      <label>Nota (proveedor, factura…)</label><input id="sn" maxlength="200">
      <p><button class="btn" onclick="A.saveStock(${id})">Agregar al stock</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>
      <hr><p class="mute">¿Hiciste un conteo físico y no coincide? <a href="#" onclick="A.fixStock(${id});return false">Corregir stock</a></p>`);
  },
  async saveStock(id) {
    if (await act(() => api(`/products/${id}/stock`, 'POST', { qty: val('sq'), buy_price: val('sb'), note: val('sn') }), 'Stock actualizado')) { closeModal(); boot(); }
  },
  async fixStock(id) {
    const v = prompt('Cantidad real que hay ahora mismo:');
    if (v === null) return;
    if (await act(() => api(`/products/${id}/set-stock`, 'POST', { stock: v }), 'Stock corregido')) { closeModal(); boot(); }
  },
  catManager() {
    modal(`<h3>Categorías</h3><table>${S.cats.map((c) => `<tr><td>${esc(c.name)}</td><td class="n">
      <button class="btn sec sm" onclick="A.renameCat(${c.id})">Renombrar</button>
      <button class="btn sec sm" onclick="A.delCat(${c.id})">Borrar</button></td></tr>`).join('')}</table>
      <label>Nueva categoría</label><input id="cn2" maxlength="40">
      <p><button class="btn" onclick="A.addCat()">Agregar</button> <button class="btn sec" onclick="closeModal()">Cerrar</button></p>`);
  },
  async addCat() { if (await act(() => api('/categories', 'POST', { name: val('cn2') }))) { closeModal(); boot(); } },
  async renameCat(id) {
    const n = prompt('Nuevo nombre:', S.cats.find((c) => c.id === id).name);
    if (n && await act(() => api(`/categories/${id}`, 'PUT', { name: n }))) { closeModal(); boot(); }
  },
  async delCat(id) { if (confirm('¿Borrar categoría?') && await act(() => api(`/categories/${id}`, 'DELETE'))) { closeModal(); boot(); } },

  // Dinero
  async adjust() {
    if (await act(() => api('/register/adjust', 'POST', { method: val('am'), amount: val('aa'), note: val('an') }), 'Registrado')) boot();
  },

  async addExpense() {
    if (await act(() => api('/expenses', 'POST', { description: val('gd'), amount: val('ga'), method: val('gm') }), 'Gasto registrado')) boot();
  },
  async delExpense(id) {
    if (confirm('¿Borrar este gasto? Si salió de la caja, el dinero se devuelve.') && await act(() => api('/expenses/' + id, 'DELETE'))) boot();
  },

  // Turnos
  async shiftDetail(id) {
    const s = await act(() => api('/shifts/' + id));
    if (!s) return;
    const closed = !!s.closed_at;
    modal(`<h3>Turno de ${esc(s.user_name)}</h3><p class="mute">${dt(s.opened_at)} → ${closed ? dt(s.closed_at) : 'abierto'}</p>
      <table><tr><th></th><th class="n">Efectivo</th><th class="n">Nequi</th></tr>
      <tr><td>Declarado al abrir</td><td class="n">${money(s.open_cash)}</td><td class="n">${money(s.open_nequi)}</td></tr>
      <tr><td>Esperado al abrir</td><td class="n">${money(s.sys_open_cash)}</td><td class="n">${money(s.sys_open_nequi)}</td></tr>
      <tr><td>Ventas</td><td class="n">${money(s.sales_cash)}</td><td class="n">${money(s.sales_nequi)}</td></tr>
      ${closed ? `<tr><td>Esperado al cerrar</td><td class="n">${money(s.sys_close_cash)}</td><td class="n">${money(s.sys_close_nequi)}</td></tr>
      <tr><td>Contado al cerrar</td><td class="n">${money(s.close_cash)}</td><td class="n">${money(s.close_nequi)}</td></tr>
      <tr><td><b>Diferencia</b></td><td class="n">${diffTag(s.close_cash - s.sys_close_cash)}</td><td class="n">${diffTag(s.close_nequi - s.sys_close_nequi)}</td></tr>` : ''}</table>
      ${S.user.role === 'admin' ? `<p>Ganancia del turno: <b>${money(s.profit)}</b></p>` : ''}
      ${s.notes ? `<p><i>${esc(s.notes)}</i></p>` : ''}
      <div class="tw">${salesTable(s.sales, S.user.role === 'admin')}</div>
      <p><button class="btn" onclick="closeModal()">Cerrar</button></p>`);
  },

  // Usuarios
  userForm(id) {
    const u = id ? S.users.find((x) => x.id === id) : { name: '', username: '', role: 'turno', active: 1 };
    modal(`<h3>${id ? 'Editar' : 'Nuevo'} usuario</h3>
      <label>Nombre</label><input id="un" value="${esc(u.name)}">
      <label>Usuario (para ingresar)</label><input id="uu" value="${esc(u.username)}" ${id ? 'disabled' : ''} autocapitalize="none">
      <label>Rol</label><select id="ur"><option value="turno" ${u.role === 'turno' ? 'selected' : ''}>Turno (vende)</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option></select>
      <label>${id ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña (mín. 6)'}</label><input id="up" type="password" autocomplete="new-password">
      ${id ? `<label><input type="checkbox" id="ua" style="width:auto" ${u.active ? 'checked' : ''}> Activo</label>` : ''}
      <p><button class="btn" onclick="A.saveUser(${id || 0})">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async saveUser(id) {
    const body = { name: val('un'), role: val('ur'), password: val('up') };
    if (id) { body.active = $('#ua').checked; if (!body.password) delete body.password; } else body.username = val('uu');
    if (await act(() => api(id ? `/users/${id}` : '/users', id ? 'PUT' : 'POST', body), 'Guardado')) { closeModal(); boot(); }
  },
};
window.closeModal = closeModal; window.boot = boot;

boot();
