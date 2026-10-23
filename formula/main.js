// FORMULA 모션
//  1) 첫 화면: 로고 글자 해독(text scramble) + 괄호 깜빡임, 메뉴 글자 솟아오르기
//  2) 스크롤하면 (화면은 고정된 채 장면만 바뀜)
//     검정 → 흰 화면 전환: 칸마다 구슬이 무작위로 찍히고(QR처럼) → 대각선 물결을 따라 칸이 괄호 ( ) 모양으로 벌어지며 흰색으로
//                         로고 글자·메뉴도 물결이 지나갈 때 가로로 한 번 뒤집히며 진한 색으로
//     괄호 ( ) 가 속이 빈 외곽선이 되며 넓어짐 → 로고가 작아지며 위로, 소개글이 떠오름
//  3) 조형 8개: 화면에 들어오면 차례로 떠오름 (3D 바뀜은 hover3d.js)

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// 스크롤 장면: 스크롤이 이 지점(전체 진행도 0~1)을 지나면 그 장면이 정해진 시간 동안 끝까지 재생됨
// (스크롤을 빨리 내려도 장면이 건너뛰지 않고 차례로, 위로 올리면 거꾸로)
const SCENES = [
  { at: 0.03, ms: 2400 },   // 1. 검정 → 흰 화면 전환
  { at: 0.30, ms: 1100 },   // 2. 괄호가 외곽선이 되며 넓어짐
  { at: 0.55, ms: 1300 },   // 3. 로고가 작아지며 위로 + 소개글
];
const TEXT_AT = 2.5;      // 3번 장면이 절반쯤 지나면 소개글이 떠오름
const PAREN_GAP = 26.1;   // 괄호가 넓어지는 만큼 (로고 SVG 단위. 피그마 Frame 5에서 42px)
const SMALL = 0.585;      // 작아진 로고 크기 (피그마 Frame 6 로고 폭 648px)
const SMALL_Y = -93;      // 작아진 로고가 올라가는 만큼 (피그마 px)

const DARK = [0x1e, 0x1d, 0x1b], PAPER = [0xfa, 0xfa, 0xf8];
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// ── 로고: 글자 해독 ──
const LOGO_MS = 1400;      // 다 맞춰지는 데 걸리는 시간
const SWAP_EVERY = 3;      // 몇 프레임마다 무작위 글자를 바꿀지 (1이면 매 프레임, 클수록 느리게)
const logo = document.getElementById('logo');
const slots = [...logo.querySelectorAll('.slot')];
const glyphs = [...logo.querySelectorAll('.glyph')];
const sides = [...logo.querySelectorAll('.side')];
const KEYS = slots.map((s) => s.dataset.k);
// 글자마다 원래 칸 크기 (무작위 글자를 넣을 때 그 글자 크기로 보여주기 위해)
const BOX = Object.fromEntries(slots.map((s) => [s.dataset.k, s.getAttribute('viewBox')]));

function show(slot, k, scrambled) {
  const use = slot.firstElementChild;
  if (use.getAttribute('href') !== `#g-${k}`) {
    use.setAttribute('href', `#g-${k}`);
    slot.setAttribute('viewBox', BOX[k]);
  }
  slot.classList.toggle('r', scrambled);
}

let logoRun = 0;
function scrambleLogo() {
  if (reduce || cur > 0) return;   // 첫 화면에서만
  const run = ++logoRun;
  logo.classList.remove('done');     // 섞이는 동안은 깜빡임 멈춤
  const start = performance.now();
  let frame = 0;
  (function tick(now) {
    if (run !== logoRun) return;
    const k = (now - start) / LOGO_MS;
    const swap = frame++ % SWAP_EVERY === 0;
    slots.forEach((slot, i) => {
      if (i < k * slots.length) show(slot, slot.dataset.k, false);
      else if (swap) {
        // 자기 글자 말고 다른 글자 하나를 골라 넣음
        let r;
        do r = KEYS[Math.random() * KEYS.length | 0]; while (r === slot.dataset.k && KEYS.length > 1);
        show(slot, r, true);
      }
    });
    if (k < 1.05 && cur <= 0) requestAnimationFrame(tick);
    else {
      slots.forEach((s) => show(s, s.dataset.k, false));
      logo.classList.add('done');      // 다 맞춰지면 괄호 깜빡임 시작
    }
  })(start);
}

