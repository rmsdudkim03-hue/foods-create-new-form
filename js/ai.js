/* =========================================================
   AI 연결부 (화면 ↔ 서버)
   - 실제 모드: Vercel에 올린 사이트에서 AI 키가 설정되어 있으면 /api/... 로 진짜 AI를 부름
   - 데모 모드: 키가 없거나 미리보기에서 열면, 준비해둔 이미지로 흐름만 보여줌
   - 접근 코드: ACCESS_CODE를 설정했다면 주소 끝에 ?code=코드 를 붙여 한 번 열면 그 기기에 기억됨

   AI 단계
   ⓐ checkFood   입력한 단어 → 음식인지 확인 + 실제 사진 10장 검색 (GPT-6 Astra + Pexels)
   ⓪ foodImages  사진 10장 → 배경 지우기 (브라우저, js/cutout.js)
                 (Pexels 키가 없으면 예전처럼 AI가 이미지 10장을 그림)
   ① analyze     고른 이미지 2장 → 특징 분석                      (GPT-6 Astra)
   ② tasteForms  분석 → 조형 6개 계획 → 조형 이미지 6장           (GPT-6 Astra + OpenAI 이미지, 고화질)
   ③ toModel     고른 조형 이미지 → 3D 모델                       (Meshy)
   ========================================================= */
import { FOODS, FORMS, SAMPLE_MODEL, ANALYZE_MS } from './data.js';
import { cutout, onWhite, warmup } from './cutout.js';

export const FOOD_IMAGE_COUNT = 10;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- 모드 판단 ---------- */
const CODE_KEY = 'fcnf-access-code';
function accessCode() {
  try {
    const q = new URLSearchParams(location.search).get('code');
    if (q) localStorage.setItem(CODE_KEY, q);
    return q || localStorage.getItem(CODE_KEY) || '';
  } catch { return ''; }
}
const headers = () => ({ 'Content-Type': 'application/json', 'x-access-code': accessCode() });

let live = false;
let modePromise = null;
export function mode() {
  modePromise ??= (async () => {
    try {
      const r = await fetch('api/status', { headers: headers(), cache: 'no-store' });
      if (r.ok) {
        const s = await r.json();
        live = Boolean(s.live && s.codeOk);
      }
    } catch { live = false; }
    console.info(`[AI] ${live ? '실제 모드' : '데모 모드'}`);
    return live ? 'live' : 'demo';
  })();
  return modePromise;
}

/* ---------- 서버 호출 (실패하면 잠시 후 한 번 더) ---------- */
async function call(path, { body, timeout = 180000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(path, {
        method: body ? 'POST' : 'GET',
        headers: headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: ctl.signal,
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) return data;
      const err = new Error(data.error || `서버 오류 ${r.status}`);
      err.retryable = r.status === 429 || r.status >= 500;
      throw err;
    } catch (err) {
      if (attempt >= retries || err.retryable === false) throw err;
    } finally {
      clearTimeout(timer);
    }
    await wait(2500 * (attempt + 1));
  }
}

