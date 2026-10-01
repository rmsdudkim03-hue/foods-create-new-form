/* =========================================================
   맛보기 조형 등장 효과: 점이 모여 형태가 됨
   - 기다리는 동안: 그릇 위에서 점들이 천천히 맴돔
   - 조형 이미지가 도착하면: 점들이 조형 모양 자리로 날아가 모이고 → 이미지가 나타나며 점은 사라짐
   조절값은 아래 SETTINGS에서 바꾸면 돼.
   ========================================================= */
const SETTINGS = {
  count: 280,       // 그릇 하나당 점 개수
  size: 1.3,        // 점 크기 (px)
  gather: 1.3,      // 모이는 시간(초)
  fadeOut: 0.8,     // 이미지가 나타난 뒤 점이 사라지는 시간(초)
  ink: '60, 60, 60',
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 조형 이미지에서 형태가 있는 자리(흰 배경이 아닌 곳)를 골라 점의 도착 위치로 씀 (0~1 비율 좌표)
function sampleShape(src, n) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const S = 90;
      const k = Math.min(S / im.naturalWidth, S / im.naturalHeight);
      const w = Math.max(1, Math.round(im.naturalWidth * k));
      const h = Math.max(1, Math.round(im.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      const pts = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const l = (d[i] + d[i + 1] + d[i + 2]) / 765;
          if (d[i + 3] > 128 && l < 0.955) pts.push([x, y, 1 - l]);
        }
      }
      if (!pts.length) return resolve(null);
      // 그늘진 곳일수록 점이 더 많이 모이게 (형태의 볼륨이 보이도록)
      const out = [];
      for (let j = 0; j < n; j++) {
        let p = pts[(Math.random() * pts.length) | 0];
        for (let tries = 0; tries < 3 && Math.random() > p[2] * 4; tries++) p = pts[(Math.random() * pts.length) | 0];
        out.push([(p[0] + Math.random()) / w, (p[1] + Math.random()) / h, w / Math.max(w, h), h / Math.max(w, h)]);
      }
      resolve(out);
    };
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export function formParticles(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cells = [];
  let raf = 0;
  let stopped = false;
  let last = performance.now();

  // i번째 그릇 등록: el = 조형 이미지가 들어갈 자리
  function add(i, el) {
    const ps = Array.from({ length: SETTINGS.count }, () => ({
      a: Math.random() * Math.PI * 2,           // 맴도는 각도
      r: 0.25 + Math.random() * 0.75,           // 맴도는 반지름 (비율)
      sp: (0.25 + Math.random() * 0.5) * (Math.random() < 0.5 ? -1 : 1), // 속도·방향
      z: Math.random() * Math.PI * 2,           // 위아래 흔들림
      x: 0, y: 0, tx: 0, ty: 0,
    }));
    cells[i] = { el, ps, phase: 'wait', t: 0, alpha: 0, done: null };
  }

  // i번째 조형 이미지가 도착: 점이 형태로 모인 뒤 resolve
  async function reveal(i, src) {
    const c = cells[i];
    if (!c || reduce || stopped) return;
    if (c.phase !== 'wait') return c.promise;
    c.phase = 'loading';
    c.promise = (async () => {
      const pts = await sampleShape(src, c.ps.length);
      if (!pts || stopped) { c.phase = 'gone'; return; }
      c.ps.forEach((p, j) => { p.fx = p.x; p.fy = p.y; p.target = pts[j]; });
      c.phase = 'gather';
      c.t = 0;
      await new Promise((r) => (c.done = r));
    })();
    return c.promise;
  }

  function rectOf(el) {
    const cr = canvas.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dpr = canvas.width / Math.max(1, cr.width);
    return { x: (r.left - cr.left) * dpr, y: (r.top - cr.top) * dpr, w: r.width * dpr, h: r.height * dpr, dpr };
  }

  function frame(now) {
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const cr = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(cr.width * dpr), ch = Math.round(cr.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    ctx.clearRect(0, 0, cw, ch);

    for (const c of cells) {
      if (!c || c.phase === 'gone') continue;
      const R = rectOf(c.el);
      const cx = R.x + R.w / 2, cy = R.y + R.h * 0.55;
      c.t += dt;
      let alpha = 1;
      if (c.phase === 'wait' || c.phase === 'loading') {
        c.alpha = Math.min(1, c.alpha + dt * 1.5); // 처음에 서서히 나타남
        alpha = c.alpha;
      }
      let k = 0;
      if (c.phase === 'gather') {
        k = easeInOut(clamp(c.t / SETTINGS.gather, 0, 1));
        if (c.t >= SETTINGS.gather) { c.phase = 'settle'; c.t = 0; c.done?.(); }
      }
      if (c.phase === 'settle') {
        k = 1;
        alpha = 1 - clamp(c.t / SETTINGS.fadeOut, 0, 1);
        if (alpha <= 0) { c.phase = 'gone'; continue; }
      }
      ctx.fillStyle = `rgba(${SETTINGS.ink}, ${0.55 * alpha})`;
      ctx.beginPath();
      const size = SETTINGS.size * R.dpr;
      for (const p of c.ps) {
        // 맴도는 위치 (그릇 위 납작한 타원 + 위아래 흔들림)
        p.a += p.sp * dt * (c.phase === 'wait' || c.phase === 'loading' ? 1 : 2.2);
        p.z += dt * 1.3;
        const ox = cx + Math.cos(p.a) * p.r * R.w * 0.42;
        const oy = cy + Math.sin(p.a) * p.r * R.h * 0.18 + Math.sin(p.z) * R.h * 0.05 - R.h * 0.08;
        if (k > 0 && p.target) {
          // 이미지가 칸 안에서 가운데 맞춤(contain)으로 놓이는 자리
          const [u, v, iw, ih] = p.target;
          const s = Math.min(R.w / iw, R.h / ih);
          const tx = R.x + (R.w - iw * s) / 2 + u * iw * s;
          const ty = R.y + (R.h - ih * s) / 2 + v * ih * s;
          p.x = ox + (tx - ox) * k;
          p.y = oy + (ty - oy) * k;
        } else {
          p.x = ox;
          p.y = oy;
        }
        ctx.moveTo(p.x + size, p.y);
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }
  if (!reduce) raf = requestAnimationFrame(frame);

  // i번째가 실패하면 점을 흩어 사라지게
  function cancel(i) {
    const c = cells[i];
    if (c && (c.phase === 'wait' || c.phase === 'loading')) { c.phase = 'settle'; c.t = 0; }
  }

  return {
    add,
    reveal,
    cancel,
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      cells.forEach((c) => c?.done?.());
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
