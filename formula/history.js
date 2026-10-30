// 히스토리: 조형 하나가 공식을 지나온 다섯 장 (history.html?n=1~8, #1~5로 장 지정)
//  Today's Food → Extract → Mix → Six Forms → Create form
//  ← BACK / NEXT →, 휠(한 번에 한 장), ← → 키, 진행 점으로 넘김. 장이 바뀔 때 괄호가 숨 쉬듯 열렸다 닫힘
//  자료는 foods.js의 FOODS (ARCHIVE와 같이 씀)
const FOODS = window.FOODS;
const n = Math.min(FOODS.length, Math.max(1, parseInt(new URLSearchParams(location.search).get('n'), 10) || 1));
const F = FOODS[n - 1];
const pad = (v) => String(v).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dir = 'archive/' + pad(n) + '/';
const icon = (k) => dir + (k < 5 ? 'A' + (k + 1) : 'B' + (k - 4)) + '.svg';
document.title = `FORMULA — N ${pad(n)} ${F.foods.join(' × ')}`;
document.getElementById('hNo').textContent = `N. ${pad(n)} =`;

// 점선 칸 (사진·이미지가 있으면 꽉 차게)
const box = (x, y, w, h, src, alt) => `<i class="pr-box${src ? ' has-img' : ''}" style="--x:${x}; --y:${y}; --w:${w}; --h:${h}">${src ? `<img src="${esc(src)}" alt="${esc(alt)}">` : ''}</i>`;
const FX = [529, 708, 889, 1069, 1253], FY = [419, 600];   // 피그마 Extract 구슬 자리
const feats = F.names.map((name, k) => `<span class="h-feat" tabindex="0" style="--x:${FX[k % 5]}; --y:${FY[k < 5 ? 0 : 1]}"><img src="${icon(k)}" alt="${esc(name)}"><span>${esc(name)}</span></span>`).join('');
const mix = F.mix ? `<span class="h-mix a"><img src="${icon(F.mix[0])}" alt="${esc(F.names[F.mix[0]])}" title="${esc(F.names[F.mix[0]])}"></span><span class="h-mix b"><img src="${icon(5 + F.mix[1])}" alt="${esc(F.names[5 + F.mix[1]])}" title="${esc(F.names[5 + F.mix[1]])}"></span>` : '';
const six = [[632, 352], [857, 352], [1082, 352], [632, 579], [857, 579], [1082, 579]].map(([x, y], i) => box(x, y, 206, 219, F.ai[i], `AI 조형 ${i + 1}`)).join('');

// Create form: 완성 조형을 3D로 천천히 계속 돌림 (hover3d.js의 data-auto). 질감·방향은 메인 조형 화면과 같게
const SPIN3D = 0.35;   // 돌아가는 빠르기 (1초에 몇 라디안. 0.35면 한 바퀴에 약 18초)
const LOOK3D = [
  'data-material="svg-satin"', 'data-material="pantone-602c"',
  'data-material="svg-satin" data-face="top" data-blend', 'data-material="svg-satin" data-face="top" data-blend',
  'data-material="svg-satin" data-blend data-ms="1100"', 'data-material="svg-satin" data-blend',
  'data-material="svg-satin"', 'data-material="svg-satin"',
];

