/* =========================================================
   화면 흐름과 인터랙션
   메인 → 음식 입력 → 이미지 선택(A, B) → 분석 → 요리하기 → 맛보기 선택 → 3D 결과 → 갤러리
   ========================================================= */
import { FOODS, FRAGMENTS, FORMS, GALLERY_SEED, IDLE_RESET_MS } from './data.js';
import * as ai from './ai.js';
import { materialize } from './material.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const stage = $('#stage');
const isTouch = () => matchMedia('(hover: none)').matches;
const mod = (a, n) => ((a % n) + n) % n;

/* ---------- 화면 크기: 피그마 1px = 화면 몇 px인지 계산 ---------- */
const view = { u: 1, portrait: false };

function toStage(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  return { x: (clientX - r.left) / view.u, y: (clientY - r.top) / view.u };
}

/* ---------- 상태 ---------- */
const state = {
  foods: { A: null, B: null },   // 입력한 음식 이름
  picks: { A: null, B: null },   // 고른 이미지
  side: 'A',                     // 지금 고르는 쪽
  form: null,                    // 고른 맛보기 조형
  saved: false,                  // 이번 체험 결과를 갤러리에 넣었는지
  jobs: { A: null, B: null },    // AI가 음식 이미지를 만드는 작업
  analysis: null,                // AI 분석 결과
  formsJob: null,                // AI가 맛보기 조형을 만드는 작업
  run: 0,                        // 체험 회차 (이전 회차의 늦은 응답 무시용)
};
function cancelJobs() {
  state.jobs.A?.cancel();
  state.jobs.B?.cancel();
  state.formsJob?.cancel();
  state.jobs = { A: null, B: null };
  state.formsJob = null;
}
const timers = {};

/* ---------- 알림 ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2600);
}

/* =========================================================
   화면 전환
   ========================================================= */
let current = null;
const enter = {};
const leave = {};

