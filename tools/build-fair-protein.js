#!/usr/bin/env node
// Builds assets/data/fair-protein.json, the molecule in the FAIR viewer on the
// home page (assets/js/fair3d.js): E. coli adenylate kinase, open (PDB 4AKE)
// and closed (PDB 1AKE), chain A. PDB data is public domain (CC0).
//
//   node tools/build-fair-protein.js              # downloads both from RCSB
//   node tools/build-fair-protein.js open.pdb closed.pdb
//
// No dependencies (Node 18+ for fetch). Heavy atoms present in both
// structures are kept, the closed form is superposed on the open one by its
// C-alpha atoms (Kabsch, via Horn's quaternion method), the pair is centred,
// turned so its long axis runs left-right and scaled to unit radius.
//
// It also builds the molecular surface shown by the viewer: a smooth Gaussian
// surface (as in VMD QuickSurf / ChimeraX) meshed with surface nets, with
// ambient occlusion baked per vertex. The closed form of the surface follows
// the atoms (each vertex moves with its nearest atoms).
const fs = require('fs');
const path = require('path');

const IDS = { open: '4AKE', closed: '1AKE' };
const CHAIN = 'A';
const DOMAINS = [['N', 30, 59], ['L', 122, 159]]; // NMP-binding and LID domains; the rest is the CORE
const OUT = path.join(__dirname, '..', 'assets', 'data', 'fair-protein.json');

async function load(id, file) {
  if (file) return fs.readFileSync(file, 'utf8');
  const res = await fetch(`https://files.rcsb.org/download/${id}.pdb`);
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  return res.text();
}

// Heavy atoms of one chain (first altLoc), keyed "resSeq:name", plus HELIX/SHEET ranges.
function parse(text) {
  const atoms = new Map();
  const ss = [];
  for (const line of text.split('\n')) {
    const rec = line.slice(0, 6);
    if (rec === 'ATOM  ') {
      const alt = line[16];
      const element = line.slice(76, 78).trim() || line.slice(12, 14).trim()[0];
      if (line[21] !== CHAIN || (alt !== ' ' && alt !== 'A') || element === 'H') continue;
      const key = `${parseInt(line.slice(22, 26), 10)}:${line.slice(12, 16).trim()}`;
      if (!atoms.has(key)) atoms.set(key, [30, 38, 46].map((c) => parseFloat(line.slice(c, c + 8)))); // x, y, z columns
    } else if (rec === 'HELIX ' && line[19] === CHAIN) {
      ss.push(['H', parseInt(line.slice(21, 25), 10), parseInt(line.slice(33, 37), 10)]);
    } else if (rec === 'SHEET ' && line[21] === CHAIN) {
      ss.push(['E', parseInt(line.slice(22, 26), 10), parseInt(line.slice(33, 37), 10)]);
    }
  }
  return { atoms, ss };
}

// Eigen-decomposition of a small symmetric matrix (cyclic Jacobi).
function jacobi(m) {
  const n = m.length;
  const a = m.map((r) => r.slice());
  const v = a.map((_, i) => a.map((__, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 60; sweep += 1) {
    let off = 0;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) off += a[p][q] * a[p][q];
    if (off < 1e-20) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k += 1) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k += 1) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k += 1) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v }; // eigenvector i = column i
}

const centroid = (pts) => pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
const sub = (p, c) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
const apply = (R, p) => [0, 1, 2].map((i) => R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2]);

// Rotation that best maps the points `mov` onto `ref` (both centred), Horn 1987.
function superpose(ref, mov) {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  ref.forEach((r, k) => { for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) S[i][j] += mov[k][i] * r[j]; });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ];
  const { values, vectors } = jacobi(N);
  const best = values.indexOf(Math.max(...values));
  const [w, x, y, z] = vectors.map((r) => r[best]);
  return [
    [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z],
  ];
}

/* ── Molecular surface ───────────────────────────────────────────────── */
const RADIUS = { C: 1.7, N: 1.55, O: 1.52, S: 1.8 };
const GRID = 1.5;    // Å between density samples
const SIGMA = 0.75;  // Gaussian width, in atom radii
const ISO = 0.35;    // density at the surface

