const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Minúsculas y sin tildes, para que la búsqueda no sea exacta
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const photoUrl = (p) => `/api/products/${p.id}/photo?v=${p.photo}`;
// Reduce la foto a un cuadrado de 240px (JPEG) para que pese pocos KB
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), N = 240;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  cv.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, N, N);
  return cv.toDataURL('image/jpeg', 0.8);
}
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

const S = { user: null, view: null, chat: [], peer: 0, cart: [], benefit: null, method: 'efectivo', cat: 'all', q: '' };
const ADMIN_TABS = [['resumen', 'Resumen'], ['vender', 'Vender'], ['caja', 'Mi caja'], ['productos', 'Productos'], ['dinero', 'Dinero'], ['gastos', 'Gastos'], ['reportes', 'Reportes'], ['turnos', 'Turnos'], ['horario', 'Horario'], ['chat', 'Chat'], ['actividad', 'Actividad'], ['usuarios', 'Usuarios']];
const TURNO_TABS = [['caja', 'Caja'], ['vender', 'Vender'], ['inventario', 'Productos'], ['turnos', 'Mis turnos'], ['horario', 'Horario'], ['chat', 'Chat']];

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
    <div class="top"><div class="brand"><img src="/logo.png" alt="ACEIS"><i>La Plancha</i></div><span class="sp"></span>
      <small data-i="${esc(S.user.name.trim()[0] || '?').toUpperCase()}"><span>${esc(S.user.name)} · ${S.user.role === 'admin' ? 'Admin' : 'Turno'}</span></small>
      <button class="btn sec sm" onclick="A.password()">Contraseña</button>
      <button class="btn sec sm" onclick="A.logout()">Salir</button></div>
    <nav>${tabs.map(([k, l]) => `<button class="${k === S.view ? 'on' : ''}" onclick="go('${k}')">${l}${k === 'chat' ? '<b class="dot" id="chatdot" hidden></b>' : ''}</button>`).join('')}</nav>
    <main id="main"></main>`;
  await views[S.view]();
  chatStart();
  if (S.user.must_change) $('#main').insertAdjacentHTML('afterbegin',
    '<div class="alert bad">Estás usando la contraseña por defecto. <a href="#" onclick="A.password();return false">Cámbiala ahora</a>.</div>');
}
// Chat: sala general (peer 0) y mensajes privados (peer = id de usuario). Se consulta cada 5 s;
// el punto del tab avisa de mensajes sin leer en cualquier conversación.
const inChat = () => S.view === 'chat' && $('#chatlist');
const lastChatId = () => (S.chat.length ? S.chat[S.chat.length - 1].id : 0);
function chatPaintSide() {
  const side = $('#chatside'); if (!side || !S.chatUsers) return;
  const row = (id, name, n) => `<button class="${S.peer === id ? 'on' : ''}" onclick="A.openChat(${id})"><span>${id ? '' : '👥 '}${esc(name)}</span>${n && S.peer !== id ? `<b class="badge">${n}</b>` : ''}</button>`;
  side.innerHTML = row(0, 'Equipo (todos)', S.chatUsers.general) + S.chatUsers.users.map((u) => row(u.id, u.name, u.unread)).join('');
}
function chatPaintDot() {
  const d = $('#chatdot'); if (!d || !S.chatUsers) return;
  const cur = inChat() ? S.peer : -1;
  d.hidden = !(S.chatUsers.general && cur !== 0) && !S.chatUsers.users.some((u) => u.unread && u.id !== cur);
}
function chatPaintList() {
  const box = $('#chatlist'); if (!box) return;
  const bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = S.chat.map((m) => `<div class="msg ${m.user_id === S.user.id ? 'me' : ''}"><small>${m.user_id === S.user.id ? 'Tú' : esc(m.user_name)} · ${dt(m.created_at).split(', ').pop()}</small><div>${esc(m.body)}</div></div>`).join('')
    || '<span class="mute">Aún no hay mensajes. ¡Escribe el primero!</span>';
  if (bottom) box.scrollTop = box.scrollHeight;
}
async function chatPoll() {
  if (!S.user) return;
  try {
    const peer = S.peer, last = lastChatId();
    const [sum, rows] = await Promise.all([api('/chat/users'),
      inChat() ? api(`/chat?with=${peer}${last ? '&after=' + last : ''}`) : null]);
    S.chatUsers = sum;
    if (rows && peer === S.peer && inChat()) {
      const fresh = rows.filter((m) => m.id > lastChatId());
      const first = !last;
      if (fresh.length) { S.chat = S.chat.concat(fresh); chatPaintList(); }
      if (first) { const b = $('#chatlist'); if (b) b.scrollTop = b.scrollHeight; }
      if (fresh.length || first) api('/chat/read', 'POST', { with: peer }).catch(() => {});
    }
    chatPaintSide(); chatPaintDot();
  } catch {}
}
function chatStart() {
  clearInterval(S.chatTimer);
  if (!S.user) return;
  chatPoll();
  S.chatTimer = setInterval(chatPoll, 5000);
}
window.go = (v) => { S.view = v; boot(); };

function loginView() {
  $('#app').innerHTML = `<div class="login-wrap"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i>
    <div class="login"><img src="/logo.png" alt="ACEIS"><h2>La Plancha</h2><p class="mute">Asociación de Ingeniería de Sistemas</p>
    <label>Usuario</label><input id="lu" autocomplete="username" autocapitalize="none">
    <label>Contraseña</label><input id="lp" type="password" autocomplete="current-password">
    <button class="btn" id="lb">Ingresar</button></div></div>`;
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
        <div class="stat"><span>Retiros Nequi hoy (${d.today.withdrawals}) · comisiones</span><b>${money(d.today.fees)}</b></div>
        <div class="stat"><span>Gastos de implementos hoy</span><b>${money(d.today.expenses)}</b></div>
        <div class="stat"><span>Pagos de pedidos hoy</span><b>${money(d.today.orders)}</b></div>
        <div class="stat"><span>Ganancia neta hoy</span><b>${money(d.today.profit - d.today.expenses)}</b></div>
        <div class="stat"><span>Inventario (costo → venta)</span><b style="font-size:1.1rem">${money(d.inventory.cost)} → ${money(d.inventory.value)}</b></div>
      </div><br>
      <div class="card"><h3>Turno actual</h3>${s ? `<b>${esc(s.user_name)}</b> abrió caja ${dt(s.opened_at)} · ${s.sales_count} ventas · ${money(s.sales_cash + s.sales_nequi)}`
        : '<span class="mute">No hay caja abierta.</span>'}</div>
      <div class="grid">
        <div class="card"><h3>Stock bajo</h3>${d.low.length ? `<table>${d.low.map((p) => `<tr><td>${esc(p.name)}</td><td class="n ${p.stock === 0 ? 'err' : 'warn'}">${p.stock}</td></tr>`).join('')}</table>` : '<span class="mute">Todo bien.</span>'}</div>
        <div class="card"><h3>Más vendidos (30 días)</h3>${d.top.length ? Object.entries(d.top.reduce((g, p) => ((g[p.category] ||= []).push(p), g), {})).map(([c, ps]) => `<h4 style="margin:.6rem 0 .2rem">${esc(c)}</h4><table>${ps.map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td></tr>`).join('')}</table>`).join('') : '<span class="mute">Sin ventas aún.</span>'}</div>
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
    const [{ shift: s }, prods, sales, wds] = await Promise.all([api('/shift/current'), api('/products'), api('/sales/current'), api('/withdrawals/current')]);
    if (!s) { $('#main').innerHTML = '<div class="alert">Abre caja primero para poder vender.</div>'; return; }
    if (s.user_id !== S.user.id) { $('#main').innerHTML = `<div class="alert">La caja la abrió ${esc(s.user_name)}.</div>`; return; }
    S.prods = prods.filter((p) => p.active);
    S.cart = S.cart.filter((c) => S.prods.find((p) => p.id === c.id));
    if (S.benefit && !S.cart.find((c) => c.id === S.benefit.product_id)) S.benefit = null;
    const cats = [...new Set(S.prods.map((p) => p.category || 'Sin categoría'))];
    $('#main').innerHTML = `<div class="pos">
      <div><input id="q" placeholder="Buscar producto…" value="${esc(S.q)}" oninput="S.q=this.value;A.grid()">
        <div class="chips"><button class="${S.cat === 'all' ? 'on' : ''}" onclick="S.cat='all';views.vender()">Todos</button>
        ${cats.map((c) => `<button class="${S.cat === c ? 'on' : ''}" data-c="${esc(c)}" onclick="S.cat=this.dataset.c;views.vender()">${esc(c)}</button>`).join('')}</div>
        <div class="prods" id="grid"></div></div>
      <div class="card"><h3>Venta</h3><div id="cart"></div></div></div>
      <div class="card"><h3>Retiro de efectivo por Nequi</h3>
        <p class="mute">El cliente te transfiere por Nequi y tú le entregas efectivo. Comisión sugerida: $500 por cada $50.000.</p>
        <div class="row"><div><label>Monto a entregar en efectivo</label><input id="wa" type="number" inputmode="numeric" min="1" oninput="A.wdFee()"></div>
        <div><label>Comisión</label><input id="wf" type="number" inputmode="numeric" min="0" value="0"></div>
        <div><label>La comisión se cobró en</label><select id="wm"><option value="nequi">Nequi (se suma a la transferencia)</option><option value="efectivo">Efectivo</option></select></div></div>
        <p id="wsum" class="mute"></p>
        <button class="btn" onclick="A.withdraw()">Registrar retiro</button>
        ${wds.length ? `<div class="tw" style="margin-top:1rem"><table><tr><th>Hora</th><th class="n">Entregado</th><th class="n">Comisión</th><th></th></tr>${wds.map((w) =>
          `<tr style="${w.voided ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${dt(w.created_at).split(', ').pop()}</td><td class="n">${money(w.amount)}</td><td class="n">${money(w.fee)}</td>
          <td class="n">${w.voided ? '<span class="tag err">Anulado</span>' : `<button class="btn sec sm" onclick="A.voidWd(${w.id})">Anular</button>`}</td></tr>`).join('')}</table></div>` : ''}</div>
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
      ${prods.map((p) => `<tr style="${p.active ? '' : 'opacity:.5'}"><td>${p.photo ? `<img class="thumb" loading="lazy" src="${photoUrl(p)}" alt="">` : ''}${esc(p.name)}</td><td>${esc(p.category || '—')}</td>
        <td class="n">${money(p.buy_price)}</td><td class="n">${money(p.sell_price)}</td>
        <td class="n ${p.track_stock && p.stock <= p.min_stock ? 'err' : ''}"><b>${p.track_stock ? p.stock : '—'}</b></td>
        <td class="n">${p.track_stock ? `<button class="btn sm" onclick="A.stockForm(${p.id})">+ Stock</button>` : ''}
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
    const [rows, cats] = await Promise.all([api('/expenses'), api('/categories')]);
    S.cats = cats;
    const sum = (k) => rows.filter((e) => e.kind === k).reduce((t, e) => t + e.amount, 0);
    $('#main').innerHTML = `<h2>Gastos</h2>
      <div class="card"><div class="seg" style="margin-bottom:.5rem">
        <button id="k1" class="on" onclick="A.kind('pedido')">🚚 Pago de pedido</button>
        <button id="k2" onclick="A.kind('implementos')">🥄 Implementos</button></div>
        <p class="mute" id="kh"></p>
        <div class="row"><div id="gcw"><label>Proveedor / categoría</label><select id="gc"><option value="">Otro</option>${cats.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></div>
        <div style="flex:2"><label id="gdl">Nota (opcional)</label><input id="gd" maxlength="150"></div>
        <div><label>Monto</label><input id="ga" type="number" inputmode="numeric" min="1"></div>
        <div><label>¿De dónde salió?</label><select id="gm"><option value="">Fuera de la caja</option><option value="efectivo">Efectivo de la caja</option><option value="nequi">Nequi de la caja</option></select></div></div>
        <p><button class="btn" onclick="A.addExpense()">Registrar gasto</button></p></div>
      <div class="grid"><div class="stat"><span>Total pedidos pagados</span><b>${money(sum('pedido'))}</b></div>
        <div class="stat"><span>Total implementos</span><b>${money(sum('implementos'))}</b></div></div><br>
      <div class="card tw"><h3>Historial</h3><table><tr><th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Salió de</th><th class="n">Monto</th><th></th></tr>
      ${rows.map((e) => `<tr><td>${dt(e.created_at)}</td><td><span class="tag">${e.kind === 'pedido' ? 'Pedido' : 'Implementos'}</span></td><td>${esc(e.description)}</td><td>${e.method || 'Fuera de caja'}</td><td class="n">${money(e.amount)}</td>
        <td class="n"><button class="btn sec sm" onclick="A.delExpense(${e.id})">Borrar</button></td></tr>`).join('') || '<tr><td colspan="6" class="mute">Sin gastos.</td></tr>'}</table></div>`;
    S.kind = 'pedido'; A.kind('pedido');
  },

  // Solo lectura: precios y stock para quien atiende
  async inventario() {
    S.prods = (await api('/products')).filter((p) => p.active);
    $('#main').innerHTML = `<h2>Productos y stock</h2>
      <input id="iq" placeholder="Buscar producto…" oninput="A.invRows()">
      <div class="card tw" style="margin-top:1rem"><table><thead><tr><th>Producto</th><th>Categoría</th><th class="n">Precio</th><th class="n">Stock</th></tr></thead><tbody id="irows"></tbody></table></div>`;
    A.invRows();
  },

  async reportes() {
    S.week ||= null;
    const w = await api('/reports/week' + (S.week ? `?start=${S.week}` : ''));
    S.week = w.start;
    const d0 = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' });
    const dn = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
    const pct = (a, b) => b ? `<small class="${a >= b ? 'ok' : 'err'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}% vs semana anterior</small>` : '<small class="mute">Sin semana anterior</small>';
    const t = w.totals, pv = w.previous, max = Math.max(1, ...w.days.map((d) => d.total));
    const net = t.profit - t.impl;
    $('#main').innerHTML = `<h2>Reporte semanal</h2>
      <div class="row" style="align-items:center;margin-bottom:1rem">
        <button class="btn sec sm" onclick="A.week(-7)">← Anterior</button>
        <b style="flex:2;text-align:center">${d0(w.start)} – ${d0(w.end)}</b>
        <button class="btn sec sm" onclick="A.week(7)">Siguiente →</button></div>
      <div class="grid">
        <div class="stat"><span>Ventas (${t.n})</span><b>${money(t.total)}</b>${pct(t.total, pv.total)}</div>
        <div class="stat"><span>Ganancia</span><b>${money(t.profit)}</b>${pct(t.profit, pv.profit)}</div>
        <div class="stat"><span>Gastos de implementos</span><b>${money(t.impl)}</b></div>
        <div class="stat"><span>Ganancia neta</span><b>${money(net)}</b>${pct(net, pv.profit - pv.impl)}</div>
        <div class="stat"><span>Pagos de pedidos</span><b>${money(t.ped)}</b></div>
      </div><br>
      <div class="card tw"><h3>Por día</h3><table><tr><th>Día</th><th class="n">Ventas</th><th class="n">Total</th><th></th><th class="n">Ganancia</th><th class="n">Gastos</th><th class="n">Pedidos</th></tr>
      ${w.days.map((d) => `<tr><td>${dn(d.day)}</td><td class="n">${d.n}</td><td class="n">${money(d.total)}</td>
        <td style="width:25%"><div class="bar"><i style="width:${Math.round(d.total / max * 100)}%"></i></div></td>
        <td class="n">${money(d.profit)}</td><td class="n">${money(d.impl)}</td><td class="n">${money(d.ped)}</td></tr>`).join('')}</table></div>
      <div class="card tw"><h3>Más vendidos de la semana</h3>${w.top.length ? `<table><tr><th>Producto</th><th class="n">Cant.</th><th class="n">Total</th></tr>${w.top.map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td><td class="n">${money(p.total)}</td></tr>`).join('')}</table>` : '<span class="mute">Sin ventas.</span>'}</div>
      <div class="card"><h3>Ventas por hora</h3>
        <div class="seg" style="margin-bottom:.8rem"><button id="hp1" onclick="A.hours('week')">Esta semana</button><button id="hp2" onclick="A.hours(30)">30 días</button><button id="hp3" onclick="A.hours(90)">90 días</button></div>
        <div id="hours"></div></div>
      <div class="card"><h3>Extracto para rendición de cuentas (CSV)</h3>
        <p class="mute">Descarga todos los movimientos del rango: ventas, retiros, gastos, ajustes, aperturas y cierres de caja. Se abre directo en Excel.</p>
        <div class="row"><div><label>Desde</label><input id="xf" type="date" value="${w.start}"></div>
        <div><label>Hasta</label><input id="xt" type="date" value="${w.end}"></div></div>
        <p><button class="btn" onclick="A.exportCsv()">⬇ Descargar CSV</button></p></div>`;
    A.hours('week');
  },

  async actividad() {
    S.aq ??= '';
    const rows = await api('/audit?q=' + encodeURIComponent(S.aq));
    $('#main').innerHTML = `<h2>Actividad</h2>
      <p class="mute">Quién hizo qué: ventas, anulaciones, cambios de productos y stock, ajustes de dinero, usuarios y más. Se muestran los últimos 300 movimientos.</p>
      <div class="row"><input id="aq" placeholder="Buscar por persona, acción o detalle…" value="${esc(S.aq)}" onkeydown="if(event.key==='Enter')A.auditSearch()"><button class="btn sm" style="flex:0 0 auto" onclick="A.auditSearch()">Buscar</button></div>
      <div class="card tw" style="margin-top:1rem"><table><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr>
      ${rows.map((r) => `<tr><td style="white-space:nowrap">${dt(r.created_at)}</td><td>${esc(r.user_name)}</td><td><span class="tag">${esc(r.action)}</span></td><td>${esc(r.detail || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">Sin actividad.</td></tr>'}</table></div>`;
  },

  async chat() {
    S.peer = S.peer || 0; S.chat = [];
    $('#main').innerHTML = `<div class="chatwrap"><div class="card chatside" id="chatside"></div>
      <div class="card"><h3 id="chattitle"></h3><div id="chatlist" class="chatlist"></div>
      <div class="row" style="margin-top:.6rem"><div style="flex:1"><input id="cm" maxlength="500" placeholder="Escribe un mensaje…" onkeydown="if(event.key==='Enter')A.say()"></div>
      <div><button class="btn" onclick="A.say()">Enviar</button></div></div></div></div>`;
    A.chatTitle();
    await chatPoll();
  },
  horario() {
    const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];
    const H = [['Tere', 'Murillo', 'Felipe', 'Murillo', 'Juan'], ['Tere', 'Murillo', 'Felipe', 'Murillo', 'Santiago'],
      ['Juan', 'Jhon', 'Soto', 'Jhon', 'Juan'], ['Arnold', 'Jhon', 'Soto', 'Jhon', 'Soto'],
      ['Murillo', 'Soto', 'Diego', 'Jhon', 'Diego'], ['Paula', 'Soto', 'Tere', 'Felipe', 'Diego'],
      ['Paula', 'Juan', 'Santiago', 'Felipe', 'Majo'], ['Paula', 'Juan', 'Santiago', 'Felipe', 'Majo'],
      ['Paula', 'Arnold', 'Santiago', 'Diego', 'Arnold'], ['Paula', 'Arnold', 'Santiago', 'Diego', 'Arnold']];
    const ASEO = ['Majo / Arnold', 'Soto / Paula', 'Santiago / Felipe', 'Jhon / Diego', 'Murillo / Juan'];
    const f = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const d = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(f.weekday), r = Number(f.hour) - 8;
    const lbl = (i) => { const h = (n) => String((n - 1) % 12 + 1).padStart(2, '0') + ':00'; return `${h(8 + i)} - ${h(9 + i)}`; };
    const now = d >= 0 && r >= 0 && r < H.length ? `Ahora (${lbl(r)}): <b>${esc(H[r][d])}</b>` : 'Fuera del horario de atención.';
    $('#main').innerHTML = `<div class="card"><h3>Horario de atención</h3><p>${now}</p>
      <div class="tw"><table><tr><th>Horario</th>${DIAS.map((x, i) => `<th${i === d ? ' style="background:var(--ice)"' : ''}>${x}</th>`).join('')}</tr>
      ${H.map((row, i) => `<tr><td><b>${lbl(i)}</b></td>${row.map((n, j) => `<td style="${j === d ? 'background:var(--ice);' : ''}${i === r && j === d ? 'background:var(--brand);color:#fff;font-weight:700' : ''}">${esc(n)}</td>`).join('')}</tr>`).join('')}
      <tr><td><b>ASEO</b></td>${ASEO.map((n, j) => `<td style="font-weight:600;${j === d ? 'background:var(--ice)' : ''}">${esc(n)}</td>`).join('')}</tr></table></div></div>`;
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
    <td>${s.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}</td><td>${s.method === 'mixto' ? `mixto<br><small class="mute">ef ${money(s.cash_amount)} · nq ${money(s.nequi_amount)}</small>` : s.method}</td><td class="n">${money(s.total)}</td>
    <td class="n">${canVoid && !s.voided ? `<button class="btn sec sm" onclick="A.voidSale(${s.id})">Anular</button>` : (s.voided ? '<span class="tag err">Anulada</span>' : '')}</td></tr>`).join('')}</table>`;
}

// ---------- Acciones ----------
const A = window.A = {
  async logout() { await api('/logout', 'POST'); S.view = null; S.cart = []; S.benefit = null; clearInterval(S.chatTimer); S.chat = []; S.peer = 0; S.chatUsers = null; boot(); },
  password() {
    modal(`<h3>Cambiar contraseña</h3><label>Actual</label><input id="p0" type="password"><label>Nueva (mín. 6)</label><input id="p1" type="password">
      <p><button class="btn" onclick="A.savePassword()">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async savePassword() {
    if (await act(() => api('/password', 'POST', { current: val('p0'), password: val('p1') }), 'Contraseña actualizada')) { closeModal(); boot(); }
  },


  // Reportes
  week(d) {
    const t = new Date(S.week + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + d);
    S.week = t.toISOString().slice(0, 10); views.reportes();
  },
  async hours(p) {
    [1, 2, 3].forEach((i) => $('#hp' + i)?.classList.toggle('on', (i === 1 && p === 'week') || (i === 2 && p === 30) || (i === 3 && p === 90)));
    let from = S.week, to;
    const iso = (t) => t.toISOString().slice(0, 10);
    if (p === 'week') { const e = new Date(S.week + 'T12:00:00Z'); e.setUTCDate(e.getUTCDate() + 6); to = iso(e); }
    else { const n = new Date(Date.now() - 5 * 36e5); to = iso(n); n.setUTCDate(n.getUTCDate() - p + 1); from = iso(n); }
    const r = await act(() => api(`/reports/hours?from=${from}&to=${to}`));
    if (!r || !$('#hours')) return;
    const bars = (rows, mx) => rows.map((x) => `<div class="hb"><span>${x.l}</span><div class="bar"><i style="width:${Math.round(x.total / mx * 100)}%"></i></div><b>${x.n ? x.n + ' · ' + money(x.total) : '—'}</b></div>`).join('');
    const hrs = Array.from({ length: 24 }, (_, h) => ({ l: `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`, ...(r.hours.find((x) => x.h === h) || { n: 0, total: 0 }) }));
    const used = hrs.filter((x, h) => x.n || (h >= 6 && h <= 22));
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((l, i) => ({ l, ...(r.dows.find((x) => x.d === i + 1) || { n: 0, total: 0 }) }));
    const best = hrs.reduce((a, b) => (b.total > a.total ? b : a), hrs[0]);
    $('#hours').innerHTML = `${best.total ? `<p>🔥 Hora más fuerte: <b>${best.l}</b> (${best.n} ventas · ${money(best.total)})</p>` : '<span class="mute">Sin ventas en este periodo.</span>'}
      ${bars(used, Math.max(1, ...used.map((x) => x.total)))}<h3 style="margin-top:1rem">Por día de la semana</h3>${bars(days, Math.max(1, ...days.map((x) => x.total)))}`;
  },
  exportCsv() {
    const f = val('xf'), t = val('xt');
    if (!f || !t) return toast('Elige las fechas');
    if (t < f) return toast('La fecha final es anterior a la inicial');
    location.href = `/api/export.csv?from=${f}&to=${t}`;
  },
  auditSearch() { S.aq = val('aq'); views.actividad(); },

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
    const words = norm(S.q).split(/\s+/).filter(Boolean);
    const list = S.prods.filter((p) => (S.cat === 'all' || (p.category || 'Sin categoría') === S.cat)
      && words.every((w) => norm(p.name + ' ' + (p.category || '')).includes(w)));
    $('#grid').innerHTML = list.map((p) => `<button class="prod" ${p.track_stock && p.stock <= 0 ? 'disabled' : ''} onclick="A.add(${p.id})">
      ${p.photo ? `<img loading="lazy" src="${photoUrl(p)}" alt="">` : ''}<b>${esc(p.name)}</b>${money(p.sell_price)}<br><small>${p.track_stock ? p.stock + ' disp.' : 'sin control de stock'}</small></button>`).join('') || '<span class="mute">Sin resultados.</span>';
  },
  add(id) {
    const p = S.prods.find((x) => x.id === id), c = S.cart.find((x) => x.id === id);
    if (c) { if (!p.track_stock || c.qty < p.stock) c.qty++; else toast('No hay más stock'); } else S.cart.push({ id, qty: 1 });
    A.cart();
  },
  chg(id, d) {
    const c = S.cart.find((x) => x.id === id), p = S.prods.find((x) => x.id === id);
    c.qty += d;
    if (p.track_stock && c.qty > p.stock) { c.qty = p.stock; toast('No hay más stock'); }
    if (c.qty <= 0) S.cart = S.cart.filter((x) => x.id !== id);
    A.cart();
  },
  cart() {
    if (S.benefit && !S.cart.find((c) => c.id === S.benefit.product_id)) S.benefit = null;
    const total = S.cart.reduce((t, c) => t + c.qty * S.prods.find((p) => p.id === c.id).sell_price, 0)
      - (S.benefit ? S.prods.find((p) => p.id === S.benefit.product_id).sell_price - S.prods.find((p) => p.id === S.benefit.product_id).benefit_price : 0);
    $('#cart').innerHTML = (S.cart.length ? `<table>${S.cart.map((c) => {
      const p = S.prods.find((x) => x.id === c.id);
      return `<tr><td>${esc(p.name)}<br><small class="mute">${money(p.sell_price)}</small></td>
        <td><div class="qty"><button onclick="A.chg(${c.id},-1)">−</button>${c.qty}<button onclick="A.chg(${c.id},1)">+</button></div></td>
        <td class="n">${money(c.qty * p.sell_price)}</td></tr>` +
        (p.benefit_price !== undefined ? `<tr><td colspan="3">${S.benefit && S.benefit.product_id === c.id
          ? `<small>🎁 Beneficio: <b>${esc(S.benefit.name)}</b> · 1 a ${money(p.benefit_price)}</small> <button class="btn sec sm" onclick="S.benefit=null;A.cart()">Quitar</button>`
          : (S.benefit ? '' : `<button class="btn sec sm" onclick="A.benefit(${c.id})">🎁 Beneficio (precio de compra)</button>`)}</td></tr>` : '');
    }).join('')}</table>` : '<span class="mute">Toca un producto para agregarlo.</span>') +
      `<p class="total">${money(total)}</p>
      <div class="seg"><button class="${S.method === 'efectivo' ? 'on' : ''}" onclick="S.method='efectivo';A.cart()">💵 Efectivo</button>
      <button class="${S.method === 'nequi' ? 'on' : ''}" onclick="S.method='nequi';A.cart()">📱 Nequi</button>
      <button class="${S.method === 'mixto' ? 'on' : ''}" onclick="S.method='mixto';A.cart()">🔀 Mixto</button></div>
      ${S.method === 'mixto' ? `<label>Pagó por Nequi</label><input id="nq" type="number" inputmode="numeric" min="1" value="${S.nq || ''}" oninput="S.nq=this.value;A.mix(${total})">
      <p id="mix" class="mute"></p>` : ''}
      <p><button class="btn" style="width:100%" ${S.cart.length ? '' : 'disabled'} onclick="A.sell()">Registrar venta</button></p>
      ${S.cart.length ? '<button class="btn sec sm" onclick="S.cart=[];S.benefit=null;A.cart()">Vaciar</button>' : ''}`;
  },
  benefit(pid) {
    modal(`<h3>🎁 Beneficio de empanada</h3><p class="mute">La primera empanada del día de cada persona se vende al precio de compra. Solo una vez al día por persona.</p>
      <label>Nombre de la persona</label><input id="bu" maxlength="60" onkeydown="if(event.key==='Enter')A.setBenefit(${pid})">
      <p><button class="btn" onclick="A.setBenefit(${pid})">Aplicar</button></p>`);
  },
  setBenefit(pid) {
    const name = val('bu').trim().replace(/\s+/g, ' ');
    if (!name) return toast('Escribe el nombre de la persona');
    S.benefit = { name, product_id: pid };
    closeModal(); A.cart();
  },
  chatTitle() {
    const u = S.chatUsers && S.chatUsers.users.find((x) => x.id === S.peer);
    const t = $('#chattitle'); if (t) t.textContent = S.peer ? '💬 ' + (u ? u.name : 'Mensaje privado') : '👥 Equipo (todos)';
  },
  async openChat(id) {
    S.peer = id; S.chat = [];
    A.chatTitle(); chatPaintSide(); chatPaintList();
    await chatPoll(); chatPaintDot();
    const f = $('#cm'); if (f) f.focus();
  },
  async say() {
    const body = val('cm').trim();
    if (!body) return;
    $('#cm').value = '';
    const m = await act(() => api('/chat', 'POST', { body, to: S.peer }));
    if (m) { await chatPoll(); const b = $('#chatlist'); if (b) b.scrollTop = b.scrollHeight; }
    $('#cm').focus();
  },
  mix(total) {
    const nq = Number(S.nq) || 0;
    $('#mix').innerHTML = nq > 0 && nq < total ? `Efectivo: <b>${money(total - nq)}</b> · Nequi: <b>${money(nq)}</b>` : 'El monto por Nequi debe ser menor al total.';
  },
  async sell() {
    const r = await act(() => api('/sales', 'POST', { method: S.method, nequi_amount: S.method === 'mixto' ? Number(S.nq) || 0 : undefined, items: S.cart.map((c) => ({ product_id: c.id, qty: c.qty })),
      benefit: S.benefit ? { name: S.benefit.name, product_id: S.benefit.product_id } : undefined }));
    if (r) { S.cart = []; S.benefit = null; S.nq = ''; toast('Venta registrada: ' + money(r.total)); views.vender(); }
  },
  wdFee() {
    const a = Number(val('wa')) || 0;
    $('#wf').value = a > 0 ? Math.ceil(a / 50000) * 500 : 0;
  },
  async withdraw() {
    const a = Number(val('wa')), f = Number(val('wf')), m = val('wm');
    if (!(a > 0)) return toast('Escribe el monto');
    const recibe = m === 'nequi' ? a + f : a;
    if (!confirm(`Entrega ${money(a)} en efectivo.\nDebes haber recibido ${money(recibe)} por Nequi${m === 'efectivo' ? ` y ${money(f)} en efectivo de comisión` : ''}.\n¿Registrar?`)) return;
    if (await act(() => api('/withdrawals', 'POST', { amount: a, fee: f, fee_method: m }), 'Retiro registrado')) views.vender();
  },
  async voidWd(id) {
    if (confirm('¿Anular este retiro? El dinero se revierte.') && await act(() => api(`/withdrawals/${id}/void`, 'POST'), 'Retiro anulado')) views.vender();
  },
  async voidSale(id) {
    if (!confirm('¿Anular esta venta? El stock y el dinero se revierten.')) return;
    if (await act(() => api(`/sales/${id}/void`, 'POST'), 'Venta anulada')) boot();
  },

  // Productos
  invRows() {
    const words = norm(val('iq')).split(/\s+/).filter(Boolean);
    const list = S.prods.filter((p) => words.every((w) => norm(p.name + ' ' + (p.category || '')).includes(w)));
    $('#irows').innerHTML = list.map((p) => `<tr><td>${p.photo ? `<img class="thumb" loading="lazy" src="${photoUrl(p)}" alt="">` : ''}${esc(p.name)}</td>
      <td>${esc(p.category || '—')}</td><td class="n">${money(p.sell_price)}</td>
      <td class="n ${p.track_stock && p.stock <= p.min_stock ? 'err' : ''}"><b>${p.track_stock ? p.stock : '—'}</b></td></tr>`).join('')
      || '<tr><td colspan="4" class="mute">Sin resultados.</td></tr>';
  },
  async pickPhoto(inp) {
    if (!inp.files[0]) return;
    try { S.photo = await shrink(inp.files[0]); } catch (e) { return toast('No se pudo leer la imagen'); }
    const im = $('#pimg'); im.src = S.photo; im.style.display = '';
  },
  rmPhoto() { S.photo = 'remove'; $('#pimg').style.display = 'none'; },
  productForm(id) {
    S.photo = undefined;
    const p = id ? S.prods.find((x) => x.id === id) : { name: '', category_id: '', buy_price: '', sell_price: '', min_stock: 0, active: 1, track_stock: 1 };
    modal(`<h3>${id ? 'Editar' : 'Nuevo'} producto</h3>
      <label>Foto (opcional)</label>
      <img id="pimg" class="pprev" ${p.photo ? `src="${photoUrl(p)}"` : 'style="display:none"'} alt="">
      <input id="pf" type="file" accept="image/*" onchange="A.pickPhoto(this)">
      ${p.photo ? '<a href="#" onclick="A.rmPhoto();return false" class="mute">Quitar foto</a>' : ''}
      <label>Nombre</label><input id="pn" value="${esc(p.name)}">
      <label>Categoría</label><select id="pc"><option value="">Sin categoría</option>${S.cats.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <div class="row"><div><label>Precio de compra</label><input id="pb" type="number" inputmode="numeric" min="0" value="${p.buy_price}"></div>
      <div><label>Precio de venta</label><input id="ps" type="number" inputmode="numeric" min="0" value="${p.sell_price}"></div></div>
      <label><input type="checkbox" id="pt" style="width:auto" ${p.track_stock ? 'checked' : ''} onchange="$('#stk').style.display=this.checked?'':'none'"> Controlar stock</label>
      <p class="mute" style="margin:0">Desmárcalo para cosas como el vaso de gaseosa del combo: siempre se puede vender y solo registra el dinero.</p>
      <div class="row" id="stk" style="${p.track_stock ? '' : 'display:none'}">${id ? '' : '<div><label>Cantidad inicial</label><input id="pq" type="number" min="0" value="0"></div>'}
      <div><label>Avisar si stock ≤</label><input id="pm" type="number" min="0" value="${p.min_stock}"></div></div>
      ${id ? `<label><input type="checkbox" id="pa" style="width:auto" ${p.active ? 'checked' : ''}> Activo (visible para vender)</label>` : ''}
      <p><button class="btn" onclick="A.saveProduct(${id || 0})">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async saveProduct(id) {
    const body = { name: val('pn'), category_id: val('pc'), buy_price: val('pb'), sell_price: val('ps'), min_stock: val('pm'), track_stock: $('#pt').checked };
    if (id) body.active = $('#pa').checked; else body.stock = val('pq');
    const r = await act(() => api(id ? `/products/${id}` : '/products', id ? 'PUT' : 'POST', body), 'Guardado');
    if (!r) return;
    const pid = id || r.id;
    if (S.photo === 'remove') await act(() => api(`/products/${pid}/photo`, 'DELETE'));
    else if (S.photo) await act(() => api(`/products/${pid}/photo`, 'PUT', { image: S.photo }));
    S.photo = undefined; closeModal(); boot();
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

  kind(k) {
    S.kind = k;
    $('#k1').classList.toggle('on', k === 'pedido'); $('#k2').classList.toggle('on', k === 'implementos');
    $('#gcw').style.display = k === 'pedido' ? '' : 'none';
    $('#gdl').textContent = k === 'pedido' ? 'Nota (opcional)' : 'Descripción (ej. paquete de vasos)';
    $('#kh').textContent = k === 'pedido' ? 'Pago a un proveedor por un pedido. No hace falta detallar cantidades: eso va en Productos → + Stock.'
      : 'Cucharas, vasos, servilletas y todo lo que se gasta pero no genera ganancia directa.';
  },
  async addExpense() {
    let desc = val('gd').trim();
    if (S.kind === 'pedido') { const c = val('gc'); desc = ['Pedido ' + (c || 'proveedor'), desc].filter(Boolean).join(' · '); }
    const body = { kind: S.kind, description: desc, amount: val('ga'), method: val('gm') };
    if (await act(() => api('/expenses', 'POST', body), 'Gasto registrado')) boot();
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
      ${s.wd_count ? `<p>Retiros por Nequi: <b>${s.wd_count}</b> · entregado ${money(s.wd_amount)} · comisiones ${money(s.wd_fees)}</p>` : ''}
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
