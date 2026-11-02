#!/usr/bin/env node
// Compare the built site (_site/) with another copy of the site, page by page.
//
//   npm run build && node tools/compare-build.js <other-site-folder>
//
// HTML pages are compared as parsed documents (elements, attributes and text;
// indentation, comments and entity spelling are ignored), so the result says
// whether visitors get the same page. data.js is compared by its data, the
// sitemap by its text, everything else byte for byte. The data.js version tag
// (?v=…) is ignored: it changes whenever the data does.
// Exit code 1 if anything differs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parse } = require('parse5');

const built = path.join(__dirname, '..', '_site');
const other = process.argv[2];
if (!other || !fs.existsSync(other)) {
  console.error('Usage: node tools/compare-build.js <other-site-folder>');
  process.exit(2);
}

// files in the repository that are not part of the website
const NOT_SITE = /^(README\.md|CONTRIBUTING\.md|LICENSE|vercel\.json|package(-lock)?\.json|eleventy\.config\.js|\.gitignore|\.eleventyignore|docs\/|tools\/|src\/|api\/|node_modules\/|_site\/)/;

const list = (root) => {
  const out = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else out.push(path.relative(root, p).split(path.sep).join('/'));
    });
  }(root));
  return out.sort();
};

const ignoreVersion = (s) => s.replace(/(data\.js)\?v=[^"'\s]*/g, '$1?v=*');

function htmlLines(html) {
  const out = [];
  (function walk(node, depth) {
    (node.childNodes || []).forEach((c) => {
      const pad = '  '.repeat(depth);
      if (c.nodeName === '#comment') return;
      if (c.nodeName === '#documentType') { out.push('<!DOCTYPE html>'); return; }
      if (c.nodeName === '#text') {
        const t = c.value.replace(/\s+/g, ' ').trim();
        if (t) out.push(`${pad}${t}`);
        return;
      }
      const attrs = (c.attrs || []).map((a) => `${a.name}="${ignoreVersion(a.value.replace(/\s+/g, ' ').trim())}"`).sort();
      out.push(`${pad}<${c.tagName}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
      walk(c.content || c, depth + 1);
    });
  }(parse(html), 0));
  return out;
}

// smallest line diff (LCS), as "- old" / "+ new" lines with a little context
function diffLines(a, b, max = 40) {
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const ops = [];
  let i = 0; let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push(['  ', a[i]]); i += 1; j += 1; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push(['+ ', b[j]]); j += 1; }
    else { ops.push(['- ', a[i]]); i += 1; }
  }
  const keep = new Set();
  ops.forEach((o, k) => { if (o[0] !== '  ') for (let d = -2; d <= 2; d += 1) keep.add(k + d); });
  const lines = [];
  let last = -1;
  ops.forEach((o, k) => {
    if (!keep.has(k)) return;
    if (last >= 0 && k > last + 1) lines.push('    …');
    lines.push(`    ${o[0]}${o[1].length > 160 ? o[1].slice(0, 157) + '…' : o[1]}`);
    last = k;
  });
  return lines.length > max ? lines.slice(0, max).concat(`    … (${lines.length - max} more lines)`) : lines;
}

const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canonical(v[k]); return o; }, {}) : v);
const evalData = (code) => { const sandbox = { window: {} }; vm.runInNewContext(code, sandbox); return sandbox.window.siteData; };

const ours = new Set(list(built));
const theirs = list(other).filter((f) => !NOT_SITE.test(f));
let differences = 0;
let same = 0;

theirs.forEach((f) => {
  if (!ours.has(f)) { differences += 1; console.log(`MISSING  ${f}`); return; }
  const a = fs.readFileSync(path.join(other, f));
  const b = fs.readFileSync(path.join(built, f));
  if (a.equals(b)) { same += 1; return; }
  let lines = null;
  if (f.endsWith('.html')) {
    const x = htmlLines(a.toString('utf8')); const y = htmlLines(b.toString('utf8'));
    if (x.join('\n') !== y.join('\n')) lines = diffLines(x, y);
  } else if (f === 'assets/js/data.js') {
    const x = JSON.stringify(canonical(evalData(a.toString('utf8'))), null, 1).split('\n');
    const y = JSON.stringify(canonical(evalData(b.toString('utf8'))), null, 1).split('\n');
    if (x.join('\n') !== y.join('\n')) lines = diffLines(x, y);
  } else if (f.endsWith('.xml')) {
    const x = a.toString('utf8').replace(/\s+/g, ' ').trim(); const y = b.toString('utf8').replace(/\s+/g, ' ').trim();
    if (x !== y) lines = diffLines(x.split(/(?=<url>)/), y.split(/(?=<url>)/));
  } else {
    lines = ['    (binary or code file: bytes differ)'];
  }
  if (lines) { differences += 1; console.log(`DIFFERS  ${f}`); lines.forEach((l) => console.log(l)); } else same += 1;
});
const theirSet = new Set(theirs);
const extra = [...ours].filter((f) => !theirSet.has(f));
if (extra.length) console.log(`NEW      ${extra.join(', ')}`);
console.log(`\n${same} files the same, ${differences} different${extra.length ? `, ${extra.length} new` : ''}.`);
process.exit(differences ? 1 : 0);
