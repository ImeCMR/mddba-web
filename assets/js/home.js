// home.js — home page only: hero video, counters, scroll scenes (GSAP
// ScrollTrigger reports progress; CSS position:sticky does the pinning) and
// the nodes globe. The FAIR scene's 3D designs (fair3d.js) follow its
// "scene:progress" events.
(() => {
  const html = document.documentElement;
  const data = window.siteData || {};
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ── Hero video: play only when motion is allowed, pause once covered ── */
  const video = document.querySelector('.hero__video');
  const about = document.getElementById('about');
  let covered = false;
  let blocked = false; // autoplay refused (iOS Low Power Mode, in-app browsers)
  const playVideo = () => {
    if (!video || reduceMQ.matches || covered) return;
    video.preload = 'auto';
    const p = video.play();
    if (p && p.catch) p.catch((e) => { if (e && e.name === 'NotAllowedError') blocked = true; });
  };
  const pauseVideo = () => { if (video && !video.paused) video.pause(); };
  if (video && about) {
    let ticking = false;
    const check = () => {
      ticking = false;
      const isCovered = about.getBoundingClientRect().top <= 0;
      if (isCovered !== covered) {
        covered = isCovered;
        covered ? pauseVideo() : playVideo();
      }
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(check); }
    }, { passive: true });
    check();
    playVideo();
    reduceMQ.addEventListener('change', () => (reduceMQ.matches ? pauseVideo() : playVideo()));

    // When autoplay is refused, a tap anywhere counts as a user gesture: start
    // the video then (pausing again at once if the hero is already covered,
    // which still lets it play later without another tap).
    const GESTURES = ['touchend', 'click', 'keydown'];
    const unlock = () => {
      if (!blocked || reduceMQ.matches) return;
      blocked = false;
      video.preload = 'auto';
      const p = video.play();
      if (!p || !p.then) return;
      p.then(() => {
        GESTURES.forEach((type) => document.removeEventListener(type, unlock));
        if (covered) pauseVideo();
      }).catch((e) => { if (e && e.name === 'NotAllowedError') blocked = true; });
    };
    GESTURES.forEach((type) => document.addEventListener(type, unlock, { passive: true }));
    // Phones pause the video in background tabs; resume when the page is shown again
    document.addEventListener('visibilitychange', () => { if (!document.hidden) playVideo(); });
    window.addEventListener('pageshow', playVideo);
  }

  /* ── Counters (values from data.js; HTML holds the no-JS fallback) ── */
  const stats = document.querySelector('.stats');
  if (stats) {
    const values = {
      nodes: (data.nodes || []).length,
      partners: (data.partners || []).length,
      publications: (data.publications || []).length,
      events: (data.events || []).length
    };
    const nums = Array.from(stats.querySelectorAll('[data-stat]'));
    nums.forEach((el) => {
      const v = values[el.dataset.stat];
      if (!v && v !== 0) return;
      el.dataset.target = v;
      const label = el.closest('.stat').querySelector('.stat__label');
      if (label && label.dataset.one && label.dataset.other) {
        label.textContent = v === 1 ? label.dataset.one : label.dataset.other;
      }
    });
    const run = () => nums.forEach((el) => {
      const target = Number(el.dataset.target || el.textContent) || 0;
      if (reduceMQ.matches || target === 0) { el.textContent = target; return; }
      const start = performance.now();
      const dur = 1400;
      const tick = (now) => {
        const k = Math.min(1, (now - start) / dur);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (reduceMQ.matches) {
      run();
    } else {
      nums.forEach((el) => { el.textContent = '0'; });
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
      }, { threshold: 0.4 });
      io.observe(stats);
    }
  }

  /* ── Globe (lazy: created when the nodes section gets close) ── */
  const canvas = document.querySelector('.globe');
  const nodesScene = document.querySelector('.scene--nodes');
  let globe = null;
  let pending = null; // progress received before the globe exists
  const globeReady = canvas && window.MDDBGlobe && window.d3 && window.d3.geoOrthographic && window.topojson;
  if (globeReady) {
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      globe = window.MDDBGlobe(canvas, {
        nodes: data.nodes || [],
        sites: data.sites || [],
        landUrl: canvas.dataset.land
      });
      if (pending !== null) globe.setProgress(pending);
    }, { rootMargin: '600px 0px' });
    io.observe(canvas);
  }
  if (nodesScene) {
    nodesScene.addEventListener('scene:progress', (e) => {
      if (globe) globe.setProgress(e.detail.progress);
      else pending = e.detail.progress;
    });
    // Stacked layout (reduced motion): hovering or focusing a node
    // turns the globe towards it.
    nodesScene.querySelectorAll('.node').forEach((node, i) => {
      const focusNode = () => {
        if (html.classList.contains('js-scenes') || !globe) return;
        globe.flyTo(i);
      };
      node.addEventListener('mouseenter', focusNode);
      node.addEventListener('focusin', focusNode);
    });
  }

  /* Step buttons (FAIR bars, node names): jump to that step of the scene */
  document.querySelectorAll('[data-step-go]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scene = btn.closest('.scene');
      const k = Number(btn.dataset.stepGo);
      if (!scene) return;
      if (html.classList.contains('js-scenes')) {
        const n = scene.querySelectorAll('.step').length;
        const top = scene.getBoundingClientRect().top + window.scrollY;
        const range = scene.offsetHeight - window.innerHeight;
        window.scrollTo({ top: top + (range * (k + 0.5)) / n, behavior: 'smooth' });
      } else if (globe && scene === nodesScene) {
        globe.flyTo(k);
      }
    });
  });

  /* ── Scroll scenes (any screen, motion allowed; home.css lays them out
     side by side on wide screens and stacked on phones / portrait) ── */
  if (!window.gsap || !window.ScrollTrigger) return;
  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    html.classList.add('js-scenes');

    document.querySelectorAll('.scene').forEach((scene) => {
      const steps = Array.from(scene.querySelectorAll('.step'));
      const bars = Array.from(scene.querySelectorAll('.scene__bar'));
      const n = steps.length;
      let current = -1;
      const update = (p) => {
        const i = Math.min(n - 1, Math.floor(p * n));
        if (i !== current) {
          current = i;
          scene.dataset.step = String(i);
          steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
        }
        bars.forEach((b, k) => b.style.setProperty('--p', gsap.utils.clamp(0, 1, p * n - k).toFixed(4)));
        scene.dispatchEvent(new CustomEvent('scene:progress', { detail: { progress: p, step: i } }));
      };
      update(0);
      ScrollTrigger.create({
        trigger: scene,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => update(self.progress),
        onRefresh: (self) => update(self.progress)
      });
    });

    // Hero recedes while About slides over it
    if (about) {
      gsap.fromTo('.hero__content', { scale: 1, opacity: 1 }, {
        scale: 0.94, opacity: 0.25, ease: 'none', transformOrigin: 'left center',
        scrollTrigger: { trigger: about, start: 'top bottom', end: 'top top', scrub: true }
      });
      gsap.fromTo('.hero__media', { opacity: 1 }, {
        opacity: 0.2, ease: 'none',
        scrollTrigger: { trigger: about, start: 'top bottom', end: 'top top', scrub: true }
      });
    }

    return () => {
      html.classList.remove('js-scenes');
      document.querySelectorAll('.scene').forEach((scene) => {
        delete scene.dataset.step;
        scene.querySelectorAll('.step').forEach((s) => s.classList.remove('is-active'));
        scene.querySelectorAll('.scene__bar').forEach((b) => b.style.removeProperty('--p'));
      });
      pending = null;
      if (globe) globe.reset();
    };
  });

  // Layout shifts (web font, images) change scene positions. A refresh
  // restores the scroll position, which would cut short a smooth scroll in
  // progress (menu links, search results), so wait until scrolling stops.
  let lastScroll = 0;
  window.addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
  const refreshWhenIdle = () => {
    const wait = 200 - (performance.now() - lastScroll);
    if (wait > 0) setTimeout(refreshWhenIdle, wait);
    else ScrollTrigger.refresh();
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshWhenIdle);
  window.addEventListener('load', refreshWhenIdle, { once: true });
})();
