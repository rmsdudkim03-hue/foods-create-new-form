// ① 특징 분석 (GPT-6 Astra)
// 프롬프트 원문: prompts/1-analyze.md
import { handler, send, askJSON, prompt, S } from './_lib.js';

const FEATURE = S.obj({
  id: S.str('번호 (A1~A3, AK1~AK2, B1~B3, BK1~BK2)'),
  title: S.str('짧은 제목'),
  desc: S.str('객관적인 설명 한 문장'),
});
const SIDE = S.obj({
  name: S.str('음식명'),
  visual: S.arr(FEATURE, '시각적 특징 정확히 3개'),
  knowledge: S.arr(FEATURE, '지식 기반 특성 후보 정확히 2개'),
});
const SCHEMA = S.obj({ A: SIDE, B: SIDE });

const INSTRUCTIONS = `아래 [프롬프트]를 그대로 따른다.
첫 번째 첨부 이미지가 A, 두 번째 첨부 이미지가 B이다. 두 이미지는 AI가 생성한 참고 이미지다.
[출력] 형식의 내용을 지정된 JSON 구조로 쓴다.`;

export function isImage(s) {
  return typeof s === 'string' && s.startsWith('data:image/') && s.length < 3_500_000;
}

export default handler(async (req, res, body) => {
  const { A, B } = body;
  if (!A?.name || !B?.name || !isImage(A.image) || !isImage(B.image)) return send(res, 400, { error: 'input' });
  const analysis = await askJSON({
    instructions: INSTRUCTIONS,
    text: `[프롬프트]\n${prompt('1-analyze.md')}\n\nA 음식: ${A.name}\nB 음식: ${B.name}`,
    images: [A.image, B.image],
    name: 'feature_analysis',
    schema: SCHEMA,
    effort: 'medium',
  });
  send(res, 200, { analysis });
});
