const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Minúsculas y sin tildes, para que la búsqueda no sea exacta
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const photoUrl = (p) => `/api/products/${p.id}/photo?v=${p.photo}`;
// Avatar: foto de perfil o, si no tiene, la inicial del nombre
const initialOf = (name) => esc(Array.from((name || '?').trim())[0] || '?').toUpperCase();
// zoom: al tocarlo se abre la foto en grande (ver el listener al final del archivo)
const avatar = (u, cls = '', zoom = false) => {
  const z = zoom && u.id ? ` data-zoom="${u.id}" data-name="${esc(u.name)}" data-v="${u.photo || ''}" title="Ver foto"` : '';
  return u.photo ? `<img class="av ${cls}"${z} src="/api/users/${u.id}/photo?v=${u.photo}" alt="">` : `<b class="av ${cls}"${z}>${initialOf(u.name)}</b>`;
};
// Reduce la foto a un cuadrado de 240px (JPEG) para que pese pocos KB
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), N = 240;
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  cv.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, N, N);
  return cv.toDataURL('image/jpeg', 0.8);
}
// Sticker: cabe en 160px conservando proporción y transparencia (WebP o PNG) para que pese pocos KB
async function shrinkSticker(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 160 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  const out = cv.toDataURL('image/webp', 0.85);
  return out.startsWith('data:image/webp') ? out : cv.toDataURL('image/png');
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

const S = { user: null, view: null, chat: [], peerRead: 0, peer: null, chatOpen: false, cart: [], benefit: null, method: 'efectivo', cat: 'all', q: '' };
const ADMIN_TABS = [['resumen', 'Resumen'], ['vender', 'Vender'], ['caja', 'Mi caja'], ['prestamos', 'Préstamo de implementos'], ['productos', 'Productos'], ['dinero', 'Dinero'], ['emprendimientos', 'Emprendimientos'], ['gastos', 'Gastos'], ['pedidos', 'Pedidos'], ['reportes', 'Reportes'], ['rentabilidad', 'Rentabilidad emprend.'], ['turnos', 'Turnos'], ['horario', 'Horario'], ['actividad', 'Actividad'], ['usuarios', 'Usuarios']];
const TURNO_TABS = [['resumen', 'Resumen'], ['caja', 'Caja'], ['vender', 'Vender'], ['prestamos', 'Préstamo de implementos'], ['inventario', 'Productos'], ['pedidos', 'Pedidos'], ['turnos', 'Mis turnos'], ['horario', 'Horario']];
// Menú lateral: grupos de vistas (las que el rol no tenga se omiten)
const NAV_GROUPS = [['Principal', ['resumen']], ['Ventas', ['vender', 'caja', 'prestamos']], ['Inventario', ['productos', 'inventario', 'emprendimientos']], ['Finanzas', ['dinero', 'gastos', 'pedidos', 'reportes', 'rentabilidad']], ['Equipo', ['turnos', 'horario', 'actividad', 'usuarios']]];
const ICONS = {
  resumen: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  vender: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 7H6"/>',
  prestamos: '<path d="M7 7h13l-3-3M17 17H4l3 3"/><path d="M20 7v3M4 17v-3"/>',
  caja: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h3"/>',
  productos: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  inventario: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  emprendimientos: '<path d="M3 9 4.5 4h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v8h14v-8"/>',
  dinero: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9a2.8 2.8 0 0 0-2.8-1.5c-1.7 0-2.8.9-2.8 2.1s1.1 1.8 2.8 2.4 2.8 1.2 2.8 2.4-1.1 2.1-2.8 2.1A2.8 2.8 0 0 1 9.2 15M12 6v1.5M12 16.5V18"/>',
  pedidos: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  gastos: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  rentabilidad: '<path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/>',
  reportes: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  turnos: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  horario: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  actividad: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.5 4 5"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  clave: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  ojo: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoOff: '<path d="M17.9 17.9A10.5 10.5 0 0 1 12 19c-6.4 0-10-7-10-7a17.6 17.6 0 0 1 4.1-5M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  estrella: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
  sonrisa: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2.5 4 2.5S16 14 16 14M9 9.5h.01M15 9.5h.01"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  regalo: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M7.5 8C5 8 5 4 8 4c2 0 4 4 4 4s2-4 4-4c3 0 3 4.5.5 4"/>',
  mezcla: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  imagen: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
  camion: '<path d="M2 6h11v11H2zM13 10h4l4 4v3h-8"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  descarga: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  colapsar: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>'
};
const icon = (k) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
function sideHTML(tabs) {
  const label = Object.fromEntries(tabs);
  let i = 0;
  const groups = NAV_GROUPS.map(([g, ks]) => {
    const items = ks.filter((k) => label[k]).map((k) => `<button class="${k === S.view ? 'on' : ''}" data-k="${k}" style="--i:${i++}" onclick="go('${k}')" title="${esc(label[k])}">${icon(k)}<span>${esc(label[k])}</span></button>`).join('');
    return items ? `<div class="grp"><em>${g}</em>${items}</div>` : '';
  }).join('');
  return `<div class="side-head"><img src="/logo.png" alt="ACEIS"><i>La Plancha</i>
      <button class="side-col" onclick="A.sideCollapse()" aria-label="Contraer menú" title="Contraer / expandir">${icon('colapsar')}</button></div>
    <div class="side-nav">${groups}</div>
    <div class="side-foot"><div class="me" onclick="A.profile()" title="Cambiar foto de perfil">${avatar(S.user)}<span>${esc(S.user.name)}<small>${S.user.role === 'admin' ? 'Administrador' : 'Turno'}</small></span></div>
      <button onclick="A.profile()" title="Mi perfil">${icon('usuarios')}<span>Mi perfil</span></button>
      <button onclick="A.logout()" title="Salir">${icon('salir')}<span>Salir</span></button></div>`;
}

// Stock bajo dividido por categorías, igual que los más vendidos
function lowStock(low) {
  if (!low.length) return '<span class="mute">Todo bien.</span>';
  const g = low.reduce((m, p) => ((m[p.category || 'Sin categoría'] ||= []).push(p), m), {});
  return Object.entries(g).map(([c, ps]) => `<h4 style="margin:.6rem 0 .2rem">${esc(c)} <span class="tag ${ps.some((p) => p.stock === 0) ? 'err' : 'warn'}">${ps.length}</span></h4>
    <table>${ps.map((p) => `<tr><td>${esc(p.name)}</td><td class="n ${p.stock === 0 ? 'err' : 'warn'}">${p.stock === 0 ? 'Agotado' : p.stock + ' uds'}</td></tr>`).join('')}</table>`).join('');
}
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
  if (!S.user) { clearInterval(S.chatTimer); S.chatOpen = false; S.peer = null; S.chat = []; chatShell(); return loginView(); }
  const tabs = S.user.role === 'admin' ? ADMIN_TABS : S.user.can_emp ? [...TURNO_TABS, ['emprendimientos', 'Emprendimientos'], ['rentabilidad', 'Rentabilidad emprend.']] : TURNO_TABS;
  try { const rv = sessionStorage.getItem('reloadView'); if (rv) { sessionStorage.removeItem('reloadView'); if (!S.view) S.view = rv; } } catch {} // tras una actualización automática, vuelve a la misma vista
  if (!S.view || !tabs.find((t) => t[0] === S.view)) S.view = tabs[0][0];
  const first = !$('.shell');
  if (first) {
    $('#app').innerHTML = `<div class="shell ${lsGet('side-col') === '1' ? 'col' : ''}">
      <div class="scrim" onclick="A.sideClose()"></div>
      <aside class="side"></aside>
      <div class="content">
        <div class="top"><button class="burger" onclick="A.sideOpen()" aria-label="Abrir menú">${icon('menu')}</button><h1 id="ttl"></h1><span class="sp"></span>
          <small id="tme" onclick="A.profile()">${avatar(S.user)}<span>${esc(S.user.name)} · ${S.user.role === 'admin' ? 'Admin' : 'Turno'}</span></small></div>
        <main id="main"></main>
      </div></div>`;
  }
  $('.side').innerHTML = sideHTML(tabs);
  $('#ttl').textContent = (tabs.find((t) => t[0] === S.view) || [, ''])[1];
  document.querySelector('.shell').classList.remove('open');
  if (first) setTimeout(() => { const sh = $('.shell'); if (sh) sh.classList.add('seen'); }, 900);
  else $('.shell').classList.add('seen');
  await views[S.view]();
  chatShell(); chatStart();
  if (S.user.must_change) $('#main').insertAdjacentHTML('afterbegin',
    '<div class="alert bad">Estás usando la contraseña por defecto. <a href="#" onclick="A.password();return false">Cámbiala ahora</a>.</div>');
}
// Chat: ventana flotante abajo a la derecha. S.peer = null (lista de perfiles), 0 (sala del equipo) o id de usuario (privado).
// Se consulta cada 5 s; el contador del botón avisa de mensajes sin leer en cualquier conversación.
const inChat = () => S.chatOpen && S.peer !== null && $('#chatlist');
const lastChatId = () => (S.chat.length ? S.chat[S.chat.length - 1].id : 0);
const EMOJIS = '😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😅 😢 😭 😡 🥳 😴 🙄 😬 🤗 👍 👎 👏 🙌 🙏 💪 👋 🤝 ✌️ 👌 🔥 ⭐ ❤️ 💙 💯 🎉 🎁 ✅ ❌ ⚠️ 💸 💵 📱 🍔 🍟 🥟 🥤 🍫 🍦 🍕 ☕ 🧹 🧾 📦 ⏰ 📌 👀 🚀'.split(' ');
const peerName = () => (S.peer === 0 ? 'Equipo (todos)' : ((S.chatUsers && S.chatUsers.users.find((x) => x.id === S.peer)) || { name: 'Mensaje privado' }).name);
// cabecera de una conversación: foto y nombre de con quién hablas
function peerHead() {
  const u = S.peer ? (S.chatUsers && S.chatUsers.users.find((x) => x.id === S.peer)) : null;
  return (S.peer === 0 ? `<b class="av sm">${icon('usuarios')}</b>` : avatar(u || { id: S.peer, name: peerName() }, 'sm', true)) + esc(peerName());
}
function chatShell() {
  let w = $('#cw');
  if (!S.user) { if (w) w.remove(); return; }
  if (w) return;
  w = document.createElement('div'); w.id = 'cw'; document.body.appendChild(w);
  chatDraw();
}
function chatDraw() {
  const w = $('#cw'); if (!w) return;
  if (!S.chatOpen) {
    w.innerHTML = '<button class="cw-btn" onclick="A.chatToggle()"><img class="cwi" src="/chaticon.png" alt="">Chat<b class="badge" id="cwbadge" hidden></b></button>';
    chatPaintBadge(); return;
  }
  w.innerHTML = `<div class="cw-panel"><div class="cw-head">${S.peer === null ? '' : '<button onclick="A.chatBack()" aria-label="Volver">←</button>'}
    <b class="cwt">${S.peer === null ? '<img class="cwi" src="/chaticon.png" alt="">Chat' : peerHead()}</b><button onclick="A.chatToggle()" aria-label="Cerrar">✕</button></div>
    ${S.peer === null ? '<div id="chatside" class="cw-list"></div>'
      : `<div id="chatlist" class="chatlist"></div><div id="cwpick" class="cw-pick" hidden></div><div class="cw-send"><button class="cw-ic" onclick="A.pick()" aria-label="Emojis y stickers">${icon('sonrisa')}</button><input id="cm" maxlength="500" autocomplete="off" placeholder="Escribe un mensaje…" onkeydown="if(event.key==='Enter')A.say()"><button class="cw-go" onclick="A.say()" aria-label="Enviar"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></button></div>`}</div>`;
  chatPaintSide(); chatPaintList();
  const f = $('#cm'); if (f) f.focus();
}
function chatPaintSide() {
  const side = $('#chatside'); if (!side || !S.chatUsers) return;
  const row = (id, name, n, photo) => `<button onclick="A.openChat(${id})"><span class="crow">${id ? avatar({ id, name, photo }, 'sm') : `<b class="av sm">${icon('usuarios')}</b>`}${esc(name)}</span>${n ? `<b class="badge">${n}</b>` : ''}</button>`;
  side.innerHTML = row(0, 'Equipo (todos)', S.chatUsers.general) + S.chatUsers.users.map((u) => row(u.id, u.name, u.unread, u.photo)).join('');
}
function chatPaintBadge() {
  const d = $('#cwbadge'); if (!d || !S.chatUsers) return;
  const n = S.chatUsers.general + S.chatUsers.users.reduce((t, u) => t + u.unread, 0);
  d.hidden = !n; d.textContent = n;
}
function chatPaintList() {
  const box = $('#chatlist'); if (!box) return;
  const bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const day = (m) => new Date(m.created_at).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' });
  box.innerHTML = S.chat.map((m, i) => {
    const mine = m.user_id === S.user.id, prev = S.chat[i - 1], next = S.chat[i + 1];
    const newDay = !prev || day(prev) !== day(m);
    const first = newDay || prev.user_id !== m.user_id || new Date(m.created_at) - new Date(prev.created_at) > 5 * 6e4;
    const last = !next || next.user_id !== m.user_id || day(next) !== day(m) || new Date(next.created_at) - new Date(m.created_at) > 5 * 6e4;
    const time = dt(m.created_at).split(', ').pop();
    const seen = mine && S.peer ? `<span class="seen">${m.id <= S.peerRead ? '✓✓' : '✓'}</span>` : '';
    const body = m.sticker_id ? `<img class="stk" src="/api/stickers/${m.sticker_id}/img" alt="sticker">` : `<div class="mt">${m.body ? esc(m.body) : '<i class="mute">sticker eliminado</i>'}</div>`;
    return (newDay ? `<div class="dsep"><span>${esc(day(m))}</span></div>` : '')
      + `<div class="mrow ${mine ? 'me' : ''} ${first ? 'first' : ''} ${last ? 'last' : ''}">${mine ? '' : last ? avatar({ id: m.user_id, name: m.user_name, photo: m.photo }, 'sm', true) : '<span class="avgap"></span>'}`
      + `<div class="msg ${mine ? 'me' : ''}">${!mine && first && !S.peer ? `<small class="who">${esc(m.user_name)}</small>` : ''}${body}<small class="tm">${time}${seen}</small></div></div>`;
  }).join('')
    || '<div class="cempty"><span>Aún no hay mensajes</span><small>¡Escribe el primero!</small></div>';
  if (bottom) box.scrollTop = box.scrollHeight;
}
async function chatPoll() {
  if (!S.user) return;
  try {
    const peer = S.peer, last = lastChatId();
    const [sum, res] = await Promise.all([api('/chat/users'),
      inChat() ? api(`/chat?with=${peer}${last ? '&after=' + last : ''}`) : null]);
    S.chatUsers = sum;
    if (res && peer === S.peer && inChat()) {
      const fresh = res.rows.filter((m) => m.id > lastChatId());
      const seenChanged = res.peer_read !== S.peerRead;
      S.peerRead = res.peer_read;
      if (fresh.length) S.chat = S.chat.concat(fresh);
      if (fresh.length || seenChanged) chatPaintList();
      if (fresh.length || !last) { const b = $('#chatlist'); if (!last && b) b.scrollTop = b.scrollHeight; api('/chat/read', 'POST', { with: peer }).catch(() => {}); }
      // lo que se está leyendo ahora no cuenta como pendiente
      if (peer === 0) sum.general = 0; else { const u = sum.users.find((x) => x.id === peer); if (u) u.unread = 0; }
    }
    chatPaintSide(); chatPaintBadge();
  } catch {}
}
function chatStart() {
  clearInterval(S.chatTimer);
  if (!S.user) return;
  chatPoll();
  S.chatTimer = setInterval(chatPoll, 5000);
}
window.go = (v) => { S.view = v; boot(); };

