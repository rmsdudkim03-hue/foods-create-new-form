// 맨 처음 이미지 흐름 (로고 전): 음식 사진 카드가 위에서 흩어지며 날아와 → 가운데에 세로 한 줄로 쌓이고
//  → 맨 위 카드가 흐릿하게 확 커지며 화면 아래로 자리 잡고(나머지는 아래로 빠짐) → 화면이 걷히며 로고 해독 시작
//  사진은 foods.js의 FOODS photos. 아직 없으면 음식 이름 + 특징 구슬 카드로 대신
//  누르거나 휠·키를 쓰면 바로 넘어감. main.js가 FORMULA_PRELUDE.play(끝나면 할 일)로 부름
(() => {
  const el = document.getElementById('prelude');
  const FOODS = window.FOODS || [];
  const COUNT = 5;          // 쌓이는 카드 수
  const CW = 120, CH = 150, GAP = 12;   // 카드 크기·간격 (피그마 1920 기준 px)
  const BIG_W = 760, BIG_TOP = 610;      // 마지막에 커진 카드 폭, 화면 위에서 카드 윗변까지
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (v) => String(v).padStart(2, '0');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 카드 후보: 음식 16개 (N번호 · A/B), 매번 섞어서 COUNT장
  const pool = FOODS.flatMap((f, i) => [0, 1].map((k) => ({ no: i + 1, side: k ? 'B' : 'A', name: f.foods[k], photo: f.photos[k] })));
  function cardHTML(c) {
    return c.photo
      ? `<img src="${esc(c.photo)}" alt="" draggable="false">`
      : `<span class="pl-no">N ${pad(c.no)} · ${c.side}</span><img class="pl-bead" src="archive/${pad(c.no)}/${c.side}1.svg" alt="" draggable="false"><span class="pl-name">${esc(c.name)}</span>`;
  }

  let running = null;
  function play(done) {
    if (!el || reduce || !pool.length) { if (el) el.hidden = true; done(); return; }
    stop();
    const u = Math.min(innerWidth / 1920, innerHeight / 1080);
    const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, COUNT);
    el.hidden = false; el.style.opacity = 1; el.innerHTML = '';
    const total = COUNT * CH + (COUNT - 1) * GAP;
    const cards = picks.map((c, i) => {
      const d = document.createElement('div');
      d.className = 'pl-card';
      d.style.width = CW * u + 'px'; d.style.height = CH * u + 'px';
      d.innerHTML = cardHTML(c);
      el.appendChild(d);
      return { d, y: (-total / 2 + CH / 2 + i * (CH + GAP)) * u };
    });
    const anims = [];
    const run = (d, kf, opt) => { const a = d.animate(kf, { fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...opt }); anims.push(a); return a; };

    // 1) 위에서 흩어지며 날아와 한 줄로 (카드마다 조금씩 늦게)
    cards.forEach(({ d, y }, i) => {
      const x0 = (260 + Math.random() * 360) * u, y0 = (-700 - Math.random() * 300) * u, r0 = (Math.random() * 2 - 1) * 55;
      run(d, [
        { transform: `translate(${x0}px, ${y0}px) rotate(${r0}deg) scale(.55)`, opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: `translate(0px, ${y}px) rotate(0deg) scale(1)`, opacity: 1 },
      ], { duration: 1100, delay: 150 + i * 120 });
    });
    const t1 = 150 + (COUNT - 1) * 120 + 1100 + 650;   // 다 쌓이고 잠깐 멈춘 뒤
    // 2) 맨 위 카드가 확 커지며 아래로, 나머지는 아래로 빠짐
    const S = BIG_W / CW, bigY = (BIG_TOP + CH * S / 2 - 540) * u;
    run(cards[0].d, [
      { transform: `translate(0px, ${cards[0].y}px) scale(1)`, filter: 'blur(0px)' },
      { filter: `blur(${10 * u + 4}px)`, offset: 0.45 },
      { transform: `translate(0px, ${bigY}px) scale(${S})`, filter: 'blur(0px)' },
    ], { duration: 1300, delay: t1, easing: 'cubic-bezier(.7,0,.2,1)' });
    cards.slice(1).forEach(({ d, y }, i) => run(d, [
      { transform: `translate(0px, ${y}px)`, opacity: 1 },
      { transform: `translate(0px, ${y + 1200 * u}px)`, opacity: 0 },
    ], { duration: 900, delay: t1 + 60 + i * 50, easing: 'cubic-bezier(.6,0,.4,1)' }));
    // 3) 화면이 걷히며 다음(로고)으로
    const t2 = t1 + 1300 + 500;
    const fade = run(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: t2, easing: 'ease' });
    running = { anims, done, called: false, timer: setTimeout(callDone, t2) };   // 걷히기 시작할 때 로고 해독도 시작 (완성된 로고가 먼저 보이지 않게)
    fade.finished.then(finish, () => {});
    // 손대면 바로 넘어감
    addEventListener('pointerdown', skip, { once: true });
    addEventListener('wheel', skip, { once: true, passive: true });
    addEventListener('keydown', skip, { once: true });
  }
  function callDone() {
    if (!running || running.called) return;
    running.called = true;
    running.done();
  }
  function finish() {
    if (!running) return;
    callDone();
    stop();
    el.hidden = true;
  }
  function skip() {
    if (!running) return;
    running.anims.forEach((a) => a.cancel());
    callDone();
    el.animate([{ opacity: el.style.opacity || 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).finished.then(finish);
  }
  function stop() {
    removeEventListener('pointerdown', skip); removeEventListener('wheel', skip); removeEventListener('keydown', skip);
    if (running) { clearTimeout(running.timer); running.anims.forEach((a) => a.cancel()); }
    running = null;
  }
  window.FORMULA_PRELUDE = { play };
})();
