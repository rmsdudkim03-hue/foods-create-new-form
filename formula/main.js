// FORMULA 첫 화면 모션: 글자 해독(text scramble)
// 왼쪽 글자부터 차례로 확정되고, 아직 확정 안 된 자리는 다른 글자로 계속 바뀜
//  - 로고: 구슬 글자 8개(f ( ) R M U L A)가 서로 섞이다가 제자리를 찾음
//  - 메뉴: 마우스를 올리면 글자가 무작위 문자로 바뀌다가 원래 글자로 돌아옴

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

// ── 메뉴 글자 ──
const CHARS = '!<>-_\\/[]{}=+*^?#ABCDEFXYZ0123456789';
function scrambleText(el, ms = 600) {
  if (reduce) return;
  const to = el.dataset.text;
  const run = (el._run || 0) + 1;
  el._run = run;
  const start = performance.now();
  (function tick(now) {
    if (el._run !== run) return;
    const k = (now - start) / ms;
    let out = '';
    for (let i = 0; i < to.length; i++) {
      const c = to[i];
      if (i < k * to.length || c === ' ' || c === '\n') out += c;
      else out += `<span class="r">${CHARS[Math.random() * CHARS.length | 0]}</span>`;
    }
    el.innerHTML = out;
    if (k < 1.05) requestAnimationFrame(tick);
    else el.textContent = to;
  })(start);
}

const navItems = [...document.querySelectorAll('.nav [data-text]')];
navItems.forEach((el) => {
  el.textContent = el.dataset.text;
  el.addEventListener('mouseenter', () => scrambleText(el));
  el.addEventListener('focus', () => scrambleText(el));
});

// 처음 열릴 때 + 로고에 마우스를 올릴 때 다시
logo.addEventListener('mouseenter', scrambleLogo);
logo.addEventListener('click', scrambleLogo);
scrambleLogo();
navItems.forEach((el, i) => setTimeout(() => scrambleText(el, 800), 150 + i * 80));
