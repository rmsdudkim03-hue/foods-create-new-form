// ② 맛보기 조형 6개 계획 (GPT-6 Astra). 그림은 이 계획으로 /api/image가 그림
// 프롬프트 원문: prompts/2-forms.md (+ 이전 관람객 참고: prompts/2-forms-memory.md)
import { handler, send, askJSON, prompt, S, store, timed, signPlan } from './_lib.js';
import { isImage } from './analyze.js';
import { recentWorks } from './works.js';

const MEMORY_COUNT = 8; // 참고할 이전 관람객 조형 수 (최근 것부터)

const FORM = S.obj({
  type: { type: 'string', enum: ['기본 조합', '조형적 재해석'] },
  features: S.arr(S.str('특징 번호'), '선택한 특징 번호 2~3개 (A와 B에서 최소 하나씩)'),
  method: S.str('결합 또는 재해석 방법 (한국어, 짧게)'),
  rationale: S.str('선택한 특징이 윤곽, 볼륨 분포, 단면, 연결, 공간 구성에 어떻게 작용하는지 (한국어, 1~2문장)'),
  prompt: S.str('이미지 AI에 넣을 조형 묘사 (영어)'),
  reference: S.str('이전 관람객 조형에서 이어받은 점 (한국어, 한 문장). 이어받지 않았으면 빈 문자열'),
});
const SCHEMA = S.obj({
  intro: S.str('음식쌍과 특징 후보 짧은 안내 (한국어)'),
  forms: S.arr(FORM, '정확히 6개. 기본 조합 3개 다음에 조형적 재해석 3개'),
});

const INSTRUCTIONS = `너는 웹 전시 작품의 한 단계를 맡는다. 아래 [프롬프트]를 따르되, 이미지를 직접 생성하지 않는다.
대신 6개 조형 각각을 이미지 AI가 그릴 수 있도록 '조형 묘사'(prompt)를 쓴다.
이미지 AI는 음식 사진과 분석 결과를 보지 못하고, 이 묘사 하나와 공통 이미지 조건만 받는다.
그러므로 묘사에는 음식 이름이나 음식의 외형을 쓰지 말고, 조형의 윤곽, 볼륨 분포, 단면, 연결, 공간 구성, 표면을 구체적인 형태 언어로 쓴다.
각 묘사는 다른 묘사를 보지 않고도 한 장을 그릴 수 있게 완결되게 쓴다.
흰색, 배경, 시점, 조명 같은 공통 이미지 조건은 다음 단계에서 자동으로 붙는다.
순서는 기본 조합 3개, 그다음 조형적 재해석 3개.
[실행]의 짧은 안내는 intro에, 선택 특징과 해석의 기록은 features, method, rationale에 쓴다.
[이전 관람객 참고]가 없으면 reference는 모두 빈 문자열로 둔다.`;

/* ---------- 이전 관람객이 고른 조형 (학습 기록) ----------
   공유 저장소에서 최근 기록을 읽어 글 AI에게 참고로 줌.
   음식 이름은 빼고 조형 묘사만 줌. 실패해도 조형 만들기는 그대로 진행.
   끄려면 환경 변수 MEMORY=0 */
async function memoryText() {
  if (process.env.MEMORY === '0' || !store.enabled) return '';
  try {
    const works = await timed('이전 관람객 기록 읽기', () => recentWorks(MEMORY_COUNT * 2));
    const plans = works.map((w) => w.plan).filter((p) => p?.prompt).slice(0, MEMORY_COUNT);
    if (!plans.length) return '';
    const lines = plans.map((p, i) => `${i + 1}. [${p.type}] ${p.method}\n   근거: ${p.rationale}\n   묘사: ${p.prompt}`);
    return `\n\n[이전 관람객 참고]\n${prompt('2-forms-memory.md')}\n\n[이전 관람객이 고른 조형] (최근 ${plans.length}개, 최신순)\n${lines.join('\n')}`;
  } catch (err) {
    console.error('[알림] 이전 관람객 기록을 못 읽음', err);
    return '';
  }
}

export default handler(async (req, res, body) => {
  const { A, B, analysis } = body;
  if (!A?.name || !B?.name || !isImage(A.image) || !isImage(B.image) || !analysis) return send(res, 400, { error: 'input' });
  const memory = await memoryText();
  const out = await askJSON({
    instructions: INSTRUCTIONS,
    text: `[프롬프트]\n${prompt('2-forms.md')}\n\nA 음식: ${A.name}\nB 음식: ${B.name}\n\n[분석된 특징]\n${JSON.stringify(analysis, null, 1)}${memory}`,
    images: [A.image, B.image],
    name: 'form_plans',
    schema: SCHEMA,
    effort: 'medium',
  });
  const order = { '기본 조합': 0, '조형적 재해석': 1 };
  const forms = (out.forms || []).filter((f) => f.prompt).sort((a, b) => order[a.type] - order[b.type]).slice(0, 6);
  if (forms.length < 6) throw new Error(`조형 계획이 ${forms.length}개뿐임`);
  // 도장 찍기: 관람객이 고른 뒤 저장할 때, AI가 만든 계획이 맞는지 확인용
  send(res, 200, { intro: out.intro, forms: forms.map((f) => ({ ...f, sig: signPlan(f) })), memory: Boolean(memory) });
});