// 동시에 너무 많이 부르지 않게 몇 개씩 나눠서 실행
async function pool(tasks, limit) {
  let next = 0;
  const worker = async () => { while (next < tasks.length) await tasks[next++](); };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

/* ---------- AI 이미지의 빈 흰 여백 잘라내기 ----------
   AI 이미지는 여백이 제각각이라, 음식·조형이 꽉 차도록 흰 여백을 자동으로 잘라냄 */
async function trimWhite(src, pad = 0.04) {
  const im = new Image();
  im.src = src;
  await im.decode();
  const W = im.naturalWidth;
  const H = im.naturalHeight;
  const k = Math.min(1, 256 / Math.max(W, H));
  const c = document.createElement('canvas');
  c.width = Math.round(W * k);
  c.height = Math.round(H * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      if (mn < 236 || mx - mn > 18) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { src, w: W, h: H };
  const px = (x1 - x0) * pad, py = (y1 - y0) * pad;
  const sx = Math.max(0, (x0 - px) / k), sy = Math.max(0, (y0 - py) / k);
  const sw = Math.min(W - sx, (x1 - x0 + 2 * px) / k), sh = Math.min(H - sy, (y1 - y0 + 2 * py) / k);
  const out = document.createElement('canvas');
  out.width = Math.round(sw);
  out.height = Math.round(sh);
  out.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return { src: out.toDataURL('image/jpeg', 0.92), w: out.width, h: out.height };
}
const trimSafe = (src) => trimWhite(src).catch(() => ({ src, w: 1024, h: 1024 }));

/* ---------- 결과가 한 장씩 도착하는 작업 ---------- */
function createJob(count) {
  const job = {
    items: Array(count).fill(null),
    ready: 0,
    failed: 0,
    meta: null,
    cancelled: false,
    listeners: new Set(),
    get finished() { return job.ready + job.failed >= job.items.length; },
    put(i, item) {
      if (job.cancelled || job.items[i]) return;
      job.items[i] = item;
      job.ready++;
      job.listeners.forEach((f) => f(i, item));
    },
    // 이미 도착한 자리를 새 결과로 바꿈 (예: 배경을 지운 사진)
    update(i, item) {
      if (job.cancelled || !job.items[i]) return;
      job.items[i] = item;
      job.listeners.forEach((f) => f(i, item));
    },
    lost: new Set(), // 실패한 자리 번호
    fail(i) {
      if (job.cancelled || job.items[i] || job.lost.has(i)) return;
      job.lost.add(i);
      job.failed++;
      job.listeners.forEach((f) => f(i, null));
    },
    // 도착했던 자리를 실패로 바꿈 (예: 사진을 못 불러옴)
    drop(i) {
      if (job.cancelled || !job.items[i]) return;
      job.items[i] = null;
      job.lost.add(i);
      job.ready--;
      job.failed++;
      job.listeners.forEach((f) => f(i, null));
    },
    failAll() { for (let i = 0; i < job.items.length; i++) if (!job.items[i]) job.fail(i); },
    on(f) { job.listeners.add(f); return () => job.listeners.delete(f); },
    cancel() { job.cancelled = true; job.listeners.clear(); },
  };
  return job;
}

/* =========================================================
   ⓐ 음식인지 확인 (+ ⓪ 이미지 10장 계획을 같이 받음)
   결과: { ok: true, name } 또는 { ok: false, message }
   ========================================================= */
const DEMO_ALIASES = { jelly: '젤리', broccoli: '브로콜리' };
const foodPlans = new Map();

export async function checkFood(word) {
  const w = word.trim();
  if ((await mode()) === 'live') {
    const r = await call('api/food', { body: { word: w }, timeout: 120000 });
    if (!r.ok) return { ok: false, message: r.message };
    foodPlans.set(r.name, r);
    if (r.photos) warmup(); // 배경 제거 모델을 미리 받아 둠
    return { ok: true, name: r.name, interpretation: r.interpretation };
  }
  await wait(rand(300, 700));
  const key = w.toLowerCase().replace(/\s+/g, '');
  const name = FOODS[w] ? w : DEMO_ALIASES[key];
  if (name) return { ok: true, name };
  return { ok: false, message: `미리보기에서는 ${Object.keys(FOODS).join(', ')}만 입력할 수 있어요` };
}

/* ---------- ⓪ 음식 이미지 10장 ---------- */
export function foodImages(food) {
  const plan = foodPlans.get(food);
  // 실제 사진: 원본을 먼저 보여주고, 배경을 지우는 대로 바꿔 끼움 (cut: true가 되면 고를 수 있음)
  if (live && plan?.photos) {
    const job = createJob(plan.photos.length);
    job.meta = { photos: true };
    plan.photos.forEach((p, i) => {
      const src = `api/photo?u=${encodeURIComponent(p.src)}`;
      const base = { w: p.w, h: p.h, alt: p.alt || `${food} 사진 ${i + 1}`, by: p.by, link: p.link };
      job.put(i, { ...base, src, cut: false });
      cutout(src)
        .then((c) => { if (!job.cancelled) job.update(i, { ...base, src: c.src, w: c.w, h: c.h, cut: true }); })
        .catch((err) => { console.error(err); job.drop(i); });
    });
    return job;
  }
  if (live && plan) {
    const job = createJob(plan.shots.length);
    job.meta = { interpretation: plan.interpretation, shots: plan.shots };
    pool(plan.shots.map((s, i) => async () => {
      if (job.cancelled) return;
      try {
        const { image } = await call('api/image', { body: { prompt: s.prompt, kind: 'food' } });
        const t = await trimSafe(image);
        job.put(i, { src: t.src, w: t.w, h: t.h, alt: `${food} 참고 이미지 ${i + 1}, ${s.view}` });
      } catch (err) {
        console.error(err);
        job.fail(i);
      }
    }), 5);
    return job;
  }
  // 데모
  const demo = FOODS[food]?.images || [];
  const job = createJob(demo.length);
  demo.forEach((img, i) => wait(rand(500, 2600)).then(() => job.put(i, img)));
  return job;
}

/* ---------- ① 특징 분석 ---------- */
export async function analyze(picks, foods) {
  if (live && picks.A.src.startsWith('data:')) {
    const [a, b] = await Promise.all([onWhite(picks.A.src), onWhite(picks.B.src)]);
    const { analysis } = await call('api/analyze', {
      body: { A: { name: foods.A, image: a }, B: { name: foods.B, image: b } },
      timeout: 240000,
    });
    return analysis;
  }
  await wait(ANALYZE_MS);
  return { demo: true };
}

/* ---------- ② 맛보기 조형 6개 ---------- */
export function tasteForms(analysis, picks, foods) {
  const job = createJob(FORMS.length);
  if (live && analysis && !analysis.demo) {
    (async () => {
      try {
        const [a, b] = await Promise.all([onWhite(picks.A.src), onWhite(picks.B.src)]);
        const plan = await call('api/forms', {
          body: { A: { name: foods.A, image: a }, B: { name: foods.B, image: b }, analysis },
          timeout: 240000,
        });
        if (job.cancelled) return;
        job.meta = plan;
        await pool(plan.forms.map((f, i) => async () => {
          if (job.cancelled) return;
          try {
            const { image } = await call('api/image', { body: { prompt: f.prompt, kind: 'form' } });
            job.put(i, (await trimSafe(image)).src);
          } catch (err) {
            console.error(err);
            job.fail(i);
          }
        }), 6); // 6장을 한꺼번에
      } catch (err) {
        console.error(err);
        job.failAll();
      }
    })();
    return job;
  }
  // 데모
  FORMS.forEach((f, i) => wait(rand(400, 1600)).then(() => job.put(i, f.img)));
  return job;
}

/* ---------- ③ 3D 변환 (관람객이 조형 하나를 골랐을 때만) ----------
   불러올 3D 파일 주소 목록을 돌려줌 (앞에서부터 시도) */
export async function toModel(formImg, form, onProgress = () => {}) {
  if (live && formImg?.startsWith('data:')) {
    const { taskId } = await call('api/model', { body: { image: formImg }, timeout: 60000 });
    const started = Date.now();
    while (Date.now() - started < 8 * 60 * 1000) {
      await wait(4000);
      const s = await call(`api/model?id=${encodeURIComponent(taskId)}`, { timeout: 30000, retries: 2 });
      onProgress(s.progress || 0);
      if (s.status === 'SUCCEEDED') return [`api/model-file?id=${encodeURIComponent(taskId)}`, s.glb].filter(Boolean);
      if (s.status === 'FAILED' || s.status === 'CANCELED') throw new Error(s.error || '3D 변환 실패');
    }
    throw new Error('3D 변환 시간 초과');
  }
  await wait(2500);
  return [form?.model || SAMPLE_MODEL];
}

/* ---------- 공유 갤러리 ----------
   모든 기기가 같이 보는 갤러리. 저장소가 없으면 { enabled: false } → 이 기기에만 저장 */
export async function loadWorks() {
  try {
    const r = await fetch('api/works', { cache: 'no-store' });
    if (!r.ok) return { enabled: false, works: [] };
    return await r.json();
  } catch { return { enabled: false, works: [] }; }
}

// 관람객 평가 저장 ('good' 좋아요 / 'bad' 별로예요). 다음 관람객의 조형 제안에 반영됨
export async function rateWork(id, rating) {
  if (!live || !id) return null;
  return call('api/works', { body: { id, rating }, timeout: 30000 });
}

// 관람객이 고른 조형을 공유 갤러리 + 학습 기록으로 저장 (실제 AI로 만든 것만)
export async function saveWork({ name, date, image, plan }) {
  if (!live || !image?.startsWith('data:image/jpeg')) return null;
  return call('api/works', { body: { name, date, image, plan }, timeout: 60000 });
}
