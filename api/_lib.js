/* =========================================================
   서버 공통 도구 (Vercel 서버 함수에서 사용)
   - AI 키는 코드에 쓰지 않고 Vercel 환경 변수에서 읽어
     OPENAI_API_KEY, MESHY_API_KEY  (필수)
     ACCESS_CODE                   (선택: 설정하면 이 코드를 가진 기기에서만 AI 사용)
     TEXT_MODEL, IMAGE_MODEL_FOOD, IMAGE_MODEL_FORM, IMAGE_QUALITY_FOOD, IMAGE_QUALITY_FORM (선택: 모델 바꿀 때)
   - 프롬프트 원문은 prompts 폴더의 .md 파일에서 읽어와.
     내용을 고치고 싶으면 그 파일만 수정하면 돼.
   ========================================================= */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OPENAI = process.env.OPENAI_BASE || 'https://api.openai.com/v1';
const MESHY = process.env.MESHY_BASE || 'https://api.meshy.ai/openapi/v1';
const PEXELS = process.env.PEXELS_BASE || 'https://api.pexels.com/v1';

export const MODELS = {
  text: process.env.TEXT_MODEL || 'gpt-6-astra',
  imageFood: process.env.IMAGE_MODEL_FOOD || 'gpt-image-1-mini',
  imageForm: process.env.IMAGE_MODEL_FORM || 'gpt-image-2.5-flare', // 빠른 이미지 모델
  qualityFood: process.env.IMAGE_QUALITY_FOOD || 'medium',
  qualityForm: process.env.IMAGE_QUALITY_FORM || 'medium',
  // 글 AI 고속 모드 (비용 2배, 속도 향상). 끄려면 환경 변수 TEXT_FAST=0
  textFast: process.env.TEXT_FAST !== '0',
};

// 걸린 시간을 Vercel 로그에 남김 (로그 메뉴에서 확인)
export async function timed(label, fn) {
  const t = Date.now();
  try {
    const out = await fn();
    console.log(`[시간] ${label}: ${((Date.now() - t) / 1000).toFixed(1)}초`);
    return out;
  } catch (err) {
    console.log(`[시간] ${label}: ${((Date.now() - t) / 1000).toFixed(1)}초 (실패)`);
    throw err;
  }
}

/* ---------- 이미지 AI에 항상 붙이는 조건 ----------
   네 프롬프트의 [이미지 조건]에 화면 구현에 필요한 조건을 더한 것 (← 표시가 추가분) */
export const IMAGE_RULES = {
  food: [
    '음식 자체가 중심인 사실적인 사진.',
    '순수한 흰색 단색 배경. 그림자·접시·받침 없이 음식만, 형태를 읽을 수 있는 조명.', // ← "단순한 배경"을 흰 배경으로 구체화 (화면에서 배경을 깨끗이 지우게)
    '패키지, 로고, 광고 문구, 일러스트, 손, 조리 도구, 장식용 소품 제외.',
    '음식의 주요 윤곽이 프레임 안에 들어오도록 한다.',
    '문자, 번호, 설명문을 이미지 안에 넣지 않는다.',
    '콜라주가 아닌 한 장의 사진.',
  ].join('\n'),
  form: [
    '독립적이고 완결된 추상 조형 하나.',
    '조형은 무광 흰색, 배경은 투명하지 않은 순수한 흰색.',
    '3/4 시점, 부드러운 스튜디오 조명, 화면 가운데에 적당한 여백.',
    '전체 형태가 프레임 안에 들어오도록 배치.',
    '입체감은 조명과 부드러운 음영으로 표현.',
    '바닥 그림자 없이 공중에 떠 있는 것처럼.', // ← 맛보기 화면에서 그릇 위에 떠 있어서
    '문자, 번호, 설명문, 소품, 받침대, 확대 컷, 다른 시점, 콜라주 제외.',
  ].join('\n'),
};

/* ---------- 요청 처리 도우미 ---------- */
export async function readJSON(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

// 접근 코드 확인 (ACCESS_CODE를 설정한 경우에만)
export function allowed(req) {
  const code = process.env.ACCESS_CODE;
  return !code || req.headers['x-access-code'] === code;
}

export function handler(fn, { method = 'POST' } = {}) {
  return async (req, res) => {
    if (req.method !== method) return send(res, 405, { error: 'method' });
    if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: 'no_key' });
    if (!allowed(req)) return send(res, 401, { error: 'access_code' });
    try {
      const body = method === 'POST' ? await readJSON(req) : {};
      await fn(req, res, body);
    } catch (err) {
      console.error(err);
      send(res, 500, { error: String(err.message || err).slice(0, 300) });
    }
  };
}

