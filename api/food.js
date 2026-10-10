// ⓐ 음식인지 확인 + ⓪ 음식 사진 10장
//   사진 사이트 키(UNSPLASH_ACCESS_KEY / PIXABAY_API_KEY / PEXELS_API_KEY)가 있으면:
//     글 AI가 음식인지 확인하고 영어 검색어를 정함 → 사진 사이트에서 실제 사진 10장 검색
//   없으면 (예전 방식): 글 AI가 이미지 10장을 계획 → 이미지 AI가 그림. 프롬프트 원문: prompts/0-food-images.md
import { handler, send, askJSON, prompt, S, searchPhotos, photoSite, prewarmSearch } from './_lib.js';


// 실제 사진 모드: 음식인지 확인 + 검색어만 정함 (빠르게)
const PHOTO_SCHEMA = S.obj({
  is_food: S.bool('입력된 단어가 음식이면 true'),
  name: S.str('정리된 음식 이름 (한국어, 짧게). 음식이 아니면 빈 문자열'),
  message: S.str('음식이 아닐 때 관람객에게 보여줄 한 문장 (한국어). 음식이면 빈 문자열'),
  queries: S.arr(S.str('영어 검색어 (1~3단어)'), '사진 사이트에서 이 음식의 서로 다른 모습을 찾을 영어 검색어 3개. 첫째는 음식 이름 그대로 (예: broccoli / broccoli floret / broccoli cross section). 음식이 아니면 빈 배열'),
  ko: S.arr(S.str('한국어 검색어 (2~4단어)'), '같은 음식의 다른 모습을 찾을 한국어 검색어 2개 (예: 브로콜리 단면 / 브로콜리 송이). 음식이 아니면 빈 배열'),
});
const PHOTO_INSTRUCTIONS = `관람객이 입력한 단어가 음식인지 판단한다.
먹을 수 있는 것은 모두 음식으로 본다: 요리, 간식, 과자·사탕(상품 이름 포함), 음료, 술, 과일, 채소, 해산물, 고기 부위, 곡물, 양념, 재료, 지역 음식, 줄임말·사투리·영어 이름.
오타가 있어도 어떤 음식인지 짐작되면 음식으로 보고 name에 바른 이름을 쓴다. 애매하면 음식으로 본다.
음식이 아니면 is_food를 false로 하고, message에 "○○은(는) 음식이 아니에요. 다른 음식을 입력해 주세요"처럼 한 문장을 쓴다.
음식이면 name에 정리된 이름을, queries에 그 음식 사진을 찾을 짧은 영어 검색어 3개를 쓴다.
- 첫째: 음식 이름 그대로 (사진 사이트에서 흔히 쓰는 영어 이름)
- 둘째, 셋째: 같은 음식의 다른 모습 (자른 단면, 조각, 여러 개, 다른 품종 등) 중 그 음식에 어울리는 것
- 다른 음식이 섞여 나오기 쉬운 단어(요리, 레시피, 식탁 등)는 넣지 않는다.
ko에는 같은 음식의 다른 모습(단면, 조각, 여러 개 등)을 찾을 한국어 검색어 2개를 쓴다.
과자·사탕·초콜릿·라면 같은 상품 이름이면 포장지가 아닌 내용물을 찾도록 ko는 "○○ 낱개", "○○ 과자"처럼 쓰고,
queries는 영어 상품명이 있으면 그 이름, 없으면 내용물을 설명하는 일반 영어 이름(예: 꼬깔콘 → cone shaped corn snack)으로 쓴다.`;

const SCHEMA = S.obj({
  is_food: S.bool('입력된 단어가 음식이면 true'),
  name: S.str('정리된 음식 이름 (한국어, 짧게). 음식이 아니면 빈 문자열'),
  message: S.str('음식이 아닐 때 관람객에게 보여줄 한 문장 (한국어). 음식이면 빈 문자열'),
  interpretation: S.str('적용한 해석 한 줄 (한국어). 여러 해석이 가능하지 않았다면 빈 문자열'),
  shots: S.arr(
    S.obj({
      view: S.str('이 사진이 주는 시각 정보 (한국어, 짧게. 예: 전체 윤곽, 측면, 단면)'),
      prompt: S.str('이미지 AI에 그대로 넣을 사진 묘사 (영어). 이 묘사 하나만으로 사진 한 장을 그릴 수 있게 완결되게'),
    }),
    '정확히 10개. 음식이 아니면 빈 배열',
  ),
});

