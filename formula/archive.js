// ARCHIVE: 실험한 음식 짝 카드가 가로로 한 줄 (ramp.design 느낌)
//  카드 하나 = 실험 하나. 앞면 = 음식 A 사진, 뒷면 = 음식 B 사진
//  가운데 카드는 정면, 양옆으로 갈수록 3D로 돌아가며 뒤로 물러남
//  휠·끌기(손가락)·← → 키로 넘김, 옆 카드를 누르면 그 카드로, 가운데 카드를 누르면 다른 음식으로 뒤집힘
//  주소 끝에 #3 처럼 번호를 붙이면 그 카드부터 보임

// ── 카드 자료: foods.js의 FOODS (히스토리와 같이 씀. 사진·이름은 거기서 바꿈) ──
const CARDS = window.FOODS;

const SPREAD = 1.12;    // 카드 사이 간격 (카드 폭의 배수)
const TILT = 52;        // 가운데에서 한 칸 옆 카드가 돌아간 각도(도)
const EASE = 0.11;      // 따라가는 빠르기 (클수록 빠름)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('arcStage');
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const cards = CARDS.map((c, i) => {
  const no = 'N ' + pad(i + 1), dir = 'archive/' + pad(i + 1) + '/';
  // 한 면 = 음식 하나 (사진이 있으면 사진, 없으면 음식 이름 + 특징 구슬 5개)
  const face = (k) => {
    const side = k ? 'B' : 'A', food = c.foods[k], photo = c.photos[k];
    const beads = [1, 2, 3, 4, 5].map((n) => { const name = c.names[k * 5 + n - 1];
      return `<img src="${dir}${side}${n}.svg" alt="${esc(name)}" title="${esc(name)}" draggable="false">`; }).join('');
    const body = photo
      ? `<img class="photo" src="${esc(photo)}" alt="${esc(food)}" draggable="false">`
      : `<p class="food">${esc(food)}</p><div class="beads">${beads}</div>`;
    return `<div class="face ${k ? 'back' : 'front'}${photo ? ' has-photo' : ''}">${body}<span class="no bit">${no} · ${side}</span><span class="mark bit">${esc(food)}</span></div>`;
  };
  const el = document.createElement('div');
  el.className = 'card';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `${no} ${c.foods.join(' × ')}`);
  el.innerHTML = `<div class="flip">${face(0)}${face(1)}</div>`;
  stage.appendChild(el);
  return el;
});

const N = cards.length;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const start = clamp((parseInt(location.hash.slice(1), 10) || 1) - 1, 0, N - 1);
let pos = start, target = start, cur = -1;

// 가운데 카드가 바뀌면 주소 끝 번호만 바꿈 (#3 → 새로고침해도 그 카드부터)
function caption(i) { history.replaceState(null, '', '#' + (i + 1)); }
const flip = (el) => el.classList.toggle('flipped');

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
    if (i === cur) flip(hit);
    else if (i >= 0) target = i;
  }
  drag = null;
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', () => { drag = null; stage.classList.remove('drag'); snap(); });

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { target = clamp(Math.round(target) + 1, 0, N - 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { target = clamp(Math.round(target) - 1, 0, N - 1); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' ') { flip(cards[cur]); e.preventDefault(); }
});

render();
requestAnimationFrame(tick);

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const wake = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
