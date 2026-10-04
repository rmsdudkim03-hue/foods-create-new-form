# FOODS CREATE NEW FORM

음식 두 가지의 특징으로 새로운 추상 조형을 만드는 체험형 웹 (졸업 작품).
디자인은 피그마 `web` 페이지(1440×1024 프레임)를 기준으로 구현.

## 흐름
메인 → 음식 고르기 (A·B 입력 → A 사진 고르기 → B 사진 고르기. 실제 사진, 배경 지움) → 분석(사진이 윤곽선으로 분해되는 효과)
→ 사진이 도형 조각으로 분해되고, 그릇에 떨어뜨려 쌓은 뒤 탑뷰로 바뀌면 관람객이 커서(손가락)로 저어서 섞음 → 맛보기 조형 6개 (점이 모여 형태가 되며 등장) 중 선택 → 3D 변환 + 좋아요/별로예요 → 처음 화면
갤러리는 메뉴에서 볼 수 있음. 모아보기로 전체 작품을 한눈에 보고, 누르면 크게 보기 (3D 파일이 있는 작품은 바로 3D로)

## 파일 구조
- `index.html` — 화면 8개의 뼈대
- `style.css` — 색·폰트 토큰(맨 위)과 화면별 스타일
- `js/app.js` — 화면 흐름과 인터랙션
- `js/ai.js` — 화면에서 AI(서버)를 부르는 부분. 서버를 못 쓰면 데모 모드로 동작
- `js/data.js` — 데모용 음식 이미지, 조각 위치, 맛보기 조형 배치, 갤러리 기본 작품
- `js/cutout.js` — 사진 배경 지우기 (브라우저에서 무료. 처음 한 번 모델 약 88MB를 받음)
- `js/contour.js` — 분석 화면에서 사진이 윤곽선(등고선)으로 분해되는 효과
- `js/cook.js` — 요리 화면: 도형 조각으로 분해 → 그릇에 떨어져 쌓임(물리) → 탑뷰로 바뀌고 커서로 저어서 섞음
- `js/particles.js` — 맛보기 조형이 점에서 모여 나타나는 효과
- `js/viewer3d.js` — three.js 3D 뷰어
- `api/` — Vercel 서버 함수 (AI 키는 여기서만 사용)
- `prompts/` — AI 단계별 프롬프트 원문. **프롬프트를 고치려면 이 파일들만 수정**
- `assets/` — 피그마에서 가져온 이미지, 샘플 3D 파일

## AI 단계
| 단계 | 서버 | 서비스 |
|---|---|---|
| 음식인지 확인 + 사진 검색 | `api/food.js` | GPT-6 Astra + Unsplash / Pixabay / Pexels (키 없으면 Wikimedia Commons) |
| 사진 전달 (배경 지우기용) | `api/photo.js` | 사진 사이트 |
| 배경 지우기 | `js/cutout.js` | 브라우저 (RMBG-1.4) |
| (Pexels 키가 없을 때) 음식 이미지 그리기 | `api/image.js` | OpenAI 이미지 (저가 모델) |
| 특징 분석 | `api/analyze.js` | GPT-6 Astra |
| 맛보기 조형 6개 계획 (2개는 관람객이 고른 특징 조합) | `api/forms.js` | GPT-6 Astra |
| 조형 이미지 그리기 | `api/image.js` | OpenAI 이미지 (고화질 모델) |
| 3D 변환 | `api/model.js` | Meshy |
| 공유 갤러리 + 관람객 선택 기록 | `api/works.js` | Vercel Blob |

## 관람객 평가 참고 (학습)
3D 결과 화면에서 관람객이 '좋아요' / '별로예요'를 누르면 저장되고, 다음 관람객의 조형 6개를 계획할 때 글 AI에 참고로 줌.
좋아요 = 이어받을 경향, 별로예요 = 피할 경향. 평가 안 한 조형은 참고하지 않음.
참고 규칙은 `prompts/2-forms-memory.md`. 기본 조합 3개는 이번 음식만으로, 조형적 재해석 중 1개만 좋아요 경향을 이어받음.

