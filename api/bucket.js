// 버킷리스트 방명록 (/bucket/)
// 글은 저장소에 한 개씩 bucket/글id.json 으로 저장 { text, name, at }. 글id 앞부분이 '거꾸로 시간'이라 최신이 먼저 나옴
// GET                    → 최신 글 { enabled, items: [{ id, text, name, at }], next }  (?cursor=next 로 다음 쪽)
// POST { text, name }    → 글 남기기 → { item }. 나쁜 말이면 400 { error: 'bad_word' }
// 관리 (헤더 x-admin-code = Vercel 환경 변수 ADMIN_CODE, 없으면 ACCESS_CODE)
//   GET ?admin=1           → 글 전체 (내려받기·지우기용)
//   POST { remove: 글id }  → 글 지우기
import { send, readJSON, store, newKey } from './_lib.js';
import { hasBadWord, flaggedByAI } from './_badwords.js';

const PAGE = 30;          // 한 번에 보여줄 글 수
const MAX_TEXT = 80;      // 버킷리스트 최대 글자 수
const MAX_NAME = 12;      // 이름 최대 글자 수
const ID = /^\d{13}-[a-z0-9]{1,8}$/;

function adminOk(req) {
  const code = String(process.env.ADMIN_CODE || process.env.ACCESS_CODE || '').trim();
  return Boolean(code) && String(req.headers['x-admin-code'] || '').trim() === code;
}

// 줄바꿈·연속 공백을 한 칸으로, 앞뒤 공백 빼기
const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

async function read(blobs) {
  const out = [];
  // 한 번에 너무 많이 부르지 않게 20개씩
  for (let i = 0; i < blobs.length; i += 20) {
    const part = await Promise.all(blobs.slice(i, i + 20).map(async (b) => {
      try { return { id: b.pathname.slice(7, -5), ...(await store.readJSON(b.url)) }; } catch { return null; }
    }));
    out.push(...part.filter(Boolean));
  }
  return out;
}

// 같은 기기(IP)에서 너무 자주 쓰지 않게 (서버가 켜져 있는 동안만 기억하는 간단한 방법)
const lastPost = new Map();
const GAP_MS = 10_000;

async function post(req, res) {
  const body = await readJSON(req);

  if (body.remove !== undefined) {
    if (!adminOk(req)) return send(res, 401, { error: 'admin_code' });
    if (!ID.test(String(body.remove))) return send(res, 400, { error: 'input' });
    const [b] = await store.list(`bucket/${body.remove}.`, 1);
    if (b) await store.del(b.url);
    console.log(`[방명록] 글 지움: ${body.remove}`);
    return send(res, 200, { ok: true });
  }

  const text = clean(body.text, MAX_TEXT);
  const name = clean(body.name, MAX_NAME);
  if (!text) return send(res, 400, { error: 'empty' });

  if (hasBadWord(text) || hasBadWord(name) || (await flaggedByAI(name ? `${text}\n${name}` : text))) {
    return send(res, 400, { error: 'bad_word' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'local';
  const now = Date.now();
  if (now - (lastPost.get(ip) || 0) < GAP_MS) return send(res, 429, { error: 'too_fast' });

  lastPost.set(ip, now);
  if (lastPost.size > 5000) lastPost.clear();
  const id = newKey();
  const item = { text, name, at: new Date().toISOString() };
  await store.put(`bucket/${id}.json`, JSON.stringify(item), 'application/json');
  send(res, 200, { item: { id, ...item } });
}

export default async function bucket(req, res) {
  try {
    if (!(await store.ready())) {
      return req.method === 'GET' ? send(res, 200, { enabled: false, items: [], next: null }) : send(res, 503, { error: 'no_store' });
    }
    if (req.method === 'POST') return await post(req, res);
    if (req.method !== 'GET') return send(res, 405, { error: 'method' });

    const q = new URL(req.url, 'http://x').searchParams;
    if (q.has('admin')) {
      if (!adminOk(req)) return send(res, 401, { error: 'admin_code' });
      const blobs = [];
      let cursor = null;
      do {
        const p = await store.page('bucket/', 1000, cursor);
        blobs.push(...p.blobs);
        cursor = p.cursor;
      } while (cursor);
      return send(res, 200, { items: await read(blobs) });
    }

    const p = await store.page('bucket/', PAGE, q.get('cursor') || undefined);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 많은 사람이 동시에 열어도 저장소를 매번 읽지 않게 5초 동안 같은 결과를 씀
    res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
    res.end(JSON.stringify({ enabled: true, items: await read(p.blobs), next: p.cursor }));
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err).slice(0, 300) });
  }
}
