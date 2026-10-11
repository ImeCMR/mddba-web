// fair3d.js — the FAIR viewer on the home page: one molecular dataset followed
// through the four principles, drawn with particles like the hero video, in
// deep blues on the light section.
//
// The molecule is E. coli adenylate kinase, open (PDB 4AKE) and closed (1AKE),
// from assets/data/fair-protein.json (tools/build-fair-protein.js), shown as its
// molecular surface: a lit mesh with baked ambient occlusion, coloured by domain
// (NMP indigo, CORE blue, LID cyan), that closes and opens with the trajectory.
// Particles assemble onto it, stream from it and re-form as its ribbon.
//   F  Findable       faint datasets drift past; one assembles into the protein
//                     and is tagged with its ID and metadata (HUD card)
//   A  Accessible     its trajectory plays (open <-> closed) and packets of frames
//                     stream out to an API request (HUD card)
//   I  Interoperable  the surface turns see-through, the ribbon forms inside, and
//                     file formats stream in (HUD chips)
//   R  Reusable       the site's free-energy landscape as a particle terrain, the
//                     site's walker running on it; the protein follows its basin
//
// Plain WebGL 1; if WebGL is unavailable the same picture
// is drawn with the 2D canvas. Positions are computed on the CPU every frame.
// Starts by itself and follows the "scene:progress" events home.js sends for
// the pinned scene (on phones too, with fewer particles). In the stacked
// layout (reduced motion) each principle gets a small panel showing its own
// state instead.
(() => {
  const TAU = Math.PI * 2;
  const DIST = 4.5;        // camera distance
  const FIT = 1.3;         // world radius that fits the panel's shorter side
  const FIT_SMALL = 1.5;   // the same on phone-sized panels, leaving room for the HUD cards
  const SPECIAL = 48;      // glowing dot + walker trail
  const PERIOD = 7;        // seconds for one open -> closed -> open cycle
  //            F     A     I     R
  const PITCH = [0.12, 0.16, 0.1, 0.64];
  const SWAY = [0.5, 0.45, 0.5, 0.22];
  // where the molecular surface sits in each state: scale, offset, opacity
  const MESH = [
    { s: 0.95, o: [0, -0.02, 0], a: 1 },    // F
    { s: 0.86, o: [-0.12, 0.08, 0], a: 1 }, // A
    { s: 0.95, o: [0, 0, 0], a: 0.16 },     // I: see-through, the ribbon inside
    { s: 0.44, o: [0, 0.5, 0], a: 1 },      // R: small, above the landscape
  ];
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const frac = (x) => x - Math.floor(x);
  const random = (seed) => () => { // mulberry32
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /* ── Molecule data (loaded once, shared by every panel) ───────────────── */
  let pending = null;
  const loadMolecule = (url) => pending || (pending = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  }).then(prepare));

  const decode = (b64, Type) => { // little-endian typed array from base64
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new Type(bytes.buffer);
  };
  function vertexNormals(p, idx) { // smooth normals, area-weighted from the triangles
    const nrm = new Float32Array(p.length);
    for (let t = 0; t < idx.length; t += 3) {
      const a = 3 * idx[t];
      const b = 3 * idx[t + 1];
      const c = 3 * idx[t + 2];
      const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a]; const vy = p[c + 1] - p[a + 1]; const vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const v of [a, b, c]) { nrm[v] += nx; nrm[v + 1] += ny; nrm[v + 2] += nz; }
    }
    for (let v = 0; v < nrm.length; v += 3) {
      const l = Math.hypot(nrm[v], nrm[v + 1], nrm[v + 2]) || 1;
      nrm[v] /= l; nrm[v + 1] /= l; nrm[v + 2] /= l;
    }
    return nrm;
  }

  function prepare(j) {
    const nA = j.atoms;
    const nR = j.residues;
    const open = Float32Array.from(j.open, (v) => v / 1000);
    const closed = Float32Array.from(j.closed, (v) => v / 1000);
    const caOpen = new Float32Array(nR * 3);
    j.ca.forEach((a, r) => { caOpen.set(open.subarray(3 * a, 3 * a + 3), 3 * r); });
    // ribbon direction per residue: towards the local curvature centre (points
    // into a helix, alternates along a strand), kept free of sudden flips
    const normals = new Float32Array(nR * 3);
    let prev = [0, 1, 0];
    for (let r = 0; r < nR; r += 1) {
      const a = Math.max(0, r - 1);
      const b = Math.min(nR - 1, r + 1);
      let nv = [0, 1, 2].map((k) => caOpen[3 * a + k] + caOpen[3 * b + k] - 2 * caOpen[3 * r + k]);
      const l = Math.hypot(...nv);
      nv = l > 1e-6 ? nv.map((v) => v / l) : prev;
      if (nv[0] * prev[0] + nv[1] * prev[1] + nv[2] * prev[2] < 0) nv = nv.map((v) => -v);
      normals.set(nv, 3 * r);
      prev = nv;
    }
    // the molecular surface (open and closed), its colour and baked ambient light
    const s = j.surface;
    const sOpen = Float32Array.from(decode(s.open, Int16Array), (v) => v / 1000);
    const sClosed = Float32Array.from(decode(s.closed, Int16Array), (v) => v / 1000);
    const index = decode(s.index, Uint16Array);
    const tone = decode(s.tone, Uint8Array);
    const ao = decode(s.ao, Uint8Array);
    const sAttr = new Float32Array(s.vertices * 2);
    // the LID vertex furthest out: where the ID card is pinned
    let anchor = 0;
    let far = 0;
    for (let v = 0; v < s.vertices; v += 1) {
      sAttr[2 * v] = (tone[v] * 3) / 255;
      sAttr[2 * v + 1] = ao[v] / 255;
      const d = Math.hypot(sOpen[3 * v], sOpen[3 * v + 1], sOpen[3 * v + 2]);
      if (sAttr[2 * v] > 2.3 && d > far) { far = d; anchor = v; }
    }
    const surface = { open: sOpen, closed: sClosed, nOpen: vertexNormals(sOpen, index), nClosed: vertexNormals(sClosed, index), index, attr: sAttr, atomVertex: decode(s.atomVertex, Uint16Array) };
    return { nA, nR, open, closed, caIdx: Int16Array.from(j.ca), res: Int16Array.from(j.res), ss: j.ss, dom: j.dom, normals, surface, anchor };
  }

  /* ── The site's free-energy landscape as a terrain ───────────────────── */
  const LAND = window.MDDBLandscape;
  const TERRAIN = { x: 1.15, z: 0.78, y0: -0.72, h: 0.62 };
  let eRange = null;
  function energyRange() {
    if (eRange) return eRange;
    const es = [];
    for (let j = 0; j <= 40; j += 1) for (let i = 0; i <= 60; i += 1) es.push(LAND.energy((i / 60) * LAND.W, (j / 40) * LAND.H));
    es.sort((a, b) => a - b);
    eRange = [es[0], es[Math.floor(es.length * 0.85)]];
    return eRange;
  }
  // landscape (SVG units) -> world; height grows with energy, capped like a coastline
  function terrainPoint(sx, sy, out) {
    const [lo, hi] = energyRange();
    const e = clamp((LAND.energy(sx, sy) - lo) / (hi - lo), 0, 1.15);
    out[0] = (sx / LAND.W - 0.5) * 2 * TERRAIN.x;
    out[1] = TERRAIN.y0 + e * TERRAIN.h;
    out[2] = (sy / LAND.H - 0.5) * 2 * TERRAIN.z;
    return e;
  }

  /* ── WebGL ─────────────────────────────────────────────────────────── */
  // Depth is linear in the distance from the camera; points and the surface
  // share it, so particles behind the molecule are hidden.
  const DEPTH = 'clamp((w - 1.0) / 8.0, 0.0, 1.0) * 2.0 - 1.0';
  const PALETTE = `
    vec3 palette(float tone) {
      return tone < 1.0 ? mix(uC0, uC1, tone) : tone < 2.0 ? mix(uC1, uC2, tone - 1.0) : mix(uC2, uC3, min(tone - 2.0, 1.0));
    }`;
  const VERT = `
    attribute vec3 aPos;
    attribute vec4 aAttr;      // size, tone, glow, space (0 world, 1 view)
    uniform mat3 uRot;
    uniform vec2 uScale;
    uniform float uDist, uPoint, uMaxPoint, uBlur;
    varying vec4 vAttr;
    varying float vAlpha, vK, vNear;
    void main() {
      vec3 p = mix(uRot * aPos, aPos, aAttr.w);
      vNear = clamp(p.z / ${FIT.toFixed(2)} * 0.5 + 0.5, 0.0, 1.0);
      float w = uDist - p.z;
      gl_Position = vec4(p.xy * uScale / w, ${DEPTH}, 1.0);
      float px = max(aAttr.x * uPoint * uDist / w, 0.0);
      float size = px + abs(p.z) * uBlur;            // depth of field: out of focus = bigger
      vAlpha = px * px / max(size * size, 0.01);     // ... and fainter
      float sprite = min(size * (1.0 + 5.0 * aAttr.z), uMaxPoint);
      vK = sprite / max(size, 0.01);
      vAttr = aAttr;
      gl_PointSize = px > 0.05 ? sprite : 0.0;
    }`;
  const FRAG = `
    precision mediump float;
    uniform vec3 uC0, uC1, uC2, uC3, uFar;
    varying vec4 vAttr;
    varying float vAlpha, vK, vNear;
    ${PALETTE}
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      if (r > 1.0) discard;
      vec3 col = mix(uFar, palette(vAttr.y), 0.4 + 0.6 * vNear); // the far side fades to pale blue
      float rr = r * vK;                              // in dot radii
      float a = (1.0 - smoothstep(0.4, 1.0, rr)) * vAlpha * mix(0.35, 0.95, vNear);
      float glow = vAttr.z;
      if (glow > 0.0) {                               // the site's bright dot: white core, blue rim, halo
        float core = 1.0 - smoothstep(0.38, 0.6, rr);
        float rim = 1.0 - smoothstep(0.62, 1.0, rr);
        float body = max(core, rim);
        a = body + pow(1.0 - r, 1.6) * 0.5 * glow * (1.0 - body);
        col = mix(mix(uC2, uFar, 0.3), mix(uC2, vec3(1.0), core), body / max(a, 0.001));
      }
      gl_FragColor = vec4(col * a, a);
    }`;
  // The molecular surface: open/closed vertices mixed on the GPU, lit with a
  // key light, a fill, a soft specular and a pale rim, darkened by the baked
  // ambient occlusion; coloured by domain like the particles.
  const MESH_VERT = `
    attribute vec3 aOpen, aClosed, aNOpen, aNClosed;
    attribute vec2 aSurf;      // tone, ambient light
    uniform mat3 uRot;
    uniform vec2 uScale;
    uniform float uDist, uConf, uMeshScale;
    uniform vec3 uMeshOffset;
    varying vec3 vN;
    varying vec2 vSurf;
    void main() {
      vec3 p = uRot * (mix(aOpen, aClosed, uConf) * uMeshScale + uMeshOffset);
      float w = uDist - p.z;
      gl_Position = vec4(p.xy * uScale / w, ${DEPTH}, 1.0);
      vN = uRot * mix(aNOpen, aNClosed, uConf);
      vSurf = aSurf;
    }`;
  const MESH_FRAG = `
    precision mediump float;
    uniform vec3 uC0, uC1, uC2, uC3;
    uniform float uAlpha;
    varying vec3 vN;
    varying vec2 vSurf;
    ${PALETTE}
    void main() {
      vec3 n = normalize(vN);
      vec3 key = normalize(vec3(-0.45, 0.6, 0.65));
      float diff = max(dot(n, key), 0.0);
      float fill = max(dot(n, normalize(vec3(0.7, -0.3, 0.6))), 0.0) * 0.22;
      float spec = pow(max(dot(n, normalize(key + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * 0.28;
      float rim = pow(1.0 - max(n.z, 0.0), 2.5);
      float ao = mix(0.3, 1.0, vSurf.y);
      vec3 col = palette(vSurf.x) * (0.5 + 0.55 * diff + fill) * ao + spec + rim * 0.45 * vec3(0.78, 0.89, 1.0);
      gl_FragColor = vec4(min(col, 1.0) * uAlpha, uAlpha);
    }`;
  const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
  // indigo, blue-600, blue-500, cyan: deep enough to read on the light section
  const COLORS = { uC0: rgb('#3a46d0'), uC1: rgb('#0a6cd4'), uC2: rgb('#1a8cff'), uC3: rgb('#0ea5d9'), uFar: rgb('#a9d4ff') };
  const palette = (tone) => {
    const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    return tone < 1 ? mix(COLORS.uC0, COLORS.uC1, tone) : tone < 2 ? mix(COLORS.uC1, COLORS.uC2, tone - 1) : mix(COLORS.uC2, COLORS.uC3, Math.min(tone - 2, 1));
  };

  function compile(gl, vs, fs) {
    const shader = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    return prog;
  }

  const pointPx = (w, h, dpr) => 3 * dpr * clamp(Math.min(w, h) / 600, 0.6, 1.3);
  const blurPx = (w, h, dpr) => 2.4 * dpr * clamp(Math.min(w, h) / 600, 0.6, 1.3);
  const fitScale = (w, h) => {
    const k = (0.94 * DIST) / (Math.min(w, h) < 480 ? FIT_SMALL : FIT);
    return w >= h ? [(k * h) / w, k] : [k, (k * w) / h];
  };

  /* ── Renderers: resize(w, h, dpr) and draw(pos, attr, rot, mesh, glowFrom)
     mesh = { conf, scale, offset, alpha } places the molecular surface;
     particles from glowFrom on (bright dots, trail) are drawn on top. ── */
  function webglRenderer(canvas, n, surface) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    if (!gl) return null;
    const pts = compile(gl, VERT, FRAG);
    const msh = compile(gl, MESH_VERT, MESH_FRAG);
    const loc = (prog, names, get) => Object.fromEntries(names.map((k) => [k, get.call(gl, prog, k)]));
    const up = loc(pts, ['uRot', 'uScale', 'uDist', 'uPoint', 'uMaxPoint', 'uBlur', 'uC0', 'uC1', 'uC2', 'uC3', 'uFar'], gl.getUniformLocation);
    const um = loc(msh, ['uRot', 'uScale', 'uDist', 'uConf', 'uMeshScale', 'uMeshOffset', 'uAlpha', 'uC0', 'uC1', 'uC2', 'uC3'], gl.getUniformLocation);
    const ap = loc(pts, ['aPos', 'aAttr'], gl.getAttribLocation);
    const am = loc(msh, ['aOpen', 'aClosed', 'aNOpen', 'aNClosed', 'aSurf'], gl.getAttribLocation);
    gl.useProgram(pts);
    Object.entries(COLORS).forEach(([k, v]) => gl.uniform3fv(up[k], v));
    gl.uniform1f(up.uDist, DIST);
    gl.uniform1f(up.uMaxPoint, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]);
    gl.useProgram(msh);
    ['uC0', 'uC1', 'uC2', 'uC3'].forEach((k) => gl.uniform3fv(um[k], COLORS[k]));
    gl.uniform1f(um.uDist, DIST);
    const buffer = (data, usage) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      return b;
    };
    const posBuf = buffer(n * 12, gl.DYNAMIC_DRAW);
    const attrBuf = buffer(n * 16, gl.DYNAMIC_DRAW);
    const sb = surface && {
      open: buffer(surface.open, gl.STATIC_DRAW),
      closed: buffer(surface.closed, gl.STATIC_DRAW),
      nOpen: buffer(surface.nOpen, gl.STATIC_DRAW),
      nClosed: buffer(surface.nClosed, gl.STATIC_DRAW),
      attr: buffer(surface.attr, gl.STATIC_DRAW),
      index: gl.createBuffer(),
    };
    if (sb) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sb.index);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, surface.index, gl.STATIC_DRAW);
    }
    const maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    const use = (prog, list) => { // program + its attribute buffers (WebGL 1 has no vertex arrays)
      gl.useProgram(prog);
      for (let k = 0; k < maxAttribs; k += 1) gl.disableVertexAttribArray(k);
      list.forEach(([l, b, size]) => {
        if (l < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
      });
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied 'over', for the light page
    gl.clearColor(0, 0, 0, 0);
    gl.depthFunc(gl.LEQUAL);
    gl.cullFace(gl.BACK);
    const points = (rot, from, count, depth) => {
      if (count <= 0) return;
      use(pts, [[ap.aPos, posBuf, 3], [ap.aAttr, attrBuf, 4]]);
      gl.uniformMatrix3fv(up.uRot, false, rot);
      gl.disable(gl.CULL_FACE);
      if (depth) { gl.enable(gl.DEPTH_TEST); gl.depthMask(false); } else gl.disable(gl.DEPTH_TEST);
      gl.drawArrays(gl.POINTS, from, count);
    };
    const mesh = (rot, m) => {
      use(msh, [[am.aOpen, sb.open, 3], [am.aClosed, sb.closed, 3], [am.aNOpen, sb.nOpen, 3], [am.aNClosed, sb.nClosed, 3], [am.aSurf, sb.attr, 2]]);
      gl.uniformMatrix3fv(um.uRot, false, rot);
      gl.uniform1f(um.uConf, m.conf);
      gl.uniform1f(um.uMeshScale, m.scale);
      gl.uniform3fv(um.uMeshOffset, m.offset);
      gl.uniform1f(um.uAlpha, m.alpha);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sb.index);
      gl.drawElements(gl.TRIANGLES, surface.index.length, gl.UNSIGNED_SHORT, 0);
    };
    return {
      gl,
      resize(w, h, dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(pts);
        gl.uniform2f(up.uScale, ...fitScale(w, h));
        gl.uniform1f(up.uPoint, pointPx(w, h, dpr));
        gl.uniform1f(up.uBlur, blurPx(w, h, dpr));
        gl.useProgram(msh);
        gl.uniform2f(um.uScale, ...fitScale(w, h));
      },
      draw(pos, attr, rot, m, glowFrom) {
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
        gl.bindBuffer(gl.ARRAY_BUFFER, attrBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, attr);
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const surf = sb && m && m.alpha > 0.005;
        if (surf && m.alpha > 0.98) { // solid: the surface first, particles behind it hidden
          mesh(rot, m);
          points(rot, 0, glowFrom, true);
        } else { // see-through: particles first, the surface glazed over them
          points(rot, 0, glowFrom, false);
          if (surf) mesh(rot, m);
        }
        points(rot, glowFrom, n - glowFrom, false);
      }
    };
  }

  // The same picture with the 2D canvas: dots batched by colour and strength
  // (depth of field and distance); the surface as lit dots facing the viewer;
  // glowing dots on top.
  function canvasRenderer(canvas, n, surface) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const TONES = 7; // 0, 0.5 ... 3
    const LEVELS = 6;
    const LIGHTS = 8;
    const css = (c, a) => `rgba(${c.map((v) => Math.round(clamp(v, 0, 1) * 255)).join(',')},${a.toFixed(3)})`;
    const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
    const styles = [];
    const surfStyles = [];
    for (let ti = 0; ti < TONES; ti += 1) {
      const c = palette(ti / 2);
      for (let li = 0; li < LEVELS; li += 1) {
        const lf = (li + 1) / LEVELS; // faint ones are also paler, like the far side in WebGL
        styles.push(css(mix(COLORS.uFar, c, 0.4 + 0.6 * lf), lf * 0.85));
      }
      for (let li = 0; li < LIGHTS; li += 1) surfStyles.push(css(c.map((v) => v * (0.4 + (li / (LIGHTS - 1)) * 0.9)), 1));
    }
    const sx = new Float32Array(n);
    const sy = new Float32Array(n);
    const ss = new Float32Array(n);
    const bucket = new Int16Array(n);
    const order = new Uint32Array(n);
    const starts = new Uint32Array(styles.length + 1);
    const nv = surface ? surface.open.length / 3 : 0;
    const vx = new Float32Array(nv);
    const vy = new Float32Array(nv);
    const vb = new Int16Array(nv);
    const vorder = new Uint32Array(nv);
    const vstarts = new Uint32Array(surfStyles.length + 1);
    const key = [-0.45, 0.6, 0.65].map((v) => v / Math.hypot(-0.45, 0.6, 0.65));
    let W = 1;
    let H = 1;
    let kx = 1;
    let ky = 1;
    let point = 1;
    let blur = 1;
    const batch = (count, keyOf, startsArr, orderArr, list, drawOne) => { // counting sort by style, one path per style
      startsArr.fill(0);
      for (let i = 0; i < count; i += 1) if (keyOf[i] >= 0) startsArr[keyOf[i] + 1] += 1;
      for (let b = 1; b < startsArr.length; b += 1) startsArr[b] += startsArr[b - 1];
      const fill = startsArr.slice(0, -1);
      for (let i = 0; i < count; i += 1) if (keyOf[i] >= 0) { orderArr[fill[keyOf[i]]] = i; fill[keyOf[i]] += 1; }
      for (let b = 0; b < list.length; b += 1) {
        if (startsArr[b + 1] === startsArr[b]) continue;
        ctx.fillStyle = list[b];
        ctx.beginPath();
        for (let k = startsArr[b]; k < startsArr[b + 1]; k += 1) drawOne(orderArr[k]);
        ctx.fill();
      }
    };
    return {
      resize(w, h, dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        W = canvas.width;
        H = canvas.height;
        const [ax, ay] = fitScale(w, h);
        kx = (ax * W) / 2;
        ky = (ay * H) / 2;
        point = pointPx(w, h, dpr);
        blur = blurPx(w, h, dpr);
      },
      draw(pos, attr, rot, m, glowFrom) {
        ctx.clearRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        const glows = [];
        for (let i = 0; i < n; i += 1) {
          bucket[i] = -1;
          const size0 = attr[4 * i];
          if (size0 <= 0.01) continue;
          let x = pos[3 * i];
          let y = pos[3 * i + 1];
          let z = pos[3 * i + 2];
          if (attr[4 * i + 3] < 0.5) {
            const rx = rot[0] * x + rot[3] * y + rot[6] * z;
            const ry = rot[1] * x + rot[4] * y + rot[7] * z;
            z = rot[2] * x + rot[5] * y + rot[8] * z;
            x = rx;
            y = ry;
          }
          const w = DIST - z;
          const px = (size0 * point * DIST) / w;
          const size = px + Math.abs(z) * blur;
          sx[i] = W / 2 + (x * kx) / w;
          sy[i] = H / 2 - (y * ky) / w;
          ss[i] = size;
          if (i >= glowFrom || attr[4 * i + 2] > 0.02) { glows.push(i); continue; }
          const near = clamp((z / FIT) * 0.5 + 0.5, 0, 1);
          const level = clamp(Math.round(((px * px) / (size * size)) * (0.35 + 0.65 * near) * LEVELS) - 1, 0, LEVELS - 1);
          bucket[i] = Math.round(clamp(attr[4 * i + 1], 0, 3) * 2) * LEVELS + level;
        }
        batch(n, bucket, starts, order, styles, (i) => {
          const s = ss[i] * 0.6;
          if (s < 3) ctx.rect(sx[i] - s / 2, sy[i] - s / 2, s, s);
          else { ctx.moveTo(sx[i] + s / 2, sy[i]); ctx.arc(sx[i], sy[i], s / 2, 0, TAU); }
        });
        if (surface && m && m.alpha > 0.005) { // the surface: lit dots that face the viewer
          const { open: o, closed: c, nOpen: no, nClosed: nc, attr: sa } = surface;
          let dot = 1;
          for (let v = 0; v < nv; v += 1) {
            vb[v] = -1;
            const k3 = 3 * v;
            const nx = no[k3] + (nc[k3] - no[k3]) * m.conf;
            const ny = no[k3 + 1] + (nc[k3 + 1] - no[k3 + 1]) * m.conf;
            const nz = no[k3 + 2] + (nc[k3 + 2] - no[k3 + 2]) * m.conf;
            const rz = rot[2] * nx + rot[5] * ny + rot[8] * nz;
            if (rz < 0) continue;
            const rx = rot[0] * nx + rot[3] * ny + rot[6] * nz;
            const ry = rot[1] * nx + rot[4] * ny + rot[7] * nz;
            const x = (o[k3] + (c[k3] - o[k3]) * m.conf) * m.scale + m.offset[0];
            const y = (o[k3 + 1] + (c[k3 + 1] - o[k3 + 1]) * m.conf) * m.scale + m.offset[1];
            const z = (o[k3 + 2] + (c[k3 + 2] - o[k3 + 2]) * m.conf) * m.scale + m.offset[2];
            const w = DIST - (rot[2] * x + rot[5] * y + rot[8] * z);
            vx[v] = W / 2 + ((rot[0] * x + rot[3] * y + rot[6] * z) * kx) / w;
            vy[v] = H / 2 - ((rot[1] * x + rot[4] * y + rot[7] * z) * ky) / w;
            dot = (0.03 * m.scale * kx) / w; // radius: just over half the vertex spacing
            const light = (0.5 + 0.55 * Math.max(0, rx * key[0] + ry * key[1] + rz * key[2])) * (0.3 + 0.7 * sa[2 * v + 1]);
            vb[v] = Math.round(clamp(sa[2 * v], 0, 3) * 2) * LIGHTS + Math.round(clamp(light, 0, 1) * (LIGHTS - 1));
          }
          ctx.globalAlpha = m.alpha;
          batch(nv, vb, vstarts, vorder, surfStyles, (v) => { ctx.moveTo(vx[v] + dot, vy[v]); ctx.arc(vx[v], vy[v], dot, 0, TAU); });
          ctx.globalAlpha = 1;
        }
        glows.forEach((i) => {
          const g = attr[4 * i + 2];
          if (g <= 0.02) { // trail dots: plain
            const s = ss[i] * 0.6;
            ctx.fillStyle = styles[Math.round(clamp(attr[4 * i + 1], 0, 3) * 2) * LEVELS + LEVELS - 1];
            ctx.beginPath();
            ctx.arc(sx[i], sy[i], Math.max(0.5, s / 2), 0, TAU);
            ctx.fill();
            return;
          }
          const dot = ss[i] / 2;
          const R = dot * (1 + 5 * g);
          const grad = ctx.createRadialGradient(sx[i], sy[i], 0, sx[i], sy[i], R);
          grad.addColorStop(0, 'rgba(255,255,255,1)');
          grad.addColorStop((0.4 * dot) / R, 'rgba(255,255,255,1)');
          grad.addColorStop((0.62 * dot) / R, 'rgba(26,140,255,1)');
          grad.addColorStop(Math.min(0.98, dot / R), `rgba(26,140,255,${(0.4 * g).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(26,140,255,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx[i], sy[i], R, 0, TAU);
          ctx.fill();
        });
      }
    };
  }

  /* ── One panel ──────────────────────────────────────────────────────────
     opts: canvas, src (molecule JSON), counts {protein, library, dust},
     dprMax, shape (fixed state, stacked layout) or undefined (morphs with
     setProgress), hud (the big panel's HUD elements), tilt, onFail. */
  function viewer(opts) {
    let canvas = opts.canvas;
    const NP = opts.counts.protein;
    const NL = opts.counts.library;
    const ND = opts.counts.dust;
    const n = NP + NL + ND + SPECIAL;
    const L0 = NP;
    const D0 = NP + NL;
    const S0 = NP + NL + ND;
    const pos = new Float32Array(n * 3);
    const attr = new Float32Array(n * 4);
    const oa = new Float32Array(7);
    const ob = new Float32Array(7);
    const rnd = random(20261011 + NP);
    const seed = Float32Array.from({ length: n * 4 }, rnd); // four fixed random numbers per particle
    let M = null; // molecule
    let pre = null; // per-particle data that needs the molecule
    let renderer = null;
    let failed = false;
    let visible = false;
    let raf = 0;
    let last = 0;
    let clock = 0;
    let born = -1; // when the molecule first appeared (it assembles)
    let target = opts.shape || 0;
    let shown = target;
    let step = -1;
    let walker = null;
    let walkConf = 0;
    const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
    let size = [1, 1];
    let scale = [1, 1];
    // view-space points where streams end or start (taken from the HUD on resize)
    const anchors = {
      api: [0.95, -0.9, 0],
      chips: [[-0.95, 0.85, 0], [0.9, 1.0, 0], [1.15, 0.05, 0], [0.85, -1.0, 0], [-0.95, -0.85, 0], [-1.15, 0.05, 0]],
    };

    /* per-particle setup once the molecule is known */
    function setup() {
      const atom = new Int16Array(NP);
      const pj = new Float32Array(NP * 3);
      const tone = new Float32Array(NP);
      const rib = new Float32Array(NP * 4); // residue, position along it, across, thickness
      const domTone = { C: 1.35, L: 2.7, N: 0.45 }; // CORE blue, LID cyan, NMP indigo
      const width = { H: 0.05, E: 0.055, C: 0.012 };
      for (let i = 0; i < NP; i += 1) {
        const a = Math.floor(seed[4 * i] * M.nA) % M.nA; // spread over every atom
        atom[i] = a;
        const r = M.res[a];
        const g = () => (rnd() + rnd() + rnd() - 1.5) * 0.016; // ~0.6 Å jitter
        pj[3 * i] = g();
        pj[3 * i + 1] = g();
        pj[3 * i + 2] = g();
        tone[i] = domTone[M.dom[r]] + (seed[4 * i + 1] - 0.5) * 0.5;
        rib[4 * i] = Math.min(r, M.nR - 2);
        rib[4 * i + 1] = seed[4 * i + 2];
        rib[4 * i + 2] = (seed[4 * i + 3] * 2 - 1) * width[M.ss[r]];
        rib[4 * i + 3] = (rnd() * 2 - 1) * 0.008;
      }
      // library: 26 small datasets drifting in depth (out of focus)
      const centres = [];
      const r2 = random(7);
      while (centres.length < 26) {
        const c = [(r2() * 2 - 1) * 2.1, (r2() * 2 - 1) * 1.5, -3.2 + r2() * 4.2];
        if (Math.hypot(c[0], c[1]) < 1.0 && c[2] > -1.4) continue; // keep the middle clear
        centres.push(c.concat(0.09 + r2() * 0.08, r2() * TAU));
      }
      // terrain: the site's contour map raised into 3D. Most particles sit on
      // the contour lines, a few fill the slopes; the steep rim is left out.
      const terr = new Float32Array(NL * 4);
      const onLine = new Uint8Array(NL);
      const tp = [0, 0, 0];
      const r3 = random(11);
      for (let k = 0, tries = 0; k < NL && tries < NL * 80; tries += 1) {
        if (!LAND) { terr.set([(r3() - 0.5) * 2 * TERRAIN.x, TERRAIN.y0, (r3() - 0.5) * 2 * TERRAIN.z, 0.5], 4 * k); k += 1; continue; }
        const e = terrainPoint(r3() * LAND.W, r3() * LAND.H, tp);
        if (e > 1) continue;
        const line = Math.abs(frac(e * 7 + 0.5) - 0.5) < 0.03;
        if (!line && r3() > 0.1) continue;
        terr.set([tp[0], tp[1], tp[2], e], 4 * k);
        onLine[k] = line ? 1 : 0;
        k += 1;
      }
      let xMax = 0;
      let zMax = 0;
      for (let k = 0; k < NL; k += 1) { xMax = Math.max(xMax, terr[4 * k]); zMax = Math.max(zMax, terr[4 * k + 2]); }
      const pv = Uint16Array.from(atom, (at) => M.surface.atomVertex[at]); // where each particle sits on the surface
      pre = { atom, pv, pj, tone, rib, centres, terr, onLine, edge: [xMax, zMax] };
      if (LAND && !walker) {
        walker = LAND.createWalker();
        walker.advance(6); // start with a full trail
      }
    }

    /* positions of the protein's particles */
    const caNow = new Float32Array(1024 * 3);
    let caConf = -1;
    function updateCA(conf) {
      if (conf === caConf) return;
      caConf = conf;
      for (let r = 0; r < M.nR; r += 1) {
        const a = M.caIdx[r];
        for (let k = 0; k < 3; k += 1) caNow[3 * r + k] = M.open[3 * a + k] + (M.closed[3 * a + k] - M.open[3 * a + k]) * conf;
      }
    }
    function surfPos(i, k, conf, o) { // on the molecular surface next to the particle's atom, placed as in state k
      const S = M.surface;
      const v = 3 * pre.pv[i];
      const m = MESH[k];
      for (let c = 0; c < 3; c += 1) o[c] = (S.open[v + c] + (S.closed[v + c] - S.open[v + c]) * conf + pre.pj[3 * i + c]) * m.s + m.o[c];
    }
    function anchorPos(o) { // the found dataset's spot on the surface (state F)
      const a = 3 * M.anchor;
      const m = MESH[0];
      for (let c = 0; c < 3; c += 1) o[c] = M.surface.open[a + c] * m.s + m.o[c];
      return o;
    }
    function ribbonPos(i, o) { // Catmull-Rom through the C-alpha trace, as a flat ribbon
      const r = pre.rib[4 * i];
      const f = pre.rib[4 * i + 1];
      const r0 = Math.max(0, r - 1);
      const r3 = Math.min(M.nR - 1, r + 2);
      const f2 = f * f;
      const f3 = f2 * f;
      const d = [0, 0, 0];
      for (let k = 0; k < 3; k += 1) {
        const p0 = caNow[3 * r0 + k];
        const p1 = caNow[3 * r + k];
        const p2 = caNow[3 * (r + 1) + k];
        const p3 = caNow[3 * r3 + k];
        o[k] = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
        d[k] = (-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * f + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * f2;
      }
      const nx = M.normals[3 * r] + (M.normals[3 * r + 3] - M.normals[3 * r]) * f;
      const ny = M.normals[3 * r + 1] + (M.normals[3 * r + 4] - M.normals[3 * r + 1]) * f;
      const nz = M.normals[3 * r + 2] + (M.normals[3 * r + 5] - M.normals[3 * r + 2]) * f;
      const bx = d[1] * nz - d[2] * ny; // thickness direction
      const by = d[2] * nx - d[0] * nz;
      const bz = d[0] * ny - d[1] * nx;
      const bl = Math.hypot(bx, by, bz) || 1;
      const w = pre.rib[4 * i + 2];
      const th = pre.rib[4 * i + 3] / bl;
      o[0] += nx * w + bx * th;
      o[1] += ny * w + by * th;
      o[2] += nz * w + bz * th;
    }
    const set = (o, x, y, z, s, tone, glow, space) => { o[0] = x; o[1] = y; o[2] = z; o[3] = s; o[4] = tone; o[5] = glow; o[6] = space; };
    const bez = (a, b, c, u, k) => (1 - u) * (1 - u) * a[k] + 2 * u * (1 - u) * b[k] + u * u * c[k];

    /* values shared by the state functions, set once per frame */
    const F = { t: 0, confA: 0, born: 1, trail: null, tn: 0, tp: [0, 0, 0] };

    // the four states: (i, o) -> o = [x, y, z, size, tone, glow, space]
    const STATES = [
      function findable(i, o) {
        const t = F.t;
        if (i < NP) {
          surfPos(i, 0, 0, o);
          // first appearance: the particles gather out of the drifting library
          // onto the molecular surface, which then turns solid
          const e = easeInOut(clamp((F.born - seed[4 * i + 3] * 0.35) / 0.65, 0, 1));
          if (e < 1) {
            const c = pre.centres[i % pre.centres.length];
            o[0] += (c[0] - o[0]) * (1 - e);
            o[1] += (c[1] - o[1]) * (1 - e);
            o[2] += (c[2] - o[2]) * (1 - e);
          }
          return set(o, o[0], o[1], o[2], 0.85 * (1 - smooth(0.75, 1, F.born)), pre.tone[i], 0, 0);
        }
        if (i < D0) { // other datasets: tiny copies of a molecule, drifting
          const c = pre.centres[(i - L0) % pre.centres.length];
          const a = Math.floor(seed[4 * i] * M.nA);
          const cs = Math.cos(c[4] + t * 0.05);
          const sn = Math.sin(c[4] + t * 0.05);
          const x = M.open[3 * a];
          const z = M.open[3 * a + 2];
          return set(o, c[0] + (x * cs - z * sn) * c[3] + 0.04 * Math.sin(t * 0.2 + c[4]), c[1] + M.open[3 * a + 1] * c[3] + 0.04 * Math.cos(t * 0.17 + c[4]),
            c[2] + (x * sn + z * cs) * c[3], 0.9, 1 + seed[4 * i + 1] * 1.6, 0, 0);
        }
        if (i < S0) return dust(i, o);
        if (i > S0) return hidden(o);
        const on = smooth(0.6, 1, F.born); // the dataset that is found: the site's bright dot
        anchorPos(o);
        return set(o, o[0], o[1], o[2], 3 * on, 3, on, 0);
      },
      function accessible(i, o) {
        const t = F.t;
        if (i < NP) { // the surface carries the protein here; its particles wait on it, unseen
          surfPos(i, 1, F.confA, o);
          return set(o, o[0], o[1], o[2], 0, pre.tone[i], 0, 0);
        }
        if (i < D0) { // packets of frames streaming to the API card (view space)
          const k = i - L0;
          if (k % 5 > 1) return hidden(o); // two in five library particles carry frames
          const pk = L0 + (k % 24);
          const u = frac(seed[4 * pk] + t * 0.2 + seed[4 * i] * 0.05); // a short comet along the path
          const start = [-0.12 + (seed[4 * pk + 1] - 0.5) * 0.6, 0.08 + (seed[4 * pk + 2] - 0.5) * 0.6, 0.2];
          const end = anchors.api;
          const mid = [(start[0] + end[0]) / 2 + 0.25, (start[1] + end[1]) / 2 + 0.35, 0.6];
          const fade = smooth(0, 0.12, u) * smooth(1, 0.8, u);
          const j = 0.022;
          return set(o, bez(start, mid, end, u, 0) + (seed[4 * i + 1] + seed[4 * i + 2] - 1) * j, bez(start, mid, end, u, 1) + (seed[4 * i + 2] + seed[4 * i + 3] - 1) * j,
            bez(start, mid, end, u, 2) + (seed[4 * i + 3] + seed[4 * i + 1] - 1) * j, 0.75 * fade, 2.3, 0, 1);
        }
        if (i < S0) return dust(i, o);
        return hidden(o);
      },
      function interoperable(i, o) {
        const t = F.t;
        if (i < NP) {
          ribbonPos(i, o);
          return set(o, o[0] * 0.95, o[1] * 0.95, o[2] * 0.95, 0.95, pre.tone[i] + 0.15, 0, 0);
        }
        if (i < D0) { // formats streaming in from the chips (view space)
          const c = anchors.chips[(i - L0) % anchors.chips.length];
          const u = frac(seed[4 * i] + t * 0.11);
          const end = [(seed[4 * i + 1] - 0.5) * 0.5, (seed[4 * i + 2] - 0.5) * 0.5, 0.1];
          const mid = [c[0] * 0.45, c[1] * 0.45 + 0.1, 0.5];
          const fade = smooth(0, 0.15, u) * smooth(1, 0.7, u);
          return set(o, bez(c, mid, end, u, 0), bez(c, mid, end, u, 1), bez(c, mid, end, u, 2), 0.7 * fade, 2.2, 0, 1);
        }
        if (i < S0) return dust(i, o);
        return hidden(o);
      },
      function reusable(i, o) {
        if (i < NP) { // the (small) surface above the terrain carries the protein; particles wait on it
          surfPos(i, 3, walkConf, o);
          return set(o, o[0], o[1], o[2], 0, pre.tone[i], 0, 0);
        }
        if (i < D0) { // the landscape: contour lines, brightest in the basins
          const k = i - L0;
          const e = pre.terr[4 * k + 3];
          const line = pre.onLine[k];
          return set(o, pre.terr[4 * k], pre.terr[4 * k + 1], pre.terr[4 * k + 2], line ? 0.95 : 0.45, 2.8 - e * 1.9 + 0.2 * line, 0, 0);
        }
        if (i < S0) return dust(i, o);
        if (!F.trail) return hidden(o);
        const k = i - S0; // 0: the walker, then its trail, fading
        const idx = Math.max(0, F.tn - 1 - Math.round((k * (F.tn - 1)) / (SPECIAL - 1)));
        terrainPoint(F.trail[2 * idx], F.trail[2 * idx + 1], F.tp);
        return set(o, F.tp[0], F.tp[1] + 0.03, F.tp[2], k === 0 ? 2.4 : 1.1 * (1 - k / SPECIAL) + 0.2, 3, k === 0 ? 1 : 0, 0);
      },
    ];
    function dust(i, o) { // slow motes, the same in every state (view space)
      const t = F.t;
      return set(o, (seed[4 * i] * 2 - 1) * 2.2 + 0.05 * Math.sin(t * 0.13 + seed[4 * i + 3] * 9), (seed[4 * i + 1] * 2 - 1) * 1.7 + 0.05 * Math.cos(t * 0.11 + seed[4 * i + 3] * 7),
        -3 + seed[4 * i + 2] * 4.4, 0.5 + seed[4 * i + 3], 1 + seed[4 * i + 3] * 1.8, 0, 1);
    }
    function hidden(o) { return set(o, 0, 0, 0, 0, 2, 0, 0); }

    // every particle for state value s (0..3; fractions morph between states)
    function compute(s) {
      const a = Math.min(3, Math.floor(s));
      const b = Math.min(3, a + 1);
      const f = s - a;
      const A = STATES[a];
      const B = STATES[b];
      const morph = a !== b && f > 1e-4;
      if (a === 2 || (morph && b === 2)) updateCA(0);
      for (let i = 0; i < n; i += 1) {
        A(i, oa);
        if (morph) {
          B(i, ob);
          // each particle leaves at its own moment and bulges out on the way
          const e = easeInOut(clamp((f - seed[4 * i + 3] * 0.35) / 0.65, 0, 1));
          const bulge = Math.sin(Math.PI * e) * 0.45;
          for (let k = 0; k < 7; k += 1) oa[k] += (ob[k] - oa[k]) * e;
          oa[0] += (seed[4 * i] - 0.5) * bulge;
          oa[1] += (seed[4 * i + 1] - 0.5) * bulge;
          oa[2] += (seed[4 * i + 2] - 0.5) * bulge;
        }
        pos[3 * i] = oa[0];
        pos[3 * i + 1] = oa[1];
        pos[3 * i + 2] = oa[2];
        attr[4 * i] = oa[3];
        attr[4 * i + 1] = oa[4];
        attr[4 * i + 2] = oa[5];
        attr[4 * i + 3] = oa[6];
      }
      return { a, b, f };
    }

    /* HUD: a world point -> CSS pixels in the panel, and back (focal plane) */
    let rot = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    function project(x, y, z) {
      const rx = rot[0] * x + rot[3] * y + rot[6] * z;
      const ry = rot[1] * x + rot[4] * y + rot[7] * z;
      const w = DIST - (rot[2] * x + rot[5] * y + rot[8] * z);
      return [size[0] / 2 + ((rx * scale[0]) / w) * (size[0] / 2), size[1] / 2 - ((ry * scale[1]) / w) * (size[1] / 2)];
    }
    const unproject = (px, py) => [((px / size[0]) * 2 - 1) * (DIST / scale[0]), (1 - (py / size[1]) * 2) * (DIST / scale[1]), 0];

    function hud(s) {
      const h = opts.hud;
      if (!h) return;
      const k = Math.round(s);
      if (k !== step) {
        step = k;
        if (h.step) h.step.textContent = h.names[k] || '';
      }
      h.panels.forEach((p, j) => p.classList.toggle('is-on', Math.abs(s - j) < 0.3));
      if (Math.abs(s) < 0.3 && h.lead) { // leader line from the found dataset to its card
        const [x1, y1] = project(...anchorPos([0, 0, 0]));
        const card = h.cards[0];
        h.lead.setAttribute('x1', x1.toFixed(1));
        h.lead.setAttribute('y1', y1.toFixed(1));
        h.lead.setAttribute('x2', card.offsetLeft);
        h.lead.setAttribute('y2', (card.offsetTop + card.offsetHeight / 2).toFixed(1));
      }
      if (Math.abs(s - 1) < 0.3 && h.frame) { // the trajectory's progress
        const p = frac(F.t / PERIOD);
        h.frame.textContent = `frame ${String(Math.floor(p * 1000)).padStart(4, '0')} / 1000`;
        h.time.textContent = `t = ${p.toFixed(3)} µs`;
        h.bar.style.transform = `scaleX(${p.toFixed(3)})`;
      }
      if (Math.abs(s - 3) < 0.3 && h.axes.length === 2) { // axis labels along the terrain's edges
        const [ax, ay] = project(0, TERRAIN.y0 + 0.1, pre.edge[1] + 0.06);
        const [bx, by] = project(pre.edge[0] + 0.04, TERRAIN.y0 + 0.1, 0);
        h.axes[0].style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px) translate(-50%, 4px)`;
        h.axes[1].style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px) translate(-60%, -220%)`;
      }
    }

    /* ── Life cycle ───────────────────────────────────────────────────── */
    function init() {
      if (renderer || failed || !M) return !!renderer;
      try {
        renderer = webglRenderer(canvas, n, M.surface);
      } catch (e) {
        // the canvas is now tied to a broken WebGL context: draw on a fresh one
        const fresh = canvas.cloneNode(false);
        canvas.replaceWith(fresh);
        canvas = fresh;
        watch();
        renderer = null;
      }
      if (!renderer) renderer = canvasRenderer(canvas, n, M.surface);
      if (!renderer) {
        failed = true;
        if (opts.onFail) opts.onFail();
        return false;
      }
      if (renderer.gl) {
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); raf = 0; renderer = null; });
        canvas.addEventListener('webglcontextrestored', () => { if (init()) kick(); });
      }
      resize();
      return true;
    }

    function resize() {
      if (!renderer) return;
      size = [Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight)];
      scale = fitScale(size[0], size[1]);
      renderer.resize(size[0], size[1], Math.min(window.devicePixelRatio || 1, opts.dprMax));
      const h = opts.hud;
      if (h) { // where the streams meet the HUD
        const api = h.cards[1];
        if (api && api.offsetWidth) anchors.api = unproject(api.offsetLeft + 16, api.offsetTop + api.offsetHeight / 2);
        if (h.chips.length) anchors.chips = h.chips.map((c) => unproject(c.offsetLeft + c.offsetWidth / 2, c.offsetTop + c.offsetHeight / 2));
        if (h.lines) h.lines.setAttribute('viewBox', `0 0 ${size[0]} ${size[1]}`);
      }
      kick();
    }

    function draw(now) {
      raf = 0;
      if (!renderer || !visible) return;
      const still = reduceMQ.matches;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!still) clock += dt;
      if (born < 0) born = clock;
      shown += (target - shown) * (still ? 1 : 1 - Math.exp(-dt * 6));
      if (Math.abs(target - shown) < 1e-4) shown = target;
      ptr.x += (ptr.tx - ptr.x) * (1 - Math.exp(-dt * 4));
      ptr.y += (ptr.ty - ptr.y) * (1 - Math.exp(-dt * 4));

      F.t = still ? PERIOD * 0.3 : clock;
      F.born = still || opts.shape != null ? 1 : clamp((clock - born) / 1.6, 0, 1);
      F.confA = 0.5 - 0.5 * Math.cos((TAU * F.t) / PERIOD);
      if (walker && shown > 2.2) { // the walker runs only while the landscape is shown
        if (!still) walker.advance(dt);
        F.trail = walker.trail;
        F.tn = walker.trail.length / 2;
        const goal = clamp((F.trail[2 * F.tn - 2] - 330) / (1045 - 330), 0, 1); // CV1 across the basins
        walkConf += (goal - walkConf) * (still ? 1 : 1 - Math.exp(-dt * 2));
      }

      const { a, b, f } = compute(shown);
      const e = easeInOut(f);
      const yaw = (SWAY[a] + (SWAY[b] - SWAY[a]) * e) * Math.sin(F.t * 0.14) + ptr.x * 0.3;
      const pitch = PITCH[a] + (PITCH[b] - PITCH[a]) * e + ptr.y * 0.15;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cx = Math.cos(pitch);
      const sx = Math.sin(pitch);
      rot = [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
      // the molecular surface, placed between the two states like everything else
      const meshOf = (k) => ({ conf: k === 1 ? F.confA : k === 3 ? walkConf : 0, alpha: MESH[k].a * (k === 0 ? smooth(0.55, 1, F.born) : 1) });
      const ma = meshOf(a);
      const mb = meshOf(b);
      renderer.draw(pos, attr, rot, {
        conf: ma.conf + (mb.conf - ma.conf) * e,
        scale: MESH[a].s + (MESH[b].s - MESH[a].s) * e,
        offset: MESH[a].o.map((v, k) => v + (MESH[b].o[k] - v) * e),
        alpha: ma.alpha + (mb.alpha - ma.alpha) * e,
      }, S0);
      hud(shown);

      if (!still || shown !== target) raf = requestAnimationFrame(draw);
    }

    function kick() {
      if (raf || !renderer || !visible || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(draw);
    }

    // the molecule loads and the renderer starts the first time the panel nears the screen
    let observers = [];
    function watch() {
      observers.forEach((o) => o.disconnect());
      observers = [new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting && canvas.clientWidth > 0;
        if (!visible) return;
        if (M) { if (init()) kick(); return; }
        loadMolecule(opts.src).then((m) => {
          if (!M) { M = m; setup(); }
          if (init()) kick();
        }).catch(() => { failed = true; if (opts.onFail) opts.onFail(); });
      }, { rootMargin: '300px 0px' })];
      if ('ResizeObserver' in window) observers.push(new ResizeObserver(resize));
      observers.forEach((o) => o.observe(canvas));
    }
    watch();
    document.addEventListener('visibilitychange', kick);
    reduceMQ.addEventListener('change', kick);

    if (opts.tilt && window.matchMedia('(pointer: fine)').matches) {
      window.addEventListener('pointermove', (e) => {
        if (!visible) return;
        const r = canvas.getBoundingClientRect();
        ptr.tx = clamp((e.clientX - (r.left + r.width / 2)) / r.width, -1, 1);
        ptr.ty = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -1, 1);
      }, { passive: true });
    }

    return {
      // 0..1 through the pinned scene: hold each state, morph across the step boundaries
      setProgress(p) {
        let s = 0;
        for (let k = 1; k < STATES.length; k += 1) s += smooth(k / 4 - 0.06, k / 4 + 0.06, p);
        target = s;
        kick();
      }
    };
  }

  function start() {
    const scene = document.querySelector('.scene--fair');
    const figure = scene && scene.querySelector('.fair-viewer');
    if (!figure || scene.querySelector('.fair-mini')) return;
    const src = figure.dataset.src;
    const fail = () => scene.classList.add('fair--no3d');
    const panels = Array.from(figure.querySelectorAll('.fair-hud'));
    const names = Array.from(scene.querySelectorAll('.fair-step')).map((s) => {
      const letter = s.querySelector('.fair-step__letter');
      const title = s.querySelector('.fair-step__title');
      return `${letter ? letter.textContent.trim() : ''} · ${title ? title.textContent.trim() : ''}`;
    });
    const phone = window.matchMedia('(max-width: 767px)').matches;
    const main = viewer({
      canvas: figure.querySelector('canvas'),
      src,
      counts: phone ? { protein: 3200, library: 1800, dust: 220 } : { protein: 5600, library: 3000, dust: 420 },
      dprMax: phone ? 1.75 : 2,
      tilt: true,
      onFail: fail,
      hud: {
        panels,
        names,
        step: figure.querySelector('[data-fair="step"]'),
        cards: panels.map((p) => p.querySelector('.fair-hud__card')),
        chips: Array.from(figure.querySelectorAll('.fair-chip')),
        lines: figure.querySelector('.fair-viewer__lines'),
        lead: figure.querySelector('.fair-viewer__lines line'),
        frame: figure.querySelector('[data-fair="frame"]'),
        time: figure.querySelector('[data-fair="time"]'),
        bar: figure.querySelector('[data-fair="bar"]'),
        axes: Array.from(figure.querySelectorAll('.fair-hud__axis')),
      },
    });
    // stacked layout (reduced motion): a small panel on each principle, showing its own state
    scene.querySelectorAll('.fair-step').forEach((stepEl, k) => {
      const mini = document.createElement('div');
      mini.className = 'fair-mini';
      mini.setAttribute('aria-hidden', 'true');
      const canvas = document.createElement('canvas');
      const label = document.createElement('p');
      label.className = 'fair-mini__hud';
      label.textContent = panels[k] ? panels[k].dataset.mini || '' : '';
      mini.append(canvas, label);
      stepEl.prepend(mini);
      viewer({ canvas, src, counts: { protein: 2400, library: 1300, dust: 120 }, dprMax: 1.5, shape: k, onFail: fail });
    });
    // home.js reports the scroll progress through the pinned scene
    scene.addEventListener('scene:progress', (e) => main.setProgress(e.detail.progress));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
