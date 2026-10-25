// 히스토리: 조형 하나가 공식을 지나온 과정 (history.html?n=1~8)
// 1장 공식 한 줄(음식 → 특징 → 믹스 → 조형 여섯 → 오브제), 2장 사람이 고른 세 순간

// ── 조형 8개 자료 ──
// 비어 있는 곳('')은 자리만 보여줌. 채우는 법:
//   foods  음식 두 개 이름              예) ['젤리', '브로콜리']
//   photos 음식 사진 두 장 주소          예) ['history/n01/a.jpg', 'history/n01/b.jpg']  (formula/history/ 폴더에 넣기)
//   featA / featB  음식마다 특징 다섯 개를 구슬 기호로 [모양, 단계]
//          모양: line 줄 · ring 고리 · branch 가지 · cluster 뭉치 · wave 물결 · spiral 나선 / 단계 0~7 (클수록 많고 크게)
//   names  특징 이름 (특징 10개 순서대로, 없으면 빈칸)
//   mix    섞은 두 특징 [A쪽 번호, B쪽 번호] (0~4)
//   reason 섞은 이유 한 줄 / change 다듬으며 바꾼 것 한 줄
//   ai     AI가 제안한 조형 여섯 장 주소, pick 그중 고른 번호 (0~5)
const BLANK = (svg, featA, featB, mix) => ({ svg, foods: ['', ''], photos: [], featA, featB, names: [], mix, reason: '', change: '', ai: [], pick: 2 });
const FORMS = [
  BLANK('forms/form_02.svg', [['ring', 3], ['branch', 4], ['cluster', 5], ['wave', 2], ['spiral', 2]], [['line', 3], ['ring', 6], ['branch', 2], ['wave', 4], ['spiral', 4]], [1, 3]),
  BLANK('forms/form_12.svg', [['line', 5], ['wave', 3], ['ring', 2], ['branch', 6], ['cluster', 3]], [['spiral', 3], ['cluster', 6], ['line', 2], ['ring', 5], ['wave', 6]], [3, 4]),
  BLANK('forms/no_03.svg', [['cluster', 4], ['ring', 4], ['wave', 5], ['spiral', 5], ['line', 6]], [['branch', 3], ['wave', 2], ['ring', 7], ['cluster', 2], ['spiral', 1]], [1, 2]),
  BLANK('forms/no_04.svg', [['wave', 6], ['cluster', 7], ['spiral', 4], ['ring', 3], ['branch', 5]], [['ring', 2], ['line', 4], ['wave', 3], ['branch', 7], ['cluster', 5]], [0, 3]),
  BLANK('forms/no_05.svg', [['wave', 7], ['line', 7], ['ring', 5], ['spiral', 6], ['cluster', 2]], [['branch', 1], ['ring', 4], ['cluster', 4], ['line', 5], ['wave', 5]], [0, 4]),
  BLANK('forms/no_06.svg', [['ring', 7], ['cluster', 6], ['branch', 7], ['line', 1], ['wave', 1]], [['spiral', 6], ['ring', 3], ['wave', 7], ['cluster', 7], ['branch', 4]], [0, 3]),
  BLANK('forms/no_07.svg', [['branch', 6], ['spiral', 3], ['line', 4], ['cluster', 3], ['ring', 6]], [['wave', 4], ['branch', 5], ['ring', 1], ['spiral', 2], ['line', 6]], [0, 1]),
  BLANK('forms/no_08.svg', [['wave', 4], ['ring', 5], ['spiral', 7], ['branch', 2], ['cluster', 6]], [['line', 2], ['wave', 6], ['cluster', 3], ['ring', 6], ['branch', 6]], [0, 1]),
];

