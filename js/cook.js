/* =========================================================
   화면 5: 새로운 조형 요리하기
   1) 고른 사진 두 장이 원·삼각형·사각형·육각형 조각으로 분해되어 떠 있음
   2) 조각을 끌어다 놓거나 누르면 그릇으로 툭 떨어져 부딪히고 쌓임 (물리: matter.js)
   3) 다 넣으면 조각이 하얗게 녹아 하나의 덩어리로 합쳐짐 (metaball)
   좌표는 모두 피그마 좌표(데스크톱 1440×1024, 휴대폰 600×1100)로 계산하고 그릴 때만 화면 크기로 바꿈
   조절값은 아래 SETTINGS에서 바꾸면 돼.
   ========================================================= */
import { distanceIn } from './contour.js';

const SETTINGS = {
  pieces: 5,           // 사진 한 장당 조각 수
  photo: { d: 360, p: 230 },   // 분해되기 전 사진 크기 (데스크톱 / 휴대폰)
  spread: 1.55,        // 조각이 사진에서 벌어지는 정도
  shatter: 1.1,        // 사진이 조각으로 벌어지는 시간(초)
  settle: 1.3,         // 마지막 조각을 넣고 녹기 시작할 때까지 기다리는 시간(초)
  melt: 2.4,           // 녹아서 합쳐지는 시간(초)
  shapes: ['circle', 'triangle', 'square', 'hexagon', 'circle'],
};
const SIDES = { triangle: 3, square: 4, hexagon: 6 };
const MATTER = 'https://cdn.jsdelivr.net/npm/matter-js@0.20.0/build/matter.min.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/* ---------- matter.js 불러오기 (못 불러오면 물리 없이 간단히 쌓음) ---------- */
let matterPromise = null;
function loadMatter() {
  matterPromise ??= new Promise((resolve) => {
    if (window.Matter) return resolve(window.Matter);
    const s = document.createElement('script');
    s.src = MATTER;
    s.onload = () => resolve(window.Matter || null);
    s.onerror = () => resolve(null);
    document.head.append(s);
  });
  return matterPromise;
}
export function preloadCook() { loadMatter(); }

/* ---------- 그릇 모양 (그릇 이미지 1018×509 안의 좌표) ----------
   조각이 앞쪽 벽에 살짝 가려지면서 그릇 안에 담긴 것처럼 보이도록 바닥을 테두리보다 조금 아래에 둠 */
const BOWL_IMG = { w: 1018, h: 509 };
const BOWL_FLOOR = [[178, 214], [215, 236], [300, 256], [420, 266], [509, 268], [598, 266], [718, 256], [803, 236], [840, 214]];
const RIM_Y = 214;
function bowlGeom(portrait) {
  const b = portrait ? { x: -10, y: 600, w: 620 } : { x: 211, y: 546, w: 1018 };
  const k = b.w / BOWL_IMG.w;
  const P = ([x, y]) => [b.x + x * k, b.y + y * k];
  return {
    floor: BOWL_FLOOR.map(P),
    rimY: b.y + RIM_Y * k,
    left: b.x + 186 * k,
    right: b.x + 832 * k,
    cx: b.x + 509 * k,
    k,
  };
}

/* ---------- 사진 → 음식 영역(마스크) ---------- */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}
function foodMask(img, size) {
  const s = size / Math.max(img.naturalWidth, img.naturalHeight);
  const w = Math.max(4, Math.round(img.naturalWidth * s));
  const h = Math.max(4, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let clear = 0;
  for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] < 128) clear++;
  const hasAlpha = clear > w * h * 0.05;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    const l = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    const sat = Math.max(r, gg, b) ? (Math.max(r, gg, b) - Math.min(r, gg, b)) / Math.max(r, gg, b) : 0;
    m[i] = hasAlpha ? (d[i * 4 + 3] > 140 ? 1 : 0) : (l < 0.9 || sat > 0.15 ? 1 : 0);
  }
  return { m, w, h, s };
}

