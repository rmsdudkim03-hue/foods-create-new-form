// 공유 갤러리 + 관람객 선택 기록
// GET  → 최근 작품 목록 { enabled, works: [{ id, no, name, date, img }] } (오래된 것 → 최신 순)
// POST { name, date, image, plan } → 작품 저장 { id, no }
//   plan은 /api/forms가 도장(sig)을 찍어 준 조형 계획. 도장이 맞을 때만 "학습" 기록으로 남김
// POST { id, rating: 'good' | 'bad' } → 관람객 평가 저장 (작품 하나에 한 번만)
//   평가는 ratings/작품id.good 처럼 파일 이름에 담아서, 내용을 읽지 않고 목록만으로 알 수 있게 함
import { send, readJSON, allowed, store, newKey, checkPlan } from './_lib.js';

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

export default async function works(req, res) {
  try {
    if (req.method === 'GET') {
      if (!store.enabled) return send(res, 200, { enabled: false, works: [] });
      const list = await recentWorks(GALLERY_LIMIT);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      // 여러 기기가 동시에 열어도 저장소를 매번 읽지 않게 15초 동안 같은 결과를 씀
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.end(JSON.stringify({
        enabled: true,
        works: list.reverse().map((w) => ({ id: w.id, no: w.no, name: w.name, date: w.date, img: w.img })),
      }));
    }

    if (req.method === 'POST') {
      if (!store.enabled) return send(res, 503, { error: 'no_store' });
      if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'no_key' });
      if (!allowed(req)) return send(res, 401, { error: 'access_code' });
      const body = await readJSON(req);
      if (body.rating) return rate(res, body);
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