function go(name) {
  if (current === name) return;
  if (current && leave[current]) leave[current]();
  $$('.screen').forEach((s) => s.classList.toggle('is-active', s.dataset.screen === name));
  current = name;
  $('#nav').classList.toggle('is-hidden', !(name === 'home' || name === 'gallery'));
  $$('#nav [data-nav]').forEach((b) => {
    if (b.dataset.nav === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (enter[name]) enter[name]();
  resetIdle();
}

function startFlow() {
  state.foods = { A: null, B: null };
  state.picks = { A: null, B: null };
  state.side = 'A';
  state.form = null;
  state.saved = false;
  state.analysis = null;
  state.run++;
  cancelJobs();
  picker.reset();
  go('select');
}

/* ---------- 메인 · 메뉴 · 로고 ---------- */
$('#logo').addEventListener('click', () => go('home'));
$('#plateStart').addEventListener('click', startFlow);
$$('#nav [data-nav]').forEach((b) =>
  b.addEventListener('click', () => {
    const to = b.dataset.nav;
    if (to === 'gallery') go('gallery');
    else if (to === 'create') startFlow();
    else toast('준비 중인 페이지예요');
  })
);

/* =========================================================
   화면 2: 음식 입력
   A, B에 음식 이름 입력 → AI가 음식인지 확인 → 통과하면 바로 이미지 만들기 시작
   ========================================================= */
function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

const picker = (() => {
  const inputs = { A: $('#foodA'), B: $('#foodB') };
  const pills = { A: $('#pillA'), B: $('#pillB') };
  const nextBtn = $('#selectNext');
  const okWord = { A: null, B: null };   // 확인을 통과한 입력값
  const name = { A: null, B: null };     // AI가 정리한 음식 이름
  const pending = { A: null, B: null };  // 진행 중인 확인
  let submitting = false;

  function sync() {
    for (const side of ['A', 'B']) pills[side].classList.toggle('is-filled', inputs[side].value.trim() !== '');
    nextBtn.disabled = submitting || !(inputs.A.value.trim() && inputs.B.value.trim());
  }

  function invalidate(side) {
    okWord[side] = null;
    name[side] = null;
    state.jobs[side]?.cancel();
    state.jobs[side] = null;
  }

  // 입력한 단어를 확인. 통과하면 true
  async function commit(side) {
    const word = inputs[side].value.trim();
    if (!word) return false;
    if (okWord[side] === word) return true;
    if (pending[side]?.word === word) return pending[side].promise;
    const run = state.run;
    const promise = (async () => {
      pills[side].classList.add('is-checking');
      let res;
      try { res = await ai.checkFood(word); } catch (err) {
        console.error(err);
        res = { ok: false, message: '확인하지 못했어요. 다시 시도해 주세요' };
      }
      if (pending[side]?.promise !== promise) return false; // 그사이 다른 단어로 바뀜
      pending[side] = null;
      pills[side].classList.remove('is-checking');
      if (run !== state.run || inputs[side].value.trim() !== word) return false;
      if (!res.ok) {
        invalidate(side);
        shake(pills[side]);
        toast(res.message);
        return false;
      }
      okWord[side] = word;
      name[side] = res.name;
      state.jobs[side]?.cancel();
      state.jobs[side] = ai.foodImages(res.name); // 바로 이미지 만들기 시작
      return true;
    })();
    pending[side] = { word, promise };
    return promise;
  }

  async function submit() {
    if (submitting) return;
    if (!inputs.A.value.trim()) return inputs.A.focus();
    if (!inputs.B.value.trim()) return inputs.B.focus();
    submitting = true;
    sync();
    const [a, b] = await Promise.all([commit('A'), commit('B')]);
    submitting = false;
    sync();
    if (current !== 'select') return;
    if (!a) return inputs.A.focus();
    if (!b) return inputs.B.focus();
    document.activeElement?.blur();
    state.foods = { A: name.A, B: name.B };
    state.picks = { A: null, B: null };
    state.side = 'A';
    go('pick');
  }

  for (const side of ['A', 'B']) {
    const inp = inputs[side];
    inp.addEventListener('input', () => {
      if (okWord[side] !== inp.value.trim()) invalidate(side);
      sync();
    });
    inp.addEventListener('blur', () => { if (current === 'select' && !submitting) commit(side); });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return; // 한글 조합 중 Enter는 무시
      e.preventDefault();
      if (side === 'A' && !inputs.B.value.trim()) { commit('A'); inputs.B.focus(); }
      else submit();
    });
  }
  $('#foodForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  nextBtn.addEventListener('click', submit);

  function reset() {
    for (const side of ['A', 'B']) {
      inputs[side].value = '';
      pending[side] = null;
      okWord[side] = null;
      name[side] = null;
      pills[side].classList.remove('is-checking');
    }
    submitting = false;
    sync();
  }
  sync();
  return { reset, sync };
})();
enter.select = () => {
  picker.sync();
  if (!isTouch()) setTimeout(() => current === 'select' && $('#foodA').focus(), 450);
};

/* =========================================================
   화면 3: 이미지 캐러셀
   ========================================================= */
const carousel = (() => {
  const track = $('#carTrack');
  const R = 4; // 가운데 기준 좌우로 몇 개까지 그릴지
  let items = [];
  let v = 0; // 가운데 있는 이미지의 번호 (계속 늘어나고 줄어듦)
  let dragDx = 0;
  let suppressClick = false;
  let onChange = () => {};
  const els = new Map();

  const cfg = () =>
    view.portrait
      ? { cx: 300, cy: 540, box: 300, gap: 290, side: 0.72 }
      : { cx: 720, cy: 515, box: 350, gap: 390, side: 0.74 };

  function place(el, k) {
    const c = cfg();
    const u = view.u;
    const o = k - v;
    const x = c.cx + o * c.gap - c.box / 2;
    const y = c.cy - c.box / 2;
    const s = o === 0 ? 1 : c.side;
    el.style.width = el.style.height = `${c.box * u}px`;
    el.style.transform = `translate(${x * u + dragDx}px, ${y * u}px) scale(${s})`;
    el.style.opacity = Math.abs(o) >= R ? 0 : 1;
    el.style.zIndex = 10 - Math.abs(o);
    el.tabIndex = Math.abs(o) === 1 ? 0 : -1;
    el.setAttribute('aria-hidden', Math.abs(o) > 1 ? 'true' : 'false');
  }

  function set(list, start, changeFn) {
    items = list;
    onChange = changeFn || (() => {});
    v = start;
    dragDx = 0;
    els.forEach((el) => el.remove());
    els.clear();
    build();
  }

  function build() {
    for (let k = v - R; k <= v + R; k++) ensure(k);
    update();
  }

  function ensure(k) {
    if (els.has(k)) return;
    const idx = mod(k, items.length);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'car-item';
    el.dataset.idx = idx;
    el.innerHTML = '<img class="car-ph" src="assets/img/plate-top.png" alt="" draggable="false"><img class="car-img" alt="" draggable="false">';
    fillEl(el, items[idx]);
    el.addEventListener('click', () => {
      if (suppressClick) return;
      if (k !== v) goTo(k);
    });
    el.style.transition = 'none';
    track.append(el);
    els.set(k, el);
    place(el, k);
    void el.offsetWidth;
    el.style.transition = '';
  }

  function fillEl(el, it) {
    const img = $('.car-img', el);
    if (!it) { el.setAttribute('aria-label', '이미지 준비 중'); return; }
    el.setAttribute('aria-label', it.alt || '음식 이미지');
    if (img.getAttribute('src') === it.src) return;
    img.onload = () => el.classList.add('is-ready');
    img.src = it.src;
  }
  // AI가 i번째 이미지를 보내오면 해당 자리를 채움
  function fill(i) {
    for (const el of els.values()) if (+el.dataset.idx === i) fillEl(el, items[i]);
    onChange();
  }

  function update() {
    if (!items.length) return;
    for (let k = v - R; k <= v + R; k++) ensure(k);
    for (const [k, el] of els) {
      if (k < v - R || k > v + R) { el.remove(); els.delete(k); }
      else place(el, k);
    }
  }

  function goTo(k) { v = k; update(); onChange(); }
  const next = () => goTo(v + 1);
  const prev = () => goTo(v - 1);
  const selected = () => items[mod(v, items.length)];

  // 드래그(스와이프)로 넘기기
  let startX = 0;
  let dragging = false;
  let down = false;
  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = true;
    dragging = false;
    startX = e.clientX;
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > 6) {
      dragging = true;
      track.classList.add('is-dragging');
    }
    if (dragging) { dragDx = dx; update(); }
  });
  const endDrag = () => {
    if (!down) return;
    down = false;
    if (!dragging) return;
    const gapPx = cfg().gap * view.u;
    let steps = Math.round(-dragDx / gapPx);
    if (steps === 0 && Math.abs(dragDx) > 40) steps = dragDx < 0 ? 1 : -1;
    dragDx = 0;
    dragging = false;
    track.classList.remove('is-dragging');
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 50);
    goTo(v + steps);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // 트랙패드·마우스 휠로 넘기기
  let wheelAcc = 0;
  let wheelLock = false;
  track.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAcc += d;
    if (wheelLock || Math.abs(wheelAcc) < 40) return;
    wheelAcc > 0 ? next() : prev();
    wheelAcc = 0;
    wheelLock = true;
    setTimeout(() => (wheelLock = false), 450);
  }, { passive: true });

  return { set, fill, next, prev, selected, render: update, track };
})();

