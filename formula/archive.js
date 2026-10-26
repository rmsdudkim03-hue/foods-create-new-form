// ARCHIVE: 조형 카드가 가로로 한 줄 (ramp.design 느낌)
//  가운데 카드는 정면, 양옆으로 갈수록 3D로 돌아가며 뒤로 물러남
//  휠·끌기(손가락)·← → 키로 넘김, 옆 카드를 누르면 그 카드로, 가운데 카드를 누르면 뒤집혀 두 음식의 특징 10개
//  주소 끝에 #3 처럼 번호를 붙이면 그 카드부터 보임

// ── 카드 자료 ──
//  svg   앞면 조형 (forms/)       color 뒷면 바탕 = 조형 색
//  foods 두 음식 이름              icons archive/번호/A1~B5.svg (특징 구슬, names 순서와 같음)
//  ※ 음식 짝과 조형 번호는 받은 순서대로 붙였음. 바꾸려면 foods·names·icons 폴더 번호만 옮기면 됨
const CARDS = [
  { svg: 'forms/form_02.svg', color: '#c2d0bf', foods: ['꼬깔콘', '하리보'], names: ['원뿔형 구조', '얇은 껍질 구조', '돌출 선과 홈의 반복', '방향성 있는 윤곽', '크기 대비', '분절된 덩어리', '통통한 볼륨', '매끄러운 광택', '굴곡진 윤곽', '좌우 대칭 구성'] },
  { svg: 'forms/form_12.svg', color: '#dad690', foods: ['핫도그', '김'], names: ['막대형 형태', '도톰한 볼륨', '곡면 처리', '불규칙한 요철', '겹 구조', '판 형태', '얇은 층 구조', '직선적인 윤곽', '주름과 굴곡', '층의 반복'] },
  { svg: 'forms/no_03.svg', color: '#e6e6e6', foods: ['치즈', '식빵'], names: ['유동적인 형태', '길게 늘어난 연결부', '굵기 변화', '매끄러운 곡면', '물방울형 곡선', '사각 덩어리', '분절 구조', '도톰한 단면', '거칠고 불규칙한 요철', '끊어진 윤곽'] },
  { svg: 'forms/no_04.svg', color: '#fcbf9f', foods: ['아몬드', '프레첼'], names: ['타원형 덩어리', '볼록한 곡면', '뾰족한 윤곽', '가는 홈과 주름', '개별 단위', '고리 형태', '둥근 띠 구조', '접합 구조', '겹침과 높낮이', '여러 개의 열린 공간'] },
  { svg: 'forms/no_05.svg', color: '#c1daf7', foods: ['감자칩', '꽈배기'], names: ['얇은 판 형태', '휘어진 면', '물결형 윤곽', '불규칙한 말림', '작은 부풀음과 요철', '나선형 형태', '도톰한 곡면', '굴곡진 윤곽', '연속적인 비틀림', '사선 방향의 홈'] },
  { svg: 'forms/no_06.svg', color: '#f88248', foods: ['팽이버섯', '소금빵'], names: ['원통형 줄기', '다발 구조', '선형 반복', '반구형 갓', '완만한 곡선', '방추형 몸체', '겹침 구조', '띠 모양의 반복', '가늘어지는 비례', '초승달형 윤곽'] },
  { svg: 'forms/no_07.svg', color: '#8c9ac0', foods: ['루꼴라', '송편'], names: ['세로로 긴 형태', '반복적인 갈래와 홈', '좌우 분기 구조', '높낮이와 방향의 변화', '두께 대비', '반달형 덩어리', '둥근 윤곽', '단위 형태', '풍성한 볼륨', '매끈한 면과 접합선'] },
  { svg: 'forms/no_08.svg', color: '#849d97', foods: ['토마토', '빙수'], names: ['방사형 배열', '끝이 좁아지는 형태', '완만한 곡선', '입체적인 높낮이', '중앙 결합 구조', '봉우리형 구성', '물방울형 형태', '유연한 곡면', '불균일한 높이와 두께', '퍼지고 이어지는 윤곽'] },
];

const SPREAD = 1.12;    // 카드 사이 간격 (카드 폭의 배수)
const TILT = 52;        // 가운데에서 한 칸 옆 카드가 돌아간 각도(도)
const EASE = 0.11;      // 따라가는 빠르기 (클수록 빠름)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('arcStage');
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cards = CARDS.map((c, i) => {
  const no = 'N ' + pad(i + 1), dir = 'archive/' + pad(i + 1) + '/';
  const row = (side, label) => `<div class="row"><b class="bit">${label}</b>${[1, 2, 3, 4, 5].map((k) => {
    const name = c.names[(side === 'A' ? 0 : 5) + k - 1];
    return `<img src="${dir}${side}${k}.svg" alt="${esc(name)}" title="${esc(name)}" draggable="false">`;
  }).join('')}</div>`;
  const el = document.createElement('div');
  el.className = 'card';
  el.style.setProperty('--c', c.color);
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `${no} ${c.foods.join(' × ')}`);
  el.innerHTML = `<div class="flip">
    <div class="face front"><span class="no bit">${no}</span><span class="mark bit">FORMULA</span><img src="${c.svg}" alt="${no} 조형" draggable="false"></div>
    <div class="face back"><span class="no bit">${no}</span><span class="mark bit">FEATURES</span>
      <p class="foods">${esc(c.foods[0])} × ${esc(c.foods[1])}</p>
      <div class="rows">${row('A', 'A')}${row('B', 'B')}</div></div>
  </div>`;
  stage.appendChild(el);
  return el;
});