// Sami en el login: baila solo; mira al usuario mientras escribe su nombre, se tapa los ojos con la
// contraseña y, si se muestra con el ojito, se tapa solo un ojo y espía
// Coreografía: ciclo de 8 pasos (110 ms c/u) en el sitio, mirando a un lado y luego al otro, con remates felices
const SAMI_STEPS = Array.from({ length: 8 }, (_, i) => 'w' + (i + 1));
const SAMI_PLAN = [1, -1].flatMap((side) => [
  ...SAMI_STEPS.concat(SAMI_STEPS).map((n) => [n, side, 110]),
  ['happy', 1, 260], ['jump', 1, 340], ['happy', 1, 260], [side === 1 ? 'right' : 'left', 1, 280], ['blink', 1, 200],
]);
function danceSami() {
  const img = $('#hero'); if (!img) return;
  const hero = $('.hero'), user = $('#lu'), pass = $('#lp');
  ['sr', 'cf', 'pf', 'right', 'sad', 'sf', ...SAMI_STEPS, 'happy', 'jump', 'left', 'blink'].forEach((n) => { new Image().src = `/sami/hd/${n}.png`; });
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, pose = null, noticed = false, hold = 0;
  const show = (n, flip = 1) => { if (img.dataset.n !== n) { img.dataset.n = n; img.src = `/sami/hd/${n}.png`; } img.style.transform = flip === 1 ? '' : `scaleX(${flip})`; };
  window.samiPose = (p, ms = 0) => { hold = ms ? Date.now() + ms : 0; pose = p; paint(); };
  const state = () => {
    if (hold > Date.now()) return pose;
    if (document.activeElement === pass) return pass.type === 'text' ? 'peek' : 'cover';
    if (document.activeElement === user) return 'watch';
    return null;
  };
  const paint = () => {
    const st = hold > Date.now() ? pose : state();
    hero.classList.toggle('calm', !!st);
    if (st === 'cover') show('cf'); else if (st === 'peek') show('pf');
    else if (st === 'watch') show(noticed ? 'right' : 'sr');
    else if (st === 'sad') show('sad'); else if (st === 'happy') show('happy');
  };
  user.addEventListener('focus', () => { noticed = false; paint(); setTimeout(() => { noticed = true; paint(); }, 700); });
  user.addEventListener('input', () => { noticed = true; paint(); hero.classList.remove('nod'); void hero.offsetWidth; hero.classList.add('nod'); });
  [user, pass].forEach((el) => { el.addEventListener('blur', () => setTimeout(paint, 0)); });
  pass.addEventListener('focus', paint);
  window.samiPaint = paint;
  if (calm) return;
  const step = () => {
    if (!img.isConnected) return;
    if (hold > Date.now() || state()) return setTimeout(step, 150);
    hero.classList.remove('calm');
    const [n, flip, ms] = SAMI_PLAN[i++ % SAMI_PLAN.length];
    show(n, flip);
    setTimeout(step, ms);
  };
  step();
}
function loginView() {
  $('#app').innerHTML = `<div class="login-wrap"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i>
    <div class="hero" aria-hidden="true"><div class="hero-say">¡Bienvenido!</div>
      <i class="note n1">♪</i><i class="note n2">♫</i><i class="note n3">♪</i><i class="note n4">♫</i>
      <div class="hero-bob"><img id="hero" src="/sami/hd/happy.png" alt="" draggable="false"></div><div class="hero-shd"></div></div>
    <div class="login"><img src="/logo.png" alt="ACEIS"><h2>La Plancha</h2><p class="mute">Asociación de Ingeniería de Sistemas</p>
    <label>Usuario</label><input id="lu" autocomplete="username" autocapitalize="none">
    <label>Contraseña</label><div class="pw"><input id="lp" type="password" autocomplete="current-password">
      <button type="button" class="eye" id="eye" aria-label="Mostrar contraseña" title="Mostrar contraseña">${icon('ojo')}</button></div>
    <button class="btn" id="lb">Ingresar</button></div></div>`;
  danceSami();
  const go = async () => {
    const u = await act(() => api('/login', 'POST', { username: val('lu'), password: val('lp') }));
    if (u) { window.samiPose('happy', 1500); boot(); } else { window.samiPose('sad', 2200); }
  };
  $('#eye').onmousedown = (e) => e.preventDefault(); // el campo no pierde el foco, así Sami no se distrae
  $('#eye').onclick = () => {
    const p = $('#lp'), show = p.type === 'password';
    p.type = show ? 'text' : 'password'; p.focus();
    $('#eye').innerHTML = icon(show ? 'ojoOff' : 'ojo'); $('#eye').classList.toggle('on', show);
    $('#eye').title = $('#eye').ariaLabel = show ? 'Ocultar contraseña' : 'Mostrar contraseña';
    window.samiPaint();
  };
  $('#lb').onclick = go;
  $('#lp').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ---------- Vistas ----------
const views = {
  async resumen() {
    if (S.user.role !== 'admin') {
      const d = await api('/summary'), s = d.open_shift;
      $('#main').innerHTML = `<h2>Resumen</h2>
        <div class="grid"><div class="stat"><span>Ventas de hoy (${d.today.n})</span><b>${money(d.today.total)}</b></div></div><br>
        <div class="card"><h3>Turno actual</h3>${s ? `<b>${esc(s.user_name)}</b> abrió caja ${dt(s.opened_at)}` : '<span class="mute">No hay caja abierta.</span>'}</div>
        <div class="grid">
          <div class="card"><h3>Stock bajo</h3>${lowStock(d.low)}</div>
          <div class="card"><h3>Más vendidos hoy</h3>${d.top.length ? `<table>${d.top.map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td></tr>`).join('')}</table>` : '<span class="mute">Sin ventas aún.</span>'}</div>
        </div>`;
      return;
    }
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
        <div class="card"><h3>Stock bajo</h3>${lowStock(d.low)}</div>
        <div class="card"><h3>Más vendidos (30 días)</h3>${d.top.length ? Object.entries(d.top.reduce((g, p) => ((g[p.category] ||= []).push(p), g), {})).map(([c, ps]) => `<h4 style="margin:.6rem 0 .2rem">${esc(c)}</h4><table>${ps.map((p) => `<tr><td>${esc(p.name)}</td><td class="n">${p.qty}</td></tr>`).join('')}</table>`).join('') : '<span class="mute">Sin ventas aún.</span>'}</div>
      </div>`;
  },

  async caja() {
    const { shift: s, register } = await api('/shift/current');
    const mine = s && s.user_id === S.user.id;
    S.cajaExp = { cash: register.cash, nequi: register.nequi };
    const lbl = 'text-xs font-bold uppercase tracking-wide text-slate-500';
    const field = (m, id, label, val0, extra = '') => `<div class="rounded-2xl border border-line bg-white p-3.5 shadow-sm">
      <div class="mb-2 flex items-center gap-2">${payLogo(m, 'h-7 w-7')}<span class="${lbl}">${label}</span></div>
      <input id="${id}" type="number" inputmode="numeric" min="0" value="${val0}" placeholder="$ 0" class="!rounded-xl !py-3 !text-xl !font-extrabold" ${extra}></div>`;
    const money2 = (m, name, exp, start, sales) => `<div class="rounded-3xl border border-line bg-white p-4 shadow-sm">
      <div class="flex items-center gap-3">${payLogo(m, 'h-11 w-11')}<div><div class="${lbl}">${name}</div><div class="text-xs text-slate-500">Debería haber en caja</div></div></div>
      <div class="mt-2 text-3xl font-extrabold tracking-tight text-navy">${money(exp)}</div>
      <div class="mt-3 flex gap-2 text-sm"><div class="flex-1 rounded-xl bg-ice/70 px-3 py-2"><div class="text-[11px] font-bold uppercase text-slate-500">Inicio</div><b class="text-slate-800">${money(start)}</b></div>
        <div class="flex-1 rounded-xl bg-emerald-50 px-3 py-2"><div class="text-[11px] font-bold uppercase text-emerald-700">Ventas</div><b class="text-emerald-800">+${money(sales)}</b></div></div></div>`;
    let html;
    if (!s) {
      html = `<div class="ord"><div class="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy to-brand p-5 text-white shadow-lg">
          <div><h2 class="!mb-0 text-2xl font-extrabold !text-white">Caja cerrada</h2><p class="mt-1 text-sm text-blue-100">Cuenta el dinero con el que empiezas tu turno para abrirla.</p></div>
          <span class="rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold backdrop-blur">Sin turno abierto</span></div>
        <section class="max-w-2xl rounded-3xl border border-line bg-white p-5 shadow-sm">
          <h3 class="!mb-3 text-lg font-extrabold text-navy">Abrir caja</h3>
          <div class="flex flex-col gap-3 sm:flex-row"><div class="flex-1">${field('efectivo', 'oc', 'Efectivo en caja', register.cash)}</div><div class="flex-1">${field('nequi', 'on', 'Saldo Nequi', register.nequi)}</div></div>
          <p class="mt-3 rounded-xl bg-ice/60 px-3 py-2 text-sm text-slate-600">El sistema esperaba <b>${money(register.cash)}</b> en efectivo y <b>${money(register.nequi)}</b> en Nequi. Si lo que cuentas es distinto, queda registrado en el turno.</p>
          <button class="btn mt-4 w-full !rounded-2xl !py-3 text-base" onclick="A.openShift()">Abrir caja</button></section></div>`;
    } else {
      html = `<div class="ord"><div class="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy to-brand p-5 text-white shadow-lg">
          <div class="flex items-center gap-3">${avatar({ id: s.user_id, name: s.user_name, photo: s.user_id === S.user.id ? S.user.photo : undefined }, 'sm')}
            <div><h2 class="!mb-0 text-2xl font-extrabold !text-white">${mine ? 'Tu turno está abierto' : 'Turno de ' + esc(s.user_name)}</h2><p class="mt-1 text-sm text-blue-100">Desde ${dt(s.opened_at)}</p></div></div>
          <div class="flex gap-3"><div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${s.sales_count}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Ventas</div></div>
            <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${money(s.sales_cash + s.sales_nequi)}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Vendido</div></div></div></div>
        <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
          <section class="min-w-0 flex-1"><h3 class="!mb-3 text-lg font-extrabold text-navy">Lo que debería haber</h3>
            <div class="flex flex-col gap-3 sm:flex-row"><div class="flex-1">${money2('efectivo', 'Efectivo', register.cash, s.open_cash, s.sales_cash)}</div><div class="flex-1">${money2('nequi', 'Nequi', register.nequi, s.open_nequi, s.sales_nequi)}</div></div></section>
          ${mine || S.user.role === 'admin' ? `<section class="min-w-0 flex-1 rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h3 class="!mb-1 text-lg font-extrabold text-navy">Cerrar caja</h3>
            <p class="mb-3 text-sm text-slate-500">Cuenta el dinero real y escríbelo. El sistema lo compara con lo que debería haber.</p>
            <div class="flex flex-col gap-3 sm:flex-row"><div class="flex-1">${field('efectivo', 'cc', 'Efectivo contado', '', 'oninput="A.cajaDiff()"')}<div id="dcc" class="mt-1.5 min-h-[1.5rem]"></div></div>
              <div class="flex-1">${field('nequi', 'cn', 'Saldo Nequi', '', 'oninput="A.cajaDiff()"')}<div id="dcn" class="mt-1.5 min-h-[1.5rem]"></div></div></div>
            <div class="mt-3"><label class="${lbl}">Observaciones (opcional)</label><input id="cnote" maxlength="300" placeholder="Algo que debamos saber del turno" class="!rounded-xl"></div>
            <button class="btn danger mt-4 w-full !rounded-2xl !py-3 text-base" onclick="A.closeShift()">Cerrar caja</button></section>` : ''}
        </div></div>`;
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
    const lbl = 'text-xs font-bold uppercase tracking-wide text-slate-500';
    const sold = sales.filter((x) => !x.voided).reduce((t, x) => t + Number(x.total), 0), nSold = sales.filter((x) => !x.voided).length;
    $('#main').innerHTML = `<div class="ord"><div class="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy to-brand p-5 text-white shadow-lg">
        <div><h2 class="!mb-0 text-2xl font-extrabold !text-white">Vender</h2><p class="mt-1 text-sm text-blue-100">Toca los productos para armar la venta.</p></div>
        <div class="flex gap-3"><div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${nSold}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Ventas del turno</div></div>
          <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${money(sold)}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Vendido</div></div></div></div></div>
      <div class="pos">
      <div><div class="relative"><span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">${icon('lupa')}</span>
        <input id="q" placeholder="Buscar producto…" value="${esc(S.q)}" oninput="S.q=this.value;A.grid()" class="!rounded-2xl !py-3 !pl-11"></div>
        <div class="chips"><button class="${S.cat === 'all' ? 'on' : ''}" onclick="S.cat='all';views.vender()">Todos</button>
        <button class="fchip ${S.cat === 'fav' ? 'on' : ''}" onclick="S.cat='fav';views.vender()">${icon('estrella')} Favoritos</button>
        ${cats.map((c) => `<button class="${S.cat === c ? 'on' : ''}" data-c="${esc(c)}" onclick="S.cat=this.dataset.c;views.vender()">${esc(c)}</button>`).join('')}</div>
        <div class="prods" id="grid"></div></div>
      <div class="card"><h3>Venta</h3><div id="cart"></div></div></div>
      <div class="ord">
      <section class="mb-5 rounded-3xl border border-line bg-white p-5 shadow-sm"><h3 class="!mb-1 text-lg font-extrabold text-navy">Retiro o cambio entre Nequi y efectivo</h3>
        <p class="mb-3 text-sm text-slate-500">Comisión sugerida: $500 por cada $50.000.</p>
        <input type="hidden" id="wd" value="nequi_efectivo"><input type="hidden" id="wm" value="nequi">
        <div class="mb-3"><div class="mb-1 ${lbl}">Tipo de movimiento</div>
          <div class="flex flex-col overflow-hidden rounded-2xl border border-line sm:flex-row" data-seg="wd">
            ${[['nequi_efectivo', payLogo('nequi') + ' Nequi → efectivo', 'El cliente transfiere, tú entregas efectivo'], ['efectivo_nequi', payLogo('efectivo') + ' Efectivo → Nequi', 'El cliente da efectivo, tú transfieres']].map(([v, t, h], i) => `<button type="button" data-v="${v}" onclick="A.loanSeg('wd','${v}');A.wdFee()" class="flex-1 px-4 py-2.5 text-left ${i ? 'border-t border-line sm:border-l sm:border-t-0' : ''} ${v === 'nequi_efectivo' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-ice'}"><span class="inline-flex items-center gap-1.5 text-sm font-bold">${t}</span><span class="block text-xs opacity-80">${h}</span></button>`).join('')}</div></div>
        <div class="flex flex-wrap gap-3">
          <div class="min-w-[9rem] flex-1"><label class="${lbl}">Monto a entregar</label><input id="wa" type="number" inputmode="numeric" min="1" placeholder="$ 0" oninput="A.wdFee()" class="!rounded-xl !py-3 !text-lg !font-extrabold"></div>
          <div class="min-w-[9rem] flex-1"><label class="${lbl}">Comisión</label><input id="wf" type="number" inputmode="numeric" min="0" value="0" class="!rounded-xl !py-3 !text-lg !font-extrabold"></div>
          <div><div class="mb-1 ${lbl}">La comisión se cobró en</div>${loanSeg('wm', [['nequi', payLogo('nequi') + ' Nequi'], ['efectivo', payLogo('efectivo') + ' Efectivo']], 'nequi')}</div></div>
        <p id="wsum" class="mt-2 text-sm text-slate-500"></p>
        <button class="btn mt-3 w-full !rounded-2xl !py-3 text-base sm:w-auto sm:px-8" onclick="A.withdraw()">Registrar retiro</button>
        ${wds.length ? `<div class="mt-4 flex flex-col gap-2">${wds.map((w) => `<div class="flex flex-wrap items-center gap-3 rounded-2xl bg-ice/50 px-3 py-2 ${w.voided ? 'opacity-50' : ''}">
          <span class="text-sm text-slate-500">${dt(w.created_at).split(', ').pop()}</span><b class="min-w-0 flex-1 text-sm text-navy ${w.voided ? 'line-through' : ''}">${w.direction === 'efectivo_nequi' ? 'Efectivo → Nequi' : 'Nequi → efectivo'}</b>
          <span class="text-sm">${money(w.amount)} <span class="text-slate-500">· comisión ${money(w.fee)}</span></span>
          ${w.voided ? '<span class="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">Anulado</span>' : `<button class="btn sec sm !rounded-xl" onclick="A.voidWd(${w.id})">Anular</button>`}</div>`).join('')}</div>` : ''}</section>
      <section class="rounded-3xl border border-line bg-white p-5 shadow-sm"><h3 class="!mb-3 text-lg font-extrabold text-navy">Ventas de este turno</h3><div class="tw">${salesTable(sales, true)}</div></section></div></div>`;
    A.grid(); A.cart();
  },

  async productos() {
    const [prods, cats] = await Promise.all([api('/products'), api('/categories')]);
    S.prods = prods; S.cats = cats; S.pq = ''; S.pcat = 'all'; S.pst = 'all';
    const act = prods.filter((p) => p.active), tr = act.filter((p) => p.track_stock);
    const cost = tr.reduce((s, p) => s + p.stock * p.buy_price, 0), value = tr.reduce((s, p) => s + p.stock * p.sell_price, 0);
    $('#main').innerHTML = `<div class="ph"><h2>Productos y stock</h2><span class="sp"></span>
        <button class="btn" onclick="A.productForm()">+ Producto</button><button class="btn sec" onclick="A.catManager()">Categorías</button></div>
      <div class="grid">
        <div class="stat"><span>Productos activos</span><b>${act.length}</b><small>${prods.length - act.length} desactivados</small></div>
        <div class="stat"><span>Inventario (costo → venta)</span><b style="font-size:1.1rem">${money(cost)} → ${money(value)}</b><small>Ganancia potencial ${money(value - cost)}</small></div>
        <div class="stat"><span>Stock bajo</span><b>${tr.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length}</b><small>Por debajo del mínimo</small></div>
        <div class="stat"><span>Agotados</span><b>${tr.filter((p) => p.stock <= 0).length}</b><small>Sin unidades</small></div>
      </div>${prodToolbar(true)}<div class="pgrid" id="pgrid"></div>`;
    A.pgrid();
  },
  async prestamos() {
    const [items, { pending, history }] = await Promise.all([api('/loan-items'), api('/loans')]);
    S.loanItems = items;
    const admin = S.user.role === 'admin';
    const avail = items.filter((i) => i.active && i.available > 0);
    const late = pending.filter((l) => l.late).length;
    const item = (l) => items.find((x) => x.id === l.item_id);
    const chip = (txt, cls) => `<span class="rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}">${txt}</span>`;
    $('#main').innerHTML = `<div class="ord">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy to-brand p-5 text-white shadow-lg">
        <div><h2 class="!mb-0 text-2xl font-extrabold !text-white">Préstamo de implementos</h2>
          <p class="mt-1 text-sm text-blue-100">Raquetas, juegos de mesa y más. Registra el préstamo y márcalo cuando lo devuelvan.</p></div>
        <div class="flex gap-3">
          <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${pending.length}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Prestados</div></div>
          <div class="rounded-2xl ${late ? 'bg-rose-500/80' : 'bg-white/15'} px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${late}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Vencidos</div></div>
        </div>
      </div>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section class="min-w-0 flex-1 rounded-3xl border border-line bg-white p-5 shadow-sm lg:max-w-xl">
          <h3 class="!mb-3 flex items-center gap-2 text-lg font-extrabold text-navy"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">1</span> Nuevo préstamo</h3>
          ${avail.length ? `<input type="hidden" id="lm" value="efectivo"><input type="hidden" id="ld" value="2">
          <div class="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">¿Qué implementos y cuántos?</div>
          <div class="flex flex-wrap gap-2.5">${avail.map((i) => `<div data-i="${i.id}" class="litem flex w-[7.2rem] flex-col items-center gap-1.5 rounded-2xl border-2 border-line bg-white p-2 text-center transition">
              <button type="button" onclick="A.loanChg(${i.id},1)" class="flex flex-col items-center gap-1.5">${loanThumb(i, 'h-20 w-20')}<b class="line-clamp-2 text-xs leading-tight text-slate-800">${esc(i.name)}</b></button>
              <small class="text-[11px] text-slate-500">${i.available} disp.</small>
              <div class="qty"><button type="button" onclick="A.loanChg(${i.id},-1)">−</button><span id="lq${i.id}">0</span><button type="button" onclick="A.loanChg(${i.id},1)">+</button></div></div>`).join('')}</div>
          <div class="mt-4"><label class="text-xs font-bold uppercase tracking-wide text-slate-500">Nombre de la persona</label><input id="lb" maxlength="80" placeholder="¿A quién se le presta?" class="!rounded-2xl !py-3"></div>
          <div class="mt-3 rounded-2xl bg-ice/60 p-3">
            <div class="flex flex-wrap items-end gap-3">
              <div class="min-w-[8rem] flex-1"><label class="text-xs font-bold uppercase tracking-wide text-slate-500">Valor del préstamo</label><input id="lf" type="number" inputmode="numeric" min="0" value="2000" class="!text-lg !font-extrabold"></div>
              <div><div class="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Entra a</div>${loanSeg('lm', [['efectivo', payLogo('efectivo') + ' Efectivo'], ['nequi', payLogo('nequi') + ' Nequi']], 'efectivo')}</div>
              <div><div class="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Plazo</div>${loanSeg('ld', [['1', '1 día'], ['2', '2 días']], '2')}</div>
            </div>
          </div>
          <button class="btn mt-4 w-full !rounded-2xl !py-3 text-base" onclick="A.loan()">Registrar préstamo</button>`
          : '<div class="rounded-2xl border border-dashed border-line p-6 text-center text-slate-500"><div class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-ice text-brand">' + icon('productos') + '</div>No hay implementos disponibles para prestar.</div>'}
        </section>
        <section class="min-w-0 flex-1">
          <h3 class="!mb-3 flex items-center gap-2 text-lg font-extrabold text-navy"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm text-white">2</span> Pendientes de devolución</h3>
          ${pending.length ? `<div class="flex flex-col gap-3">${pending.map((l) => `<article class="overflow-hidden rounded-3xl border ${l.late ? 'border-rose-300' : 'border-amber-200'} bg-white shadow-sm">
            <div class="flex items-center gap-3 p-3">${loanThumb(item(l), 'h-16 w-16')}
              <div class="min-w-0 flex-1"><b class="block truncate text-navy">${l.qty > 1 ? l.qty + '× ' : ''}${esc(l.item)}</b><div class="truncate text-sm text-slate-700">${icon('usuarios')} ${esc(l.borrower)}</div>
                <div class="text-xs text-slate-500">Prestado ${dt(l.created_at)} · atendió ${esc(l.who)}</div></div>
              <div class="text-right"><div class="text-lg font-extrabold text-navy">${l.fee || !l.group_id || l.group_id === l.id ? money(l.fee) : '<small class="text-xs font-semibold text-slate-500">incluido</small>'}</div>${l.method ? `<small class="text-xs text-slate-500">${payTag(l.method)}</small>` : ''}</div></div>
            <div class="flex flex-wrap items-center gap-2 ${l.late ? 'bg-rose-50' : 'bg-amber-50'} px-3 py-2">
              <span class="text-xs font-semibold ${l.late ? 'text-rose-700' : 'text-amber-800'}">${icon('reloj')} Devolver antes de ${dt(l.due_at)}</span>${l.late ? chip('VENCIDO', 'bg-rose-500 text-white') : ''}
              <span class="ml-auto flex gap-2"><button class="btn sm !rounded-xl" onclick="A.loanReturn(${l.id})">${icon('check')} Devuelto</button>${admin ? `<button class="btn sec sm !rounded-xl" onclick="A.loanVoid(${l.id})">Anular</button>` : ''}</span></div></article>`).join('')}</div>`
          : '<div class="rounded-3xl border border-dashed border-line bg-white/70 p-8 text-center text-slate-500"><div class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">' + icon('check') + '</div>Nada pendiente: todo fue devuelto.</div>'}
        </section>
      </div>
      <section class="mt-6"><h3 class="!mb-3 text-lg font-extrabold text-navy">Historial reciente</h3>
        ${history.length ? `<div class="flex flex-col gap-2">${history.map((l) => `<div class="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2 shadow-sm ${l.voided ? 'opacity-60' : ''}">
          ${loanThumb(item(l), 'h-10 w-10')}
          <div class="min-w-0 flex-1"><b class="block truncate text-sm text-navy ${l.voided ? 'line-through' : ''}">${l.qty > 1 ? l.qty + '× ' : ''}${esc(l.item)} <span class="font-medium text-slate-600">· ${esc(l.borrower)}</span></b>
            <div class="text-xs text-slate-500">Prestó ${esc(l.who)} · ${dt(l.created_at)}${l.voided ? '' : ` → recibió ${esc(l.received_by)} · ${dt(l.returned_at)}`}</div></div>
          ${l.voided ? chip('Anulado', 'bg-rose-100 text-rose-700') : chip('Devuelto', 'bg-emerald-100 text-emerald-700')}<b class="text-navy">${money(l.fee)}</b></div>`).join('')}</div>`
        : '<span class="text-slate-500">Sin movimientos.</span>'}</section>
      ${admin ? `<section class="mt-6"><div class="mb-3 flex items-center justify-between"><h3 class="!mb-0 text-lg font-extrabold text-navy">Inventario de implementos</h3><button class="btn sm !rounded-xl" onclick="A.loanItemForm()">+ Implemento</button></div>
        ${items.length ? `<div class="flex flex-wrap gap-3">${items.map((i) => `<div class="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm sm:w-[calc(50%-.375rem)] xl:w-[calc(33.333%-.5rem)] ${i.active ? '' : 'opacity-50'}">
          ${loanThumb(i, 'h-14 w-14')}<div class="min-w-0 flex-1"><b class="block truncate text-navy">${esc(i.name)}</b>
            <div class="text-xs text-slate-500">${i.available} de ${i.qty} disponibles${i.active ? '' : ' · inactivo'}</div></div>
          <button class="btn sec sm !rounded-xl" onclick="A.loanItemForm(${i.id})">Editar</button></div>`).join('')}</div>`
        : '<div class="rounded-3xl border border-dashed border-line bg-white/70 p-6 text-center text-slate-500">Aún no hay implementos. Agrega raquetas, juegos de mesa, etc.</div>'}</section>` : ''}</div>`;
    S.loanSel = {};
  },
  async pedidos() {
    const [{ pending, history }, prods, cats] = await Promise.all([api('/orders'), api('/products'), api('/categories')]);
    S.prods = prods; S.cats = cats; S.ordPending = pending; S.ordSel = null;
    const d = S.orderDraft ||= { items: [], total: '', note: '' };
    const pendTotal = pending.reduce((t, o) => t + Number(o.total), 0);
    const byId = (id) => prods.find((p) => p.id === id);
    const line = (i) => `<li class="flex items-center gap-2.5 py-1">${ordThumb(byId(i.product_id), 'h-9 w-9')}<span class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">${esc(i.name)}${i.product_id ? '' : ' <span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">NUEVO</span>'}</span>
      <span class="rounded-lg bg-ice px-2 py-0.5 text-sm font-extrabold text-brand">${i.received_qty != null && i.received_qty !== i.qty ? `${i.received_qty} de ${i.qty}` : '×' + i.qty}</span></li>`;
    $('#main').innerHTML = `<div class="ord">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy to-brand p-5 text-white shadow-lg">
        <div><h2 class="!mb-0 text-2xl font-extrabold !text-white">Pedidos a proveedores</h2>
          <p class="mt-1 text-sm text-blue-100">Registra lo que pediste; quien lo reciba verifica, paga y suma el stock.</p></div>
        <div class="flex gap-3">
          <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${pending.length}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Pendientes</div></div>
          <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${money(pendTotal)}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Por pagar</div></div>
        </div>
      </div>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section class="min-w-0 flex-1 rounded-3xl border border-line bg-white p-5 shadow-sm lg:max-w-xl">
          <h3 class="!mb-3 flex items-center gap-2 text-lg font-extrabold text-navy"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">1</span> Nuevo pedido</h3>
          <div class="relative">
            <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">${icon('lupa')}</span>
            <input id="os" autocomplete="off" placeholder="Escribe el producto (ej. coca zero)…" class="!rounded-2xl !py-3 !pl-11" oninput="A.ordFind()" onfocus="A.ordFind()" onkeydown="if(event.key==='Escape'){$('#ores').hidden=true;A.ordUnpick()}">
            <div id="ores" hidden class="absolute inset-x-0 top-full z-20 mt-1.5 max-h-80 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-xl"></div>
          </div>
          <div id="osel"></div>
          <div id="odraft" class="mt-4"></div>
          <div class="mt-4 rounded-2xl bg-ice/60 p-3">
            <div class="flex flex-wrap gap-3">
              <div class="min-w-[9rem] flex-1"><label class="text-xs font-bold uppercase tracking-wide text-slate-500">Valor total del pedido</label><input id="ot" type="number" inputmode="numeric" min="1" placeholder="$ 0" value="${d.total}" oninput="S.orderDraft.total=this.value" class="!text-lg !font-extrabold"></div>
              <div class="min-w-[9rem] flex-[2]"><label class="text-xs font-bold uppercase tracking-wide text-slate-500">Nota (opcional)</label><input id="on" maxlength="200" placeholder="Proveedor, observaciones…" value="${esc(d.note)}" oninput="S.orderDraft.note=this.value"></div>
            </div>
          </div>
          <button class="btn mt-4 w-full !rounded-2xl !py-3 text-base" onclick="A.ordSave()">Registrar pedido</button>
        </section>
        <section class="min-w-0 flex-1">
          <h3 class="!mb-3 flex items-center gap-2 text-lg font-extrabold text-navy"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm text-white">2</span> Pendientes por recibir</h3>
          ${pending.length ? `<div class="flex flex-col gap-3">${pending.map((o) => `<article class="overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-sm">
            <header class="flex items-center justify-between gap-2 bg-amber-50 px-4 py-2.5">
              <div><b class="text-navy">Pedido #${o.id}</b><div class="text-xs text-slate-500">${dt(o.created_at)} · pidió ${esc(o.who)}</div></div>
              <div class="text-right text-xl font-extrabold text-navy">${money(o.total)}</div></header>
            <ul class="divide-y divide-slate-100 px-4 py-1.5">${o.items.map(line).join('')}</ul>
            ${o.note ? `<p class="px-4 pb-1 text-xs italic text-slate-500">${esc(o.note)}</p>` : ''}
            <footer class="flex gap-2 px-4 pb-3 pt-2"><button class="btn flex-1 !rounded-xl" onclick="A.ordReceive(${o.id})">${icon('check')} Recibir y pagar</button>
              ${S.user.role === 'admin' || o.user_id === S.user.id ? `<button class="btn sec !rounded-xl" onclick="A.ordCancel(${o.id})">Cancelar</button>` : ''}</footer></article>`).join('')}</div>`
          : '<div class="rounded-3xl border border-dashed border-line bg-white/70 p-8 text-center text-slate-500"><div class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-ice text-brand">' + icon('productos') + '</div>No hay pedidos pendientes.</div>'}
        </section>
      </div>
      <section class="mt-6"><h3 class="!mb-3 text-lg font-extrabold text-navy">Historial reciente</h3>
        ${history.length ? `<div class="flex flex-col gap-2">${history.map((o) => `<details class="rounded-2xl border border-line bg-white px-4 py-2.5 shadow-sm">
          <summary class="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1"><b class="text-navy">#${o.id}</b>
            ${o.status === 'recibido' ? '<span class="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">Recibido</span>' : '<span class="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">Cancelado</span>'}
            <span class="text-xs text-slate-500">${dt(o.created_at)} · ${esc(o.who)}${o.status === 'recibido' ? ` → ${esc(o.received_name)} · ${payTag(o.method)}` : ''}</span>
            <b class="ml-auto text-navy">${money(o.status === 'recibido' ? o.paid : o.total)}</b></summary>
          <ul class="mt-1 divide-y divide-slate-100">${o.items.map(line).join('')}</ul></details>`).join('')}</div>`
        : '<span class="text-slate-500">Sin pedidos.</span>'}</section></div>`;
    A.ordDraft();
  },
  async dinero() {
    const [{ register, adjustments }, prods] = await Promise.all([api('/register'), api('/products')]);
    S.prods = prods;
    const wo = prods.filter((p) => p.active && p.track_stock && p.stock > 0);
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
      <div class="card tw"><h3>Descartar productos (pérdida)</h3>
        <p class="mute">Producto que no se vendió y se regala o se bota. Sale del stock y se cuenta como pérdida al costo (las empanadas salen del stock sin generar pérdida, porque se pagan en Gastos); no entra dinero ni cambia la caja. La pérdida se descuenta de la ganancia neta cuando pagues al emprendimiento (pestaña Emprendimientos).</p>
        ${wo.length ? `<input id="wsq" placeholder="Buscar por nombre o categoría" oninput="A.filterWo()" style="margin-bottom:.5rem"><table id="wot"><tr><th>Producto</th><th class="n">Stock</th><th class="n">Costo</th><th class="n">Descartar</th></tr>
        ${wo.map((p) => `<tr data-s="${esc((p.name + ' ' + (p.category || '')).toLowerCase())}"><td>${esc(p.name)}${p.category ? ` <small class="mute">${esc(p.category)}</small>` : ''}</td><td class="n">${p.stock}</td><td class="n">${money(p.buy_price)}</td>
          <td class="n"><input class="wq" data-id="${p.id}" type="number" min="0" max="${p.stock}" inputmode="numeric" style="width:5rem"></td></tr>`).join('')}</table>
        <div class="row"><div><label>Motivo (opcional)</label><input id="wn" maxlength="200" placeholder="Ej. sobrante del día"></div></div>
        <p><button class="btn" onclick="A.writeOff()">Descartar lo indicado</button>
        <button class="btn sec" onclick="A.writeOff(true)">Vaciar stock mostrado</button></p>` : '<span class="mute">No hay productos con stock.</span>'}</div>
      <div class="card tw"><h3>Reporte de pérdidas</h3>
        <div class="row"><div><label>Desde</label><input id="wf" type="date"></div><div><label>Hasta</label><input id="wt" type="date"></div>
        <div><label>&nbsp;</label><button class="btn sec" onclick="A.writeOffReport()">Ver</button></div></div><div id="wr"></div></div>
      <div class="card tw"><h3>Movimientos manuales</h3><table><tr><th>Fecha</th><th>Quién</th><th>Medio</th><th class="n">Monto</th><th>Motivo</th></tr>
      ${adjustments.map((a) => `<tr><td>${dt(a.created_at)}</td><td>${esc(a.user)}</td><td>${a.method}</td><td class="n ${a.amount < 0 ? 'err' : 'ok'}">${money(a.amount)}</td><td>${esc(a.note)}</td></tr>`).join('') || '<tr><td colspan="5" class="mute">Sin movimientos.</td></tr>'}</table></div>`;
    A.writeOffReport();
  },

  async emprendimientos() {
    const { pending, history, register } = await api('/payouts');
    $('#main').innerHTML = `<h2>Pago a emprendimientos</h2>
      <p class="mute">Cada producto de emprendimientos se paga por separado, a nombre de quien corresponda. Se paga el costo de lo vendido más el 60% del costo de lo perdido (descartado) desde el último pago de ese producto. Al pagar se descuenta de la caja y la pérdida se resta de la ganancia neta.</p>
      <div class="grid"><div class="stat"><span>Efectivo en caja</span><b>${money(register.cash)}</b></div><div class="stat"><span>Nequi en caja</span><b>${money(register.nequi)}</b></div></div><br>
      <div class="card tw"><h3>Pendiente de pago</h3>${pending.length ? `<table><tr><th>Producto</th><th class="n">Vendidos</th><th class="n">Perdidos</th><th class="n">A pagar</th><th>A nombre de</th><th>Pagar con</th><th></th></tr>
      ${pending.map((p, i) => `<tr><td><b>${esc(p.product)}</b></td>
        <td class="n">${p.sold_qty} · ${money(p.sold_cost)}</td>
        <td class="n ${p.lost_qty ? 'err' : ''}">${p.lost_qty} · ${money(p.lost_cost)}<br><small class="mute">${p.rate}%</small></td>
        <td class="n"><b>${money(p.total)}</b></td>
        <td><input id="pp${i}" maxlength="100" placeholder="Nombre" style="min-width:8rem"></td>
        <td><select id="pm${i}"><option value="efectivo">Efectivo</option><option value="nequi">Nequi</option></select></td>
        <td class="n"><button class="btn sm" onclick="A.payout(${p.product_id}, ${i}, ${p.total}, '${esc(p.product).replace(/'/g, '')}')">Pagar</button></td></tr>`).join('')}</table>` : '<span class="mute">Nada pendiente en emprendimientos.</span>'}</div>
      <div class="card tw"><h3>Pagos realizados</h3><table><tr><th>Fecha</th><th>Producto</th><th>A nombre de</th><th>Medio</th><th class="n">Vendidos</th><th class="n">Perdidos</th><th class="n">Total</th></tr>
      ${history.map((y) => `<tr><td>${dt(y.created_at)}</td><td>${esc(y.category)}</td><td>${esc(y.payee || '—')}</td><td>${y.method}</td><td class="n">${y.sold_qty} · ${money(y.sold_cost)}</td><td class="n">${y.lost_qty} · ${money(y.lost_cost)}</td><td class="n">${money(y.total)}</td></tr>`).join('') || '<tr><td colspan="7" class="mute">Sin pagos.</td></tr>'}</table></div>`;
  },

  async gastos() {
    const [rows, cats] = await Promise.all([api('/expenses'), api('/categories')]);
    S.cats = cats;
    const sum = (k) => rows.filter((e) => e.kind === k).reduce((t, e) => t + e.amount, 0);
    const lbl = 'text-xs font-bold uppercase tracking-wide text-slate-500';
    $('#main').innerHTML = `<div class="ord">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy to-brand p-5 text-white shadow-lg">
        <div><h2 class="!mb-0 text-2xl font-extrabold !text-white">Gastos</h2><p class="mt-1 text-sm text-blue-100">Pagos de pedidos a proveedores y compras de implementos.</p></div>
        <div class="flex gap-3">
          <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${money(sum('pedido'))}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Pedidos pagados</div></div>
          <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${money(sum('implementos'))}</div><div class="text-[11px] uppercase tracking-wide text-blue-100">Implementos</div></div>
        </div></div>
      <div class="flex flex-col gap-5 lg:flex-row lg:items-start">
        <section class="min-w-0 flex-1 rounded-3xl border border-line bg-white p-5 shadow-sm lg:max-w-xl">
          <h3 class="!mb-3 text-lg font-extrabold text-navy">Registrar gasto</h3>
          <div class="flex overflow-hidden rounded-2xl border border-line">
            <button id="k1" onclick="A.kind('pedido')" class="inline-flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold">${icon('camion')} Pago de pedido</button>
            <button id="k2" onclick="A.kind('implementos')" class="inline-flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold">${icon('gastos')} Implementos</button></div>
          <p class="mt-2 rounded-xl bg-ice/60 px-3 py-2 text-sm text-slate-600" id="kh"></p>
          <div class="mt-3 flex flex-col gap-3">
            <div id="gcw"><label class="${lbl}">Proveedor / categoría</label><select id="gc" class="!rounded-xl"><option value="">Otro</option>${cats.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></div>
            <div><label class="${lbl}" id="gdl">Nota (opcional)</label><input id="gd" maxlength="150" class="!rounded-xl"></div>
            <div><label class="${lbl}">Monto</label><input id="ga" type="number" inputmode="numeric" min="1" placeholder="$ 0" class="!rounded-xl !py-3 !text-xl !font-extrabold"></div>
            <div><div class="mb-1 ${lbl}">¿De dónde salió?</div><input type="hidden" id="gm" value="">
              <div class="flex flex-wrap">${loanSeg('gm', [['', 'Fuera de la caja'], ['efectivo', payLogo('efectivo') + ' Efectivo'], ['nequi', payLogo('nequi') + ' Nequi']], '')}</div></div>
          </div>
          <button class="btn mt-4 w-full !rounded-2xl !py-3 text-base" onclick="A.addExpense()">Registrar gasto</button>
        </section>
        <section class="min-w-0 flex-1"><h3 class="!mb-3 text-lg font-extrabold text-navy">Historial</h3>
          ${rows.length ? `<div class="flex flex-col gap-2">${rows.map((e) => `<div class="flex items-center gap-3 rounded-2xl border border-line bg-white px-3 py-2.5 shadow-sm">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${e.kind === 'pedido' ? 'bg-ice text-brand' : 'bg-amber-100 text-amber-700'}">${icon(e.kind === 'pedido' ? 'camion' : 'gastos')}</span>
            <div class="min-w-0 flex-1"><b class="block truncate text-sm text-slate-800">${esc(e.description)}</b>
              <div class="flex flex-wrap items-center gap-x-2 text-xs text-slate-500"><span>${dt(e.created_at)}</span><span class="font-semibold">${e.kind === 'pedido' ? 'Pedido' : 'Implementos'}</span>${e.method ? payTag(e.method) : '<span>Fuera de caja</span>'}</div></div>
            <b class="text-navy">${money(e.amount)}</b>
            <button class="btn sec sm !rounded-xl" onclick="A.delExpense(${e.id})">Borrar</button></div>`).join('')}</div>`
          : '<div class="rounded-3xl border border-dashed border-line bg-white/70 p-8 text-center text-slate-500">Sin gastos registrados.</div>'}
        </section></div></div>`;
    S.kind = 'pedido'; A.kind('pedido');
  },

  // Solo lectura: precios y stock para quien atiende
  async inventario() {
    S.prods = (await api('/products')).filter((p) => p.active); S.pq = ''; S.pcat = 'all'; S.pst = 'all';
    $('#main').innerHTML = `<div class="ph"><h2>Productos y stock</h2></div>${prodToolbar(false)}<div class="pgrid" id="pgrid"></div>`;
    A.pgrid();
  },


  async reportes() {
    S.week ||= null; S.rp ||= 30;
    const iso = (t) => t.toISOString().slice(0, 10);
    const today = new Date(Date.now() - 5 * 36e5), rto = iso(today);
    today.setUTCDate(today.getUTCDate() - S.rp + 1);
    if (S.view === 'rentabilidad') {
      const er = await api(`/reports/emprendimientos?from=${iso(today)}&to=${rto}`).catch((e) => ({ error: e.message }));
      $('#main').innerHTML = `<h2>Rentabilidad de emprendimientos</h2>${reportTabs()}${empPanel(er)}`;
      return empCharts(er);
    }
    const [w, tr] = await Promise.all([api('/reports/week' + (S.week ? `?start=${S.week}` : '')), api(`/reports/trend?from=${iso(today)}&to=${rto}`).catch((e) => ({ error: e.message }))]);
    S.week = w.start;
    const d0 = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' });
    const dn = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
    const pct = (a, b) => b ? `<small class="${a >= b ? 'ok' : 'err'}">${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}% vs semana anterior</small>` : '<small class="mute">Sin semana anterior</small>';
    const t = w.totals, pv = w.previous, max = Math.max(1, ...w.days.map((d) => d.total));
    const net = t.profit - t.impl - t.lost;
    $('#main').innerHTML = `<h2>Reportes</h2>${reportTabs()}${reportPanel(tr)}<h2 style="margin-top:1.6rem">Reporte semanal</h2>
      <div class="row" style="align-items:center;margin-bottom:1rem">
        <button class="btn sec sm" onclick="A.week(-7)">← Anterior</button>
        <b style="flex:2;text-align:center">${d0(w.start)} – ${d0(w.end)}</b>
        <button class="btn sec sm" onclick="A.week(7)">Siguiente →</button></div>
      <div class="grid">
        <div class="stat"><span>Ventas (${t.n})</span><b>${money(t.total)}</b>${pct(t.total, pv.total)}</div>
        <div class="stat"><span>Ganancia</span><b>${money(t.profit)}</b>${pct(t.profit, pv.profit)}</div>
        <div class="stat"><span>Gastos de implementos</span><b>${money(t.impl)}</b></div>
        <div class="stat"><span>Ganancia neta</span><b>${money(net)}</b>${pct(net, pv.profit - pv.impl - pv.lost)}</div>
        <div class="stat"><span>Pérdidas por descartes (pagadas)</span><b>${money(t.lost)}</b></div>
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
        <p><button class="btn" onclick="A.exportCsv()">${icon('descarga')} Descargar CSV</button></p></div>`;
    A.hours('week'); reportCharts(tr);
  },

  rentabilidad() { return views.reportes(); },

  async actividad() {
    S.aq ??= '';
    const rows = await api('/audit?q=' + encodeURIComponent(S.aq));
    $('#main').innerHTML = `<h2>Actividad</h2>
      <p class="mute">Quién hizo qué: ventas, anulaciones, cambios de productos y stock, ajustes de dinero, usuarios y más. Se muestran los últimos 300 movimientos.</p>
      <div class="row"><input id="aq" placeholder="Buscar por persona, acción o detalle…" value="${esc(S.aq)}" onkeydown="if(event.key==='Enter')A.auditSearch()"><button class="btn sm" style="flex:0 0 auto" onclick="A.auditSearch()">Buscar</button></div>
      <div class="card tw" style="margin-top:1rem"><table><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Detalle</th></tr>
      ${rows.map((r) => `<tr><td style="white-space:nowrap">${dt(r.created_at)}</td><td>${esc(r.user_name)}</td><td><span class="tag">${esc(r.action)}</span></td><td>${esc(r.detail || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="mute">Sin actividad.</td></tr>'}</table></div>`;
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
    const [rows, weekly] = await Promise.all([api('/shifts'), api('/shifts/weekly')]);
    const admin = S.user.role === 'admin';
    const cur = new Date(Date.now() - 5 * 36e5); cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7));
    const week = cur.toISOString().slice(0, 10), people = new Map();
    weekly.forEach((w) => {
      const p = people.get(w.user_id) || { name: w.user_name, week: 0, total: 0 };
      const d = w.diff_cash + w.diff_nequi;
      p.total += d; if (w.week === week) p.week += d;
      people.set(w.user_id, p);
    });
    const open = rows.filter((r) => !r.closed_at).length;
    const lbl = 'text-[11px] font-bold uppercase tracking-wide';
    const list = [...people.values()].sort((x, y) => x.name.localeCompare(y.name));
    $('#main').innerHTML = `<div class="ord">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-navy to-brand p-5 text-white shadow-lg">
        <div><h2 class="!mb-0 text-2xl font-extrabold !text-white">${admin ? 'Turnos' : 'Mis turnos'}</h2><p class="mt-1 text-sm text-blue-100">Historial de cierres y descuadre de caja.</p></div>
        <div class="flex gap-3"><div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${rows.length}</div><div class="${lbl} text-blue-100">Turnos</div></div>
          <div class="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur"><div class="text-2xl font-extrabold">${open}</div><div class="${lbl} text-blue-100">Abiertos</div></div></div></div>
      <section class="mb-5 rounded-3xl border border-line bg-white p-5 shadow-sm"><h3 class="!mb-3 text-lg font-extrabold text-navy">Descuadre de caja</h3>
        ${list.length ? `<div class="flex flex-col gap-2"><div class="flex items-center gap-3 px-3 ${lbl} text-slate-400"><span class="flex-1">Usuario</span><span class="w-36">Esta semana</span><span class="w-36">Total</span></div>
        ${list.map((p) => `<div class="flex flex-wrap items-center gap-3 rounded-2xl bg-ice/50 px-3 py-2.5">
          <span class="flex min-w-0 flex-1 items-center gap-2.5"><b class="av sm">${initialOf(p.name)}</b><b class="truncate text-navy">${esc(p.name)}</b></span>
          <span class="w-36">${diffTag(p.week)}</span><span class="w-36">${diffTag(p.total)}</span></div>`).join('')}</div>`
        : '<span class="text-slate-500">Aún no hay cierres de caja.</span>'}</section>
      <section><h3 class="!mb-3 text-lg font-extrabold text-navy">Historial</h3>
        ${rows.length ? `<div class="flex flex-col gap-2">${rows.map((s) => {
          const closed = !!s.closed_at, dc = closed ? s.close_cash - s.sys_close_cash : 0, dn = closed ? s.close_nequi - s.sys_close_nequi : 0;
          return `<div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border ${closed ? 'border-line' : 'border-amber-300'} bg-white px-4 py-3 shadow-sm">
            <div class="min-w-[9rem] flex-1"><b class="text-navy">${dt(s.opened_at)}</b><div class="text-xs text-slate-500">${closed ? 'hasta ' + dt(s.closed_at) : '<span class="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">Abierto</span>'}${admin ? ` · ${esc(s.user_name)}` : ''}</div></div>
            <div class="text-sm"><div class="${lbl} text-slate-400">Ventas (${s.sales_count})</div><b class="text-navy">${money(s.sales_cash + s.sales_nequi)}</b></div>
            ${closed ? `<div class="text-sm"><div class="${lbl} text-slate-400">${payLogo('efectivo', 'h-4 w-4')} Efectivo</div>${diffTag(dc)}</div>
            <div class="text-sm"><div class="${lbl} text-slate-400">${payLogo('nequi', 'h-4 w-4')} Nequi</div>${diffTag(dn)}</div>` : ''}
            <button class="btn sec sm !rounded-xl ml-auto" onclick="A.shiftDetail(${s.id})">Ver</button></div>`;
        }).join('')}</div>` : '<div class="rounded-3xl border border-dashed border-line bg-white/70 p-8 text-center text-slate-500">Sin turnos.</div>'}</section></div>`;
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

// Pedidos: miniatura del producto (foto o ícono) y selector de cantidad con − / +
const ordThumb = (p, size) => (p && p.photo
  ? `<img class="${size} shrink-0 rounded-xl object-cover ring-1 ring-line" src="${photoUrl(p)}" alt="">`
  : `<span class="${size} flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ice to-blue-200 text-brand">${icon('productos')}</span>`);
// Cierra el desplegable del buscador de Pedidos al hacer clic fuera de él
document.addEventListener('mousedown', (e) => {
  const box = $('#ores');
  if (box && !box.hidden && !e.target.closest('#ores, #os')) box.hidden = true;
});
// Préstamos: miniatura del implemento (foto o ícono)
const loanThumb = (it, size = 'h-12 w-12') => (it && it.photo
  ? `<img class="${size} shrink-0 rounded-xl object-cover ring-1 ring-line" src="/api/loan-items/${it.id}/photo?v=${it.photo}" alt="">`
  : `<span class="${size} flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ice to-blue-200 text-brand">${icon('productos')}</span>`);
// Logos de medio de pago (efectivo / nequi)
const PAYLOGO = { efectivo: '/efectivo.png', nequi: '/nequi.jpg' };
const payLogo = (m, size = 'h-5 w-5') => (PAYLOGO[m] ? `<img class="${size} inline-block shrink-0 rounded object-contain align-middle" src="${PAYLOGO[m]}" alt="">` : '');
const payTag = (m) => (m ? `<span class="inline-flex items-center gap-1">${payLogo(m)}<span class="capitalize">${m}</span></span>` : '');
// Préstamos: botones tipo selector que escriben su valor en un input oculto
const loanSeg = (id, opts, cur) => `<div class="flex overflow-hidden rounded-xl border border-line bg-white" data-seg="${id}">${opts.map(([v, t]) => `<button type="button" data-v="${v}" onclick="A.loanSeg('${id}','${v}')" class="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold ${v === cur ? 'bg-brand text-white' : 'text-slate-600 hover:bg-ice'}">${t}</button>`).join('')}</div>`;
const ordStep = (dec, inc, n) => `<div class="flex items-center overflow-hidden rounded-xl border border-line bg-ice/50">
  <button class="h-8 w-8 text-lg font-bold text-brand hover:bg-ice" onclick="${dec}">−</button><b class="w-9 text-center text-sm">${n}</b><button class="h-8 w-8 text-lg font-bold text-brand hover:bg-ice" onclick="${inc}">+</button></div>`;

function salesTable(sales, canVoid) {
  if (!sales.length) return '<span class="mute">Sin ventas.</span>';
  return `<table><tr><th>Hora</th><th>Detalle</th><th>Pago</th><th class="n">Total</th><th></th></tr>${sales.map((s) =>
    `<tr style="${s.voided ? 'opacity:.5;text-decoration:line-through' : ''}"><td>${dt(s.created_at).split(', ').pop()}</td>
    <td>${s.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')}</td><td>${s.method === 'mixto' ? `mixto<br><small class="mute">ef ${money(s.cash_amount)} · nq ${money(s.nequi_amount)}</small>` : s.method}</td><td class="n">${money(s.total)}</td>
    <td class="n">${canVoid && !s.voided ? `<button class="btn sec sm" onclick="A.voidSale(${s.id})">Anular</button>` : (s.voided ? '<span class="tag err">Anulada</span>' : '')}</td></tr>`).join('')}</table>`;
}

// ---------- Acciones ----------
const A = window.A = {
  sideOpen() { $('.shell').classList.add('open'); },
  sideClose() { $('.shell').classList.remove('open'); },
  sideCollapse() { const c = $('.shell').classList.toggle('col'); lsSet('side-col', c ? '1' : '0'); },
  async logout() { await api('/logout', 'POST'); S.view = null; S.cart = []; S.benefit = null; clearInterval(S.chatTimer); S.chat = []; S.peerRead = 0; S.peer = null; S.chatOpen = false; S.chatUsers = null; chatShell(); boot(); },
  profile() {
    S.avatar = undefined;
    modal(`<h3>Mi perfil</h3>
      <div class="pf-top"><div id="avbox">${avatar(S.user, 'xl')}</div>
        <div class="pf-btns"><label class="btn sec sm" for="avf">Cambiar foto</label><input id="avf" type="file" accept="image/*" onchange="A.pickAvatar(this)" hidden>
        ${S.user.photo ? '<a href="#" onclick="A.rmAvatar();return false" class="mute">Quitar foto</a>' : ''}</div></div>
      <label>Nombre (puedes usar emojis)</label>
      <div class="pw"><input id="pn" value="${esc(S.user.name)}" autocomplete="off" oninput="A.pcount()"><button type="button" class="eye" id="pemo" onmousedown="event.preventDefault()" onclick="A.profileEmoji()" title="Emojis" aria-label="Emojis">${icon('sonrisa')}</button></div>
      <div id="pnpick" class="cw-pick" hidden></div><small id="pcnt" class="mute"></small>
      <label>Usuario</label><input id="pu" value="${esc(S.user.username)}" autocomplete="off" autocapitalize="none" spellcheck="false">
      <div class="pf-sec"><h4>Seguridad</h4>
        <p class="mute" style="margin:.1rem 0 .3rem;font-size:.82rem">Escribe tu contraseña actual solo si cambias el usuario o la contraseña.</p>
        <label>Contraseña actual</label><input id="pc" type="password" autocomplete="current-password">
        <div class="row"><div><label>Nueva contraseña (mín. 6)</label><input id="pw1" type="password" autocomplete="new-password"></div>
        <div><label>Repetir nueva</label><input id="pw2" type="password" autocomplete="new-password"></div></div></div>
      <div class="row" style="margin-top:1rem"><button class="btn sec" onclick="closeModal()">Cancelar</button><button class="btn" id="psave" onclick="A.saveProfile()">Guardar</button></div>`);
    A.pcount();
  },
  pcount() { const n = Array.from($('#pn').value).length; $('#pcnt').textContent = `${n}/30`; $('#pcnt').style.color = n > 30 ? 'var(--err)' : ''; },
  profileEmoji() {
    const el = $('#pnpick'); el.hidden = !el.hidden; if (el.hidden) return;
    el.innerHTML = `<div class="cw-grid">${EMOJIS.map((e) => `<button type="button" onclick="A.addNameEmoji(this.textContent)">${e}</button>`).join('')}</div>`;
  },
  addNameEmoji(e) {
    const inp = $('#pn'), s = inp.selectionStart ?? inp.value.length, f = inp.selectionEnd ?? s;
    inp.value = inp.value.slice(0, s) + e + inp.value.slice(f); inp.focus();
    const c = s + e.length; inp.setSelectionRange(c, c); A.pcount();
  },
  async pickAvatar(inp) {
    if (!inp.files[0]) return;
    try { S.avatar = await shrink(inp.files[0]); } catch (e) { return toast('No se pudo leer la imagen'); }
    $('#avbox').innerHTML = `<img class="av xl" src="${S.avatar}" alt="">`;
  },
  rmAvatar() { S.avatar = 'remove'; $('#avbox').innerHTML = avatar({ ...S.user, photo: null }, 'xl'); },
  async saveProfile() {
    const name = val('pn').trim(), username = val('pu').trim().toLowerCase(), cur = val('pc'), p1 = val('pw1'), p2 = val('pw2');
    if (!name) return toast('Escribe tu nombre');
    if (Array.from(name).length > 30) return toast('El nombre admite máximo 30 caracteres');
    if (p1 && p1.length < 6) return toast('La nueva contraseña debe tener al menos 6 caracteres');
    if (p1 !== p2) return toast('Las contraseñas nuevas no coinciden');
    if ((p1 || username !== S.user.username) && !cur) return toast('Escribe tu contraseña actual');
    $('#psave').disabled = true;
    try {
      await api('/me/profile', 'PUT', { name, username, current: cur });
      if (S.avatar === 'remove') await api('/me/photo', 'DELETE');
      else if (S.avatar) await api('/me/photo', 'PUT', { image: S.avatar });
      if (p1) await api('/password', 'POST', { current: cur, password: p1 });
    } catch (e) { $('#psave').disabled = false; return toast(e.message); }
    S.avatar = undefined; closeModal(); toast('Perfil actualizado'); boot();
  },
  async saveAvatar() {
    if (!S.avatar) return closeModal();
    const ok = S.avatar === 'remove' ? await act(() => api('/me/photo', 'DELETE'), 'Foto quitada')
      : await act(() => api('/me/photo', 'PUT', { image: S.avatar }), 'Foto actualizada');
    if (ok) { closeModal(); S.avatar = undefined; boot(); }
  },
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
    $('#hours').innerHTML = `${best.total ? `<p>Hora más fuerte: <b>${best.l}</b> (${best.n} ventas · ${money(best.total)})</p>` : '<span class="mute">Sin ventas en este periodo.</span>'}
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
  // Muestra al instante cuánto sobra o falta mientras se escribe lo contado
  cajaDiff() {
    [['cc', 'dcc', S.cajaExp.cash], ['cn', 'dcn', S.cajaExp.nequi]].forEach(([i, o, exp]) => {
      const v = val(i); $('#' + o).innerHTML = v === '' ? '' : diffTag(Number(v) - exp);
    });
  },
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
    const list = S.prods.filter((p) => (S.cat === 'all' || (S.cat === 'fav' ? p.favorite : (p.category || 'Sin categoría') === S.cat))
      && words.every((w) => norm(p.name + ' ' + (p.category || '')).includes(w)))
      .sort((x, y) => y.favorite - x.favorite); // los favoritos van de primeros (el orden es estable)
    $('#grid').innerHTML = list.map((p) => `<button class="prod" data-p="${p.id}" ${p.track_stock && p.stock <= 0 ? 'disabled' : ''} onclick="A.add(${p.id})">
      <span class="fav ${p.favorite ? 'on' : ''}" role="button" aria-label="${p.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}" title="${p.favorite ? 'Quitar de favoritos' : 'Favorito'}" onclick="A.fav(event, ${p.id})">${icon('estrella')}</span>
      ${p.photo ? `<img loading="lazy" src="${photoUrl(p)}" alt="">` : ''}<b>${esc(p.name)}</b>${money(p.sell_price)}<br><small>${p.track_stock ? p.stock + ' disp.' : 'sin control de stock'}</small>${A.badge(p.id)}</button>`).join('') || '<span class="mute">Sin resultados.</span>';
  },
  rp(n) { S.rp = n; views.reportes(); },
  rtab(t) { S.rtab = t; views.reportes(); },
  async fav(e, id) {
    e.stopPropagation();
    const p = S.prods.find((x) => x.id === id); if (!p) return;
    p.favorite = p.favorite ? 0 : 1; A.grid();
    try { await api(`/products/${id}/favorite`, 'POST', { favorite: !!p.favorite }); }
    catch (err) { p.favorite = p.favorite ? 0 : 1; A.grid(); toast(err.message); }
  },
  badge(id) {
    const c = S.cart.find((x) => x.id === id);
    return c ? `<em class="bdg">${c.qty}</em>` : '';
  },
  flash(id) {
    const b = document.querySelector(`.prod[data-p="${id}"]`);
    if (!b) return;
    b.querySelector('.bdg')?.remove();
    b.insertAdjacentHTML('beforeend', A.badge(id));
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  },
  add(id) {
    const p = S.prods.find((x) => x.id === id), c = S.cart.find((x) => x.id === id);
    if (c) { if (!p.track_stock || c.qty < p.stock) c.qty++; else toast('No hay más stock'); } else S.cart.push({ id, qty: 1 });
    A.cart(); A.flash(id);
  },
  chg(id, d) {
    const c = S.cart.find((x) => x.id === id), p = S.prods.find((x) => x.id === id);
    c.qty += d;
    if (p.track_stock && c.qty > p.stock) { c.qty = p.stock; toast('No hay más stock'); }
    if (c.qty <= 0) S.cart = S.cart.filter((x) => x.id !== id);
    A.cart(); A.flash(id);
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
          ? `<small>${icon('regalo')} Beneficio: <b>${esc(S.benefit.name)}</b> · 1 a ${money(p.benefit_price)}</small> <button class="btn sec sm" onclick="S.benefit=null;A.cart()">Quitar</button>`
          : (S.benefit ? '' : `<button class="btn sec sm" onclick="A.benefit(${c.id})">${icon('regalo')} Beneficio (precio de compra)</button>`)}</td></tr>` : '');
    }).join('')}</table>` : '<span class="mute">Toca un producto para agregarlo.</span>') +
      `<p class="total">${money(total)}</p>
      <div class="seg"><button class="${S.method === 'efectivo' ? 'on' : ''}" onclick="S.method='efectivo';A.cart()"><img class="pay" src="/efectivo.png" alt=""> Efectivo</button>
      <button class="${S.method === 'nequi' ? 'on' : ''}" onclick="S.method='nequi';A.cart()"><img class="pay" src="/nequi.jpg" alt=""> Nequi</button>
      <button class="${S.method === 'mixto' ? 'on' : ''}" onclick="S.method='mixto';A.cart()">${icon('mezcla')} Mixto</button></div>
      ${S.method === 'mixto' ? `<label>Pagó por Nequi</label><input id="nq" type="number" inputmode="numeric" min="1" value="${S.nq || ''}" oninput="S.nq=this.value;A.mix(${total})">
      <p id="mix" class="mute"></p>` : ''}
      <p><button class="btn" style="width:100%" ${S.cart.length ? '' : 'disabled'} onclick="A.sell()">Registrar venta</button></p>
      ${S.cart.length ? '<button class="btn sec sm" onclick="S.cart=[];S.benefit=null;A.cart()">Vaciar</button>' : ''}`;
  },
  benefit(pid) {
    modal(`<h3>${icon('regalo')} Beneficio de empanada</h3><p class="mute">La primera empanada del día de cada persona se vende al precio de compra. Solo una vez al día por persona.</p>
      <label>Nombre de la persona</label><input id="bu" maxlength="60" onkeydown="if(event.key==='Enter')A.setBenefit(${pid})">
      <p><button class="btn" onclick="A.setBenefit(${pid})">Aplicar</button></p>`);
  },
  setBenefit(pid) {
    const name = val('bu').trim().replace(/\s+/g, ' ');
    if (!name) return toast('Escribe el nombre de la persona');
    S.benefit = { name, product_id: pid };
    closeModal(); A.cart();
  },
  chatToggle() {
    S.chatOpen = !S.chatOpen; S.chat = [];
    chatDraw(); chatPoll();
  },
  async pick(tab) {
    const el = $('#cwpick'); if (!el) return;
    if (!tab && !el.hidden) { el.hidden = true; return; }
    tab ||= S.pickTab || 'emoji'; S.pickTab = tab; el.hidden = false;
    const tabs = `<div class="cw-tabs"><button class="${tab === 'emoji' ? 'on' : ''}" onclick="A.pick('emoji')">${icon('sonrisa')} Emojis</button><button class="${tab === 'stk' ? 'on' : ''}" onclick="A.pick('stk')">${icon('imagen')} Stickers</button></div>`;
    if (tab === 'emoji') { el.innerHTML = tabs + `<div class="cw-grid">${EMOJIS.map((e) => `<button onclick="A.addEmoji(this.textContent)">${e}</button>`).join('')}</div>`; return; }
    S.stickers = await api('/stickers').catch(() => S.stickers || []);
    if ($('#cwpick') !== el || el.hidden) return;
    el.innerHTML = tabs + `<div class="cw-grid stk">${S.stickers.map((x) => `<span><button onclick="A.sendSticker(${x.id})"><img src="/api/stickers/${x.id}/img" alt="sticker"></button>${x.user_id === S.user.id || S.user.role === 'admin' ? `<i onclick="A.delSticker(${x.id})" title="Borrar">×</i>` : ''}</span>`).join('')}
      <label class="addstk">＋<input type="file" accept="image/*" hidden onchange="A.addSticker(this)"></label></div>`;
  },
  addEmoji(e) { const f = $('#cm'); if (!f) return; f.value += e; f.focus(); },
  async sendSticker(id) {
    $('#cwpick').hidden = true;
    if (await act(() => api('/chat', 'POST', { sticker_id: id, to: S.peer }))) { await chatPoll(); const b = $('#chatlist'); if (b) b.scrollTop = b.scrollHeight; }
  },
  async addSticker(inp) {
    const file = inp.files[0]; if (!file) return;
    let img; try { img = await shrinkSticker(file); } catch { return toast('No se pudo leer la imagen'); }
    if (await act(() => api('/stickers', 'POST', { image: img }), 'Sticker agregado')) A.pick('stk');
  },
  async delSticker(id) {
    if (confirm('¿Borrar este sticker?') && await act(() => api(`/stickers/${id}`, 'DELETE'))) A.pick('stk');
  },
  chatBack() { S.peer = null; S.chat = []; chatDraw(); chatPoll(); },
  async openChat(id) { S.peer = id; S.chat = []; S.peerRead = 0; chatDraw(); await chatPoll(); },
  async say() {
    const body = val('cm').trim();
    if (!body) return;
    $('#cm').value = '';
    const m = await act(() => api('/chat', 'POST', { body, to: S.peer }));
    if (m) { await chatPoll(); const b = $('#chatlist'); if (b) b.scrollTop = b.scrollHeight; }
    const f = $('#cm'); if (f) f.focus();
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
    const a = Number(val('wa')), f = Number(val('wf')), m = val('wm'), d = val('wd');
    if (!(a > 0)) return toast('Escribe el monto');
    const msg = d === 'efectivo_nequi'
      ? `Debes haber recibido ${money(a + (m === 'efectivo' ? f : 0))} en efectivo.\nTransfiere ${money(a)} por Nequi${m === 'nequi' ? ` (y cobra ${money(f)} de comisión por Nequi)` : ''}.\n¿Registrar?`
      : `Entrega ${money(a)} en efectivo.\nDebes haber recibido ${money(m === 'nequi' ? a + f : a)} por Nequi${m === 'efectivo' ? ` y ${money(f)} en efectivo de comisión` : ''}.\n¿Registrar?`;
    if (!confirm(msg)) return;
    if (await act(() => api('/withdrawals', 'POST', { amount: a, fee: f, fee_method: m, direction: d }), 'Retiro registrado')) views.vender();
  },
  async voidWd(id) {
    if (confirm('¿Anular este retiro? El dinero se revierte.') && await act(() => api(`/withdrawals/${id}/void`, 'POST'), 'Retiro anulado')) views.vender();
  },
  async voidSale(id) {
    if (!confirm('¿Anular esta venta? El stock y el dinero se revierten.')) return;
    if (await act(() => api(`/sales/${id}/void`, 'POST'), 'Venta anulada')) boot();
  },

  // Productos
  pgrid() {
    const words = norm(S.pq).split(/\s+/).filter(Boolean), admin = S.user.role === 'admin';
    const st = (p) => (!p.track_stock ? 'free' : p.stock <= 0 ? 'out' : p.stock <= p.min_stock ? 'low' : 'ok');
    const list = S.prods.filter((p) => (S.pcat === 'all' || (p.category || 'Sin categoría') === S.pcat)
      && (S.pst === 'all' || (S.pst === 'off' ? !p.active : p.active && st(p) === S.pst))
      && words.every((w) => norm(p.name + ' ' + (p.category || '')).includes(w)));
    $('#pgrid').innerHTML = list.map((p, i) => productCard(p, admin, st(p), i)).join('') || '<div class="card mute" style="grid-column:1/-1">Sin resultados.</div>';
  },
  pset(k, v) { S[k] = v; document.querySelectorAll(`[data-pf="${k}"]`).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); A.pgrid(); },

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
      <div class="row" id="stk" style="${p.track_stock ? '' : 'display:none'}">${id ? `<div><label>Stock actual</label><input id="pfq" type="number" inputmode="numeric" min="0" value="${p.stock}"></div>` : '<div><label>Cantidad inicial</label><input id="pfq" type="number" min="0" value="0"></div>'}
      <div><label>Avisar si stock ≤</label><input id="pm" type="number" min="0" value="${p.min_stock}"></div></div>
      ${id ? `<label><input type="checkbox" id="pa" style="width:auto" ${p.active ? 'checked' : ''}> Activo (visible para vender)</label>` : ''}
      <p><button class="btn" onclick="A.saveProduct(${id || 0})">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async saveProduct(id) {
    const body = { name: val('pn'), category_id: val('pc'), buy_price: val('pb'), sell_price: val('ps'), min_stock: val('pm'), track_stock: $('#pt').checked };
    if (id) { body.active = $('#pa').checked; if ($('#pt').checked) body.stock = val('pfq'); } else body.stock = val('pfq');
    const r = await act(() => api(id ? `/products/${id}` : '/products', id ? 'PUT' : 'POST', body), 'Guardado');
    if (!r) return;
    const pid = id || r.id, photo = S.photo;
    S.photo = undefined; closeModal();
    // refleja el cambio al instante y recarga en segundo plano
    const cur = id && S.prods.find((x) => x.id === id);
    if (cur) {
      Object.assign(cur, { name: body.name, buy_price: +body.buy_price, sell_price: +body.sell_price, min_stock: +body.min_stock, track_stock: body.track_stock ? 1 : 0, active: body.active ? 1 : 0 });
      if (body.stock !== undefined) cur.stock = +body.stock;
      A.pgrid();
    }
    if (photo === 'remove') await act(() => api(`/products/${pid}/photo`, 'DELETE'));
    else if (photo) await act(() => api(`/products/${pid}/photo`, 'PUT', { image: photo }));
    boot();
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

  filterWo() {
    const q = val('wsq').trim().toLowerCase();
    document.querySelectorAll('#wot tr[data-s]').forEach((r) => { r.style.display = r.dataset.s.includes(q) ? '' : 'none'; });
  },
  async writeOff(all) {
    const items = [...document.querySelectorAll('.wq')].filter((i) => i.closest('tr').style.display !== 'none').map((i) => ({ product_id: +i.dataset.id, qty: all ? +i.max : +i.value })).filter((i) => i.qty > 0);
    if (!items.length) return toast('Indica cuántas unidades descartar');
    const cost = items.reduce((t, i) => { const p = S.prods.find((x) => x.id === i.product_id); return t + (/^(empanada|vitrina)/i.test(p.category || '') ? 0 : i.qty * p.buy_price); }, 0);
    if (!confirm(`${all ? '¿Vaciar el stock de los productos mostrados?' : '¿Descartar estos productos?'} Se registra una pérdida de ${money(cost)}.`)) return;
    const r = await act(() => api('/write-offs', 'POST', { items, note: val('wn') }));
    if (r) { toast(`Pérdida registrada: ${money(r.total)}`); boot(); }
  },
  async writeOffReport() {
    const iso = (t) => t.toISOString().slice(0, 10);
    const n = new Date(Date.now() - 5 * 36e5);
    const to = val('wt') || iso(n); n.setUTCDate(n.getUTCDate() - 6);
    const from = val('wf') || iso(n);
    const r = await act(() => api(`/write-offs?from=${from}&to=${to}`));
    if (!r) return;
    const by = {};
    r.rows.forEach((x) => { const o = by[x.product] ||= { qty: 0, loss: 0 }; o.qty += x.qty; o.loss += x.qty * x.cost; });
    $('#wr').innerHTML = `<p>Pérdida total del ${from} al ${to}: <b class="err">${money(r.total)}</b></p>` + (r.rows.length
      ? `<table><tr><th>Producto</th><th class="n">Unidades</th><th class="n">Pérdida</th></tr>${Object.entries(by).map(([k, o]) => `<tr><td>${esc(k)}</td><td class="n">${o.qty}</td><td class="n">${money(o.loss)}</td></tr>`).join('')}</table>
      <h3 style="margin-top:1rem">Detalle</h3><table><tr><th>Fecha</th><th>Quién</th><th>Producto</th><th class="n">Cant.</th><th class="n">Pérdida</th><th>Motivo</th></tr>
      ${r.rows.map((x) => `<tr><td>${dt(x.created_at)}</td><td>${esc(x.user)}</td><td>${esc(x.product)}</td><td class="n">${x.qty}</td><td class="n">${money(x.qty * x.cost)}</td><td>${esc(x.note || '')}</td></tr>`).join('')}</table>`
      : '<span class="mute">Sin descartes en este rango.</span>');
  },

  async payout(cat, i, total, name) {
    const m = val('pm' + i), payee = val('pp' + i).trim();
    if (!payee) return toast('Escribe a nombre de quién se paga');
    if (!confirm(`¿Pagar ${money(total)} a ${payee} por ${name} con ${m}? Se descuenta de la caja.`)) return;
    if (await act(() => api('/payouts', 'POST', { product_id: cat, method: m, payee }), 'Pago registrado')) views.emprendimientos();
  },

  kind(k) {
    S.kind = k;
    [['k1', 'pedido'], ['k2', 'implementos']].forEach(([id, v]) => {
      const on = k === v, b = $('#' + id);
      b.classList.toggle('bg-brand', on); b.classList.toggle('text-white', on); b.classList.toggle('text-slate-600', !on); b.classList.toggle('hover:bg-ice', !on);
    });
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
      ${S.user.role === 'admin' && closed ? `${s.orig_close_cash != null ? `<p class="mute">Conteo corregido. Original: efectivo ${money(s.orig_close_cash)} · Nequi ${money(s.orig_close_nequi)}</p>` : ''}
      <div class="card"><h3>Corregir conteo (error de digitación)</h3><div class="row"><div><label>Efectivo contado real</label><input id="fcc" type="number" inputmode="numeric" min="0" value="${s.close_cash}"></div>
      <div><label>Nequi contado real</label><input id="fcn" type="number" inputmode="numeric" min="0" value="${s.close_nequi}"></div></div>
      <button class="btn sec sm" onclick="A.fixCount(${s.id})">Guardar corrección</button></div>` : ''}
      <div class="tw">${salesTable(s.sales, S.user.role === 'admin')}</div>
      <p><button class="btn" onclick="closeModal()">Cerrar</button></p>`);
  },

  // Pedidos
  ordDraft() {
    const d = S.orderDraft;
    $('#odraft').innerHTML = d.items.length ? `<div class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">En este pedido (${d.items.length})</div><div class="flex flex-col gap-2">${d.items.map((i, k) => `<div class="flex items-center gap-3 rounded-2xl border border-line bg-white p-2 pr-3 shadow-sm">
      ${ordThumb(i.product_id ? S.prods.find((p) => p.id === i.product_id) : null, 'h-12 w-12')}
      <div class="min-w-0 flex-1"><div class="truncate text-sm font-bold text-slate-800">${esc(i.name)}</div>${i.product_id ? '' : '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">PRODUCTO NUEVO</span>'}</div>
      ${ordStep(`A.ordQty(${k},-1)`, `A.ordQty(${k},1)`, i.qty)}
      <button class="flex h-8 w-8 items-center justify-center rounded-full text-rose-500 hover:bg-rose-50" aria-label="Quitar" onclick="S.orderDraft.items.splice(${k},1);A.ordDraft()">✕</button></div>`).join('')}</div>` : '';
  },
  ordQty(k, dlt) {
    const it = S.orderDraft.items[k]; it.qty = Math.max(1, it.qty + dlt); A.ordDraft();
  },
  ordFind() {
    const q = norm(val('os')).trim(), box = $('#ores');
    const list = S.prods.filter((p) => p.active && p.track_stock && (!q || norm(p.name + ' ' + (p.category || '')).includes(q))).slice(0, 30);
    box.innerHTML = list.map((p) => `<button type="button" class="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-ice" onclick="A.ordPick(${p.id})">
        ${ordThumb(p, 'h-11 w-11')}<span class="min-w-0 flex-1"><b class="block truncate text-sm text-slate-800">${esc(p.name)}</b><small class="text-slate-500">${esc(p.category || 'Sin categoría')}</small></span>
        <span class="rounded-full px-2 py-0.5 text-xs font-bold ${p.stock <= 0 ? 'bg-rose-100 text-rose-700' : p.stock <= p.min_stock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">stock ${p.stock}</span></button>`).join('')
      + `<button type="button" class="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-brand/40 p-2.5 text-left text-sm font-bold text-brand hover:bg-ice" onclick="A.ordNewProduct(this.dataset.n)" data-n="${esc(val('os').trim())}">＋ ${list.length ? '¿No está? Crear' : 'No existe: crear'} producto nuevo${val('os').trim() ? ` «${esc(val('os').trim())}»` : ''}</button>`;
    box.hidden = false;
  },
  ordPick(id) {
    const p = S.prods.find((x) => x.id === id); S.ordSel = id;
    $('#ores').hidden = true; $('#os').value = '';
    $('#osel').innerHTML = `<div class="mt-3 flex items-center gap-3 rounded-2xl border-2 border-brand/30 bg-ice/60 p-3">
      ${ordThumb(p, 'h-16 w-16')}
      <div class="min-w-0 flex-1"><b class="block truncate text-slate-800">${esc(p.name)}</b><small class="text-slate-500">${esc(p.category || 'Sin categoría')} · stock actual ${p.stock}</small></div>
      <input id="oq" type="number" inputmode="numeric" min="1" placeholder="Cant." class="!w-20 !text-center !text-lg !font-extrabold" onkeydown="if(event.key==='Enter')A.ordAdd();if(event.key==='Escape')A.ordUnpick()">
      <button class="btn !rounded-xl" onclick="A.ordAdd()">Agregar</button>
      <button class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white hover:text-rose-500" aria-label="Quitar selección" title="Elegir otro producto" onclick="A.ordUnpick()">✕</button></div>`;
    $('#oq').focus();
  },
  ordUnpick() {
    S.ordSel = null; $('#osel').innerHTML = ''; $('#os').focus(); A.ordFind();
  },
  ordAdd() {
    const id = S.ordSel, qty = +val('oq');
    if (!id) return toast('Elige un producto');
    if (!(qty > 0)) return toast('Escribe la cantidad');
    const p = S.prods.find((x) => x.id === id), it = S.orderDraft.items.find((x) => x.product_id === id);
    if (it) it.qty += qty; else S.orderDraft.items.push({ product_id: id, name: p.name, qty });
    S.ordSel = null; $('#osel').innerHTML = ''; A.ordDraft(); $('#os').focus();
  },
  ordNewProduct(name = '') {
    $('#ores').hidden = true;
    modal(`<h3>Producto nuevo</h3><p class="mute">Se crea en Productos cuando recibas el pedido. El admin puede ajustar su precio de compra después.</p>
      <label>Nombre</label><input id="nn" maxlength="80" value="${esc(name)}">
      <label>Categoría</label><select id="nc"><option value="">Sin categoría</option>${S.cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <div class="row"><div><label>Precio de venta</label><input id="np" type="number" inputmode="numeric" min="0" value="0"></div>
      <div><label>Cantidad pedida</label><input id="nq" type="number" inputmode="numeric" min="1"></div></div>
      <p><button class="btn" onclick="A.ordAddNew()">Agregar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  ordAddNew() {
    const name = val('nn').trim(), qty = +val('nq');
    if (!name) return toast('Escribe el nombre');
    if (!(qty > 0)) return toast('Escribe la cantidad');
    S.orderDraft.items.push({ new_name: name, new_category_id: val('nc'), new_sell_price: val('np') || 0, name, qty });
    closeModal(); A.ordDraft();
  },
  async ordSave() {
    const d = S.orderDraft;
    if (!d.items.length) return toast('Agrega al menos un producto');
    if (!(Number(d.total) > 0)) return toast('Escribe el valor total del pedido');
    const items = d.items.map(({ product_id, new_name, new_category_id, new_sell_price, qty }) => ({ product_id, new_name, new_category_id, new_sell_price, qty }));
    if (await act(() => api('/orders', 'POST', { items, total: d.total, note: d.note }), 'Pedido registrado')) { S.orderDraft = null; views.pedidos(); }
  },
  ordReceive(id) {
    const o = S.ordPending.find((x) => x.id === id);
    modal(`<h3>Recibir pedido #${o.id}</h3><p class="mute">Pedido por ${esc(o.who)}. Verifica que llegó cada producto y corrige la cantidad si faltó algo.</p>
      <table><tr><th>Producto</th><th class="n">Pedido</th><th class="n">Llegó</th></tr>${o.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="n">${i.qty}</td>
        <td class="n"><input class="rq" data-id="${i.id}" type="number" inputmode="numeric" min="0" value="${i.qty}" style="width:5rem"></td></tr>`).join('')}</table>
      <div class="row"><div><label>Valor pagado (pedido: ${money(o.total)})</label><input id="rp" type="number" inputmode="numeric" min="1" value="${o.total}"></div>
      <div><label>Pagado con</label><input type="hidden" id="rm" value="efectivo">${loanSeg('rm', [['efectivo', payLogo('efectivo') + ' Efectivo'], ['nequi', payLogo('nequi') + ' Nequi']], 'efectivo')}</div></div>
      <p><button class="btn" onclick="A.ordDone(${o.id})">Recibir y pagar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async ordDone(id) {
    const o = S.ordPending.find((x) => x.id === id), paid = Number(val('rp')), m = val('rm');
    const items = [...document.querySelectorAll('.rq')].map((i) => ({ id: +i.dataset.id, qty: i.value === '' ? -1 : +i.value }));
    if (items.some((i) => i.qty < 0)) return toast('Indica cuánto llegó de cada producto');
    if (!(paid > 0)) return toast('Escribe el valor pagado');
    const short = items.some((i) => i.qty !== o.items.find((x) => x.id === i.id).qty);
    if (!confirm(`Se suma al stock lo que llegó${short ? ' (hay diferencias con lo pedido)' : ''} y se descuentan ${money(paid)} de la caja (${m})${paid !== Number(o.total) ? `.\nOJO: el pedido se registró por ${money(o.total)}` : ''}.\n¿Confirmar?`)) return;
    if (await act(() => api(`/orders/${id}/receive`, 'POST', { paid, method: m, items }), 'Pedido recibido y pagado')) { closeModal(); views.pedidos(); }
  },
  async ordCancel(id) {
    if (confirm('¿Cancelar este pedido pendiente?') && await act(() => api(`/orders/${id}/cancel`, 'POST'), 'Pedido cancelado')) views.pedidos();
  },

  // Préstamo de implementos
  async loan() {
    const fee = Number(val('lf')) || 0, m = val('lm');
    const sel = Object.entries(S.loanSel || {}).filter(([, q]) => q > 0).map(([id, q]) => ({ item_id: +id, qty: q }));
    const body = { items: sel, borrower: val('lb'), fee, method: m, days: val('ld') };
    if (!sel.length) return toast('Elige al menos un implemento');
    if (!body.borrower.trim()) return toast('Escribe el nombre de la persona');
    if (fee > 0 && !confirm(`Debes haber recibido ${money(fee)} en ${m}. ¿Registrar el préstamo?`)) return;
    if (await act(() => api('/loans', 'POST', body), 'Préstamo registrado')) views.prestamos();
  },
  async loanReturn(id) {
    if (confirm('¿Confirmas que el implemento fue devuelto?') && await act(() => api(`/loans/${id}/return`, 'POST'), 'Devolución registrada')) views.prestamos();
  },
  async loanVoid(id) {
    if (confirm('¿Anular este préstamo? El dinero se revierte de la caja y el implemento queda libre.') && await act(() => api(`/loans/${id}/void`, 'POST'), 'Préstamo anulado')) views.prestamos();
  },
  loanItemForm(id) {
    S.photo = undefined;
    const i = id ? S.loanItems.find((x) => x.id === id) : { name: '', qty: 1, active: 1 };
    modal(`<h3>${id ? 'Editar' : 'Nuevo'} implemento</h3>
      <label>Foto (opcional)</label>
      <img id="pimg" class="pprev" ${i.photo ? `src="/api/loan-items/${i.id}/photo?v=${i.photo}"` : 'style="display:none"'} alt="">
      <input id="pf" type="file" accept="image/*" onchange="A.pickPhoto(this)">
      ${i.photo ? '<a href="#" onclick="A.rmPhoto();return false" class="mute">Quitar foto</a>' : ''}
      <label>Nombre</label><input id="ln" maxlength="80" value="${esc(i.name)}">
      <label>Cantidad total</label><input id="lq" type="number" inputmode="numeric" min="1" value="${i.qty}">
      ${id ? `<label><input type="checkbox" id="la" style="width:auto" ${i.active ? 'checked' : ''}> Activo (se puede prestar)</label>` : ''}
      <p><button class="btn" onclick="A.saveLoanItem(${id || 0})">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async saveLoanItem(id) {
    const body = { name: val('ln'), qty: val('lq') };
    if (id) body.active = $('#la').checked;
    const r = await act(() => api(id ? `/loan-items/${id}` : '/loan-items', id ? 'PUT' : 'POST', body), 'Guardado');
    if (!r) return;
    const pid = id || r.id, photo = S.photo;
    S.photo = undefined; closeModal();
    if (photo === 'remove') await act(() => api(`/loan-items/${pid}/photo`, 'DELETE'));
    else if (photo) await act(() => api(`/loan-items/${pid}/photo`, 'PUT', { image: photo }));
    views.prestamos();
  },
  loanChg(id, d) {
    const it = S.loanItems.find((x) => x.id === id);
    const q = Math.max(0, Math.min(it.available, ((S.loanSel || (S.loanSel = {}))[id] || 0) + d));
    S.loanSel[id] = q;
    $('#lq' + id).textContent = q;
    const b = document.querySelector(`.litem[data-i="${id}"]`);
    b.classList.toggle('border-brand', q > 0); b.classList.toggle('bg-ice', q > 0); b.classList.toggle('shadow-md', q > 0);
  },
  loanSeg(id, v) {
    $('#' + id).value = v;
    if (id === 'ld') $('#lf').value = Number(v) * 1000; // 1 día = $1.000, 2 días = $2.000 (se puede cambiar a mano)
    document.querySelectorAll(`[data-seg="${id}"] button`).forEach((b) => {
      const on = b.dataset.v === v;
      b.classList.toggle('bg-brand', on); b.classList.toggle('text-white', on); b.classList.toggle('text-slate-600', !on);
    });
  },

  async fixCount(id) {
    if (!confirm('¿Corregir el conteo de este cierre? Se recalcula el descuadre y queda registrado el valor original.')) return;
    if (await act(() => api(`/shifts/${id}/fix-count`, 'POST', { cash: val('fcc'), nequi: val('fcn') }), 'Conteo corregido')) { closeModal(); views.turnos(); }
  },

  // Usuarios
  userForm(id) {
    const u = id ? S.users.find((x) => x.id === id) : { name: '', username: '', role: 'turno', active: 1 };
    modal(`<h3>${id ? 'Editar' : 'Nuevo'} usuario</h3>
      <label>Nombre</label><input id="un" value="${esc(u.name)}">
      <label>Usuario (para ingresar)</label><input id="uu" value="${esc(u.username)}" ${id ? 'disabled' : ''} autocapitalize="none">
      <label>Rol</label><select id="ur"><option value="turno" ${u.role === 'turno' ? 'selected' : ''}>Turno (vende)</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Administrador</option></select>
      <label>${id ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña (mín. 6)'}</label><input id="up" type="password" autocomplete="new-password">
      ${id ? `<label><input type="checkbox" id="ue" style="width:auto" ${u.can_emp ? 'checked' : ''}> Puede pagar Emprendimientos</label><label><input type="checkbox" id="ua" style="width:auto" ${u.active ? 'checked' : ''}> Activo</label>` : ''}
      <p><button class="btn" onclick="A.saveUser(${id || 0})">Guardar</button> <button class="btn sec" onclick="closeModal()">Cancelar</button></p>`);
  },
  async saveUser(id) {
    const body = { name: val('un'), role: val('ur'), password: val('up') };
    if (id) { body.active = $('#ua').checked; body.can_emp = $('#ue').checked; if (!body.password) delete body.password; } else body.username = val('uu');
    if (await act(() => api(id ? `/users/${id}` : '/users', id ? 'PUT' : 'POST', body), 'Guardado')) { closeModal(); boot(); }
  },
};
window.closeModal = closeModal; window.boot = boot;

boot();

// Tarjetas de datos: según el texto de la etiqueta se les da color e icono
const STAT_TONES = [
  [/nequi/i, 'nequi', 'caja'], [/efectivo/i, 'cash', 'dinero'], [/p[eé]rdida|descart/i, 'loss', 'gastos'],
  [/gasto|implemento|comisi/i, 'exp', 'gastos'], [/pedido/i, 'orders', 'productos'], [/ganancia/i, 'gain', 'reportes'], [/rentabilidad/i, 'gain', 'reportes'], [/pagad|por pagar/i, 'ped', 'dinero'],
  [/inventario/i, 'inv', 'productos'], [/inicio|deber[ií]a/i, 'slate', 'turnos'], [/agotad/i, 'loss', 'gastos'], [/stock bajo/i, 'exp', 'gastos'], [/productos activos/i, 'inv', 'productos'], [/ticket|promedio/i, 'inv', 'reportes'], [/mejor/i, 'ped', 'reportes'], [/salida/i, 'loss', 'gastos'], [/saldo|entrada/i, 'gain', 'dinero'], [/venta|total/i, 'sales', 'vender'],
];
function decorateStats(root = document) {
  root.querySelectorAll('.stat:not([data-t])').forEach((el) => {
    const label = (el.querySelector('span') || {}).textContent || '';
    const [, tone, ic] = STAT_TONES.find(([re]) => re.test(label)) || [0, 'sales', 'resumen'];
    el.dataset.t = tone;
    const logo = { cash: '/efectivo.png', nequi: '/nequi.jpg', orders: '/pedidos.png' }[tone];
    el.insertAdjacentHTML('afterbegin', logo ? `<i class="si logo"><img src="${logo}" alt=""></i>` : `<i class="si">${icon(ic)}</i>`);
  });
}
new MutationObserver(() => decorateStats()).observe(document.body, { childList: true, subtree: true });

// ---------- Reportes: panel de análisis ----------
const RANGOS = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '12 meses']];
const BUCKETS = ['< $2k', '$2–4k', '$4–6k', '$6–8k', '$8–10k', '$10–15k', '$15–20k', '$20–30k', '$30k +'];
const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const smoney = (n) => (n < 0 ? '−' + money(-n) : money(n));
function reportPanel(tr) {
  if (tr.error) return `<div class="alert bad">No se pudo cargar el panel de análisis: ${esc(tr.error)}</div>`;
  const t = tr.totals, p = tr.previous, span = tr.days.length;
  const sel = `<div class="seg rsel">${RANGOS.map(([n, l]) => `<button class="${S.rp === n ? 'on' : ''}" onclick="A.rp(${n})">${l}</button>`).join('')}</div>`;
  if (!t.n) return `${sel}<div class="card"><span class="mute">Sin ventas en este periodo.</span></div>`;
  const net = t.profit - t.impl - t.lost, pnet = p.profit - p.impl - p.lost;
  const out = tr.days.reduce((s, d) => s + d.out, 0), balance = t.total - out;
  const best = tr.days.reduce((b, d) => (d.total > b.total ? d : b), tr.days[0]);
  const dl = (x, y) => (y ? `<small class="${x >= y ? 'ok' : 'err'}">${x >= y ? '▲' : '▼'} ${Math.abs(Math.round((x - y) / y * 100))}% vs periodo anterior</small>` : '');
  const bestLbl = new Date(best.day + 'T12:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' });
  const lg = (...xs) => `<div class="lg">${xs.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;
  const C = Charts.COLOR;
  return `${sel}
    <div class="grid">
      <div class="stat"><span>Ventas (${t.n})</span><b>${money(t.total)}</b>${dl(t.total, p.total)}</div>
      <div class="stat"><span>Ganancia neta</span><b>${smoney(net)}</b>${dl(net, pnet)}</div>
      <div class="stat"><span>Margen de ganancia</span><b>${t.total ? (t.profit / t.total * 100).toFixed(1).replace('.', ',') : 0}%</b><small>Ganancia ${money(t.profit)} sobre ventas</small></div>
      <div class="stat"><span>Ticket promedio</span><b>${money(Math.round(tr.ticket.avg))}</b><small>Mediana ${money(Math.round(tr.ticket.median))} · máx. ${money(tr.ticket.max)}</small></div>
      <div class="stat"><span>Entradas</span><b>${money(t.total)}</b><small>${money(Math.round(t.total / span))} por día · ${(t.n / span).toFixed(1).replace('.', ',')} ventas/día</small></div>
      <div class="stat"><span>Salidas de dinero</span><b>${money(out)}</b><small>Gastos, pedidos y pagos a emprendimientos</small></div>
      <div class="stat"><span>Saldo (entradas − salidas)</span><b>${smoney(balance)}</b><small>${tr.units} unidades vendidas</small></div>
      <div class="stat"><span>Mejor día</span><b style="font-size:1.15rem">${bestLbl[0].toUpperCase() + bestLbl.slice(1)}</b><small>${money(best.total)} en ${best.n} ventas</small></div>
    </div><br>
    <div class="card"><h3>Ventas y ganancia por día</h3>${lg([C.ventas, 'Ventas'], [C.ganancia, 'Ganancia'])}<div id="ch1"></div>
      <details class="dt"><summary>Ver tabla de datos</summary><div class="tw"><table><tr><th>Día</th><th class="n">Ventas</th><th class="n">Ganancia</th><th class="n">Efectivo</th><th class="n">Nequi</th><th class="n">Salidas</th><th class="n">#</th></tr>
      ${tr.days.filter((d) => d.n || d.out).reverse().map((d) => `<tr><td>${d.day}</td><td class="n">${money(d.total)}</td><td class="n">${money(d.profit)}</td><td class="n">${money(d.cash)}</td><td class="n">${money(d.nequi)}</td><td class="n">${money(d.out)}</td><td class="n">${d.n}</td></tr>`).join('')}</table></div></details></div>
    <div class="card"><h3>Dinero que entra y sale</h3>${lg([C.ventas, 'Entradas (ventas)'], [C.gasto, 'Salidas (gastos, pedidos y pagos)'])}<div id="ch2"></div></div>
    <div class="grid2">
      <div class="card"><h3>Ventas y ganancia por semana</h3>${lg([C.ventas, 'Ventas'], [C.ganancia, 'Ganancia neta'])}<div id="ch3"></div></div>
      <div class="card"><h3>Ganancia neta acumulada</h3><div id="ch4"></div></div>
    </div>
    <div class="grid3">
      <div class="card"><h3>¿Cómo se cobró?</h3><div id="dn1"></div></div>
      <div class="card"><h3>Ventas por categoría</h3><div id="dn2"></div></div>
      <div class="card"><h3>¿A dónde sale el dinero?</h3><div id="dn3"></div></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Histograma: valor de cada venta</h3><p class="mute sub">Cuántas ventas caen en cada rango de valor.</p><div id="hs1"></div></div>
      <div class="card"><h3>Ventas por hora del día</h3><p class="mute sub">Dinero vendido en cada hora.</p><div id="hs2"></div></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>Ventas por día de la semana</h3><div id="hs3"></div></div>
      <div class="card"><h3>Productos que más ingresan</h3><div id="ch5"></div></div>
    </div>
    <div class="card"><h3>De ventas a ganancia neta</h3><div id="ch6"></div>
      <p class="mute" style="margin:.7rem 0 0;font-size:.82rem">Reposición pagada a proveedores (pedidos): <b>${money(t.ped)}</b>. No resta aquí porque ya está dentro del costo de los productos vendidos.</p></div>`;
}
function reportCharts(tr) {
  if (tr.error || !$('#ch1')) return;
  const t = tr.totals, C = Charts.COLOR, net = t.profit - t.impl - t.lost, days = tr.days;
  // diario
  Charts.series($('#ch1'), { days, bars: { key: 'total', label: 'Ventas', color: C.ventas }, lines: [{ key: 'profit', label: 'Ganancia', color: C.ganancia }], label: 'Ventas y ganancia por día' });
  Charts.series($('#ch2'), { days, lines: [{ key: 'total', label: 'Entradas', color: C.ventas }, { key: 'out', label: 'Salidas', color: C.gasto }], label: 'Dinero que entra y sale por día' });
  let acc = 0;
  const cum = days.map((d) => ({ day: d.day, net: (acc += d.profit - d.impl - d.lost) }));
  Charts.series($('#ch4'), { days: cum, lines: [{ key: 'net', label: 'Ganancia neta acumulada', color: C.ganancia, area: true, last: true }], label: 'Ganancia neta acumulada' });
  // por semana (lunes a domingo)
  const weeks = new Map();
  days.forEach((d) => {
    const dt0 = new Date(d.day + 'T12:00:00Z'); dt0.setUTCDate(dt0.getUTCDate() - ((dt0.getUTCDay() + 6) % 7));
    const k = dt0.toISOString().slice(0, 10), w = weeks.get(k) || { k, total: 0, net: 0, n: 0 };
    w.total += d.total; w.net += d.profit - d.impl - d.lost; w.n += d.n; weeks.set(k, w);
  });
  const wk = [...weeks.values()], short = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  Charts.columns($('#ch3'), { cats: wk.map((w) => ({ l: short(w.k), t: 'Semana del ' + short(w.k) })), rows: wk,
    series: [{ key: 'total', label: 'Ventas', color: C.ventas }, { key: 'net', label: 'Ganancia neta', color: C.ganancia }], label: 'Ventas y ganancia por semana',
    extra: (w) => `<div class="tt"><span>Ventas realizadas</span><b>${w.n}</b></div>` });
  // circulares
  const cash = days.reduce((s, d) => s + d.cash, 0), nq = days.reduce((s, d) => s + d.nequi, 0);
  Charts.donut($('#dn1'), [{ label: 'Efectivo', value: cash, color: C.efectivo }, { label: 'Nequi', value: nq, color: C.nequi }], 'cobrado');
  const cats = tr.cats.map((c, i) => ({ label: c.name, value: c.total, color: Charts.CAT[i] }));
  const rest = cats.slice(Charts.CAT.length).reduce((s, c) => s + c.value, 0);
  Charts.donut($('#dn2'), cats.slice(0, Charts.CAT.length).concat(rest ? [{ label: 'Otras', value: rest, color: C.otros }] : []), 'vendido');
  const pay = days.reduce((s, d) => s + d.pay, 0);
  Charts.donut($('#dn3'), [{ label: 'Implementos', value: t.impl, color: '#eb6834' }, { label: 'Pedidos', value: t.ped, color: '#e87ba4' }, { label: 'Emprendimientos', value: pay, color: '#008300' }], 'salidas');
  // histogramas
  Charts.columns($('#hs1'), { cats: BUCKETS.map((l) => ({ l, t: 'Ventas de ' + l })), rows: tr.buckets.map((n) => ({ n })), series: [{ key: 'n', label: 'Ventas', color: C.ventas }], fmt: 'n', label: 'Histograma del valor de cada venta' });
  const hrs = Array.from({ length: 24 }, (_, h) => ({ h, ...(tr.hours.find((x) => x.h === h) || { n: 0, total: 0 }) })).filter((x) => x.n || (x.h >= 7 && x.h <= 21));
  Charts.columns($('#hs2'), { cats: hrs.map((x) => ({ l: `${x.h % 12 || 12}${x.h < 12 ? 'a' : 'p'}`, t: `${x.h % 12 || 12}:00 ${x.h < 12 ? 'am' : 'pm'}` })), rows: hrs,
    series: [{ key: 'total', label: 'Vendido', color: C.ventas }], label: 'Ventas por hora', extra: (x) => `<div class="tt"><span>Ventas realizadas</span><b>${x.n}</b></div>` });
  const dws = DOW.map((l, i) => ({ l, ...(tr.dows.find((x) => x.d === i + 1) || { n: 0, total: 0 }) }));
  Charts.columns($('#hs3'), { cats: dws.map((x) => ({ l: x.l })), rows: dws, series: [{ key: 'total', label: 'Vendido', color: C.ventas }], label: 'Ventas por día de la semana',
    extra: (x) => `<div class="tt"><span>Ventas realizadas</span><b>${x.n}</b></div>` });
  Charts.hbars($('#ch5'), tr.top.map((p) => ({ label: p.name, value: p.total, color: C.ventas, text: `${p.qty} uds · ${money(p.total)}` })));
  const neg = (v) => (v ? '−' + money(v) : money(0));
  Charts.hbars($('#ch6'), [
    { label: 'Ventas', value: t.total, color: C.ventas },
    { label: 'Costo de productos', value: tr.cogs, color: C.gasto, text: neg(tr.cogs) },
    { label: 'Gastos de implementos', value: t.impl, color: C.gasto, text: neg(t.impl) },
    { label: 'Pérdidas por descartes', value: t.lost, color: C.gasto, text: neg(t.lost) },
    { label: 'Comisiones de retiros', value: tr.fees, color: C.ganancia, text: '+' + money(tr.fees) },
    { label: 'Ganancia neta', value: Math.max(0, net), color: C.ganancia, text: `<strong>${smoney(net)}</strong>` },
  ], Math.max(t.total, 1));
}

// ---------- Reportes: emprendimientos (rentabilidad y pérdidas) ----------
const reportTabs = () => S.user.role !== 'admin' ? '' : `<div class="seg rtabs"><button class="${S.view === 'rentabilidad' ? '' : 'on'}" onclick="go('reportes')">General</button><button class="${S.view === 'rentabilidad' ? 'on' : ''}" onclick="go('rentabilidad')">Emprendimientos</button></div>`;
const pctOf = (x, y) => (y ? (x / y * 100).toFixed(1).replace('.', ',') + '%' : '—');
function empPanel(er) {
  const sel = `<div class="seg rsel">${RANGOS.map(([n, l]) => `<button class="${S.rp === n ? 'on' : ''}" onclick="A.rp(${n})">${l}</button>`).join('')}</div>`;
  if (er.error) return `${sel}<div class="alert bad">No se pudo cargar: ${esc(er.error)}</div>`;
  const t = er.totals, p = er.previous, rows = [...er.products].sort((x, y) => y.net - x.net);
  if (!rows.length) return `${sel}<div class="card"><span class="mute">Sin ventas ni descartes de emprendimientos en este periodo.</span></div>`;
  const dl = (x, y, inv) => (y ? `<small class="${(x >= y) !== !!inv ? 'ok' : 'err'}">${x >= y ? '▲' : '▼'} ${Math.abs(Math.round((x - y) / Math.abs(y) * 100))}% vs periodo anterior</small>` : ''); // inv: subir es malo (pérdidas)
  const units = t.sold_qty + t.lost_qty, worst = [...rows].filter((r) => r.lost_paid > 0).sort((x, y) => y.lost_paid - x.lost_paid)[0];
  const best = rows[0], pctLoss = pctOf(t.lost_paid, t.margin), pay = Math.round(er.lost_pay * 100);
  const lg = (...xs) => `<div class="lg">${xs.map(([c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;
  const C = Charts.COLOR;
  const insights = [
    `La rentabilidad neta de los emprendimientos es <b>${pctOf(t.net, t.revenue)}</b> de lo que se vende: de cada $100 vendidos, <b>${money(Math.round(t.revenue ? t.net / t.revenue * 100 : 0))}</b> quedan para la tienda.`,
    best && best.net > 0 ? `El que más deja es <b>${esc(best.name)}</b>: ${smoney(best.net)} netos (${pctOf(best.net, best.revenue)} de sus ventas).` : '',
    worst ? `El que más pérdida genera es <b>${esc(worst.name)}</b>: ${money(worst.lost_paid)} que la tienda pagó por ${worst.lost_qty} unidades descartadas${worst.sold_qty ? `, frente a ${money(worst.margin)} de ganancia por lo vendido` : ''}.` : 'No hubo pérdidas por descartes en este periodo.',
    t.lost_paid ? `Las pérdidas se comen el <b>${pctLoss}</b> de la ganancia bruta. De cada ${units} unidades que entraron al negocio, ${t.lost_qty} (${pctOf(t.lost_qty, units)}) se descartaron.` : '',
  ].filter(Boolean);
  return `${sel}
    <div class="grid">
      <div class="stat"><span>Ventas de emprendimientos</span><b>${money(t.revenue)}</b>${dl(t.revenue, p.revenue)}<small>${t.sold_qty} unidades vendidas</small></div>
      <div class="stat"><span>Ganancia por lo vendido</span><b>${smoney(t.margin)}</b><small>Margen ${pctOf(t.margin, t.revenue)} · después de pagar el costo</small></div>
      <div class="stat"><span>Pérdidas por no vender</span><b>${money(t.lost_paid)}</b>${dl(t.lost_paid, p.lost_paid, true)}<small>${t.lost_qty} unidades descartadas (${pay}% pagado)</small></div>
      <div class="stat"><span>Rentabilidad neta</span><b>${smoney(t.net)}</b>${dl(t.net, p.net)}<small>${pctOf(t.net, t.revenue)} de las ventas</small></div>
      <div class="stat"><span>Pagado a emprendedores</span><b>${money(er.paid.total)}</b><small>${er.paid.n} pagos en el periodo</small></div>
      <div class="stat"><span>Por pagar ahora</span><b>${money(er.pending)}</b><small>Vendido y descartado sin pagar aún</small></div>
    </div><br>
    <div class="card"><h3>Lo que dicen los números</h3><ul class="ins">${insights.map((x) => `<li>${x}</li>`).join('')}</ul></div>
    <div class="card"><h3>Ganancia y pérdidas por día</h3>${lg([C.ganancia, 'Ganancia por lo vendido'], [C.gasto, 'Pérdida por descartes (lo que pagó la tienda)'])}<div id="em1"></div></div>
    <div class="grid2">
      <div class="card"><h3>Ganancia y pérdidas por semana</h3>${lg([C.ganancia, 'Ganancia por lo vendido'], [C.gasto, 'Pérdidas'])}<div id="em2"></div></div>
      <div class="card"><h3>Rentabilidad neta acumulada</h3><div id="em3"></div></div>
    </div>
    <div class="grid3">
      <div class="card"><h3>¿Cómo se reparte lo vendido?</h3><p class="mute sub">Pago al emprendedor, pérdidas y lo que queda a la tienda.</p><div id="ed1"></div></div>
      <div class="card"><h3>Unidades: vendidas vs perdidas</h3><p class="mute sub">Qué tanto del producto se vende y cuánto se descarta.</p><div id="ed2"></div></div>
      <div class="card"><h3>Pérdida por producto</h3><p class="mute sub">Quién genera más pérdida por descartes.</p><div id="ed3"></div></div>
    </div>
    <div class="card"><h3>Rentabilidad por producto</h3>
      <div class="tw"><table><tr><th>Producto</th><th class="n">Vendidas</th><th class="n">Ventas</th><th class="n">Ganancia</th><th class="n">Margen</th><th class="n">Descartadas</th><th class="n">Pérdida</th><th class="n">Neto</th><th class="n">Neto / venta</th></tr>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="n">${r.sold_qty}</td><td class="n">${money(r.revenue)}</td><td class="n">${money(r.margin)}</td><td class="n">${pctOf(r.margin, r.revenue)}</td>
        <td class="n ${r.lost_qty ? 'warn' : ''}">${r.lost_qty}</td><td class="n ${r.lost_paid ? 'err' : ''}">${r.lost_paid ? '−' + money(r.lost_paid) : '$0'}</td>
        <td class="n"><b class="${r.net < 0 ? 'err' : 'ok'}">${smoney(r.net)}</b></td><td class="n">${pctOf(r.net, r.revenue)}</td></tr>`).join('')}
      <tr class="tot"><td><b>Total</b></td><td class="n">${t.sold_qty}</td><td class="n">${money(t.revenue)}</td><td class="n">${money(t.margin)}</td><td class="n">${pctOf(t.margin, t.revenue)}</td><td class="n">${t.lost_qty}</td><td class="n">${t.lost_paid ? '−' + money(t.lost_paid) : '$0'}</td><td class="n"><b>${smoney(t.net)}</b></td><td class="n">${pctOf(t.net, t.revenue)}</td></tr></table></div>
      <p class="mute" style="margin:.7rem 0 0;font-size:.82rem">Ganancia = lo que cobras menos el precio acordado con el emprendedor. Pérdida = el ${pay}% del costo de lo descartado, que es lo que la tienda le paga aunque no se haya vendido.</p></div>`;
}
function empCharts(er) {
  if (er.error || !$('#em1')) return;
  const t = er.totals, C = Charts.COLOR, days = er.days;
  Charts.series($('#em1'), { days, bars: { key: 'margin', label: 'Ganancia por lo vendido', color: C.ganancia }, lines: [{ key: 'lost', label: 'Pérdida por descartes', color: C.gasto }], label: 'Ganancia y pérdidas de emprendimientos por día' });
  const weeks = new Map();
  days.forEach((d) => {
    const dt0 = new Date(d.day + 'T12:00:00Z'); dt0.setUTCDate(dt0.getUTCDate() - ((dt0.getUTCDay() + 6) % 7));
    const k = dt0.toISOString().slice(0, 10), w = weeks.get(k) || { k, margin: 0, lost: 0, net: 0 };
    w.margin += d.margin; w.lost += d.lost; w.net += d.net; weeks.set(k, w);
  });
  const wk = [...weeks.values()], short = (k) => new Date(k + 'T12:00:00Z').toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  Charts.columns($('#em2'), { cats: wk.map((w) => ({ l: short(w.k), t: 'Semana del ' + short(w.k) })), rows: wk,
    series: [{ key: 'margin', label: 'Ganancia por lo vendido', color: C.ganancia }, { key: 'lost', label: 'Pérdidas', color: C.gasto }], label: 'Ganancia y pérdidas por semana',
    extra: (w) => `<div class="tt"><span>Neto</span><b>${smoney(w.net)}</b></div>` });
  let acc = 0;
  Charts.series($('#em3'), { days: days.map((d) => ({ day: d.day, net: (acc += d.net) })), lines: [{ key: 'net', label: 'Neto acumulado', color: C.ganancia, area: true, last: true }], label: 'Rentabilidad neta acumulada' });
  Charts.donut($('#ed1'), [{ label: 'Emprendedor', value: t.cost, color: C.ventas }, { label: 'Pérdidas', value: t.lost_paid, color: C.gasto }, { label: 'Tienda (neto)', value: Math.max(0, t.net), color: C.ganancia }], 'vendido');
  Charts.donut($('#ed2'), [{ label: 'Vendidas', value: t.sold_qty, color: C.ganancia }, { label: 'Perdidas', value: t.lost_qty, color: C.gasto }], 'unidades', (v) => String(Math.round(v)));
  const lossRows = er.products.filter((r) => r.lost_paid > 0).sort((x, y) => y.lost_paid - x.lost_paid);
  Charts.hbars($('#ed3'), lossRows.length ? lossRows.slice(0, 8).map((r) => ({ label: r.name, value: r.lost_paid, color: C.gasto, text: `${r.lost_qty} uds · ${money(r.lost_paid)}` })) : [], 0);
  if (!lossRows.length) $('#ed3').innerHTML = '<span class="mute">Sin pérdidas en este periodo.</span>';
}

// Foto de perfil en grande: se abre al tocar el avatar de alguien en el chat; se cierra tocando o con Esc
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-zoom]'); if (!el) return;
  e.preventDefault(); e.stopPropagation();
  const d = el.dataset;
  document.querySelectorAll('.zoom').forEach((x) => x.remove());
  const z = document.createElement('div'); z.className = 'zoom';
  z.innerHTML = `<div class="zbox">${d.v ? `<img src="/api/users/${d.zoom}/photo?v=${d.v}" alt="">` : `<b>${initialOf(d.name)}</b>`}<span>${esc(d.name)}</span></div>`;
  z.addEventListener('click', () => z.remove());
  document.body.appendChild(z);
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.zoom').forEach((x) => x.remove()); });

// ---------- Productos: tarjetas ----------
function prodToolbar(admin) {
  const cats = [...new Set(S.prods.filter((p) => admin || p.active).map((p) => p.category || 'Sin categoría'))];
  const chip = (k, v, l) => `<button class="${S[k] === v ? 'on' : ''}" data-pf="${k}" data-v="${esc(v)}" onclick="A.pset('${k}', this.dataset.v)">${l}</button>`;
  return `<div class="ptool"><input id="pq" placeholder="Buscar producto…" oninput="S.pq=this.value;A.pgrid()">
    <div class="chips">${chip('pcat', 'all', 'Todas')}${cats.map((c) => chip('pcat', c, esc(c))).join('')}</div>
    <div class="chips">${chip('pst', 'all', 'Todos')}${chip('pst', 'ok', 'Disponibles')}${chip('pst', 'low', 'Stock bajo')}${chip('pst', 'out', 'Agotados')}${admin ? chip('pst', 'off', 'Desactivados') : ''}</div></div>`;
}
function productCard(p, admin, st, i) {
  const label = { ok: 'Disponible', low: 'Stock bajo', out: 'Agotado', free: 'Sin control de stock' }[st];
  const cap = Math.max(p.min_stock * 3, 10), pct = st === 'free' ? 0 : Math.max(st === 'out' ? 0 : 6, Math.min(100, p.stock / cap * 100));
  const unit = admin ? p.sell_price - p.buy_price : 0;
  return `<article class="pc ${p.active ? '' : 'off'}" style="--i:${Math.min(i, 14)}">
    <div class="pc-img">${p.photo ? `<img loading="lazy" src="${photoUrl(p)}" alt="">` : `<span class="pc-ph">${icon('productos')}</span>`}
      <em class="pc-cat">${esc(p.category || 'Sin categoría')}</em>${p.favorite ? `<i class="pc-fav" title="Favorito">${icon('estrella')}</i>` : ''}${p.active ? '' : '<em class="pc-off">Desactivado</em>'}</div>
    <div class="pc-body"><h4 title="${esc(p.name)}">${esc(p.name)}</h4>
      <div class="pc-price"><b>${money(p.sell_price)}</b>${admin ? `<span>compra ${money(p.buy_price)}</span><em class="${unit >= 0 ? 'ok' : 'err'}">${unit >= 0 ? '+' : '−'}${money(Math.abs(unit))} · ${p.sell_price ? Math.round(unit / p.sell_price * 100) : 0}%</em>` : ''}</div>
      <div class="pc-stock ${st}"><div class="pc-bar"><i style="width:${pct}%"></i></div>
        <div class="pc-st"><span>${label}</span><b>${st === 'free' ? '—' : p.stock + ' uds'}</b></div>${st === 'free' ? '' : `<small>Mínimo ${p.min_stock}</small>`}</div>
      ${admin ? `<div class="pc-act">${p.track_stock ? `<button class="btn sm" onclick="A.stockForm(${p.id})">+ Stock</button>` : ''}<button class="btn sec sm" onclick="A.productForm(${p.id})">Editar</button></div>` : ''}</div></article>`;
}