const pickSub = $('#pickSub');
const pickBtn = $('#pickBtn');
let unsubPick = null;
function loadSide(side) {
  const food = state.foods[side];
  if (!state.jobs[side]) state.jobs[side] = ai.foodImages(food);
  const job = state.jobs[side];
  const sync = () => {
    pickBtn.disabled = !carousel.selected();
    const total = job.items.length - job.failed;
    pickSub.textContent = job.ready < total
      ? `AI가 ${food} 이미지를 만들고 있어요 (${job.ready}/${total})`
      : `좌우로 넘기며 원하는 ${food} 이미지를 선택하세요`;
  };
  const onDone = () => {
    if (!job.finished || !job.failed) return;
    if (!job.ready) {
      toast('이미지를 만들지 못했어요. 다시 시도해 주세요');
      state.jobs[side] = null;
      timers.pickFail = setTimeout(() => go('select'), 1500);
      return;
    }
    // 실패한 자리는 빼고 다시 배치
    carousel.set(job.items.filter(Boolean), 0, sync);
  };
  unsubPick?.();
  carousel.set(job.items, FOODS[food]?.start ?? 0, sync);
  unsubPick = job.on((i) => { carousel.fill(i); onDone(); });
  sync();
  onDone();
}
enter.pick = () => loadSide(state.side);

