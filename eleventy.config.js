// Eleventy builds the site from src/ into _site/ (what Vercel serves).
// Content lives in src/_data/*.json and src/news/*.md; editors change it in
// the Decap CMS at /admin. Templates are in src/ and src/_includes/.
const fs = require('fs');
const path = require('path');
const markdownIt = require('markdown-it');
const yaml = require('js-yaml');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ESC[c]);

// Width/height of a PNG, JPEG, GIF or WebP, so <img> tags keep their size
// attributes when editors upload new images. null if unknown.
function imageSize(file) {
  let b;
  try { b = fs.readFileSync(file); } catch (err) { return null; }
  if (b.toString('ascii', 1, 4) === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { width: 1 + (n & 0x3fff), height: 1 + ((n >> 14) & 0x3fff) }; }
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Links between pages are relative, as in the hand-written site: from the
// home page, from a page in /pages/, or root-absolute (404, served at any depth).
const PREFIX = {
  home: { home: 'index.html', pages: 'pages/', assets: 'assets/' },
  pages: { home: '../index.html', pages: '', assets: '../assets/' },
  abs: { home: '/', pages: '/pages/', assets: '/assets/' }
};

module.exports = function (eleventyConfig) {
  // Static files, copied unchanged
  eleventyConfig.addPassthroughCopy({ assets: 'assets' });
  eleventyConfig.addPassthroughCopy({ 'src/admin/preview.js': 'admin/preview.js', 'src/admin/config.yml': 'admin/config.yml' });
  ['maintenance.html', 'robots.txt', 'site.webmanifest', 'favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png',
    'apple-touch-icon.png', 'android-chrome-192x192.png', 'android-chrome-512x512.png']
    .forEach((f) => eleventyConfig.addPassthroughCopy(f));

  // Markdown (news posts and short text fields): links to other sites open in
  // a new tab; a line ending in "\" is a line break.
  const md = markdownIt({ html: true });
  const renderLink = md.renderer.rules.link_open || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    if (/^https?:\/\//.test(tokens[idx].attrGet('href') || '')) {
      tokens[idx].attrSet('target', '_blank');
      tokens[idx].attrSet('rel', 'noopener');
    }
    return renderLink(tokens, idx, options, env, self);
  };
  md.renderer.rules.hardbreak = () => '<br>';
  eleventyConfig.setLibrary('md', md);

  /* ── Filters ── */
  // **words** → highlighted (gradient) words; a new line → <br>
  eleventyConfig.addFilter('grad', (s) => escape(s).replace(/\*\*(.+?)\*\*/g, '<span class="grad">$1</span>').replace(/\n/g, '<br>'));
  eleventyConfig.addFilter('hl', (s) => escape(s).replace(/\*\*(.+?)\*\*/g, '<strong class="grad">$1</strong>').replace(/\n/g, '<br>'));
  // button text: **words** → bold
  eleventyConfig.addFilter('btn', (s) => escape(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
  // eyebrow labels (shown in capitals): " | " → separator, and a mixed-case
  // word such as "MDDBa" keeps its case
  eleventyConfig.addFilter('label', (s) => escape(s)
    .replace(/ \| /g, ' <span class="sep">|</span> ')
    .replace(/\b([A-Z]{2,}[a-z]+)\b/g, '<span style="text-transform:none">$1</span>'));
  eleventyConfig.addFilter('mdInline', (s) => md.renderInline(String(s || '')));

  // "/assets/…" or "/pages/…" from the content → the relative link this page uses
  eleventyConfig.addFilter('link', (url, mode) => {
    const p = PREFIX[mode] || PREFIX.abs;
    const u = String(url || '');
    if (u === '/' || u === '/index.html') return p.home;
    if (u.startsWith('/#')) return p.home + u.slice(1);
    if (u.startsWith('/assets/')) return p.assets + u.slice(8);
    if (u.startsWith('/pages/')) return p.pages + u.slice(7);
    return u;
  });
  eleventyConfig.addFilter('external', (u) => /^https?:\/\//.test(String(u || '')));
  eleventyConfig.addFilter('imgsize', (url) => (url ? imageSize(path.join(__dirname, String(url).replace(/^\//, ''))) : null));
  eleventyConfig.addFilter('uri', (s) => encodeURIComponent(String(s || '')));
  eleventyConfig.addFilter('json', (v) => JSON.stringify(v));
  eleventyConfig.addFilter('jsonScript', (v) => JSON.stringify(v).replace(/</g, '\\u003c'));

  eleventyConfig.addFilter('without', (posts, url) => (posts || []).filter((p) => p.url !== url));
  eleventyConfig.addFilter('head', (list, n) => (list || []).slice(0, n));
  // events: "YYYY-MM-DD" strings compare in date order
  eleventyConfig.addFilter('upcoming', (list, today) => (list || []).filter((e) => String(e.date) >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date))));
  eleventyConfig.addFilter('past', (list, today) => (list || []).filter((e) => String(e.date) < today)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))));
  eleventyConfig.addFilter('visible', (list) => (list || []).filter((x) => !x.hidden));

  // Dates are stored as YYYY-MM-DD and shown in US style (UTC, so a date never shifts)
  const asDate = (d) => (d instanceof Date ? d : new Date(String(d)));
  const fmt = (d, o) => asDate(d).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
  eleventyConfig.addFilter('dateLong', (d) => fmt(d, { year: 'numeric', month: 'long', day: 'numeric' }));
  eleventyConfig.addFilter('dateIso', (d) => asDate(d).toISOString().slice(0, 10));
  eleventyConfig.addFilter('day', (d) => String(asDate(d).getUTCDate()));
  eleventyConfig.addFilter('monthYear', (d) => fmt(d, { year: 'numeric', month: 'short' }));

  // The editor's settings (src/admin/config.yml), built into /admin/index.html
  eleventyConfig.addGlobalData('cmsConfig', () => yaml.load(fs.readFileSync(path.join(__dirname, 'src/admin/config.yml'), 'utf8')));
  eleventyConfig.addWatchTarget('src/admin/config.yml');

  // News posts, newest first
  eleventyConfig.addCollection('posts', (api) => api.getFilteredByGlob('src/news/*.md')
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.date - a.date || a.inputPath.localeCompare(b.inputPath)));

  // The contact address is assembled in site.js (kept away from scrapers):
  // write the one from Settings into the built copy. (The dev server, npm
  // start, serves the original file instead: same address unless it changed.)
  eleventyConfig.on('eleventy.after', ({ dir }) => {
    const file = path.join(dir.output, 'assets/js/site.js');
    if (!fs.existsSync(file)) return;
    const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/_data/settings.json'), 'utf8'));
    const js = fs.readFileSync(file, 'utf8');
    const [user, domain] = String(settings.email).split('@');
    const line = /const email = \[[^\]]*\]\.join\('@'\);/;
    if (!line.test(js) || !user || !domain) throw new Error('site.js: contact email line not found, or Settings email is invalid');
    fs.writeFileSync(file, js.replace(line, `const email = [${JSON.stringify(user).replace(/"/g, "'")}, ${JSON.stringify(domain).replace(/"/g, "'")}].join('@');`));
  });

  return {
    dir: { input: 'src', includes: '_includes', data: '_data', output: '_site' },
    templateFormats: ['njk', 'md'],
    markdownTemplateEngine: false,
    htmlTemplateEngine: 'njk'
  };
};
