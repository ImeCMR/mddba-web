// Every news post: article layout, and the URL /pages/news-<file name>.html
// (fixed when the post is created, so shared links keep working).
module.exports = {
  layout: 'layouts/article.njk',
  isPost: true,
  linkMode: 'pages',
  nav: 'news',
  permalink: (data) => (data.draft ? false : `pages/news-${data.page.fileSlug}.html`)
};
