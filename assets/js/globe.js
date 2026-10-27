// globe.js — orthographic globe for the "Explore MDDB Main Nodes" section.
// Needs d3-array + d3-geo + topojson-client (loaded from the CDN in index.html).
//
//   const globe = MDDBGlobe(canvas, { nodes, sites, landUrl });
//   globe.setProgress(p)   // 0..1 scroll progress through the nodes scene
//   globe.flyTo(i)         // rotate to node i (stacked / mobile layout)
//   globe.reset()          // back to the overview position
//
// Each site is linked to the main node of its region. When a main node with
// links is in focus, the map zooms inside the globe's outline so the links
// are easy to see, even on a phone.
window.MDDBGlobe = function MDDBGlobe(canvas, opts) {
  const d3 = window.d3;
  const topojson = window.topojson;
  const nodes = opts.nodes || [];
  const sites = opts.sites || [];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OVERVIEW = [-38, 28];          // Atlantic: Americas + Europe in view
  const TILT = 0.75;                   // don't tip the globe all the way to a node's latitude
  const REACH = 0.45;                  // zoom until a linked group reaches ~45% of the radius from the centre
  const MAX_ZOOM = 2.6;

  const ctx = canvas.getContext('2d');
  const projection = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(projection, ctx);
  const graticule = d3.geoGraticule10();
  const sphere = { type: 'Sphere' };
  const arcs = nodes.slice(1).map((n) => ({
    type: 'LineString',
    coordinates: [[nodes[0].lon, nodes[0].lat], [n.lon, n.lat]]
  }));
  // links from each site to the main node of its region (sites sharing the
  // main node's location get no link)
  const links = sites.map((p, k) => {
    const hub = nodes.findIndex((n) => n.region && n.region === p.region);
    if (hub < 0) return null;
    const a = [p.lon, p.lat];
    const b = [nodes[hub].lon, nodes[hub].lat];
    if (d3.geoDistance(a, b) < 0.01) return null; // < ~60 km
    return { hub, from: a, line: { type: 'LineString', coordinates: [a, b] }, along: d3.geoInterpolate(a, b), offset: k * 0.37 };
  }).filter(Boolean);

  let land = null;
  let size = 0;
  let dpr = 1;
  let view = OVERVIEW.slice();        // current centre [lon, lat]
  let goal = OVERVIEW.slice();        // where we are easing to
  let radius = 1;                     // the globe's outline on screen
  let zoom = 1;                       // map scale inside that outline
  let goalZoom = 1;
  let active = -1;                    // highlighted node
  let visible = false;
  let raf = 0;
  const t0 = performance.now();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lonDelta = (a, b) => ((((b - a) % 360) + 540) % 360) - 180; // shortest arc
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  // where to look at each main node, and how far to zoom: a main node with
  // links is framed together with its sites; one without keeps the overview
  // zoom, tilted towards the equator
  const views = nodes.map((n, i) => {
    const group = [[n.lon, n.lat], ...links.filter((l) => l.hub === i).map((l) => l.from)];
    if (group.length < 2) return { centre: [n.lon, n.lat * TILT], zoom: 1 };
    const centre = d3.geoCentroid({ type: 'MultiPoint', coordinates: group });
    const reach = Math.max(...group.map((p) => d3.geoDistance(p, centre)));
    return { centre, zoom: clamp(REACH / reach, 1, MAX_ZOOM) };
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    radius = size / 2 - Math.max(18, size * 0.06);
    projection.translate([size / 2, size / 2]);
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
    const R = radius;
    projection.scale(R * zoom).rotate([-view[0], -view[1]]);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, s, s);

    // atmosphere glow
    const glow = ctx.createRadialGradient(c, c, R * 0.9, c, c, R * 1.16);
    glow.addColorStop(0, 'rgba(26,140,255,0.32)');
    glow.addColorStop(1, 'rgba(26,140,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(c, c, R * 1.16, 0, Math.PI * 2); ctx.fill();

    // everything on the map stays inside the outline (matters when zoomed)
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip();

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

    // network arcs (first main node → the other main nodes)
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); arcs.forEach((a) => path(a));
    ctx.strokeStyle = 'rgba(124,196,255,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.setLineDash([]);

    // links inside a main node (brighter while that main node is active),
    // with a dot travelling along each one towards the main node
    links.forEach((l) => {
      const on = l.hub === active;
      ctx.beginPath(); path(l.line);
      ctx.strokeStyle = on ? 'rgba(124,196,255,0.85)' : 'rgba(124,196,255,0.4)';
      ctx.lineWidth = on ? 1.4 : 1; ctx.stroke();
      if (reduce) return;
      const t = ((now - t0) / 1600 + l.offset) % 1;
      const [lon, lat] = l.along(t);
      const v = facing(lon, lat);
      if (!v) return;
      const [x, y] = projection([lon, lat]);
      ctx.globalAlpha = v * Math.sin(Math.PI * t) * (on ? 1 : 0.6);
      ctx.beginPath(); ctx.arc(x, y, on ? 2.2 : 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.globalAlpha = 1;
    });

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
    let label = null;
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
      if (isActive && Math.hypot(x - c, y - c) < R) label = { x, y, text: n.place, v };
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // rim
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(124,196,255,0.32)'; ctx.lineWidth = 1; ctx.stroke();

    // label of the active main node
    if (label) {
      const { x, y, text } = label;
      ctx.globalAlpha = label.v;
      ctx.font = '500 13px Geist, "Inter Tight", system-ui, sans-serif';
      const w = ctx.measureText(text).width + 22;
      const h = 28;
      let lx = x + 16;
      if (lx + w > s - 4) lx = x - 16 - w;
      if (lx < 4) lx = clamp(x - w / 2, 4, s - w - 4); // no room at either side: centre it under the marker
      const ly = clamp(y + 12, 4, s - h - 4); // below, clear of the links (the European sites lie north of Barcelona)
      roundRect(lx, ly, w, h, 14);
      ctx.fillStyle = 'rgba(10,22,40,0.82)'; ctx.fill();
      ctx.strokeStyle = 'rgba(124,196,255,0.45)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, lx + 11, ly + h / 2 + 0.5);
      ctx.globalAlpha = 1;
    }
  }

  function frame(now) {
    raf = 0;
    const dLon = lonDelta(view[0], goal[0]);
    const dLat = goal[1] - view[1];
    const dZoom = goalZoom - zoom;
    const moving = Math.abs(dLon) > 0.02 || Math.abs(dLat) > 0.02 || Math.abs(dZoom) > 0.002;
    if (moving) {
      const k = reduce ? 1 : 0.12;
      view = [view[0] + dLon * k, view[1] + dLat * k];
      zoom += dZoom * k;
    } else {
      view = goal.slice();
      zoom = goalZoom;
    }
    draw(now);
    // keep animating while visible (pulse), or until the rotation settles
    if ((visible && !reduce) || moving) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const api = {
    setProgress(p) {
      if (!nodes.length) return;
      const n = nodes.length;
      const f = clamp(p * n - 0.5, 0, n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      const e = n > 1 ? smooth(0.2, 0.8, f - i) : 0;
      const ia = Math.max(0, i);
      const ib = Math.min(n - 1, i + 1);
      const a = views[ia].centre;
      const b = views[ib].centre;
      goal = [a[0] + lonDelta(a[0], b[0]) * e, a[1] + (b[1] - a[1]) * e];
      goalZoom = views[ia].zoom + (views[ib].zoom - views[ia].zoom) * e;
      active = Math.min(n - 1, Math.floor(clamp(p, 0, 0.9999) * n));
      kick();
    },
    flyTo(i) {
      if (!nodes[i]) return;
      goal = views[i].centre.slice();
      goalZoom = views[i].zoom;
      active = i;
      kick();
    },
    reset() {
      goal = OVERVIEW.slice();
      goalZoom = 1;
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
