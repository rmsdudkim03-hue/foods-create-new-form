/* =========================================================
   특징 도형 (나만의 조합 화면)
   분석된 특징 하나를 글 대신 작은 도형 기호로 보여줌
   - 도형 종류는 분석 AI가 특징마다 하나 고름 (api/analyze의 glyph)
   - AI가 안 골랐으면(예전 분석, 데모) 제목·설명의 낱말로 추측
   - 모든 도형은 100×100 칸에 그리고, 색은 음식 사진의 대표색을 선명하게 바꾼 것
   - 실제 사진은 쓰지 않고 색과 그래픽 질감만 (보이는 특징: 입자 / 알려진 성질: 망점)
   ========================================================= */

// 도형 종류: 이름 → 어떤 특징에 쓰는지 (api/analyze.js 목록과 같아야 함)
export const GLYPH_TYPES = {
  dots: '작은 알갱이, 반복되는 점, 표면 밀도',
  grooves: '홈, 주름, 세로·가로 줄무늬',
  layers: '층, 계단, 겹겹이 쌓임',
  branch: '가지, 갈라짐, 뻗어 나감',
  ring: '구멍, 고리, 빈 공간, 테두리',
  spiral: '나선, 꼬임, 감김',
  wave: '물결, 곡률, 휘어짐, 유연함',
  burst: '방사, 펼쳐짐, 팽창',
  blob: '말랑함, 탄성, 둥근 덩어리',
  crack: '갈라짐, 파단, 깨짐, 분리',
  veil: '투명함, 얇음, 빛 통과, 겹침',
  press: '압축, 눌림, 납작함',
  fold: '접힘, 주름진 막',
  cluster: '송이, 뭉침, 모여 있음',
};

// AI가 도형을 안 골랐을 때: 낱말로 추측 (앞에 있는 규칙이 먼저)
const GUESS = [
  ['branch', /가지|갈래|갈라지|줄기|뻗/],
  ['cluster', /송이|뭉치|뭉쳐|모여|덩이들|무리/],
  ['dots', /알갱이|점|밀도|오돌|촘촘|입자|씨/],
  ['grooves', /홈|줄무늬|골|세로|가로줄|결/],
  ['layers', /층|계단|단을|겹겹|쌓/],
  ['ring', /구멍|고리|빈 공간|테두리|둘레|링/],
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

// 같은 특징은 늘 같은 모양이 되도록 번호로 정해지는 무작위 수
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const f1 = (n) => Math.round(n * 10) / 10;

// 원 하나를 path로 (여러 개를 한 path에 모을 때)
const circle = (x, y, R) => `M${f1(x - R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x + R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x - R)} ${f1(y)}Z`;

// 도형 모양 (100×100 칸)
// fill: 면, stroke: 굵은 띠, goo: 메타볼(동그라미들이 녹아 붙은 모양. 가지·송이·점에 씀)
function shapes(type, r) {
  const P = (pts) => `M${pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(' L')}Z`;
  // 매끈한 닫힌 곡선 (점들의 중간점을 이어 부드럽게)
  const smooth = (pts) => {
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = `M${f1(mid(pts[0], pts[1])[0])} ${f1(mid(pts[0], pts[1])[1])}`;
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n];
      const m = mid(p, pts[(i + 1) % n]);
      d += ` Q${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`;
    }
    return `${d}Z`;
  };
  const polar = (n, rad) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const R = rad(i, a);
    return [50 + Math.cos(a) * R, 50 + Math.sin(a) * R];
  });
  switch (type) {
    // 가시 별 (방사·팽창)
    case 'burst': return { fill: [P(polar(36, (i) => (i % 2 ? 14 + r() * 4 : 34 + r() * 12)))] };
    // 말랑한 덩어리
    case 'blob': return { fill: [smooth(polar(6, () => 30 + r() * 13))] };
    // 둥근 톱니 꽃 (홈·주름이 둘레를 따라 반복)
    case 'grooves': {
      const n = 10;
      const out = [circle(50, 50, 30)];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; out.push(circle(50 + Math.cos(a) * 31, 50 + Math.sin(a) * 31, 12)); }
      return { fill: out };
    }
    // 가지: 마디(원)가 굵은 줄기로 이어지며 갈라짐 → 메타볼로 녹여 붙임
    case 'branch': {
      const dots = [];
      const links = [];
      const grow = (x, y, a, len, depth) => {
        const x2 = x + Math.cos(a) * len;
        const y2 = y + Math.sin(a) * len;
        links.push(`M${f1(x)} ${f1(y)} L${f1(x2)} ${f1(y2)}`);
        dots.push(circle(x2, y2, 2.4 + depth * 1.3));
        if (depth > 1) {
          const sp = 0.55 + r() * 0.25;
          grow(x2, y2, a - sp, len * 0.78, depth - 1);
          grow(x2, y2, a + sp, len * 0.78, depth - 1);
        }
      };
      dots.push(circle(50, 94, 6.5));
      grow(50, 94, -Math.PI / 2, 26, 4);
      return { goo: dots, gooStroke: links, width: 3.4 };
    }
    // 도넛 (구멍·빈 공간)
    case 'ring': return { fill: [`${circle(50, 50, 40)} ${circle(54, 46, 15)}`], evenodd: true };
    // 굵은 나선
    case 'spiral': {
      let d = 'M50 50';
      for (let t = 0.6; t < Math.PI * 4.4; t += 0.2) d += ` L${f1(50 + Math.cos(t) * t * 2.9)} ${f1(50 + Math.sin(t) * t * 2.9)}`;
      return { stroke: [d], width: 11 };
    }
    // 굵은 물결 띠
    case 'wave': return { stroke: [`M12 ${f1(30 + r() * 8)} C32 4 40 52 50 50 S70 92 88 ${f1(66 + r() * 8)}`], width: 20 };
    // 쌓인 알약 (층·계단)
    case 'layers': return { fill: [0, 1, 2, 3].map((i) => { const w = 84 - i * 17; const y = 70 - i * 17; return `M${f1(50 - w / 2 + (r() - .5) * 8)} ${y} h${f1(w)} a7.5 7.5 0 0 1 0 15 h${f1(-w)} a7.5 7.5 0 0 1 0 -15Z`; }) };
    // 쪼개진 두 조각
    case 'crack': return { fill: [P([[10, 22], [48, 14], [40, 42], [54, 58], [42, 88], [14, 76]]), P([[58, 12], [90, 26], [88, 82], [50, 88], [62, 58], [48, 40]])] };
    // 반투명하게 겹친 원 (투명·얇음)
    case 'veil': return { fill: [circle(38, 42, 25), circle(62, 44, 25), circle(50, 64, 25)], opacity: 0.55 };
    // 눌린 알약 (압축)
    case 'press': return { fill: ['M6 60 C6 46 94 46 94 60 C94 74 6 74 6 60Z', 'M20 36 C20 26 80 26 80 36 C80 46 20 46 20 36Z'] };
    // 굵은 지그재그 (접힘)
    case 'fold': return { stroke: ['M10 30 L30 72 L50 30 L70 72 L90 30'], width: 16 };
    // 점이 커졌다 작아지는 망점 (알갱이·밀도) → 큰 점끼리는 녹아 붙음
    case 'dots': {
      const out = [];
      for (let y = 14; y <= 86; y += 12) for (let x = 14; x <= 86; x += 12) {
        const d = Math.hypot(x - 50, y - 50);
        if (d > 42) continue;
        out.push(circle(x + (r() - .5) * 2, y + (r() - .5) * 2, Math.max(1.6, 6.6 - d * 0.11)));
      }
      return { goo: out };
    }
    // 송이: 크고 작은 원이 뭉쳐 녹아 붙음
    case 'cluster':
    default: {
      const out = [];
      for (let i = 0; i < 11; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 26;
        out.push(circle(50 + Math.cos(a) * d, 50 + Math.sin(a) * d, 9 + r() * 9));
      }
      for (let i = 0; i < 5; i++) {
        const a = r() * Math.PI * 2;
        out.push(circle(50 + Math.cos(a) * 42, 50 + Math.sin(a) * 42, 3 + r() * 2.5));
      }
      return { goo: out };
    }
  }
}

