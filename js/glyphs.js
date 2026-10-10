/* =========================================================
   특징 도형 (나만의 조합 화면)
   분석된 특징 하나를 글 대신 작은 도형 기호로 보여줌
   - 도형 종류는 분석 AI가 특징마다 하나 고름 (api/analyze의 glyph)
   - AI가 안 골랐으면(예전 분석, 데모) 제목·설명의 낱말로 추측
   - 모든 도형은 100×100 칸에 그리고, 색은 음식 사진의 대표색을 선명하게 바꾼 것
   - 실제 사진은 쓰지 않고 색과 그래픽 질감만 (보이는 특징: 입자·얼룩·사선 / 알려진 성질: 망점·큰 망점)
   - 10개 특징은 서로 다른 도형 (distinctGlyphs), 특징마다 질감·색 진하기도 다르게
   ========================================================= */

// 도형 종류: 이름 → 어떤 특징에 쓰는지 (api/analyze.js 목록과 같아야 함)
export const GLYPH_TYPES = {
  grooves: '둘레를 따라 반복되는 홈·톱니·주름',
  stripe: '나란한 줄무늬, 결',
  layers: '층, 계단, 겹겹이 쌓임',
  branch: '가지, 갈라짐, 뻗어 나감',
  petals: '꽃잎, 방사형으로 붙은 둥근 조각',
  burst: '가시, 방사, 펼쳐짐, 팽창',
  dots: '작은 알갱이, 반복되는 점, 표면 밀도',
  cluster: '송이, 뭉침, 모여 있음',
  pores: '여러 개의 작은 구멍, 스펀지·기공',
  mesh: '그물, 격자, 칸칸이 나뉨',
  ring: '큰 구멍, 고리, 테두리',
  shell: '감싸는 껍질, 한쪽이 열린 곡면',
  spiral: '나선, 꼬임, 감김',
  wave: '물결, 곡률, 휘어짐, 유연함',
  fold: '접힘, 지그재그',
  blob: '말랑함, 탄성, 둥근 덩어리',
  drip: '흘러내림, 녹음, 늘어짐',
  crack: '갈라짐, 파단, 깨짐, 분리',
  veil: '투명함, 얇음, 빛 통과, 겹침',
  press: '압축, 눌림, 납작함',
};

// AI가 도형을 안 골랐을 때: 낱말로 추측 (앞에 있는 규칙이 먼저)
const GUESS = [
  ['branch', /가지|갈래|갈라지|줄기|뻗/],
  ['cluster', /송이|뭉치|뭉쳐|모여|덩이들|무리/],
  ['dots', /알갱이|점|밀도|오돌|촘촘|입자|씨/],
  ['grooves', /홈|줄무늬|골|세로|가로줄|결/],
  ['layers', /층|계단|단을|겹겹|쌓/],
  ['pores', /기공|구멍들|작은 구멍|스펀지|숭숭/],
  ['mesh', /그물|격자|칸/],
  ['ring', /구멍|고리|빈 공간|테두리|둘레|링/],
  ['shell', /껍질|감싸|껍데기/],
  ['drip', /흘러|녹아|늘어지|녹는/],
  ['petals', /꽃잎|잎/],
  ['stripe', /줄무늬|결|평행/],
  ['spiral', /나선|꼬|감기|소용돌이/],
  ['crack', /파단|깨|금이|부서|쪼개|분리/],
  ['veil', /투명|빛|얇|비치|반투명/],
  ['press', /압축|눌|납작|평평/],
  ['fold', /접|주름/],
  ['burst', /방사|펼쳐|팽창|부풀|퍼지/],
  ['blob', /말랑|탄성|되돌아|둥근|부드럽|굳/],
  ['wave', /물결|곡|휘|유연|흐르/],
];
export function glyphFor(f) {
  if (f?.glyph && GLYPH_TYPES[f.glyph]) return f.glyph;
  const text = `${f?.title || ''} ${f?.desc || ''}`;
  for (const [type, re] of GUESS) if (re.test(text)) return type;
  return 'blob';
}

/* ---------- 10개 특징이 서로 다른 도형이 되게 ----------
   비슷한 내용의 특징이 같은 도형으로 겹치면, 뜻이 가까운 다른 도형으로 바꿈 (그래도 겹치면 안 쓴 도형 아무거나) */
