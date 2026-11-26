(() => {
  const stage = document.getElementById('stage');
  const claw = document.getElementById('claw');
  const word = document.getElementById('word');
  const boxes = [...document.querySelectorAll('.box')];
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  // Normalized pile slots: [xNorm (0..1 within safe screen edges), rowFromFloor (in visH), rotateX, rotateY, rotateZ]
  const DESK = [
    [.50,  1.42, -14, -22, 5],   // 0: PORTFOLIO (upper center)
    [0,    .52,  -15, 24,  12],  // 1: PROJECTS (bottom left)
    [.335, .51,  -12, -18, -8],  // 2: ABOUT ME (bottom mid-left)
    [.665, .51,  -13, 20,  9],   // 3: THE WORKS (bottom mid-right)
    [1,    .52,  -15, -24, -12], // 4: TOOL KIT (bottom right)
    [.18,  1.40, -13, 24,  -9],  // 5: SIDE QUEST (upper left)
    [.82,  1.40, -13, -22, 11]   // 6: SAY HELLO (upper right)
  ];
  const PHONE = [
    [.50, 2.34, -12, -15, 4],    // 0: PORTFOLIO (top center)
    [0,   .52,  -13, 18,  9],    // 1: PROJECTS (bottom left)
    [.50, .51,  -10, -14, -6],   // 2: ABOUT ME (bottom center)
    [1,   .52,  -13, 16,  8],    // 3: THE WORKS (bottom right)
    [.03, 1.43, -12, 18,  -8],   // 4: TOOL KIT (mid left)
    [.50, 1.42, -11, -15, 6],    // 5: SIDE QUEST (mid center)
    [.97, 1.43, -13, -18, 9]     // 6: SAY HELLO (mid right)
  ];

  // Build faces, doors, inner close button, and the real <button> for each container
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

    const c = b.querySelector('.c');
    c.insertAdjacentHTML('afterbegin',
      `<div class="wall-top"><button type="button" class="close-box" aria-label="Close ${d.name} container">✕</button></div>`);
    c.querySelector('.close-box').addEventListener('click', e => {
      e.stopPropagation();
      req(-1);
    });

    b.querySelector('.hit').addEventListener('click', e => {
      e.stopPropagation();
      req(i);
    });
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

  let sw, sh, ph, shortH, W, H, DP, visW, visH, held = -1, targetIdx = -1, busy = false, next = null;

  function measure() {
    sw = stage.clientWidth;
    sh = stage.clientHeight;
    ph = sw <= 680;
    shortH = sh <= 480;

    // Fit 4 columns on desktop or 3 columns on mobile within safe screen margins
    const sidePad = ph ? 12 : 24;
    const cols = ph ? 3.25 : 4.55;
    const rows = ph ? 3.05 : 2.10;
    const maxWByWidth = (sw - sidePad * 2) / cols;
    const aspectH = ph ? .58 : .43;
    const maxWByHeight = (sh * (ph ? .54 : .48)) / (rows * aspectH * 1.32);
    const rawW = Math.min(maxWByWidth, maxWByHeight);

    W = ph ? Math.min(165, Math.max(96, rawW)) : Math.min(275, Math.max(155, rawW));
    H = W * aspectH;
    DP = W * (ph ? .50 : .38);

    // Projected 3D footprint so outer corners never clip past left/right or bottom screen edges
    visW = W * (ph ? .95 : .91) + DP * (ph ? .30 : .41);
    visH = H * .97 + DP * .25 + W * .11;
  }

  function geo(i, lift) {
    if (lift) {
      const topSafe = (ph || shortH) ? 62 : 90;
      const botSafe = (ph || shortH) ? sh - 14 : sh - 58;
      const availH = Math.max(200, botSafe - topSafe);
      const availW = sw - (ph ? 20 : 56);
      const centerY = topSafe + availH / 2;

      if (boxes[i].classList.contains('wide')) {
        const d = ph ? Math.min(68, availW * .13) : Math.min(105, availW * .10);
        const doorMargin = ph ? d * .30 : d * 1.35;
        const w = Math.min(880, Math.max(260, availW * (ph ? .94 : .86) - doorMargin));
        const h = Math.min(490, Math.max(210, availH * .82));
        return {
          w, h, d,
          x: sw / 2,
          y: centerY,
          t: `translateZ(18px) rotateX(${ph ? -3 : -4}deg) rotateY(${ph ? -3 : -5}deg) rotateZ(0deg)`
        };
      }

      const targetW = ph ? availW * .88 : Math.min(620, availW * .56);
      const targetH = ph ? Math.min(310, availH * .62) : Math.min(300, availH * .52);
      const S = Math.max(1.15, Math.min(targetW / W, targetH / H));
      const w = W * S, h = H * S, d = DP * S;
      return {
        w, h, d,
        x: sw / 2,
        y: centerY,
        t: `translateZ(18px) rotateX(${ph ? -3 : -4}deg) rotateY(${ph ? -3 : -5}deg) rotateZ(0deg)`
      };
    }

    const r = ph ? PHONE[i] : DESK[i];
    const edgePad = ph ? 8 : 18;
    const minX = visW / 2 + edgePad;
    const maxX = Math.max(minX, sw - visW / 2 - edgePad);
    const floorY = sh - (ph ? 14 : 20);

    return {
      w: W, h: H, d: DP,
      x: minX + r[0] * (maxX - minX),
      y: floorY - visH * r[1],
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

  const cTop = g => g.y - g.h / 2 - g.d * .08;
  const rodFor = g => Math.max(10, cTop(g) - ((ph || shortH) ? 68 : 88));

  function setClaw(x, rod, g, open) {
    claw.style.left = x + 'px';
    claw.style.setProperty('--rod', rod + 'px');
    claw.style.setProperty('--half', (g.w * 1.04 / 2) + 'px');
    claw.style.setProperty('--fh', Math.min(145, g.h * .46) + 'px');
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

  function req(i) {
    if (busy) {
      // Ignore duplicate clicks on the container already being opened so it won't auto-close
      if (i === targetIdx && i !== -1) return;
      next = i;
      return;
    }
    loop(i);
  }

  async function loop(i) {
    busy = true;
    while (i != null) {
      targetIdx = i;
      next = null;
      await run(i);
      i = next;
    }
    targetIdx = -1;
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
  stage.addEventListener('click', e => { if (!busy && held >= 0 && !e.target.closest('.box')) req(-1); });

  function layout() {
    measure();
    boxes.forEach((_, i) => place(i, i === held));
    if (word) {
      const topBoxY = geo(0).y - visH / 2;
      word.style.top = Math.max(150, topBoxY - word.offsetHeight * .36) + 'px';
    }
    if (held >= 0) { const L = geo(held, true); setClaw(L.x, rodFor(L), L, false); } else idle();
  }
  addEventListener('resize', () => {
    stage.classList.add('snap'); layout();
    requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('snap')));
  });

  stage.classList.add('snap'); layout();
  requestAnimationFrame(() => requestAnimationFrame(() => stage.classList.remove('snap')));
})();