/* ---------- 프롬프트 파일 읽기 ---------- */
export function prompt(file) {
  const text = fs.readFileSync(path.join(process.cwd(), 'prompts', file), 'utf8');
  // 맨 위 제목 줄과 <!-- 주석 -->은 빼고 보냄
  return text.replace(/<!--[\s\S]*?-->/g, '').replace(/^# .*\n+/, '').trim();
}

/* ---------- OpenAI: 글 AI (GPT-6 Astra) ---------- */
export async function askJSON({ instructions, text, images = [], name, schema, effort = 'medium' }) {
  const content = [{ type: 'input_text', text }];
  for (const img of images) {
    // 문자열이면 그대로, { url, detail }이면 'low'(작게 보기, 빠르고 저렴)처럼 지정
    if (typeof img === 'string') content.push({ type: 'input_image', image_url: img });
    else content.push({ type: 'input_image', image_url: img.url, detail: img.detail || 'auto' });
  }
  const request = (fast) => fetch(`${OPENAI}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELS.text,
      reasoning: { effort },
      ...(fast ? { service_tier: 'priority' } : {}),
      instructions,
      input: [{ role: 'user', content }],
      text: { format: { type: 'json_schema', name, schema, strict: true } },
    }),
  });
  let r = await timed(`글 AI ${name}${MODELS.textFast ? ' (고속)' : ''}`, () => request(MODELS.textFast));
  let data = await r.json().catch(() => ({}));
  // 고속 모드를 지원하지 않으면 일반 모드로 다시 요청
  if (!r.ok && MODELS.textFast && /service_tier|priority/i.test(data.error?.message || '')) {
    console.log('[알림] 고속 모드 미지원 → 일반 모드로 재요청');
    r = await timed(`글 AI ${name}`, () => request(false));
    data = await r.json().catch(() => ({}));
  }
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${data.error?.message || 'error'}`);
  const msg = (data.output || []).find((o) => o.type === 'message');
  const out = msg?.content?.find((c) => c.type === 'output_text')?.text ?? data.output_text;
  if (!out) throw new Error('OpenAI: 빈 응답');
  return JSON.parse(out);
}

/* ---------- OpenAI: 이미지 AI ---------- */
export async function drawImage({ prompt: p, kind }) {
  const isFood = kind === 'food';
  const r = await timed(`이미지 ${kind} (${isFood ? MODELS.imageFood : MODELS.imageForm})`, () => fetch(`${OPENAI}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: isFood ? MODELS.imageFood : MODELS.imageForm,
      prompt: `${p}\n\n[이미지 조건]\n${isFood ? IMAGE_RULES.food : IMAGE_RULES.form}`,
      size: '1024x1024',
      quality: isFood ? MODELS.qualityFood : MODELS.qualityForm,
      // 흰 배경으로 그림 (투명 배경을 요청하면 모델에 따라 검은 배경이 나와서). 음식 이미지는 화면에서 배경을 지움
      background: 'opaque',
      output_format: 'jpeg',
      output_compression: 88,
      n: 1,
    }),
  }));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI image ${r.status}: ${data.error?.message || 'error'}`);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image: 빈 응답');
  return `data:image/jpeg;base64,${b64}`;
}

/* ---------- Meshy: 3D 변환 ---------- */
export async function meshy(pathname, init = {}) {
  if (!process.env.MESHY_API_KEY) throw new Error('MESHY_API_KEY 없음');
  const r = await fetch(`${MESHY}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Meshy ${r.status}: ${data.message || 'error'}`);
  return data;
}

/* ---------- JSON 스키마 짧게 쓰기 ---------- */
export const S = {
  str: (description) => ({ type: 'string', description }),
  bool: (description) => ({ type: 'boolean', description }),
  arr: (items, description) => ({ type: 'array', items, description }),
  obj: (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false }),
};

/* ---------- 공유 저장소 (Vercel Blob) ----------
   갤러리 작품과 "이전 관람객이 고른 조형" 기록을 모든 기기가 같이 보도록 저장.
   Vercel에서 Blob 저장소(Public)를 프로젝트에 연결하면 BLOB_READ_WRITE_TOKEN(또는 '이름_READ_WRITE_TOKEN')이 자동으로 생겨.
   로컬 테스트: BLOB_LOCAL_DIR=폴더 를 주면 그 폴더에 파일로 저장 (요금 없음) */
let readyPromise = null;
export const store = {
  // 저장소 열쇠: 보통 BLOB_READ_WRITE_TOKEN인데, 연결할 때 이름 앞부분(prefix)을 바꾸면 '이름_READ_WRITE_TOKEN'이 됨
  get token() {
    const env = process.env;
    if (env.BLOB_READ_WRITE_TOKEN) return env.BLOB_READ_WRITE_TOKEN;
    const key = Object.keys(env).find((k) => /_READ_WRITE_TOKEN$/.test(k) && String(env[k]).startsWith('vercel_blob_'));
    return key ? env[key] : '';
  },
  // 열쇠가 없어도 Vercel이 저장소 연결 정보(BLOB_STORE_ID 등)를 넣어 주면 그걸로 접속됨
  get enabled() {
    return Boolean(store.token || process.env.BLOB_LOCAL_DIR || Object.keys(process.env).some((k) => /^BLOB_/.test(k)));
  },
  // 실제로 저장소를 쓸 수 있는지 (연결 정보 이름이 달라도, 한 번 접속해 보고 되면 씀. 결과는 기억)
  async ready() {
    if (store.enabled) return true;
    readyPromise ??= (async () => {
      try {
        const { list } = await import('@vercel/blob');
        await list({ prefix: 'works/', limit: 1 });
        console.log('[알림] 저장소 연결 확인 (연결 정보 이름이 기본과 다름)');
        return true;
      } catch { return false; }
    })();
    return readyPromise;
  },
  // 저장소 연결 정보 이름들 (값은 안 보여줌, 진단용)
  get envNames() { return Object.keys(process.env).filter((k) => /BLOB|_READ_WRITE_TOKEN$/.test(k)); },
  get auth() { return store.token ? { token: store.token } : {}; },

  // 파일 하나 저장 → 주소 반환
  async put(pathname, body, contentType, overwrite = false) {
    const dir = process.env.BLOB_LOCAL_DIR;
    if (dir) {
      const file = path.join(dir, pathname);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      return `file://${file}`;
    }
    const { put } = await import('@vercel/blob');
    const r = await put(pathname, body, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: overwrite, ...store.auth });
    return r.url;
  },

  // 폴더 안 파일 목록 (이름순. 이름 앞에 '거꾸로 시간'을 붙여서 최신이 먼저 나옴)
  async list(prefix, limit) {
    const dir = process.env.BLOB_LOCAL_DIR;
    if (dir) {
      const folder = prefix.slice(0, prefix.lastIndexOf('/') + 1);
      const d = path.join(dir, folder);
      if (!fs.existsSync(d)) return [];
      return fs.readdirSync(d).map((f) => folder + f).filter((p) => p.startsWith(prefix)).sort().slice(0, limit)
        .map((p) => ({ pathname: p, url: `file://${path.join(dir, p)}` }));
    }
    const { list } = await import('@vercel/blob');
    const r = await list({ prefix, limit, ...store.auth });
    return r.blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  },

  // 저장한 JSON 읽기
  async readJSON(url) {
    if (url.startsWith('file://')) return JSON.parse(fs.readFileSync(url.slice(7), 'utf8'));
    const r = await fetch(url);
    if (!r.ok) throw new Error(`blob ${r.status}`);
    return r.json();
  },
};