const NEAR = {
  grooves: ['stripe', 'fold', 'layers'], stripe: ['grooves', 'wave', 'layers'], layers: ['press', 'stripe', 'fold'],
  branch: ['burst', 'crack', 'drip'], petals: ['cluster', 'burst', 'blob'], burst: ['branch', 'petals', 'dots'],
  dots: ['pores', 'cluster', 'mesh'], cluster: ['dots', 'petals', 'blob'], pores: ['dots', 'mesh', 'ring'],
  mesh: ['pores', 'stripe', 'crack'], ring: ['shell', 'pores', 'spiral'], shell: ['ring', 'veil', 'fold'],
  spiral: ['wave', 'ring', 'branch'], wave: ['spiral', 'drip', 'stripe'], fold: ['layers', 'grooves', 'press'],
  blob: ['press', 'drip', 'cluster'], drip: ['wave', 'blob', 'veil'], crack: ['branch', 'mesh', 'fold'],
  veil: ['shell', 'wave', 'layers'], press: ['layers', 'blob', 'fold'],
};
export function distinctGlyphs(list) {
  const used = new Set();
  for (const f of list) {
    let g = f.glyph;
    if (used.has(g)) {
      const text = `${f.title || ''} ${f.desc || ''}`;
      g = (NEAR[g] || []).find((x) => !used.has(x))
        || GUESS.map(([t]) => t).find((t, i) => !used.has(t) && GUESS[i][1].test(text))
        || Object.keys(GLYPH_TYPES).find((t) => !used.has(t));
    }
    f.glyph = g;
    used.add(g);
  }
  return list;
}

/* ---------- 질감·색 차이 ----------
   보이는 특징(입자 계열): 고운 입자 / 굵은 얼룩 입자 / 사선 판화
   알려진 성질(망점 계열): 작은 망점 / 큰 망점
   같은 음식 안에서도 특징마다 색을 조금씩 진하게·옅게 */
