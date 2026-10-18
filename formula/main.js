// FORMULA 소개 페이지: 스크롤에 맞춰 장면이 움직임
import { glyphSVG, GLYPH_TYPES } from '../js/glyphs.js';

// ─────────────────────────────────────────
// 작품 8개 — 자료가 생기면 여기만 채우면 됨
//   source: 출처 사진(x), form: 추출한 조형(f, 이미지 또는 .mp4), object: 완성 사진(form)
//   비워 두면 점선 칸으로 보임
// ─────────────────────────────────────────
const WORKS = [
  { no: '01', name: 'Food', desc: '매일 먹는 음식에서 꺼낸 조형', source: '../assets/img/food/broccoli-main.png', form: 'media/pearl.mp4', object: '' },
  { no: '02', name: '', desc: '', source: '', form: '', object: '' },
  { no: '03', name: '', desc: '', source: '', form: '', object: '' },
  { no: '04', name: '', desc: '', source: '', form: '', object: '' },
  { no: '05', name: '', desc: '', source: '', form: '', object: '' },
  { no: '06', name: '', desc: '', source: '', form: '', object: '' },
  { no: '07', name: '', desc: '', source: '', form: '', object: '' },
  { no: '08', name: '', desc: '', source: '', form: '', object: '' },
];

// 연구 방법 7단계 (실제 화면 캡처)
const STEPS = [
  ['관찰', '음식 두 개 입력', '실제 사진 검색·수집, 배경 제거', 'step1', '음식 고르기 — 실제 사진'],
  ['분해', '사진 고르기', '윤곽선(등고선)으로 형태 분해', 'step2', '분석 — 사진이 등고선으로 분해됨'],
  ['추출', '분해 과정 보기', '특징 10개를 읽고 도형으로 번역', 'step3', '나만의 조합 — 특징 도형 10개'],
  ['조합', '특징 도형을 그릇 2개에 담기', '고른 조합 기억', 'step4', '나만의 조합 — 그릇에 담은 뒤'],
  ['섞기', '그릇을 저어 섞기', '조형 6개 계획', 'step5', '요리 — 위에서 본 그릇을 저음'],
  ['제안', '6개 중 하나 고르기', '관람객 조합 2개 + AI 조합 4개', 'step6', '맛보기 — 조형 6개'],
  ['구체화', '3D로 돌려 보기', '이미지를 3D로 변환', 'step7', '3D 결과'],
];

// 만들며 알게 된 것 6가지 (연구 판넬 정리에서)
const FINDINGS = [
  ['생성보다 재료가 어렵다', 'AI가 생성한 이미지는 평균적인 모습으로 수렴했다. 새로운 조형의 출발점은 만들어진 이미지가 아니라 실재하는 대상의 다양한 모습이어야 했다.', 'AI가 그린 음식은 비슷한 전형만 나왔다. 실제 사진 검색 → AI 선별 → 배경 제거로 바꾸자 단면·조각·송이 같은 서로 다른 모습이 들어왔다.', '근거 · 22회 중 11회 (#1, #9–#13, #17)'],
  ['사람의 자리를 늘리면 결과가 내 것이 된다', 'AI의 제안 사이사이에 사람이 고르고 섞는 단계를 넣자, 결과물은 받는 것이 아니라 함께 만든 것이 되었다.', 'AI가 정하던 조형 6개 중 2개를 관람객이 고른 특징 조합으로 바꾸고, 재료를 그릇에 넣고 직접 젓는 단계를 넣었다.', '근거 · 관람객 단계 3→6, AI 단독 결정 6→4'],
  ['말 대신 도형으로 조형 언어를 나눈다', '특징을 문장 대신 도형 기호와 수치로 옮기자, 언어를 몰라도 조형 언어를 비교하고 조합할 수 있었다.', '특징마다 20종 도형 중 하나와 7가지 모양 값을 정해 그리자 한눈에 비교하고 조합할 수 있었다.', '근거 · 나만의 조합 화면 (#15, #21)'],
  ['기다림을 과정으로 바꾼다', 'AI가 일하는 시간을 숨기지 않고 보여주자, 기다림이 AI의 사고 과정을 들여다보는 시간이 되었다.', '조형 6개에 약 3분, 3D 변환에 약 1분. 그동안 그릇 속 도형이 돌며 섞이고, AI가 지금 하는 일을 한 줄씩 보여준다.', '근거 · 대기 안내 문구, 섞이는 그릇 (#15, #16)'],
  ['무엇을 AI가 했는지 밝힌다', 'AI가 한 일과 하지 않은 일을 구분해 밝히는 것이, 관람객이 결과를 믿고 탐색을 이어가게 만드는 조건이었다.', '사진 출처와 "배경은 AI가 지웠어요", "보이지 않는 면은 AI가 추정한 형태예요"를 표시하고, 실패하면 원인을 알려준다.', '근거 · 출처·추정 고지, 실패 원인 안내 (#19, #20)'],
  ['한 사람의 선택이 다음 사람의 출발점이 된다', '관람객의 선택과 평가가 쌓이며, 조형 탐색은 개인의 경험에서 전시장 전체가 함께 넓혀 가는 탐색이 되었다.', '모든 작품이 공유 갤러리에 쌓이고, 좋아요/별로예요 평가가 다음 관람객의 조형 제안에 참고된다.', '근거 · 공유 갤러리, 평가 반영 규칙 (#1, #3, #8)'],
];

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const $ = (s) => document.querySelector(s);