// 최신이 먼저 오도록 하는 파일 이름 (거꾸로 시간 + 임의 글자)
export function newKey() {
  const rev = String(9_999_999_999_999 - Date.now()).padStart(13, '0');
  return `${rev}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- 서명 ----------
   AI가 만든 조형 계획에 서버만 아는 도장을 찍어 둠.
   나중에 기록으로 저장할 때 도장이 맞는 것만 "학습" 기록으로 인정 (장난 입력 거르기) */
const PLAN_FIELDS = ['type', 'features', 'method', 'rationale', 'prompt', 'reference'];
function planText(plan) {
  return JSON.stringify(PLAN_FIELDS.map((k) => plan?.[k] ?? null));
}
export function signPlan(plan) {
  const key = process.env.MEMORY_SECRET || process.env.OPENAI_API_KEY || '';
  return crypto.createHmac('sha256', key).update(planText(plan)).digest('hex').slice(0, 32);
}
export function checkPlan(plan) {
  if (!plan || typeof plan.sig !== 'string') return null;
  const a = Buffer.from(plan.sig);
  const b = Buffer.from(signPlan(plan));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return Object.fromEntries(PLAN_FIELDS.map((k) => [k, plan[k] ?? '']));
}

/* ---------- 실제 음식 사진 검색 ----------
   무료 사진 사이트 중 키가 있는 곳을 씀 (우선순위: Unsplash → Pixabay → Pexels)
     UNSPLASH_ACCESS_KEY / PIXABAY_API_KEY / PEXELS_API_KEY
   키가 하나도 없으면 Wikimedia Commons(위키백과 사진 저장소)에서 찾음 → 키 없이 바로 동작
   끄려면 PHOTOS=0 (그러면 예전처럼 AI가 음식 이미지를 그림)
   검색 결과 앞쪽 18장 중 10장을 무작위로 골라서 관람객마다 조금씩 다르게.
   배경은 화면(브라우저)에서 AI가 지움 */
export const PHOTO_COUNT = 6;
// 브라우저에서 배경을 못 지운 사진은 빠지므로, 여유 있게 더 골라서 보냄 (화면에는 실제 사진 + AI 이미지 합쳐 6장)
export const PICK_MAX = 8;
const UNSPLASH = process.env.UNSPLASH_BASE || 'https://api.unsplash.com';
const PIXABAY = process.env.PIXABAY_BASE || 'https://pixabay.com/api';
const COMMONS = process.env.COMMONS_BASE || 'https://commons.wikimedia.org/w/api.php';
// Wikimedia는 누가 요청하는지 이름을 밝히도록 요구함
const UA = 'FoodsCreateNewForm/1.0 (graduation exhibition; https://foods-create-new-form.vercel.app)';

// 사진을 가져와도 되는 주소 (api/photo.js가 이 주소의 사진만 전달)
export const PHOTO_HOSTS = ['images.unsplash.com', 'pixabay.com', 'cdn.pixabay.com', 'images.pexels.com', 'upload.wikimedia.org'];
export const PHOTO_UA = UA;

export function photoSite() {
  if (process.env.UNSPLASH_ACCESS_KEY) return 'Unsplash';
  if (process.env.PIXABAY_API_KEY) return 'Pixabay';
  if (process.env.PEXELS_API_KEY) return 'Pexels';
  if (process.env.PHOTOS === '0') return null;
  return 'Wikimedia Commons';
}

async function getJSON(label, url, headers = {}) {
  const r = await timed(label, () => fetch(url, { headers: { 'User-Agent': UA, ...headers } }));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${label} ${r.status}: ${data.error || data.errors?.[0] || 'error'}`);
  return data;
}

