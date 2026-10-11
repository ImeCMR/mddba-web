// landscape.js — the free-energy landscape behind the "Get involved" bands.
//
// The contour lines are a static SVG (assets/images/energy-landscape.svg)
// generated from the surface defined here by tools/build-landscape.js. In the
// browser this file adds a "walker": a particle running overdamped Langevin
// dynamics on the same surface, so it rattles around inside a basin and now and
// then hops a barrier into the next one, leaving a fading trajectory behind.
(() => {
  /* The surface, in SVG user units (viewBox 0 0 W H). Energies are in
     kcal/mol-like units: wells are negative Gaussians (x, y, depth, width,
     height, rotation in degrees), ridges positive ones, plus a gentle bowl
     that keeps everything inside the frame and a little ruggedness so the
     lines wobble like a real map. */
  const W = 1200;
  const H = 800;
  const WELLS = [
    [850, 420, -9.0, 130, 90, 28],
    [1040, 610, -6.6, 105, 72, -18],
    [650, 250, -6.0, 98, 66, 38],
    [1045, 215, -5.2, 88, 80, 0],
    [575, 575, -4.6, 112, 70, -28],
    [330, 390, -4.0, 130, 92, 12],
    [790, 690, -3.2, 80, 52, 8],
  ].map(([x, y, a, sx, sy, deg]) => {
    const t = (deg * Math.PI) / 180;
    return { x, y, a, c: Math.cos(t), s: Math.sin(t), ix: 1 / (2 * sx * sx), iy: 1 / (2 * sy * sy) };
  });
  const RIDGES = [
    [950, 320, 2.2, 55, 38, 30],
    [745, 520, 1.6, 70, 46, -10],
    [470, 300, 1.4, 60, 60, 0],
  ].map(([x, y, a, sx, sy, deg]) => {
    const t = (deg * Math.PI) / 180;
    return { x, y, a, c: Math.cos(t), s: Math.sin(t), ix: 1 / (2 * sx * sx), iy: 1 / (2 * sy * sy) };
  });
  const BOWL = { x: 760, y: 410, rx: 640, ry: 470, k: 5.5 };

  const gauss = (g, x, y) => {
    const dx = x - g.x;
    const dy = y - g.y;
    const u = dx * g.c + dy * g.s;
    const v = -dx * g.s + dy * g.c;
    return g.a * Math.exp(-(u * u * g.ix + v * v * g.iy));
  };
  const energy = (x, y) => {
    let e = 0;
    for (let i = 0; i < WELLS.length; i += 1) e += gauss(WELLS[i], x, y);
    for (let i = 0; i < RIDGES.length; i += 1) e += gauss(RIDGES[i], x, y);
    const bx = (x - BOWL.x) / BOWL.rx;
    const by = (y - BOWL.y) / BOWL.ry;
    e += BOWL.k * (bx * bx + by * by);
    e += 0.4 * Math.sin(x / 41 + y / 67) * Math.cos(y / 47 - x / 83);
    e += 0.2 * Math.sin(x / 23 - y / 29 + 1.3) + 0.12 * Math.cos(x / 13 + y / 17);
    return e;
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = { W, H, WELLS, energy };
    return;
  }

  /* ── Walker ──────────────────────────────────────────────────────────────
     Underdamped Langevin dynamics. To keep it exploring instead of sitting in
     the deepest basin, it drops small repulsive "hills" where it has been
     (as in metadynamics); they fade out again after a while. */
  const KT = 1.0; // temperature
  const GAMMA = 0.03; // friction
  const SIM_PER_SEC = 70; // simulation time per real second
  const STEP = 1 / 120; // fixed physics step, real seconds
  const HILL = { h: 0.6, sigma: 36, every: 0.35, tau: 40 }; // height, width, seconds, decay (s)
  const TRAIL = 5; // seconds of trajectory shown
  const SAMPLE = 1 / 60; // trail sampling interval, real seconds
  const SEGMENTS = 12; // the trail is split into this many paths, fading towards the tail
  const MARGIN = 40;

  const hillK = 1 / (2 * HILL.sigma * HILL.sigma);
  const hillReach = 9 * HILL.sigma * HILL.sigma;
  const randn = () => {
    let u = 0;
    while (!u) u = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  };

  function createWalker() {
    const start = WELLS[Math.floor(Math.random() * 3)];
    const s = { x: start.x, y: start.y, vx: 0, vy: 0, t: 0, nextHill: 0, nextSample: 0 };
    const hills = [];
    const trail = [];
    const dt = SIM_PER_SEC * STEP;
    const noise = Math.sqrt(2 * GAMMA * KT * dt);

    const step = () => {
      let gx = (energy(s.x + 1, s.y) - energy(s.x - 1, s.y)) / 2;
      let gy = (energy(s.x, s.y + 1) - energy(s.x, s.y - 1)) / 2;
      for (let i = 0; i < hills.length; i += 1) {
        const hl = hills[i];
        const dx = s.x - hl.x;
        const dy = s.y - hl.y;
        const r2 = dx * dx + dy * dy;
        if (r2 < hillReach) {
          const w = -2 * hillK * HILL.h * Math.exp(-(s.t - hl.t) / HILL.tau - r2 * hillK);
          gx += w * dx;
          gy += w * dy;
        }
      }
      s.vx += (-gx - GAMMA * s.vx) * dt + noise * randn();
      s.vy += (-gy - GAMMA * s.vy) * dt + noise * randn();
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < MARGIN || s.x > W - MARGIN) { s.vx = -s.vx; s.x = Math.min(W - MARGIN, Math.max(MARGIN, s.x)); }
      if (s.y < MARGIN || s.y > H - MARGIN) { s.vy = -s.vy; s.y = Math.min(H - MARGIN, Math.max(MARGIN, s.y)); }

      s.t += STEP;
      if (s.t >= s.nextHill) {
        hills.push({ x: s.x, y: s.y, t: s.t });
        s.nextHill = s.t + HILL.every;
        while (hills.length && s.t - hills[0].t > HILL.tau * 2.5) hills.shift();
      }
      if (s.t >= s.nextSample) {
        trail.push(s.x, s.y);
        s.nextSample = s.t + SAMPLE;
        if (trail.length > (TRAIL / SAMPLE) * 2) trail.splice(0, 2);
      }
    };
    let pending = 0;
    const advance = (seconds) => {
      pending += seconds;
      for (; pending >= STEP; pending -= STEP) step();
    };
    return { advance, trail };
  }

  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs, parent) => {
    const node = document.createElementNS(NS, name);
    Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(node);
    return node;
  };

  function mount(box, index) {
    const svg = el('svg', { class: 'fes__walker', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
    const defs = el('defs', {}, svg);
    const glowId = `fes-glow-${index}`;
    const glow = el('radialGradient', { id: glowId }, defs);
    el('stop', { offset: '0', 'stop-color': '#7cc4ff', 'stop-opacity': '.7' }, glow);
    el('stop', { offset: '1', 'stop-color': '#1a8cff', 'stop-opacity': '0' }, glow);
    const segs = [];
    for (let i = 0; i < SEGMENTS; i += 1) {
      segs.push(el('path', { class: 'fes__trail', 'stroke-opacity': (((i + 1) / SEGMENTS) ** 1.6 * 0.9).toFixed(3) }, svg));
    }
    const halo = el('circle', { r: 30, fill: `url(#${glowId})` }, svg);
    const head = el('circle', { class: 'fes__head', r: 5 }, svg);
    box.appendChild(svg);

    const walker = createWalker();
    walker.advance(TRAIL + 1); // start with a full trail

    const draw = () => {
      const t = walker.trail;
      const n = t.length / 2;
      if (n < 2) return;
      const per = Math.ceil(n / SEGMENTS);
      for (let i = 0; i < SEGMENTS; i += 1) {
        const a = Math.max(0, n - (SEGMENTS - i) * per);
        const b = Math.min(n - 1, a + per);
        let d = '';
        for (let k = a; k <= b; k += 1) d += `${k === a ? 'M' : 'L'}${t[2 * k].toFixed(1)} ${t[2 * k + 1].toFixed(1)}`;
        segs[i].setAttribute('d', d);
      }
      const x = t[2 * n - 2].toFixed(1);
      const y = t[2 * n - 1].toFixed(1);
      head.setAttribute('cx', x); head.setAttribute('cy', y);
      halo.setAttribute('cx', x); halo.setAttribute('cy', y);
    };
    draw();

    // Reduced motion: keep the still trajectory, don't animate.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let last = 0;
    let visible = false;
    const frame = (now) => {
      walker.advance(Math.min(0.1, (now - last) / 1000));
      last = now;
      draw();
      raf = requestAnimationFrame(frame);
    };
    const update = () => {
      const run = visible && !still.matches;
      if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      update();
    }).observe(box);
    if (still.addEventListener) still.addEventListener('change', update);
  }

  // also used by the FAIR viewer on the home page (fair3d.js)
  window.MDDBLandscape = { W, H, energy, createWalker };
  document.querySelectorAll('[data-landscape]').forEach(mount);
})();