// ── 구슬 기호 (로고와 같은 문법: 구슬 + 오목한 목) ──
const R = 9, NK = 0.7, ST = 16;
function neck(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
  if (d < 1e-3) return '';
  const nx = -dy / d, ny = dx / d, w = R * NK, f = (w * w + d * d / 4 - R * R) / (2 * (R - w));
  if (f <= 0) return '';
  const h = w + f, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, k = R / (R + f), p = [];
  for (const s of [1, -1]) { const fx = mx + nx * h * s, fy = my + ny * h * s; p.push([x1 + (fx - x1) * k, y1 + (fy - y1) * k, x2 + (fx - x2) * k, y2 + (fy - y2) * k]); }
  const n = (v) => v.toFixed(1);
  return `<path d="M${n(p[0][0])},${n(p[0][1])} A${n(f)},${n(f)} 0 0 1 ${n(p[0][2])},${n(p[0][3])} L${n(p[1][2])},${n(p[1][3])} A${n(f)},${n(f)} 0 0 1 ${n(p[1][0])},${n(p[1][1])}Z"/>`;
}
const chain = (n) => Array.from({ length: n - 1 }, (_, i) => [i, i + 1]);
const SHAPES = {
  line: (s) => { const n = s + 2; return { P: Array.from({ length: n }, (_, i) => [0, i * ST * 1.15]), E: chain(n) }; },
  ring: (s) => { const n = s + 3, r = n * ST * 1.15 / (2 * Math.PI); return { P: Array.from({ length: n }, (_, i) => [r * Math.cos(i / n * 6.283), r * Math.sin(i / n * 6.283)]), E: [...chain(n), [n - 1, 0]] }; },
  branch: (s) => { const a = s + 1, P = [[0, 46]], E = []; for (let i = 1; i <= 3; i++) { P.push([0, 46 - i * ST * 1.1]); E.push([i - 1, i]); }
    const spread = Math.min(Math.PI * 0.95, (a - 1) * 0.42);
    for (let k = 0; k < a; k++) { const ang = -Math.PI / 2 + (a === 1 ? 0 : (k / (a - 1) - 0.5) * spread); let prev = 3;
      for (let j = 1; j <= 3; j++) { P.push([P[3][0] + Math.cos(ang) * ST * 1.1 * j, P[3][1] + Math.sin(ang) * ST * 1.1 * j]); E.push([prev, P.length - 1]); prev = P.length - 1; } }
    return { P, E }; },
  cluster: (s) => { const n = s + 2, P = []; for (let i = 0; i < n; i++) { const r = ST * 0.78 * Math.sqrt(i), a = i * 2.39996; P.push([r * Math.cos(a), r * Math.sin(a)]); }
    const E = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < ST * 1.35) E.push([i, j]); return { P, E }; },
  wave: (s) => { const n = 7, A = (s + 1) * 2.7; return { P: Array.from({ length: n }, (_, i) => [i * ST, (i % 2 ? 1 : -1) * A]), E: chain(n) }; },
  spiral: (s) => { const turns = 0.6 + s * 0.35, n = Math.round(8 + turns * 7), P = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1), a = t * turns * 2 * Math.PI, r = 6 + t * 62; P.push([r * Math.cos(a), r * Math.sin(a)]); } return { P, E: chain(n) }; },
};
function glyph([kind, step], color, label) {
  const { P, E } = SHAPES[kind](step);
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const x0 = Math.min(...xs) - R - 1, y0 = Math.min(...ys) - R - 1, w = Math.max(...xs) - Math.min(...xs) + 2 * R + 2, h = Math.max(...ys) - Math.min(...ys) + 2 * R + 2;
  const side = Math.max(w, h), ox = x0 - (side - w) / 2, oy = y0 - (side - h) / 2;
  const body = E.map(([a, b]) => neck(P[a][0], P[a][1], P[b][0], P[b][1])).join('') + P.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${R}"/>`).join('');
  return `<svg class="chip" viewBox="${ox.toFixed(1)} ${oy.toFixed(1)} ${side.toFixed(1)} ${side.toFixed(1)}" fill="${color}" role="img" aria-label="${label || kind}">${body}</svg>`;
}

// ── 화면 채우기 ──
const INK = '#1e1d1b', OR = '#ec5b3b';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = Math.min(8, Math.max(1, parseInt(new URLSearchParams(location.search).get('n'), 10) || 1));
const F = FORMS[n - 1], NO = 'N 0' + n;
document.title = `FORMULA — ${NO}`;
const food = (i) => F.foods[i] || '○○';
const feat = (side, i) => F.names[side * 5 + i] || '';
const aiBox = (i, cls = '') => `<div class="ai ${cls}">${F.ai[i] ? `<img src="${esc(F.ai[i])}" alt="AI 조형 ${i + 1}">` : 'AI ' + (i + 1)}</div>`;
const finalImg = `<img class="final" src="${esc(F.svg)}" alt="${NO} 완성 오브제">`;
const dot = (human) => `<i class="dot${human ? ' on' : ''}" title="${human ? '사람이 정함' : 'AI가 제안'}"></i>`;
const [ma, mb] = F.mix;