// 도형 꼭짓점 (matter.js와 같은 방식: 반지름 r, 시작 각도 = 한 칸의 절반)
function shapeVerts(type, r) {
  const n = SIDES[type];
  if (!n) return null;
  const th = (2 * Math.PI) / n;
  return Array.from({ length: n }, (_, i) => [Math.cos(th / 2 + i * th) * r, Math.sin(th / 2 + i * th) * r]);
}
function shapePath(g, type, r) {
  g.beginPath();
  const v = shapeVerts(type, r);
  if (!v) g.arc(0, 0, r, 0, Math.PI * 2);
  else v.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

/* ---------- 사진을 도형 조각으로 나누기 ----------
   음식 영역 안에서 '가장자리에서 가장 먼 점'에 가장 큰 도형을 놓고, 그 자리를 지운 뒤 반복 → 서로 안 겹치는 조각 */
async function decompose(pick, center, size, count, startIndex) {
  const img = await loadImage(pick.src);
  const G = 96;
  const { m, w, h, s } = foodMask(img, G);
  const scale = size / Math.max(img.naturalWidth, img.naturalHeight); // 원본 픽셀 → 화면(피그마) 좌표
  const toWorld = (gx, gy) => [
    center[0] + ((gx + 0.5) / s - img.naturalWidth / 2) * scale,
    center[1] + ((gy + 0.5) / s - img.naturalHeight / 2) * scale,
  ];
  const pieces = [];
  const live = Uint8Array.from(m);
  for (let n = 0; n < count; n++) {
    const dist = distanceIn(live, w, h);
    let best = -1, bi = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i] > best) { best = dist[i]; bi = i; }
    if (best < 3) break; // 남은 자리가 너무 작음
    const gx = bi % w, gy = (bi - gx) / w;
    const rGrid = Math.min(best * 1.05, Math.max(w, h) * 0.24);
    const type = SETTINGS.shapes[(n + startIndex) % SETTINGS.shapes.length];
    const r = (rGrid / s) * scale; // 화면 좌표 반지름
    const [x, y] = toWorld(gx, gy);
    // 조각 그림: 도형 모양으로 사진을 오려낸 작은 그림 (화질을 위해 2배로)
    const q = 2;
    const tex = document.createElement('canvas');
    tex.width = tex.height = Math.ceil(r * 2 * q) + 2;
    const tg = tex.getContext('2d');
    tg.translate(tex.width / 2, tex.height / 2);
    tg.scale(q, q);
    shapePath(tg, type, r);
    tg.clip();
    const imgX = (gx + 0.5) / s, imgY = (gy + 0.5) / s; // 원본 사진에서 조각 중심
    tg.drawImage(img, -imgX * scale, -imgY * scale, img.naturalWidth * scale, img.naturalHeight * scale);
    // 아주 옅은 테두리로 도형이 읽히게
    shapePath(tg, type, r);
    tg.strokeStyle = 'rgba(0,0,0,.08)';
    tg.lineWidth = 1 / q;
    tg.stroke();
    pieces.push({ type, r, home: [x, y], tex, rot0: (Math.random() - 0.5) * 0.5 });
    // 이 도형 자리 + 조금 더 넓게 지움
    const cut = rGrid * 1.15;
    for (let yy = Math.max(0, Math.floor(gy - cut)); yy < Math.min(h, gy + cut + 1); yy++) {
      for (let xx = Math.max(0, Math.floor(gx - cut)); xx < Math.min(w, gx + cut + 1); xx++) {
        if ((xx - gx) ** 2 + (yy - gy) ** 2 <= cut * cut) live[yy * w + xx] = 0;
      }
    }
  }
  return { img, scale, pieces };
}

/* ---------- metaball: 여러 원이 녹아 하나로 합쳐진 흰 덩어리 그리기 ----------
   각 원이 주변에 '영향'을 퍼뜨리고, 영향의 합이 기준보다 큰 곳을 덩어리로 칠함.
   영향은 원 반지름의 1.7배까지만 닿아서 덩어리가 지나치게 부풀지 않음 */
