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

// ---------- task4: 음식 조각 ----------
// crop: 이미지에서 잘라낼 영역 (0~1 비율, [왼쪽, 위, 오른쪽, 아래])
// d: 데스크톱 위치 (조각 중심 x, y, 너비) / p: 모바일 위치
export const FRAGMENTS = {
  A: [
    { crop: [0.0, 0.46, 0.6, 0.8], d: [254, 516, 253], p: [110, 505, 130] },
    { crop: [0.2, 0.28, 1.0, 0.46], d: [559, 338, 322], p: [228, 362, 165] },
    { crop: [0.42, 0.0, 1.0, 0.45], d: [559, 512, 248], p: [232, 505, 128] },
  ],
  B: [
    { crop: [0.33, 0.7, 0.7, 1.0], d: [934, 416, 196], p: [385, 430, 100] },
    { crop: [0.53, 0.0, 1.0, 0.48], d: [1187, 320, 249], p: [500, 350, 128] },
    { crop: [0.08, 0.04, 0.49, 0.4], d: [1029, 540, 218], p: [425, 525, 112] },
  ],
};

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

// 1단계 데모에서 분석 화면을 보여주는 시간 (ms). 2단계에서는 실제 AI 응답을 기다림
export const ANALYZE_MS = 4500;

// 전시장용: 체험 도중 아무 조작이 없으면 처음 화면으로 돌아가는 시간 (ms)
export const IDLE_RESET_MS = 120000;