// ─────────────────────────────────────────
// 로고: 막대 조각 + 공 끝 (피그마 '타이포 시안 10'과 같은 방식)
// ─────────────────────────────────────────
const LETTERS = {
  f: { w: 2.9, parts: [['p', 'M1,4.2 L1,-0.4 A1.3,1.3 0 0 1 2.3,-1.7 L2.4,-1.7'], ['b', 3.45, -1.7], ['p', 'M-0.2,0.7 L2.6,0.7', 'fn']] },
  '(': { w: 2.2, parts: [['p', 'M2.1,0.05 A2.05,2.05 0 0 0 2.1,3.95', 'fn']] },
  ')': { w: 2.2, parts: [['p', 'M0.1,0.05 A2.05,2.05 0 0 1 0.1,3.95', 'fn']] },
  r: { w: 2.6, parts: [['p', 'M0,4 L0,0'], ['p', 'M0,1.6 A1.6,1.6 0 0 1 1.6,0 L1.7,0'], ['b', 2.75, 0]] },
  m: { w: 4.8, parts: [['p', 'M0,4 L0,0'], ['p', 'M0,4 L0,1.2 A1.2,1.2 0 0 1 2.4,1.2 L2.4,4'], ['p', 'M2.4,4 L2.4,1.2 A1.2,1.2 0 0 1 4.8,1.2 L4.8,4']] },
  u: { w: 2.4, parts: [['p', 'M0,0 L0,2.8 A1.2,1.2 0 0 0 2.4,2.8 L2.4,0'], ['p', 'M2.4,0 L2.4,4']] },
  l: { w: 2.6, parts: [['p', 'M0,-2 L0,2.9 A1.1,1.1 0 0 0 1.1,4'], ['b', 2.15, 4]] },
  a: { w: 2.5, parts: [['b', -0.2, 0.1], ['p', 'M0.8,0.05 L1.2,0.05 A1.25,1.25 0 0 1 2.45,1.3 L2.45,4'], ['p', 'M2.45,2.75 A1.25,1.25 0 1 0 2.45,2.76']] },
};
function logoSVG({ s = 1.45, out = 0.2, bg = '#fff', ink = '#111', fn = '#111' } = {}) {
  const track = s + 0.85, pad = 2;
  let x = 0, g = '';
  for (const ch of ['f', '(', ')', 'r', 'm', 'u', 'l', 'a']) {
    const d = LETTERS[ch];
    for (const pt of d.parts) {
      const col = pt[pt.length - 1] === 'fn' ? fn : ink;
      // 조각 하나 = 바깥선(배경색) + 막대. 겹친 곳에 틈이 생겨 쌓인 느낌
      const body = pt[0] === 'p'
        ? `<path d="${pt[1]}" fill="none" stroke="${bg}" stroke-width="${s + out * 2}" stroke-linecap="round"/><path d="${pt[1]}" fill="none" stroke="${col}" stroke-width="${s}" stroke-linecap="round"/>`
        : `<circle cx="${pt[1]}" cy="${pt[2]}" r="${s * 0.6 + out}" fill="${bg}"/><circle cx="${pt[1]}" cy="${pt[2]}" r="${s * 0.6}" fill="${col}"/>`;
      g += `<g class="pc"><g transform="translate(${pad + x},${pad + 2.6})">${body}</g></g>`;
    }
    x += d.w + (ch === '(' ? -0.1 : track);
  }
  const W = x + pad * 2 - track + 0.4, H = 4 + 2.6 + pad * 2 + 0.4;
  return `<svg viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${g}</svg>`;
}