pickBtn.addEventListener('click', () => {
  if (!carousel.selected()) return;
  state.picks[state.side] = carousel.selected();
  if (state.side === 'A') {
    state.side = 'B';
    const track = carousel.track;
    track.classList.add('is-swapping');
    timers.swap = setTimeout(() => {
      loadSide('B');
      requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove('is-swapping')));
    }, 380);
  } else {
    go('analyze');
  }
});
leave.pick = () => {
  clearTimeout(timers.pickFail);
  unsubPick?.();
  unsubPick = null;
  clearTimeout(timers.swap);
  carousel.track.classList.remove('is-swapping');
};

/* =========================================================
   화면 4: 분석 중
   2단계에서 여기에 실제 AI 분석 요청이 들어갈 자리
   ========================================================= */
let materialFx = [];
enter.analyze = async () => {
  const a = $('#analyzeA');
  const b = $('#analyzeB');
  a.src = state.picks.A.src; a.alt = state.picks.A.alt;
  b.src = state.picks.B.src; b.alt = state.picks.B.alt;
  // 사진 → 흰 재료 효과 (실패하면 사진이 그대로 보임)
  materialFx.forEach((f) => f.stop());
  materialFx = [];
  try {
    materialFx = [
      materialize($('#materialA'), state.picks.A.src, { delay: 250 }),
      materialize($('#materialB'), state.picks.B.src, { delay: 700 }),
    ];
    $$('.scan').forEach((el) => el.classList.add('has-fx'));
  } catch (err) {
    console.error(err);
    $$('.scan').forEach((el) => el.classList.remove('has-fx'));
  }
  const run = state.run;
  try {
    // 재료 효과가 끝까지 보이도록 분석 화면은 최소 3.5초 유지
    [state.analysis] = await Promise.all([ai.analyze(state.picks, state.foods), new Promise((r) => setTimeout(r, 3500))]);
  } catch (err) {
    console.error(err);
    if (run === state.run && current === 'analyze') {
      toast('분석에 실패했어요. 다시 시도해 주세요');
      state.picks = { A: null, B: null };
      state.side = 'A';
      timers.analyzeFail = setTimeout(() => go('pick'), 1500);
    }
    return;
  }
  if (run !== state.run || current !== 'analyze') return;
  state.formsJob?.cancel();
  state.formsJob = ai.tasteForms(state.analysis, state.picks, state.foods); // 요리하는 동안 맛보기 조형을 미리 만듦
  go('cook');
};
leave.analyze = () => {
  // 화면 전환 애니메이션이 끝난 뒤 효과 정지
  const fx = materialFx;
  materialFx = [];
  setTimeout(() => fx.forEach((f) => f.stop()), 700);
};

/* =========================================================
   화면 5: 새로운 조형 요리하기 (조각을 그릇에 드래그)
   ========================================================= */
const cookBowl = $('#cookBowl');
const cook = { dropped: 0, total: 0 };

// 그릇 안으로 인정되는 영역 (피그마 좌표)
const bowlZone = () =>
  view.portrait
    ? { x1: 80, x2: 520, y1: 620, y2: 860, tx: 300, ty: 752 }
    : { x1: 370, x2: 1070, y1: 640, y2: 940, tx: 720, ty: 800 };

function buildFragments() {
  const layer = $('#fragLayer');
  layer.innerHTML = '';
  cook.dropped = 0;
  cook.total = 0;
  cookBowl.classList.remove('cooking', 'bump');
  ['A', 'B'].forEach((side) => {
    const pic = state.picks[side];
    FRAGMENTS[side].forEach((f, i) => {
      const [l, t, r, b] = f.crop;
      const cw = r - l;
      const ch = b - t;
      const ratio = (ch * pic.h) / (cw * pic.w); // 높이 / 너비
      const [dx, dy, dw] = f.d;
      const [px, py, pw] = f.p;
      const dh = dw * ratio;
      const ph = pw * ratio;
      const el = document.createElement('div');
      el.className = 'frag abs box';
      el.style.cssText = `--x:${dx - dw / 2};--y:${dy - dh / 2};--w:${dw};--h:${dh};--px:${px - pw / 2};--py:${py - ph / 2};--pw:${pw};--ph:${ph}`;
      el.innerHTML = `<div class="frag-float" style="--d:${-(i * 1.3 + (side === 'B' ? 0.7 : 0))}s"><div class="frag-crop"><img src="${pic.src}" alt="" draggable="false" style="width:${100 / cw}%;height:${100 / ch}%;left:${(-l / cw) * 100}%;top:${(-t / ch) * 100}%"></div></div>`;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.setAttribute('aria-label', `${state.foods[side]} 조각을 그릇에 넣기`);
      attachDrag(el);
      layer.append(el);
      cook.total++;
    });
  });
}

