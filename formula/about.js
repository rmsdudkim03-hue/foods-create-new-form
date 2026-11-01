// ABOUT: 들어오면 제목 LOGO가 로고처럼 해독되고, 격자의 빈 원이 무작위로 찍힌 뒤 기준선 → 로고 글자 순서로 나타남
const frame = document.querySelector('.ab-frame');
const title = document.getElementById('title');
const MS = 700;    // 해독에 걸리는 시간
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 빈 원: 0~1.1초 사이 무작위 순서로 (QR 코드가 찍히듯)
document.querySelectorAll('.ab-grid circle').forEach((c) => c.style.setProperty('--d', (Math.random() * 1.1).toFixed(2) + 's'));
// 기준선: 길이를 1로 맞춰 그어지는 효과
document.querySelectorAll('.ab-lines path').forEach((p) => p.setAttribute('pathLength', '1'));

function decode(el) {
  const TEXT = el.dataset.text || (el.dataset.text = el.textContent);
  if (reduce) { el.textContent = TEXT; return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / MS), fixed = Math.floor(p * TEXT.length);
    let html = '';
    for (let i = 0; i < TEXT.length; i++) html += i < fixed ? TEXT[i] : `<span class="s">${GLYPHS[(Math.random() * GLYPHS.length) | 0]}</span>`;
    el.innerHTML = html;
    if (p < 1) requestAnimationFrame(step); else el.textContent = TEXT;
  };
  requestAnimationFrame(step);
}

requestAnimationFrame(() => requestAnimationFrame(() => { frame.classList.add('in'); decode(title); }));
title.addEventListener('mouseenter', () => decode(title));

// ── ICON: 흐르는 띠 ──
// 아이콘 80개(조형 N01~N08 × A1~A5·B1~B5)를 세 줄에 번갈아 나눔. 끊김 없이 돌도록 줄마다 같은 목록을 두 번 이어 붙임
const pad = (n) => String(n).padStart(2, '0');
const SLOTS = ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5'];
const all = [];
(window.FOODS || []).forEach((f, i) => SLOTS.forEach((s, k) => all.push({ src: `archive/${pad(i + 1)}/${s}.svg`, name: f.names[k] || '' })));
const rows = [...document.querySelectorAll('.ic-row')];
rows.forEach((row, r) => {
  const list = all.filter((_, i) => i % rows.length === r);
  const html = list.map((ic) => `<span class="ic" tabindex="0" aria-label="${ic.name}"><i style="--src:url('${ic.src}')"></i><span>${ic.name}</span></span>`).join('');
  row.innerHTML = `<div class="ic-track">${html}${html.replace(/tabindex="0"/g, 'tabindex="-1" aria-hidden="true"')}</div>`;
});
// 화면에 들어오면 띠가 떠오르고 제목 ICON이 해독됨
const icons = document.querySelector('.ab-icons');
const iconTitle = document.getElementById('icon-title');
if (icons && 'IntersectionObserver' in window) {
  new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !icons.classList.contains('in')) { icons.classList.add('in'); decode(iconTitle); } }), { threshold: 0.4 }).observe(icons);
} else if (icons) icons.classList.add('in');
iconTitle && iconTitle.addEventListener('mouseenter', () => decode(iconTitle));

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const CHECK = /[?&]check\b/.test(location.search);   // 확인용(check.html에서 열 때): 2분 무조작이어도 첫 화면으로 안 돌아감
const wake = () => { if (CHECK) return; clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
