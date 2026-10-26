// HOW THE FORMULA WORKS: 화면은 고정된 채, 이 구간을 내려간 만큼 다섯 장 중 하나를 보여줌
// (0~1 구간을 다섯 칸으로 나눠 지금 칸의 장에 .on, 아래 진행 점도 같이)
(() => {
  const sec = document.getElementById('process');
  if (!sec) return;
  const steps = [...sec.querySelectorAll('.pr-step')];
  const dots = [...sec.querySelectorAll('.pr-dots li')];
  let cur = -1, raf = 0;
  function update() {
    raf = 0;
    const r = sec.getBoundingClientRect();
    const p = Math.min(0.999, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
    const i = Math.floor(p * steps.length);
    if (i === cur) return;
    cur = i;
    steps.forEach((s, k) => { s.classList.toggle('on', k === i); s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  }
  const ask = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  update();
})();