function attachDrag(el) {
  let sx = 0;
  let sy = 0;
  let id = null;
  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    if (el.classList.contains('is-dropping')) return;
    id = e.pointerId;
    el.setPointerCapture(id);
    sx = e.clientX;
    sy = e.clientY;
    dragging = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!dragging && Math.hypot(dx, dy) > 5) {
      dragging = true;
      el.classList.add('is-dragging');
    }
    if (dragging) el.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    id = null;
    el.classList.remove('is-dragging');
    if (!dragging) return dropFragment(el); // 그냥 누르면 알아서 그릇으로 날아감
    const r = el.getBoundingClientRect();
    const p = toStage(r.left + r.width / 2, r.top + r.height / 2);
    const z = bowlZone();
    if (p.x > z.x1 && p.x < z.x2 && p.y > z.y1 && p.y < z.y2) dropFragment(el);
    else el.style.transform = ''; // 그릇 밖이면 제자리로
  });
  el.addEventListener('pointercancel', () => {
    id = null;
    el.classList.remove('is-dragging');
    el.style.transform = '';
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropFragment(el); }
  });
}

function dropFragment(el) {
  if (el.classList.contains('is-dropping')) return;
  const z = bowlZone();
  const u = view.u;
  const sr = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform || '');
  const curX = m ? +m[1] : 0;
  const curY = m ? +m[2] : 0;
  const targetX = sr.left + (z.tx + (Math.random() - 0.5) * 160) * u;
  const targetY = sr.top + z.ty * u;
  const tx = curX + targetX - (r.left + r.width / 2);
  const ty = curY + targetY - (r.top + r.height / 2);
  el.classList.add('is-dropping');
  el.style.transform = `translate(${tx}px, ${ty}px) scale(.3)`;
  setTimeout(() => {
    cookBowl.classList.remove('bump');
    void cookBowl.offsetWidth;
    cookBowl.classList.add('bump');
    cook.dropped++;
    if (cook.dropped === cook.total) {
      timers.cook1 = setTimeout(() => {
        cookBowl.classList.remove('bump');
        cookBowl.classList.add('cooking');
      }, 250);
      timers.cook2 = setTimeout(() => go('taste'), 2200);
    }
  }, 480);
}
enter.cook = buildFragments;
leave.cook = () => {
  clearTimeout(timers.cook1);
  clearTimeout(timers.cook2);
};

/* =========================================================
   화면 6: 맛보기 조형 선택
   ========================================================= */