// ── 메뉴: 글자 솟아오르기 ──
// 글자마다 span을 씌우고 순서대로 조금씩 늦게(transition-delay) 올라오게 함
const CHAR_DELAY = 30;     // 글자 사이 간격(ms)
const ITEM_DELAY = 90;     // 메뉴 항목 사이 간격(ms) — 처음 열릴 때 왼쪽 위부터 차례로
const navItems = [...document.querySelectorAll('.nav a')];
function splitChars(el, cls, delay, start = 0) {
  let i = 0;
  const text = el.textContent;
  el.innerHTML = text.split('\n').map((line) => `<span class="line" aria-hidden="true">${
    [...line].map((c) => (c === ' ' ? ' ' : `<span class="${cls}" style="transition-delay:${start + (i++) * delay}ms">${c}</span>`)).join('')
  }</span>`).join('');
  return text;
}
navItems.forEach((a) => a.setAttribute('aria-label', splitChars(a, 'ch', CHAR_DELAY).replace(/\n/g, ' ')));
function rise(a) {
  a.classList.add('reset');          // 움직임 없이
  a.classList.remove('on');          // 글자를 아래(가려진 곳)로 내려놓고
  void a.offsetWidth;
  a.classList.remove('reset');
  requestAnimationFrame(() => a.classList.add('on'));   // 다시 솟아오르게
}
// 처음 열릴 때 차례로 + 마우스를 올리면 그 메뉴만 다시
navItems.forEach((a, n) => {
  setTimeout(() => rise(a), 150 + n * ITEM_DELAY);
  a.addEventListener('mouseenter', () => rise(a));
  a.addEventListener('focus', () => rise(a));
});

// ── 소개글: 글자·줄마다 조금씩 늦게 떠오르게 ──
const intro = document.querySelector('.intro');
const tagline = intro.querySelector('.tagline');
tagline.setAttribute('aria-label', tagline.textContent);
tagline.innerHTML = [...tagline.textContent].map((c, i) => `<span class="ch" aria-hidden="true" style="transition-delay:${i * 28}ms">${c}</span>`).join('');
intro.querySelectorAll('.ko .ln').forEach((l, i) => { l.style.transitionDelay = `${420 + i * 90}ms`; });
intro.querySelectorAll('.en .ln').forEach((l, i) => { l.style.transitionDelay = `${820 + i * 90}ms`; });

// ── 검정 → 흰 화면 전환 (캔버스) ──
// 화면을 칸으로 나눔. 1) 몇몇 칸에 흰 구슬이 무작위 순서로 찍혀 QR 같은 무늬가 되고
// 2) 왼쪽 위에서 오른쪽 아래로 물결이 지나가며 칸마다 괄호 ( ) 모양(세로로 긴 렌즈)으로 벌어져 칸을 흰색으로 채움
const COLS = 32;           // 가로 칸 수 (세로는 화면 비율에 맞춰)
const ON_RATE = 0.42;      // 처음에 구슬이 찍히는 칸 비율
const FILL_END = 0.34;     // 전환 구간 중 구슬이 다 찍히는 지점 (0~1)
const WAVE_START = 0.40;   // 물결이 시작되는 지점
const WAVE_SPAN = 0.44;    // 물결이 화면을 가로지르는 데 걸리는 길이
const FLIP = 0.14;         // 칸 하나가 다 벌어지는 데 걸리는 길이
const canvas = document.getElementById('wipe');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, cell = 0, cells = [];
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const waveAt = (x, y) => WAVE_START + ((x / W + y / H) / 2) * WAVE_SPAN;   // 화면 위치 → 물결이 지나가는 시점

function layoutWipe() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = W / COLS;
  const rows = Math.ceil(H / cell);
  seed = 7;
  cells = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < COLS; i++) {
    const x = i * cell, y = j * cell;
    cells.push({ x, y, on: rand() < ON_RATE, fillAt: rand() * (FILL_END - 0.05), flipAt: waveAt(x + cell / 2, y + cell / 2) + rand() * 0.04 });
  }
  // 로고 글자·메뉴가 물결을 만나는 시점
  glyphs.forEach((g) => { const r = g.getBoundingClientRect(); g._at = waveAt(r.left + r.width / 2, r.top + r.height / 2); });
  navItems.forEach((a) => { const r = a.getBoundingClientRect(); a._at = waveAt(r.left + r.width / 2, r.top + r.height / 2); });
  lastWipe = -1;
}