function molecularSurface(atoms, elements) {
  const lo = [0, 1, 2].map((k) => Math.min(...atoms.map((p) => p[k])) - 6);
  const hi = [0, 1, 2].map((k) => Math.max(...atoms.map((p) => p[k])) + 6);
  const [nx, ny, nz] = [0, 1, 2].map((k) => Math.ceil((hi[k] - lo[k]) / GRID) + 1);
  const at = (i, j, k) => i + nx * (j + ny * k);
  const rho = new Float32Array(nx * ny * nz);
  atoms.forEach((p, a) => {
    const s = SIGMA * (RADIUS[elements[a]] || 1.7);
    const reach = 3 * s;
    const inv = 1 / (2 * s * s);
    const g = [0, 1, 2].map((k) => [Math.max(0, Math.floor((p[k] - reach - lo[k]) / GRID)), Math.ceil((p[k] + reach - lo[k]) / GRID)]);
    for (let k = g[2][0]; k <= Math.min(nz - 1, g[2][1]); k += 1) {
      const dz = lo[2] + k * GRID - p[2];
      for (let j = g[1][0]; j <= Math.min(ny - 1, g[1][1]); j += 1) {
        const dy = lo[1] + j * GRID - p[1];
        for (let i = g[0][0]; i <= Math.min(nx - 1, g[0][1]); i += 1) {
          const dx = lo[0] + i * GRID - p[0];
          rho[at(i, j, k)] += Math.exp(-(dx * dx + dy * dy + dz * dz) * inv);
        }
      }
    }
  });
  // trilinear density and its gradient anywhere in the box
  const sample = (x, y, z) => {
    const fx = clampN((x - lo[0]) / GRID, 0, nx - 1.001);
    const fy = clampN((y - lo[1]) / GRID, 0, ny - 1.001);
    const fz = clampN((z - lo[2]) / GRID, 0, nz - 1.001);
    const i = Math.floor(fx); const j = Math.floor(fy); const k = Math.floor(fz);
    const u = fx - i; const v = fy - j; const w = fz - k;
    let s = 0;
    for (let c = 0; c < 8; c += 1) {
      const di = c & 1; const dj = (c >> 1) & 1; const dk = (c >> 2) & 1;
      s += rho[at(i + di, j + dj, k + dk)] * (di ? u : 1 - u) * (dj ? v : 1 - v) * (dk ? w : 1 - w);
    }
    return s;
  };
  const outward = (x, y, z) => { // minus the density gradient, normalised
    const e = GRID * 0.5;
    const g = [sample(x - e, y, z) - sample(x + e, y, z), sample(x, y - e, z) - sample(x, y + e, z), sample(x, y, z - e) - sample(x, y, z + e)];
    const l = Math.hypot(...g) || 1;
    return g.map((v) => v / l);
  };

  // surface nets: one vertex per cell the surface crosses, at the mean of its edge crossings
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cell = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const verts = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k += 1) {
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const val = [];
        let mask = 0;
        for (let c = 0; c < 8; c += 1) {
          const v = rho[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          val.push(v);
          if (v > ISO) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0; let sy = 0; let sz = 0; let m = 0;
        EDGES.forEach(([a, b]) => {
          if ((val[a] > ISO) === (val[b] > ISO)) return;
          const tt = (ISO - val[a]) / (val[b] - val[a]);
          sx += (a & 1) + (((b & 1) - (a & 1)) * tt);
          sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * tt);
          sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * tt);
          m += 1;
        });
        cellVert[cell(i, j, k)] = verts.length;
        verts.push([lo[0] + (i + sx / m) * GRID, lo[1] + (j + sy / m) * GRID, lo[2] + (k + sz / m) * GRID]);
      }
    }
  }
  // a quad around every grid edge the surface crosses, turned to face outwards
  const tris = [];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    [[a, b, c], [a, c, d]].forEach((tri) => {
      const [p, q, r] = tri.map((v) => verts[v]);
      const n = cross3(sub(q, p), sub(r, p));
      const o = outward((p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3, (p[2] + q[2] + r[2]) / 3);
      tris.push(n[0] * o[0] + n[1] * o[1] + n[2] * o[2] >= 0 ? tri : [tri[0], tri[2], tri[1]]);
    });
  };
  for (let k = 1; k < nz - 1; k += 1) {
    for (let j = 1; j < ny - 1; j += 1) {
      for (let i = 1; i < nx - 1; i += 1) {
        const inside = rho[at(i, j, k)] > ISO;
        if (inside !== (rho[at(i + 1, j, k)] > ISO)) quad(cellVert[cell(i, j - 1, k - 1)], cellVert[cell(i, j, k - 1)], cellVert[cell(i, j, k)], cellVert[cell(i, j - 1, k)]);
        if (inside !== (rho[at(i, j + 1, k)] > ISO)) quad(cellVert[cell(i - 1, j, k - 1)], cellVert[cell(i, j, k - 1)], cellVert[cell(i, j, k)], cellVert[cell(i - 1, j, k)]);
        if (inside !== (rho[at(i, j, k + 1)] > ISO)) quad(cellVert[cell(i - 1, j - 1, k)], cellVert[cell(i, j - 1, k)], cellVert[cell(i, j, k)], cellVert[cell(i - 1, j, k)]);
      }
    }
  }

  // ambient occlusion: how much of the sky above each vertex the molecule hides
  const DIRS = [];
  for (let s = 0; s < 64; s += 1) { // Fibonacci sphere
    const y = 1 - (2 * (s + 0.5)) / 64;
    const r = Math.sqrt(1 - y * y);
    const ph = s * Math.PI * (3 - Math.sqrt(5));
    DIRS.push([r * Math.cos(ph), y, r * Math.sin(ph)]);
  }
  const ao = verts.map((p) => {
    const n = outward(...p);
    let seen = 0;
    let total = 0;
    DIRS.forEach((d) => {
      const c = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
      if (c < 0.1) return;
      total += c;
      for (const dist of [1.6, 3, 4.5, 6.5, 9, 12]) {
        if (sample(p[0] + d[0] * dist, p[1] + d[1] * dist, p[2] + d[2] * dist) > ISO * 0.9) return;
      }
      seen += c;
    });
    return total ? seen / total : 1;
  });
  return { verts, tris, ao };
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');

