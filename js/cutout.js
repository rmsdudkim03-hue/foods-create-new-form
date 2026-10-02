/* =========================================================
   사진 배경 지우기 (브라우저에서 무료로)
   - 배경 제거 AI 모델(RMBG-1.4)을 브라우저로 한 번 받아서 씀 (약 88MB, 이후엔 브라우저에 저장돼서 빨라짐)
   - 모델을 못 쓰는 환경이면, 사진 테두리 색과 비슷한 부분을 지우는 간단한 방식으로 대신함
   - 한 번에 한 장씩 차례대로 처리
   ========================================================= */
const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
const MODEL = 'briaai/RMBG-1.4'; // 비상업 용도 무료 (졸업 전시 OK)
const MAX = 768;                 // 결과 이미지 최대 크기 (px)

// 배경 제거를 어떤 방식으로 했는지 (주소에 ?debug를 붙이면 화면 아래에 보임)
export const cutoutInfo = { method: '준비 중' };

/* RMBG-1.4 공식 사용법: 모델에 1024×1024 사진을 넣으면 '음식일 확률' 지도(마스크)가 나옴
   (범용 'background-removal' 방식으로 부르면 이 모델을 잘못 읽어서 배경이 이상하게 지워짐) */
/* 모델 두 가지
   - 'fast': 그래픽카드(WebGPU)로 빠르게 (기기에 따라 마스크가 엉망으로 나올 때가 있음)
   - 'safe': 일반 방식(q8, 약 44MB). 느리지만 결과가 안정적
   fast 결과가 이상하면(배경이 안 지워짐) safe로 다시 하고, 두 번 그러면 그 뒤로는 safe만 씀 */
const segPromises = {};
let fastBad = 0;
function segmenter(kind = 'fast') {
  if (kind === 'fast' && fastBad >= 2) kind = 'safe';
  if (segPromises[kind]) return segPromises[kind];
  const segPromise = (segPromises[kind] = (async () => {
    const { AutoModel, AutoProcessor, RawImage, env } = await import(LIB);
    env.allowLocalModels = false;
    const t = performance.now();
    const load = (opts) => AutoModel.from_pretrained(MODEL, { config: { model_type: 'custom' }, ...opts });
    let model;
    const gpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    try {
      // 그래픽카드(WebGPU)가 되면 빠르게, 안 되면 일반 방식. 모델 파일은 약 88MB (한 번 받으면 브라우저에 저장)
      model = await load(kind === 'safe' ? { dtype: 'q8' } : gpu ? { device: 'webgpu', dtype: 'fp16' } : { dtype: 'fp16' });
    } catch (err) {
      if (kind === 'safe') throw err;
      console.warn('[배경 제거] 첫 시도 실패 → 다른 방식으로 다시', err);
      model = await load({ dtype: 'q8' });
    }
    const processor = await AutoProcessor.from_pretrained(MODEL, {
      config: {
        do_normalize: true, do_pad: false, do_rescale: true, do_resize: true,
        image_mean: [0.5, 0.5, 0.5], image_std: [1, 1, 1], resample: 2,
        rescale_factor: 1 / 255, size: { width: 1024, height: 1024 },
        feature_extractor_type: 'ImageFeatureExtractor',
      },
    });
    console.info(`[배경 제거] 모델 준비 ${((performance.now() - t) / 1000).toFixed(1)}초`);
    cutoutInfo.method = kind === 'safe' ? 'AI 모델 (안정 모드)' : 'AI 모델';
    return { model, processor, RawImage, kind };
  })());
  segPromise.catch((err) => {
    if (kind === 'safe') return;
    cutoutInfo.method = '간단한 방식 (모델 실패)';
    console.warn('[배경 제거] 모델을 못 씀 → 간단한 방식으로 대신', err);
  });
  return segPromise;
}

