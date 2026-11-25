(() => {
  const stage = document.getElementById('stage');
  const claw = document.getElementById('claw');
  const boxes = [...document.querySelectorAll('.box')];
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  // Pile layout: [x, y, rotateX, rotateY, rotateZ] (fractions of the stage)
  const DESK = [[.48,.66,-14,-24,6],[.13,.86,-16,28,16],[.36,.90,-12,-20,-10],[.60,.88,-14,24,12],
                [.86,.86,-16,-30,-14],[.25,.68,-14,30,-12],[.73,.68,-14,-26,16]];
  const PHONE = [[.50,.64],[.17,.91],[.50,.93],[.84,.90],[.20,.77],[.52,.79],[.82,.76]];

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
    // Clicking inside the content never triggers the container button
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

  let sw, sh, ph, W, H, DP, held = -1, busy = false, next = null;

  function measure() {
    sw = stage.clientWidth; sh = stage.clientHeight; ph = innerWidth <= 700;
    W = ph ? Math.min(170, sw * .38) : Math.min(310, Math.max(200, sw * .2));
    H = W * (ph ? .6 : .43); DP = W * (ph ? .56 : .4);
  }
  function geo(i, lift) {
    if (lift) {
      if (boxes[i].classList.contains('wide')) {
        if (ph) {
          const w = sw - 28;
          const h = Math.min(540, sh * .70);
          const d = w * .34;
          return { w, h, d, x: sw / 2, y: 86 + h / 2 + d * .12, t: 'translateZ(100px) rotateX(-5deg) rotateY(-6deg) rotateZ(0deg)' };
        }
        const w = Math.min(1120, sw * .76);
        const h = Math.min(630, sh * .73);
        const d = Math.min(210, w * .20);
        return { w, h, d, x: sw / 2, y: 92 + h / 2 + d * .12, t: 'translateZ(110px) rotateX(-6deg) rotateY(-9deg) rotateZ(0deg)' };
      }
      // Enlarged compact size for short-content containers (01, 03, 05, 07)
      const S = ph ? Math.min(2.4, (sw - 28) / W) : Math.min(2.35, (sw - 96) / W);
      const w = W * S, h = H * S, d = DP * S;
      return { w, h, d, x: sw / 2, y: 112 + h / 2 + d * .12, t: 'translateZ(110px) rotateX(-6deg) rotateY(-9deg) rotateZ(0deg)' };
    }
    const r = DESK[i], p = ph ? PHONE[i] : r;
    return { w: W, h: H, d: DP, x: p[0] * sw, y: p[1] * sh, t: `translateZ(0px) rotateX(${r[2]}deg) rotateY(${r[3]}deg) rotateZ(${r[4]}deg)` };
  }
  function place(i, lift) {
    const s = boxes[i].style, g = geo(i, lift);
    s.left = g.x + 'px'; s.top = g.y + 'px';
    s.setProperty('--w', g.w + 'px'); s.setProperty('--h', g.h + 'px'); s.setProperty('--d', g.d + 'px');
    s.transform = 'translate(-50%,-50%) ' + g.t;
    s.zIndex = lift ? 60 : 1 + Math.round(g.y / sh * 50);
  }
  const cTop = g => g.y - g.h / 2 - g.d * .12;
  const rodFor = g => Math.max(14, cTop(g) - 95);
  function setClaw(x, rod, g, open) {
    claw.style.left = x + 'px';
    claw.style.setProperty('--rod', rod + 'px');
    claw.style.setProperty('--half', (g.w * 1.06 / 2) + 'px');
    claw.style.setProperty('--fh', Math.min(180, g.h * .55) + 'px');
    claw.classList.toggle('open', open);
  }
  const idle = () => setClaw(sw / 2, 40, geo(0), true);
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

  // Close doors, lower the held box into the pile, release it
  async function putBack() {
    const h = held, g = geo(h);
    T(.65); setOpen(h, false); await sleep(670);
    T(.85); place(h, false); setClaw(g.x, rodFor(g), g, false); await sleep(870);
    setClaw(g.x, rodFor(g), g, true); await sleep(260); // fingers open = release
    boxes[h].classList.remove('lifted'); held = -1;
  }

  // i = container index, or -1 to just put back and park
  async function run(i) {
    const prev = held;
    if (prev >= 0) await putBack();
    // Re-click on the open box, or a plain "put back" request: park and stop
    if (i === -1 || i === prev) { T(.75); idle(); await sleep(770); return; }

    const g = geo(i);
    // 2. travel along the rail
    T(.75); setClaw(g.x, 40, g, true); await sleep(770);
    // 3. drop
    T(.56); setClaw(g.x, rodFor(g), g, true); await sleep(580);
    // 4. grip
    T(.24); setClaw(g.x, rodFor(g), g, false); await sleep(260);
    // 5. lift to top centre
    const L = geo(i, true);
    T(.95); boxes[i].classList.add('lifted'); place(i, true); setClaw(L.x, rodFor(L), L, false); await sleep(970);
    // 6. doors open
    held = i; setOpen(i, true); await sleep(780);
    // 7. focus the heading
    boxes[i].querySelector('h2').focus({ preventScroll: true });
  }

  // Clicks during a sequence are queued; the latest one runs next
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
  // Logo click: put the open container back (no new pick)
  document.querySelector('.logo').addEventListener('click', e => { e.preventDefault(); if (held >= 0) req(-1); });

  // Backdrop click: anything on the stage that isn't a container
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