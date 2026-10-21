// Actualización automática: cada minuto (y al volver a la pestaña) revisa si cambió algún archivo publicado.
// Si hay versión nueva recarga sola, pero solo cuando es seguro (sin venta a medias, ventana abierta ni texto escrito).
(() => {
  const FILES = ['/index.html', '/app.js', '/styles.css', '/charts.js', '/pingu.js', '/update.js'];
  const EVERY = window.__UPD_MS || 60000;
  let base = null, found = false, timer = null;
  const sig = async () => {
    try {
      const r = await Promise.all(FILES.map((f) => fetch(f, { method: 'HEAD', cache: 'no-store' })));
      if (r.some((x) => !x.ok)) return null;
      return r.map((x) => x.headers.get('etag') || x.headers.get('last-modified') || x.headers.get('content-length') || '').join('|');
    } catch { return null; }
  };
  const busy = () => {
    const a = document.activeElement, S = window.S;
    return !!document.querySelector('.modal, .zoom') || !!(S && S.cart && S.cart.length)
      || !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.value && a.type !== 'file');
  };
  const banner = (txt, btn) => {
    let b = document.getElementById('upd');
    if (!b) { b = document.createElement('div'); b.id = 'upd'; document.body.appendChild(b); }
    b.innerHTML = `<span>${txt}</span>${btn ? '<button onclick="window.__reload()">Actualizar ahora</button>' : ''}`;
  };
  window.__reload = () => {
    try { if (window.S && window.S.view) sessionStorage.setItem('reloadView', window.S.view); } catch {}
    location.reload();
  };
  const tryReload = () => {
    if (!busy()) { banner('Hay una versión nueva. Actualizando…', false); setTimeout(window.__reload, 1200); return; }
    banner('Hay una versión nueva de La Plancha.', true); // hay trabajo a medias: se actualiza cuando termines
    setTimeout(tryReload, 8000);
  };
  const check = async () => {
    if (found) return;
    const s = await sig(); if (!s) return;
    if (base === null) { base = s; return; }
    if (s !== base) { found = true; tryReload(); }
  };
  check();
  timer = setInterval(check, EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