const heroLogo = $('#heroLogo');
heroLogo.innerHTML = logoSVG({ fn: '#ff4a1c' });
$('#miniLogo').innerHTML = logoSVG({ s: 1.6, out: 0.18 });
// 조각마다 흩어질 방향 (매번 같은 값)
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pieces = [...heroLogo.querySelectorAll('.pc')].map((el) => ({
  el, dx: (rand() - 0.5) * 44, dy: (rand() - 0.5) * 22, rot: (rand() - 0.5) * 240,
}));

// ─────────────────────────────────────────
// 화면 채우기
// ─────────────────────────────────────────
// 문장을 낱말로 나눔 (스크롤에 따라 하나씩 진해짐)
document.querySelectorAll('[data-reveal]').forEach((el) => {
  const walk = (node) => [...node.childNodes].forEach((n) => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((t) => {
        if (!t) return;
        if (/^\s+$/.test(t)) frag.append(' ');
        else { const s = document.createElement('span'); s.className = 'w'; s.textContent = t; frag.append(s); }
      });
      n.replaceWith(frag);
    } else walk(n);
  });
  walk(el);
});

// 도형 언어 20가지
const COLORS = ['#f5b800', '#3daa2e', '#ff5c8a', '#2f6bff'];
const TEX = ['grain', 'coarse', 'hatch', 'halftone', 'halftoneBig'];
const types = Object.keys(GLYPH_TYPES);
$('#glyphGrid').innerHTML = types.map((t, i) =>
  `<figure style="--i:${i}"><div>${glyphSVG(t, COLORS[i % 4], 'formula' + i, TEX[i % 5])}</div><figcaption>${t}<b>${GLYPH_TYPES[t]}</b></figcaption></figure>`).join('');
$('#eqGlyphs').innerHTML = types.slice(0, 10).map((t, i) =>
  `<div style="--i:${i}">${glyphSVG(t, COLORS[(i + 1) % 4], 'eq' + i, TEX[i % 5])}</div>`).join('');

// 작품 카드
const media = (src, alt) => !src ? '<div class="slot">준비 중</div>'
  : /\.mp4$/.test(src) ? `<div class="media"><video src="${src}" muted loop playsinline autoplay preload="metadata"></video></div>`
  : `<div class="media"><img src="${src}" alt="${alt}" loading="lazy"></div>`;
$('#track').innerHTML = WORKS.map((w) => `
  <article class="work">
    <div class="work-top"><span class="work-no">No.${w.no}</span><span class="work-name">${w.name || '제목 준비 중'}</span></div>
    <p class="work-desc">${w.desc || '&nbsp;'}</p>
    <div class="work-flow">
      <div class="cell"><p>x 출처</p>${media(w.source, `No.${w.no} 출처`)}</div><span class="arrow">→</span>
      <div class="cell"><p>f 추출한 조형</p>${media(w.form, `No.${w.no} 조형`)}</div><span class="arrow">→</span>
      <div class="cell"><p>form 완성</p>${media(w.object, `No.${w.no} 완성`)}</div>
    </div>
  </article>`).join('');

// 방법 7단계
$('#steps').innerHTML = STEPS.map(([t, man, ai], i) =>
  `<li><span class="n">0${i + 1}</span><h3>${t}</h3><div class="who"><em>사람</em><span>${man}</span><em>AI</em><span>${ai}</span></div></li>`).join('');
$('#screen').innerHTML = STEPS.map(([t, , , img], i) =>
  `<img src="media/${img}.webp" alt="${t} 단계 화면" ${i ? 'loading="lazy"' : ''}>`).join('');

// 발견 6가지
$('#findings').innerHTML = FINDINGS.map(([h, q, what, proof], i) => `
  <article class="finding" style="--i:${i}">
    <div><p class="mono">Finding 0${i + 1}</p><h3>${h}</h3></div>
    <div><p class="q">${q}</p><p class="what">${what}</p><p class="proof">${proof}</p></div>
  </article>`).join('');

