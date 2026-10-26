// ABOUT 페이지: 화면에 들어오면 장마다 글이 차례로 떠오름 + 2분 동안 조작이 없으면 첫 화면으로
document.querySelectorAll('.about section').forEach((sec) => {
  sec.querySelectorAll('.rv').forEach((el, i) => el.style.setProperty('--i', i));
});
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.2 });
document.querySelectorAll('.rv').forEach((el) => io.observe(el));

// 전시용: 2분 무조작 → 첫 화면
const IDLE_MS = 2 * 60 * 1000;
let idleTimer = 0;
const wake = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { location.href = './'; }, IDLE_MS); };
['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
wake();
