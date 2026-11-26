(() => {
  const stage = document.getElementById('stage');
  const claw = document.getElementById('claw');
  const boxes = [...document.querySelectorAll('.box')];
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  // Responsive pile coordinates: [x, y, rotateX, rotateY, rotateZ]
  const DESK = [
    [.48, .61, -14, -24, 6],
    [.13, .81, -16, 28, 16],
    [.36, .84, -12, -20, -10],
    [.60, .82, -14, 24, 12],
    [.86, .80, -16, -30, -14],
    [.25, .63, -14, 30, -12],
    [.73, .63, -14, -26, 16]
  ];
  const PHONE = [
    [.50, .56, -12, -16, 4],
    [.19, .86, -14, 20, 12],
    [.50, .88, -10, -14, -8],
    [.82, .85, -14, 18, 10],
    [.21, .71, -12, 22, -10],
    [.51, .73, -12, -18, 8],
    [.80, .70, -14, -20, 12]
  ];

  // Build faces, doors and the real <button> for each container
  boxes.forEach((b, i) => {
    const d = b.dataset;
    const lbl = `<span class="lbl">${d.l1}<br>${d.l2}</span>`;
    b.insertAdjacentHTML('afterbegin',
      `<i class="face back"></i><i class="face end el"></i><i class="face end er"></i><i class="face top"></i><i class="face bot"></i>
       <div class="front">
         <div class="door dl"><span class="out">${lbl}</span><span class="in"></span></div>
         <div class="door dr"><span class="out">${lbl}<span class="tag">${d.tag}</span></span><span class="in"></span></div>
       </div>
       <button type="button" class="hit" aria-label="Open ${d.name} container"></button>`);
    b.querySelector('.hit').addEventListener('click', () => req(i));
    b.querySelector('.wall').addEventListener('click', e => e.stopPropagation());
  });

  // Ensure all links inside 3D containers reliably open in a new tab
  document.querySelectorAll('.wall a[href]').forEach(link => {
    link.addEventListener('click', e => {
      e.stopPropagation();
      if (link.target === '_blank') {
        e.preventDefault();
        window.open(link.href, '_blank', 'noopener,noreferrer');
      }
    });
  });

  let sw, sh, ph, shortH, W, H, DP, held = -1, busy = false, next = null;

  function measure() {
    sw = stage.clientWidth;
    sh = stage.clientHeight;
    ph = sw <= 680;
    shortH = sh <= 480;

    // Scale base container size from both width and height so piles never clip
    const base = Math.min(sw * (ph ? .40 : .20), sh * (ph ? .23 : .34));
    W = ph ? Math.min(180, Math.max(125, base)) : Math.min(295, Math.max(180, base));
    H = W * (ph ? .60 : .43);
    DP = W * (ph ? .52 : .38);
  }

  function geo(i, lift) {
    if (lift) {
      // Dynamic safe boundaries between top rail/claw and bottom hint pill
      const topSafe = (ph || shortH) ? 62 : 84;
      const botSafe = (ph || shortH) ? sh - 12 : sh - 54;
      const availH = Math.max(210, botSafe - topSafe);
      const availW = sw - (ph ? 18 : 44);
      const centerY = topSafe + availH / 2;

      if (boxes[i].classList.contains('wide')) {
        const d = ph ? Math.min(85, availW * .16) : Math.min(145, availW * .13);
        // Reserve room for opened 3D doors so they stay inside the screen edges
        const doorMargin = ph ? d * .25 : d * .95;
        const w = Math.min(1060, Math.max(260, availW - doorMargin));
        const h = Math.min(620, Math.max(200, availH - d * .18));
        return {
          w, h, d,
          x: sw / 2,
          y: centerY,
          t: `translateZ(36px) rotateX(${ph ? -4 : -5}deg) rotateY(${ph ? -4 : -7}deg) rotateZ(0deg)`
        };
      }

      // Flexible sizing for compact containers (01, 03, 05, 07)
      const targetW = ph ? availW * .92 : Math.min(720, availW * .64);
      const targetH = ph ? Math.min(340, availH * .68) : Math.min(340, availH * .58);
      const S = Math.max(1.2, Math.min(targetW / W, targetH / H));
      const w = W * S, h = H * S, d = DP * S;
      return {
        w, h, d,
        x: sw / 2,
        y: centerY,
        t: `translateZ(36px) rotateX(${ph ? -4 : -5}deg) rotateY(${ph ? -4 : -7}deg) rotateZ(0deg)`
      };
    }

    const r = ph ? PHONE[i] : DESK[i];
    return {
      w: W, h: H, d: DP,
      x: r[0] * sw,
      y: r[1] * sh,
      t: `translateZ(0px) rotateX(${r[2]}deg) rotateY(${r[3]}deg) rotateZ(${r[4]}deg)`
    };
  }

  function place(i, lift) {
    const s = boxes[i].style, g = geo(i, lift);
    s.left = g.x + 'px';
    s.top = g.y + 'px';
    s.setProperty('--w', g.w + 'px');
    s.setProperty('--h', g.h + 'px');
    s.setProperty('--d', g.d + 'px');
    s.transform = 'translate(-50%,-50%) ' + g.t;
    s.zIndex = lift ? 60 : 1 + Math.round(g.y / sh * 50);
  }

  const cTop = g => g.y - g.h / 2 - g.d * .10;
  const rodFor = g => Math.max(10, cTop(g) - ((ph || shortH) ? 68 : 88));

  function setClaw(x, rod, g, open) {
    claw.style.left = x + 'px';
    claw.style.setProperty('--rod', rod + 'px');
    claw.style.setProperty('--half', (g.w * 1.04 / 2) + 'px');
    claw.style.setProperty('--fh', Math.min(160, g.h * .50) + 'px');
    claw.classList.toggle('open', open);
  }

  const idle = () => setClaw(sw / 2, (ph || shortH) ? 24 : 36, geo(0), true);
  const T = t => stage.style.setProperty('--t', (RM.matches ? 0 : t) + 's');
  const sleep = ms => new Promise(r => setTimeout(r, RM.matches ? 0 : ms));

  function setOpen(i, on) {
    const b = boxes[i];
    b.classList.toggle('open', on);
    const wall = b.querySelector('.wall');
    wall.inert = !on;
    if (on) wall.scrollTop = 0;
    b.querySelector('.hit').tabIndex = on ? -1 : 0;
  }

  async function putBack() {
    const h = held, g = geo(h);
    T(.65); setOpen(h, false); await sleep(670);
    T(.85); place(h, false); setClaw(g.x, rodFor(g), g, false); await sleep(870);
    setClaw(g.x, rodFor(g), g, true); await sleep(260);
    boxes[h].classList.remove('lifted'); held = -1;
  }

  async function run(i) {
    const prev = held;
    if (prev >= 0) await putBack();
    if (i === -1 || i === prev) { T(.75); idle(); await sleep(770); return; }

    const g = geo(i);
    T(.75); setClaw(g.x, (ph || shortH) ? 24 : 36, g, true); await sleep(770);
    T(.56); setClaw(g.x, rodFor(g), g, true); await sleep(580);
    T(.24); setClaw(g.x, rodFor(g), g, false); await sleep(260);

    const L = geo(i, true);
    T(.95); boxes[i].classList.add('lifted'); place(i, true); setClaw(L.x, rodFor(L), L, false); await sleep(970);

    held = i; setOpen(i, true); await sleep(780);
    boxes[i].querySelector('h2').focus({ preventScroll: true });
  }

  function req(i) { if (busy) { next = i; return; } loop(i); }
  async function loop(i) {
    busy = true;
    while (i != null) { next = null; await run(i); i = next; }
    busy = false;
  }

  // Image & Video Lightbox
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  const lbVid = document.getElementById('lb-vid');
  const lbCap = document.getElementById('lb-cap');

  document.querySelectorAll('.media-slot img, .media-slot video').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const isVid = el.tagName === 'VIDEO';
      lbImg.hidden = isVid;
      lbVid.hidden = !isVid;
      if (isVid) {
        lbVid.src = el.currentSrc || el.src;
        lbVid.play().catch(() => {});
        lbCap.textContent = el.getAttribute('aria-label') || '';
      } else {
        lbImg.src = el.src;
        lbImg.alt = el.alt;
        lbCap.textContent = el.alt;
      }
      lb.hidden = false;
    });
  });

  const closeLb = () => {
    lb.hidden = true;
    lbImg.src = '';
    lbVid.pause();
    lbVid.removeAttribute('src');
    lbVid.load();
  };
  document.getElementById('lb-close').addEventListener('click', closeLb);
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });

  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => req(+b.dataset.go)));
  addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!lb.hidden) { closeLb(); return; }
      if (held >= 0) req(-1);
    }
  });
  document.querySelector('.logo').addEventListener('click', e => { e.preventDefault(); if (held >= 0) req(-1); });
  stage.addEventListener('click', e => { if (held >= 0 && !e.target.closest('.box')) req(-1); });

  function layout() {
    measure();
    boxes.forEach((_, i) => place(i, i === held));
    if (held >= 0) { const L = geo(held, true); setClaw(L.x, rodFor(L), L, false); } else idle();
  }
  addEventListener('resize', () => {
    stage.classList.add('snap'); layout();
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('snap')));
  });

  stage.classList.add('snap'); layout();
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('snap')));
})();