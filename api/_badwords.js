/* =========================================================
   나쁜 말 거르기 (버킷리스트 방명록에서 사용)
   1) 아래 단어 목록으로 먼저 거르고
   2) OPENAI_API_KEY가 있으면 OpenAI 검사(moderation, 무료)로 한 번 더 걸러
   - 단어를 더하고 싶으면 KO / EN 목록에 넣으면 돼
   - 숫자·기호를 빼고 비교해서 '씨1발' 같은 것도 걸림. 세 글자 이상 단어는 띄어 써도('개 새 끼') 걸림
     (두 글자 단어는 '도시 발견'처럼 다른 낱말끼리 붙어 잘못 걸리지 않게 낱말 안에서만 봄)
   - 평범한 말에 섞이는 단어(보지, 씹다, 걸레, 미친듯이…)는 일부러 안 넣음
   ========================================================= */

// 한글 (숫자·기호를 뺀 뒤 들어 있으면 거름)
const KO = [
  '씨발', '시발', '씨빨', '시빨', '쓰발', '씌발', '씨팔', '씨벌',
  'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄴ', 'ㅈㄹ', 'ㅅㅍ',
  '병신', '븅신', '빙신', '병쉰', '등신',
  '좆', '존나', '존니', '좃같', '좇같', '좆까',
  '개새끼', '개색기', '개색끼', '개쌔끼', '개세끼', '개새기', '개섀끼', '개같은',
  '지랄', '염병', '엠창', '앰창', '니미', '느금', '니애미', '니엄마', '애미뒤', '애비뒤', '니기미', '썅', '쌍년', '쌍놈',
  '씹새', '씹년', '씹창', '씹할', '씹놈', '씹덕',
  '미친년', '미친놈', '미친새끼', '또라이', '돌아이',
  '한남충', '김치녀', '메갈년', '일베충', '틀딱', '급식충', '맘충', '짱깨', '쪽바리', '흑형',
  '섹스', '야동',
];
// 평범한 말인데 위 단어가 들어 있는 것 (먼저 지우고 검사)
const OK = ['시발점', '시발역', '시발택시', '니미츠', '미니미', '등신대', '등신불'];

// 영어 (단어 앞부분이 같으면 거름: fuck → fucking)
const EN = ['fuck', 'fck', 'shit', 'bitch', 'cunt', 'asshole', 'nigg', 'fag', 'retard', 'whore', 'slut', 'porn', 'sex'];

function koClean(t) {
  t = t.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');
  for (const w of OK) t = t.split(w).join('');
  return t;
}
function koBad(text) {
  const t = text.normalize('NFC');
  const words = t.split(/\s+/).map(koClean);
  const whole = koClean(t);
  return KO.some((w) => words.some((x) => x.includes(w)) || (w.length >= 3 && whole.includes(w)));
}
function enBad(text) {
  const words = text.toLowerCase().split(/[^a-z]+/);
  return words.some((w) => EN.some((b) => w.startsWith(b)));
}

export function hasBadWord(text) {
  return koBad(text) || enBad(text);
}

// OpenAI 검사. 키가 없거나 응답이 늦으면 통과(단어 목록만으로 거름)
// 버킷리스트엔 '죽기 전에'가 많이 나와서 자해·폭력 일반 항목은 보지 않음
const BLOCK = ['harassment', 'harassment/threatening', 'hate', 'hate/threatening', 'sexual', 'sexual/minors', 'violence/graphic'];
const OPENAI = process.env.OPENAI_BASE || 'https://api.openai.com/v1';
export async function flaggedByAI(text) {
  if (!process.env.OPENAI_API_KEY) return false;
  try {
    const r = await fetch(`${OPENAI}/moderations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return false;
    const cat = (await r.json()).results?.[0]?.categories || {};
    const hit = BLOCK.filter((k) => cat[k]);
    if (hit.length) console.log(`[방명록] AI 검사로 거름: ${hit.join(', ')}`);
    return hit.length > 0;
  } catch {
    return false;
  }
}
