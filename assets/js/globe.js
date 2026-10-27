// globe.js — orthographic globe for the "Explore MDDB Main Nodes" section.
// Needs d3-array + d3-geo + topojson-client (loaded from the CDN in index.html).
//
//   const globe = MDDBGlobe(canvas, { nodes, sites, landUrl });
//   globe.setProgress(p)   // 0..1 scroll progress through the nodes scene
//   globe.flyTo(i)         // rotate to node i (stacked / mobile layout)
//   globe.reset()          // back to the overview position
window.MDDBGlobe = function MDDBGlobe(canvas, opts) {
  const d3 = window.d3;
  const topojson = window.topojson;
  const nodes = opts.nodes || [];
  const sites = opts.sites || [];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OVERVIEW = [-38, 28];          // Atlantic: Americas + Europe in view
  const TILT = 0.75;                   // don't tip the globe all the way to a node's latitude

  const ctx = canvas.getContext('2d');
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule10();
  const sphere = { type: 'Sphere' };
  // dotted network lines: the first main node to the other main nodes, and
  // each site to the main node of its region (none for a site at its main
  // node's own location)
  const arcs = nodes.slice(1).map((n) => [nodes[0], n])
    .concat(sites.map((p) => [nodes.find((n) => n.region && n.region === p.region), p]))
    .filter(([a, b]) => a && d3.geoDistance([a.lon, a.lat], [b.lon, b.lat]) > 0.01) // ~60 km
    .map(([a, b]) => ({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }));

  let land = null;
  let size = 0;
  let dpr = 1;
  let view = OVERVIEW.slice();        // current centre [lon, lat]
  let goal = OVERVIEW.slice();        // where we are easing to
  let active = -1;                    // highlighted node
  let visible = false;
  let raf = 0;
  const t0 = performance.now();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lonDelta = (a, b) => ((((b - a) % 360) + 540) % 360) - 180; // shortest arc
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    projection.translate([size / 2, size / 2]).scale(size / 2 - Math.max(18, size * 0.06));
    kick();
  }

  // 1 on the near side, fading to 0 just before the horizon
  function facing(lon, lat) {
    const d = d3.geoDistance([lon, lat], view);
    return clamp((Math.PI / 2 - d) / 0.15, 0, 1);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(now) {
    if (!size) return;
    const s = size;
    const c = s / 2;
    const R = projection.scale();
    projection.rotate([-view[0], -view[1]]);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    // atmosphere glow
    const glow = ctx.createRadialGradient(c, c, R * 0.9, c, c, R * 1.16);
    glow.addColorStop(0, 'rgba(26,140,255,0.32)');
    glow.addColorStop(1, 'rgba(26,140,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(c, c, R * 1.16, 0, Math.PI * 2); ctx.fill();

    // sphere
    const body = ctx.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.05, c, c, R);
    body.addColorStop(0, '#133d6d');
    body.addColorStop(1, '#0b1c36');
    ctx.beginPath(); path(sphere); ctx.fillStyle = body; ctx.fill();

    // graticule
    ctx.beginPath(); path(graticule);
    ctx.strokeStyle = 'rgba(124,196,255,0.09)'; ctx.lineWidth = 0.7; ctx.stroke();

    // land
    if (land) {
      ctx.beginPath(); path(land);
      ctx.fillStyle = 'rgba(26,140,255,0.26)'; ctx.fill();
      ctx.strokeStyle = 'rgba(124,196,255,0.55)'; ctx.lineWidth = 0.6; ctx.stroke();
    }

    // rim
    ctx.beginPath(); path(sphere);
    ctx.strokeStyle = 'rgba(124,196,255,0.32)'; ctx.lineWidth = 1; ctx.stroke();

    // network arcs
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); arcs.forEach((a) => path(a));
    ctx.strokeStyle = 'rgba(124,196,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.setLineDash([]);

    // nodes inside each main node
    sites.forEach((p) => {
      const v = facing(p.lon, p.lat);
      if (!v) return;
      const [x, y] = projection([p.lon, p.lat]);
      ctx.globalAlpha = v;
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#7cc4ff'; ctx.fill();
    });

    // nodes
    const pulse = reduce ? 0.35 : ((now - t0) / 1800) % 1;
    nodes.forEach((n, i) => {
      const v = facing(n.lon, n.lat);
      if (!v) return;
      const [x, y] = projection([n.lon, n.lat]);
      const isActive = i === active;
      if (isActive) {
        ctx.globalAlpha = v * (1 - pulse) * 0.9;
        ctx.beginPath(); ctx.arc(x, y, 7 + pulse * 24, 0, Math.PI * 2);
        ctx.strokeStyle = '#1a8cff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = v * 0.5;
        ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(26,140,255,0.4)'; ctx.fill();
      }
      ctx.globalAlpha = v;
      ctx.beginPath(); ctx.arc(x, y, isActive ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#1a8cff'; ctx.stroke();

      if (isActive) {
        const text = n.place;
        ctx.font = '500 13px Geist, "Inter Tight", system-ui, sans-serif';
        const w = ctx.measureText(text).width + 22;
        const h = 28;
        let lx = x + 16;
        if (lx + w > s - 4) lx = x - 16 - w;
        if (lx < 4) lx = clamp(x - w / 2, 4, s - w - 4); // no room at either side: centre it under the marker
        const ly = clamp(y + 12, 4, s - h - 4); // below, clear of the lines (the European nodes lie north of Barcelona)
        roundRect(lx, ly, w, h, 14);
        ctx.fillStyle = 'rgba(10,22,40,0.82)'; ctx.fill();
        ctx.strokeStyle = 'rgba(124,196,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, lx + 11, ly + h / 2 + 0.5);
      }
    });
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    const dLon = lonDelta(view[0], goal[0]);
    const dLat = goal[1] - view[1];
    const moving = Math.abs(dLon) > 0.02 || Math.abs(dLat) > 0.02;
    if (moving) {
      const k = reduce ? 1 : 0.12;
      view = [view[0] + dLon * k, view[1] + dLat * k];
    } else {
      view = goal.slice();
    }
    draw(now);
    // keep animating while visible (pulse), or until the rotation settles
    if ((visible && !reduce) || moving) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const centreOf = (n) => [n.lon, n.lat * TILT];

  const api = {
    setProgress(p) {
      if (!nodes.length) return;
      const n = nodes.length;
      const f = clamp(p * n - 0.5, 0, n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      const e = n > 1 ? smooth(0.2, 0.8, f - i) : 0;
      const a = centreOf(nodes[Math.max(0, i)]);
      const b = centreOf(nodes[Math.min(n - 1, i + 1)]);
      goal = [a[0] + lonDelta(a[0], b[0]) * e, a[1] + (b[1] - a[1]) * e];
      active = Math.min(n - 1, Math.floor(clamp(p, 0, 0.9999) * n));
      kick();
    },
    flyTo(i) {
      if (!nodes[i]) return;
      goal = centreOf(nodes[i]);
      active = i;
      kick();
    },
    reset() {
      goal = OVERVIEW.slice();
      active = -1;
      kick();
    }
  };

  // land outlines (lazy)
  fetch(opts.landUrl)
    .then((r) => r.json())
    .then((world) => {
      land = topojson.feature(world, world.objects.land);
      kick();
    })
    .catch(() => { /* globe still renders sphere, graticule and markers */ });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);
  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) kick();
  }).observe(canvas);

  resize();
  return api;
};
