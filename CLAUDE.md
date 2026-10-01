# CLAUDE.md — FOODS CREATE NEW FORM

졸업 작품 체험형 웹. 관람객이 음식 두 개를 입력하면 AI가 음식 이미지를 만들고, 고른 이미지의 특징을 분석해서
새로운 추상 조형 6개를 제안하고, 하나를 3D로 바꿔 보여준다. 음식이 무엇인지보다 **조형적 가능성**이 중요한 작품.

## 작업자와 소통
- 작업자는 디자이너(웹 개발 초보). 디자인은 피그마에서 하고, 코드는 Claude가 맡는다.
- 설명은 한국어 반말로 짧고 구조적으로. 전문 용어는 풀어서.
- 코드 주석도 한국어로, 디자이너가 읽을 수 있게.

## 디자인 기준
- 피그마: https://www.figma.com/design/DmWZA6oER0ZTUp7JDaE61a/%EC%A1%B8%EC%97%85%EC%9E%91%ED%92%88?node-id=498-88 (`web` 페이지, 1440×1024 프레임 10개)
- 화면 요소 좌표는 피그마 값을 그대로 씀: `style="--x:87; --y:274"`. 휴대폰(세로, 600×1100 기준)은 `--px`, `--py`.
  `js/app.js`의 `layout()`이 `--u`(피그마 1px = 화면 몇 px)를 계산해서 전체를 비율대로 키우고 줄인다.
- 흰 배경, 폰트는 Apple SD Gothic Neo → Noto Sans KR. 조형은 **흰색 무광**으로 통일.

## 구조
- `index.html` 화면 8개 / `style.css` 토큰과 스타일 / `js/app.js` 흐름과 인터랙션
- `js/ai.js` 화면에서 서버(AI)를 부르는 부분. 서버를 못 쓰면 데모 모드(젤리·브로콜리만)
- `js/material.js` 분석 화면에서 사진이 흰 석고 재료로 바뀌는 효과 / `js/viewer3d.js` three.js 3D 뷰어
- `api/` Vercel 서버 함수. AI 키는 여기서만 사용 (`_lib.js` 공통, `food` `image` `analyze` `forms` `model` `model-file` `status` `works`)
- `prompts/` AI 단계별 프롬프트 원문 (작업자가 작성)

## AI 흐름
음식 확인 + 이미지 10장 계획(GPT-6 Astra) → 음식 이미지(gpt-image-1-mini) → 특징 분석(Astra)
→ 조형 6개 계획(Astra) → 조형 이미지(gpt-image-2.5-flare) → 3D 변환(Meshy, 텍스처 없이)
- 이미지 AI는 한 번에 한 장만 그리므로, 여러 장을 조율하는 조건은 글 AI가 먼저 계획하고 이미지 AI는 한 장씩 그린다.
- 조형 이미지 AI에는 음식 사진을 주지 않는다 (음식 외형을 따라 그리지 않게).
- 단계별 소요 시간은 서버에서 `[시간] ...`으로 Vercel 로그에 남긴다.

## 규칙
- **프롬프트 원문(`prompts/*.md`) 내용은 작업자 확인 없이 바꾸지 않는다.** 바꿨다면 파일 맨 위 `<!-- 변경 기록 -->`에 날짜와 이유를 남긴다 (HTML 주석은 AI에 보내지 않음).
- 화면에 조형의 출처 음식을 따로 드러내지 않는다.
- AI 생성물에는 안내 문구 유지: 이미지 선택 화면 "AI가 생성한 참고 이미지예요", 3D 화면 "보이지 않는 면은 AI가 추정한 형태예요".

## 배포
- `main`에 푸시하면 Vercel이 자동 배포 (https://foods-create-new-form.vercel.app).
- 환경 변수(Vercel, Production): `OPENAI_API_KEY`, `MESHY_API_KEY`, `ACCESS_CODE`. 선택: README 참고.
- `ACCESS_CODE`가 있으면 주소에 `?code=...`를 붙여 연 기기에서만 실제 AI, 나머지는 데모 모드.
- 브랜치로 푸시하면 Preview 배포가 되는데, 환경 변수가 Production에만 있어서 AI가 안 된다.

## 테스트
- 실제 AI 호출은 요금이 든다 (관람객 1명당 대략 $1~3).
- 로컬 테스트: `OPENAI_BASE`, `MESHY_BASE` 환경 변수로 가짜 서버 주소를 지정하면 `api/`를 요금 없이 돌려볼 수 있다.
- 정적 서버로 `index.html`만 열면 데모 모드로 전체 흐름 확인 가능.

## 남은 일
- 실제 AI로 단계별 시간 측정 후 추가 속도 개선
- 공유 갤러리 + 이전 관람객 참고: `api/works.js`, 저장소는 Vercel Blob(Public). 저장소가 없으면 갤러리는 각 기기(localStorage)에만 저장
  - 참고 규칙 `prompts/2-forms-memory.md`는 Claude 초안 → 작업자 확인 필요
  - 로컬 테스트: `BLOB_LOCAL_DIR=폴더`로 저장소 대신 폴더에 저장
- Meshy Pro는 한 달 약 50회 변환. 전시 기간엔 요금제 상향 필요