let lastWipe = -1;
function drawWipe(t) {
  if (t === lastWipe) return;
  lastWipe = t;
  ctx.fillStyle = rgb(t >= 1 ? PAPER : DARK);
  ctx.fillRect(0, 0, W, H);
  if (t <= 0 || t >= 1) return;
  ctx.fillStyle = rgb(PAPER);
  for (const c of cells) {
    const e = clamp((t - c.flipAt) / FLIP);
    if (e >= 1) { ctx.fillRect(c.x - 0.3, c.y - 0.3, cell + 0.6, cell + 0.6); continue; }
    const r0 = c.on ? cell * 0.3 * easeOut(clamp((t - c.fillAt) / 0.05)) : 0;   // 찍힌 구슬 크기
    if (e <= 0) {
      if (r0 > 0.2) { ctx.beginPath(); ctx.arc(c.x + cell / 2, c.y + cell / 2, r0, 0, Math.PI * 2); ctx.fill(); }
      continue;
    }
    // 구슬이 위아래로 먼저 길어지고(괄호 높이) → 양옆으로 벌어짐(괄호 사이가 넓어짐) → 칸이 꽉 참
    const rx = r0 + (cell * 0.78 - r0) * ease(e);
    const ry = r0 + (cell * 0.74 - r0) * easeOut(clamp(e * 1.7));
    ctx.save();
    ctx.beginPath(); ctx.rect(c.x, c.y, cell, cell); ctx.clip();
    ctx.beginPath(); ctx.ellipse(c.x + cell / 2, c.y + cell / 2, Math.max(0.1, rx), ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// 물결이 지나갈 때 로고 글자·메뉴가 가로로 한 번 뒤집히며(앞면 흰 글자 → 뒷면 진한 글자) 색이 바뀜
function flipEl(el, t, prop) {
  const e = clamp((t - el._at) / FLIP);
  const sx = Math.max(0.001, Math.abs(Math.cos(e * Math.PI)));
  const tf = e > 0 && e < 1 ? `scale(${sx.toFixed(3)}, 1)` : '';
  if (el.style[prop] !== tf) el.style[prop] = tf;
  el.classList.toggle('light', e >= 0.5);
}

// ── 스크롤 → 장면 ──
// cur = 지금 재생 위치 (0 첫 화면, 1 흰 화면, 2 괄호 넓어짐, 3 로고 작아짐). 스크롤이 정한 목표(target)까지 시간에 맞춰 따라감
const story = document.getElementById('story');
let target = 0, cur = 0, raf = 0, last = 0;

function readScroll() {
  const r = story.getBoundingClientRect();
  const p = clamp(-r.top / Math.max(1, story.offsetHeight - innerHeight));
  target = SCENES.filter((sc) => p >= sc.at).length;
  if (!raf && cur !== target) { last = performance.now(); raf = requestAnimationFrame(step); }
}
function step(now) {
  raf = 0;
  const dt = Math.min(50, now - last);
  last = now;
  if (reduce) cur = target;
  else {
    const i = Math.min(SCENES.length - 1, Math.floor(target > cur ? cur : cur - 1e-6));   // 지금 재생 중인 장면
    const d = dt / SCENES[Math.max(0, i)].ms;
    cur = target > cur ? Math.min(target, cur + d) : Math.max(target, cur - d);
  }
  render(cur);
  if (cur !== target) raf = requestAnimationFrame(step);
}
function render(c) {
  const t = clamp(c);
  drawWipe(t);
  glyphs.forEach((g) => flipEl(g, t, 'transform'));
  navItems.forEach((a) => flipEl(a, t, 'transform'));
  logo.classList.toggle('past', c > 0);                // 첫 화면을 지나면 괄호 깜빡임 멈춤
  // 괄호: 속이 차 있다가(진한색) → 바탕색으로 비워지며 외곽선만 남고, 양옆으로 벌어짐
  const k = ease(clamp(c - 1));
  logo.style.setProperty('--pfill', rgb(mix(DARK, PAPER, k)));
  sides.forEach((s) => { s.style.transform = k ? `translate(${(s.dataset.side * PAREN_GAP / 2 * k).toFixed(2)}px, 0)` : ''; });
  // 로고가 작아지며 위로
  const s = ease(clamp(c - 2));
  logo.style.setProperty('--ls', 1 + (SMALL - 1) * s);
  logo.style.setProperty('--ly', SMALL_Y * s);
  intro.classList.toggle('show', c >= TEXT_AT);
  document.documentElement.style.colorScheme = t >= 0.5 ? 'light' : 'dark';
}

addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', () => { layoutWipe(); render(cur); });
layoutWipe();
readScroll();
cur = target;   // 새로고침했을 때 이미 내려가 있으면 그 장면부터
render(cur);

// 처음 열릴 때 + 로고에 마우스를 올릴 때 다시
logo.addEventListener('mouseenter', scrambleLogo);
logo.addEventListener('click', scrambleLogo);
scrambleLogo();

// ── 조형 8개: 화면에 들어오면 차례로 떠오름 ──
const forms = document.getElementById('forms');
forms.querySelectorAll('.forms-grid li').forEach((li, i) => li.style.setProperty('--i', i));
new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) forms.classList.add('in'); }), { threshold: 0.2 }).observe(forms);
