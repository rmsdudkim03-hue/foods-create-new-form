/* =========================================================
   데이터 파일
   음식, 이미지, 맛보기 조형, 갤러리 항목은 전부 여기서 관리해.
   새 음식이나 이미지를 추가할 때는 이 파일만 고치면 돼.
   (좌표 숫자는 피그마 1440×1024 프레임 기준 px 값)
   ========================================================= */

// ---------- 음식 (A, B 목록에 이 순서대로 나옴. 10개까지 추가 예정) ----------
// images: 캐러셀에 나오는 순서. start: 처음에 가운데 오는 이미지 번호(0부터)
// w, h: 이미지 원본 픽셀 크기 (조각 자를 때 비율 계산용)
export const FOODS = {
  '젤리': {
    start: 1,
    images: [
      { src: 'assets/img/food/jelly-bear.png', w: 162, h: 249, alt: '곰 젤리' },
      { src: 'assets/img/food/jelly-yellow.png', w: 334, h: 327, alt: '노란 푸딩 젤리' },
      { src: 'assets/img/food/jelly-gumdrop.png', w: 234, h: 200, alt: '분홍 슈가 젤리' },
    ],
  },
  '브로콜리': {
    start: 2,
    images: [
      { src: 'assets/img/food/broccoli-full.png', w: 316, h: 311, alt: '브로콜리 한 송이' },
      { src: 'assets/img/food/broccoli-cut.png', w: 262, h: 288, alt: '반으로 자른 브로콜리' },
      { src: 'assets/img/food/broccoli-main.png', w: 383, h: 356, alt: '큰 브로콜리' },
    ],
  },
};

// (task4: 음식 조각은 js/cook.js가 고른 사진에서 자동으로 만듦)

// ---------- task5 / task6: 맛보기 조형 ----------
// form: 조형 이미지 [x, y, 너비, 높이], bowl: 그릇 [x, y] (그릇 크기는 463×232 고정)
// model: 이 조형 전용 3D 파일 경로. null이면 아래 SAMPLE_MODEL을 대신 보여줌
// (1단계에서는 받은 샘플 하나만 있어서 어떤 조형을 골라도 같은 3D가 나와)
export const SAMPLE_MODEL = 'assets/models/baby8.glb';
export const FORMS = [
  { id: 1, img: 'assets/img/form-1.png', form: [157, 254, 259, 216], bowl: [55, 389], model: null },
  { id: 2, img: 'assets/img/form-2.png', form: [592, 250, 240, 220], bowl: [481, 389], model: null },
  { id: 3, img: 'assets/img/form-3.png', form: [1004, 247, 283, 258], bowl: [914, 389], model: null },
  { id: 4, img: 'assets/img/form-4.png', form: [166, 644, 249, 207], bowl: [59, 759], model: null },
  { id: 5, img: 'assets/img/form-5.png', form: [604, 644, 224, 205], bowl: [485, 759], model: null },
  { id: 6, img: 'assets/img/form-6.png', form: [1044, 662, 211, 193], bowl: [918, 759], model: null },
];

// ---------- 갤러리 ----------
// 여기 있는 건 처음부터 보이는 작품. 체험을 끝내면 새 작품이 뒤에 자동으로 추가돼.
export const GALLERY_SEED = [
  { no: '04', name: '이름 미정', date: '2026 . 0922', img: 'assets/img/form-3.png', thumb: 'assets/img/gallery-04-small.png' },
  { no: '05', name: '치즈 아보카도', date: '2026 . 0922', img: 'assets/img/gallery-05.png', thumb: 'assets/img/gallery-05.png' },
];

// ---------- 데모 모드: '나만의 조합' 화면에 보여줄 특징 ----------
// 실제 AI 모드에서는 분석 결과(api/analyze)가 대신 들어감. 구조도 같음
// visual: 사진에서 보이는 특징 3개, knowledge: 알려진 성질 후보 2개, glyph: 화면에 보일 도형 (js/glyphs.js)
export const DEMO_FEATURES = {
  '젤리': {
    visual: [
      { title: '세로 홈이 도는 윤곽', desc: '둥근 몸체 둘레를 따라 세로 홈이 일정한 간격으로 반복된다.', glyph: 'grooves' },
      { title: '위로 좁아지는 계단 단면', desc: '아래가 넓고 위로 갈수록 단을 이루며 좁아진다.', glyph: 'layers' },
      { title: '빛이 통과하는 두께', desc: '가장자리가 얇아질수록 빛이 많이 통과해 밝게 보인다.', glyph: 'veil' },
    ],
    knowledge: [
      { title: '틀을 따라 굳는 성질', desc: '액체 상태로 틀에 부어 식히면 틀의 형태 그대로 굳는다.', glyph: 'press' },
      { title: '누르면 되돌아오는 탄성', desc: '눌렀다 놓으면 원래 형태로 천천히 되돌아온다.', glyph: 'blob' },
    ],
  },
  '브로콜리': {
    visual: [
      { title: '작은 송이의 반복', desc: '비슷한 모양의 작은 송이가 모여 큰 송이를 이룬다.', glyph: 'cluster' },
      { title: '가지가 갈라지는 구조', desc: '굵은 줄기가 위로 갈수록 여러 갈래로 나뉜다.', glyph: 'branch' },
      { title: '오돌토돌한 표면 밀도', desc: '표면이 아주 작은 알갱이로 촘촘하게 덮여 있다.', glyph: 'dots' },
    ],
    knowledge: [
      { title: '자라며 펼쳐지는 성질', desc: '자라는 동안 송이 사이가 벌어지며 바깥으로 펼쳐진다.', glyph: 'burst' },
      { title: '익히면 물러지는 성질', desc: '익히면 줄기와 송이가 부드러워져 쉽게 휘어진다.', glyph: 'wave' },
    ],
  },
};

// 1단계 데모에서 분석 화면을 보여주는 시간 (ms). 2단계에서는 실제 AI 응답을 기다림
export const ANALYZE_MS = 4500;

// 전시장용: 체험 도중 아무 조작이 없으면 처음 화면으로 돌아가는 시간 (ms)
export const IDLE_RESET_MS = 120000;
