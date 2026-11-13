/*
 * Payer — motion, driven by values measured on the original at a 1024x768 viewport.
 * Scroll positions are expressed in "reference px" (what they'd be at 768px viewport height)
 * and scaled by k = innerHeight / 768, as the original sizes its scroll areas in vh.
 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);

  // piecewise-linear table lookup  [[x, y], ...]
  const table = (pts, x) => {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return lerp(y0, y1, (x - x0) / (x1 - x0));
      }
    }
    return pts[pts.length - 1][1];
  };

  /* ---- measured progress curves (reference scroll px -> 0..1) ---- */
  // phase 1: phone rises from the bottom, tilts up, slides right; title fades
  const P1 = [[0, 0], [150, .1725], [300, .356], [450, .5647], [600, .757], [750, .943], [820, .991], [900, 1]];
  // phase 2: phone slides to the left, glow keeps turning
  const P2 = [[1050, 0], [1130, .012], [1200, .0446], [1350, .2224], [1500, .4163], [1650, .6118], [1800, .8067], [1950, .9782], [2060, .9975], [2150, 1]];

  const title = $('#title'), phone = $('#phone'), glow = $('#glow'), strip = $('#strip');
  const hero = $('#features');
  const cStage = $('#cStage'), cTitle = $('#cTitle'), cards = $('#cards');
  const integ = $('#integ'), tp = $('#tp'), tpLeft = $('#tpLeft'), iGlow = $('#iGlow');
  const cust = $('#cust');
  const dl = $('#download'), dphL = $('#dphL'), dphR = $('#dphR');

  const uHeadEl = $('#uH'), uHead = $$('#uH .rti'), uCells = $$('.urow');
  uCells.forEach(c => { c._ic = $('.uic', c); c._n = $('.un', c); c._t = $('.rti', c); });
  const calcEl = $('#calc'), calcYear = $('#calcYear'), calcTicks = $$('#ticks i');
  let calcN = -1;
  const apHome = $('#apHome'), apLeaks = $('#apLeaks');
  let apMax = [0, 0];
  const measureAp = () => { apMax = [apHome, apLeaks].map(el => Math.max(0, el.scrollHeight - 409 + 46)); };
  addEventListener('load', measureAp);
  let z = 1, vh = innerHeight, k = vh / 768;
  function applyZoom() {
    z = innerWidth < 900 ? 1 : clamp(innerWidth / 1280, 1, 1.4);
    document.body.style.zoom = z === 1 ? '' : z;
    document.documentElement.style.setProperty('--z', z);
    vh = innerHeight / z; k = vh / 768;
  }
  applyZoom();
  let screenIdx = 0, dlOpen = false;
  const heroTop = () => hero.offsetTop;

  const SCR_STEP = 193.5;           // distance between screens in the phone strip
  function setScreen(i) {
    if (i === screenIdx) return;
    screenIdx = i;
    strip.style.transform = `translate3d(${-SCR_STEP * i}px,0,0)`;
  }


  /* ---- magnifier: slides down the statement as you scroll (and back up), revealing the yearly cost ---- */
  const lens = $('#lens'), lensIn = $('#lensIn'), stmt2 = $('#stmt2');
  lensIn.innerHTML = stmt2.innerHTML;
  const MAG = 1.45, LR = 78, HEAD = 44, ROW = 34;
  function moveLens(q) {
    const e = ease(q);
    const rows = 8;
    const cy = HEAD + ROW / 2 + e * (rows - 1) * ROW;        // down the rows
    const cx = 272 + 8 * Math.sin(e * Math.PI * 3);         // stays over the amounts / yearly-cost pills
    lens.style.transform = `translate3d(${cx}px,${cy}px,0) rotate(${(e - .5) * 6}deg)`;
    lensIn.style.transform = `translate3d(${LR - cx * MAG}px,${LR - cy * MAG}px,0) scale(${MAG})`;
  }

  /* the phone starts below the last title line, whatever the screen size: measure the gap at scroll 0 */
  let dropMin = 0;
  function measureDrop() {
    if (scrollY > 40) return;
    const mobile = innerWidth < 900;
    const keep = phone.style.transform;
    const titleBottom = title.offsetTop + title.offsetHeight;
    let drop = 0;
    for (let i = 0; i < 4; i++) {          // converge: perspective makes one pass slightly short
      phone.style.transform = `translate(-50%,-50%) perspective(700px) translateX(0px) translateY(${drop}px) scale(${mobile ? 1.45 : 1.7}) rotateX(50deg)`;
      const top = phone.getBoundingClientRect().top / z;
      const need = titleBottom + 24 - top;
      if (need <= 0.5) break;
      drop += need;
    }
    phone.style.transform = keep;
    dropMin = drop;
  }
  const remeasure = () => { measureDrop(); frame(); };
  if (document.readyState === 'complete') remeasure(); else addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

  /* ---- per-frame update (direct scroll linkage, like the original) ---- */
  function frame() {
    const sy = scrollY / z;                  // scroll position in unzoomed layout units
    const y = (sy - heroTop()) / k;          // hero scroll in reference px

    /* hero ------------------------------------------------------------ */
    if (y < 2400 + 800) {
      const p1 = table(P1, y);
      const p2 = table(P2, y);
      const mobile = innerWidth < 900;
      // desktop: phone slides right then left beside the copy; mobile: it stays centred below the copy
      const x = mobile ? 0 : 200 * p1 - 400 * p2;            // phone translateX
      const drop = Math.max(0.1 * vh, dropMin) * (1 - p1);   // start lower so the 3-line title stays clear of the phone
      const ty = (mobile ? -0.03 * vh * p1 : -150 * p1) + drop;
      const sc = mobile ? 1.45 - 0.73 * p1 : 1.7 - 0.5 * p1;
      const rx = 50 * (1 - p1);
      phone.style.transform =
        `translate(-50%,-50%) perspective(700px) translateX(${x}px) translateY(${ty}px) scale(${sc}) rotateX(${rx}deg)`;

      // title: opacity 1 - p, scale 1 - .2p
      if (title.classList.contains('live')) {
        title.style.opacity = 1 - p1;
        title.style.transform = `perspective(700px) scale(${1 - 0.2 * p1})`;
      } else if (p1 > 0.004) {
        title.classList.add('live');
      }

      // glow: shares x, travels 250px up, rotates 90deg then 180deg more, fades to .6
      const gr = 90 * p1 + 180 * p2;
      glow.style.opacity = 1 - 0.4 * p1;
      glow.style.transform = `translate3d(${x}px,${(mobile ? -0.1 * vh : -250) * p1}px,0) rotate(${gr}deg)`;

      // the screens scroll inside the phone as you scroll the page (home, then leaks)
      if (!apMax[0]) measureAp();
      const hp = clamp((y - 360) / 1100), lp = clamp((y - 1650) / 650);
      apHome.style.transform = `translate3d(0,${-apMax[0] * ease(hp)}px,0)`;
      apLeaks.style.transform = `translate3d(0,${-apMax[1] * ease(lp)}px,0)`;

      // phone screens: start -> home -> transfer (eased switch at fixed scroll marks)
      const want = y < 314 ? 0 : y < 1586 ? 1 : 2;
      setScreen(want);
    }

    /* look-beyond cards: fan out while pinned, then scale up 4.8x and fade as it leaves
       (the exit the old orbits section had) */
    {
      const T = cards.offsetTop, H = cards.offsetHeight;
      const q = clamp((sy - T) / (H - vh));
      moveLens(q);
      const p = clamp((sy - (T + H - vh)) / vh);
      cTitle.style.transform = `translate3d(0,${-250 * p}px,0)`;
      cStage.style.transform = `scale(${1 + 3.8 * p})`;
      cStage.style.opacity = 1 - p;
    }

    /* TracePay section: rises in as it arrives, lifts away and fades as it leaves */
    if (innerWidth < 900) {
      for (const el of [tp, tpLeft, iGlow]) { el.style.opacity = ''; el.style.transform = ''; }
    } else {
      const top = integ.getBoundingClientRect().top / z;
      const e1 = ease(clamp((vh * 0.92 - top) / (vh * 0.55)));
      tpLeft.style.opacity = e1;
      tpLeft.style.transform = `translate3d(0,${(1 - e1) * 70}px,0)`;
      const start = integ.offsetTop + integ.offsetHeight - vh;
      const p = ease(clamp((sy - start) / vh));
      tp.style.opacity = 1 - p;
      tp.style.transform = `translate3d(0,${-120 * p}px,0) scale(${1 - 0.04 * p})`;
      iGlow.style.opacity = 0.35 * (1 - p) * e1;
    }


    /* what-TracePay-can-uncover: cards and titles reveal with the scroll (and un-reveal scrolling back up) */
    {
      const reveal = (el, start, span) => ease(clamp((vh * 0.94 - el.getBoundingClientRect().top / z - start) / span));
      uHead.forEach((w, i) => {
        const e = reveal(uHeadEl, i * 26, vh * 0.22);
        w.style.transform = `translate3d(0,${(1 - e) * 110}%,0)`;
      });
      uCells.forEach((c, i) => {
        const e = reveal(c, 40, vh * 0.26);
        const eT = reveal(c, 70, vh * 0.24);
        c.style.setProperty('--l', e);
        c.style.opacity = Math.min(1, e * 1.6);
        c._ic.style.opacity = eT;
        c._ic.style.transform = `translate3d(${(1 - eT) * 14}px,0,0)`;
        c._t.style.transform = `translate3d(0,${(1 - eT) * 112}%,0)`;
        c._n.style.opacity = eT;
      });
    }

    /* the story line: twelve months fill in and the yearly figure steps up with them */
    {
      const top = calcEl.getBoundingClientRect().top / z;
      const q = clamp((vh * 0.86 - top) / (vh * 0.42));
      const e = ease(q);
      calcEl.style.opacity = clamp(e * 1.4);
      calcEl.style.transform = `translate3d(0,${(1 - e) * 36}px,0)`;
      const n = Math.round(clamp((q - 0.12) / 0.8) * 12);
      if (n !== calcN) {
        calcN = n;
        calcTicks.forEach((t, i) => t.classList.toggle('on', i < n));
        const v = 189 * Math.max(1, n);
        calcYear.textContent = 'R' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        calcYear.parentElement.classList.toggle('done', n === 12);
      }
    }

    /* download: outer phones fan apart once the page bottom is reached - */
    {
      const open = dl.getBoundingClientRect().bottom / z < vh * 0.6;
      if (open !== dlOpen) {
        dlOpen = open;
        dphL.style.transition = dphR.style.transition = 'transform .9s cubic-bezier(.22,1,.36,1)';
        dphL.style.transform = `translate(calc(-50% - ${open ? 40 : 0}px),-50%) rotate(-30deg)`;
        dphR.style.transform = `translate(calc(-50% + ${open ? 40 : 0}px),-50%) rotate(30deg)`;
      }
    }
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; frame(); });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { applyZoom(); measureDrop(); frame(); });

  /* ---- hero title entrance ---- */
  const start = () => { frame(); requestAnimationFrame(() => title.classList.add('go')); };
  if (document.readyState === 'complete') start();
  else addEventListener('load', start);
  // after the entrance finishes, hand the title over to scroll control
  title.addEventListener('transitionend', () => {
    title.classList.add('live');
    title.style.transition = 'none';
    frame();
  }, { once: true });


  /* ---- light / dark toggle ---- */
  (() => {
    const btn = $('#themeToggle'), root = document.documentElement;
    const apply = (t, animate) => {
      if (animate) { root.classList.add('theme-anim'); clearTimeout(apply._t); apply._t = setTimeout(() => root.classList.remove('theme-anim'), 480); }
      root.dataset.theme = t;
      btn.setAttribute('aria-checked', String(t === 'light'));
      btn.setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    };
    apply(root.dataset.theme === 'light' ? 'light' : 'dark', false);
    btn.addEventListener('click', () => {
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      apply(next, true);
      try { localStorage.setItem('tp-theme', next); } catch (e) {}
    });
  })();

  /* ---- liquid-glass lens: build the radial displacement map (R,G = x,y shift) once ---- */
  (() => {
    const img = document.getElementById('lgMap');
    if (!img) return;
    const N = 128, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const ctx = cv.getContext('2d'), data = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1, v = ((y + 0.5) / N) * 2 - 1;
      const r = Math.hypot(u, v) || 1e-6;
      // the glass is bent near its rim: little distortion in the middle, a strong bulge toward the edge
      const t = clamp((r - 0.62) / 0.38);
      const m = t * t * (3 - 2 * t) * Math.pow(t, 0.6);
      const i = (y * N + x) * 4;
      data.data[i] = Math.round(255 * (0.5 + 0.5 * (u / r) * m));
      data.data[i + 1] = Math.round(255 * (0.5 + 0.5 * (v / r) * m));
      data.data[i + 2] = 128; data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    const url = cv.toDataURL('image/png');
    img.setAttribute('href', url);
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
  })();
})();
