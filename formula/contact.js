// CONTACT: 들어오면 이름이 로고처럼 왼쪽부터 해독되고(text scramble), 괄호가 숨 쉬듯 한 번 벌어짐 → 연락처가 차례로 떠오름
const frame = document.querySelector('.c-frame');
const el = document.getElementById('name');
const TEXT = el.textContent;
const MS = 900;    // 해독에 걸리는 시간
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function decode() {
  if (reduce) { el.textContent = TEXT; return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / MS), fixed = Math.floor(p * TEXT.length);
    let html = '';
    for (let i = 0; i < TEXT.length; i++) {
      const c = TEXT[i];
      if (i < fixed || c === ' ') html += c;
      else html += `<span class="s">${GLYPHS[(Math.random() * GLYPHS.length) | 0]}</span>`;
    }
    el.innerHTML = html;
    if (p < 1) requestAnimationFrame(step); else el.textContent = TEXT;
  };
  requestAnimationFrame(step);
}

const breathe = () => document.querySelectorAll('.c-paren').forEach((p) => { p.classList.remove('breathe'); void p.getBoundingClientRect(); p.classList.add('breathe'); });

requestAnimationFrame(() => {
  frame.classList.add('in');
  decode();
  setTimeout(breathe, reduce ? 0 : 500);
});
// 이름에 마우스를 올리면 다시 해독
el.addEventListener('mouseenter', () => { decode(); breathe(); });

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const CHECK = /[?&]check\b/.test(location.search);   // 확인용(check.html에서 열 때): 2분 무조작이어도 첫 화면으로 안 돌아감
const wake = () => { if (CHECK) return; clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
