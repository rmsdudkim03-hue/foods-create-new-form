// 공유 갤러리 + 관람객 선택 기록
// GET  → 최근 작품 목록 { enabled, works: [{ id, no, name, date, img, model }] } (오래된 것 → 최신 순)
// POST { name, date, image, plan } → 작품 저장 { id, no }
//   plan은 /api/forms가 도장(sig)을 찍어 준 조형 계획. 도장이 맞을 때만 "학습" 기록으로 남김
// POST { id, model: Meshy 작업 id } → 완성된 3D 파일(.glb)을 저장소에 보관 (Meshy 주소는 며칠 뒤 만료돼서)
//   갤러리에서 다른 관람객 작품도 3D로 볼 수 있게 함. models/작품id.glb
// POST { id, task: Meshy 작업 id } → 3D 변환을 시작했다고 기록 (tasks/작품id.작업id). 관람객이 3D가 끝나기 전에 떠나도
//   나중에 갤러리에서 열 때 이 기록으로 3D 파일을 가져와 보관함
// POST { id, fetch: true } → 기록된 변환으로 3D 파일 보관 (접근 코드 필요 없음)
// POST { backfill: true } → 3D 기록이 없는 예전 작품을 Meshy 작업 목록에서 시간으로 짝지어 기록 (예전 작품 복구용)
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

// 3D 변환을 시작한 작품 { 작품id: Meshy 작업 id }
const TASK = /^[\w-]{6,80}$/;
async function tasks() {
  const blobs = await store.list('tasks/', 1000);
  const out = {};
  for (const b of blobs) {
    const name = b.pathname.slice(6);
    const dot = name.indexOf('.');
    if (dot > 0) out[name.slice(0, dot)] = name.slice(dot + 1);
  }
  return out;
}

async function noteTask(res, { id, task }) {
  if (!ID.test(String(id)) || !TASK.test(String(task))) return send(res, 400, { error: 'input' });
  if (!(await store.list(`works/${id}.`, 1)).length) return send(res, 404, { error: 'not_found' });
  if (!(await store.list(`tasks/${id}.`, 1)).length) await store.put(`tasks/${id}.${task}`, task, 'text/plain');
  send(res, 200, { ok: true });
}