let unsubTaste = null;
function buildTaste() {
  const layer = $('#tasteLayer');
  layer.innerHTML = '';
  layer.classList.remove('has-choice');
  if (!state.formsJob) state.formsJob = ai.tasteForms(state.analysis, state.picks, state.foods);
  const job = state.formsJob;
  const k = 280 / 463; // 휴대폰에서 그릇 크기 비율
  FORMS.forEach((f, i) => {
    const [fx, fy, fw, fh] = f.form;
    const [bx, by] = f.bowl;
    // 휴대폰: 2열 × 3행
    const pbx = i % 2 === 0 ? 10 : 310;
    const pby = 380 + Math.floor(i / 2) * 255;
    const pfw = fw * k;
    const pfh = fh * k;
    const pfx = pbx + 140 + (fx + fw / 2 - (bx + 231.5)) * k - pfw / 2;
    const pfy = pby + (fy - by) * k;
    const top = Math.min(fy, by);
    const ptop = Math.min(pfy, pby);
    const cell = document.createElement('div');
    cell.className = 'taste-cell';
    cell.innerHTML = `
      <img class="bowl abs box" src="assets/img/bowl.png" alt="" style="--x:${bx};--y:${by};--w:463;--h:232;--px:${pbx};--py:${pby};--pw:280;--ph:140">
      <img class="taste-form abs box" alt="" style="--x:${fx};--y:${fy};--w:${fw};--h:${fh};--px:${pfx};--py:${pfy};--pw:${pfw};--ph:${pfh}">
      <button class="taste-hit abs box" type="button" aria-label="맛보기 조형 ${f.id} 선택" style="--x:${bx + 60};--y:${top};--w:343;--h:${by + 170 - top};--px:${pbx + 36};--py:${ptop};--pw:208;--ph:${pby + 103 - ptop}"></button>`;
    const hit = cell.querySelector('.taste-hit');
    const formImg = cell.querySelector('.taste-form');
    const show = (src) => {
      formImg.onload = () => cell.classList.add('is-ready');
      formImg.src = src;
      hit.disabled = false;
    };
    hit.disabled = true;
    if (job.items[i]) show(job.items[i]);
    hit.addEventListener('click', () => chooseForm({ ...f, img: job.items[i], plan: job.meta?.forms?.[i] || null }, cell));
    layer.append(cell);
  });
  unsubTaste?.();
  const checkFailed = () => {
    if (job.finished && !job.ready) {
      toast('조형을 만들지 못했어요. 처음부터 다시 해주세요');
      timers.tasteFail = setTimeout(() => go('home'), 2000);
    }
  };
  checkFailed();
  unsubTaste = job.on((i, src) => {
    const cell = layer.children[i];
    if (!src) { checkFailed(); return; }
    if (!cell) return;
    const formImg = cell.querySelector('.taste-form');
    formImg.onload = () => cell.classList.add('is-ready');
    formImg.src = src;
    cell.querySelector('.taste-hit').disabled = false;
  });
}
function chooseForm(f, cell) {
  const layer = $('#tasteLayer');
  if (layer.classList.contains('has-choice')) return;
  state.form = f;
  cell.classList.add('is-chosen');
  layer.classList.add('has-choice');
  timers.taste = setTimeout(() => go('result'), 900);
}
enter.taste = buildTaste;
leave.taste = () => {
  clearTimeout(timers.taste);
  clearTimeout(timers.tasteFail);
  unsubTaste?.();
  unsubTaste = null;
};

/* =========================================================
   화면 7: 3D 결과
   ========================================================= */
let viewerMod = null;
let viewer = null;
enter.result = async () => {
  const f = state.form || FORMS[0];
  saveCreation(f);
  const img = $('#resultImg');
  const sub = $('#resultSub');
  const note = $('#resultNote');
  const run = state.run;
  // 3D가 만들어지는 동안(실제로는 1~2분) 고른 조형 이미지를 띄워둠
  viewer?.stop();
  viewer?.setVisible(false);
  note.hidden = true;
  img.src = f.img;
  img.hidden = false;
  sub.textContent = '선택한 조형을 3D로 바꾸는 중이에요';
  sub.classList.add('is-waiting');
  try {
    const urls = await ai.toModel(f.img, f, (p) => {
      if (run === state.run && current === 'result') sub.textContent = `선택한 조형을 3D로 바꾸는 중이에요 (${p}%)`;
    });
    viewerMod ??= await import('./viewer3d.js');
    viewer ??= viewerMod.createViewer($('#viewer'));
    let loaded = false;
    for (const url of urls) {
      try { await viewer.load(url); loaded = true; break; } catch (err) { console.warn('3D 불러오기 실패', url, err); }
    }
    if (!loaded) throw new Error('3D 파일을 불러오지 못함');
    if (run !== state.run || current !== 'result') return;
    img.hidden = true;
    viewer.setVisible(true);
    viewer.start();
    sub.textContent = isTouch() ? '손가락으로 드래그해서 3D 조형을 돌려보세요' : '마우스 왼쪽을 누르며 3D 조형을 돌려보세요';
    note.hidden = false; // 보이지 않는 면은 AI가 추정했다는 안내
  } catch (err) {
    console.error(err);
    if (run !== state.run || current !== 'result') return;
    sub.textContent = '3D로 바꾸지 못해서 이미지로 보여줄게요';
  } finally {
    sub.classList.remove('is-waiting');
  }
};
leave.result = () => viewer?.stop();
$('#resultNext').addEventListener('click', () => {
  gallery.showLatest();
  go('gallery');
});