export function textureFor(known, i) { return known ? ['halftone', 'halftoneBig'][i % 2] : ['grain', 'coarse', 'hatch'][i % 3]; }
export function shade(hex, t) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m || !t) return hex;
  const n = parseInt(m[1], 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// 같은 특징은 늘 같은 모양이 되도록 번호로 정해지는 무작위 수
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const f1 = (n) => Math.round(n * 10) / 10;

/* 도형 모양 (100×100 칸)
   p = 모양 값 (분석 AI가 특징마다 정함. 없으면 종류별 기본값)
     count     반복 개수 (홈·가시·꽃잎·층·갈래·줄·구멍 수)
     weight    굵기 0 가늘게 ~ 1 두껍게
     taper     크기 변화 -1 끝으로 갈수록 작아짐 ~ 0 고름 ~ 1 커짐
     sharp     0 둥글게 ~ 1 뾰족하게
     spread    0 촘촘하게 모임 ~ 1 듬성하게 퍼짐
     irregular 0 고르게 ~ 1 불규칙하게
     dir       방향: up 위로 / down 아래로 / side 옆으로 / out 사방으로
   반환: fill 면, stroke 굵은 띠(width), goo 메타볼(녹아 붙는 원), rotate 회전 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DIR = { up: 0, down: 180, side: 90, out: 0 };
const DEFAULTS = {
  grooves: { count: 10 }, stripe: { count: 6 }, layers: { count: 4 }, branch: { count: 4 }, petals: { count: 7 },
  burst: { count: 18, sharp: 0.8 }, dots: { count: 7 }, cluster: { count: 10 }, pores: { count: 6 }, mesh: { count: 3 },
  ring: { count: 1 }, shell: { count: 1 }, spiral: { count: 3 }, wave: { count: 2 }, fold: { count: 4 },
  blob: { count: 6 }, drip: { count: 4 }, crack: { count: 2 }, veil: { count: 3 }, press: { count: 2 },
};
export function shapeParams(type, raw = {}) {
  const d = DEFAULTS[type] || {};
  const num = (k, def, a, b) => clamp(Number.isFinite(raw?.[k]) ? raw[k] : def, a, b);
  return {
    count: Math.round(num('count', d.count ?? 5, 1, 40)),
    weight: num('weight', d.weight ?? 0.5, 0, 1),
    taper: num('taper', d.taper ?? 0, -1, 1),
    sharp: num('sharp', d.sharp ?? 0.3, 0, 1),
    spread: num('spread', d.spread ?? 0.5, 0, 1),
    irregular: num('irregular', d.irregular ?? 0.3, 0, 1),
    dir: DIR[raw?.dir] !== undefined ? raw.dir : 'out',
  };
}
const circle = (x, y, R) => `M${f1(x - R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x + R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x - R)} ${f1(y)}Z`;
const P = (pts) => `M${pts.map((q) => `${f1(q[0])} ${f1(q[1])}`).join(' L')}Z`;
// 매끈한 닫힌 곡선 (점들의 중간점을 이어 부드럽게)
const smooth = (pts) => {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[0], pts[1]);
  let d = `M${f1(m0[0])} ${f1(m0[1])}`;
  for (let i = 1; i <= n; i++) {
    const q = pts[i % n];
    const m = mid(q, pts[(i + 1) % n]);
    d += ` Q${f1(q[0])} ${f1(q[1])} ${f1(m[0])} ${f1(m[1])}`;
  }
  return `${d}Z`;
};
// 둘레 반지름 함수로 닫힌 모양 (많은 점 → 매끈)
const radial = (fn, N = 180) => P(Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2 - Math.PI / 2;
  const R = fn(a, i / N);
  return [50 + Math.cos(a) * R, 50 + Math.sin(a) * R];
}));
const pill = (x, y, w, h, rr) => `M${f1(x + rr)} ${f1(y)} h${f1(w - 2 * rr)} a${f1(rr)} ${f1(rr)} 0 0 1 ${f1(rr)} ${f1(rr)} v${f1(h - 2 * rr)} a${f1(rr)} ${f1(rr)} 0 0 1 ${f1(-rr)} ${f1(rr)} h${f1(-(w - 2 * rr))} a${f1(rr)} ${f1(rr)} 0 0 1 ${f1(-rr)} ${f1(-rr)} v${f1(-(h - 2 * rr))} a${f1(rr)} ${f1(rr)} 0 0 1 ${f1(rr)} ${f1(-rr)}Z`;

function shapes(type, r, p) {
  const { weight: W, taper: T, sharp: SH, spread: SP, irregular: IR } = p;
  const jit = () => 1 + (r() - 0.5) * 2 * IR * 0.35; // 불규칙함만큼 흔들기
  const rotate = DIR[p.dir] || 0;
  const flat = p.dir === 'up' || p.dir === 'down' ? 90 : 0; // 가로로 그린 도형용
  const hang = { down: 0, up: 180, side: 90, out: 0 }[p.dir] || 0; // 아래로 늘어진 도형용
  switch (type) {
    // 둘레 톱니·홈: 개수만큼 반복, 둥근 혹 ↔ 뾰족한 톱니
    case 'grooves': {
      const n = clamp(p.count, 5, 28);
      const amp = 4 + W * 7;
      const base = 40 - amp;
      const teeth = Array.from({ length: n }, jit);
      return { fill: [radial((a, t) => {
        const k = t * n;
        const u = k % 1;
        const round = Math.pow(Math.sin(Math.PI * u), 0.55);
        const tri = 1 - Math.abs(2 * u - 1);
        return base + amp * teeth[Math.floor(k) % n] * (round * (1 - SH) + tri * SH);
      }, 240)] };
    }
    // 나란한 줄: 개수, 굵기, 끝으로 갈수록 가늘어짐
    case 'stripe': {
      const n = clamp(p.count, 2, 12);
      const gap = 76 / n;
      return { fill: Array.from({ length: n }, (_, i) => {
        const k = n > 1 ? i / (n - 1) : 0;
        const h = clamp(gap * (0.35 + W * 0.5) * (1 + T * (k - 0.5)), 2, gap * 0.95) * jit();
        const y = 12 + gap * i + (gap - h) / 2;
        const len = 76 * (1 - IR * 0.4 * r());
        return pill(50 - len / 2, y, len, h, h / 2 * (1 - SH * 0.85));
      }), rotate: flat };
    }
    // 층·계단: 개수, 위로 좁아짐(taper<0)/넓어짐(taper>0), 모서리 둥긂
    case 'layers': {
      const n = clamp(p.count, 2, 8);
      const step = 78 / n;
      const h = step * (0.55 + W * 0.35);
      return { fill: Array.from({ length: n }, (_, i) => {
        const k = n > 1 ? i / (n - 1) : 0; // 0 아래 ~ 1 위
        const w = clamp(84 * (1 + T * (k - 0.5) * 1.1), 14, 92) * jit();
        const y = 89 - step * (i + 1) + (step - h) / 2;
        return pill(50 - w / 2 + (r() - .5) * IR * 10, y, w, h, h / 2 * (1 - SH));
      }), rotate };
    }
    // 가지: 갈라지는 횟수, 벌어지는 각도(spread), 굵기, 끝으로 갈수록 가늘게
    case 'branch': {
      const depth = clamp(p.count, 2, 5);
      const dots = [];
      const links = [];
      const len0 = 80 / (depth + 0.6);
      const grow = (x, y, a, len, d) => {
        const x2 = x + Math.cos(a) * len;
        const y2 = y + Math.sin(a) * len;
        links.push(`M${f1(x)} ${f1(y)} L${f1(x2)} ${f1(y2)}`);
        dots.push(circle(x2, y2, (1.4 + W * 2.6) * (0.5 + d / depth * 0.7)));
        if (d > 1) {
          const sp = (0.3 + SP * 0.6) * jit();
          const shrink = clamp(0.78 + T * 0.15, 0.55, 0.95);
          grow(x2, y2, a - sp, len * shrink * jit(), d - 1);
          grow(x2, y2, a + sp, len * shrink * jit(), d - 1);
        }
      };
      dots.push(circle(50, 92, 3 + W * 5));
      grow(50, 92, -Math.PI / 2, len0, depth);
      return { goo: dots, gooStroke: links, width: 1.4 + W * 3.2, rotate, blur: 1.2 };
    }
    // 꽃잎: 개수, 길이 차이(irregular), 둥근↔뾰족 끝
    case 'petals': {
      const n = clamp(p.count, 3, 14);
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const L = (24 + SP * 16) * jit();
        const w = (0.18 + W * 0.3) * (6 / n + 0.5);
        const tip = [50 + Math.cos(a) * L, 50 + Math.sin(a) * L];
        const side = (s2) => [50 + Math.cos(a + s2 * w) * L * 0.62, 50 + Math.sin(a + s2 * w) * L * 0.62];
        out.push(SH > 0.5 ? P([[50, 50], side(-1), tip, side(1)]) : smooth([[50, 50], side(-1), tip, side(1)]));
      }
      out.push(circle(50, 50, 6 + W * 6));
      return { fill: out, rotate };
    }
    // 가시: 개수, 길이, 뾰족함
    case 'burst': {
      const n = clamp(p.count, 6, 40);
      const inner = 10 + W * 12;
      const lens = Array.from({ length: n }, () => (30 + SP * 14) * jit());
      return { fill: [radial((a, t) => {
        const k = t * n;
        const u = k % 1;
        const tri = 1 - Math.abs(2 * u - 1);
        const shape = Math.pow(tri, 1 + SH * 5);
        return inner + (lens[Math.floor(k) % n] - inner) * shape;
      }, 400)] };
    }
    // 망점: 한 줄 개수, 가운데↔바깥 크기 변화(taper), 간격(spread)
    case 'dots': {
      const n = clamp(p.count, 4, 12);
      const step = 80 / n;
      const out = [];
      for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
        const x = 10 + step * (ix + 0.5) + (r() - .5) * IR * step * 0.6;
        const y = 10 + step * (iy + 0.5) + (r() - .5) * IR * step * 0.6;
        const d = Math.hypot(x - 50, y - 50) / 42;
        if (d > 1) continue;
        const k = T >= 0 ? 1 - d * T : 1 + d * T + (-T); // taper>0: 가운데가 큼, <0: 바깥이 큼
        const R = step * (0.22 + W * 0.28) * clamp(k, 0.3, 1.4) * (1 - SP * 0.3);
        out.push(circle(x, y, Math.max(1.8, R)));
      }
      return { goo: out };
    }
    // 송이: 개수, 모임↔퍼짐, 크기 차이
    case 'cluster': {
      const n = clamp(p.count, 3, 20);
      const out = [];
      const Rbase = 9 + W * 9 - n * 0.25;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * (14 + SP * 20);
        out.push(circle(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, Math.max(3, Rbase * jit())));
      }
      return { goo: out };
    }
    // 작은 구멍 여러 개 (덩어리에 숭숭)
    case 'pores': {
      const n = clamp(p.count, 2, 18);
      const holes = [];
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 24;
        holes.push(circle(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, (3 + (1 - SP) * 3 + W * 3) * jit()));
      }
      const body = smooth(Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; const R = 40 * (1 - IR * 0.15 * r()); return [50 + Math.cos(a) * R, 50 + Math.sin(a) * R]; }));
      return { fill: [`${body} ${holes.join(' ')}`], evenodd: true };
    }
    // 그물·격자: 칸 수, 칸 사이 두께
    case 'mesh': {
      const n = clamp(p.count, 2, 7);
      const holes = [];
      const cell = 72 / n;
      const hole = cell * (0.75 - W * 0.4);
      for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
        const cx = 14 + cell * (ix + 0.5);
        const cy = 14 + cell * (iy + 0.5);
        const h = hole * jit();
        holes.push(pill(cx - h / 2, cy - h / 2, h, h, h / 2 * (1 - SH)));
      }
      return { fill: [`${pill(8, 8, 84, 84, 18 * (1 - SH) + 4)} ${holes.join(' ')}`], evenodd: true, rotate: SP * 45 };
    }
    // 고리: 겹 수, 구멍 크기(spread), 두께
    case 'ring': {
      const n = clamp(p.count, 1, 4);
      const out = [];
      const t = (40 / n) * (0.35 + W * 0.5);
      for (let i = 0; i < n; i++) {
        const R = 42 - i * (40 / n);
        const ri = Math.max(2, R - t);
        out.push(`${circle(50, 50, R)} ${circle(50 + (r() - .5) * IR * 8, 50 + (r() - .5) * IR * 8, ri)}`);
      }
      return { fill: out, evenodd: true };
    }
    // 껍질: 한쪽이 열린 두꺼운 C 모양
    case 'shell': {
      const open = 0.4 + SP * 1.6; // 열린 각도 (라디안)
      const R = 36;
      const t = 8 + W * 16;
      const a0 = open / 2;
      const a1 = Math.PI * 2 - open / 2;
      const pt = (rad, a) => `${f1(50 + Math.cos(a) * rad)} ${f1(50 + Math.sin(a) * rad)}`;
      const cap = t / 2;
      const d = `M${pt(R, a0)} A${R} ${R} 0 1 1 ${pt(R, a1)} A${f1(cap)} ${f1(cap)} 0 0 1 ${pt(R - t, a1)} A${f1(R - t)} ${f1(R - t)} 0 1 0 ${pt(R - t, a0)} A${f1(cap)} ${f1(cap)} 0 0 1 ${pt(R, a0)}Z`;
      return { fill: [d], rotate: rotate + 0 };
    }
    // 나선: 감긴 횟수, 굵기
    case 'spiral': {
      const turns = clamp(p.count, 1, 6);
      const max = 40;
      let d = '';
      const steps = turns * 40;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = t * turns * Math.PI * 2;
        const R = 4 + (max - 4) * Math.pow(t, 1 + T * 0.6);
        d += `${i ? ' L' : 'M'}${f1(50 + Math.cos(a) * R)} ${f1(50 + Math.sin(a) * R)}`;
      }
      return { stroke: [d], width: clamp((3 + W * 12) / Math.sqrt(turns) * 1.6, 2, 16), rotate };
    }
    // 물결: 물결 수, 높이(spread), 굵기
    case 'wave': {
      const n = clamp(p.count, 1, 6);
      const amp = 8 + SP * 22;
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const x = 10 + (80 * i) / 120;
        const k = i / 120;
        const s = Math.sin(k * Math.PI * 2 * n);
        const y = 50 + amp * (SH > 0.5 ? Math.asin(s) / (Math.PI / 2) : s) * (1 + T * (k - 0.5));
        d += `${i ? ' L' : 'M'}${f1(x)} ${f1(y)}`;
      }
      return { stroke: [d], width: 4 + W * 16, rotate: flat };
    }
    // 접힘: 접힌 횟수, 굵기
    case 'fold': {
      const n = clamp(p.count, 2, 10);
      const amp = 14 + SP * 18;
      const pts = Array.from({ length: n + 1 }, (_, i) => `${f1(10 + (80 * i) / n)} ${f1(50 + (i % 2 ? amp : -amp) * jit())}`);
      return { stroke: [`M${pts.join(' L')}`], width: 4 + W * 14, sharpJoin: SH > 0.4, rotate: flat };
    }
    // 말랑한 덩어리: 불룩한 곳 수, 둥근↔뾰족
    case 'blob': {
      const n = clamp(p.count, 3, 10);
      const pts = Array.from({ length: n * 2 }, (_, i) => {
        const a = (i / (n * 2)) * Math.PI * 2;
        const R = (i % 2 ? 26 + (1 - SH) * 8 : 38 + SP * 6) * jit();
        return [50 + Math.cos(a) * R, 50 + Math.sin(a) * R];
      });
      return { fill: [SH > 0.6 ? P(pts) : smooth(pts)] };
    }
    // 흘러내림: 방울 수, 길이 차이
    case 'drip': {
      const n = clamp(p.count, 2, 9);
      const out = [pill(8, 14, 84, 22 + W * 10, 10)];
      const w = (70 / n) * (0.45 + W * 0.4);
      for (let i = 0; i < n; i++) {
        const x = 14 + ((72 - w) * (n > 1 ? i / (n - 1) : 0.5)) + w / 2;
        const L = (24 + SP * 34) * jit() * (1 + T * ((i / Math.max(1, n - 1)) - 0.5));
        out.push(pill(x - w / 2, 20, w, clamp(L + 16, 20, 78), w / 2));
      }
      return { goo: out, rotate: hang };
    }
    // 갈라짐: 조각 수, 틈(spread)
    case 'crack': {
      const n = clamp(p.count, 2, 6);
      const gap = 2 + SP * 7;
      const out = [];
      const cuts = Array.from({ length: n - 1 }, (_, i) => 10 + (80 * (i + 1)) / n + (r() - .5) * IR * 10);
      const edges = [10, ...cuts, 90];
      for (let i = 0; i < n; i++) {
        const x0 = edges[i] + (i ? gap / 2 : 0);
        const x1 = edges[i + 1] - (i < n - 1 ? gap / 2 : 0);
        const zig = (x, s2) => [x + s2 * (SH * 6) * (r() - .5), 0];
        out.push(P([[x0, 14], [x1, 14], [x1 + zig(0, 1)[0], 40], [x1, 62], [x1 + zig(0, -1)[0], 86], [x0, 86], [x0 + zig(0, 1)[0], 60], [x0, 38]]));
      }
      return { fill: out, rotate: flat + 15 };
    }
    // 겹친 반투명 원: 개수, 겹침 정도(spread)
    case 'veil': {
      const n = clamp(p.count, 2, 6);
      const R = 18 + W * 12;
      const d = 6 + SP * 16;
      return { fill: Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return circle(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, R * jit()); }), opacity: 0.55 };
    }
    // 눌림: 납작한 판 수, 눌린 정도(weight가 클수록 더 납작)
    case 'press':
    default: {
      const n = clamp(p.count, 1, 5);
      const h = (60 / n) * (0.75 - W * 0.4);
      return { fill: Array.from({ length: n }, (_, i) => {
        const k = n > 1 ? i / (n - 1) : 0;
        const w = clamp(88 * (1 - T * (k - 0.5) * 0.8), 20, 92) * jit();
        const y = 50 - (n * (h + 4)) / 2 + i * (h + 4);
        return pill(50 - w / 2, y, w, h, h / 2 * (1 - SH));
      }) };
    }
  }
}

// 도형 그리기 → SVG 글자 (viewBox 0 0 100 100)
// color: 음식 대표색(선명하게), texture: 'grain'(고운 입자) 'coarse'(굵은 얼룩) 'hatch'(사선) / 'halftone'(망점) 'halftoneBig'(큰 망점)
let uid = 0;
export function glyphSVG(type, color = '#212121', seed = '', texture = 'grain', params = null) {
  const r = rng(seed + type);
  const sh = shapes(type, r, shapeParams(type, params || {}));
  const id = `g${++uid}`;
  // 질감: 도형 안에서만 보이게 (operator="in")
  const grain = `<filter id="${id}t" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">`
    + `<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${Math.floor(r() * 99)}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 .42" result="d"/>`
    + `<feComposite in="d" in2="SourceGraphic" operator="in" result="g"/>`
    + `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="g"/></feMerge></filter>`;
  // 망점 (큰 망점은 간격·점을 키움)
  const hs = texture === 'halftoneBig' ? 9 : 5;
  const half = `<pattern id="${id}h" patternUnits="userSpaceOnUse" width="${hs}" height="${hs}" patternTransform="rotate(${f1(15 + r() * 30)})">`
    + `<circle cx="${hs / 2}" cy="${hs / 2}" r="${texture === 'halftoneBig' ? 2.7 : 1.25}" fill="#000" fill-opacity="${texture === 'halftoneBig' ? '.2' : '.22'}"/></pattern>`;
  // 사선 판화 질감
  const hatch = `<pattern id="${id}l" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(${f1(30 + r() * 40)})">`
    + `<rect width="1.4" height="4" fill="#000" fill-opacity=".2"/></pattern>`;
  // 굵은 얼룩 입자 (리소 인쇄의 고르지 않은 잉크)
  const coarse = `<filter id="${id}c" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">`
    + `<feTurbulence type="fractalNoise" baseFrequency=".28" numOctaves="2" seed="${Math.floor(r() * 99)}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.05" result="d"/>`
    + `<feComposite in="d" in2="SourceGraphic" operator="in" result="g"/>`
    + `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="g"/></feMerge></filter>`;
  // 메타볼: 흐리게 한 뒤 경계를 다시 또렷하게 → 가까운 원끼리 녹아 붙음
  const goo = `<filter id="${id}g" filterUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><feGaussianBlur stdDeviation="${sh.blur ?? 1.7}"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter>`;
  const op = sh.opacity ? ` fill-opacity="${sh.opacity}"` : '';
  const ev = sh.evenodd ? ' fill-rule="evenodd"' : '';
  const body = (paint) => {
    let b = (sh.fill || []).map((d) => `<path d="${d}" fill="${paint}"${op}${ev}/>`).join('');
    b += (sh.stroke || []).map((d) => `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${f1(sh.width)}" stroke-linecap="round" stroke-linejoin="${sh.sharpJoin ? 'miter' : 'round'}"/>`).join('');
    if (sh.goo) {
      const inner = sh.goo.map((d) => `<path d="${d}" fill="${paint}"/>`).join('')
        + (sh.gooStroke || []).map((d) => `<path d="${d}" stroke="${paint}" stroke-width="${f1(sh.width)}" stroke-linecap="round"/>`).join('');
      b += paint === color ? `<g filter="url(#${id}g)">${inner}</g>` : inner;
    }
    return b;
  };
  let svg = `<defs>${grain}${half}${hatch}${coarse}${goo}</defs>`;
  if (texture === 'halftone' || texture === 'halftoneBig') svg += `<g>${body(color)}</g><g>${body(`url(#${id}h)`)}</g>`;
  else if (texture === 'hatch') svg += `<g>${body(color)}</g><g>${body(`url(#${id}l)`)}</g>`;
  else if (texture === 'coarse') svg += `<g filter="url(#${id}c)">${body(color)}</g>`;
  else svg += `<g filter="url(#${id}t)">${body(color)}</g>`;
  // 방향(위·아래·옆)에 맞게 돌리기
  if (sh.rotate) svg = `<g transform="rotate(${f1(sh.rotate)} 50 50)">${svg}</g>`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${svg}</svg>`;
}

// 사진 대표색을 리소 인쇄처럼 선명하게 (채도 올리고 밝기 맞춤)
export function vivid(rgb) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb || '');
  if (!m) return '#ff2d6f';
  let [R, G, B] = m.slice(1).map((v) => v / 255);
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  let h = 0;
  const d = max - min;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  if (h < 0) h += 360;
  // 회색에 가까운 음식(밥, 두부 등)은 기본 핑크
  if (d < 0.08) return '#ff2d6f';
  return `hsl(${Math.round(h)}, 88%, ${h > 40 && h < 75 ? 52 : 48}%)`;
}

// 사진의 대표색 (배경이 지워진 부분은 빼고, 너무 흰 곳도 뺌). 못 구하면 기본 검정
export async function dominantColor(src) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 40, 40);
    const d = g.getImageData(0, 0, 40, 40).data;
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, gg, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]];
      if (a < 128 || (r > 235 && gg > 235 && b > 235)) continue;
      const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      const w = 1 + sat / 40; // 색이 진한 곳을 더 많이 반영
      R += r * w; G += gg * w; B += b * w; n += w;
    }
    if (!n) return '#212121';
    // 조금 진하게 (흰 배경에서 잘 보이게)
    const k = 0.82;
    return `rgb(${Math.round((R / n) * k)}, ${Math.round((G / n) * k)}, ${Math.round((B / n) * k)})`;
  } catch {
    return '#212121';
  }
}