const META = { reach: 1.7, level: 0.35, cell: 1.25 }; // cell: 계산 간격 (작을수록 가장자리가 선명, 느려짐)
function drawMetaballs(ctx, blobs, toPx, pxPerUnit, alpha) {
  if (!blobs.length || alpha <= 0) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of blobs) {
    const R = b.r * META.reach;
    x0 = Math.min(x0, b.x - R); y0 = Math.min(y0, b.y - R);
    x1 = Math.max(x1, b.x + R); y1 = Math.max(y1, b.y + R);
  }
  const cell = META.cell;
  const W = Math.ceil((x1 - x0) / cell) + 2, H = Math.ceil((y1 - y0) / cell) + 2;
  if (W * H > 400000) return;
  const f = new Float32Array(W * H);
  for (const b of blobs) {
    const R = b.r * META.reach, R2 = R * R;
    const i0 = Math.max(0, Math.floor((b.x - R - x0) / cell)), i1 = Math.min(W - 1, Math.ceil((b.x + R - x0) / cell));
    const j0 = Math.max(0, Math.floor((b.y - R - y0) / cell)), j1 = Math.min(H - 1, Math.ceil((b.y + R - y0) / cell));
    for (let j = j0; j <= j1; j++) {
      const dy = y0 + j * cell - b.y;
      for (let i = i0; i <= i1; i++) {
        const dx = x0 + i * cell - b.x;
        const q = 1 - (dx * dx + dy * dy) / R2;
        if (q > 0) f[j * W + i] += q * q;
      }
    }
  }
  const c = drawMetaballs.c ||= document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const im = g.createImageData(W, H);
  const T = META.level;
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      const v = f[k];
      if (v < T - 0.03) continue;
      // 표면 기울기 → 왼쪽 위에서 빛이 오는 흰 무광 덩어리. 가장자리는 살짝 어둡게
      const nx = (f[k - 1] - f[k + 1]) * 6, ny = (f[k - W] - f[k + W]) * 6;
      const len = Math.hypot(nx, ny, 1);
      const lambert = Math.max(0, (-0.5 * nx - 0.6 * ny + 0.62) / len);
      const inner = clamp((v - T) * 2.2, 0, 1);
      const shade = 0.74 + 0.2 * lambert + 0.06 * inner;
      const p = k * 4;
      im.data[p] = 250 * shade; im.data[p + 1] = 249 * shade; im.data[p + 2] = 246 * shade;
      im.data[p + 3] = 255 * clamp((v - T) / 0.035 + 0.5, 0, 1); // 가장자리 경계를 좁게 → 선명
    }
  }
  g.putImageData(im, 0, 0);
  const [px, py] = toPx(x0, y0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, px, py, W * cell * pxPerUnit, H * cell * pxPerUnit);
  ctx.restore();
}

/* =========================================================
   요리 화면 시작
   canvas: 화면 전체 캔버스 (그릇 이미지 뒤)
   opts: { picks: {A, B}, view: () => ({ u, portrait }), onBump, onMelt, onDone }
   ========================================================= */
export function startCook(canvas, opts) {
  // 준비(사진 분해·물리 불러오기)가 끝나기 전에 화면을 떠나도 바로 멈출 수 있게, 멈춤 장치를 먼저 돌려줌
  const ctl = { stopped: false, cleanup: null };
  run(canvas, opts, ctl).catch((err) => { console.error('[요리 화면]', err); opts.onDone?.(); });
  return { stop() { ctl.stopped = true; ctl.cleanup?.(); } };
}

