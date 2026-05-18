// Hero video autoplay
const heroVideo = document.querySelector('.hero-video');
if (heroVideo) {
  heroVideo.play().catch(() => {
    document.addEventListener('click', () => heroVideo.play(), { once: true });
    document.addEventListener('touchstart', () => heroVideo.play(), { once: true });
  });
}

// Partners ticker animation
const track = document.getElementById('partners-track');
if (track) {
  const originalItems = Array.from(track.querySelectorAll('.partner-item'));
  const partnerCount = originalItems.length;
  if (partnerCount >= 1) {
    originalItems.forEach(item => {
      const clone = item.cloneNode(true);
      track.appendChild(clone);
    });
    track.classList.add('scrolling');
  }
}

// Stats counter animation
const statNums = document.querySelectorAll('.stat-item .num');
const targets = [
  { el: statNums[0], value: siteData.partners.length },
  { el: statNums[1], value: siteData.publications.length },
  { el: statNums[2], value: siteData.events.length }
];

function animateCount(el, actualTarget, duration = 1500) {
  const target = actualTarget > 1 ? actualTarget - 1 : actualTarget;
  const suffix = actualTarget > 1 ? '+' : '';
  if (target === 0) { el.textContent = '0'; return; }
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const statsSection = document.querySelector('.stats');
let animated = false;
if (statsSection) {
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !animated) {
      animated = true;
      targets.forEach(({ el, value }) => animateCount(el, value));
    }
  }, { threshold: 0.3 });
  observer.observe(statsSection);
}