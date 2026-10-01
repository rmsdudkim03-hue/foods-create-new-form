/* =========================================================
   화면 5: 새로운 조형 요리하기
   1) 고른 사진 두 장이 원·삼각형·사각형·육각형 조각으로 분해되어 떠 있음
   2) 조각을 끌어다 놓거나 누르면 그릇으로 툭 떨어져 부딪히고 쌓임 (물리: matter.js)
   3) 다 넣으면 카메라가 위로 올라가듯 그릇이 탑뷰(위에서 내려다본 모습)로 바뀜
   4) 관람객이 커서(휴대폰은 손가락)로 그릇을 저으면 근처 조각이 밀리고 휩쓸리며 섞임
      충분히 저으면(또는 '다 섞었어요'를 누르면) 조각들이 가운데로 빨려 들어가 사라짐
   좌표는 모두 피그마 좌표(데스크톱 1440×1024, 휴대폰 600×1100)로 계산하고 그릴 때만 화면 크기로 바꿈
   조절값은 아래 SETTINGS에서 바꾸면 돼.
   ========================================================= */
import { distanceIn } from './contour.js';

const SETTINGS = {
  pieces: 5,           // 사진 한 장당 조각 수
  photo: { d: 360, p: 230 },   // 분해되기 전 사진 크기 (데스크톱 / 휴대폰)
  spread: 1.55,        // 조각이 사진에서 벌어지는 정도
  shatter: 1.1,        // 사진이 조각으로 벌어지는 시간(초)
  settle: [0.6, 2.5],  // 마지막 조각을 넣고 섞기 시작할 때까지: 최소, 최대(초). 그 사이엔 조각이 멈추면 시작
  tilt: 1.2,           // 옆모습 → 탑뷰로 바뀌는 시간(초)
  stir: {
    reach: 95,         // 커서가 조각을 미는 거리 (피그마 px)
    push: 0.9,         // 커서 움직임이 조각에 전해지는 정도
    friction: 2.2,     // 조각이 멈추는 빠르기 (클수록 금방 멈춤)
    swirl: 0.7,        // 빙글빙글 저으면 그릇 전체가 같이 도는 정도
    enough: 3200,      // 이만큼(피그마 px) 저으면 다 섞인 것으로 봄
    maxTime: 25,       // 아무도 안 저어도 이 시간(초)이 지나면 자동으로 끝
  },
  finish: 1.4,         // 다 섞은 뒤 가운데로 모여 사라지는 시간(초)
  top: { d: { cx: 720, cy: 600, R: 290 }, p: { cx: 300, cy: 650, R: 238 } }, // 탑뷰 그릇 위치·반지름 (데스크톱 / 휴대폰)
  topScale: 1.0,       // 탑뷰에서 조각 크기 (1 = 떠 있을 때 크기)
  inBowl: 0.6,         // 그릇에 들어가면 조각 크기 (1 = 떠 있을 때 크기). 작게 해야 그릇 입구 안에 쏙 들어감
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

/* ---------- 그릇 모양 (그릇 이미지 1018×509 안의 좌표, 이미지 픽셀을 재서 정함) ----------
   그릇 입구는 납작한 타원: 뒤쪽 테두리 y≈201, 앞쪽 테두리(밝은 선) y≈233 (가운데 기준)
   조각은 그릇 이미지 '위에' 그리고, 앞쪽 테두리 선 아래(그릇 앞쪽 벽)만 잘라냄
   → 입구 안쪽 면 위에 조각이 보이고 아랫부분만 앞쪽 벽에 가려져서 '그릇 안에 담긴' 것처럼 보임 */
const BOWL_IMG = { w: 1018, h: 509 };
const LIP = { cx: 510, cy: 217, rx: 330, ry: 16 };   // 앞쪽 테두리 선(타원 아래쪽 반)
const RIM_TOP = 201;                                  // 뒤쪽 테두리 맨 위
const lipY = (x) => LIP.cy + LIP.ry * Math.sqrt(Math.max(0, 1 - ((x - LIP.cx) / LIP.rx) ** 2));
function bowlGeom(portrait) {
  const b = portrait ? { x: -10, y: 600, w: 620 } : { x: 211, y: 546, w: 1018 };
  const k = b.w / BOWL_IMG.w;
  const P = ([x, y]) => [b.x + x * k, b.y + y * k];
  // 바닥: 앞쪽 테두리보다 조금 아래 (조각 아랫부분이 살짝 가려지도록)
  const floor = [];
  for (let x = 196; x <= 824; x += 52) floor.push(P([x, lipY(x) + 9 - (Math.abs(x - LIP.cx) > 280 ? 8 : 0)]));
  // 가리는 부분(앞쪽 벽): 앞쪽 테두리 선 아래 ~ 그릇 바닥
  const front = [];
  for (let x = LIP.cx - LIP.rx; x <= LIP.cx + LIP.rx; x += 10) front.push(P([x, lipY(x)]));
  front.push(P([LIP.cx + LIP.rx, BOWL_IMG.h]), P([LIP.cx - LIP.rx, BOWL_IMG.h]));
  return {
    floor,
    front,
    rimY: b.y + RIM_TOP * k,
    lipY: b.y + (LIP.cy + LIP.ry) * k,
    left: b.x + 222 * k,
    right: b.x + 798 * k,
    cx: b.x + LIP.cx * k,
    k,
  };
}

/* ---------- 탑뷰 그릇 그리기 ----------
   옆모습 그릇(bowl.png)과 같은 그릇을 위에서 본 모습. 그 이미지의 색과 비율을 재서 맞춤:
   - 테두리는 아주 얇음, 안쪽은 깊게 파인 그릇 (바닥 지름 ≈ 입구의 40%)
   - 따뜻한 회색빛 흰색: 안쪽 가운데 rgb(240,238,237), 그늘진 벽 rgb(217,214,211)
   - 빛은 오른쪽에서 → 안쪽 벽은 왼쪽이 어둡고 오른쪽이 밝음
   e: 1이면 위에서 본 동그라미, 작으면 옆에서 본 납작한 타원 (카메라 기울기) */
const BOWL_INNER = 0.975; // 안쪽 면 반지름 / 바깥 반지름 (테두리 두께)
export function drawTopBowl(ctx, cx, cy, R, e, alpha, k) {
  if (alpha <= 0) return;
  const r = R * k;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx * k, cy * k);
  ctx.scale(1, e);
  // 아주 옅은 그림자 (그릇이 바닥에 놓인 느낌)
  ctx.save();
  ctx.shadowColor = 'rgba(60,50,40,0.10)';
  ctx.shadowBlur = 28 * k;
  ctx.shadowOffsetY = 10 * k;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f6f5f4'; ctx.fill();
  ctx.restore();
  // 얇은 테두리: 빛 받는 오른쪽이 밝음
  const rim = ctx.createLinearGradient(-r, 0, r, 0);
  rim.addColorStop(0, '#ebe9e6'); rim.addColorStop(0.5, '#f7f6f5'); rim.addColorStop(1, '#fbfaf9');
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = rim; ctx.fill();
  ctx.lineWidth = 1 * k; ctx.strokeStyle = 'rgba(110,100,90,0.16)'; ctx.stroke();
  // 안쪽 면: 가운데(바닥)는 밝고, 벽으로 갈수록 어두워짐. 밝은 중심을 오른쪽으로 살짝 옮겨서 왼쪽 벽이 더 어둡게
  const ri = r * BOWL_INNER;
  ctx.beginPath(); ctx.arc(0, 0, ri, 0, Math.PI * 2);
  const well = ctx.createRadialGradient(ri * 0.16, -ri * 0.06, ri * 0.05, 0, 0, ri);
  well.addColorStop(0, 'rgb(242,240,239)');
  well.addColorStop(0.4, 'rgb(240,238,237)');
  well.addColorStop(0.75, 'rgb(232,230,228)');
  well.addColorStop(0.93, 'rgb(221,218,215)');
  well.addColorStop(1, 'rgb(214,211,208)');
  ctx.fillStyle = well; ctx.fill();
  // 바닥과 벽이 만나는 부드러운 경계 (아주 옅게)
  ctx.beginPath(); ctx.arc(ri * 0.05, 0, ri * 0.42, 0, Math.PI * 2);
  ctx.lineWidth = 6 * k; ctx.strokeStyle = 'rgba(120,110,100,0.025)'; ctx.stroke();
  // 테두리 안쪽 가장자리의 밝은 선 (옆모습 그릇의 테두리 하이라이트와 같은 느낌)
  ctx.beginPath(); ctx.arc(0, 0, ri, 0, Math.PI * 2);
  ctx.lineWidth = 1.5 * k; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
  ctx.restore();
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

/* =========================================================
   요리 화면 시작
   canvas: 화면 전체 캔버스 (그릇 이미지 뒤)
   opts: { picks: {A, B}, view: () => ({ u, portrait }), bowlEl(옆모습 그릇 이미지), onBump, onCount(넣은 수, 전체), onMix, onDone }
   ========================================================= */
export function startCook(canvas, opts) {
  // 준비(사진 분해·물리 불러오기)가 끝나기 전에 화면을 떠나도 바로 멈출 수 있게, 멈춤 장치를 먼저 돌려줌
  const ctl = { stopped: false, cleanup: null };
  run(canvas, opts, ctl).catch((err) => { console.error('[요리 화면]', err); opts.onDone?.(); });
  return {
    stop() { ctl.stopped = true; ctl.cleanup?.(); },
    dropAll() { ctl.dropAll?.(); }, // '모두 넣기' 버튼
    finishMix() { ctl.finishMix?.(); }, // '다 섞었어요' 버튼
  };
}

async function run(canvas, { picks, view, bowlEl = null, onBump = () => {}, onCount = () => {}, onMix = () => {}, onStir = () => {}, onDone = () => {} }, ctl) {
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
      p.state = 'float'; // float → drag → fly → fall → mix
    }
  }
  // 떠 있는 조각끼리 겹치지 않게 조금씩 밀어냄 (집기 쉽게)
  const W = portrait ? 600 : 1440;
  for (let it = 0; it < 60; it++) {
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i].float, b = pieces[j].float;
        const need = (pieces[i].r + pieces[j].r) * 1.18;
        const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 0.01;
        if (d >= need) continue;
        const push = (need - d) / 2, ux = dx / d, uy = dy / d;
        a[0] -= ux * push; a[1] -= uy * push; b[0] += ux * push; b[1] += uy * push;
      }
    }
    for (const p of pieces) {
      p.float[0] = clamp(p.float[0], p.r + 10, W - p.r - 10);
      p.float[1] = clamp(p.float[1], (portrait ? 250 : 240) + p.r, bowl.rimY - 70 - p.r);
    }
  }
  onCount(0, pieces.length);

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
    const opt = { restitution: 0.1, friction: 0.8, frictionAir: 0.012, density: 0.002, label: 'piece', angle };
    const r = p.r * SETTINGS.inBowl;
    const body = SIDES[p.type] ? Bodies.polygon(x, y, SIDES[p.type], r, opt) : Bodies.circle(x, y, r, opt);
    body.plugin = { landed: false };
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.08);
    Composite.add(engine.world, body);
    p.body = body;
  }

  // 탑뷰 그릇: 옆모습 그릇의 입구 타원에서 시작해 위에서 본 동그라미로 바뀜
  const topEnd = portrait ? SETTINGS.top.p : SETTINGS.top.d;
  const topStart = { cx: bowl.cx, cy: (bowl.rimY + bowl.lipY) / 2, R: 334 * bowl.k, e: 0.048 };

  /* ---------- 놓기: 그릇 위로 옮긴 뒤 떨어뜨림 ---------- */
  let dropped = 0;
  let lastDrop = 0;
  // 물리가 없을 때 쌓이는 자리: 그릇 가운데부터 좌우로 번갈아 놓고, 한 줄이 차면 위에 한 줄 더
  let restN = 0;
  const restSpot = (r) => {
    const n = restN++;
    const row = Math.floor(n / 5), col = n % 5;
    const off = [0, -1, 1, -2, 2][col] * (bowl.right - bowl.left) * 0.16;
    return [bowl.cx + off + (Math.random() - 0.5) * 10, bowl.lipY + 8 * bowl.k - r * 0.8 - row * 26 * bowl.k];
  };
  function drop(p, x, y) {
    if (p.state === 'fly' || p.state === 'fall') return;
    const r = p.r * SETTINGS.inBowl;
    const tx = clamp(x + (Math.random() - 0.5) * 30, bowl.left + r, bowl.right - r);
    const ty = Math.min(y, bowl.rimY - 120 - r);
    p.fly = { from: [p.x, p.y], to: [tx, ty], t: 0, dur: Math.hypot(tx - p.x, ty - p.y) > 20 ? 0.4 : 0.15 };
    p.state = 'fly';
    dropped++;
    lastDrop = performance.now();
    onCount(dropped, pieces.length);
  }
  // 모두 넣기: 남은 조각을 조금씩 시간차를 두고 그릇으로
  ctl.dropAll = () => {
    if (phase !== 'play') return;
    pieces.filter((q) => q.state === 'float').forEach((q, i) => setTimeout(() => {
      if (!ctl.stopped && q.state === 'float') drop(q, bowl.cx + (Math.random() - 0.5) * (bowl.right - bowl.left) * 0.6, q.y);
    }, i * 140));
  };
  function release(p) {
    if (engine) addBody(p, p.x, p.y, p.rot);
    else {
      // 물리 없이: 그릇 안으로 떨어져 차곡차곡 쌓임
      p.rest = restSpot(p.r * SETTINGS.inBowl);
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
    if (phase === 'stir') {
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = toWorld(e.clientX, e.clientY);
      cur = { x, y, seen: performance.now() };
      prevCur = null;
      return;
    }
    if (phase !== 'play') return;
    const [x, y] = toWorld(e.clientX, e.clientY);
    const p = hit(x, y);
    if (!p) return;
    canvas.setPointerCapture(e.pointerId);
    drag = { p, id: e.pointerId, ox: p.x - x, oy: p.y - y, sx: e.clientX, sy: e.clientY, moved: false };
    p.state = 'drag';
    canvas.style.cursor = 'grabbing';
  };
  // 섞기: 커서(손가락) 위치. 마우스는 올려만 놔도, 터치는 누른 채 움직일 때
  let cur = null;
  const onMove = (e) => {
    const [x, y] = toWorld(e.clientX, e.clientY);
    if (phase === 'stir') {
      if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) cur = { x, y, seen: performance.now() };
      return;
    }
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
    if (phase === 'stir' && e.pointerType !== 'mouse') { cur = null; prevCur = null; }
    if (!drag || e.pointerId !== drag.id) return;
    const { p } = drag;
    drag = null;
    canvas.style.cursor = '';
    drop(p, p.x, p.y); // 끌어다 놓아도, 그냥 눌러도 그릇으로
  };
  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (phase === 'stir') return finishMix();
    const p = pieces.find((q) => q.state === 'float');
    if (p && phase === 'play') drop(p, bowl.cx + (Math.random() - 0.5) * 200, p.y);
  };
  const onLeave = (e) => { if (e.pointerType === 'mouse') { cur = null; prevCur = null; } };
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('keydown', onKey);

  /* ---------- 매 프레임 ---------- */
  let phase = 'shatter'; // shatter → play → tilt(탑뷰로) → stir(섞기) → finish(가운데로 모임) → done
  let t0 = performance.now();
  let last = t0;
  let mixT0 = 0;
  let stirT0 = 0, finT0 = 0;
  let stirred = 0;      // 지금까지 저은 거리
  let omega = 0;        // 그릇 전체가 도는 빠르기 (빙글빙글 저으면 생김)
  let prevCur = null;   // 지난 프레임 커서 위치
  let curV = [0, 0];    // 커서 속도 (부드럽게)
  let lastPct = -1;
  function finishMix() {
    if (phase !== 'stir') return;
    phase = 'finish';
    finT0 = performance.now();
    cur = null;
    canvas.style.cursor = '';
    for (const p of pieces) { p.fa = Math.atan2(p.sy, p.sx); p.fr = Math.hypot(p.sx, p.sy); p.frot = p.rot; }
    onStir(1, true);
  }
  ctl.finishMix = finishMix;

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(r.width * dpr), ch = Math.round(r.height * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const k = view().u * dpr; // 피그마 1 → 캔버스 픽셀
    return k;
  }

  function stirStep(dt, top, now) {
    const S = SETTINGS.stir;
    const Rin = top.R * BOWL_INNER;
    // 커서 속도 (튀지 않게 부드럽게)
    let cx = null, cy = null;
    if (cur && now - cur.seen < 1500) {
      cx = cur.x - top.cx; cy = cur.y - top.cy;
      if (prevCur && dt > 0) {
        const vx = (cx - prevCur[0]) / dt, vy = (cy - prevCur[1]) / dt;
        const m = Math.min(1, dt * 20);
        curV = [curV[0] + (vx - curV[0]) * m, curV[1] + (vy - curV[1]) * m];
        const inside = Math.hypot(cx, cy) < Rin + 20;
        if (inside) {
          stirred += Math.min(Math.hypot(cx - prevCur[0], cy - prevCur[1]), 80);
          // 그릇 가운데를 빙글 돌면 그릇 전체가 같이 돔
          const r2 = Math.max(cx * cx + cy * cy, 60 * 60);
          const ang = (cx * curV[1] - cy * curV[0]) / r2;
          omega += (clamp(ang, -6, 6) - omega) * S.swirl * dt;
        }
      }
      prevCur = [cx, cy];
      canvas.style.cursor = Math.hypot(cx, cy) < Rin + 20 ? 'none' : '';
    } else {
      curV = [0, 0];
    }
    omega *= Math.exp(-0.5 * dt);
    const fr = Math.exp(-S.friction * dt);
    for (const p of pieces) {
      const pr = p.r * SETTINGS.topScale * 0.85;
      // 그릇 전체가 도는 흐름
      const tvx = -p.sy * omega, tvy = p.sx * omega;
      const m = Math.min(1, dt * 1.5);
      p.vx += (tvx - p.vx) * m * 0.5;
      p.vy += (tvy - p.vy) * m * 0.5;
      if (cx !== null) {
        const dx = p.sx - cx, dy = p.sy - cy, d = Math.hypot(dx, dy) || 0.01;
        const reach = S.reach + pr;
        if (d < reach) {
          const f = (1 - d / reach) ** 2;
          // 커서가 움직이는 방향으로 휩쓸림 + 커서에서 밀려남
          const mm = Math.min(1, dt * 12) * f * S.push;
          p.vx += (curV[0] - p.vx) * mm;
          p.vy += (curV[1] - p.vy) * mm;
          const sp = Math.hypot(curV[0], curV[1]);
          const push = f * (120 + sp * 0.6) * dt * 6;
          p.vx += (dx / d) * push;
          p.vy += (dy / d) * push;
        }
      }
      p.vx *= fr; p.vy *= fr;
      const v = Math.hypot(p.vx, p.vy);
      if (v > 1400) { p.vx *= 1400 / v; p.vy *= 1400 / v; }
      p.sx += p.vx * dt;
      p.sy += p.vy * dt;
      // 그릇 벽에서 튕김
      const d = Math.hypot(p.sx, p.sy), lim = Rin - p.r * SETTINGS.topScale * 1.02; // 모서리까지 그릇 안에
      if (d > lim) {
        const ux = p.sx / d, uy = p.sy / d;
        p.sx = ux * lim; p.sy = uy * lim;
        const vn = p.vx * ux + p.vy * uy;
        if (vn > 0) { p.vx -= 1.6 * vn * ux; p.vy -= 1.6 * vn * uy; }
      }
      // 움직이는 만큼 빙글 돎
      p.va += ((p.vx * -uyOf(p) + p.vy * uxOf(p)) * 0.006 - p.va) * Math.min(1, dt * 4);
      p.rot = (p.rot || 0) + p.va * dt;
    }
    // 조각끼리 부딪힘 (겹치면 서로 밀어냄)
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const a = pieces[i], b = pieces[j];
        const need = (a.r + b.r) * SETTINGS.topScale * 0.8;
        const dx = b.sx - a.sx, dy = b.sy - a.sy, d = Math.hypot(dx, dy) || 0.01;
        if (d >= need) continue;
        const ux = dx / d, uy = dy / d, push = (need - d) / 2;
        a.sx -= ux * push; a.sy -= uy * push; b.sx += ux * push; b.sy += uy * push;
        const rv = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
        if (rv < 0) {
          const imp = -rv * 0.8;
          a.vx -= ux * imp; a.vy -= uy * imp; b.vx += ux * imp; b.vy += uy * imp;
        }
      }
    }
    const pct = Math.min(99, Math.floor((stirred / S.enough) * 100 / 5) * 5);
    if (pct !== lastPct) { lastPct = pct; onStir(pct / 100); }
  }
  // 조각이 가운데 기준 어느 방향에 있는지 (회전 방향 정하기용)
  const uxOf = (p) => p.sx / (Math.hypot(p.sx, p.sy) || 1);
  const uyOf = (p) => p.sy / (Math.hypot(p.sx, p.sy) || 1);

  function frame(now) {
    if (ctl.stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    const k = fit();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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

    // 3) 탑뷰 전환·섞기 진행도
    const topMode = phase === 'tilt' || phase === 'stir' || phase === 'finish' || phase === 'done';
    const mt = topMode ? (now - mixT0) / 1000 : 0;
    const tilt = easeInOut(mt / SETTINGS.tilt);                 // 0 옆모습 → 1 탑뷰
    const top = {
      cx: topStart.cx + (topEnd.cx - topStart.cx) * tilt,
      cy: topStart.cy + (topEnd.cy - topStart.cy) * tilt,
      R: topStart.R + (topEnd.R - topStart.R) * tilt,
      e: topStart.e + (1 - topStart.e) * tilt,
    };
    // 옆모습 그릇 이미지는 캔버스가 이어서 그림 (같은 이미지라 이질감 없음)
    if (bowlEl && mt > 0) bowlEl.style.opacity = '0';

    // 섞기: 커서로 조각을 밀고 휩쓸기 (조각 위치 sx, sy는 탑뷰 그릇 가운데 기준)
    if (phase === 'stir') stirStep(dt, top, now);

    // 4) 조각 위치 정하기
    for (const p of pieces) {
      p.alpha = 1;
      p.scale = p.state === 'float' || p.state === 'drag' || phase === 'shatter' ? 1 : SETTINGS.inBowl;
      if (phase === 'tilt') {
        // 쌓여 있던 자리 → 탑뷰 그릇 안 흩어진 자리 (카메라가 올라가는 동안)
        const tx = top.cx + p.sx, ty = top.cy + p.sy * top.e;
        p.x = p.mx + (tx - p.mx) * tilt;
        p.y = p.my + (ty - p.my) * tilt;
        p.rot = p.mrot;
        p.scale = SETTINGS.inBowl + (SETTINGS.topScale - SETTINGS.inBowl) * tilt;
      } else if (phase === 'stir') {
        p.x = top.cx + p.sx;
        p.y = top.cy + p.sy;
        p.scale = SETTINGS.topScale;
      } else if (phase === 'finish' || phase === 'done') {
        // 다 섞음: 빙글 돌며 가운데로 빨려 들어가 사라짐
        const f = clamp((now - finT0) / 1000 / SETTINGS.finish, 0, 1);
        const e = easeInOut(f);
        const a = p.fa + e * 2.4;
        const r = p.fr * (1 - e);
        p.x = top.cx + Math.cos(a) * r;
        p.y = top.cy + Math.sin(a) * r;
        p.rot = p.frot + e * 3;
        p.scale = SETTINGS.topScale * (1 - 0.7 * e);
        p.alpha = 1 - ease((f - 0.55) / 0.45);
      } else if (p.state === 'float' || (phase === 'shatter')) {
        const bob = Math.sin(t * 1.4 + p.phase) * 6;
        p.x = p.home[0] + (p.float[0] - p.home[0]) * open;
        p.y = p.home[1] + (p.float[1] - p.home[1]) * open + bob * open;
        p.rot = p.rot0 * open + Math.sin(t * 0.8 + p.phase) * 0.06 * open;
      } else if (p.state === 'fly') {
        p.fly.t += dt;
        const e = p.fly.dur ? easeInOut(p.fly.t / p.fly.dur) : 1;
        p.x = p.fly.from[0] + (p.fly.to[0] - p.fly.from[0]) * e;
        p.y = p.fly.from[1] + (p.fly.to[1] - p.fly.from[1]) * e;
        p.scale = 1 + (SETTINGS.inBowl - 1) * e; // 그릇으로 가면서 작아짐
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
    }

    // 5) 그리기
    if (topMode && bowlEl?.complete && tilt < 1) {
      // 카메라가 올라가는 느낌: 원래 그릇 이미지의 옆면이 점점 납작해지며 사라지고, 입구는 탑뷰 그릇으로 열림
      const sx = top.R / topStart.R;
      const sy = sx * (1 - tilt);
      ctx.save();
      ctx.globalAlpha = 1 - ease(tilt * 1.25);
      ctx.translate(top.cx * k, top.cy * k);
      ctx.scale(sx * bowl.k * k, Math.max(0.001, sy) * bowl.k * k);
      ctx.drawImage(bowlEl, -LIP.cx, -LIP.cy, BOWL_IMG.w, BOWL_IMG.h);
      ctx.restore();
    }
    if (topMode) drawTopBowl(ctx, top.cx, top.cy, top.R, top.e, ease(mt / 0.3), k);
    ctx.save();
    const clip = new Path2D();
    clip.rect(0, 0, canvas.width, canvas.height);
    if (topMode) {
      // 그릇 안쪽 타원의 아래쪽 반 밖(= 앞쪽 벽)은 그리지 않음. 탑뷰가 되면 동그라미 밖
      const ri = top.R * BOWL_INNER;
      for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * Math.PI;
        const x = top.cx + Math.cos(a) * ri, y = top.cy + Math.sin(a) * ri * top.e;
        i ? clip.lineTo(x * k, y * k) : clip.moveTo(x * k, y * k);
      }
      clip.lineTo((top.cx - ri) * k, canvas.height);
      clip.lineTo((top.cx + ri) * k, canvas.height);
      clip.closePath();
    } else {
      // 옆모습: 그릇 앞쪽 벽 부분은 그리지 않음 (전체 화면 - 앞쪽 벽, evenodd)
      bowl.front.forEach(([x, y], i) => (i ? clip.lineTo(x * k, y * k) : clip.moveTo(x * k, y * k)));
      clip.closePath();
    }
    ctx.clip(clip, 'evenodd');
    for (const p of pieces) {
      if (p.alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x * k, p.y * k);
      ctx.rotate(p.rot || 0);
      const s = (p.r * 2 * k * p.scale) / (p.tex.width - 2);
      ctx.drawImage(p.tex, (-p.tex.width / 2) * s, (-p.tex.height / 2) * s, p.tex.width * s, p.tex.height * s);
      ctx.restore();
    }
    ctx.restore();
    // 커서 자리에 옅은 동그라미 (젓는 숟가락 느낌)
    if (phase === 'stir' && cur) {
      ctx.beginPath();
      ctx.arc(cur.x * k, cur.y * k, SETTINGS.stir.reach * 0.45 * k, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(40, 40, 40, .28)';
      ctx.lineWidth = 1.2 * k;
      ctx.stroke();
    }

    // 6) 다 넣었고 조각이 멈췄으면(또는 충분히 기다렸으면) 탑뷰로 바꾸고 섞기 시작
    if (phase === 'play' && dropped === pieces.length && pieces.every((p) => p.state === 'fall')) {
      const since = (now - lastDrop) / 1000;
      const still = pieces.every((p) => !p.body || (p.body.speed < 0.3 && Math.abs(p.body.angularSpeed) < 0.02));
      if (since > SETTINGS.settle[1] || (since > SETTINGS.settle[0] && still)) {
        phase = 'tilt';
        mixT0 = now;
        if (engine) Matter.Composite.clear(engine.world, false); // 물리 멈춤
        pieces.forEach((p, i) => {
          p.mx = p.x; p.my = p.y; p.mrot = p.rot || 0;
          // 탑뷰 그릇 안에 고르게 흩어진 자리 (가운데 기준, 반지름 비율)
          const a = (i / pieces.length) * Math.PI * 2 + Math.random() * 0.6;
          const rr = (0.2 + Math.random() * 0.4) * topEnd.R;
          p.sx = Math.cos(a) * rr; p.sy = Math.sin(a) * rr;
          p.vx = 0; p.vy = 0; p.va = 0;
        });
        onMix();
      }
    }
    if (phase === 'tilt' && mt > SETTINGS.tilt) {
      phase = 'stir';
      stirT0 = now;
      onStir(0);
      if (reduce) finishMix();
    }
    if (phase === 'stir' && (stirred >= SETTINGS.stir.enough || (now - stirT0) / 1000 > SETTINGS.stir.maxTime)) finishMix();
    if (phase === 'finish' && (now - finT0) / 1000 > SETTINGS.finish + 0.1) {
      phase = 'done';
      onDone();
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  ctl.cleanup = () => {
      if (bowlEl) bowlEl.style.opacity = '';
      canvas.style.cursor = '';
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('keydown', onKey);
      if (engine) Matter.Engine.clear(engine);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
