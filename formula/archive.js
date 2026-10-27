// ARCHIVE (피그마 Frame 18·19): 가운데 음식 사진 카드 한 장, 아래쪽에 그 음식의 특징 구슬 5개(흰색)
//  카드가 저절로 계속 바뀌며 나옴: 아래에서 올라와 가운데 → HOLD_MS 머문 뒤 위로 빠지고 다음 카드
//  순서: N 01 음식 A → N 01 음식 B → N 02 A → … → N 08 B → 처음부터
//  마우스를 올리면 멈춤(구슬에 올리면 특징 이름), 카드를 누르면 그 조형의 과정(history.html), 휠·← →로 직접 넘김
//  자료는 foods.js의 FOODS. 사진(photos)이 있는 카드만 나옴 (사진이 하나도 없을 때만 어두운 카드에 음식 이름)
const HOLD_MS = 2800;    // 카드 한 장이 머무는 시간
const BX = [66, 179, 292, 404, 520];   // 피그마: 카드 안 구슬 x 자리
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = document.getElementById('arcStage');
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 카드 목록: 실험(음식 짝) 하나에 음식 A·B 두 장
const ALL = window.FOODS.flatMap((f, i) => [0, 1].map((k) => ({ f, i, k })));
// 사진이 있는 카드만 돌림 (foods.js에 사진을 넣으면 저절로 늘어남). 하나도 없으면 전부(음식 이름 카드)
const WITH_PHOTO = ALL.filter(({ f, k }) => f.photos[k]);
const LIST = WITH_PHOTO.length ? WITH_PHOTO : ALL;
const cards = LIST.map(({ f, i, k }) => {
  const side = k ? 'B' : 'A', dir = 'archive/' + pad(i + 1) + '/';
  const beads = BX.map((x, j) => { const name = f.names[k * 5 + j];
    return `<img src="${dir}${side}${j + 1}.svg" alt="${esc(name)}" draggable="false" style="--bx:${x}; --i:${j}"><span style="--bx:${x}">${esc(name)}</span>`; }).join('');
  const el = document.createElement('a');
  el.className = 'acard wait';
  el.href = `history.html?n=${i + 1}`;
  el.setAttribute('aria-label', `N ${pad(i + 1)} ${f.foods[k]} — 과정 보기`);
  el.innerHTML = (f.photos[k] ? `<img class="photo" src="${esc(f.photos[k])}" alt="" draggable="false">` : `<p class="food">${esc(f.foods[k])}</p>`) + `<div class="beads">${beads}</div>`;
  stage.appendChild(el);
  return el;
});

const N = cards.length;
let cur = -1, timer = 0, paused = false;
function show(i) {
  i = (i + N) % N;
  if (i === cur) return;
  const prev = cards[cur];
  if (prev) { prev.classList.remove('on'); prev.classList.add('out'); setTimeout(() => { if (!prev.classList.contains('on')) prev.className = 'acard wait'; }, 1200); }
  const el = cards[i];
  el.className = 'acard wait';
  void el.offsetWidth;                         // 아래 대기 자리에서 출발하도록
  el.className = 'acard on';
  cur = i;
  history.replaceState(null, '', '#' + (i + 1));
  schedule();
}
function schedule() {
  clearTimeout(timer);
  if (!paused && !reduce) timer = setTimeout(() => show(cur + 1), HOLD_MS);
}

// 마우스를 올리면 멈춤
stage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { paused = true; clearTimeout(timer); } });
stage.addEventListener('pointerleave', () => { paused = false; schedule(); });
// 휠·키로 직접 넘김
let wheelLock = 0;
addEventListener('wheel', (e) => {
  e.preventDefault();
  const now = performance.now(), d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (now < wheelLock || Math.abs(d) < 8) return;
  wheelLock = now + 700;
  show(cur + (d > 0 ? 1 : -1));
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { show(cur + 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { show(cur - 1); e.preventDefault(); }
});
// 손가락으로 밀기
let ty = null;
addEventListener('touchstart', (e) => { ty = e.touches[0].clientY; }, { passive: true });
addEventListener('touchend', (e) => { if (ty == null) return; const d = ty - e.changedTouches[0].clientY; ty = null; if (Math.abs(d) > 40) show(cur + (d > 0 ? 1 : -1)); });

show((parseInt(location.hash.slice(1), 10) || 1) - 1);

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const wake = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
