// ABOUT: 들어오면 제목 LOGO가 로고처럼 해독되고, 격자의 빈 원이 무작위로 찍힌 뒤 기준선 → 로고 글자 순서로 나타남
const frame = document.querySelector('.ab-frame');
const title = document.getElementById('title');
const TEXT = title.textContent;
const MS = 700;    // 해독에 걸리는 시간
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 빈 원: 0~1.1초 사이 무작위 순서로 (QR 코드가 찍히듯)
document.querySelectorAll('.ab-grid circle').forEach((c) => c.style.setProperty('--d', (Math.random() * 1.1).toFixed(2) + 's'));
// 기준선: 길이를 1로 맞춰 그어지는 효과
document.querySelectorAll('.ab-lines path').forEach((p) => p.setAttribute('pathLength', '1'));

function decode() {
  if (reduce) { title.textContent = TEXT; return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / MS), fixed = Math.floor(p * TEXT.length);
    let html = '';
    for (let i = 0; i < TEXT.length; i++) html += i < fixed ? TEXT[i] : `<span class="s">${GLYPHS[(Math.random() * GLYPHS.length) | 0]}</span>`;
    title.innerHTML = html;
    if (p < 1) requestAnimationFrame(step); else title.textContent = TEXT;
  };
  requestAnimationFrame(step);
}

requestAnimationFrame(() => requestAnimationFrame(() => { frame.classList.add('in'); decode(); }));
title.addEventListener('mouseenter', decode);

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const CHECK = /[?&]check\b/.test(location.search);   // 확인용(check.html에서 열 때): 2분 무조작이어도 첫 화면으로 안 돌아감
const wake = () => { if (CHECK) return; clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
