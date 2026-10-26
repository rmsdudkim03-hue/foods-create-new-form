// HOW THE FORMULA WORKS: 화면은 고정된 채, 이 구간을 내려간 만큼 다섯 장 중 하나를 보여줌
// (0~1 구간을 다섯 칸으로 나눠 지금 칸의 장에 .on, 아래 진행 점도 같이)
// 휙 내려도 장을 건너뛰지 않게: 다음 장으로 넘어가면 그 장의 첫 자리에 맞추고 HOLD_MS 동안 잡아 둠 (lock.js)
(() => {
  const sec = document.getElementById('process');
  if (!sec) return;
  const HOLD_MS = 1100;   // 한 장을 보여주는 최소 시간
  const steps = [...sec.querySelectorAll('.pr-step')];
  const parens = [...sec.querySelectorAll('.pr-paren')];
  const title = sec.querySelector('.pr-title');
  const TITLE = title.textContent;
  const TITLE_MS = 900;   // 제목 해독에 걸리는 시간 (첫 장을 잡아 두는 HOLD_MS 안에 끝나게)
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz()';
  const dots = [...sec.querySelectorAll('.pr-dots li')];
  const LOCK = window.FORMULA_LOCK;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = -1, raf = 0, timer = 0, wasInside = false;
  const span = () => Math.max(1, sec.offsetHeight - innerHeight);
  // 괄호 ( ) 가 숨 쉬듯 양옆으로 벌어졌다 오므라듦 — 장이 바뀔 때마다
  function breathe() {
    if (reduce) return;
    parens.forEach((p) => { p.classList.remove('breathe'); void p.getBoundingClientRect(); p.classList.add('breathe'); });
  }
  // 제목 'How the Formula Works' 해독: 로고처럼 무작위 글자가 왼쪽부터 제자리를 찾음 (구간에 들어올 때마다)
  let titleRun = 0;
  function decodeTitle() {
    const run = ++titleRun;
    title.classList.add('in');
    if (reduce) { title.textContent = TITLE; return; }
    const start = performance.now();
    let frame = 0;
    (function tick(now) {
      if (run !== titleRun) return;
      const k = (now - start) / TITLE_MS;
      if (frame++ % 3 === 0 || k >= 1) {
        title.textContent = [...TITLE].map((ch, i) => (ch === ' ' || i < k * TITLE.length ? ch : GLYPHS[Math.random() * GLYPHS.length | 0])).join('');
      }
      if (k < 1) requestAnimationFrame(tick); else title.textContent = TITLE;
    })(start);
  }
  function show(i) {
    if (i !== cur) breathe();
    cur = i;
    steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }
  function update() {
    raf = 0;
    const r = sec.getBoundingClientRect();
    const p = Math.min(0.999, Math.max(0, -r.top / span()));
    let i = Math.floor(p * steps.length);
    const inside = r.top <= 1 && r.bottom >= innerHeight - 1;
    const entered = inside && !wasInside && r.top > -innerHeight;   // 위에서 막 들어옴 → 첫 장에서 잠깐 멈춤
    wasInside = inside;
    if (entered && cur <= 0) i = 0;
    if (entered) decodeTitle();
    if (r.top > innerHeight * 0.5 && title.classList.contains('in')) { titleRun++; title.classList.remove('in'); title.textContent = TITLE; cur = -1; }   // 위로 벗어나면 다음에 다시
    if (i === cur && !entered) return;
    if (cur >= 0 && i > cur + 1 && inside) i = cur + 1;          // 한 번에 한 장씩만
    show(i);
    if (LOCK && !reduce && inside && (i > 0 || entered)) {
      const y = sec.offsetTop + span() * (i / steps.length) + 2;  // 이 장의 첫 자리
      scrollTo({ top: y, behavior: 'instant' });
      LOCK.hold('process', y);
      clearTimeout(timer);
      timer = setTimeout(() => LOCK.release('process'), HOLD_MS);
    }
  }
  const ask = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  update();
})();