// 검색어 하나로 사진 사이트 검색 → 사진 목록
async function searchOne(site, query, page = 1) {
  let list = [];
  if (site === 'Unsplash') {
    const data = await getJSON(`사진 검색 Unsplash (${query})`,
      `${UNSPLASH}/search/photos?${new URLSearchParams({ query, per_page: '30', page: String(page), content_filter: 'high' })}`,
      { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, 'Accept-Version': 'v1' });
    list = (data.results || []).filter((p) => p.urls?.regular).map((p) => ({
      src: p.urls.regular, w: p.width, h: p.height, alt: p.alt_description || '',
      by: p.user?.name || '', link: p.links?.html || '',
      track: p.links?.download_location || '', // Unsplash 규칙: 사진을 쓰면 '다운로드'로 알려줘야 함
      thumb: p.urls.small,
    }));
  } else if (site === 'Pixabay') {
    // 먼저 '음식' 카테고리 안에서 찾고, 너무 적으면 전체에서 다시 찾음
    const search = (extra) => getJSON(`사진 검색 Pixabay (${query})`,
      `${PIXABAY}/?${new URLSearchParams({ key: process.env.PIXABAY_API_KEY, q: query, image_type: 'photo', per_page: '20', page: String(page), safesearch: 'true', ...extra })}`);
    let data = await search({ category: 'food' });
    if ((data.hits || []).length < 8) data = await search({});
    // 원본(1280px) 대신 960px 사진을 씀 → 받기·배경 지우기가 빨라짐 (화면에는 충분한 크기)
    list = (data.hits || []).filter((p) => p.largeImageURL).map((p) => ({
      src: p.webformatURL?.includes('_640') ? p.webformatURL.replace('_640', '_960') : p.largeImageURL,
      w: p.imageWidth, h: p.imageHeight, alt: p.tags || '',
      by: p.user || '', link: p.pageURL || '',
      thumb: p.webformatURL?.replace('_640', '_340') || p.previewURL,
    }));
  } else if (site === 'Pexels') {
    const data = await getJSON(`사진 검색 Pexels (${query})`,
      `${PEXELS}/search?${new URLSearchParams({ query, per_page: '30', page: String(page) })}`,
      { Authorization: process.env.PEXELS_API_KEY });
    list = (data.photos || []).filter((p) => p.src?.large).map((p) => ({
      src: p.src.large, w: p.width, h: p.height, alt: p.alt || '',
      by: p.photographer || '', link: p.url || '',
      thumb: p.src.medium,
    }));
  } else if (site === 'Wikimedia Commons') {
    const data = await getJSON(`사진 검색 Wikimedia (${query})`, `${COMMONS}?${new URLSearchParams({
      action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '40', gsroffset: String((page - 1) * 40),
      gsrsearch: `${query} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1000',
    })}`);
    const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    list = Object.values(data.query?.pages || {})
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) // 검색 순위대로
      .map((p) => ({ p, ii: p.imageinfo?.[0] }))
      .filter(({ ii }) => ii?.thumburl && /jpe?g|png/.test(ii.mime || '') && ii.width >= 500 && ii.height >= 400)
      .map(({ p, ii }) => ({
        src: ii.thumburl, w: ii.thumbwidth, h: ii.thumbheight,
        alt: strip(ii.extmetadata?.ImageDescription?.value) || p.title.replace(/^File:|\.[a-z]+$/gi, ''),
        by: strip(ii.extmetadata?.Artist?.value) || 'Wikimedia', link: ii.descriptionurl || '',
        thumb: ii.thumburl.replace('/1000px-', '/330px-'),
      }));
  }
  return list;
}

// 검색어 여러 개(같은 음식의 다른 모습)로 찾아서 섞음 → 글 AI가 보고 고름
// 고른 사진이 PHOTO_COUNT장보다 적으면 Wikimedia Commons 사진도 보탬 (동시에 찾음)
// page: 몇 번째 검색 결과 묶음인지 ('다른 사진 보기'를 누를 때마다 다음 묶음), exclude: 이미 보여준 사진 주소
// 돌려주는 값: { photos, page: 마지막으로 쓴 묶음 번호 }
export async function searchPhotos(queries, name, { page = 1, exclude = [] } = {}) {
  const qs = [...new Set((Array.isArray(queries) ? queries : [queries]).map((q) => String(q || '').trim()).filter(Boolean))].slice(0, 3);
  // 배경이 단순한 사진(배경 지우기가 잘 됨)을 찾으려고 '단독으로 찍은' 검색어를 하나 더
  if (qs[0]) qs.unshift(`${qs[0]} isolated`);
  const seen = new Set(exclude);
  const gather = async (site, pg) => {
    const lists = await Promise.all(qs.map((q) => searchOne(site, q, pg).catch((err) => { console.error(err); return []; })));
    // 검색어마다 앞쪽부터 번갈아 섞기 (한 검색어 결과만 몰리지 않게), 같은 사진·이미 보여준 사진은 빼기
    const list = [];
    for (let i = 0; list.length < CANDIDATES && lists.some((l) => i < l.length); i++) {
      for (const l of lists) {
        const p = l[i];
        if (p && !seen.has(p.src) && list.length < CANDIDATES) { seen.add(p.src); list.push(p); }
      }
    }
    let picked;
    try {
      picked = await pickPhotos(list, name, qs.join(', '));
    } catch (err) {
      console.error('[알림] 사진 고르기 실패 → 검색 순서대로 씀', err);
      picked = list.slice(0, PHOTO_COUNT);
    }
    return picked.map(({ thumb, ...p }) => ({ ...p, site }));
  };
  const site = photoSite();
  if (!site) return { photos: [], page };
  // 시간을 줄이려고 사진 사이트 + Wikimedia를 한꺼번에 찾고 고름 (모자란 자리는 화면에서 AI 이미지로 채움)
  const rounds = [gather(site, page)];
  if (site !== 'Wikimedia Commons') rounds.push(gather('Wikimedia Commons', page));
  const [first, wiki = []] = await Promise.all(rounds);
  // 사진 사이트 사진을 먼저, Wikimedia는 모자랄 때만
  let photos = first;
  if (photos.length < PHOTO_COUNT) photos = [...photos, ...wiki];
  console.log(`[알림] 사진 고름: ${site} ${first.length}장, Wikimedia ${wiki.length}장 → ${Math.min(photos.length, PICK_MAX)}장 보냄`);
  return { photos: photos.slice(0, PICK_MAX), page };
}

/* ---------- 글 AI가 후보 사진을 보고 좋은 사진만 고르기 ----------
   검색 결과에는 음식이 아닌 사진, 음식이 작게 나온 사진, 다른 것과 섞인 사진이 섞여 있어서
   작은 미리보기를 글 AI에 보여주고 '그 음식의 특징이 잘 드러나는' 사진만 고름 */
const CANDIDATES = 30; // AI에게 보여줄 후보 수 (많을수록 고르는 데 오래 걸림)

async function thumbData(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`thumb ${r.status}`);
  const type = r.headers.get('content-type') || 'image/jpeg';
  if (!type.startsWith('image/')) throw new Error('thumb type');
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}

const PICK_INSTRUCTIONS = `관람객이 입력한 음식의 사진 후보를 보고, 음식의 조형적 특징을 분석하기 좋은 사진을 고른다.