(async () => {
  const [openText, closedText] = await Promise.all([load(IDS.open, process.argv[2]), load(IDS.closed, process.argv[3])]);
  const open = parse(openText);
  const closed = parse(closedText);

  // atoms present in both, in residue order
  const keys = [...open.atoms.keys()].filter((k) => closed.atoms.has(k));
  const resSeqs = [...new Set(keys.map((k) => parseInt(k, 10)))].sort((a, b) => a - b);
  const caKeys = resSeqs.map((r) => `${r}:CA`).filter((k) => open.atoms.has(k) && closed.atoms.has(k));
  if (caKeys.length !== resSeqs.length) throw new Error('a residue is missing its C-alpha');

  // superpose closed on open by C-alpha
  const caO = caKeys.map((k) => open.atoms.get(k));
  const caC = caKeys.map((k) => closed.atoms.get(k));
  const cO = centroid(caO);
  const cC = centroid(caC);
  const R = superpose(caO.map((p) => sub(p, cO)), caC.map((p) => sub(p, cC)));
  const fit = (p) => apply(R, sub(p, cC));
  const o = keys.map((k) => sub(open.atoms.get(k), cO));
  const c = keys.map((k) => fit(closed.atoms.get(k)));
  const caIndex = caKeys.map((k) => keys.indexOf(k));
  const rmsd = Math.sqrt(caIndex.reduce((s, i) => s + sub(o[i], c[i]).reduce((t, d) => t + d * d, 0), 0) / caIndex.length);

  // principal axes of the open form: longest axis -> x, shortest -> z (towards the viewer)
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  o.forEach((p) => { for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) cov[i][j] += (p[i] * p[j]) / o.length; });
  const pca = jacobi(cov);
  const order = [0, 1, 2].sort((a, b) => pca.values[b] - pca.values[a]);
  const axes = order.map((i) => pca.vectors.map((r) => r[i]));
  const det = axes[0][0] * (axes[1][1] * axes[2][2] - axes[1][2] * axes[2][1]) - axes[0][1] * (axes[1][0] * axes[2][2] - axes[1][2] * axes[2][0]) + axes[0][2] * (axes[1][0] * axes[2][1] - axes[1][1] * axes[2][0]);
  if (det < 0) axes[2] = axes[2].map((v) => -v); // keep it a rotation, not a mirror
  const toAxes = (p) => axes.map((ax) => ax[0] * p[0] + ax[1] * p[1] + ax[2] * p[2]);
  const O = o.map(toAxes);
  const C = c.map(toAxes);
  const radius = Math.max(...O.concat(C).map((p) => Math.hypot(...p)));
  const q = (p) => p.map((v) => Math.round((v / radius) * 1000));

  const resIndex = keys.map((k) => resSeqs.indexOf(parseInt(k, 10)));
  const dom0 = resSeqs.map((r) => (DOMAINS.find(([, a2, b2]) => r >= a2 && r <= b2) || ['C'])[0]);

  // the surface of the open form; the closed form moves each vertex with its nearest atoms
  const elements = keys.map((k) => k.split(':')[1][0]);
  const surf = molecularSurface(O, elements);
  const TONE = { C: 1.35, L: 2.7, N: 0.45 }; // CORE blue, LID cyan, NMP indigo (fair3d.js palette)
  const nv = surf.verts.length;
  const sOpen = new Int16Array(nv * 3);
  const sClosed = new Int16Array(nv * 3);
  const sTone = new Uint8Array(nv);
  const sAo = new Uint8Array(nv);
  surf.verts.forEach((p, v) => {
    const near = O.map((a, i) => [Math.hypot(a[0] - p[0], a[1] - p[1], a[2] - p[2]), i]).sort((x, y) => x[0] - y[0]).slice(0, 6);
    let wsum = 0;
    const d = [0, 0, 0];
    let tone = 0;
    near.forEach(([dist, i]) => {
      const w = 1 / (dist * dist + 0.5);
      wsum += w;
      for (let k = 0; k < 3; k += 1) d[k] += w * (C[i][k] - O[i][k]);
      tone += w * TONE[dom0[resIndex[i]]];
    });
    for (let k = 0; k < 3; k += 1) {
      sOpen[3 * v + k] = Math.round((p[k] / radius) * 1000);
      sClosed[3 * v + k] = Math.round(((p[k] + d[k] / wsum) / radius) * 1000);
    }
    sTone[v] = Math.round((tone / wsum / 3) * 255);
    sAo[v] = Math.round(clampN(surf.ao[v], 0, 1) * 255);
  });
  const sIndex = new Uint16Array(surf.tris.flat());
  // nearest surface vertex of every atom: where its particles land on the surface
  const atomVertex = new Uint16Array(O.map((a) => {
    let best = 0;
    let bd = Infinity;
    surf.verts.forEach((p, v) => {
      const d = (a[0] - p[0]) ** 2 + (a[1] - p[1]) ** 2 + (a[2] - p[2]) ** 2;
      if (d < bd) { bd = d; best = v; }
    });
    return best;
  }));
  const ss = resSeqs.map((r) => (open.ss.find(([, a, b]) => r >= a && r <= b) || ['C'])[0]).join('');
  const dom = resSeqs.map((r) => (DOMAINS.find(([, a, b]) => r >= a && r <= b) || ['C'])[0]).join('');
  const out = {
    about: `E. coli adenylate kinase, chain ${CHAIN}: open ${IDS.open} and closed ${IDS.closed} (RCSB PDB, CC0). Heavy atoms in both; coordinates are x1000 of unit radius (${radius.toFixed(2)} A). ss: H helix, E strand, C coil. dom: N NMP-binding, L LID, C CORE. Built by tools/build-fair-protein.js.`,
    residues: resSeqs.length,
    atoms: keys.length,
    angstrom: +(1 / radius).toFixed(5),
    open: O.flatMap(q),
    closed: C.flatMap(q),
    res: resIndex,
    ca: caIndex,
    ss,
    dom,
    // little-endian base64: Int16 x3 per vertex (x1000 unit radius), Uint16 triangles, Uint8 tone (x3/255) and occlusion
    surface: { vertices: nv, triangles: surf.tris.length, open: b64(sOpen), closed: b64(sClosed), index: b64(sIndex), tone: b64(sTone), ao: b64(sAo), atomVertex: b64(atomVertex) },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`${out.residues} residues, ${out.atoms} heavy atoms; C-alpha RMSD open/closed ${rmsd.toFixed(2)} A; radius ${radius.toFixed(1)} A`);
  console.log(`helix ${(ss.match(/H/g) || []).length}, strand ${(ss.match(/E/g) || []).length}, coil ${(ss.match(/C/g) || []).length} residues`);
  const aoMean = surf.ao.reduce((s, v) => s + v, 0) / nv;
  console.log(`surface: ${nv} vertices, ${surf.tris.length} triangles, mean ambient light ${aoMean.toFixed(2)}`);
  console.log(`${path.relative(process.cwd(), OUT)}: ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`);
})().catch((e) => { console.error(e.message); process.exit(1); });
