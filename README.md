# FOODS CREATE NEW FORM

음식 두 가지의 특징으로 새로운 추상 조형을 만드는 체험형 웹 (졸업 작품).
디자인은 피그마 `web` 페이지(1440×1024 프레임)를 기준으로 구현.

## 흐름
메인 → 음식 A·B 입력 → AI가 음식별 이미지 10장 생성 → 한 장씩 고르기 → 분석(사진이 흰 재료로 바뀌는 효과)
→ 조각을 그릇에 넣기 → AI가 만든 맛보기 조형 6개 중 선택 → 3D 변환 → 갤러리

## 파일 구조
- `index.html` — 화면 8개의 뼈대
- `style.css` — 색·폰트 토큰(맨 위)과 화면별 스타일
- `js/app.js` — 화면 흐름과 인터랙션
- `js/ai.js` — 화면에서 AI(서버)를 부르는 부분. 서버를 못 쓰면 데모 모드로 동작
- `js/data.js` — 데모용 음식 이미지, 조각 위치, 맛보기 조형 배치, 갤러리 기본 작품
- `js/material.js` — 분석 화면에서 사진이 흰 재료(석고)로 바뀌는 효과
- `js/viewer3d.js` — three.js 3D 뷰어
- `api/` — Vercel 서버 함수 (AI 키는 여기서만 사용)
- `prompts/` — AI 단계별 프롬프트 원문. **프롬프트를 고치려면 이 파일들만 수정**
- `assets/` — 피그마에서 가져온 이미지, 샘플 3D 파일

## AI 단계
| 단계 | 서버 | 서비스 |
|---|---|---|
| 음식인지 확인 + 이미지 10장 계획 | `api/food.js` | GPT-6 Astra |
| 음식 이미지 그리기 | `api/image.js` | OpenAI 이미지 (저가 모델) |
| 특징 분석 | `api/analyze.js` | GPT-6 Astra |
| 맛보기 조형 6개 계획 | `api/forms.js` | GPT-6 Astra |
| 조형 이미지 그리기 | `api/image.js` | OpenAI 이미지 (고화질 모델) |
| 3D 변환 | `api/model.js` | Meshy |

## Vercel 환경 변수
| 이름 | 필수 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | 필수 | OpenAI API 키 |
| `MESHY_API_KEY` | 필수 | Meshy API 키 |
| `ACCESS_CODE` | 선택 | 설정하면 이 코드를 가진 기기에서만 실제 AI 사용 (주소 끝에 `?code=코드`를 붙여 한 번 열면 기억됨). 나머지는 데모 모드 |
| `TEXT_MODEL` | 선택 | 기본 `gpt-6-astra` |
| `IMAGE_MODEL_FOOD` / `IMAGE_QUALITY_FOOD` | 선택 | 기본 `gpt-image-1-mini` / `medium` |
| `IMAGE_MODEL_FORM` / `IMAGE_QUALITY_FORM` | 선택 | 기본 `gpt-image-2` / `high` |
| `MESHY_POLYCOUNT` | 선택 | 3D 면 개수, 기본 60000 |

## 좌표 규칙
`style="--x:87; --y:274"`는 피그마 좌표 그대로. `--px`, `--py`처럼 p가 붙은 값은 휴대폰(세로 화면, 600×1100 기준) 좌표.
JS가 화면 크기에 맞춰 `--u`(피그마 1px = 화면 몇 px)를 계산해서 전체를 비율대로 키우고 줄임.