// ─────────────────────────────────────────
// 스크롤 장면
// ─────────────────────────────────────────
const scenes = [...document.querySelectorAll('[data-scene]')];
const stepEls = [...document.querySelectorAll('#steps li')];
const shotEls = [...document.querySelectorAll('#screen img')];
const stageEls = [...document.querySelectorAll('.stage')];
const termEls = [...document.querySelectorAll('.eq .t')];
const tickEls = [...document.querySelectorAll('.ticks li')];
const track = $('#track');
let lastStep = -1, lastStage = -1;

const SCENES = {
  hero(p) {
    const e = reduce ? 1 : ease(clamp(p / 0.5));
    for (const c of pieces) {
      const k = 1 - e;
      // 단위는 로고 글자 칸(svg 단위)
      c.el.style.transform = `translate(${(c.dx * k).toFixed(2)}px,${(c.dy * k).toFixed(2)}px) rotate(${(c.rot * k).toFixed(1)}deg)`;
    }
    const after = clamp((p - 0.45) / 0.2);
    $('#heroEq').style.opacity = after;
    $('#heroSub').style.opacity = clamp((p - 0.6) / 0.2);
    $('#heroHint').style.opacity = 1 - clamp(p / 0.15);
    heroLogo.style.transform = `translateY(${(-clamp((p - 0.8) / 0.2) * 6).toFixed(2)}vh)`;
  },
  reveal(p, el) {
    const words = el._w || (el._w = [...el.querySelectorAll('.w')]);
    const n = Math.round(clamp(p / 0.7) * words.length);
    words.forEach((w, i) => w.classList.toggle('on', i < n));
  },
  equation(p) {
    const i = Math.min(3, Math.floor(clamp(p) * 4));
    if (i === lastStage) return;
    lastStage = i;
    stageEls.forEach((s, j) => s.classList.toggle('on', j === i));
    tickEls.forEach((t, j) => t.classList.toggle('on', j <= i));
    // x → f → form → object(form 전체)
    termEls.forEach((t) => t.classList.toggle('on', +t.dataset.t <= Math.min(i, 2)));
  },
  works(p) {
    const max = track.scrollWidth - innerWidth;
    track.style.transform = `translateX(${(-clamp((p - 0.04) / 0.92) * max).toFixed(1)}px)`;
  },
  method(p) {
    const i = Math.min(STEPS.length - 1, Math.floor(clamp(p) * STEPS.length));
    if (i === lastStep) return;
    lastStep = i;
    stepEls.forEach((s, j) => s.classList.toggle('on', j === i));
    shotEls.forEach((s, j) => s.classList.toggle('on', j === i));
    $('#screenCap').textContent = `0${i + 1} / 07 — ${STEPS[i][4]}`;
  },
};

const bar = $('.bar-logo'), progress = $('#progress');
function update() {
  const vh = innerHeight;
  for (const el of scenes) {
    const r = el.getBoundingClientRect();
    if (r.bottom < -vh || r.top > vh * 2) continue;
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    SCENES[el.dataset.scene]?.(p, el);
  }
  const doc = document.documentElement;
  progress.style.transform = `scaleX(${clamp(scrollY / Math.max(1, doc.scrollHeight - vh)).toFixed(4)})`;
  bar.classList.toggle('on', scrollY > vh * 1.6);
}

// 화면에 들어오면 한 번 나타남
const io = new IntersectionObserver((list) => list.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add('seen');
  io.unobserve(e.target);
  if (e.target.id === 'nums') countUp();
}), { threshold: 0.2 });
document.querySelectorAll('.in, .glyph-grid, #nums').forEach((el) => io.observe(el));

function countUp() {
  document.querySelectorAll('[data-n]').forEach((b) => {
    const to = +b.dataset.n, t0 = performance.now();
    const step = (t) => {
      const k = reduce ? 1 : clamp((t - t0) / 1200);
      b.textContent = Math.round(ease(k) * to);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// 부드러운 스크롤 (불러오지 못하면 기본 스크롤)
let lenis = null;
if (window.Lenis && !reduce) {
  lenis = new window.Lenis({ lerp: 0.09 });
  lenis.on('scroll', update);
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    lenis.scrollTo(a.getAttribute('href') === '#top' ? 0 : a.getAttribute('href'));
  }));
} else {
  addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
}
addEventListener('resize', update);
update();
