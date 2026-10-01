/* =========================================================
   분석 화면 효과: 음식 사진이 윤곽선(등고선)으로 분해됨
   1) 사진 위에 바깥 윤곽선부터 안쪽으로 등고선이 하나씩 그려짐
   2) 사진은 천천히 사라지고 선만 남음
   3) 남은 선은 물결처럼 천천히 흐르며 형태를 '읽는' 느낌을 줌
   등고선 높이 = 음식 덩어리의 두께(가장자리 → 가운데) + 사진의 밝고 어두움(표면 결)
   조절값은 아래 SETTINGS에서 바꾸면 돼.
   ========================================================= */
const SETTINGS = {
  grid: 170,         // 계산 해상도 (클수록 선이 매끈, 느려짐)
  lines: 15,         // 등고선 개수
  round: 0.6,        // 둥근 정도 (1이면 가장자리부터 고른 간격, 작을수록 가장자리에 촘촘)
  detail: 0.12,      // 표면 결이 선을 얼마나 흔드는지
  draw: 1.6,         // 선이 다 그려지는 시간(초)
  fade: [0.5, 2.2],  // 사진이 사라지기 시작·끝나는 시간(초)
  flow: 0.035,       // 선이 흐르는 속도
  ink: '33, 33, 33', // 선 색 (R, G, B)
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// 가로·세로 박스 블러 (여러 번 돌리면 부드러운 덩어리가 됨)
function blur(src, w, h, r, passes) {
  let a = Float32Array.from(src);
  const b = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r; x <= r; x++) s += a[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        b[row + x] = s / n;
        s += a[row + clamp(x + r + 1, 0, w - 1)] - a[row + clamp(x - r, 0, w - 1)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += b[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / n;
        s += b[clamp(y + r + 1, 0, h - 1) * w + x] - b[clamp(y - r, 0, h - 1) * w + x];
      }
    }
  }
  return a;
}

// 형태 안쪽 각 점이 가장자리에서 얼마나 떨어져 있는지 (윤곽선을 따라 안쪽으로 고르게 퍼지는 높이)
function distanceIn(inside, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? INF : 0;
  const A = 1, D = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + A);
      if (y > 0) v = Math.min(v, d[i - w] + A);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + D);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + D);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + A);
      if (y < h - 1) v = Math.min(v, d[i + w] + A);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + D);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + D);
      d[i] = v;
    }
  }
  return d;
}

// 마칭 스퀘어: 높이 지도에서 level 높이의 선을 찾아 path에 추가
function traceLevel(ctx, f, w, h, level, sx, sy, ox, oy) {
  const lerp = (a, b) => (level - a) / (b - a);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const a = f[y * w + x], b = f[y * w + x + 1], c = f[(y + 1) * w + x + 1], d = f[(y + 1) * w + x];
      const k = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (k === 0 || k === 15) continue;
      // 네 변 위의 교차점
      const T = () => [x + lerp(a, b), y];
      const R = () => [x + 1, y + lerp(b, c)];
      const B = () => [x + lerp(d, c), y + 1];
      const L = () => [x, y + lerp(a, d)];
      const seg = (p, q) => {
        ctx.moveTo(ox + p[0] * sx, oy + p[1] * sy);
        ctx.lineTo(ox + q[0] * sx, oy + q[1] * sy);
      };
      switch (k) {
        case 1: case 14: seg(L(), B()); break;
        case 2: case 13: seg(B(), R()); break;
        case 3: case 12: seg(L(), R()); break;
        case 4: case 11: seg(T(), R()); break;
        case 6: case 9: seg(T(), B()); break;
        case 7: case 8: seg(L(), T()); break;
        case 5: seg(L(), T()); seg(B(), R()); break;
        case 10: seg(T(), R()); seg(L(), B()); break;
      }
    }
  }
}

