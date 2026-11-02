#!/usr/bin/env node
// Checks that the editor (src/admin/config.yml) knows every field of the
// content files. Decap only writes the fields it knows about, so a key missing
// from config.yml would be deleted the next time someone saves that page.
//   node tools/check-cms-config.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const config = yaml.load(fs.readFileSync(path.join(root, 'src/admin/config.yml'), 'utf8'));
const problems = [];

function check(value, fields, where) {
  if (!fields) return; // a list of plain values, or a hidden/markdown field
  const known = new Map(fields.map((f) => [f.name, f]));
  Object.keys(value || {}).forEach((key) => {
    const f = known.get(key);
    if (!f) { problems.push(`${where}: "${key}" is not in config.yml`); return; }
    const v = value[key];
    if (f.widget === 'object') check(v, f.fields, `${where}.${key}`);
    if (f.widget === 'list' && Array.isArray(v)) v.forEach((item, i) => { if (item && typeof item === 'object') check(item, f.fields, `${where}.${key}[${i}]`); });
  });
}

config.collections.forEach((c) => {
  (c.files || []).forEach((f) => check(JSON.parse(fs.readFileSync(path.join(root, f.file), 'utf8')), f.fields, f.file));
  if (c.folder) {
    fs.readdirSync(path.join(root, c.folder)).filter((n) => n.endsWith(`.${c.extension || 'md'}`)).forEach((n) => {
      const file = path.join(c.folder, n);
      const text = fs.readFileSync(path.join(root, file), 'utf8');
      const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const data = front ? yaml.load(front[1]) : {};
      check(data, c.fields, file);
    });
  }
});

if (problems.length) { problems.forEach((p) => console.log(p)); process.exit(1); }
console.log('config.yml covers every field of the content files.');