// 예전 작품 복구: 작품이 저장된 시각 바로 뒤에 시작된 Meshy 변환을 그 작품의 3D로 봄
async function backfill(res) {
  const [list, glb, known] = await Promise.all([recentWorks(GALLERY_LIMIT), models(), tasks()]);
  const todo = list.filter((w) => !glb[w.id] && !known[w.id] && w.createdAt);
  if (!todo.length) return send(res, 200, { matched: 0 });
  const found = [];
  for (let page = 1; page <= 4; page++) {
    const r = await meshy(`/image-to-3d?page_num=${page}&page_size=50&sort_by=-created_at`);
    const arr = Array.isArray(r) ? r : r.result || r.data || [];
    found.push(...arr);
    if (arr.length < 50) break;
  }
  const used = new Set(Object.values(known));
  let matched = 0;
  // 오래된 작품부터 짝짓기 (같은 변환을 두 작품에 붙이지 않게)
  for (const w of todo.reverse()) {
    const t0 = Date.parse(w.createdAt);
    let best = null;
    for (const t of found) {
      if (t.status !== 'SUCCEEDED' || used.has(t.id)) continue;
      const dt = Number(t.created_at) - t0;
      if (dt < -30_000 || dt > 180_000) continue; // 작품 저장 30초 전 ~ 3분 뒤에 시작된 변환
      if (!best || Math.abs(dt) < Math.abs(best.dt)) best = { id: t.id, dt };
    }
    if (!best) continue;
    used.add(best.id);
    await store.put(`tasks/${w.id}.${best.id}`, best.id, 'text/plain');
    matched++;
  }
  console.log(`[알림] 예전 작품 3D 복구: ${todo.length}개 중 ${matched}개 짝지음 (Meshy 작업 ${found.length}개 확인)`);
  send(res, 200, { matched });
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

// 진단: 브라우저 주소창에 api/works?diag=1&code=접근코드 를 열면 저장 상태를 보여줌 (비밀 값은 안 보여줌)
async function diag(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const code = process.env.ACCESS_CODE;
  if (code && q.get('code') !== code && req.headers['x-access-code'] !== code) return send(res, 401, { error: 'access_code' });
  const out = {
    설정: { 저장소: store.enabled, MESHY_API_KEY: Boolean(process.env.MESHY_API_KEY), OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY), ACCESS_CODE: Boolean(code) },
  };
  try {
    const [list, glb, task] = await Promise.all([recentWorks(GALLERY_LIMIT), models(), tasks()]);
    out.저장소 = { 작품: list.length, '3D 파일': Object.keys(glb).length, '3D 변환 기록': Object.keys(task).length };
    out.최근작품 = list.slice(0, 8).map((w) => ({ no: w.no, 저장시각: w.createdAt, '3D 파일': Boolean(glb[w.id]), '3D 변환 기록': task[w.id] || null }));
  } catch (err) { out.저장소오류 = String(err.message || err).slice(0, 300); }
  try {
    const r = await meshy('/image-to-3d?page_num=1&page_size=8&sort_by=-created_at');
    const arr = Array.isArray(r) ? r : r.result || r.data || [];
    out.Meshy최근변환 = arr.map((t) => ({ 시작: t.created_at ? new Date(Number(t.created_at)).toISOString() : null, 상태: t.status, glb: Boolean(t.model_urls?.glb) }));
  } catch (err) { out.Meshy오류 = String(err.message || err).slice(0, 300); }
  // 저장소에 실제로 써지는지 시험 (작은 파일 하나)
  try { await store.put('diag/test.txt', new Date().toISOString(), 'text/plain', true); out.저장소쓰기 = 'OK'; } catch (err) { out.저장소쓰기 = String(err.message || err).slice(0, 300); }
  send(res, 200, out);
}

export default async function works(req, res) {
  try {
    if (req.method === 'GET' && new URL(req.url, 'http://x').searchParams.has('diag')) return diag(req, res);
    if (req.method === 'GET') {
      if (!store.enabled) return send(res, 200, { enabled: false, works: [] });
      const [list, glb, task] = await Promise.all([recentWorks(GALLERY_LIMIT), models(), tasks()]);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      // 여러 기기가 동시에 열어도 저장소를 매번 읽지 않게 15초 동안 같은 결과를 씀
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.end(JSON.stringify({
        enabled: true,
        // task: 3D 변환은 했는데 아직 파일을 보관하지 못한 작품 (갤러리에서 열면 그때 보관)
        works: list.reverse().map((w) => ({ id: w.id, no: w.no, name: w.name, date: w.date, img: w.img, model: glb[w.id] || null, task: glb[w.id] ? null : task[w.id] || null })),
      }));
    }

    if (req.method === 'POST') {
      if (!store.enabled) return send(res, 503, { error: 'no_store' });
      if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'no_key' });
      const body = await readJSON(req);
      // 갤러리에서 3D 기록만 있는 작품을 열면 3D 파일을 가져와 보관 (기록된 작업만 쓰니 접근 코드 없이도 됨)
      if (body.fetch) {
        if (!ID.test(String(body.id))) return send(res, 400, { error: 'input' });
        const [t] = await store.list(`tasks/${body.id}.`, 1);
        if (!t) return send(res, 404, { error: 'no_task' });
        return saveModel(res, { id: body.id, model: t.pathname.slice(t.pathname.indexOf('.') + 1) });
      }
      if (!allowed(req)) return send(res, 401, { error: 'access_code' });
      if (body.rating) return rate(res, body);
      if (body.model) return saveModel(res, body);
      if (body.task) return noteTask(res, body);
      if (body.backfill) return backfill(res);
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