[정확도: 하나라도 어기면 고르지 않는다]
- 사진 속 주인공이 바로 그 음식이다. 이름이 비슷한 다른 음식, 그 음식이 재료로 조금 들어간 요리는 고르지 않는다.
  (그 음식이 원래 요리라면 그 요리 자체로 본다)
- 실제 사진이다. 그림, 일러스트, 3D 렌더, 장난감, 모형은 고르지 않는다.
- 음식이 화면에서 충분히 크고, 형태가 잘리거나 흐리지 않다.
- 음식 전체 윤곽이 사진 안에 다 들어와 있다. 음식이 화면 가장자리에서 잘리거나 화면을 꽉 채운 확대 사진은 고르지 않는다.
  (배경을 지워서 음식 모양만 남기므로, 음식과 배경이 분명히 구분되어야 한다)
- 사람, 손, 포장지, 글자, 로고, 식기가 음식보다 눈에 띄지 않는다.

[좋은 사진]
- 그 음식의 고유한 형태, 윤곽, 단면, 표면 결이 잘 드러난다.
- 배경이 단순할수록 좋다 (흰 배경·단색 배경에 음식만 있는 사진이 가장 좋다).

[다양성]
- 고른 사진들이 서로 다른 모습이 되게 한다: 통째, 자른 단면, 작은 조각, 여러 개 모인 모습, 다른 품종이나 색, 다른 시점.
- 거의 같은 모습의 사진은 하나만 고른다.