const INSTRUCTIONS = `너는 웹 전시 작품의 한 단계를 맡는다. 관람객이 입력한 단어를 받는다.

1) 먼저 그 단어가 음식인지 판단한다.
   음식이 아니면 is_food를 false로 하고, message에 "○○은(는) 음식이 아니에요. 다른 음식을 입력해 주세요"처럼 한 문장을 쓰고, shots는 빈 배열로 둔다.
2) 음식이면 아래 [프롬프트]를 따르되, 이미지를 직접 만들지 않는다.
   대신 이미지 10장을 그릴 '사진 묘사' 10개를 shots에 쓴다.
   각 묘사는 다른 묘사를 보지 못하는 이미지 AI에 한 장씩 따로 들어가므로, 그 자체로 완결되게 쓴다.
   10개가 서로 뚜렷하게 다른 종류와 형태·상태, 서로 다른 시각 정보를 보여주도록 [후보 구성]을 지킨다.
   배경, 조명, 금지 요소 같은 공통 이미지 조건은 다음 단계에서 자동으로 붙으니, 묘사는 음식과 구도에 집중한다.
   적용한 해석은 interpretation에 쓴다.`;

// AI 이미지 계획 (예전 방식, 프롬프트 원문 prompts/0-food-images.md). 음식인지 확인도 같이 함
async function planShots(word) {
  const out = await askJSON({
    instructions: INSTRUCTIONS,
    text: `[프롬프트]\n${prompt('0-food-images.md').replaceAll('{음식명}', word)}\n\n입력 단어: ${word}`,
    name: 'food_plan',
    schema: SCHEMA,
    effort: 'low',
  });
  return { ...out, shots: (out.shots || []).filter((s) => s.prompt).slice(0, 10) };
}

const notFood = (word, message) => ({ ok: false, message: message || `${word}은(는) 음식이 아니에요. 다른 음식을 입력해 주세요` });

export default handler(async (req, res, body) => {
  const word = String(body.word || '').trim().slice(0, 30);
  if (!word) return send(res, 400, { error: 'empty' });

  if (photoSite()) {
    // '다른 사진 보기': 이미 확인된 음식이면 검색어를 그대로 받아서 다음 묶음만 찾음 (음식 확인 생략)
    const given = Array.isArray(body.queries) ? body.queries.map((q) => String(q).slice(0, 40)).filter(Boolean).slice(0, 3) : [];
    const page = Math.max(1, Math.min(10, parseInt(body.page, 10) || 1));
    const exclude = Array.isArray(body.exclude) ? body.exclude.map(String).slice(0, 200) : [];
    let name = word;
    let queries = given;
    let ko = Array.isArray(body.ko) ? body.ko.map((q) => String(q).slice(0, 40)).filter(Boolean).slice(0, 2) : [];
    if (!queries.length) {
      prewarmSearch(word); // 음식 확인을 기다리는 동안 사진 검색을 먼저 시작 (빠르게)
      let out;
      try {
        out = await askJSON({
          instructions: PHOTO_INSTRUCTIONS,
          text: `입력 단어: ${word}`,
          name: 'food_check',
          schema: PHOTO_SCHEMA,
          effort: 'low',
        });
      } catch (err) {
        // 글 AI가 실패해도 체험이 막히지 않게: 입력한 단어를 음식으로 보고 그대로 검색
        console.error('[알림] 음식 확인 실패 → 입력 그대로 검색', err);
        out = { is_food: true, name: word, queries: [word], ko: [] };
      }
      if (!out.is_food) return send(res, 200, notFood(word, out.message));
      name = out.name || word;
      queries = out.queries?.length ? out.queries : [word];
      ko = out.ko || [];
    }
    // 사진만 찾아서 돌려줌 (사진 모드에서는 AI로 음식 이미지를 그리지 않음)
    const found = await searchPhotos(queries, name, { page, exclude, ko }).catch((err) => {
      console.error('[알림] 사진 검색 실패', err);
      return { photos: [], page };
    });
    const photos = found.photos;
    const shots = [];
    if (!photos.length && !shots.length) return send(res, 200, { ok: false, message: `${name} 사진을 찾지 못했어요. 다른 음식을 입력해 주세요` });
    return send(res, 200, { ok: true, name, interpretation: '', queries, ko, page: found.page, photos, shots });
  }

  const out = await planShots(word);
  if (!out.is_food) return send(res, 200, notFood(word, out.message));
  if (!out.shots.length) throw new Error('사진 묘사가 비어 있음');
  send(res, 200, { ok: true, name: out.name || word, interpretation: out.interpretation || '', shots: out.shots });
});
