// site.js — shared behaviour for every page: nav state, menu dialog and site
// search, email links, scroll reveal, footer year and the news filter.
(() => {
  const html = document.documentElement;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Email links (address assembled at runtime to keep it away from scrapers) */
  const email = ['info', 'mddba.com'].join('@');
  document.querySelectorAll('[data-email]').forEach((a) => {
    a.href = 'mailto:' + email;
  });

  /* Footer year */
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  /* Nav: frosted background after scrolling */
  const nav = document.querySelector('.nav');
  if (nav) {
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      nav.classList.toggle('is-scrolled', window.scrollY > 80);
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();

    /* Nav: light/dark text depending on the section underneath it.
       A thin band near the top of the viewport is observed; when several
       themed sections overlap it (e.g. About sliding over the sticky hero)
       the one that comes last in the document wins, as it paints on top. */
    const themed = Array.from(document.querySelectorAll('[data-theme]:not(dialog)'));
    const inBand = new Set();
    const applyTheme = () => {
      let winner = null;
      themed.forEach((el) => { if (inBand.has(el)) winner = el; });
      nav.classList.toggle('is-dark', !!winner && winner.dataset.theme === 'dark');
    };
    const bandObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? inBand.add(e.target) : inBand.delete(e.target)));
      applyTheme();
    }, { rootMargin: '-4% 0px -95% 0px' });
    themed.forEach((el) => bandObserver.observe(el));
  }

  /* Menu (full-screen <dialog>) */
  const menu = document.getElementById('menu');
  const openBtn = document.querySelector('[data-menu-open]');
  if (menu && openBtn && typeof menu.showModal === 'function') {
    const closeBtn = menu.querySelector('[data-menu-close]');
    const search = menu.querySelector('[data-search]');

    const openMenu = (focusEl) => {
      if (!menu.open) {
        menu.showModal();
        openBtn.setAttribute('aria-expanded', 'true');
      }
      const target = focusEl || closeBtn;
      if (target) target.focus();
    };
    const closeMenu = (after) => {
      if (!menu.open) { if (after) after(); return; }
      const finish = () => {
        menu.classList.remove('is-closing');
        menu.close();
        if (after) after();
      };
      if (reduceMotion()) { finish(); return; }
      menu.classList.add('is-closing');
      setTimeout(finish, 220);
    };

    openBtn.addEventListener('click', () => openMenu());
    menu.addEventListener('close', () => {
      openBtn.setAttribute('aria-expanded', 'false');
      openBtn.focus({ preventScroll: true });
      if (search) search.dispatchEvent(new Event('reset'));
    });
    if (closeBtn) closeBtn.addEventListener('click', () => closeMenu());
    menu.addEventListener('cancel', (e) => { e.preventDefault(); closeMenu(); }); // Esc

    // Same-page anchors (menu links and search results): close first, which
    // releases the scroll lock, then scroll.
    const normalise = (p) => p.replace(/index(\.html)?$/, '').replace(/\.html$/, '').replace(/\/$/, '');
    menu.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const url = new URL(a.href, window.location.href);
      if (url.hash && normalise(url.pathname) === normalise(window.location.pathname)) {
        const target = document.querySelector(url.hash);
        if (!target) return;
        e.preventDefault();
        closeMenu(() => {
          target.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
          history.replaceState(null, '', url.hash);
        });
      }
    });

    if (search) initSearch(search, openMenu);
  }

  /* Reveal on scroll */
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && revealEls.length) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          revealObserver.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* News filter (news page) */
  document.querySelectorAll('[data-filter-group]').forEach((group) => {
    const list = document.querySelector(group.dataset.filterTarget);
    const status = document.querySelector(group.dataset.filterStatus);
    if (!list) return;
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      const filter = btn.dataset.filter;
      group.querySelectorAll('button[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      let shown = 0;
      list.querySelectorAll('[data-tags]').forEach((card) => {
        const match = filter === 'all' || card.dataset.tags.split(' ').includes(filter);
        card.hidden = !match;
        if (match) shown += 1;
      });
      if (status) status.textContent = `Showing ${shown} ${shown === 1 ? 'story' : 'stories'}`;
    });
  });

  /* Site search (in the menu)
     The index is built in the browser the first time the search is used: the
     pages linked from the menu, and the pages they link to (news articles),
     are fetched and their main content is indexed. Home is split into its
     sections (#about, #goals, ...). Nothing to regenerate when content
     changes. */
  function initSearch(form, openMenu) {
    const input = form.querySelector('.search__input');
    const clear = form.querySelector('.search__clear');
    const status = form.querySelector('.search__status');
    const list = form.querySelector('.search__results');
    const menuEl = form.closest('dialog');
    const MAX_RESULTS = 6;
    const MAX_PAGES = 60;

    const fold = (str) => {
      // lower case + strip accents, one output char per input char so match
      // positions can be used to highlight the original text
      let out = '';
      for (let i = 0; i < str.length; i += 1) {
        const ch = str[i];
        const f = ch.normalize('NFD')[0].toLowerCase();
        out += f.length === 1 ? f : ch;
      }
      return out;
    };
    const isWordChar = (ch) => /[\p{L}\p{N}]/u.test(ch);
    const startsWord = (hay, i) => i === 0 || !isWordChar(hay[i - 1]);

    /* Text extraction */
    const INLINE = new Set(['A', 'ABBR', 'B', 'CITE', 'CODE', 'EM', 'I', 'MARK', 'Q', 'SMALL', 'STRONG', 'SUB', 'SUP']);
    const textOf = (root) => {
      let out = '';
      const walk = (node) => {
        node.childNodes.forEach((c) => {
          if (c.nodeType === 3) out += c.data;
          else if (c.nodeType === 1) {
            const gap = INLINE.has(c.tagName) ? '' : ' ';
            out += gap; walk(c); out += gap;
          }
        });
      };
      walk(root);
      return out.replace(/\s+/g, ' ').trim();
    };
    const NOISE = 'script, style, svg, template, [aria-hidden="true"], .news-card, .text-btn, .read-more, .share, .filters, .filter-status, .fes';

    const record = (fields) => ({
      ...fields,
      fTitle: fold(fields.title),
      fDesc: fold(fields.desc || ''),
      fText: fold(fields.text || ''),
    });

    const extract = (doc, url) => {
      const main = doc.querySelector('main') || doc.body;
      main.querySelectorAll(NOISE).forEach((n) => n.remove());
      // Headings, labels and tags are matched (title/desc) but kept out of the
      // body text, so snippets don't just repeat the title.
      const take = (scope, sel) => Array.from(scope.querySelectorAll(sel)).map((n) => {
        const t = textOf(n);
        n.remove();
        return t;
      }).join(' ');
      const rawTitle = (doc.title || '').split(' | ');
      const isHome = rawTitle[0] === 'MDDB America';
      const pageTitle = isHome ? 'Home' : rawTitle[0];
      const metaDesc = doc.querySelector('meta[name="description"]');
      const time = doc.querySelector('.article-meta time');
      const date = time ? time.textContent.trim() : '';
      const out = [];
      main.querySelectorAll('section[id]').forEach((sec) => {
        const h = sec.querySelector('h2, h3');
        const label = sec.querySelector('.label');
        const title = h ? textOf(h) : pageTitle;
        const kind = label && label !== h
          ? textOf(label).replace(/\s*\|\s*/g, ' · ')
          : sec.id.charAt(0).toUpperCase() + sec.id.slice(1);
        if (h) h.remove();
        const desc = label && label !== h ? take(sec, '.label') : '';
        out.push(record({ url: `${url.split('#')[0]}#${sec.id}`, title, type: `${pageTitle} · ${kind}`, desc, text: textOf(sec) }));
        sec.remove();
      });
      const extra = take(main, 'h1, .chips, .article-meta, .page-hero .label');
      out.unshift(record({
        url,
        title: pageTitle,
        type: date ? `News · ${date}` : 'Page',
        desc: `${metaDesc ? metaDesc.content : ''} ${extra}`.trim(),
        text: textOf(main),
      }));
      return out;
    };

    /* Crawl */
    const scriptSrc = (document.querySelector('script[src$="site.js"]') || {}).src || window.location.href;
    const root = new URL('../../', scriptSrc);
    const keyOf = (u) => u.pathname.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/\/$/, '') || '/';
    let indexPromise = null;
    const buildIndex = async () => {
      const seen = new Set();
      const queue = [];
      const add = (href, base) => {
        let u;
        try { u = new URL(href, base); } catch (err) { return; }
        if (u.origin !== window.location.origin || !u.pathname.startsWith(root.pathname)) return;
        if (/\.[a-z0-9]+$/i.test(u.pathname) && !/\.html$/i.test(u.pathname)) return; // files, not pages
        if (/\/(404|maintenance)(\.html)?$/.test(u.pathname)) return;
        u.hash = ''; u.search = '';
        const key = keyOf(u);
        if (seen.has(key)) return;
        seen.add(key);
        queue.push(u.href);
      };
      menuEl.querySelectorAll('.menu__list a[href]').forEach((a) => add(a.getAttribute('href'), window.location.href));
      const records = [];
      let fetched = 0;
      while (queue.length && fetched < MAX_PAGES) {
        const batch = queue.splice(0, 6);
        fetched += batch.length;
        // eslint-disable-next-line no-await-in-loop
        const pages = await Promise.all(batch.map((href) => fetch(href, { credentials: 'same-origin' })
          .then((r) => (r.ok ? r.text().then((html) => ({ html, url: r.url || href })) : null))
          .catch(() => null)));
        pages.forEach((p) => {
          if (!p) return;
          const doc = new DOMParser().parseFromString(p.html, 'text/html');
          doc.querySelectorAll('main a[href]').forEach((a) => add(a.getAttribute('href'), p.url));
          records.push(...extract(doc, p.url));
        });
      }
      if (!records.length) {
        // Offline / file:// — fall back to the menu entries themselves.
        menuEl.querySelectorAll('.menu__list a[href]').forEach((a) => {
          records.push(record({ url: a.href, title: a.querySelector('.menu__text').textContent, type: 'Page' }));
        });
      }
      return records;
    };
    const ensureIndex = () => {
      if (!indexPromise) indexPromise = buildIndex();
      return indexPromise;
    };

    /* Ranking */
    const score = (r, terms, phrase) => {
      let total = 0;
      for (let t = 0; t < terms.length; t += 1) {
        const term = terms[t];
        let s = 0;
        const it = r.fTitle.indexOf(term);
        if (it >= 0) s += startsWord(r.fTitle, it) ? 14 : 7;
        const id = r.fDesc.indexOf(term);
        if (id >= 0) s += startsWord(r.fDesc, id) ? 5 : 2;
        let i = r.fText.indexOf(term);
        let hits = 0;
        while (i >= 0 && hits < 4) {
          hits += startsWord(r.fText, i) ? 2 : 1;
          i = r.fText.indexOf(term, i + term.length);
        }
        s += hits;
        if (!s) return 0; // every word has to match somewhere
        total += s;
      }
      if (terms.length > 1 && (r.fTitle.includes(phrase) || r.fText.includes(phrase))) total += 8;
      return total;
    };

    /* Rendering */
    const highlight = (text, terms) => {
      const f = fold(text);
      const ranges = [];
      terms.forEach((term) => {
        for (let i = f.indexOf(term); i >= 0; i = f.indexOf(term, i + term.length)) ranges.push([i, i + term.length]);
      });
      ranges.sort((a, b) => a[0] - b[0]);
      const frag = document.createDocumentFragment();
      let pos = 0;
      ranges.forEach(([a, b]) => {
        if (a < pos) { if (b > pos) { frag.lastChild.textContent += text.slice(pos, b); pos = b; } return; }
        if (a > pos) frag.appendChild(document.createTextNode(text.slice(pos, a)));
        const m = document.createElement('mark');
        m.textContent = text.slice(a, b);
        frag.appendChild(m);
        pos = b;
      });
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      return frag;
    };
    const snippet = (r, terms) => {
      const src = terms.some((t) => r.fText.includes(t)) ? r.text : (r.desc || r.text || '');
      const f = fold(src);
      let at = -1;
      terms.forEach((t) => { const i = f.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
      if (at < 0) at = 0;
      let a = Math.max(0, at - 60);
      if (a > 0) a = src.indexOf(' ', a) + 1 || a;
      let b = Math.min(src.length, a + 190);
      if (b < src.length) b = src.lastIndexOf(' ', b) > a ? src.lastIndexOf(' ', b) : b;
      return `${a > 0 ? '… ' : ''}${src.slice(a, b)}${b < src.length ? ' …' : ''}`;
    };
    const el = (tag, cls, child) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (child != null) n.append(child);
      return n;
    };

    let token = 0;
    const run = async () => {
      const raw = input.value.trim();
      const mine = ++token;
      form.classList.toggle('has-query', !!input.value);
      menuEl.classList.toggle('is-searching', !!raw);
      clear.hidden = !input.value;
      if (raw.length < 2) {
        list.replaceChildren();
        list.classList.remove('is-clipped');
        status.textContent = '';
        return;
      }
      status.textContent = 'Searching…';
      const records = await ensureIndex();
      if (mine !== token) return; // a newer query is already running
      const folded = fold(raw);
      const terms = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      const phrase = terms.join(' ');
      const hits = records
        .map((r) => ({ r, s: score(r, terms, phrase) }))
        .filter((h) => h.s > 0)
        .sort((x, y) => y.s - x.s)
        .slice(0, MAX_RESULTS);
      list.replaceChildren(...hits.map(({ r }, i) => {
        const li = el('li');
        li.style.setProperty('--i', i);
        const a = el('a', 'result');
        a.href = r.url;
        a.append(
          el('span', 'result__type label-s', r.type),
          el('span', 'result__title', highlight(r.title, terms)),
          el('span', 'result__snippet', highlight(snippet(r, terms), terms)),
        );
        li.append(a);
        return li;
      }));
      status.textContent = hits.length
        ? `${hits.length} ${hits.length === 1 ? 'result' : 'results'}`
        : `No results for “${raw}”`;
      list.scrollTop = 0;
      fadeEdge();
    };
    // Fade the bottom edge while there are more results below.
    const fadeEdge = () => {
      list.classList.toggle('is-clipped', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
    };
    list.addEventListener('scroll', fadeEdge, { passive: true });

    let debounce = 0;
    input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(run, 90); });
    input.addEventListener('focus', ensureIndex, { once: true });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const first = list.querySelector('a');
      if (first) first.click();
    });
    form.addEventListener('reset', () => { input.value = ''; run(); });
    clear.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
    form.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      input.value = b.dataset.q;
      run();
      input.focus();
    }));

    // Keyboard: arrows move between the field and the results; Esc clears the
    // field first and only closes the menu when it is already empty.
    form.addEventListener('keydown', (e) => {
      const links = Array.from(list.querySelectorAll('a'));
      const i = links.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && links.length && (e.target === input || i >= 0)) {
        e.preventDefault();
        links[Math.min(links.length - 1, i + 1)].focus();
      } else if (e.key === 'ArrowUp' && i >= 0) {
        e.preventDefault();
        (i === 0 ? input : links[i - 1]).focus();
      } else if (e.key === 'Escape' && e.target === input && input.value) {
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        run();
      }
    });

    // "/" or Ctrl/Cmd+K anywhere opens the menu with the search focused.
    document.addEventListener('keydown', (e) => {
      const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
      const slash = e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey;
      const cmdK = (e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey);
      if (!slash && !cmdK) return;
      e.preventDefault();
      openMenu(input);
      ensureIndex();
    });
  }

  html.classList.add('js-ready');
})();
