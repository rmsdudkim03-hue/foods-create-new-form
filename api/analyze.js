// ① 특징 분석 (GPT-6 Astra)
// 프롬프트 원문: prompts/1-analyze.md
import { handler, send, askJSON, prompt, S } from './_lib.js';

// 도형 종류: '나만의 조합' 화면에서 특징을 글 대신 보여줄 기호 (js/glyphs.js와 같은 목록)
const GLYPHS = {
  dots: '작은 알갱이, 반복되는 점, 표면 밀도',
  grooves: '홈, 주름, 세로·가로 줄무늬',
  layers: '층, 계단, 겹겹이 쌓임',
  branch: '가지, 갈라짐, 뻗어 나감',
  ring: '구멍, 고리, 빈 공간, 테두리',
  spiral: '나선, 꼬임, 감김',
  wave: '물결, 곡률, 휘어짐, 유연함',
  burst: '방사, 펼쳐짐, 팽창',
  blob: '말랑함, 탄성, 둥근 덩어리',
  crack: '갈라짐, 파단, 깨짐, 분리',
  veil: '투명함, 얇음, 빛 통과, 겹침',
  press: '압축, 눌림, 납작함',
  fold: '접힘, 주름진 막',
  cluster: '송이, 뭉침, 모여 있음',
};
const FEATURE = S.obj({
  id: S.str('번호 (A1~A3, AK1~AK2, B1~B3, BK1~BK2)'),
  title: S.str('짧은 제목'),
  desc: S.str('객관적인 설명 한 문장'),
  glyph: { type: 'string', enum: Object.keys(GLYPHS), description: '이 특징을 가장 잘 나타내는 도형 기호 하나' },
});
const SIDE = S.obj({
  name: S.str('음식명'),
  visual: S.arr(FEATURE, '시각적 특징 정확히 3개'),
  knowledge: S.arr(FEATURE, '지식 기반 특성 후보 정확히 2개'),
});
const SCHEMA = S.obj({ A: SIDE, B: SIDE });

const INSTRUCTIONS = `아래 [프롬프트]를 그대로 따른다.
첫 번째 첨부 이미지가 A, 두 번째 첨부 이미지가 B이다. 두 이미지는 AI가 생성한 참고 이미지다.
[출력] 형식의 내용을 지정된 JSON 구조로 쓴다.
각 특징의 glyph에는 화면에서 그 특징을 기호로 보여줄 도형을 아래에서 하나 고른다 (분석 내용에는 영향을 주지 않는다).
${Object.entries(GLYPHS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`;

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
