// 모션이 끝날 때까지 아래로 스크롤 못 하게 잠그는 장치 (main.js·overview.js가 씀)
//   FORMULA_LOCK.hold('이름', y)  → 화면을 y 위치에 붙잡음 (아래로 내리는 휠·터치·키 막음, 위로는 됨)
//   FORMULA_LOCK.release('이름')  → 풀어 줌 (모든 잠금이 풀려야 다시 내려감)
(() => {
  const CHECK = /[?&]check\b/.test(location.search);   // 확인용(check.html): 스크롤을 잠그지 않음
  const holds = new Map();
  const limit = () => Math.min(...holds.values());
  const locked = () => holds.size > 0;
  window.FORMULA_LOCK = {
    hold(key, y = scrollY) { if (CHECK) return; holds.set(key, Math.max(0, Math.round(y))); },   // 확인용이면 잠그지 않음
    release(key) { holds.delete(key); },
    clear() { holds.clear(); },
    get locked() { return locked(); },
  };
  // 휠: 아래로만 막음
  addEventListener('wheel', (e) => { if (locked() && e.deltaY > 0) e.preventDefault(); }, { passive: false });
  // 터치: 손가락을 위로 밀면(= 아래로 내려감) 막음
  let ty = 0;
  addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => { if (locked() && e.touches[0].clientY < ty) e.preventDefault(); }, { passive: false });
  // 키보드: 아래로 가는 키
  const DOWN = new Set(['ArrowDown', 'PageDown', 'End', ' ', 'Spacebar']);
  addEventListener('keydown', (e) => { if (locked() && DOWN.has(e.key)) e.preventDefault(); });
  // 스크롤 막대를 끌거나 관성으로 넘어가면 다시 붙잡은 자리로
  addEventListener('scroll', () => { if (locked() && scrollY > limit() + 2) scrollTo({ top: limit(), behavior: 'instant' }); }, { passive: true });
})();