export function contour(canvas, src, { delay = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stopped = false;
  let raf = 0;
  let t0 = 0;
  let img, W, H, mask, height, maxH;

  const photo = new Image();
  photo.decoding = 'async';
  photo.onload = () => {
    if (stopped) return;
    img = photo;
    prepare();
    t0 = performance.now() + delay;
    raf = requestAnimationFrame(frame);
  };
  photo.src = src;

  function prepare() {
    const s = Math.min(SETTINGS.grid / img.naturalWidth, SETTINGS.grid / img.naturalHeight);
    // 가장자리에 여백 한 칸씩 (윤곽선이 닫히도록)
    W = Math.max(8, Math.round(img.naturalWidth * s)) + 4;
    H = Math.max(8, Math.round(img.naturalHeight * s)) + 4;
    const oc = document.createElement('canvas');
    oc.width = W;
    oc.height = H;
    const o = oc.getContext('2d', { willReadFrequently: true });
    o.drawImage(img, 2, 2, W - 4, H - 4);
    const d = o.getImageData(0, 0, W, H).data;
    const N = W * H;
    mask = new Float32Array(N);
    const lum = new Float32Array(N);
    // 배경을 지운 사진(투명 배경)인지 확인
    let clear = 0;
    for (let i = 0; i < N; i++) if (d[i * 4 + 3] < 128) clear++;
    const hasAlpha = clear > N * 0.05;
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3] / 255;
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      // 투명 배경(배경 지운 사진)은 알파로, 흰 배경(AI 이미지)은 색으로 음식만 남김
      const notWhite = clamp((0.93 - l) / 0.08 + (sat - 0.3) * 3, 0, 1);
      mask[i] = hasAlpha ? a : notWhite;
      lum[i] = l;
    }
    mask = blur(mask, W, H, 1, 1);
    // 높이 = 가장자리에서 떨어진 거리 (부드럽게) + 사진 결 조금
    const inside = new Uint8Array(N);
    for (let i = 0; i < N; i++) inside[i] = mask[i] > 0.5 ? 1 : 0;
    const dist = blur(distanceIn(inside, W, H), W, H, 2, 2);
    let maxD = 0;
    for (let i = 0; i < N; i++) if (dist[i] > maxD) maxD = dist[i];
    maxD = maxD || 1;
    const det = blur(lum, W, H, 2, 2);
    height = new Float32Array(N);
    maxH = 0;
    for (let i = 0; i < N; i++) {
      const m = clamp((mask[i] - 0.15) / 0.5, 0, 1);
      height[i] = m * (Math.pow(dist[i] / maxD, SETTINGS.round) + (0.5 - det[i]) * SETTINGS.detail);
      if (height[i] > maxH) maxH = height[i];
    }
    maxH = maxH || 1;
  }

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(r.width * dpr));
    const ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const s = Math.min(cw / W, ch / H);
    return { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2, dpr };
  }

  function frame(now) {
    if (stopped) return;
    const t = reduce ? 99 : Math.max(0, (now - t0) / 1000);
    const { s, ox, oy, dpr } = fit();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 사진: 처음엔 보이다가 사라짐
    const [f0, f1] = SETTINGS.fade;
    const photoA = 1 - ease((t - f0) / (f1 - f0));
    if (photoA > 0.01) {
      ctx.globalAlpha = photoA;
      ctx.filter = `grayscale(${Math.round((1 - photoA) * 100)}%)`;
      ctx.drawImage(img, ox + 2 * s, oy + 2 * s, (W - 4) * s, (H - 4) * s);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
    }

    // 바깥 윤곽선 (가장 먼저, 진하게)
    const outline = ease(t / (SETTINGS.draw * 0.35));
    if (outline > 0) {
      ctx.beginPath();
      traceLevel(ctx, mask, W, H, 0.5, s, s, ox, oy);
      ctx.strokeStyle = `rgba(${SETTINGS.ink}, ${0.85 * outline})`;
      ctx.lineWidth = 1.3 * dpr;
      ctx.stroke();
    }

    // 안쪽 등고선: 바깥부터 하나씩 나타나고, 다 나타나면 천천히 흐름
    const n = SETTINGS.lines;
    const phase = (t * SETTINGS.flow) % (1 / n);
    for (let i = 0; i < n; i++) {
      const appear = ease((t - (i / n) * SETTINGS.draw) / 0.5);
      if (appear <= 0) continue;
      const lv = ((i + 0.5) / n + phase) * maxH;
      if (lv >= maxH) continue;
      // 가장 바깥·안쪽 선은 흐릴 때 살짝 희미하게 (선이 갑자기 생기거나 사라지지 않게)
      const edge = clamp(Math.min(lv / maxH, 1 - lv / maxH) * n * 0.9, 0, 1);
      ctx.beginPath();
      traceLevel(ctx, height, W, H, lv, s, s, ox, oy);
      ctx.strokeStyle = `rgba(${SETTINGS.ink}, ${0.5 * appear * edge})`;
      ctx.lineWidth = 0.8 * dpr;
      ctx.stroke();
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    stop() { stopped = true; cancelAnimationFrame(raf); },
  };
}
