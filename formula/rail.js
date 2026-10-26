// 구슬 사이드 바: 화면 오른쪽에 장면마다 구슬 하나
//  - 지나온 장면의 구슬은 채워지고(●), 구슬 사이 선이 스크롤을 따라 채워짐
//  - 구슬을 누르면 그 장면으로 이동, 마우스를 올리면 장면 이름
//  - 맨 위에 있을 때는 아래에 'SCROLL ↓' 안내 (조금 내리면 사라짐)
// 장면 정하는 법: <section data-rail="이름"> 을 붙이거나,
//   <body data-rail='[["이름", "#아이디", 0]]'> 처럼 직접 적음 (세 번째 값: 0 = 그 칸의 맨 위, 1 = 그 칸을 끝까지 내린 곳)
(() => {
  const spec = document.body.dataset.rail
    ? JSON.parse(document.body.dataset.rail)
    : [...document.querySelectorAll('[data-rail]')].map((el) => [el.dataset.rail, el, 0]);
  const items = spec.map(([label, el, at]) => ({ label, el: typeof el === 'string' ? document.querySelector(el) : el, at: at || 0 }))
    .filter((it) => it.el);
  if (items.length < 2) return;

  const rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', '장면 이동');
  const beads = [], fills = [];
  items.forEach((it, i) => {
    if (i) {
      const seg = document.createElement('i');
      seg.className = 'rail-seg';
      const f = document.createElement('i');
      seg.appendChild(f);
      rail.appendChild(seg);
      fills.push(f);
    }
    const b = document.createElement('button');
    b.className = 'rail-b';
    b.type = 'button';
    b.dataset.label = it.label;
    b.setAttribute('aria-label', it.label);
    b.addEventListener('click', () => scrollTo({ top: targetOf(it), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    rail.appendChild(b);
    beads.push(b);
  });
  const hint = document.createElement('p');
  hint.className = 'rail-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.innerHTML = '<b>SCROLL</b><svg viewBox="0 0 10 14" width="10" height="14"><path d="M5 0v12M1 8l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  rail.appendChild(hint);
  document.body.appendChild(rail);

  // 장면마다 도착하는 스크롤 위치
  function targetOf(it) {
    const top = it.el.getBoundingClientRect().top + scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    return Math.min(max, Math.max(0, top + it.at * (it.el.offsetHeight - innerHeight)));
  }
  let raf = 0;
  function update() {
    raf = 0;
    const y = scrollY + 2;
    const t = items.map(targetOf);
    // p = 지금 몇 번째 장면쯤인지 (0 ~ 장면 수-1, 사이 값은 다음 장면까지 간 정도)
    let p = 0;
    for (let i = 0; i < t.length - 1; i++) {
      if (y >= t[i + 1]) p = i + 1;
      else if (y > t[i]) { p = i + (y - t[i]) / Math.max(1, t[i + 1] - t[i]); break; }
      else break;
    }
    beads.forEach((b, i) => {
      b.classList.toggle('on', i <= Math.round(p));
      b.classList.toggle('cur', Math.round(p) === i);
    });
    fills.forEach((f, i) => { f.style.transform = `scaleY(${Math.min(1, Math.max(0, p - i)).toFixed(3)})`; });
    rail.classList.toggle('top', scrollY < 40);
  }
  const ask = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  update();
})();
