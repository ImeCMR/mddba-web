// Page titles, descriptions, URLs and share images, worked out for every page
// from its content (src/_data/<page>.json, or a news post's front matter).
module.exports = {
  metaTitle: (d) => {
    const site = d.settings.siteName;
    if (d.isPost) return `${d.title} | News | ${site}`;
    if (d.dataKey === 'home') return d.home.meta.title;
    if (d.dataKey) return `${d[d.dataKey].meta.title} | ${site}`;
    return `${d.pageTitle} | ${site}`;
  },
  metaDescription: (d) => {
    if (d.isPost) return d.description || d.excerpt;
    if (d.dataKey) return d[d.dataKey].meta.description;
    return d.pageDescription;
  },
  // "/pages/community" (clean URL, as served by Vercel)
  pageUrl: (d) => d.urlPath || String(d.page.url || '').replace(/index\.html$/, '').replace(/\.html$/, ''),
  shareImage: (d) => (d.isPost && d.image) || d.settings.shareImage
};
