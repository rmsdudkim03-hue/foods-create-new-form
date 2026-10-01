/* =========================================================
   사진 배경 지우기 (브라우저에서 무료로)
   - 배경 제거 AI 모델(RMBG-1.4)을 브라우저로 한 번 받아서 씀 (약 40MB, 이후엔 브라우저에 저장돼서 빨라짐)
   - 모델을 못 쓰는 환경이면, 사진 테두리 색과 비슷한 부분을 지우는 간단한 방식으로 대신함
   - 한 번에 한 장씩 차례대로 처리
   ========================================================= */
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const MODEL = 'briaai/RMBG-1.4'; // 비상업 용도 무료 (졸업 전시 OK)
const MAX = 768;                 // 결과 이미지 최대 크기 (px)

let segPromise = null;
function segmenter() {
  if (segPromise) return segPromise;
  segPromise = (async () => {
    const { pipeline, env } = await import(LIB);
    env.allowLocalModels = false;
    const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    const t = performance.now();
    let seg;
    try {
      seg = await pipeline('background-removal', MODEL, gpu ? { device: 'webgpu', dtype: 'fp16' } : { dtype: 'q8' });
    } catch (err) {
      if (!gpu) throw err;
      console.warn('[배경 제거] WebGPU 실패 → 일반 모드', err);
      seg = await pipeline('background-removal', MODEL, { dtype: 'q8' });
    }
    console.info(`[배경 제거] 모델 준비 ${((performance.now() - t) / 1000).toFixed(1)}초`);
    return seg;
  })();
  segPromise.catch((err) => console.warn('[배경 제거] 모델을 못 씀 → 간단한 방식으로 대신', err)); // 한 번만 알림
  return segPromise;
}

// 체험을 시작할 때 미리 모델을 받아 두기
export function warmup() { segmenter().catch(() => {}); }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('사진을 불러오지 못함'));
    im.src = src;
  });
}

// 차례대로 처리 (동시에 여러 장 돌리면 오히려 느려짐)
let chain = Promise.resolve();
export function cutout(src) {
  const job = chain.then(() => cutoutNow(src));
  chain = job.catch(() => {});
  return job;
}

async function cutoutNow(src) {
  const img = await loadImage(src);
  let canvas;
  try {
    const seg = await segmenter();
    const out = await seg(src);
    canvas = out.toCanvas();
  } catch {
    canvas = simpleCutout(img);
  }
  return trimAlpha(canvas);
}

/* ---------- 간단한 방식: 테두리에서부터 비슷한 색을 배경으로 보고 지움 ---------- */
function simpleCutout(img) {
  const s = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * s);
  const h = Math.round(img.naturalHeight * s);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const bg = new Uint8Array(w * h);
  const queue = [];
  const near = (i, j) => Math.abs(d[i * 4] - d[j * 4]) + Math.abs(d[i * 4 + 1] - d[j * 4 + 1]) + Math.abs(d[i * 4 + 2] - d[j * 4 + 2]) < 34;
  for (let x = 0; x < w; x++) { queue.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { queue.push(y * w, y * w + w - 1); }
  queue.forEach((i) => (bg[i] = 1));
  while (queue.length) {
    const i = queue.pop();
    const x = i % w;
    const y = (i - x) / w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j >= 0 && !bg[j] && near(i, j)) { bg[j] = 1; queue.push(j); }
    }
  }
  // 원래 크기로 그린 뒤, 작은 마스크를 부드럽게 늘려서 알파로 씀
  const m = document.createElement('canvas');
  m.width = w;
  m.height = h;
  const mg = m.getContext('2d');
  const md = mg.createImageData(w, h);
  for (let i = 0; i < w * h; i++) md.data[i * 4 + 3] = bg[i] ? 0 : 255;
  mg.putImageData(md, 0, 0);
  const out = document.createElement('canvas');
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;
  const og = out.getContext('2d');
  og.filter = `blur(${Math.max(1, 1 / s)}px)`;
  og.drawImage(m, 0, 0, out.width, out.height);
  og.filter = 'none';
  og.globalCompositeOperation = 'source-in';
  og.drawImage(img, 0, 0);
  return out;
}

/* ---------- 투명한 여백 잘라내고 크기 줄이기 → PNG ---------- */
function trimAlpha(canvas, pad = 0.04) {
  const k = Math.min(1, 256 / Math.max(canvas.width, canvas.height));
  const sw = Math.max(1, Math.round(canvas.width * k));
  const sh = Math.max(1, Math.round(canvas.height * k));
  const sc = document.createElement('canvas');
  sc.width = sw;
  sc.height = sh;
  const sg = sc.getContext('2d', { willReadFrequently: true });
  sg.drawImage(canvas, 0, 0, sw, sh);
  const a = sg.getImageData(0, 0, sw, sh).data;
  let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (a[(y * sw + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = sw - 1; y1 = sh - 1; }
  const px = (x1 - x0) * pad, py = (y1 - y0) * pad;
  const cx = Math.max(0, (x0 - px) / k), cy = Math.max(0, (y0 - py) / k);
  const cw = Math.min(canvas.width - cx, (x1 - x0 + 1 + 2 * px) / k);
  const ch = Math.min(canvas.height - cy, (y1 - y0 + 1 + 2 * py) / k);
  const s = Math.min(1, MAX / Math.max(cw, ch));
  const out = document.createElement('canvas');
  out.width = Math.round(cw * s);
  out.height = Math.round(ch * s);
  out.getContext('2d').drawImage(canvas, cx, cy, cw, ch, 0, 0, out.width, out.height);
  return { src: out.toDataURL('image/png'), w: out.width, h: out.height };
}

// AI 분석에 보낼 때: 투명 배경을 흰색으로 채운 JPEG (용량 줄이기)
export async function onWhite(src) {
  if (!src?.startsWith('data:image/png')) return src;
  const im = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, 0, 0);
  return c.toDataURL('image/jpeg', 0.9);
}
