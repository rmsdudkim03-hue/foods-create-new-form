// 맨 처음 화면 (피그마 '웹사이트 디자인 완성본' Frame 20): 어두운 화면에 속 빈 외곽선 로고(작게) + Every Day, a New Form
//  글자가 하나씩 떠오름 → 잠깐 머묾 → 로고가 커지며 속이 채워져 Frame 4(큰 흰 로고) 자리로 → 그다음부터 원래 모션(main.js)
//  main.js는 window.FORMULA_PRE(끝나면 풀리는 약속)를 기다렸다가 메뉴·로고 해독을 시작함
//  시간을 바꾸려면 아래 숫자만 고치면 됨
(() => {
  const IN_MS = 1300;     // 외곽선 글자 8개가 다 떠오르는 시간
  const HOLD_MS = 1100;   // 다 보인 뒤 머무는 시간
  const GROW_MS = 1100;   // 커지며 채워지는 시간
  const pre = document.getElementById('pre');
  const logo = document.getElementById('logo');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!pre || !logo || reduce || scrollY > 0) { pre?.remove(); window.FORMULA_PRE = Promise.resolve(); return; }

  const svg = pre.querySelector('.pre-logo');

  // 진짜 로고(Frame 4)의 글자 8개가 화면에서 차지하는 칸 (SVG 여백 없이 글자만)
  function glyphBox() {
    const rs = [...logo.querySelectorAll('.slot')].map((s) => s.getBoundingClientRect());
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    const r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    return { left: l, top: t, width: r - l, height: b - t };
  }

  document.documentElement.classList.add('pre-on');
  window.FORMULA_PRE = new Promise((done) => {
    requestAnimationFrame(() => pre.classList.add('in'));          // 글자·문구가 차례로 떠오름
    setTimeout(() => {
      // 커지기: 지금 자리 → 진짜 로고(Frame 4) 자리로 (화면 크기가 달라도 맞게, 실제 위치를 재서 옮김)
      const a = svg.getBoundingClientRect(), b = glyphBox();
      const k = b.width / a.width;
      const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      svg.style.transition = `transform ${GROW_MS}ms cubic-bezier(.65, 0, .25, 1)`;
      svg.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
      pre.classList.add('grow');                                  // 문구는 사라지고 속이 채워짐
      setTimeout(() => {
        document.documentElement.classList.remove('pre-on');
        pre.classList.add('done');                                // 진짜 로고와 같은 자리·모양이라 티 안 나게 바꿔 낌
        setTimeout(() => pre.remove(), 400);
        done();
      }, GROW_MS);
    }, IN_MS + HOLD_MS);
  });
})();
