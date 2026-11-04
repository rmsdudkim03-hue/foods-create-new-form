// 시작 화면 (피그마 '웹사이트 디자인 완성본' Frame 28): 어두운 화면 가운데 그림 한 장.
//  마우스를 움직이거나 누르면(휠·키보드·터치도) 그림이 사라지고 → 맨 처음 로고 화면(pre.js)부터 시작
//  pre.js는 window.FORMULA_ATTRACT(시작 화면이 닫히면 풀리는 약속)를 기다림
//  2분 동안 아무도 안 만지면 main.js가 다시 이 화면을 띄움 (FORMULA_ATTRACT_SHOW)
//  그림 파일은 formula/start.jpg — 파일이 없으면 이 화면은 건너뜀
(() => {
  const el = document.getElementById('attract');
  const html = document.documentElement;
  const skip = !el || scrollY > 0 || /[?&]check\b/.test(location.search) || location.hash;   // 확인용·주소에 #장면이 있으면 건너뜀
  if (skip) { el?.remove(); window.FORMULA_ATTRACT = Promise.resolve(); return; }
  const img = el.querySelector('img');
  let ok = true, visible = false, cleanup = null;
  const MOVE_PX = 8;      // 이만큼 이상 움직여야 '움직임'으로 봄 (책상 진동 등은 무시)
  const SETTLE_MS = 500;  // 화면이 뜬 직후의 움직임은 무시

  function hide() {
    visible = false;
    el.classList.add('off');
    html.classList.remove('attract-on');
    setTimeout(() => { if (!visible) el.hidden = true; }, 700);
  }
  function show(onDone) {
    visible = true;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.remove('off');
    html.classList.add('attract-on');
    const t0 = performance.now();
    let sx = null, sy = null;
    const go = (e) => {
      if (performance.now() - t0 < SETTLE_MS) return;
      if (e.type === 'pointermove') {
        if (sx == null) { sx = e.clientX; sy = e.clientY; return; }
        if (Math.hypot(e.clientX - sx, e.clientY - sy) < MOVE_PX) return;
      }
      cleanup(); hide(); onDone && onDone();
    };
    const evs = ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'];
    evs.forEach((ev) => addEventListener(ev, go, { passive: true }));
    cleanup = () => evs.forEach((ev) => removeEventListener(ev, go));
  }

  window.FORMULA_ATTRACT = new Promise((done) => {
    const fail = () => { ok = false; if (cleanup) cleanup(); hide(); el.hidden = true; done(); };
    img.addEventListener('error', fail, { once: true });
    if (img.complete && img.naturalWidth === 0) { fail(); return; }
    show(done);
  });
  window.FORMULA_ATTRACT_SHOW = (onDone) => { if (!ok) return false; if (!visible) show(onDone); return true; };
  window.FORMULA_ATTRACT_VISIBLE = () => visible;
})();
