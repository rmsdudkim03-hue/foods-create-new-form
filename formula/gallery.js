// 갤러리 (피그마 Frame 38·39): 사진이 화면 가운데 세로로 이어짐
//  스크롤·↑↓ 키(한 장씩)로 넘겨 봄. 사진을 누르면 뒤가 흐려지며 그 사진이 제자리에서 커져 가운데로(700×875)
//  크게 본 상태: 다시 누르거나 Esc → 제자리로 작아짐, ↑↓·←→ → 앞뒤 사진으로 바꿔 크게
//  사진은 아래 GALLERY 목록에 넣으면 됨 (파일은 formula/gallery/ 폴더). 비어 있으면 조형 그림으로 자리만
const GALLERY = [
  // { src: 'gallery/01.jpg', title: '제목' },   ← 이런 식으로 한 줄씩 (사진 1088×1360, 4:5)
  { src: 'gallery/all_a.jpg', title: 'FORMULA', wide: true },   // 가로 사진(3:2)은 wide: true
  { src: 'gallery/01.jpg', title: 'N 01' },
  { src: 'gallery/02.jpg', title: 'N 02' },
  { src: 'gallery/02b.jpg', title: 'N 02' },
  { src: 'gallery/02c.jpg', title: 'N 02' },
  { src: 'gallery/03.jpg', title: 'N 03' },
  { src: 'gallery/03b.jpg', title: 'N 03' },
  { src: 'gallery/04.jpg', title: 'N 04' },
  { src: 'gallery/04b.jpg', title: 'N 04' },
  { src: 'gallery/05.jpg', title: 'N 05' },
  { src: 'gallery/05b.jpg', title: 'N 05' },
  { src: 'gallery/06.jpg', title: 'N 06' },
  { src: 'gallery/06b.jpg', title: 'N 06' },
  { src: 'gallery/07.jpg', title: 'N 07' },
  { src: 'gallery/07b.jpg', title: 'N 07' },
  { src: 'gallery/08.jpg', title: 'N 08' },
  { src: 'gallery/08b.jpg', title: 'N 08' },
  { src: 'gallery/all_b.jpg', title: 'FORMULA', wide: true },
];
const BIG_W = 700, BIG_H = 875;   // 크게 볼 때 크기 (피그마 Frame 39, 1920 폭 기준)

const items = GALLERY.length ? GALLERY : (window.FOODS || []).map((f, i) => ({ src: f.svg, title: `N ${String(i + 1).padStart(2, '0')}`, ph: true }));
const gal = document.getElementById('gal'), view = document.getElementById('galView');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cells = items.map((it, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'gal-item' + (it.ph ? ' ph' : '') + (it.wide ? ' wide' : '');
  b.setAttribute('aria-label', `${it.title || ''} 크게 보기`);
  b.innerHTML = `<img src="${esc(it.src)}" alt="${esc(it.title || '')}" draggable="false" ${i > 2 ? 'loading="lazy"' : ''}>`;
  b.addEventListener('click', () => open(i));
  gal.appendChild(b);
  return b;
});
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const unit = () => innerWidth / (innerWidth / innerHeight <= 1 ? 700 : 1920);

// 크게 보기
let cur = -1, big = null;
function place(el, r) { el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.width = r.width + 'px'; el.style.height = r.height + 'px'; }
function target() {   // 화면 가운데 700×875 (가로 사진은 같은 높이에 3:2). 화면이 작으면 화면 안에 들어가게 줄임
  const u = unit(); let h = BIG_H * u, w = items[cur] && items[cur].wide ? h * 1.5 : BIG_W * u;
  const k = Math.min(1, (innerHeight * 0.9) / h, (innerWidth * 0.92) / w); w *= k; h *= k;
  return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, width: w, height: h };
}
function open(i) {
  if (cur === i) return close();
  if (big) { big.remove(); cells[cur].classList.remove('hide'); }
  cur = i;
  const cell = cells[i], r = cell.getBoundingClientRect();
  big = document.createElement('img');
  big.className = 'gal-big'; big.src = items[i].src; big.alt = items[i].title || '';
  if (items[i].ph) { big.style.objectFit = 'contain'; big.style.background = '#ecebe7'; }
  place(big, r); document.body.appendChild(big);
  cell.classList.add('hide');
  view.classList.add('on'); view.setAttribute('aria-hidden', 'false');
  big.getBoundingClientRect();   // 제자리 크기에서 시작
  place(big, target());
}
function close() {
  if (cur < 0) return;
  const cell = cells[cur], el = big;
  view.classList.remove('on'); view.setAttribute('aria-hidden', 'true');
  place(el, cell.getBoundingClientRect());
  const done = () => { el.remove(); cell.classList.remove('hide'); };
  if (reduce) done(); else el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 800);   // transitionend가 안 올 때 대비
  cur = -1; big = null;
}
view.addEventListener('click', close);
addEventListener('resize', () => { if (big) { big.style.transition = 'none'; place(big, target()); big.getBoundingClientRect(); big.style.transition = ''; } });
// 크게 본 상태에서 휠 → 닫고 그대로 스크롤
addEventListener('wheel', () => { if (cur >= 0) close(); }, { passive: true });

// 키: ↑↓ 한 장씩 (크게 보는 중이면 앞뒤 사진을 크게), ←→도 크게 볼 때만, Esc 닫기
const nearest = () => { let best = 0, bd = Infinity; cells.forEach((c, i) => { const r = c.getBoundingClientRect(), d = Math.abs(r.top + r.height / 2 - innerHeight / 2); if (d < bd) { bd = d; best = i; } }); return best; };
function go(d) {
  if (cur >= 0) {
    const n = Math.max(0, Math.min(cells.length - 1, cur + d)); if (n === cur) return;
    cells[n].scrollIntoView({ block: 'center' }); open(n); return;
  }
  const n = Math.max(0, Math.min(cells.length - 1, nearest() + d));
  cells[n].scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
  else if (e.key === 'ArrowDown' || (cur >= 0 && e.key === 'ArrowRight')) { e.preventDefault(); go(1); }
  else if (e.key === 'ArrowUp' || (cur >= 0 && e.key === 'ArrowLeft')) { e.preventDefault(); go(-1); }
});

// 전시용: 2분 동안 조작이 없으면 첫 화면으로 (다른 페이지와 같게)
(() => { if (/[?&]check\b/.test(location.search)) return; let t = 0; const wake = () => { clearTimeout(t); t = setTimeout(() => { location.href = './'; }, 2 * 60 * 1000); };
  ['pointermove', 'pointerdown', 'wheel', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true })); wake(); })();
