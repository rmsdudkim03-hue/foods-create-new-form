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
    '흰색 또는 아주 밝은 단색 배경과 형태를 읽을 수 있는 조명.', // ← "단순한 배경"을 흰 배경으로 구체화
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
  for (const url of images) content.push({ type: 'input_image', image_url: url });
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
   Vercel에서 Blob 저장소(Public)를 프로젝트에 연결하면 BLOB_READ_WRITE_TOKEN이 자동으로 생겨.
   로컬 테스트: BLOB_LOCAL_DIR=폴더 를 주면 그 폴더에 파일로 저장 (요금 없음) */
export const store = {
  get enabled() { return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_LOCAL_DIR); },

  // 파일 하나 저장 → 주소 반환
  async put(pathname, body, contentType) {
    const dir = process.env.BLOB_LOCAL_DIR;
    if (dir) {
      const file = path.join(dir, pathname);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      return `file://${file}`;
    }
    const { put } = await import('@vercel/blob');
    const r = await put(pathname, body, { access: 'public', contentType, addRandomSuffix: false });
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
    const r = await list({ prefix, limit });
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

/* ---------- Pexels: 실제 음식 사진 검색 ----------
   무료 사진 사이트. 검색 결과 앞쪽 18장 중 10장을 무작위로 골라서 관람객마다 조금씩 다르게.
   배경은 화면(브라우저)에서 AI가 지움 */
export const PHOTO_COUNT = 10;
export async function searchPhotos(query) {
  const url = `${PEXELS}/search?${new URLSearchParams({ query, per_page: '30' })}`;
  const r = await timed(`사진 검색 (${query})`, () => fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } }));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Pexels ${r.status}: ${data.error || 'error'}`);
  const list = (data.photos || []).filter((p) => p.src?.large);
  const top = list.slice(0, 18);
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [top[i], top[j]] = [top[j], top[i]];
  }
  return top.slice(0, PHOTO_COUNT).map((p) => ({
    src: p.src.large,
    w: p.width,
    h: p.height,
    alt: p.alt || '',
    by: p.photographer || '',
    link: p.url || '',
  }));
}
