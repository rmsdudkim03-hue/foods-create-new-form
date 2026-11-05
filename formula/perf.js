// 가벼운 모드 (lite) — 오래된 컴퓨터(예: 2012년 아이맥 21.5", 그래픽 GT 640M·650M)에서도 부드럽게
//  모든 페이지 <head> 맨 앞에서 불러옴. 가벼운 모드면 <html class="lite"> + window.FORMULA_LITE = true
//  가벼운 모드에서 달라지는 것
//   - 3D 조형: 그림자 해상도를 낮추고(2048→1024) 흐린 그림자 방식을 가벼운 것으로, 유약·광택 겹(clearcoat·sheen) 없이,
//     화면 배율 1배로 그림. 페이지를 열자마자 미리 불러오지 않고 조형 화면이 가까워질 때만 (hover3d.js)
//   - 갤러리 크게 보기: 뒤 배경 흐림(blur) 대신 반투명 흰 막 (style.css .lite)
//  정하는 법 (위에서부터 먼저 맞는 것)
//   1. 주소에 ?lite 또는 ?full → 그대로 쓰고 이 기기에 기억 (다음부터 주소 없이도 같음). ?auto 는 기억한 것 지움
//   2. 그래픽 칩 이름이 오래된 것(2012~2014년쯤 맥 그래픽) 이거나, 3D(WebGL)를 못 쓰면 → 가벼운 모드
//   3. 그 밖에는 원래 모드
(() => {
  const html = document.documentElement;
  const q = location.search;
  let mode = null;
  try {
    if (/[?&]lite\b/.test(q)) localStorage.setItem('formula-lite', '1');
    else if (/[?&]full\b/.test(q)) localStorage.setItem('formula-lite', '0');
    else if (/[?&]auto\b/.test(q)) localStorage.removeItem('formula-lite');
    mode = localStorage.getItem('formula-lite');
  } catch (e) { /* 저장 못 하는 브라우저면 주소만 봄 */ }
  if (mode == null && /[?&]lite\b/.test(q)) mode = '1';
  if (mode == null && /[?&]full\b/.test(q)) mode = '0';
  let lite = mode === '1';
  if (mode == null) {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) lite = true;
      else {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
        // 2012~2014년쯤 맥에 들어간 그래픽 (아이맥 2012: GT 640M·650M·GTX 660M·675MX·680MX / 맥북·맥미니: Intel HD 3000·4000·5000 등)
        if (/GeForce (GT|GTX) ?[3-7]\d\dM|GeForce (GT|GTX) ?6[0-9]0MX|GTX 6[78]0MX|Intel\(R\)? HD Graphics( [2-5]\d{3})?\b|Iris( Pro)?( Graphics)? ?5[12]00|Radeon HD [2-6]\d{3}/i.test(gpu)) lite = true;
        // 사파리는 그래픽 칩 이름을 숨김 → 레티나가 아닌 맥 + 코어 4개 이하(예: 2012년 아이맥 21.5")면 가벼운 모드
        if (!lite && /Mac/.test(navigator.platform) && devicePixelRatio < 1.5 && (navigator.hardwareConcurrency || 4) <= 4) lite = true;
        gl.getExtension('WEBGL_lose_context')?.loseContext();   // 검사용 3D 무대는 바로 반납
      }
    } catch (e) { lite = true; }
  }
  window.FORMULA_LITE = lite;
  if (lite) html.classList.add('lite');
})();

// 처음 화면으로 돌아가는 키 — H (한글 자판 'ㅗ'도 같은 자리라 됨). 모든 페이지에서
//  메인 페이지면 1분 무조작 때와 똑같이 시작 그림부터 다시(main.js goHome), 다른 페이지면 메인으로 이동
//  키를 바꾸려면 HOME_KEY만 고치면 됨 (예: 'KeyR' = R, 'Home' = Home 키)
(() => {
  const HOME_KEY = 'KeyH';
  addEventListener('keydown', (e) => {
    if (e.code !== HOME_KEY || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;   // 글 쓰는 칸에선 무시
    e.preventDefault(); e.stopImmediatePropagation();      // 다른 키 반응(시작 그림 닫기 등)은 안 함
    if (window.FORMULA_GO_HOME) window.FORMULA_GO_HOME();
    else location.href = new URL('./', location.href).href;
  }, true);
})();
