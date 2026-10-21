// FORMULA 첫 화면 모션: 글자 해독(text scramble)
// 왼쪽 글자부터 차례로 확정되고, 아직 확정 안 된 자리는 다른 글자로 계속 바뀜
//  - 로고(FORMULA): 구슬 글자 8개(f ( ) R M U L A)가 서로 섞이다가 제자리를 찾음
// 메뉴 모션: 글자 솟아오르기(split text reveal) — 맨 아래 '메뉴' 부분

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 로고 ──
const LOGO_MS = 1400;      // 다 맞춰지는 데 걸리는 시간
const SWAP_EVERY = 3;      // 몇 프레임마다 무작위 글자를 바꿀지 (1이면 매 프레임, 클수록 느리게)
const logo = document.getElementById('logo');
const slots = [...logo.querySelectorAll('.slot')];
const KEYS = slots.map((s) => s.dataset.k);
// 글자마다 원래 칸 크기 (무작위 글자를 넣을 때 그 글자 크기로 보여주기 위해)
const BOX = Object.fromEntries(slots.map((s) => [s.dataset.k, s.getAttribute('viewBox')]));

function show(slot, k, scrambled) {
  const use = slot.firstElementChild;
  if (use.getAttribute('href') !== `#g-${k}`) {
    use.setAttribute('href', `#g-${k}`);
    slot.setAttribute('viewBox', BOX[k]);
  }
  slot.classList.toggle('r', scrambled);
}

let logoRun = 0;
function scrambleLogo() {
  if (reduce) return;
  const run = ++logoRun;
  const start = performance.now();
  let frame = 0;
  (function tick(now) {
    if (run !== logoRun) return;
    const k = (now - start) / LOGO_MS;
    const swap = frame++ % SWAP_EVERY === 0;
    slots.forEach((slot, i) => {
      if (i < k * slots.length) show(slot, slot.dataset.k, false);
      else if (swap) {
        // 자기 글자 말고 다른 글자 하나를 골라 넣음
        let r;
        do r = KEYS[Math.random() * KEYS.length | 0]; while (r === slot.dataset.k && KEYS.length > 1);
        show(slot, r, true);
      }
    });
    if (k < 1.05) requestAnimationFrame(tick);
    else slots.forEach((s) => show(s, s.dataset.k, false));
  })(start);
}

// 처음 열릴 때 + 로고에 마우스를 올릴 때 다시
logo.addEventListener('mouseenter', scrambleLogo);
logo.addEventListener('click', scrambleLogo);
scrambleLogo();

// ── 메뉴: 글자 솟아오르기 ──
// 글자마다 span을 씌우고 순서대로 조금씩 늦게(transition-delay) 올라오게 함
const CHAR_DELAY = 30;     // 글자 사이 간격(ms)
const ITEM_DELAY = 90;     // 메뉴 항목 사이 간격(ms) — 처음 열릴 때 왼쪽 위부터 차례로
const navItems = [...document.querySelectorAll('.nav a')];
navItems.forEach((a) => {
  const text = a.textContent;
  a.setAttribute('aria-label', text.replace(/\n/g, ' '));
  let i = 0;
  a.innerHTML = text.split('\n').map((line) => `<span class="line" aria-hidden="true">${
    [...line].map((c) => (c === ' ' ? ' ' : `<span class="ch" style="transition-delay:${(i++) * CHAR_DELAY}ms">${c}</span>`)).join('')
  }</span>`).join('');
});
function rise(a) {
  a.classList.add('reset');          // 움직임 없이
  a.classList.remove('on');          // 글자를 아래(가려진 곳)로 내려놓고
  void a.offsetWidth;
  a.classList.remove('reset');
  requestAnimationFrame(() => a.classList.add('on'));   // 다시 솟아오르게
}
// 처음 열릴 때 차례로 + 마우스를 올리면 그 메뉴만 다시
navItems.forEach((a, n) => {
  setTimeout(() => rise(a), 150 + n * ITEM_DELAY);
  a.addEventListener('mouseenter', () => rise(a));
  a.addEventListener('focus', () => rise(a));
});