const N = cards.length;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const start = clamp((parseInt(location.hash.slice(1), 10) || 1) - 1, 0, N - 1);
let pos = start, target = start, cur = -1;

// ── 아래 설명 갱신 (가운데 카드가 바뀔 때) ──
const capNo = document.getElementById('arcNo'), capTitle = document.getElementById('arcTitle');
const capGo = document.getElementById('arcGo'), capCount = document.getElementById('arcCount');
function caption(i) {
  const c = CARDS[i];
  capNo.textContent = 'N ' + pad(i + 1);
  capTitle.innerHTML = `${esc(c.foods[0])} × ${esc(c.foods[1])}`.split(' ').map((w, k) => `<span class="w" style="--i:${k}">${w}</span>`).join(' ');
  capGo.href = 'history.html?n=' + (i + 1);
  capCount.textContent = pad(i + 1) + ' / ' + pad(N);
  history.replaceState(null, '', '#' + (i + 1));
}

// ── 그리기: 카드마다 가운데에서 떨어진 정도(d)로 위치·각도·깊이 ──
function render() {
  const cw = cards[0].offsetWidth, gap = cw * SPREAD;
  cards.forEach((el, i) => {
    const d = i - pos, a = Math.abs(d), s = Math.sign(d);
    const x = s * (a < 1 ? a : 1 + (a - 1) * 0.78) * gap;           // 멀어질수록 조금씩 촘촘히
    const rot = -clamp(d, -1.7, 1.7) * TILT;                        // 옆으로 갈수록 돌아감
    const z = -Math.min(a, 2.5) * cw * 0.32;                         // 옆 카드는 뒤로
    el.style.transform = `translate3d(${x.toFixed(1)}px,0,${z.toFixed(1)}px) rotateY(${rot.toFixed(2)}deg)`;
    el.style.opacity = clamp(1 - (a - 2.2) * 0.8, 0, 1).toFixed(3);
    el.style.zIndex = String(100 - Math.round(a * 10));
    el.style.setProperty('--sheen', (Math.abs(Math.sin(rot * Math.PI / 180)) * 0.22).toFixed(3));
    el.style.visibility = a > 3.6 ? 'hidden' : '';
  });
  const c = clamp(Math.round(pos), 0, N - 1);
  if (c !== cur) {
    cur = c; caption(c);
    cards.forEach((el, i) => { if (i !== c) el.classList.remove('flipped'); });
  }
}

function tick() {
  pos += (target - pos) * (reduce ? 1 : EASE);
  if (Math.abs(target - pos) < 0.0005) pos = target;
  render();
  requestAnimationFrame(tick);
}

// ── 넘기기: 휠 / 끌기 / 키 ──
let snapT = 0;
const snap = () => { target = clamp(Math.round(target), 0, N - 1); };
addEventListener('wheel', (e) => {
  e.preventDefault();
  const dv = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  target = clamp(target + dv / 700, -0.3, N - 0.7);
  clearTimeout(snapT); snapT = setTimeout(snap, 140);
}, { passive: false });

let drag = null;
stage.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, t: target, moved: false, last: e.clientX, time: performance.now(), v: 0 };
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const gap = cards[0].offsetWidth * SPREAD, dx = e.clientX - drag.x, now = performance.now();
  if (Math.abs(dx) > 6) { drag.moved = true; stage.classList.add('drag'); }
  drag.v = (e.clientX - drag.last) / Math.max(1, now - drag.time); drag.last = e.clientX; drag.time = now;
  target = clamp(drag.t - dx / gap, -0.3, N - 0.7);
});
const endDrag = (e) => {
  if (!drag) return;
  stage.classList.remove('drag');
  if (drag.moved) { target -= clamp(drag.v * 0.35, -1.2, 1.2); snap(); }   // 휙 밀면 한두 장 더
  else {
    // 그냥 누름: 옆 카드면 그 카드로, 가운데 카드면 뒤집기
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
    const i = cards.indexOf(hit);
    if (i === cur) hit.classList.toggle('flipped');
    else if (i >= 0) target = i;
  }
  drag = null;
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', () => { drag = null; stage.classList.remove('drag'); snap(); });

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { target = clamp(Math.round(target) + 1, 0, N - 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { target = clamp(Math.round(target) - 1, 0, N - 1); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' ') { cards[cur].classList.toggle('flipped'); e.preventDefault(); }
});

render();
requestAnimationFrame(tick);

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const wake = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
