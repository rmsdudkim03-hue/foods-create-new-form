/* =========================================================
   분석 화면 효과: 음식 사진이 흰 석고 같은 '재료'로 바뀜
   - 위에서 아래로 스캔선이 지나가면서 사진이 무광 흰색 부조로 변함
   - 변한 뒤에는 빛의 방향이 천천히 돌아서 표면의 요철이 드러남
   조절값은 아래 SETTINGS에서 바꾸면 돼.
   ========================================================= */
const SETTINGS = {
  size: 440,          // 계산 해상도 (클수록 선명, 느려짐)
  sweep: 1.8,         // 스캔선이 한 번 지나가는 시간(초)
  volume: 9,          // 덩어리감 (윤곽을 얼마나 둥글게 부풀릴지)
  detail: 0.45,       // 표면 요철 강도 (사진의 밝고 어두움을 요철로)
  relief: 9,          // 요철 깊이
  grain: 0.035,       // 석고 입자감
  color: [242, 241, 238], // 재료 색 (무광 흰색)
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 가로·세로 박스 블러 (여러 번 돌리면 부드러운 덩어리가 됨)
function blur(src, w, h, r, passes) {
  let a = Float32Array.from(src);
  let b = new Float32Array(a.length);
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

export function materialize(canvas, src, { delay = 0 } = {}) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let stopped = false;
  let raf = 0;
  let t0 = 0;
  let W = 0;
  let H = 0;
  let img;
  let mask;
  let nx;
  let ny;
  let nz;
  let ao;
  let grain;
  let relief;
  let reliefCtx;
  let reliefData;
  let lastShade = -1;

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
    const s = Math.min(SETTINGS.size / img.naturalWidth, SETTINGS.size / img.naturalHeight, 1.5);
    W = Math.max(8, Math.round(img.naturalWidth * s));
    H = Math.max(8, Math.round(img.naturalHeight * s));
    const oc = document.createElement('canvas');
    oc.width = W;
    oc.height = H;
    const o = oc.getContext('2d', { willReadFrequently: true });
    o.drawImage(img, 0, 0, W, H);
    const d = o.getImageData(0, 0, W, H).data;
    const N = W * H;
    mask = new Float32Array(N);
    const lum = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], a = d[i * 4 + 3] / 255;
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0;
      // 흰 배경은 재료에서 제외 (투명 배경이면 알파로 구분)
      // 옅은 반사·그림자(밝고 채도 낮은 부분)는 빼고, 음식 본체만 남김
      const notWhite = clamp((0.93 - l) / 0.08 + (sat - 0.3) * 3, 0, 1);
      mask[i] = a * notWhite;
      lum[i] = l;
    }
    const soft = blur(mask, W, H, 1, 1);
    for (let i = 0; i < N; i++) mask[i] = clamp((soft[i] - 0.12) / 0.5, 0, 1);
    const vol = blur(mask, W, H, SETTINGS.volume, 3);
    const det = blur(lum, W, H, 1, 1);
    const hgt = new Float32Array(N);
    for (let i = 0; i < N; i++) hgt[i] = vol[i] + det[i] * SETTINGS.detail * mask[i];
    nx = new Float32Array(N);
    ny = new Float32Array(N);
    nz = new Float32Array(N);
    ao = new Float32Array(N);
    grain = new Float32Array(N);
    const k = SETTINGS.relief;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const dx = hgt[y * W + Math.min(x + 1, W - 1)] - hgt[y * W + Math.max(x - 1, 0)];
        const dy = hgt[Math.min(y + 1, H - 1) * W + x] - hgt[Math.max(y - 1, 0) * W + x];
        let ax = -dx * k, ay = -dy * k, az = 1;
        const len = Math.hypot(ax, ay, az);
        nx[i] = ax / len; ny[i] = ay / len; nz[i] = az / len;
        ao[i] = 0.86 + 0.14 * clamp(vol[i] * 1.4, 0, 1); // 가장자리는 살짝 어둡게
        grain[i] = (Math.random() - 0.5) * 2 * SETTINGS.grain;
      }
    }
    relief = document.createElement('canvas');
    relief.width = W;
    relief.height = H;
    reliefCtx = relief.getContext('2d');
    reliefData = reliefCtx.createImageData(W, H);
  }

  // 빛 방향에 맞춰 흰 재료 표면을 칠함
  function shade(angle) {
    const lx0 = Math.cos(angle) * 0.62, ly0 = Math.sin(angle) * 0.62, lz0 = 0.72;
    const ll = Math.hypot(lx0, ly0, lz0);
    const lx = lx0 / ll, ly = ly0 / ll, lz = lz0 / ll;
    const out = reliefData.data;
    const [cr, cg, cb] = SETTINGS.color;
    for (let i = 0; i < mask.length; i++) {
      const diff = Math.max(0, nx[i] * lx + ny[i] * ly + nz[i] * lz);
      const v = (0.42 + 0.6 * diff) * ao[i] * (1 + grain[i]);
      const j = i * 4;
      out[j] = Math.min(255, cr * v);
      out[j + 1] = Math.min(255, cg * v);
      out[j + 2] = Math.min(255, cb * v);
      out[j + 3] = mask[i] * 255;
    }
    reliefCtx.putImageData(reliefData, 0, 0);
  }

  function fitCanvas() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, Math.round(r.width * dpr));
    const ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const s = Math.min(cw / W, ch / H);
    const dw = W * s, dh = H * s;
    return { dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh, dpr };
  }

  function frame(now) {
    if (stopped) return;
    const t = Math.max(0, (now - t0) / 1000);
    const p = reduce ? 1 : clamp(t / SETTINGS.sweep, 0, 1);
    const angle = -2.3 + t * 0.55;
    // 빛 계산은 1/30초마다 한 번
    if (now - lastShade > 33) { shade(angle); lastShade = now; }
    const { dx, dy, dw, dh, dpr } = fitCanvas();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const cut = dy + p * dh;
    // 아직 스캔 안 된 아래쪽: 원래 사진
    if (p < 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, cut, canvas.width, canvas.height - cut);
      ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    }
    // 스캔된 위쪽: 흰 재료
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, cut);
    ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(relief, dx, dy, dw, dh);
    ctx.restore();
    // 스캔선
    if (p > 0 && p < 1) {
      ctx.fillStyle = 'rgba(33, 33, 33, .75)';
      ctx.fillRect(dx - 12 * dpr, cut, dw + 24 * dpr, Math.max(1, 1.5 * dpr));
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    stop() { stopped = true; cancelAnimationFrame(raf); },
  };
}