**하나의 조형으로 몰리지 않게 하는 장치**
- 최근 평가 30개 안에서 좋아요 3개, 별로예요 3개를 관람객마다 무작위로 뽑음 → 관람객마다 다른 예시를 봄
- 좋아요 예시를 이어받아 만든 조형은 다시 좋아요 예시로 쓰지 않음 → 따라 한 것을 또 따라 하는 반복을 끊음
- 프롬프트: 예시들의 공통점으로 모으지 않고 하나만 골라 이어받기, 나머지 5개는 기록과 뚜렷하게 다르게
AI가 만든 계획에는 서버가 도장(서명)을 찍어서, 도장이 맞는 기록만 참고에 씀 (장난 입력 거르기). 평가는 작품당 한 번만.
잘못 쌓인 기록은 Vercel → Storage → Blob에서 `works/`(작품) 또는 `ratings/`(평가) 파일을 지우면 됨.

## Vercel 환경 변수
| 이름 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | 필수 | OpenAI API 키 |
| `MESHY_API_KEY` | 필수 | Meshy API 키 |
| `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` | 선택 (추천) | 네이버 이미지 검색. 한국 음식·생소한 음식 사진이 많음. https://developers.naver.com → Application 등록 → 사용 API '검색' → Client ID / Client Secret. 하루 2만5천 번 무료. 있으면 다른 사진 사이트보다 먼저 씀 |
| `KAKAO_REST_API_KEY` | 선택 (추천) | 카카오(다음) 이미지 검색. 네이버 '검색' API를 등록할 수 없을 때 대신. https://developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가하기 → 앱 키의 **REST API 키**. 네이버 키가 있으면 네이버를 먼저 씀 |
| `FAL_KEY` | 선택 (추천) | 사진 배경 지우기를 서버에서 (BiRefNet, 빠르고 깨끗함). https://fal.ai 가입 → Keys에서 발급, 사용한 만큼 요금. 없으면 브라우저에서 지움 |
| `UNSPLASH_ACCESS_KEY` | 선택 | 실제 음식 사진 검색 (추천). https://unsplash.com/developers 에서 앱 만들고 Access Key 복사. 무료는 한 시간 50번 검색 (관람객 1명당 2번) |
| `PIXABAY_API_KEY` | 선택 | https://pixabay.com/api/docs/ 에서 로그인하면 키가 보임 |
| `PEXELS_API_KEY` | 선택 | 2026-10 현재 신규 발급 중단. 사진 키가 하나도 없으면 키가 필요 없는 Wikimedia Commons에서 찾음 |
| `PHOTOS` | 선택 | `0`이면 실제 사진 대신 AI가 음식 이미지를 그리는 예전 방식 |
| `TEXT_FAST` | 선택 | `1`이면 글 AI 고속 모드(우선 처리). 조금 빨라지지만 비용이 크게 늘어서 기본은 꺼짐 |
| `ACCESS_CODE` | 선택 | 설정하면 이 코드를 가진 기기에서만 실제 AI 사용 (주소 끝에 `?code=코드`를 붙여 한 번 열면 기억됨). 나머지는 데모 모드 |
| `TEXT_MODEL` | 선택 | 기본 `gpt-6-astra` |
| `IMAGE_MODEL_FOOD` / `IMAGE_QUALITY_FOOD` | 선택 | 기본 `gpt-image-1-mini` / `medium` |
| `IMAGE_MODEL_FORM` / `IMAGE_QUALITY_FORM` | 선택 | 기본 `gpt-image-2` / `high` |
| `MESHY_POLYCOUNT` | 선택 | 3D 면 개수, 기본 60000 |
| `BLOB_READ_WRITE_TOKEN` | 선택 | Vercel → Storage에서 Blob 저장소(**Public**)를 만들어 프로젝트에 연결하면 자동으로 생김 (이름이 달라도 됨. `api/works?diag=1`로 연결 확인). 없으면 갤러리는 각 기기에만 저장 |
| `MEMORY` | 선택 | `0`이면 관람객 평가 참고를 끔 |

## 좌표 규칙
`style="--x:87; --y:274"`는 피그마 좌표 그대로. `--px`, `--py`처럼 p가 붙은 값은 휴대폰(세로 화면, 600×1100 기준) 좌표.
JS가 화면 크기에 맞춰 `--u`(피그마 1px = 화면 몇 px)를 계산해서 전체를 비율대로 키우고 줄임.