좋은 순서대로 번호를 쓴다. 기준에 맞는 사진이 적으면 맞는 것만 쓴다.`;

async function pickPhotos(candidates, name, query) {
  if (!candidates.length) return [];
  // 미리보기를 서버에서 받아서 전달 (사진 사이트가 AI의 직접 접근을 막는 경우 대비). 못 받은 사진은 후보에서 뺌
  const thumbs = await timed('후보 사진 받기', () => Promise.all(candidates.map((c) => thumbData(c.thumb || c.src).catch(() => null))));
  const usable = candidates.map((c, i) => ({ c, img: thumbs[i] })).filter((x) => x.img);
  if (!usable.length) return [];
  const out = await askJSON({
    instructions: PICK_INSTRUCTIONS,
    text: `음식: ${name} (검색어: ${query})\n후보 사진 ${usable.length}장이 0번부터 순서대로 첨부되어 있다. 최대 ${PICK_MAX}장을 고른다.`,
    images: usable.map((x) => ({ url: x.img, detail: 'low' })),
    name: 'photo_pick',
    schema: S.obj({ picks: S.arr({ type: 'integer' }, `고른 사진 번호 (좋은 순서, 최대 ${PICK_MAX}개)`) }),
    effort: 'low',
  });
  const seen = new Set();
  const picked = (out.picks || [])
    .filter((i) => Number.isInteger(i) && i >= 0 && i < usable.length && !seen.has(i) && seen.add(i))
    .slice(0, PICK_MAX)
    .map((i) => usable[i].c);
  console.log(`[알림] 사진 ${usable.length}장 중 ${picked.length}장 고름 (${name})`);
  // 맞는 사진이 적어도 엉뚱한 사진으로 채우지 않음 (부족하면 다른 곳에서 보충하거나 AI가 그림)
  return picked;
}

// Unsplash: 관람객이 사진을 고르면 '다운로드했다'고 알려줌 (Unsplash 이용 규칙)
export async function trackPhoto(url) {
  if (!process.env.UNSPLASH_ACCESS_KEY || !url.startsWith(`${UNSPLASH}/photos/`)) return;
  await fetch(url, { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }).catch(() => {});
}
