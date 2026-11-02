// Live preview for news posts in the editor, using the site's own styles.
/* global CMS, createClass, h */
CMS.registerPreviewStyle('https://fonts.googleapis.com/css2?family=Geist:wght@300..700&display=swap');
CMS.registerPreviewStyle('/assets/css/tokens.css');
CMS.registerPreviewStyle('/assets/css/main.css');
CMS.registerPreviewStyle('/assets/css/pages.css');

const longDate = (d) => {
  const t = d ? new Date(String(d).slice(0, 10)) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }) : '';
};

const NewsPreview = createClass({
  render() {
    const { entry, widgetFor, getAsset } = this.props;
    const get = (k) => entry.getIn(['data', k]);
    const topics = (get('topics') && get('topics').toJS ? get('topics').toJS() : get('topics')) || [];
    const image = get('image');
    return h('main', { id: 'main' },
      h('header', { className: 'article-hero', 'data-theme': 'dark' },
        h('div', { className: 'wrap wrap--narrow' },
          h('div', { className: 'chips' }, topics.map((t) => h('span', { className: 'chip', key: t }, t))),
          h('h1', { className: 'heading-l' }, get('title')),
          h('p', { className: 'article-meta label-s' }, longDate(get('date'))))),
      h('div', { 'data-theme': 'light' },
        h('div', { className: 'wrap wrap--narrow' },
          image ? h('figure', { className: 'article-figure' }, h('img', { src: getAsset(image).toString(), alt: get('imageAlt') || get('title') })) : null,
          h('div', { className: 'prose' },
            get('lede') ? h('p', { className: 'lede' }, get('lede')) : null,
            widgetFor('body')))));
  }
});
CMS.registerPreviewTemplate('news', NewsPreview);