const STEPS = [
  { name: "Today's Food", sub: '그날 먹은 음식 사진', body: box(572, 424, 380, 319, F.photos[0], F.foods[0]) + box(967, 424, 380, 319, F.photos[1], F.foods[1]),
    ko: `${esc(F.foods[0])} × ${esc(F.foods[1])}`, en: '' },
  { name: 'Extract', sub: '뽑아낸 조형적 특징 (특징 도형)', body: `<div class="h-feats">${feats}</div><span class="h-side" style="--y:419">A</span><span class="h-side" style="--y:600">B</span>`,
    ko: '마우스를 올려 특징을 확인해 보세요', en: 'Hover over an icon to see its feature' },
  { name: 'Mix', sub: '조형 특징 두 가지 선정', body: `${mix}<span class="pr-plus">+</span>`,
    ko: '사용자는 어떤 특징을 섞어야 좋을지 생각하고, 직접 골라 넣습니다.', en: 'I think about which traits to mix, and choose them myself.' },
  { name: 'Six Forms', sub: '6개 조형 생성', body: six,
    ko: '고른 조합을 바탕으로 AI가 조형 여섯 개를 도출합니다.', en: 'From the chosen mix, AI draws out six forms.' },
  { name: 'Create form', sub: '3D 조형 완성', body: `<figure class="form3d pr-obj" role="img" aria-label="N ${pad(n)} 완성 조형 (3D)" data-fit data-auto data-spin="${SPIN3D}" data-svg="${esc(F.svg)}" data-model="${esc(F.svg.replace(/\.svg$/, '.glb'))}" ${LOOK3D[n - 1] || 'data-material="svg-satin"'}></figure>`,
    ko: '여섯 개의 조형을 바탕으로, 사용자는 3D 조형을 만듭니다.', en: 'Based on the six, I make the 3D form.' },
];

const stepsEl = document.getElementById('steps'), dotsEl = document.getElementById('dots');
stepsEl.innerHTML = STEPS.map((s, i) => `<div class="pr-step" data-step="${i}" aria-hidden="true">
  <h3 class="pr-name">${s.name}</h3><p class="pr-sub">${s.sub}</p>${s.body}
  <p class="pr-ko">${s.ko}</p>${s.en ? `<p class="pr-en" lang="en">${s.en}</p>` : ''}</div>`).join('');
dotsEl.innerHTML = STEPS.map((s, i) => `<li title="${s.name}" data-i="${i}"></li>`).join('');
const steps = [...stepsEl.children], dots = [...dotsEl.children];
const parens = [...document.querySelectorAll('.pr-paren')];
const back = document.getElementById('back'), next = document.getElementById('next');

let cur = -1;
function go(i) {
  i = Math.max(0, Math.min(STEPS.length - 1, i));
  if (i === cur) return;
  const first = cur < 0;
  cur = i;
  steps.forEach((el, k) => { el.classList.toggle('on', k === i); el.setAttribute('aria-hidden', k === i ? 'false' : 'true'); });
  dots.forEach((el, k) => el.classList.toggle('on', k <= i));
  next.hidden = i === STEPS.length - 1;
  history.replaceState(null, '', `?n=${n}#${i + 1}`);
  if (!first) parens.forEach((p) => { p.classList.remove('breathe'); void p.getBoundingClientRect(); p.classList.add('breathe'); });   // 괄호 숨쉬기
}

// BACK: 첫 장이면 조형 화면으로 돌아감
back.addEventListener('click', () => { if (cur === 0) location.href = './#forms'; else go(cur - 1); });
next.addEventListener('click', () => go(cur + 1));
dotsEl.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) go(+li.dataset.i); });
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { go(cur + 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { go(cur - 1); e.preventDefault(); }
});
// 휠: 한 번 굴리면 한 장 (연달아 굴려도 0.8초에 한 장)
let wheelLock = 0;
addEventListener('wheel', (e) => {
  e.preventDefault();
  const now = performance.now();
  if (now < wheelLock || Math.abs(e.deltaY) < 8) return;
  wheelLock = now + 800;
  go(cur + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });
// 손가락으로 옆으로 밀기
let tx = null;
addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; }, { passive: true });
addEventListener('touchend', (e) => {
  if (tx == null) return;
  const dx = e.changedTouches[0].clientX - tx; tx = null;
  if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1));
});

go((parseInt(location.hash.slice(1), 10) || 1) - 1);

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const CHECK = /[?&]check\b/.test(location.search);   // 확인용(check.html에서 열 때): 2분 무조작이어도 첫 화면으로 안 돌아감
const wake = () => { if (CHECK) return; clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
