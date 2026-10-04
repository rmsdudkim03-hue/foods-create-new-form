// ① 특징 분석 (GPT-6 Astra)
// 프롬프트 원문: prompts/1-analyze.md
import { handler, send, askJSON, prompt, S } from './_lib.js';

// 도형 종류: '나만의 조합' 화면에서 특징을 글 대신 보여줄 기호 (js/glyphs.js와 같은 목록)
const GLYPHS = {
  grooves: '둘레를 따라 반복되는 홈·톱니·주름',
  stripe: '나란한 줄무늬, 결',
  layers: '층, 계단, 겹겹이 쌓임',
  branch: '가지, 갈라짐, 뻗어 나감',
  petals: '꽃잎, 방사형으로 붙은 둥근 조각',
  burst: '가시, 방사, 펼쳐짐, 팽창',
  dots: '작은 알갱이, 반복되는 점, 표면 밀도',
  cluster: '송이, 뭉침, 모여 있음',
  pores: '여러 개의 작은 구멍, 스펀지·기공',
  mesh: '그물, 격자, 칸칸이 나뉨',
  ring: '큰 구멍, 고리, 테두리',
  shell: '감싸는 껍질, 한쪽이 열린 곡면',
  spiral: '나선, 꼬임, 감김',
  wave: '물결, 곡률, 휘어짐, 유연함',
  fold: '접힘, 지그재그',
  blob: '말랑함, 탄성, 둥근 덩어리',
  drip: '흘러내림, 녹음, 늘어짐',
  crack: '갈라짐, 파단, 깨짐, 분리',
  veil: '투명함, 얇음, 빛 통과, 겹침',
  press: '압축, 눌림, 납작함',
};
// 도형 모양 값: 같은 종류라도 특징에 맞게 다르게 그리기 (js/glyphs.js shapeParams)
const NUM = (description) => ({ type: 'number', description });
const SHAPE = S.obj({
  count: { type: 'integer', description: '반복 개수 1~24 (홈·가시·꽃잎·층·갈래·줄·구멍 수, 나선은 감긴 횟수)' },
  weight: NUM('굵기 0(가늘게)~1(두껍게)'),
  taper: NUM('크기 변화 -1(끝·위로 갈수록 작아짐)~0(고름)~1(커짐)'),
  sharp: NUM('0(둥글게)~1(뾰족하게)'),
  spread: NUM('0(촘촘하게 모임)~1(듬성하게 퍼짐·크게 벌어짐)'),
  irregular: NUM('0(고르게)~1(불규칙하게)'),
  dir: { type: 'string', enum: ['up', 'down', 'side', 'out'], description: '방향: 위로 / 아래로 / 옆으로 / 사방으로' },
});
const FEATURE = S.obj({
  id: S.str('번호 (A1~A3, AK1~AK2, B1~B3, BK1~BK2)'),
  title: S.str('짧은 제목'),
  desc: S.str('객관적인 설명 한 문장'),
  glyph: { type: 'string', enum: Object.keys(GLYPHS), description: '이 특징을 가장 잘 나타내는 도형 기호 하나' },
  shape: SHAPE,
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
각 특징의 glyph에는 화면에서 그 특징을 기호로 보여줄 도형을 아래에서 하나 고르고, shape에는 그 특징의 실제 관계(개수, 굵기, 크기 변화, 뾰족함, 간격, 불규칙함, 방향)를 숫자로 옮긴다 (분석 내용에는 영향을 주지 않는다).
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