/* =========================================================
   화면 8: 갤러리
   ========================================================= */
const STORE_KEY = 'fcnf-gallery-v1';
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
}
function writeSaved(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* 저장 못 해도 화면은 정상 동작 */ }
}

const gallery = (() => {
  let items = [...GALLERY_SEED, ...loadSaved()];
  let cur = GALLERY_SEED.length - 1;
  // 공유 갤러리: 저장소가 연결돼 있으면 모든 기기가 같은 작품을 봄 (아니면 이 기기에만 저장)
  let shared = false;
  const mine = []; // 이 기기에서 방금 만든 작품 (저장소에 아직 안 보일 수 있어서 따로 들고 있음)
  let els = [];
  const layer = $('#gPlates');
  const feature = $('.g-feature');
  const gImg = $('#gImg');
  // 접시 자리: [x, y, 크기]. 0이 가운데(선택된 작품)
  const SLOTS = {
    d: { '-3': [1430, -330, 269], '-2': [1260, -45, 269], '-1': [1050, 121, 269], 0: [964, 390, 269], 1: [1050, 659, 269], 2: [1283, 808, 269], 3: [1480, 1120, 269] },
    p: { '-3': [-330, 960, 160], '-2': [-160, 880, 170], '-1': [10, 770, 180], 0: [200, 700, 200], 1: [410, 770, 180], 2: [590, 880, 170], 3: [770, 960, 160] },
  };

  function build() {
    layer.innerHTML = '';
    els = [];
    for (let i = -2; i < items.length + 2; i++) {
      const it = items[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-plate';
      b.dataset.i = i;
      b.innerHTML = `<img src="assets/img/plate-top.png" alt="">${it ? `<img class="g-thumb" src="${it.thumb}" alt="">` : ''}`;
      if (it) {
        b.setAttribute('aria-label', `${it.no} ${it.name}`);
        b.addEventListener('click', () => select(i));
      } else {
        b.disabled = true;
        b.setAttribute('aria-hidden', 'true');
      }
      b.style.transition = 'none';
      layer.append(b);
      els.push(b);
    }
    render(true);
    requestAnimationFrame(() => els.forEach((b) => (b.style.transition = '')));
  }

  let shown = null;
  function render(instant) {
    const u = view.u;
    const S = view.portrait ? SLOTS.p : SLOTS.d;
    for (const b of els) {
      const i = +b.dataset.i;
      const o = i - cur;
      const [x, y, s] = S[Math.max(-3, Math.min(3, o))];
      b.style.width = b.style.height = `${s * u}px`;
      b.style.transform = `translate(${x * u}px, ${y * u}px)`;
      b.style.opacity = Math.abs(o) >= 3 ? 0 : 1;
      b.classList.toggle('is-current', o === 0);
      b.tabIndex = items[i] && Math.abs(o) <= 2 ? 0 : -1;
    }
    const it = items[cur];
    if (!it || shown === it) return;
    const apply = () => {
      gImg.src = it.img;
      gImg.alt = it.name;
      $('#gNo').textContent = it.no;
      $('#gName').textContent = it.name;
      $('#gDate').textContent = it.date;
      shown = it;
    };
    if (instant || !shown) { apply(); return; }
    feature.classList.add('is-swapping');
    setTimeout(() => { apply(); feature.classList.remove('is-swapping'); }, 260);
  }

  function select(i) {
    cur = Math.max(0, Math.min(items.length - 1, i));
    render();
  }
  const step = (d) => select(cur + d);

  function add(item) {
    items.push(item);
    if (shared) mine.push(item);
    else writeSaved(items.slice(GALLERY_SEED.length));
    cur = items.length - 1;
    build();
  }

  // 공유 갤러리에서 최신 작품 목록을 받아와 다시 그림
  async function sync() {
    const res = await ai.loadWorks();
    if (!res.enabled) return;
    shared = true;
    const keep = items[cur];
    const ids = new Set(res.works.map((w) => w.id));
    const pending = mine.filter((it) => !it.id || !ids.has(it.id));
    items = [...GALLERY_SEED, ...res.works.map((w) => ({ ...w, thumb: w.img })), ...pending];
    const at = items.findIndex((it) => it === keep || (keep?.id && it.id === keep.id));
    cur = at >= 0 ? at : items.length - 1;
    shown = null;
    build();
  }
  // 저장이 끝나 번호가 정해지면 화면 글자 다시 쓰기
  function refresh() { shown = null; render(true); }
  function showLatest() { cur = items.length - 1; render(true); }
  function nextNo() {
    const max = Math.max(0, ...items.map((it) => parseInt(it.no, 10) || 0));
    return String(max + 1).padStart(2, '0');
  }

  // 휠로 넘기기
  let acc = 0;
  let lock = false;
  $('.screen[data-screen="gallery"]').addEventListener('wheel', (e) => {
    acc += e.deltaY;
    if (lock || Math.abs(acc) < 40) return;
    step(acc > 0 ? 1 : -1);
    acc = 0;
    lock = true;
    setTimeout(() => (lock = false), 500);
  }, { passive: true });

  build();
  return { render, step, add, showLatest, nextNo, sync, refresh };
})();
enter.gallery = () => {
  gallery.render(true);
  gallery.sync(); // 다른 관람객이 만든 작품도 불러옴
};
gallery.sync();

// AI가 만든 큰 이미지는 저장 공간을 많이 차지해서 작게 줄여서 보관
async function shrink(src, max = 520) {
  if (!src?.startsWith('data:')) return src;
  const im = new Image();
  im.src = src;
  await im.decode();
  const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * s);
  c.height = Math.round(im.naturalHeight * s);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.86);
}