// 도형 그리기 → SVG 글자 (viewBox 0 0 100 100)
// color: 음식 대표색(선명하게), texture: 'grain'(리소 인쇄 같은 입자) 또는 'halftone'(망점)
let uid = 0;
export function glyphSVG(type, color = '#212121', seed = '', texture = 'grain') {
  const r = rng(seed + type);
  const sh = shapes(type, r);
  const id = `g${++uid}`;
  // 질감: 도형 안에서만 보이게 (operator="in")
  const grain = `<filter id="${id}t" x="0" y="0" width="100%" height="100%">`
    + `<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${Math.floor(r() * 99)}" result="n"/>`
    + `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 .42" result="d"/>`
    + `<feComposite in="d" in2="SourceGraphic" operator="in" result="g"/>`
    + `<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="g"/></feMerge></filter>`;
  const half = `<pattern id="${id}h" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(${f1(15 + r() * 30)})">`
    + `<circle cx="2.5" cy="2.5" r="1.25" fill="#000" fill-opacity=".22"/></pattern>`;
  // 메타볼: 흐리게 한 뒤 경계를 다시 또렷하게 → 가까운 원끼리 녹아 붙음
  const goo = `<filter id="${id}g"><feGaussianBlur stdDeviation="1.7"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"/></filter>`;
  const op = sh.opacity ? ` fill-opacity="${sh.opacity}"` : '';
  const ev = sh.evenodd ? ' fill-rule="evenodd"' : '';
  const body = (paint) => {
    let b = (sh.fill || []).map((d) => `<path d="${d}" fill="${paint}"${op}${ev}/>`).join('');
    b += (sh.stroke || []).map((d) => `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${sh.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    if (sh.goo) {
      const inner = sh.goo.map((d) => `<path d="${d}" fill="${paint}"/>`).join('')
        + (sh.gooStroke || []).map((d) => `<path d="${d}" stroke="${paint}" stroke-width="${sh.width}" stroke-linecap="round"/>`).join('');
      b += paint === color ? `<g filter="url(#${id}g)">${inner}</g>` : inner;
    }
    return b;
  };
  let svg = `<defs>${grain}${half}${goo}</defs>`;
  if (texture === 'halftone') svg += `<g>${body(color)}</g><g>${body(`url(#${id}h)`)}</g>`;
  else svg += `<g filter="url(#${id}t)">${body(color)}</g>`;
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
