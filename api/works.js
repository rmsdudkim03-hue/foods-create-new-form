// 공유 갤러리 + 관람객 선택 기록
// GET  → 최근 작품 목록 { enabled, works: [{ id, no, name, date, img, model }] } (오래된 것 → 최신 순)
// POST { name, date, image, plan } → 작품 저장 { id, no }
//   plan은 /api/forms가 도장(sig)을 찍어 준 조형 계획. 도장이 맞을 때만 "학습" 기록으로 남김
// POST { id, model: Meshy 작업 id } → 완성된 3D 파일(.glb)을 저장소에 보관 (Meshy 주소는 며칠 뒤 만료돼서)
//   갤러리에서 다른 관람객 작품도 3D로 볼 수 있게 함. models/작품id.glb
// POST { id, rating: 'good' | 'bad' } → 관람객 평가 저장 (작품 하나에 한 번만)
//   평가는 ratings/작품id.good 처럼 파일 이름에 담아서, 내용을 읽지 않고 목록만으로 알 수 있게 함
import { send, readJSON, allowed, store, newKey, checkPlan, meshy, timed } from './_lib.js';

export const GALLERY_LIMIT = 60;   // 갤러리에 보여줄 최근 작품 수
const FIRST_NO = 6;                // 기본 작품(04, 05) 다음 번호부터

// 최근 작품 기록 읽기 (최신이 먼저)
export async function recentWorks(limit) {
  const blobs = await store.list('works/', limit);
  const out = await Promise.all(blobs.map(async (b) => {
    try { return { id: b.pathname.slice(6, -5), ...(await store.readJSON(b.url)) }; } catch { return null; }
  }));
  return out.filter(Boolean);
}

const ID = /^\d{13}-[a-z0-9]{1,8}$/;

// 작품별 평가 { 작품id: 'good' | 'bad' } (최근 것부터 최대 limit개)
export async function ratings(limit = 1000) {
  const blobs = await store.list('ratings/', limit);
  const out = {};
  for (const b of blobs) {
    const [id, rating] = b.pathname.slice(8).split('.');
    if (!out[id]) out[id] = rating;
  }
  return out;
}

async function rate(res, { id, rating }) {
  if (!ID.test(String(id)) || !['good', 'bad'].includes(rating)) return send(res, 400, { error: 'input' });
  if (!(await store.list(`works/${id}.`, 1)).length) return send(res, 404, { error: 'not_found' });
  if ((await store.list(`ratings/${id}.`, 1)).length) return send(res, 409, { error: 'already' });
  await store.put(`ratings/${id}.${rating}`, rating, 'text/plain');
  send(res, 200, { ok: true });
}

// 3D 파일이 있는 작품 { 작품id: 주소 }
async function models() {
  const blobs = await store.list('models/', 1000);
  return Object.fromEntries(blobs.map((b) => [b.pathname.slice(7, -4), b.url]));
}

const MAX_GLB = 40_000_000; // 3D 파일 최대 40MB
async function saveModel(res, { id, model }) {
  if (!ID.test(String(id)) || !/^[\w-]{6,80}$/.test(String(model))) return send(res, 400, { error: 'input' });
  if (!process.env.MESHY_API_KEY) return send(res, 503, { error: 'no_key' });
  if (!(await store.list(`works/${id}.`, 1)).length) return send(res, 404, { error: 'not_found' });
  const existing = await store.list(`models/${id}.`, 1);
  if (existing.length) return send(res, 200, { model: existing[0].url });
  const t = await meshy(`/image-to-3d/${model}`);
  const url = t.model_urls?.glb;
  if (t.status !== 'SUCCEEDED' || !url) return send(res, 409, { error: 'not_ready' });
  const buf = await timed('3D 파일 보관', async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`glb ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  });
  if (buf.length > MAX_GLB) return send(res, 413, { error: 'too_large' });
  const saved = await store.put(`models/${id}.glb`, buf, 'model/gltf-binary');
  send(res, 200, { model: saved });
}

export default async function works(req, res) {
  try {
    if (req.method === 'GET') {
      if (!store.enabled) return send(res, 200, { enabled: false, works: [] });
      const [list, glb] = await Promise.all([recentWorks(GALLERY_LIMIT), models()]);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      // 여러 기기가 동시에 열어도 저장소를 매번 읽지 않게 15초 동안 같은 결과를 씀
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.end(JSON.stringify({
        enabled: true,
        works: list.reverse().map((w) => ({ id: w.id, no: w.no, name: w.name, date: w.date, img: w.img, model: glb[w.id] || null })),
      }));
    }

    if (req.method === 'POST') {
      if (!store.enabled) return send(res, 503, { error: 'no_store' });
      if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'no_key' });
      if (!allowed(req)) return send(res, 401, { error: 'access_code' });
      const body = await readJSON(req);
      if (body.rating) return rate(res, body);
      if (body.model) return saveModel(res, body);
      const image = String(body.image || '');
      if (!image.startsWith('data:image/jpeg;base64,') || image.length > 900_000) return send(res, 400, { error: 'input' });
      const name = String(body.name || '').slice(0, 40);
      const date = String(body.date || '').slice(0, 20);

      // 다음 번호 = 가장 최근 작품 번호 + 1
      const [last] = await recentWorks(1);
      const no = String(Math.max(FIRST_NO - 1, parseInt(last?.no, 10) || 0) + 1).padStart(2, '0');

      const key = newKey();
      const img = await store.put(`works-img/${key}.jpg`, Buffer.from(image.split(',')[1], 'base64'), 'image/jpeg');
      const plan = checkPlan(body.plan); // 도장이 안 맞으면 null → 갤러리에는 나오지만 학습에는 안 씀
      await store.put(`works/${key}.json`, JSON.stringify({ no, name, date, img, plan, createdAt: new Date().toISOString() }), 'application/json');
      return send(res, 200, { id: key, no, learned: Boolean(plan) });
    }

    send(res, 405, { error: 'method' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err).slice(0, 300) });
  }
}
