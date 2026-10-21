// Sami, el pingüino pixel art: camina, salta, te mira, se deja agarrar y lanzar.
(() => {
  const DIR = 'sami/';
  const NAMES = ['front', 'back', 'left', 'right', 'happy', 'blink', 'wow', 'sad', 'jump',
    ...Array.from({ length: 8 }, (_, i) => 'w' + (i + 1))];

  const W = 92, H = Math.round(W * 167 / 151), G = 1900;
  const css = document.createElement('style');
  css.textContent = `
  .pingu{position:fixed;left:0;bottom:0;width:${W}px;height:${H}px;z-index:6;cursor:grab;will-change:transform;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
  .pingu.held{cursor:grabbing}
  .pingu .shd{position:absolute;left:50%;bottom:0;width:${W * .5}px;height:8px;margin-left:${-W * .25}px;border-radius:50%;background:rgba(2,0,95,.28);filter:blur(2px)}
  .pingu .sp{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transform-origin:50% 100%}
  .pingu .sp img{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;visibility:hidden}
  .pingu .sp img.on{visibility:visible}
  .pingu .say{position:absolute;bottom:100%;left:50%;transform:translateX(-50%) scale(.85);margin-bottom:2px;white-space:nowrap;background:#fff;color:#02005f;
    font:700 12px/1 'Plus Jakarta Sans',system-ui,sans-serif;padding:.45rem .6rem;border-radius:10px;box-shadow:0 6px 16px -6px rgba(2,0,95,.5);
    opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
  .pingu .say.on{opacity:1;transform:translateX(-50%) scale(1)}
  .pingu .say::after{content:'';position:absolute;top:100%;left:var(--tail,50%);margin-left:-5px;border:5px solid transparent;border-top-color:#fff}`;
  document.head.appendChild(css);

  const el = document.createElement('div'); el.className = 'pingu';
  el.innerHTML = '<div class="say"></div><div class="shd"></div><div class="sp"></div>';
  document.body.appendChild(el);
  const sp = el.querySelector('.sp'), say = el.querySelector('.say'), shd = el.querySelector('.shd');

  const frames = {};
  NAMES.forEach((n) => { const im = new Image(); im.alt = ''; im.draggable = false; im.src = `${DIR}${n}.png`; sp.appendChild(im); frames[n] = im; });
  const showFrame = (n) => { if (sp.dataset.n === n) return; if (frames[sp.dataset.n]) frames[sp.dataset.n].classList.remove('on'); sp.dataset.n = n; frames[n].classList.add('on'); };

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LINES = ['¡Hola! 🐧', '¿Un cafecito?', 'ACEIS al 100', '¡Cuadra la caja!', 'Soto Hp', '¡Vamos a vender!', 'Soy Sami 🎩', '¡Qué frío! ❄️'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const maxX = () => Math.max(0, innerWidth - W);

  let x = rnd(0, maxX()), y = 0, vx = 0, vy = 0, dir = 1;
  let mode = 'idle', timer = rnd(1, 2.5), face = 'front', target = null, run = false;
  let emote = null, emoteT = 0, sq = 1, rot = 0, spin = 0, blinkT = rnd(2, 4), blinkOn = 0, frame = 0, fT = 0;
  let held = null, last = performance.now(), tm, clicks = [], mx = -1e4, my = -1e4, scrollT = 0;

  const setEmote = (n, s) => { emote = n; emoteT = s; };
  const talk = (t, ms = 1800) => {
    say.textContent = t; say.classList.add('on');
    const bw = say.offsetWidth, c = x + W / 2, shift = Math.max(4 - (c - bw / 2), Math.min(0, innerWidth - 4 - (c + bw / 2)));
    say.style.left = `calc(50% + ${shift}px)`; say.style.setProperty('--tail', `calc(50% - ${shift}px)`);
    clearTimeout(tm); tm = setTimeout(() => say.classList.remove('on'), ms);
  };
  const jump = (power = 640, flip = false) => {
    if (y > 0) return;
    vy = power; sq = .65; mode = 'air';
    if (flip) spin = 360 / (2 * power / G) * (Math.random() < .5 ? -1 : 1);
  };

  el.addEventListener('pointerdown', (e) => {
    held = { sx: e.clientX, sy: e.clientY, ox: e.clientX - x, oy: innerHeight - e.clientY - y, moved: false, px: x, py: y, pt: performance.now() };
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!held) return;
    if (!held.moved && Math.hypot(e.clientX - held.sx, e.clientY - held.sy) > 6) {
      held.moved = true; mode = 'held'; target = null; spin = 0; rot = 0; vx = vy = 0;
      el.classList.add('held'); talk('¡Eeeh! 😮', 1200);
    }
    if (!held.moved) return;
    const now = performance.now(), dt = Math.max(.008, (now - held.pt) / 1000);
    x = Math.max(0, Math.min(maxX(), e.clientX - held.ox)); y = Math.max(0, innerHeight - e.clientY - held.oy);
    vx = vx * .6 + ((x - held.px) / dt) * .4; vy = vy * .6 + ((y - held.py) / dt) * .4;
    held.px = x; held.py = y; held.pt = now;
  });
  const drop = (e) => {
    if (!held) return;
    const h = held; held = null; el.classList.remove('held');
    if (h.moved) {
      if (performance.now() - h.pt > 90) vx = vy = 0; // lo soltó quieto: no lanzar
      vx = Math.max(-1100, Math.min(1100, vx)); vy = Math.max(-1100, Math.min(1100, vy));
      mode = 'air'; if (Math.abs(vx) > 60) dir = vx > 0 ? 1 : -1;
    } else if (e.type === 'pointerup') poke();
  };
  el.addEventListener('pointerup', drop); el.addEventListener('pointercancel', drop);

  function poke() {
    const now = performance.now(); clicks = clicks.filter((t) => now - t < 2200); clicks.push(now);
    target = null;
    if (clicks.length >= 5) { // demasiadas cosquillas: voltereta y mareo
      clicks = []; jump(860, true); setEmote('wow', 1.2); talk('¡Wiiiii! 🌀', 1400);
      setTimeout(() => { setEmote('sad', 2); talk('Ay… me mareé 😵‍💫', 2000); }, 1300);
    } else {
      jump(rnd(560, 700)); setEmote('happy', 1); talk(pick(LINES));
    }
  }

  // reacciona a lo que pasa en la página
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mx = e.clientX; my = e.clientY; } }, { passive: true });
  document.addEventListener('click', (e) => {
    if (el.contains(e.target) || held || mode === 'air' || Math.random() > .3) return;
    target = Math.max(0, Math.min(maxX(), e.clientX - W / 2)); run = true; emote = null; emoteT = 0; talk('¡Voy! 🏃', 1200);
  });
  addEventListener('scroll', () => {
    const n = performance.now();
    if (n - scrollT > 4000 && mode !== 'held' && mode !== 'air' && Math.random() < .5) { scrollT = n; setEmote('wow', .8); }
  }, { passive: true });
  addEventListener('resize', () => { x = Math.min(x, maxX()); });

  function nextAction() {
    const r = Math.random();
    if (mode === 'walk' || r < .4) { // descansa y mira
      mode = 'idle'; run = false; timer = rnd(1.6, 3.4); face = pick(['front', 'front', 'left', 'right', 'back']);
    } else if (r < .6) { jump(rnd(520, 720)); setEmote('happy', 1); }
    else if (r < .68) { jump(820, true); setEmote('wow', 1); }
    else { mode = 'walk'; timer = rnd(4, 9); if (Math.random() < .4) dir *= -1; run = Math.random() < .25; }
  }

  function tick(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    if (emoteT > 0 && (emoteT -= dt) <= 0) emote = null;
    if (mode === 'held') {
      rot = Math.sin(now / 90) * 8;
    } else if (mode === 'air' || y > 0 || vy > 0) {
      mode = 'air'; vy -= G * dt; y += vy * dt; x += vx * dt; rot += spin * dt;
      if (x < 0 || x > maxX()) { x = Math.max(0, Math.min(maxX(), x)); vx = -vx * .6; }
      if (y <= 0) {
        y = 0; rot = 0; spin = 0; sq = Math.max(.55, .9 - Math.abs(vy) / 3500);
        if (Math.abs(vy) > 380) { vy = -vy * .32; vx *= .7; y = .01; } else { vy = 0; vx = 0; mode = 'idle'; timer = rnd(.8, 1.6); face = 'front'; if (!emote) setEmote('happy', .9); }
      }
    } else {
      if (target !== null) { // yendo hacia donde tocaron
        const d = target - x; dir = d < 0 ? -1 : 1; mode = 'walk';
        if (Math.abs(d) < 6) { target = null; run = false; mode = 'idle'; timer = 1.5; jump(600); setEmote('happy', 1); }
        else x += dir * Math.min(Math.abs(d), 150 * dt);
      } else if (mode === 'walk') {
        x += dir * (run ? 130 : 58) * dt;
        if (x <= 0) { x = 0; dir = 1; } else if (x >= maxX()) { x = maxX(); dir = -1; }
        timer -= dt; if (timer <= 0) nextAction();
      } else { // idle
        timer -= dt; if (timer <= 0) nextAction();
      }
    }

    // cuadro del sprite
    let name;
    if (mode === 'held') name = 'wow';
    else if (mode === 'air') name = 'jump';
    else if (emote && target === null) name = emote; // yendo a un clic, la caminata manda sobre las emociones
    else if (mode === 'walk') { fT += dt * (run ? 16 : 9); frame = Math.floor(fT) % 8; name = 'w' + (frame + 1); }
    else {
      name = face;
      const near = Math.abs(mx - (x + W / 2)) < 280 && my > innerHeight - 320;
      if (near) { // te mira, y si te acercas se pone feliz
        const d = mx - (x + W / 2);
        name = Math.abs(d) < 70 ? 'happy' : (d < 0 ? 'left' : 'right');
      }
      blinkT -= dt; if (blinkT <= 0) { blinkOn = .14; blinkT = rnd(2, 5); }
      if (blinkOn > 0) { blinkOn -= dt; if (name === 'front' || name === 'happy') name = 'blink'; }
    }
    // los sprites de perfil miran a la derecha; "left" ya trae su propia dirección
    const flip = (name[0] === 'w' && name.length === 2) || name === 'jump' ? dir : (emote || name === 'wow') ? dir : 1;
    showFrame(name);

    sq += (1 - sq) * Math.min(1, dt * 11);
    const st = mode === 'air' && vy > 0 ? 1.1 : 1 + (1 - sq) * -1, sx = 1 + (1 - sq) * .7;
    sp.style.transformOrigin = rot ? '50% 60%' : '50% 100%';
    sp.style.transform = `scale(${(flip * sx).toFixed(3)},${st.toFixed(3)}) rotate(${(rot * flip).toFixed(1)}deg)`;
    shd.style.transform = `scale(${(1 / (1 + y / 160)).toFixed(3)},1)`; shd.style.opacity = Math.max(.2, 1 - y / 300).toFixed(2);
    el.style.transform = `translate(${x.toFixed(1)}px,${(-y).toFixed(1)}px)`;
    requestAnimationFrame(tick);
  }

  showFrame('front');
  if (reduce) { el.style.transform = `translateX(${x}px)`; el.addEventListener('click', () => talk(pick(LINES))); }
  else requestAnimationFrame(tick);
})();
