/* =========================================================
   PORTFOLIO SCRIPT
   1. Custom Cursor
   2. Scroll-Linked Animations (Scroll Sync)
   3. Scroll Reveal
   4. Carousel  — Vertical Scroll → Horizontal Movement
   5. Contact Form
   6. Nav Scroll State
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ============= 1. CUSTOM CURSOR ============= */

  const dot  = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');

  if (dot && ring) {
    let mouseX = 0, mouseY = 0;
    let ringX  = 0, ringY  = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      dot.style.left = mouseX + 'px';
      dot.style.top  = mouseY + 'px';
    });

    function animateRing() {
      ringX += (mouseX - ringX) * 0.15;
      ringY += (mouseY - ringY) * 0.15;
      ring.style.left = ringX + 'px';
      ring.style.top  = ringY + 'px';
      requestAnimationFrame(animateRing);
    }
    animateRing();

    const interactiveSelectors = 'a, button, [data-hover], .project, input, textarea';
    document.querySelectorAll(interactiveSelectors).forEach((el) => {
      el.addEventListener('mouseenter', () => ring.classList.add('hover'));
      el.addEventListener('mouseleave', () => ring.classList.remove('hover'));
    });
  }


  /* ============= 2. SCROLL-LINKED ANIMATIONS (SCROLL SYNC) =============
     Every animated value is computed directly from the scroll position
     each frame — no IntersectionObserver toggles, no CSS keyframes for
     these effects. Things driven by scroll:
       - Each spiral-section's lateral drift + rotation (S-curve feel)
       - The decorative spiralTrack SVG drifts horizontally
       - A scroll progress value exposed via a CSS custom property
         (--scroll-progress) so CSS can react if desired
     We only read scroll position once per frame, via rAF. */

  const spiralSections = document.querySelectorAll('.spiral-section');
  const spiralTrack    = document.getElementById('spiralTrack');
  const AMPLITUDE      = 70;  // max horizontal shift in pixels per section

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollSyncEnabled = window.innerWidth > 900 && !reducedMotion;

  function syncScroll() {
    const vh = window.innerHeight;
    const docHeight = document.documentElement.scrollHeight - vh;
    const scrollY   = window.scrollY;

    // Global scroll progress 0 → 1, exposed for CSS use
    const globalProgress = docHeight > 0 ? scrollY / docHeight : 0;
    document.documentElement.style.setProperty('--scroll-progress', globalProgress.toFixed(4));

    // Per-section scroll-linked transforms — preserves the S-curve feel
    spiralSections.forEach((section, i) => {
      const rect          = section.getBoundingClientRect();
      const sectionCenter = rect.top + rect.height / 2;

      // -1 = section is below viewport, 0 = centered, +1 = above viewport
      let progress = (vh / 2 - sectionCenter) / vh;
      progress = Math.max(-1.2, Math.min(1.2, progress));

      const direction = i % 2 === 0 ? 1 : -1;
      const offset    = Math.sin(progress * Math.PI * 0.5) * AMPLITUDE * direction;
      const rotation  = Math.sin(progress * Math.PI * 0.4) * direction * 0.3;

      section.style.transform = `translateX(${offset}px) rotate(${rotation}deg)`;
    });

    // Decorative spiral SVG drifts side-to-side as you scroll
    if (spiralTrack) {
      const drift = Math.sin(globalProgress * Math.PI * 4) * 30;
      spiralTrack.style.transform = `translateX(${drift}px)`;
    }
  }

  // rAF-throttled scroll listener — guarantees one calculation per frame
  let scrollTicking = false;
  function onScrollSync() {
    if (!scrollTicking) {
      requestAnimationFrame(() => {
        syncScroll();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  }

  if (scrollSyncEnabled) {
    window.addEventListener('scroll', onScrollSync, { passive: true });
    window.addEventListener('resize', syncScroll);
    syncScroll(); // initial paint
  }


  /* ============= 3. SCROLL REVEAL ============= */

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -80px 0px'
  });

  document.querySelectorAll('.reveal, .project').forEach((el) => {
    observer.observe(el);
  });


  /* ============= 4. CAROUSEL — VERTICAL SCROLL → HORIZONTAL MOVEMENT =============
     When the carousel is the focal section in the viewport, vertical wheel
     input is captured and translated into horizontal movement. While the
     carousel still has room to scroll horizontally, the page's vertical
     scroll is paused. Once the carousel reaches an edge in the direction
     of travel, the wheel event passes through and the page scrolls normally.
     The progress bar is also scroll-synced. */

  const wrapper     = document.getElementById('carouselWrapper');
  const carousel    = document.getElementById('carousel');
  const prevBtn     = document.getElementById('prevBtn');
  const nextBtn     = document.getElementById('nextBtn');
  const progressBar = document.getElementById('progressBar');

  if (wrapper && carousel) {

    function getScrollAmount() {
      const project = carousel.querySelector('.project');
      if (!project) return 0;
      const gap = parseInt(getComputedStyle(carousel).gap) || 0;
      return project.offsetWidth + gap;
    }

    function updateCarouselUI() {
      const max = wrapper.scrollWidth - wrapper.clientWidth;
      const pct = max > 0 ? (wrapper.scrollLeft / max) * 100 : 0;

      if (progressBar) {
        progressBar.style.width = Math.max(15, pct) + '%';
      }
      if (prevBtn) prevBtn.disabled = wrapper.scrollLeft <= 5;
      if (nextBtn) nextBtn.disabled = wrapper.scrollLeft >= max - 5;
    }

    // --- Buttons ---
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        wrapper.scrollBy({ left: -getScrollAmount(), behavior: 'smooth' });
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        wrapper.scrollBy({ left: getScrollAmount(), behavior: 'smooth' });
      });
    }

    // --- Scroll sync: keep progress bar synced to actual scroll position ---
    wrapper.addEventListener('scroll', updateCarouselUI, { passive: true });
    window.addEventListener('resize', updateCarouselUI);
    updateCarouselUI();

    // --- Vertical wheel → horizontal movement ---
    // Only intercept when:
    //   1) the work section is roughly in view (so we don't hijack scroll
    //      when the user is far above or below it), and
    //   2) the carousel has room to move in the direction the user is scrolling.
    const workSection = document.getElementById('work');

    function isWorkSectionFocused() {
      if (!workSection) return false;
      const rect = workSection.getBoundingClientRect();
      const vh   = window.innerHeight;
      // Section's vertical center is within the middle band of the viewport
      const sectionCenter = rect.top + rect.height / 2;
      return sectionCenter > vh * 0.15 && sectionCenter < vh * 0.85;
    }

    wrapper.addEventListener('wheel', (e) => {
      // Pick the dominant axis so trackpads with horizontal intent still pass through
      const deltaY = e.deltaY;
      const deltaX = e.deltaX;
      const delta  = Math.abs(deltaY) > Math.abs(deltaX) ? deltaY : deltaX;
      if (delta === 0) return;

      const max = wrapper.scrollWidth - wrapper.clientWidth;
      const atStart = wrapper.scrollLeft <= 0;
      const atEnd   = wrapper.scrollLeft >= max;

      // If we're at an edge and the user is scrolling further in that direction,
      // let the page scroll naturally — don't trap them.
      if ((atEnd && delta > 0) || (atStart && delta < 0)) {
        return;
      }

      // Only hijack when the work section is the user's focus
      if (!isWorkSectionFocused()) return;

      e.preventDefault();
      wrapper.scrollLeft += delta;
    }, { passive: false });

    // --- Drag to scroll (preserved from before) ---
    let isDown   = false;
    let startX   = 0;
    let scrollAt = 0;

    wrapper.addEventListener('mousedown', (e) => {
      isDown   = true;
      startX   = e.pageX - wrapper.offsetLeft;
      scrollAt = wrapper.scrollLeft;
    });

    ['mouseleave', 'mouseup'].forEach((evt) => {
      wrapper.addEventListener(evt, () => { isDown = false; });
    });

    wrapper.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - wrapper.offsetLeft;
      wrapper.scrollLeft = scrollAt - (x - startX) * 1.5;
    });
  }


  /* ============= 5. CONTACT FORM =============
     Replace the fake-submit with a real endpoint
     (Formspree, Resend, your own API) when ready. */

  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('.submit-btn');
      if (!btn) return;

      const original = btn.textContent;
      btn.textContent = 'Sent ✓';

      // TODO: replace with real fetch() to your backend / Formspree / Resend
      // fetch('https://formspree.io/f/YOUR_ID', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      //   body: JSON.stringify(Object.fromEntries(new FormData(form)))
      // });

      setTimeout(() => {
        btn.textContent = original;
        form.reset();
      }, 2000);
    });
  }


  /* ============= 6. NAV SCROLL STATE ============= */

  const nav = document.getElementById('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

});