document.getElementById('hNo').textContent = NO;
document.getElementById('hNo2').textContent = NO;
document.getElementById('hFormula').textContent = `${NO} = f( ${food(0)} , ${food(1)} )`;

const stations = [
  [`<div class="food a">${F.photos[0] ? `<img src="${esc(F.photos[0])}" alt="${esc(food(0))}">` : esc(F.foods[0] || '음식 A')}</div><div class="food b">${F.photos[1] ? `<img src="${esc(F.photos[1])}" alt="${esc(food(1))}">` : esc(F.foods[1] || '음식 B')}</div>`,
    '오늘의 음식', '먹은 음식 사진 두 장', true],
  [`<div class="chips">${F.featA.map((g, i) => glyph(g, INK, feat(0, i))).join('')}${F.featB.map((g, i) => glyph(g, OR, feat(1, i))).join('')}</div>`,
    '특징 10', 'AI가 뽑은 형태의 특징', false],
  [`<div class="mix"><span class="paren">(</span>${glyph(F.featA[ma], INK)}<span class="plus">+</span>${glyph(F.featB[mb], OR)}<span class="paren">)</span></div>`,
    '믹스', '섞을 두 특징을 고름', true],
  [`<div class="six">${Array.from({ length: 6 }, (_, i) => aiBox(i, i === F.pick ? 'pick' : '')).join('')}</div>`,
    '조형 여섯', 'AI가 제안한 여섯 개', false],
  [finalImg, '오브제', '하나를 골라 다듬음', true],
];
document.getElementById('flow').innerHTML = stations.map(([vis, name, desc, human], i) =>
  `<li class="station"><div class="vis">${vis}</div><p class="num">0${i + 1}</p><p class="name">${name}</p><p class="desc">${desc}</p>${dot(human)}</li>`).join('');

const quote = (s, empty) => `<p class="quote${s ? '' : ' empty'}">${s ? `“ ${esc(s)} ”` : empty}</p>`;
document.getElementById('choices').innerHTML = `
  <div class="choice"><p class="num">선택 1</p><h3>무엇을 섞을까</h3>
    <div class="vis">${glyph(F.featA[ma], INK)}<span class="plus">+</span>${glyph(F.featB[mb], OR)}</div>
    <p class="note">${esc(food(0))}의 ${esc(feat(0, ma) || '○○')}  +  ${esc(food(1))}의 ${esc(feat(1, mb) || '○○')}</p>
    ${quote(F.reason, '고른 이유 한 줄')}</div>
  <div class="choice"><p class="num">선택 2</p><h3>여섯 중 하나</h3>
    <div class="vis" style="flex-direction:column;gap:0">${aiBox(F.pick, 'pick pick-big')}
      <div class="others">${Array.from({ length: 6 }, (_, i) => i).filter((i) => i !== F.pick).map((i) => aiBox(i)).join('')}</div></div>
    <p class="note">AI가 제안한 여섯 개 중, 이것을 골랐어요</p></div>
  <div class="choice"><p class="num">선택 3</p><h3>어떻게 다듬을까</h3>
    <div class="vis pair"><div>${aiBox(F.pick)}<p class="tag">AI</p></div><span class="arrow">→</span><div>${finalImg}<p class="tag">${NO}</p></div></div>
    ${quote(F.change, '바꾼 것 한 줄')}</div>`;

const prev = n > 1 ? n - 1 : 8, next = n < 8 ? n + 1 : 1;
document.getElementById('pager').innerHTML = `<a href="history.html?n=${prev}">← N 0${prev}</a><a href="./#forms">8 FORMS</a><a href="history.html?n=${next}">N 0${next} →</a>`;

// ── 전시용: 2분 동안 아무도 만지지 않으면 첫 화면으로 (main.js와 같은 시간) ──
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const wake = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
