// 갤러리: 3D 링 캐러셀 (모션 UI M115 mirror-hall-carousel-3d 응용, 바닥 반사는 없앰)
//  카드 N장을 rotateY(i × 360/N) translateZ(R)로 원통에 세우고, 링 전체를 rotateY로 돌림
//  끌어서 놓으면 속도를 더한 위치에서 가장 가까운 칸으로 스프링처럼 맞춰 멈춤. 뒤쪽 카드일수록 흐리고 옅게
//  휠·← → 키·손가락으로도 넘김. 가만히 두면 AUTO_MS마다 한 칸씩 저절로 돎 (전시용)
//  사진은 아래 GALLERY 목록에 넣으면 됨 (파일은 formula/gallery/ 폴더). 비어 있으면 조형 그림으로 자리만
const GALLERY = [
  // { src: 'gallery/01.jpg', title: '제목' },   ← 이런 식으로 한 줄씩 (사진 1088×1360, 4:5)
  { src: 'gallery/01.jpg', title: 'N 01' },
  { src: 'gallery/02.jpg', title: 'N 02' },
  { src: 'gallery/03.jpg', title: 'N 03' },
  { src: 'gallery/04.jpg', title: 'N 04' },
  { src: 'gallery/05.jpg', title: 'N 05' },
  { src: 'gallery/06.jpg', title: 'N 06' },
  { src: 'gallery/07.jpg', title: 'N 07' },
  { src: 'gallery/08.jpg', title: 'N 08' },
];
const AUTO_MS = 3500;   // 저절로 한 칸 넘어가는 간격 (0이면 안 넘어감)
const R_U = 560;        // 링 반지름 (피그마 px)

const items = GALLERY.length ? GALLERY : (window.FOODS || []).map((f, i) => ({ src: f.svg, title: `N ${String(i + 1).padStart(2, '0')}`, ph: true }));
const N = Math.max(items.length, 1), STEP = 360 / N;
const ring = document.getElementById('ring'), gal = document.getElementById('gal');
const idxEl = document.getElementById('galIdx'), ttlEl = document.getElementById('galTtl');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cards = items.map((it) => {
  const c = document.createElement('div');
  c.className = 'gal-card' + (it.ph ? ' ph' : '');
  c.innerHTML = `<img src="${esc(it.src)}" alt="${esc(it.title || '')}" draggable="false">`;
  ring.appendChild(c);
  return c;
});
let unit = Math.min(innerWidth / 1920, innerHeight / 1080);
const measure = () => { const t = document.createElement('i'); t.style.cssText = 'position:absolute;width:calc(1000 * var(--u))'; gal.appendChild(t); unit = t.offsetWidth / 1000; t.remove(); };
measure(); addEventListener('resize', measure);

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let rot = reduce ? 0 : -120, vel = 0, target = 0, dragging = false, lastX = 0, lastT = 0, lastInput = 0, shown = -1;
function render() {
  ring.style.transform = `rotateY(${rot}deg)`;
  const R = R_U * unit;
  cards.forEach((c, i) => {
    const a = i * STEP;
    const k = (1 - Math.cos((a + rot) * Math.PI / 180)) / 2;   // 0 = 맨 앞, 1 = 맨 뒤
    c.style.transform = `rotateY(${a}deg) translateZ(${R}px)`;
    c.style.filter = `blur(${(k * k * 4).toFixed(2)}px) saturate(${(1 - k * 0.4).toFixed(3)})`;
    c.style.opacity = (1 - k * 0.55).toFixed(3);
  });
  const fi = ((-Math.round(rot / STEP)) % N + N) % N;
  if (fi !== shown) { shown = fi; idxEl.textContent = `${String(fi + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`; ttlEl.textContent = items[fi] ? items[fi].title || '' : ''; }
}
function loop() {
  if (!dragging) { const a = (target - rot) * 0.09; vel = (vel + a) * 0.78; rot += vel; }   // 스프링으로 칸에 맞춤
  render();
  requestAnimationFrame(loop);
}
const go = (d) => { target = Math.round(target / STEP) * STEP - d * STEP; lastInput = performance.now(); };
gal.addEventListener('pointerdown', (e) => { dragging = true; gal.classList.add('drag'); gal.setPointerCapture(e.pointerId); lastX = e.clientX; lastT = performance.now(); vel = 0; lastInput = lastT; });
gal.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const now = performance.now(), dx = e.clientX - lastX, k = 0.42 * (1 / Math.max(unit, 0.3)) * 0.6;
  rot += dx * k; vel = vel * 0.6 + (dx * k) / Math.max(8, now - lastT) * 16 * 0.4;
  lastX = e.clientX; lastT = now; lastInput = now;
});
function end() { if (!dragging) return; dragging = false; gal.classList.remove('drag'); target = Math.round((rot + vel * 9) / STEP) * STEP; lastInput = performance.now(); }
gal.addEventListener('pointerup', end); gal.addEventListener('pointercancel', end);
let wheelLock = 0;
addEventListener('wheel', (e) => { e.preventDefault(); const now = performance.now(); if (now < wheelLock) return; const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(d) < 6) return; wheelLock = now + 450; go(d > 0 ? 1 : -1); }, { passive: false });
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); });
// 가만히 두면 저절로 한 칸씩
if (AUTO_MS && !reduce) setInterval(() => { if (!dragging && performance.now() - lastInput > AUTO_MS) go(1); }, AUTO_MS);
loop();

// 전시용: 2분 동안 조작이 없으면 첫 화면으로 (다른 페이지와 같게)
(() => { if (/[?&]check\b/.test(location.search)) return; let t = 0; const wake = () => { clearTimeout(t); t = setTimeout(() => { location.href = './'; }, 2 * 60 * 1000); };
  ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true })); wake(); })();
