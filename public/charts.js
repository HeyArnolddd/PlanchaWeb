// Gráficas del panel de Reportes: SVG a mano, sin librerías. Se dibujan al ancho real del contenedor y
// se redibujan al cambiar de tamaño. Colores: un matiz por entidad (validados con el validador de paleta).
window.Charts = (() => {
  const COLOR = { ventas: '#2a78d6', ganancia: '#1baf7a', gasto: '#eb6834', efectivo: '#eda100', nequi: '#6250d6' };
  const money = (n) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CO');
  const compact = (n) => {
    const a = Math.abs(n), s = n < 0 ? '−' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a % 1e6 ? 1 : 0).replace('.', ',')}M`;
    if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}k`;
    return `${s}$${Math.round(a)}`;
  };
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const parts = (d) => { const [y, m, dd] = d.split('-').map(Number); return { m: m - 1, d: dd, w: new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay() }; };
  const longDay = (d) => { const p = parts(d); return `${DIA[p.w]} ${p.d} ${MES[p.m]}`; };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // máximo "redondo" para el eje y
  function nice(max) {
    if (max <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(max)), r = max / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
  }
  // barra con las esquinas de arriba redondeadas, pegada a la línea base
  function bar(x, y, w, h, r = 3) {
    if (h <= 0) return '';
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  // Serie diaria. cfg: { days, stack:[{key,label,color}] | bars:{key,label,color}, line:{key,label,color,area}, total }
  function series(el, cfg) {
    const days = cfg.days, n = days.length;
    el.classList.add('chart');
    el.innerHTML = '<div class="ctip" hidden></div>';
    const tip = el.firstChild;
    const stackKeys = cfg.stack || (cfg.bars ? [cfg.bars] : []);
    const val = (d, k) => d[k] || 0;
    const barTop = (d) => stackKeys.reduce((t, s) => t + val(d, s.key), 0);
    let hi = Math.max(0, ...days.map((d) => Math.max(barTop(d), cfg.line ? val(d, cfg.line.key) : 0)));
    let lo = Math.min(0, ...days.map((d) => (cfg.line ? val(d, cfg.line.key) : 0)));
    function draw() {
      const W = Math.max(260, el.clientWidth), H = W < 480 ? 220 : 260;
      const L = 46, R = 8, T = 10, B = 26, pw = W - L - R, ph = H - T - B;
      const top = hi > 0 ? nice(hi) : (lo < 0 ? 0 : 1), bottom = lo < 0 ? -nice(-lo) : 0, span = top - bottom;
      const y = (v) => T + ph - ((v - bottom) / span) * ph, band = pw / n, x0 = (i) => L + i * band;
      let g = '';
      for (let k = 0; k <= 4; k++) { // rejilla tenue y etiquetas del eje y
        const v = bottom + (span * k) / 4, yy = y(v);
        g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--line)" ${v === 0 ? 'stroke-width="1.5"' : 'stroke-dasharray="2 4"'}/>`
          + `<text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="ax">${compact(v)}</text>`;
      }
      const step = Math.ceil(46 / band); // etiquetas del eje x sin amontonarse
      for (let i = 0; i < n; i += step) {
        const p = parts(days[i].day), first = i === 0 || parts(days[Math.max(0, i - step)].day).m !== p.m;
        g += `<text x="${x0(i) + band / 2}" y="${H - 8}" text-anchor="middle" class="ax">${n <= 10 ? DIA[p.w] + ' ' + p.d : p.d + (first ? ' ' + MES[p.m] : '')}</text>`;
      }
      const bw = Math.max(2, Math.min(34, band * 0.68));
      days.forEach((d, i) => {
        let acc = 0;
        stackKeys.forEach((s, si) => {
          const v = val(d, s.key); if (v <= 0) return;
          const yTop = y(acc + v), h = y(acc) - yTop;
          g += `<path d="${bar(x0(i) + (band - bw) / 2, yTop, bw, h, si === stackKeys.length - 1 ? 3 : 0)}" fill="${s.color}" stroke="var(--card)" stroke-width="${stackKeys.length > 1 ? 1.5 : 0}"/>`;
          acc += v;
        });
      });
      if (cfg.line) {
        const pts = days.map((d, i) => [x0(i) + band / 2, y(val(d, cfg.line.key))]);
        const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
        if (cfg.line.area) g += `<path d="${path}L${pts[n - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z" fill="${cfg.line.color}" opacity=".13"/>`;
        g += `<path d="${path}" fill="none" stroke="${cfg.line.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (n <= 31) pts.forEach((p) => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${cfg.line.color}" stroke="var(--card)" stroke-width="2"/>`; });
        const lp = pts[n - 1]; // etiqueta directa del último punto
        if (cfg.line.last) g += `<text x="${Math.min(lp[0], W - R - 2)}" y="${lp[1] - 9}" text-anchor="end" class="lv" fill="var(--ink)">${compact(val(days[n - 1], cfg.line.key))}</text>`;
      }
      g += '<line class="cross" y1="' + T + '" y2="' + (T + ph) + '" stroke="var(--mute)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>';
      el.querySelector('svg')?.remove();
      el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cfg.label || '')}">${g}<rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`);
      const svg = el.querySelector('svg'), cross = svg.querySelector('.cross');
      const show = (e) => {
        const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - L) / band)));
        const d = days[i], cx = x0(i) + band / 2;
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', '.6');
        const rows = (cfg.stack ? cfg.stack : cfg.bars ? [cfg.bars] : []).concat(cfg.line ? [cfg.line] : [])
          .map((s) => `<div><i style="background:${s.color}"></i>${esc(s.label)}<b>${money(val(d, s.key))}</b></div>`).join('');
        const tot = cfg.stack ? `<div class="tt"><span>Total</span><b>${money(barTop(d))}</b></div>` : '';
        tip.innerHTML = `<strong>${longDay(d.day)}</strong>${rows}${tot}`;
        tip.hidden = false;
        const tw = tip.offsetWidth, left = Math.max(4, Math.min(W - tw - 4, cx - tw / 2));
        tip.style.left = left + 'px'; tip.style.top = Math.max(0, T - 6) + 'px';
      };
      const hide = () => { tip.hidden = true; cross.setAttribute('opacity', '0'); };
      const hit = svg.querySelector('.hit');
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', hide);
    }
    draw();
    let w0 = el.clientWidth;
    new ResizeObserver(() => { if (el.clientWidth !== w0) { w0 = el.clientWidth; draw(); } }).observe(el);
  }

  // Barras horizontales (HTML): rows = [{ label, value, color, text, sign }]; el ancho se mide contra max
  function hbars(el, rows, max) {
    max = max || Math.max(1, ...rows.map((r) => Math.abs(r.value)));
    el.innerHTML = rows.map((r) => `<div class="hbx"><span class="hl" title="${esc(r.label)}">${esc(r.label)}</span>
      <div class="ht"><i style="width:${Math.max(r.value ? 1.5 : 0, Math.abs(r.value) / max * 100)}%;background:${r.color}"></i></div>
      <b>${r.text ?? money(r.value)}</b></div>`).join('');
  }
  return { series, hbars, money, compact, COLOR };
})();