// 체험을 시작할 때 미리 모델을 받아 두기
export function warmup() { segmenter('fast').catch(() => {}); }

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
// 한 장 끝날 때마다 잠깐 쉬어서 화면·컴퓨터가 멈춘 것처럼 느려지지 않게 함
const REST_MS = 120;
// 차례 기다리는 줄. first: 줄 맨 앞에 끼움 (AI 이미지는 흰 배경이라 금방 끝나서 먼저)
const queue = [];
let running = false;
// skip(): 차례가 됐을 때 true면 건너뜀 (이미 사진이 충분하거나 화면을 떠났을 때)
export function cutout(src, skip = () => false, { first = false } = {}) {
  return new Promise((resolve, reject) => {
    const task = { src, skip, resolve, reject };
    if (first) queue.unshift(task); else queue.push(task);
    pump();
  });
}
async function pump() {
  if (running) return;
  running = true;
  while (queue.length) {
    const t = queue.shift();
    if (t.skip()) { t.reject(new Error('skip')); continue; }
    try { t.resolve(await cutoutNow(t.src)); } catch (err) { t.reject(err); }
    await new Promise((r) => setTimeout(r, REST_MS));
  }
  running = false;
}

// 사진에서 음식(불투명한 부분)이 차지하는 비율 + 사진 테두리에 남은 부분의 비율
// 음식만 남았으면 테두리는 거의 투명함. 테두리가 많이 남아 있으면 식탁·접시·배경이 안 지워진 것
function maskStats(canvas) {
  const k = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(canvas.width * k));
  c.height = Math.max(1, Math.round(canvas.height * k));
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, c.width, c.height);
  const a = g.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  let n = 0, edge = 0, edgeN = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const on = a[(y * W + x) * 4 + 3] > 128;
      if (on) n++;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { edgeN++; if (on) edge++; }
    }
  }
  return { cover: n / (W * H), edge: edge / edgeN };
}
// 쓸 수 없는 결과: 거의 안 지워짐(화면을 꽉 채움) / 거의 다 지워짐 / 테두리에 배경이 많이 남음
const MAX_COVER = 0.85, MIN_COVER = 0.03, MAX_EDGE = 0.15;
const usable = (s) => s.cover >= MIN_COVER && s.cover <= MAX_COVER && s.edge <= MAX_EDGE;

async function cutoutNow(src) {
  const img = await loadImage(src);
  let canvas = null;
  try {
    canvas = await modelCutout(img, src, 'fast');
    const st = maskStats(canvas);
    // 빠른 모델이 고장 난 것처럼 보일 때만(거의 다 남기거나 거의 다 지움) 안정 모드로 한 번 더
    // (그냥 배경이 남은 사진은 다시 해도 비슷해서 시간만 걸림 → 바로 뺌)
    if ((st.cover > 0.97 || st.cover < 0.01) && fastBad < 2) {
      const safe = await modelCutout(img, src, 'safe').catch(() => null);
      if (safe && usable(maskStats(safe))) { fastBad++; canvas = safe; }
    }
  } catch (err) {
    if (cutoutInfo.method.startsWith('AI 모델')) console.warn('[배경 제거] 이 사진은 모델 실패 → 간단한 방식', err);
    canvas = simpleCutout(img);
  }
  const st = maskStats(canvas);
  // 결과는 항상 돌려주고, 배경이 잘 지워졌는지(good)를 같이 알려줌
  // (잘 안 지워진 사진은 화면에서 '다른 사진이 다 모자랄 때만' 씀 → 빈 화면이 생기지 않게)
  const good = usable(st);
  if (!good) cutoutInfo.rejected = (cutoutInfo.rejected || 0) + 1;
  return { ...trimAlpha(canvas), good, score: st.edge + Math.abs(st.cover - 0.4) };
}

async function modelCutout(img, src, kind) {
  const { model, processor, RawImage } = await segmenter(kind);
  const image = await RawImage.fromURL(src);
  const { pixel_values } = await processor(image);
  const { output } = await model({ input: pixel_values });
  const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  // 마스크를 투명도로. 애매한 가장자리(옅은 그림자·반사)는 조금 더 지움
  for (let i = 0; i < mask.data.length; i++) {
    const a = mask.data[i * mask.channels] / 255;
    px.data[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (a - 0.15) / 0.7)));
  }
  g.putImageData(px, 0, 0);
  return c;
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