async function saveCreation(f) {
  if (state.saved) return;
  state.saved = true;
  const d = new Date();
  const date = `${d.getFullYear()} . ${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  let img = f.img;
  try { img = await shrink(f.img); } catch { /* 줄이기 실패하면 원본 */ }
  const item = {
    no: gallery.nextNo(),
    name: `${state.foods.A || '젤리'} ${state.foods.B || '브로콜리'}`,
    date,
    img,
    thumb: img,
    // 선택 특징과 해석의 기록 (화면에는 안 보임)
    record: { foods: { ...state.foods }, analysis: state.analysis?.demo ? null : state.analysis, plan: f.plan || null },
  };
  gallery.add(item);
  // 공유 갤러리 + 학습 기록으로 저장 (실제 AI 모드에서만)
  try {
    const r = await ai.saveWork({ name: item.name, date, image: img, plan: f.plan });
    if (r) {
      item.id = r.id;
      item.no = r.no;
      gallery.refresh();
    }
  } catch (err) {
    console.error('공유 갤러리 저장 실패', err);
  }
}

/* =========================================================
   키보드 · 전시장 자동 초기화 · 화면 크기
   ========================================================= */
window.addEventListener('keydown', (e) => {
  if (current === 'pick') {
    if (e.key === 'ArrowLeft') carousel.prev();
    if (e.key === 'ArrowRight') carousel.next();
  } else if (current === 'gallery') {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); gallery.step(-1); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); gallery.step(1); }
  }
});

let idleTimer;
function resetIdle() {
  clearTimeout(idleTimer);
  if (['select', 'pick', 'analyze', 'cook', 'taste', 'result'].includes(current)) {
    idleTimer = setTimeout(() => go('home'), IDLE_RESET_MS);
  }
}
['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));

function layout() {
  const W = app.clientWidth;
  const H = app.clientHeight;
  if (!W || !H) return;
  const portrait = W / H < 0.85;
  const u = portrait ? Math.min(W / 600, H / 1100) : Math.min(W / 1440, H / 1024);
  view.u = u;
  view.portrait = portrait;
  app.classList.toggle('is-portrait', portrait);
  app.style.setProperty('--u', `${u}px`);
  carousel.render();
  gallery.render(true);
}
new ResizeObserver(layout).observe(app);
layout();
ai.mode();

// 주소 끝에 #gallery 또는 #create를 붙이면 그 화면에서 시작
const hash = location.hash.replace('#', '');
if (hash === 'gallery') go('gallery');
else if (hash === 'create') startFlow();
else go('home');
