// Pingüino pixel art que camina por el borde inferior de la página.
(() => {
  const PX = 4;
  const PAL = { N: '#02005f', W: '#ffffff', O: '#f59e0b' };
  const BODY = [
    '...NNNNN....',
    '..NNNNNNN...',
    '..NNNNWNNOO.',
    '..NNNNNNNOO.',
    '..NNNNNNN...',
    '.NNNWWWNNN..',
    'NNNWWWWWNNN.',
    'NNNWWWWWWNN.',
    'NNNWWWWWWNN.',
    '.NNWWWWWWNN.',
    '.NNNWWWWNN..',
    '..NNNNNNN...',
  ];
  const FEET = ['..OOO..OO...', '...OO..OOO..'];
  const W = 12, H = BODY.length + 1;

  // Hoja de sprites con 2 cuadros (pies alternados)
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H;
  const g = cv.getContext('2d');
  FEET.forEach((feet, f) => [...BODY, feet].forEach((row, y) => [...row].forEach((c, x) => {
    if (PAL[c]) { g.fillStyle = PAL[c]; g.fillRect(f * W + x, y, 1, 1); }
  })));

  const css = document.createElement('style');
  css.textContent = `
  .pingu{position:fixed;left:0;bottom:0;width:${W * PX}px;height:${H * PX}px;z-index:6;cursor:pointer;will-change:transform;-webkit-tap-highlight-color:transparent}
  .pingu .sp{width:100%;height:100%;background:url(${cv.toDataURL()}) 0 0/${W * 2 * PX}px ${H * PX}px;image-rendering:pixelated;transform-origin:50% 100%}
  .pingu.walk .sp{animation:pwalk .42s steps(1) infinite}
  .pingu.hop .sp{animation:phop .5s ease-out}
  .pingu .say{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:6px;white-space:nowrap;background:#fff;color:#02005f;
    font:700 12px/1 'Plus Jakarta Sans',system-ui,sans-serif;padding:.45rem .6rem;border-radius:10px;box-shadow:0 6px 16px -6px rgba(2,0,95,.5);
    opacity:0;transition:opacity .2s;pointer-events:none}
  .pingu .say.on{opacity:1}
  @keyframes pwalk{0%{background-position:0 0;transform:translateY(0)}50%{background-position:-${W * PX}px 0;transform:translateY(-${PX}px)}}
  @keyframes phop{0%,100%{transform:translateY(0)}40%{transform:translateY(-${PX * 7}px) rotate(-8deg)}}`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.className = 'pingu walk';
  el.innerHTML = '<div class="say"></div><div class="sp"></div>';
  document.body.appendChild(el);
  const sp = el.querySelector('.sp'), say = el.querySelector('.say');

  const SIZE = W * PX, SPEED = 38;
  let x = Math.random() * Math.max(0, innerWidth - SIZE), dir = 1, pause = 0, next = 4 + Math.random() * 5, last = performance.now(), tm;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LINES = ['¡Hola! 🐧', '¿Un cafecito?', 'ACEIS al 100', '¡Cuadra la caja!','Soto Hp'];

  const talk = (t) => { say.textContent = t; say.classList.add('on'); clearTimeout(tm); tm = setTimeout(() => say.classList.remove('on'), 1800); };
  el.addEventListener('click', () => {
    talk(LINES[Math.floor(Math.random() * LINES.length)]);
    el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
    setTimeout(() => el.classList.remove('hop'), 500);
  });

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (pause > 0) {
      pause -= dt;
      if (pause <= 0) el.classList.add('walk');
    } else {
      x += dir * SPEED * dt;
      const max = innerWidth - SIZE;
      if (x <= 0) { x = 0; dir = 1; } else if (x >= max) { x = Math.max(0, max); dir = -1; }
      next -= dt;
      if (next <= 0) { // descansa un rato, y a veces cambia de sentido
        pause = 1.5 + Math.random() * 2; next = 5 + Math.random() * 8;
        el.classList.remove('walk'); if (Math.random() < .4) dir *= -1;
      }
    }
    el.style.transform = `translateX(${x.toFixed(1)}px)`;
    sp.style.scale = dir < 0 ? '-1 1' : '1 1';
    requestAnimationFrame(tick);
  }
  if (reduce) { el.classList.remove('walk'); el.style.transform = `translateX(${x}px)`; } else requestAnimationFrame(tick);
})();
