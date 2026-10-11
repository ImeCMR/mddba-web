#!/usr/bin/env node
// Regenerates assets/images/energy-landscape.svg from the surface defined in
// assets/js/landscape.js. Run it after changing the wells there:
//
//   node tools/build-landscape.js
//
// No dependencies: marching squares -> joined polylines -> simplified ->
// smoothed into cubic Béziers.
const fs = require('fs');
const path = require('path');
const { W, H, WELLS, energy } = require('../assets/js/landscape.js');

const STEP = 4; // grid spacing in SVG units
const LEVEL_GAP = 0.5; // energy between neighbouring contour lines
const INDEX_EVERY = 4; // every Nth line is drawn heavier, like a map's index contours
const TOP = 3.2; // highest contour drawn
const OUT = path.join(__dirname, '..', 'assets', 'images', 'energy-landscape.svg');

/* Sample the surface */
const nx = Math.round(W / STEP);
const ny = Math.round(H / STEP);
const grid = [];
let min = Infinity;
for (let j = 0; j <= ny; j += 1) {
  const row = new Float64Array(nx + 1);
  for (let i = 0; i <= nx; i += 1) {
    row[i] = energy(i * STEP, j * STEP);
    if (row[i] < min) min = row[i];
  }
  grid.push(row);
}

/* Marching squares for one level: returns polylines (open ones end on the
   frame, closed ones repeat their first point). */
function isolines(level) {
  const pts = new Map(); // edge key -> [x, y]
  const adj = new Map(); // edge key -> neighbouring edge keys
  const point = (key, x0, y0, v0, x1, y1, v1) => {
    if (!pts.has(key)) {
      const t = (level - v0) / (v1 - v0);
      pts.set(key, [(x0 + (x1 - x0) * t) * STEP, (y0 + (y1 - y0) * t) * STEP]);
    }
    return key;
  };
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const tl = grid[j][i];
      const tr = grid[j][i + 1];
      const br = grid[j + 1][i + 1];
      const bl = grid[j + 1][i];
      const idx = (tl > level) * 8 + (tr > level) * 4 + (br > level) * 2 + (bl > level);
      if (idx === 0 || idx === 15) continue;
      const T = () => point(`h${i},${j}`, i, j, tl, i + 1, j, tr);
      const R = () => point(`v${i + 1},${j}`, i + 1, j, tr, i + 1, j + 1, br);
      const B = () => point(`h${i},${j + 1}`, i, j + 1, bl, i + 1, j + 1, br);
      const L = () => point(`v${i},${j}`, i, j, tl, i, j + 1, bl);
      const centre = (tl + tr + br + bl) / 4 > level;
      switch (idx) {
        case 1: case 14: link(L(), B()); break;
        case 2: case 13: link(B(), R()); break;
        case 3: case 12: link(L(), R()); break;
        case 4: case 11: link(T(), R()); break;
        case 6: case 9: link(T(), B()); break;
        case 7: case 8: link(L(), T()); break;
        case 5: // tr and bl above
          if (centre) { link(L(), T()); link(B(), R()); } else { link(T(), R()); link(L(), B()); }
          break;
        case 10: // tl and br above
          if (centre) { link(T(), R()); link(L(), B()); } else { link(L(), T()); link(B(), R()); }
          break;
        default: break;
      }
    }
  }
  const seen = new Set();
  const lines = [];
  const walk = (start) => {
    const line = [start];
    seen.add(start);
    let cur = start;
    for (;;) {
      const next = adj.get(cur).find((k) => !seen.has(k));
      if (!next) {
        if (line.length > 2 && adj.get(cur).includes(start)) line.push(start); // closed
        break;
      }
      seen.add(next);
      line.push(next);
      cur = next;
    }
    return line.map((k) => pts.get(k));
  };
  adj.forEach((n, k) => { if (n.length === 1 && !seen.has(k)) lines.push(walk(k)); }); // open first
  adj.forEach((n, k) => { if (!seen.has(k)) lines.push(walk(k)); });
  return lines;
}

/* Ramer–Douglas–Peucker */
function simplify(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let far = -1;
    let best = tol;
    for (let i = a + 1; i < b; i += 1) {
      // closed loops start and end on the same point: measure from that point
      const d = len < 1e-9
        ? Math.hypot(points[i][0] - ax, points[i][1] - ay)
        : Math.abs(dy * (points[i][0] - ax) - dx * (points[i][1] - ay)) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/* Catmull–Rom through the points, written as cubic Béziers */
const f = (n) => (Math.round(n * 10) / 10).toString();
function toPath(points, closed) {
  const p = closed ? points.slice(0, -1) : points;
  const n = p.length;
  if (n < 2) return '';
  const at = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${f(p[0][0])} ${f(p[0][1])}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/* Build the SVG: deeper lines are brighter, index lines heavier */
const first = Math.ceil((min + 0.25) / LEVEL_GAP) * LEVEL_GAP;
const levels = [];
for (let l = first; l <= TOP + 1e-9; l += LEVEL_GAP) levels.push(+l.toFixed(3));

const paths = levels.map((level, n) => {
  const depth = 1 - (level - min) / (TOP - min); // 1 = deepest
  const index = Math.round((level - first) / LEVEL_GAP) % INDEX_EVERY === 0;
  const d = isolines(level)
    .filter((line) => line.length > 3)
    .map((line) => {
      const closed = line[0] === line[line.length - 1] || (line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1]);
      if (closed) { // drop specks
        const xs = line.map((q) => q[0]);
        const ys = line.map((q) => q[1]);
        if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 18) return '';
      }
      return toPath(simplify(line, 0.9), closed);
    })
    .join('');
  if (!d) return '';
  const opacity = (0.16 + 0.5 * depth ** 1.4) * (index ? 1.5 : 1);
  return `<path class="${index ? 'i' : 'l'}" stroke-opacity="${Math.min(opacity, 0.95).toFixed(2)}" d="${d}"/>`;
}).filter(Boolean);

/* Mark each well's minimum (searched on the grid near the nominal centre) */
const minima = WELLS.map((w) => {
  let best = [w.x, w.y, Infinity];
  for (let y = w.y - 60; y <= w.y + 60; y += 2) {
    for (let x = w.x - 60; x <= w.x + 60; x += 2) {
      const e = energy(x, y);
      if (e < best[2]) best = [x, y, e];
    }
  }
  return best;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<!-- Generated by tools/build-landscape.js from assets/js/landscape.js; edit those, not this file. -->
<defs><radialGradient id="g"><stop offset="0" stop-color="#1a8cff" stop-opacity=".55"/><stop offset="1" stop-color="#1a8cff" stop-opacity="0"/></radialGradient></defs>
<style>path{fill:none;stroke:#7cc4ff;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.l{stroke-width:.8px}.i{stroke-width:1.4px}</style>
<g>${minima.map(([x, y, e]) => `<circle cx="${x}" cy="${y}" r="${Math.round(40 + -e * 9)}" fill="url(#g)" opacity="${(-e / 9 * 0.6).toFixed(2)}"/>`).join('')}</g>
${paths.join('\n')}
<g fill="#cfe8ff">${minima.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join('')}</g>
</svg>
`;
fs.writeFileSync(OUT, svg);
console.log(`levels ${levels.length} (${levels[0]} … ${levels[levels.length - 1]}), min ${min.toFixed(2)}, ${(svg.length / 1024).toFixed(1)} KB -> ${path.relative(process.cwd(), OUT)}`);