async function run(canvas, { picks, view, onBump = () => {}, onMelt = () => {}, onDone = () => {} }, ctl) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  const portrait = view().portrait;
  const bowl = bowlGeom(portrait);
  const size = portrait ? SETTINGS.photo.p : SETTINGS.photo.d;
  const centers = portrait ? { A: [160, 410], B: [440, 410] } : { A: [400, 400], B: [1040, 400] };

  const [Matter, a, b] = await Promise.all([
    loadMatter(),
    decompose(picks.A, centers.A, size, SETTINGS.pieces, 0),
    decompose(picks.B, centers.B, size, SETTINGS.pieces, 2),
  ]);
  if (ctl.stopped) return;
  const photos = [{ ...a, center: centers.A }, { ...b, center: centers.B }];
  const pieces = [...a.pieces, ...b.pieces];
  // 떠 있는 자리: 사진 중심에서 바깥으로 벌어진 곳 (그릇 테두리보다 위)
  for (const [pi, ph] of photos.entries()) {
    for (const p of ph.pieces) {
      const dx = p.home[0] - ph.center[0], dy = p.home[1] - ph.center[1];
      p.float = [
        clamp(ph.center[0] + dx * SETTINGS.spread, p.r + 10, (portrait ? 600 : 1440) - p.r - 10),
        clamp(ph.center[1] + dy * SETTINGS.spread, (portrait ? 250 : 240) + p.r, bowl.rimY - 70 - p.r),
      ];
      p.phase = Math.random() * Math.PI * 2;
      p.side = pi;
      p.state = 'float'; // float → drag → fly → fall → (rest)
    }
  }

  /* ---------- 물리 세계 ---------- */
  let engine = null;
  if (Matter) {
    const { Engine, Bodies, Composite, Events } = Matter;
    engine = Engine.create({ gravity: { y: 1.1 } });
    engine.positionIterations = 8;
    const walls = [];
    for (let i = 0; i < bowl.floor.length - 1; i++) {
      const [x1, y1] = bowl.floor[i], [x2, y2] = bowl.floor[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      walls.push(Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2 + 10, len + 6, 20, {
        isStatic: true, angle: Math.atan2(y2 - y1, x2 - x1), friction: 0.9, label: 'bowl',
      }));
    }
    // 그릇 양옆 보이지 않는 벽 (조각이 밖으로 굴러 나가지 않게)
    const [lx, ly] = bowl.floor[0], [rx, ry] = bowl.floor[bowl.floor.length - 1];
    walls.push(Bodies.rectangle(lx - 8, ly - 300, 16, 600, { isStatic: true, angle: -0.12, label: 'bowl' }));
    walls.push(Bodies.rectangle(rx + 8, ry - 300, 16, 600, { isStatic: true, angle: 0.12, label: 'bowl' }));
    Composite.add(engine.world, walls);
    Events.on(engine, 'collisionStart', (e) => {
      for (const pr of e.pairs) {
        const body = pr.bodyA.label === 'piece' ? pr.bodyA : pr.bodyB.label === 'piece' ? pr.bodyB : null;
        if (body && !body.plugin.landed) {
          body.plugin.landed = true;
          onBump();
        }
      }
    });
  }

  function addBody(p, x, y, angle) {
    if (!engine) return;
    const { Bodies, Composite, Body } = Matter;
    const opt = { restitution: 0.15, friction: 0.7, frictionAir: 0.01, density: 0.002, label: 'piece', angle };
    const body = SIDES[p.type] ? Bodies.polygon(x, y, SIDES[p.type], p.r, opt) : Bodies.circle(x, y, p.r, opt);
    body.plugin = { landed: false };
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
    Composite.add(engine.world, body);
    p.body = body;
  }

  /* ---------- 놓기: 그릇 위로 옮긴 뒤 떨어뜨림 ---------- */
  let dropped = 0;
  let lastDrop = 0;
  // 물리가 없을 때 쌓이는 자리: 그릇 가운데부터 좌우로 번갈아 놓고, 한 줄이 차면 위에 한 줄 더
  let restN = 0;
  const restSpot = (r) => {
    const n = restN++;
    const row = Math.floor(n / 5), col = n % 5;
    const off = [0, -1, 1, -2, 2][col] * (bowl.right - bowl.left) * 0.16;
    return [bowl.cx + off + (Math.random() - 0.5) * 10, bowl.rimY + 30 * bowl.k - r * 0.6 - row * 40 * bowl.k];
  };
  function drop(p, x, y) {
    if (p.state === 'fly' || p.state === 'fall') return;
    const tx = clamp(x + (Math.random() - 0.5) * 30, bowl.left + p.r, bowl.right - p.r);
    const ty = Math.min(y, bowl.rimY - 140 - p.r);
    p.fly = { from: [p.x, p.y], to: [tx, ty], t: 0, dur: Math.hypot(tx - p.x, ty - p.y) > 20 ? 0.35 : 0 };
    p.state = 'fly';
    dropped++;
    lastDrop = performance.now();
  }
  function release(p) {
    if (engine) addBody(p, p.x, p.y, p.rot);
    else {
      // 물리 없이: 그릇 안으로 떨어져 차곡차곡 쌓임
      p.rest = restSpot(p.r);
      setTimeout(onBump, 350);
    }
    p.state = 'fall';
  }

  /* ---------- 끌기 · 누르기 ---------- */
  const toWorld = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    const u = view().u;
    return [(cx - r.left) / u, (cy - r.top) / u];
  };
  let drag = null;
  const hit = (x, y) => {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      if (p.state !== 'float') continue;
      if ((x - p.x) ** 2 + (y - p.y) ** 2 <= (p.r * 1.1) ** 2) return p;
    }
    return null;
  };
  const onDown = (e) => {
    if (phase !== 'play') return;
    const [x, y] = toWorld(e.clientX, e.clientY);
    const p = hit(x, y);
    if (!p) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { p, id: e.pointerId, ox: p.x - x, oy: p.y - y, sx: e.clientX, sy: e.clientY, moved: false };
    p.state = 'drag';
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    const [x, y] = toWorld(e.clientX, e.clientY);
    if (!drag) {
      canvas.style.cursor = phase === 'play' && hit(x, y) ? 'grab' : '';
      return;
    }
    if (e.pointerId !== drag.id) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    drag.p.x = x + drag.ox;
    drag.p.y = y + drag.oy;
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { p } = drag;
    drag = null;
    canvas.style.cursor = '';
    drop(p, p.x, p.y); // 끌어다 놓아도, 그냥 눌러도 그릇으로
  };
  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const p = pieces.find((q) => q.state === 'float');
    if (p) drop(p, bowl.cx + (Math.random() - 0.5) * 200, p.y);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('keydown', onKey);

  /* ---------- 매 프레임 ---------- */
  let phase = 'shatter'; // shatter → play → melt → done
  let t0 = performance.now();
  let last = t0;
  let blobs = [];
  let meltT0 = 0;

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const k = view().u * dpr; // 피그마 1 → 캔버스 픽셀
    return k;
  }

  function frame(now) {
    if (ctl.stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    const k = fit();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const toPx = (x, y) => [x * k, y * k];

    // 1) 분해: 사진이 보였다가 조각이 바깥으로 벌어짐
    let open = 1;
    if (phase === 'shatter') {
      open = reduce ? 1 : easeInOut((t - 0.5) / SETTINGS.shatter);
      const photoA = 1 - ease((t - 0.3) / 0.6);
      if (photoA > 0) {
        for (const ph of photos) {
          ctx.globalAlpha = photoA;
          const w = ph.img.naturalWidth * ph.scale, h = ph.img.naturalHeight * ph.scale;
          ctx.drawImage(ph.img, (ph.center[0] - w / 2) * k, (ph.center[1] - h / 2) * k, w * k, h * k);
        }
        ctx.globalAlpha = 1;
      }
      if (open >= 1) phase = 'play';
    }

    // 2) 물리
    if (engine) Matter.Engine.update(engine, dt * 1000);

    // 3) 조각 위치 정하고 그리기
    const meltK = phase === 'melt' ? ease((now - meltT0) / 1000 / 0.7) : 0;
    for (const p of pieces) {
      if (p.state === 'float' || (phase === 'shatter')) {
        const bob = Math.sin(t * 1.4 + p.phase) * 6;
        p.x = p.home[0] + (p.float[0] - p.home[0]) * open;
        p.y = p.home[1] + (p.float[1] - p.home[1]) * open + bob * open;
        p.rot = p.rot0 * open + Math.sin(t * 0.8 + p.phase) * 0.06 * open;
      } else if (p.state === 'fly') {
        p.fly.t += dt;
        const e = p.fly.dur ? easeInOut(p.fly.t / p.fly.dur) : 1;
        p.x = p.fly.from[0] + (p.fly.to[0] - p.fly.from[0]) * e;
        p.y = p.fly.from[1] + (p.fly.to[1] - p.fly.from[1]) * e;
        if (e >= 1) release(p);
      } else if (p.state === 'fall') {
        if (p.body) {
          p.x = p.body.position.x;
          p.y = p.body.position.y;
          p.rot = p.body.angle;
        } else if (p.rest) {
          p.y += (p.rest[1] - p.y) * Math.min(1, dt * 9);
          p.x += (p.rest[0] - p.x) * Math.min(1, dt * 9);
        }
      }
      if (meltK >= 1) continue;
      ctx.save();
      ctx.globalAlpha = 1 - meltK;
      ctx.translate(p.x * k, p.y * k);
      ctx.rotate(p.rot || 0);
      const s = (p.r * 2 * k) / (p.tex.width - 2);
      ctx.drawImage(p.tex, (-p.tex.width / 2) * s, (-p.tex.height / 2) * s, p.tex.width * s, p.tex.height * s);
      ctx.restore();
    }

    // 4) 다 넣었으면 잠시 뒤 녹기 시작
    if (phase === 'play' && dropped === pieces.length && pieces.every((p) => p.state === 'fall')
      && now - lastDrop > SETTINGS.settle * 1000) {
      phase = 'melt';
      meltT0 = now;
      const cy = bowl.rimY - 34 * bowl.k;
      blobs = pieces.map((p) => ({ sx: p.x, sy: p.y, r0: p.r * 0.92, x: p.x, y: p.y, r: p.r, ph: Math.random() * 6 }));
      blobs.target = [bowl.cx, cy];
      onMelt();
    }

    // 5) 녹아서 합쳐지기: 원들이 가운데로 모이며 커지고, 하얀 덩어리로 이어짐
    if (phase === 'melt' || phase === 'done') {
      const mt = (now - meltT0) / 1000;
      const gather = easeInOut(mt / SETTINGS.melt);
      const [tx, ty] = blobs.target;
      for (const bl of blobs) {
        bl.x = bl.sx + (tx - bl.sx) * gather * 0.8 + Math.sin(mt * 2 + bl.ph) * 2;
        bl.y = bl.sy + (ty - bl.sy) * gather * 0.8 + Math.cos(mt * 1.7 + bl.ph) * 2;
        bl.r = bl.r0 * (1 + 0.2 * gather);
      }
      drawMetaballs(ctx, blobs, toPx, k, ease(mt / 0.6));
      if (phase === 'melt' && mt > SETTINGS.melt + 0.4) {
        phase = 'done';
        onDone();
      }
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  ctl.cleanup = () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('keydown', onKey);
      if (engine) Matter.Engine.clear(engine);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
