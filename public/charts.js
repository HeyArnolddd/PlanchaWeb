// Gráficas del panel de Reportes: SVG a mano, sin librerías. Se dibujan al ancho real del contenedor y
// se redibujan al cambiar de tamaño. Colores: un matiz por entidad (validados con el validador de paleta).
window.Charts = (() => {
  const COLOR = { ventas: '#2a78d6', ganancia: '#1baf7a', gasto: '#eb6834', efectivo: '#eda100', nequi: '#6250d6', otros: '#9aa5bd' };
  const CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']; // orden fijo de la paleta; lo que sobre va a "Otros"
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
  // redibuja al cambiar el ancho del contenedor
  function responsive(el, draw) {
    draw();
    let w0 = el.clientWidth;
    new ResizeObserver(() => { if (el.clientWidth !== w0) { w0 = el.clientWidth; draw(); } }).observe(el);
  }
  // pone la ventanita junto al cursor dentro del contenedor del gráfico
  function place(tip, W, cx, T) {
    const tw = tip.offsetWidth, left = Math.max(4, Math.min(W - tw - 4, cx - tw / 2));
    tip.style.left = left + 'px'; tip.style.top = Math.max(0, T - 6) + 'px';
  }

  // Serie diaria. cfg: { days, stack:[{key,label,color}] | bars:{...}, lines:[{key,label,color,area,last}], label }
  function series(el, cfg) {
    const days = cfg.days, n = days.length;
    el.classList.add('chart');
    el.innerHTML = '<div class="ctip" hidden></div>';
    const tip = el.firstChild;
    const stackKeys = cfg.stack || (cfg.bars ? [cfg.bars] : []);
    const lines = cfg.lines || (cfg.line ? [cfg.line] : []);
    const val = (d, k) => d[k] || 0;
    const barTop = (d) => stackKeys.reduce((t, s) => t + val(d, s.key), 0);
    const hi = Math.max(0, ...days.map((d) => Math.max(barTop(d), ...lines.map((l) => val(d, l.key)))));
    const lo = Math.min(0, ...days.map((d) => Math.min(0, ...lines.map((l) => val(d, l.key)))));
    responsive(el, () => {
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
      lines.forEach((ln) => {
        const pts = days.map((d, i) => [x0(i) + band / 2, y(val(d, ln.key))]);
        const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
        if (ln.area) g += `<path d="${path}L${pts[n - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z" fill="${ln.color}" opacity=".13"/>`;
        g += `<path d="${path}" fill="none" stroke="${ln.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
        if (n <= 31) pts.forEach((p) => { g += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${ln.color}" stroke="var(--card)" stroke-width="2"/>`; });
        const lp = pts[n - 1]; // etiqueta directa del último punto
        if (ln.last) g += `<text x="${Math.min(lp[0], W - R - 2)}" y="${lp[1] - 9}" text-anchor="end" class="lv" fill="var(--ink)">${compact(val(days[n - 1], ln.key))}</text>`;
      });
      g += '<line class="cross" y1="' + T + '" y2="' + (T + ph) + '" stroke="var(--mute)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>';
      el.querySelector('svg')?.remove();
      el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cfg.label || '')}">${g}<rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`);
      const svg = el.querySelector('svg'), cross = svg.querySelector('.cross');
      const show = (e) => {
        const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - L) / band)));
        const d = days[i], cx = x0(i) + band / 2;
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', '.6');
        const rows = stackKeys.concat(lines).map((s) => `<div><i style="background:${s.color}"></i>${esc(s.label)}<b>${money(val(d, s.key))}</b></div>`).join('');
        const tot = cfg.stack ? `<div class="tt"><span>Total</span><b>${money(barTop(d))}</b></div>` : '';
        tip.innerHTML = `<strong>${longDay(d.day)}</strong>${rows}${tot}`;
        tip.hidden = false; place(tip, W, cx, T);
      };
      const hide = () => { tip.hidden = true; cross.setAttribute('opacity', '0'); };
      const hit = svg.querySelector('.hit');
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', hide);
    });
  }

  // Columnas por categoría (histogramas y comparativos). cfg: { cats:[{l, t}], series:[{key,label,color}], rows:[{...}], fmt:'money'|'n', label }
  function columns(el, cfg) {
    const n = cfg.cats.length, S = cfg.series, fmt = cfg.fmt === 'n' ? (v) => String(Math.round(v)) : money, axf = cfg.fmt === 'n' ? (v) => String(Math.round(v)) : compact;
    el.classList.add('chart');
    el.innerHTML = '<div class="ctip" hidden></div>';
    const tip = el.firstChild;
    const hi = Math.max(1, ...cfg.rows.map((r) => Math.max(...S.map((s) => r[s.key] || 0))));
    responsive(el, () => {
      const W = Math.max(240, el.clientWidth), H = W < 480 ? 210 : 240;
      const L = cfg.fmt === 'n' ? 34 : 46, R = 6, T = 14, B = 28, pw = W - L - R, ph = H - T - B;
      const top = nice(hi), y = (v) => T + ph - (v / top) * ph, band = pw / n;
      let g = '';
      for (let k = 0; k <= 4; k++) {
        const v = (top * k) / 4, yy = y(v);
        g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--line)" ${k === 0 ? 'stroke-width="1.5"' : 'stroke-dasharray="2 4"'}/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="ax">${axf(v)}</text>`;
      }
      const gw = Math.min(band - 2, 56), bw = Math.max(3, (gw - (S.length - 1) * 2) / S.length), step = Math.ceil(Math.max(34, Math.max(...cfg.cats.map((c) => c.l.length)) * 6.6 + 8) / band);
      cfg.rows.forEach((r, i) => {
        const gx = L + i * band + (band - (bw * S.length + (S.length - 1) * 2)) / 2;
        S.forEach((s, si) => {
          const v = r[s.key] || 0;
          g += `<path d="${bar(gx + si * (bw + 2), y(v), bw, y(0) - y(v), 3)}" fill="${s.color}"/>`;
          if (n <= 12 && S.length === 1 && v) g += `<text x="${gx + bw / 2}" y="${y(v) - 4}" text-anchor="middle" class="lv" fill="var(--ink)" style="font-size:11px">${axf(v)}</text>`;
        });
        if (i % step === 0) g += `<text x="${L + i * band + band / 2}" y="${H - 9}" text-anchor="middle" class="ax">${esc(cfg.cats[i].l)}</text>`;
      });
      el.querySelector('svg')?.remove();
      el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(cfg.label || '')}">${g}<rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/></svg>`);
      const svg = el.querySelector('svg'), hit = svg.querySelector('.hit');
      const show = (e) => {
        const r = svg.getBoundingClientRect(), i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - L) / band)));
        tip.innerHTML = `<strong>${esc(cfg.cats[i].t || cfg.cats[i].l)}</strong>` + S.map((s) => `<div><i style="background:${s.color}"></i>${esc(s.label)}<b>${fmt(cfg.rows[i][s.key] || 0)}</b></div>`).join('')
          + (cfg.extra ? cfg.extra(cfg.rows[i]) : '');
        tip.hidden = false; place(tip, W, L + i * band + band / 2, T);
      };
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
    });
  }

  // Gráfico circular (dona). slices: [{label, value, color}]; el centro muestra el total
  function donut(el, slices, centerLabel, fmt) {
    slices = slices.filter((s) => s.value > 0);
    const f = fmt || money, fc = fmt || compact;
    const total = slices.reduce((t, s) => t + s.value, 0);
    el.classList.add('donut');
    if (!total) { el.innerHTML = '<span class="mute">Sin datos en este periodo.</span>'; return; }
    const size = 190, r = 80, ri = 52, c = size / 2;
    let a0 = -Math.PI / 2, paths = '';
    slices.forEach((s, i) => {
      const f = s.value / total, a1 = a0 + f * Math.PI * 2 - (f < 1 ? 0.012 : 0), big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => `${(c + rad * Math.cos(a)).toFixed(2)},${(c + rad * Math.sin(a)).toFixed(2)}`;
      paths += f >= 0.9999
        ? `<circle data-i="${i}" cx="${c}" cy="${c}" r="${(r + ri) / 2}" fill="none" stroke="${s.color}" stroke-width="${r - ri}"/>`
        : `<path data-i="${i}" d="M${p(r, a0)}A${r},${r} 0 ${big} 1 ${p(r, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${big} 0 ${p(ri, a0)}Z" fill="${s.color}" stroke="var(--card)" stroke-width="2" stroke-linejoin="round"/>`;
      a0 += f * Math.PI * 2;
    });
    const legend = slices.map((s, i) => `<li data-i="${i}"><i style="background:${s.color}"></i><span>${esc(s.label)}</span><b>${Math.round(s.value / total * 100)}%</b><em>${f(s.value)}</em></li>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(centerLabel || 'Distribución')}">${paths}
      <text x="${c}" y="${c - 2}" text-anchor="middle" class="dv">${fc(total)}</text><text x="${c}" y="${c + 14}" text-anchor="middle" class="ax">${esc(centerLabel || 'Total')}</text></svg><ul class="dl">${legend}</ul>`;
    const on = (i) => { el.querySelectorAll('[data-i]').forEach((x) => x.classList.toggle('dim', i !== null && x.dataset.i !== String(i))); };
    el.querySelectorAll('[data-i]').forEach((x) => { x.addEventListener('pointerenter', () => on(x.dataset.i)); x.addEventListener('pointerleave', () => on(null)); });
  }

  // Barras horizontales (HTML): rows = [{ label, value, color, text }]; el ancho se mide contra max
  function hbars(el, rows, max) {
    max = max || Math.max(1, ...rows.map((r) => Math.abs(r.value)));
    el.innerHTML = rows.map((r) => `<div class="hbx"><span class="hl" title="${esc(r.label)}">${esc(r.label)}</span>
      <div class="ht"><i style="width:${Math.max(r.value ? 1.5 : 0, Math.abs(r.value) / max * 100)}%;background:${r.color}"></i></div>
      <b>${r.text ?? money(r.value)}</b></div>`).join('');
  }
  return { series, columns, donut, hbars, money, compact, COLOR, CAT };
})();
