/* =========================================================
   특징 도형 (나만의 조합 화면)
   분석된 특징 하나를 글 대신 작은 도형 기호로 보여줌
   - 도형 종류는 분석 AI가 특징마다 하나 고름 (api/analyze의 glyph)
   - AI가 안 골랐으면(예전 분석, 데모) 제목·설명의 낱말로 추측
   - 모든 도형은 100×100 칸에 그리고, 색은 그 음식 사진의 대표색
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

// 도형 모양 (100×100 칸). 'fill'은 면, 'stroke'는 굵은 띠 → 둘 다 음식 사진 질감으로 채움
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
    case 'burst': return { fill: [P(polar(56, (i) => (i % 2 ? 20 + r() * 6 : 34 + r() * 14)))] };
    case 'blob': return { fill: [smooth(polar(7, () => 30 + r() * 14))] };
    case 'grooves': return { fill: [smooth(polar(48, (i) => 38 + (i % 4 < 2 ? 6 : -2)))] };
    case 'branch': {
      const out = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r() * 0.3;
        const L = 26 + r() * 20;
        const w = 0.32;
        out.push(smooth([[50, 50], [50 + Math.cos(a - w) * L * 0.7, 50 + Math.sin(a - w) * L * 0.7], [50 + Math.cos(a) * L, 50 + Math.sin(a) * L], [50 + Math.cos(a + w) * L * 0.7, 50 + Math.sin(a + w) * L * 0.7]]));
      }
      out.push('M38 50 A12 12 0 1 0 62 50 A12 12 0 1 0 38 50Z');
      return { fill: out };
    }
    case 'ring': return { fill: ['M8 50 A42 42 0 1 0 92 50 A42 42 0 1 0 8 50Z M36 46 A16 16 0 1 1 68 46 A16 16 0 1 1 36 46Z'], evenodd: true };
    case 'spiral': {
      let d = 'M50 50';
      for (let t = 0.6; t < Math.PI * 4.4; t += 0.2) d += ` L${f1(50 + Math.cos(t) * t * 2.9)} ${f1(50 + Math.sin(t) * t * 2.9)}`;
      return { stroke: [d], width: 11 };
    }
    case 'wave': return { stroke: [`M14 ${f1(30 + r() * 8)} C34 4 40 52 50 50 S70 92 86 ${f1(66 + r() * 8)}`], width: 22 };
    case 'layers': return { fill: [0, 1, 2, 3].map((i) => { const w = 84 - i * 16; const y = 70 - i * 17; return `M${f1(50 - w / 2 + (r() - .5) * 6)} ${y} h${f1(w)} a7 7 0 0 1 0 14 h${f1(-w)} a7 7 0 0 1 0 -14Z`; }) };
    case 'crack': return { fill: [P([[10, 22], [48, 14], [40, 42], [54, 58], [42, 88], [14, 76]]), P([[58, 12], [90, 26], [88, 82], [50, 88], [62, 58], [48, 40]])] };
    case 'veil': return { fill: ['M14 44 A24 24 0 1 0 62 44 A24 24 0 1 0 14 44Z', 'M38 46 A24 24 0 1 0 86 46 A24 24 0 1 0 38 46Z', 'M26 64 A24 24 0 1 0 74 64 A24 24 0 1 0 26 64Z'], opacity: 0.62 };
    case 'press': return { fill: ['M6 58 C6 44 94 44 94 58 C94 72 6 72 6 58Z', 'M18 38 C18 28 82 28 82 38 C82 48 18 48 18 38Z'] };
    case 'fold': return { stroke: ['M10 28 L30 74 L50 28 L70 74 L90 28'], width: 17 };
    case 'dots': {
      const out = [];
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 38;
        const R = 3.5 + r() * 4;
        const x = 50 + Math.cos(a) * d;
        const y = 50 + Math.sin(a) * d;
        out.push(`M${f1(x - R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x + R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x - R)} ${f1(y)}Z`);
      }
      return { fill: out };
    }
    case 'cluster':
    default: {
      const out = [];
      for (let i = 0; i < 9; i++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 24;
        const R = 12 + r() * 9;
        const x = 50 + Math.cos(a) * d;
        const y = 50 + Math.sin(a) * d;
        out.push(`M${f1(x - R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x + R)} ${f1(y)} A${f1(R)} ${f1(R)} 0 1 0 ${f1(x - R)} ${f1(y)}Z`);
      }
      return { fill: out };
    }
  }
}

// 도형 그리기 → SVG 글자 (viewBox 0 0 100 100)
// texture: 음식 사진 질감(작은 이미지 주소)이 있으면 도형을 그 질감으로 채움 (사과 사진을 도형으로 오린 느낌)
//          없으면 color 단색으로 채움
let uid = 0;
export function glyphSVG(type, color = '#212121', seed = '', texture = null) {
  const r = rng(seed + type);
  const sh = shapes(type, r);
  const id = `gt${++uid}`;
  let paint = color;
  let defs = '';
  if (texture) {
    // 사진의 어느 부분을 쓸지 특징마다 조금씩 다르게 (같은 음식이라도 질감이 달라 보이게)
    const zoom = 1.3 + r() * 0.5;
    const size = 100 * zoom;
    const ox = f1(-(size - 100) * r());
    const oy = f1(-(size - 100) * r());
    defs = `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="100" height="100">`
      + `<rect width="100" height="100" fill="${color}"/>`
      + `<image href="${texture}" x="${ox}" y="${oy}" width="${f1(size)}" height="${f1(size)}" preserveAspectRatio="xMidYMid slice"/></pattern></defs>`;
    paint = `url(#${id})`;
  }
  const op = sh.opacity ? ` fill-opacity="${sh.opacity}"` : '';
  const fills = (sh.fill || []).map((d) => `<path d="${d}" fill="${paint}"${op}${sh.evenodd ? ' fill-rule="evenodd"' : ''}/>`).join('');
  const strokes = (sh.stroke || []).map((d) => `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${sh.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${fills}${strokes}</svg>`;
}

// 음식 사진에서 질감만 잘라낸 작은 이미지 (가운데를 확대해서 배경 없이 꽉 차게)
export async function foodTexture(src) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    const N = 220;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    // 음식이 차지하는 영역(투명하지 않은 곳)을 찾아서 그 안쪽 가운데를 확대
    const t = document.createElement('canvas');
    const k = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
    t.width = Math.max(1, Math.round(img.naturalWidth * k));
    t.height = Math.max(1, Math.round(img.naturalHeight * k));
    const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(img, 0, 0, t.width, t.height);
    const d = tg.getImageData(0, 0, t.width, t.height).data;
    let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
      const i = (y * t.width + x) * 4;
      const white = d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240;
      if (d[i + 3] > 200 && !white) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 <= x0) return null;
    // 영역의 가운데 55%만 (가장자리 배경이 안 들어가게)
    const cw = (x1 - x0) * 0.55;
    const ch = (y1 - y0) * 0.55;
    const s = Math.min(cw, ch);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    g.drawImage(img, (cx - s / 2) / k, (cy - s / 2) / k, s / k, s / k, 0, 0, N, N);
    return c.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
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
