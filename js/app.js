/* =========================================================
   화면 흐름과 인터랙션
   메인 → 음식 고르기(입력 + 사진 선택, A·B) → 분석 → 요리하기 → 맛보기 선택 → 3D 결과 → 갤러리
   ========================================================= */
import { FOODS, FORMS, GALLERY_SEED, IDLE_RESET_MS } from './data.js';
import * as ai from './ai.js';
import { contour } from './contour.js';
import { formParticles } from './particles.js';
import { startCook, preloadCook } from './cook.js';
import { cutoutInfo } from './cutout.js';

// 주소 끝에 ?debug를 붙이면 확인용 정보가 화면에 보임
const DEBUG = new URLSearchParams(location.search).has('debug');

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const stage = $('#stage');
const isTouch = () => matchMedia('(hover: none)').matches;
const mod = (a, n) => ((a % n) + n) % n;

/* ---------- 화면 크기: 피그마 1px = 화면 몇 px인지 계산 ---------- */
const view = { u: 1, portrait: false };

/* ---------- 상태 ---------- */
const state = {
  foods: { A: null, B: null },   // 입력한 음식 이름
  picks: { A: null, B: null },   // 고른 이미지
  side: 'A',                     // 지금 고르는 쪽
  form: null,                    // 고른 맛보기 조형
  saved: false,                  // 이번 체험 결과를 갤러리에 넣었는지
  saving: null,                  // 공유 갤러리 저장이 끝나면 작품 id를 주는 약속 (평가할 때 씀)
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
  state.saving = null;
  state.analysis = null;
  state.run++;
  cancelJobs();
  picker.reset();
  go('pick');
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
      ? { cx: 300, cy: 570, box: 300, gap: 290, side: 0.72 }
      : { cx: 720, cy: 556, box: 330, gap: 370, side: 0.74 };

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

  // 그릴 자리 범위: 사진이 적으면 같은 사진이 양옆에 반복되지 않게 사진 수만큼만
  function span() {
    const count = Math.min(2 * R + 1, items.length);
    const lo = v - Math.floor((count - 1) / 2);
    return [lo, lo + count - 1];
  }

  function build() {
    const [lo, hi] = span();
    for (let k = lo; k <= hi; k++) ensure(k);
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
    el.classList.toggle('is-raw', it.cut === false); // 아직 배경을 지우는 중
    fitSize(img, it);
    if (img.getAttribute('src') === it.src) return;
    img.onload = () => el.classList.add('is-ready');
    img.src = it.src;
  }
  // 사진 크기 맞추기: 가로로 긴 사진, 세로로 긴 사진이 화면에서 비슷한 면적을 차지하도록
  // (비율은 그대로, 칸 넓이의 AREA만큼. 칸을 넘으면 줄임)
  const AREA = 0.5;
  function fitSize(img, it) {
    const a = it.w && it.h ? it.w / it.h : 1;
    let w = Math.sqrt(AREA * a), h = Math.sqrt(AREA / a);
    const over = Math.max(w / 0.96, h / 0.96, 1);
    w /= over; h /= over;
    img.style.cssText = `left:${(1 - w) * 50}%;top:${(1 - h) * 50}%;width:${w * 100}%;height:${h * 100}%`;
  }

  // i번째 자리에 이미지가 도착하면 채움
  function fill(i, it) {
    if (it !== undefined) items[i] = it;
    for (const el of els.values()) if (+el.dataset.idx === i) fillEl(el, items[i]);
    onChange();
  }

  function update() {
    if (!items.length) return;
    const [lo, hi] = span();
    for (let k = lo; k <= hi; k++) ensure(k);
    for (const [k, el] of els) {
      if (k < lo || k > hi) { el.remove(); els.delete(k); }
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

/* ---------- 음식 고르기: 입력 + 사진 선택 ----------
   순서: A 입력 → B 입력 → A 사진 고르기 → B 사진 고르기 → 분석 시작
   입력하는 동안 뒤에서 미리 사진을 찾아 둠. 고른 사진은 입력 칸에 작게 들어감
   고른 칸을 다시 누르면 그쪽 사진을 다시 고를 수 있음 */
const pickSub = $('#pickSub');
const pickBtn = $('#pickBtn');
const pickNote = $('#pickNote');
let unsubPick = null;

const picker = (() => {
  const inputs = { A: $('#foodA'), B: $('#foodB') };
  const pills = { A: $('#pillA'), B: $('#pillB') };
  const okWord = { A: null, B: null };   // 확인을 통과한 입력값
  const pending = { A: null, B: null };  // 진행 중인 확인
  let active = 'A';
  const other = (side) => (side === 'A' ? 'B' : 'A');

  function sync() {
    for (const side of ['A', 'B']) {
      pills[side].classList.toggle('is-filled', inputs[side].value.trim() !== '');
      pills[side].classList.toggle('is-active', side === active);
      pills[side].classList.toggle('is-picked', Boolean(state.picks[side]));
    }
  }

  function setThumb(side) {
    const img = $('.pill-thumb', pills[side]);
    const pick = state.picks[side];
    img.hidden = !pick;
    if (pick) img.src = pick.src;
  }

  // 두 음식이 다 확인됐으면 사진 고르기(A 먼저), 아니면 입력 단계
  const ready = () => Boolean(okWord.A && okWord.B);
  function decide() {
    $('#foodForm').classList.toggle('is-typing', !ready());
    if (!ready()) return showInput();
    setActive(!state.picks.A ? 'A' : !state.picks.B ? 'B' : active);
  }
  function showInput() {
    unsubPick?.();
    unsubPick = null;
    active = null;
    sync();
    carousel.set(Array(5).fill(null), 0, () => {});
    const waiting = ['A', 'B'].filter((k) => pending[k]).map((k) => inputs[k].value.trim());
    pickSub.textContent = waiting.length ? `${waiting.join(', ')}을(를) 확인하고 있어요`
      : !okWord.A ? 'A에 섞고 싶은 음식을 입력하세요'
        : 'B에 섞고 싶은 음식을 입력하세요';
    pickBtn.disabled = true;
    pickNote.textContent = '';
    moreBtn.hidden = true;
  }

  function setActive(side, { focus = false } = {}) {
    const changed = active !== side;
    active = side;
    state.side = side;
    sync();
    if (changed) swapCarousel(() => show(side));
    else show(side);
    if (focus && !isTouch() && !okWord[side]) inputs[side].focus();
  }

  function invalidate(side) {
    okWord[side] = null;
    state.foods[side] = null;
    state.jobs[side]?.cancel();
    state.jobs[side] = null;
    state.picks[side] = null;
    setThumb(side);
  }

  // 입력한 단어 확인. 통과하면 사진 찾기 시작
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
        decide();
        return false;
      }
      okWord[side] = word;
      state.foods[side] = res.name;
      state.jobs[side]?.cancel();
      state.jobs[side] = ai.foodImages(res.name);
      if (ready() && document.activeElement?.matches?.('.pill-input')) document.activeElement.blur(); // 휴대폰 키보드 내리기
      decide();
      return true;
    })();
    pending[side] = { word, promise };
    if (!ready()) showInput();
    return promise;
  }

  // 캐러셀에 지금 쪽(A/B)의 상태를 보여줌
  function show(side) {
    unsubPick?.();
    unsubPick = null;
    const job = okWord[side] ? state.jobs[side] : null;
    if (!job) {
      carousel.set(Array(5).fill(null), 0, () => {});
      const word = inputs[side].value.trim();
      pickSub.textContent = pending[side] ? `${word} 사진을 찾고 있어요` : `${side}에 섞고 싶은 음식을 입력하세요`;
      pickBtn.disabled = true;
      pickNote.textContent = '';
      moreBtn.hidden = true;
      return;
    }
    moreBtn.hidden = false;
    loadJob(side, job);
  }

  // '다른 사진 보기': 지금 고르는 쪽 사진을 새로 찾아옴
  const moreBtn = $('#pickMore');
  moreBtn.addEventListener('click', async () => {
    const side = active;
    if (!side || !okWord[side] || moreBtn.disabled) return;
    moreBtn.disabled = true;
    pickBtn.disabled = true;
    pickSub.textContent = `다른 ${state.foods[side]} 사진을 찾고 있어요`;
    const run = state.run;
    try {
      const job = await ai.moreImages(state.foods[side]);
      if (run !== state.run || !okWord[side]) { job.cancel(); return; }
      state.jobs[side]?.cancel();
      state.jobs[side] = job;
      if (active === side) swapCarousel(() => show(side));
    } catch (err) {
      console.error(err);
      toast(err.message || '사진을 더 찾지 못했어요');
      if (active === side) show(side);
    } finally {
      moreBtn.disabled = false;
    }
  });

  function loadJob(side, job) {
    const food = state.foods[side];
    const photos = Boolean(job.meta?.photos);
    const update = () => {
      const sel = carousel.selected();
      pickBtn.disabled = !sel || sel.cut === false;
      const total = Math.min(10, job.items.length - job.failed); // 화면에는 최대 10장
      const cut = job.items.filter((it) => it && it.cut !== false).length;
      if (photos) {
        pickSub.textContent = cut < total
          ? `${food} 사진을 준비하고 있어요 (${cut}/${total})`
          : `좌우로 넘기며 ${food} 사진을 고르세요`;
        const site = sel?.site || '사진 사이트';
        // 사진이 모자라서 AI가 그린 이미지가 섞여 있으면 그 이미지에는 AI 안내 문구
        pickNote.textContent = sel?.ai ? 'AI가 생성한 참고 이미지예요'
          : sel?.by ? `사진: ${sel.by} / ${site} · 배경은 AI가 지웠어요` : `사진: ${site} · 배경은 AI가 지웠어요`;
        if (DEBUG) pickNote.textContent += ` [배경 제거: ${cutoutInfo.method}${cutoutInfo.rejected ? `, 못 지워서 뺀 사진 ${cutoutInfo.rejected}장` : ''}]`;
      } else {
        pickSub.textContent = job.ready < total
          ? `AI가 ${food} 이미지를 만들고 있어요 (${job.ready}/${total})`
          : `좌우로 넘기며 ${food} 이미지를 고르세요`;
        pickNote.textContent = 'AI가 생성한 참고 이미지예요';
      }
    };
    // 캐러셀에 놓인 자리 = 실패하지 않은 job 번호들 (아직 준비 중인 자리는 빈 접시로 둠)
    let order = [];
    const place = (keep) => {
      order = job.items.map((_, i) => i).filter((i) => !job.lost.has(i));
      const pos = keep ? Math.max(0, order.indexOf(job.items.indexOf(keep))) : 0;
      carousel.set(order.map((i) => job.items[i]), pos, update);
    };
    const prevSel = state.picks[side];
    order = job.items.map((_, i) => i);
    const start = Math.max(0, job.items.indexOf(prevSel));
    carousel.set(job.items.slice(), prevSel ? start : FOODS[state.foods[side]]?.start ?? 0, update);
    unsubPick = job.on((i, item) => {
      if (!item) {
        // 실패한 자리는 빼고 다시 배치 (보고 있던 사진은 그대로)
        if (job.finished && !job.ready) {
          toast('사진을 불러오지 못했어요. 다른 음식을 입력해 주세요');
          invalidate(side);
          show(side);
          return;
        }
        place(carousel.selected());
        return;
      }
      const p = order.indexOf(i);
      if (p >= 0) carousel.fill(p, item);
    });
    update();
    if (job.lost.size) place(prevSel);
  }

  function choose() {
    const sel = carousel.selected();
    if (!sel || sel.cut === false) return;
    const side = active;
    state.picks[side] = sel;
    ai.trackPhoto(sel);
    setThumb(side);
    sync();
    if (state.picks.A && state.picks.B) {
      pickBtn.disabled = true;
      pickSub.textContent = '두 음식을 섞어볼게요';
      timers.pickGo = setTimeout(() => current === 'pick' && go('analyze'), 700);
      return;
    }
    decide();
  }

  for (const side of ['A', 'B']) {
    const inp = inputs[side];
    inp.addEventListener('input', () => {
      if (okWord[side] !== inp.value.trim()) {
        const was = okWord[side];
        invalidate(side);
        if (was) decide(); // 확인됐던 음식을 고치면 다시 입력 단계로
      }
      sync();
    });
    // Enter 없이 다른 칸으로 넘어가도 사진 찾기 시작
    inp.addEventListener('blur', () => { if (current === 'pick') commit(side); });
    inp.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return; // 한글 조합 중 Enter는 무시
      e.preventDefault();
      commit(side);
      // A를 입력하면 B로, B를 입력했는데 A가 비어 있으면 A로
      const next = other(side);
      if (!inputs[next].value.trim()) inputs[next].focus();
    });
    // 두 음식이 다 확인된 뒤, 이미 고른 칸을 누르면 그쪽 사진을 다시 고를 수 있음
    pills[side].addEventListener('click', () => {
      if (ready() && state.picks[side] && active !== side) {
        state.picks[side] = null;
        setThumb(side);
        setActive(side);
      }
    });
  }
  $('#foodForm').addEventListener('submit', (e) => e.preventDefault());
  pickBtn.addEventListener('click', choose);

  function reset() {
    clearTimeout(timers.pickGo);
    for (const side of ['A', 'B']) {
      inputs[side].value = '';
      pending[side] = null;
      okWord[side] = null;
      pills[side].classList.remove('is-checking');
      setThumb(side);
    }
    active = null;
    sync();
  }
  function refresh() { setThumb('A'); setThumb('B'); sync(); }
  return { reset, decide, refresh, focusFirst: () => !isTouch() && inputs[!inputs.A.value.trim() ? 'A' : 'B'].focus() };
})();

// A↔B 바꿀 때 캐러셀이 잠깐 사라졌다 나타남
function swapCarousel(fn) {
  const track = carousel.track;
  clearTimeout(timers.swap);
  track.classList.add('is-swapping');
  timers.swap = setTimeout(() => {
    fn();
    requestAnimationFrame(() => requestAnimationFrame(() => track.classList.remove('is-swapping')));
  }, 300);
}

enter.pick = () => {
  picker.refresh();
  picker.decide();
  setTimeout(() => current === 'pick' && picker.focusFirst(), 450);
};
leave.pick = () => {
  clearTimeout(timers.pickGo);
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
  preloadCook(); // 다음 화면(요리)에 쓸 물리 엔진을 미리 받아 둠
  const a = $('#analyzeA');
  const b = $('#analyzeB');
  a.src = state.picks.A.src; a.alt = state.picks.A.alt;
  b.src = state.picks.B.src; b.alt = state.picks.B.alt;
  // 사진 → 윤곽선으로 분해되는 효과 (실패하면 사진이 그대로 보임)
  materialFx.forEach((f) => f.stop());
  materialFx = [];
  try {
    materialFx = [
      contour($('#materialA'), state.picks.A.src, { delay: 250 }),
      contour($('#materialB'), state.picks.B.src, { delay: 700 }),
    ];
    $$('.scan').forEach((el) => el.classList.add('has-fx'));
  } catch (err) {
    console.error(err);
    $$('.scan').forEach((el) => el.classList.remove('has-fx'));
  }
  const run = state.run;
  try {
    // 윤곽선 효과가 끝까지 보이도록 분석 화면은 최소 3.5초 유지
    [state.analysis] = await Promise.all([ai.analyze(state.picks, state.foods), new Promise((r) => setTimeout(r, 3500))]);
  } catch (err) {
    console.error(err);
    if (run === state.run && current === 'analyze') {
      toast('분석에 실패했어요. 다시 시도해 주세요');
      state.picks = { A: null, B: null }; // 사진을 다시 고르게
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
let cookFx = null;
let cookMixing = false; // 섞는 중이면 버튼이 '다 섞었어요'

function bumpBowl() {
  cookBowl.classList.remove('bump');
  void cookBowl.offsetWidth;
  cookBowl.classList.add('bump');
}
enter.cook = () => {
  cookBowl.classList.remove('cooking', 'bump');
  cookBowl.style.opacity = '';
  cookFx?.stop();
  const sub = $('#cookSub');
  const all = $('#cookAll');
  sub.textContent = '음식을 드래그하여 그릇안으로 넣어주세요';
  all.hidden = false;
  all.textContent = '모두 넣기 ↓';
  cookMixing = false;
  cookFx = startCook($('#cookFx'), {
    picks: state.picks,
    view: () => view,
    bowlEl: cookBowl,
    onBump: bumpBowl,
    // 넣은 조각 수 표시, 다 넣으면 '모두 넣기' 숨김
    onCount: (n, total) => {
      sub.textContent = n < total ? `음식을 드래그하여 그릇안으로 넣어주세요 (${n}/${total})` : '조각들을 섞어볼게요';
      all.hidden = n >= total;
    },
    onMix: () => cookBowl.classList.remove('bump'),
    // 섞기: 커서(손가락)로 저은 만큼 진행도 표시. '다 섞었어요'로 바로 끝낼 수도 있음
    onStir: (p, finished) => {
      if (finished) {
        cookMixing = false;
        sub.textContent = '잘 섞였어요';
        all.hidden = true;
        return;
      }
      cookMixing = true;
      const how = isTouch() ? '손가락으로' : '커서로';
      sub.textContent = `${how} 그릇을 휘저어 섞어주세요${p > 0 ? ` (${Math.round(p * 100)}%)` : ''}`;
      all.textContent = '다 섞었어요 →';
      all.hidden = false;
    },
    onDone: () => { if (current === 'cook') timers.cook2 = setTimeout(() => go('taste'), 200); },
  });
  if (!isTouch()) setTimeout(() => current === 'cook' && $('#cookFx').focus({ preventScroll: true }), 400);
};
$('#cookAll').addEventListener('click', () => (cookMixing ? cookFx?.finishMix() : cookFx?.dropAll()));
leave.cook = () => {
  clearTimeout(timers.cook2);
  const fx = cookFx;
  cookFx = null;
  setTimeout(() => fx?.stop(), 600); // 화면이 사라진 뒤 정지
};

/* =========================================================
   화면 6: 맛보기 조형 선택
   ========================================================= */
let unsubTaste = null;
let tasteFx = null;
function buildTaste() {
  const layer = $('#tasteLayer');
  layer.innerHTML = '';
  layer.classList.remove('has-choice');
  if (!state.formsJob) state.formsJob = ai.tasteForms(state.analysis, state.picks, state.foods);
  const job = state.formsJob;
  tasteFx?.stop();
  tasteFx = formParticles($('#tasteFx'));
  // 조형 6개가 '다' 만들어질 때까지 점들이 맴돌며 기다리다가,
  // 다 되면 6개가 한꺼번에 점에서 모여 나타남 (하나씩 따로 나오지 않게)
  const sub = $('#tasteSub');
  sub.textContent = '새로운 조형을 만들고 있어요';
  sub.classList.add('is-waiting');
  let revealed = false;
  const revealAll = async () => {
    if (revealed || !job.finished || !job.ready) return;
    revealed = true;
    const fx = tasteFx;
    // 이미지를 먼저 다 불러놓고 → 동시에 시작
    const cells = job.items.map((src, i) => (src ? { i, src, cell: layer.children[i] } : null)).filter(Boolean);
    await Promise.all(cells.map(({ cell, src }) => {
      const img = cell.querySelector('.taste-form');
      img.src = src;
      return img.decode().catch(() => {});
    }));
    if (fx !== tasteFx) return;
    sub.classList.remove('is-waiting');
    sub.textContent = '맛보고 싶은 조형을 클릭하세요';
    await Promise.all(cells.map(async ({ i, src, cell }) => {
      await fx.reveal(i, src);
      if (fx !== tasteFx) return;
      cell.classList.add('is-ready');
      cell.querySelector('.taste-hit').disabled = false;
    }));
  };
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
    hit.disabled = true;
    tasteFx.add(i, cell.querySelector('.taste-form'));
    hit.addEventListener('click', () => chooseForm({ ...f, img: job.items[i], plan: job.meta?.forms?.[i] || null }, cell));
    layer.append(cell);
  });
  job.lost.forEach((i) => tasteFx.cancel(i));
  revealAll();
  unsubTaste?.();
  const checkFailed = () => {
    if (job.finished && !job.ready) {
      toast('조형을 만들지 못했어요. 처음부터 다시 해주세요');
      timers.tasteFail = setTimeout(() => go('home'), 2000);
    }
  };
  checkFailed();
  unsubTaste = job.on((i, src) => {
    if (!src) { tasteFx?.cancel(i); checkFailed(); }
    revealAll();
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
  const fx = tasteFx;
  tasteFx = null;
  setTimeout(() => fx?.stop(), 600); // 화면이 사라진 뒤 정지
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
  resetRate();
  img.src = f.img;
  img.hidden = false;
  sub.textContent = '선택한 조형을 3D로 바꾸는 중이에요';
  sub.classList.add('is-waiting');
  try {
    const urls = await ai.toModel(f.img, f, (p) => {
      if (run === state.run && current === 'result') sub.textContent = `선택한 조형을 3D로 바꾸는 중이에요 (${p}%)`;
    }, (taskId) => {
      // 변환 시작 기록 (작품 저장이 끝난 뒤)
      Promise.resolve(state.saving).then((id) => ai.noteTask(id, taskId)).catch((err) => {
        console.error('3D 변환 기록 실패', err);
        if (DEBUG) toast(`3D 변환 기록 실패: ${err.message}`);
      });
    });
    viewerMod ??= await import('./viewer3d.js');
    viewer ??= viewerMod.createViewer($('#viewer'));
    let loaded = false;
    for (const url of urls) {
      try { await viewer.load(url); loaded = true; break; } catch (err) { console.warn('3D 불러오기 실패', url, err); }
    }
    if (!loaded) throw new Error('3D 파일을 불러오지 못함');
    // 갤러리에서도 3D로 볼 수 있게 3D 파일 보관 (작품 저장이 끝난 뒤)
    if (urls.taskId) {
      Promise.resolve(state.saving)
        .then((id) => ai.saveModel(id, urls.taskId))
        .then((r) => {
          if (r?.model) gallery.setModel(r.model);
          if (DEBUG) toast(r?.model ? '3D 파일 보관 완료' : '3D 파일 보관 안 됨 (실제 AI 모드·저장소 확인)');
        })
        .catch((err) => {
          console.error('3D 파일 보관 실패', err);
          if (DEBUG) toast(`3D 파일 보관 실패: ${err.message}`);
        });
    }
    if (run !== state.run || current !== 'result') return;
    img.hidden = true;
    viewer.setVisible(true);
    viewer.start();
    sub.textContent = isTouch() ? '손가락으로 드래그해서 3D 조형을 돌려보세요' : '마우스 왼쪽을 누르며 3D 조형을 돌려보세요';
    note.hidden = false; // 보이지 않는 면은 AI가 추정했다는 안내
    rate.hidden = false;
  } catch (err) {
    console.error(err);
    if (run !== state.run || current !== 'result') return;
    sub.textContent = '3D로 바꾸지 못해서 이미지로 보여줄게요';
    rate.hidden = false;
  } finally {
    sub.classList.remove('is-waiting');
  }
};
leave.result = () => viewer?.stop();

/* ---------- 관람객 평가: 좋아요 / 별로예요 ----------
   누르면 저장되고, 다음 관람객의 조형 6개를 만들 때 AI가 참고함
   (좋아요 = 이어받을 경향, 별로예요 = 피할 경향). 한 번만 누를 수 있음 */
const rate = $('#resultRate');
function resetRate() {
  rate.hidden = true;
  rate.classList.remove('is-done');
  rate.querySelectorAll('.rate-btn').forEach((b) => { b.classList.remove('is-picked'); b.disabled = false; });
  $('#rateQ').textContent = '이 조형, 어땠어요?';
}
rate.addEventListener('click', async (e) => {
  const btn = e.target.closest('.rate-btn');
  if (!btn || rate.classList.contains('is-done')) return;
  rate.classList.add('is-done');
  btn.classList.add('is-picked');
  rate.querySelectorAll('.rate-btn').forEach((b) => (b.disabled = true));
  $('#rateQ').textContent = '다음 조형에 반영할게요';
  try {
    const id = await state.saving;
    await ai.rateWork(id, btn.dataset.rating);
  } catch (err) {
    console.error('평가 저장 실패', err);
  }
});
// 끝나면 갤러리로 가지 않고 처음 화면으로 (다음 관람객 차례). 갤러리는 메뉴에서 볼 수 있음
$('#resultNext').addEventListener('click', () => go('home'));

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
      show3d(false);
    };
    if (instant || !shown) { apply(); return; }
    feature.classList.add('is-swapping');
    setTimeout(() => { apply(); feature.classList.remove('is-swapping'); }, 260);
  }

  function select(i) {
    cur = Math.max(0, Math.min(items.length - 1, i));
    render();
  }

  /* ---------- 모아보기: 모든 작품을 한 화면에 (최신 작품이 먼저) ---------- */
  const section = $('.screen[data-screen="gallery"]');
  const grid = $('#gGrid');
  function buildGrid() {
    grid.innerHTML = '';
    const n = items.length;
    $('#gCount').textContent = `지금까지 모인 조형 ${n}개`;
    // 화면 영역 안에 가장 크게 들어가는 칸 수 계산
    // 넓은 화면이면 양옆 여백까지 씀
    const ox = view.ox || 0;
    const A = view.portrait ? { x: 24 - ox, y: 180, w: 552 + 2 * ox, h: 890, max: 170 } : { x: 100 - ox, y: 180, w: 1240 + 2 * ox, h: 800, max: 230 };
    let best = { size: 0, cols: 1 };
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      const size = Math.min(A.w / c, A.h / (rows * 1.12), A.max);
      // 크기가 같으면 칸을 옆으로 더 늘어놓음 (몇 개 안 될 때 세로 한 줄로 서지 않게)
      if (size >= best.size - 0.5) best = { size, cols: c };
    }
    const { size, cols } = best;
    const rows = Math.ceil(n / cols);
    const gx = A.x + (A.w - cols * size) / 2;
    const gy = A.y + (A.h - rows * size * 1.12) / 2;
    const order = items.map((it, i) => i).reverse();
    order.forEach((i, k) => {
      const it = items[i];
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'g-cell abs';
      const col = k % cols, row = Math.floor(k / cols);
      cell.style.cssText = `--x:${gx + col * size + size * 0.06};--y:${gy + row * size * 1.12};width:calc(${size * 0.88} * var(--u));font-size:calc(${Math.max(11, size * 0.075)} * var(--u));--d:${Math.min(k * 0.04, 1.2)}s;--f:${-(k % 7) * 0.9}s`;
      cell.innerHTML = `<span class="g-cell-plate"><img src="assets/img/plate-top.png" alt=""><img class="g-thumb" src="${it.thumb}" alt="">${it.model || it.task ? '<span class="g-cell-3d">3D</span>' : ''}</span><span class="g-cell-no">${it.no}</span>`;
      cell.setAttribute('aria-label', `${it.no} ${it.name}${it.model || it.task ? ', 3D로 볼 수 있음' : ''}`);
      cell.addEventListener('click', () => openDetail(i));
      grid.append(cell);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.g-cell', grid).forEach((c) => c.classList.add('is-in'))));
  }
  function openGrid() {
    show3d(false);
    section.classList.add('is-grid');
    buildGrid();
  }
  function openDetail(i) {
    cur = i;
    shown = null;
    render(true);
    section.classList.remove('is-grid');
    if (items[i]?.model || items[i]?.task) show3d(true); // 3D 파일이 있으면 바로 3D로
  }
  const isGrid = () => section.classList.contains('is-grid');
  $('#gBack').addEventListener('click', openGrid);

  /* ---------- 3D로 보기 (3D 파일이 보관된 작품만) ---------- */
  const g3d = $('#g3d');
  let gViewer = null;
  let on3d = false;
  async function show3d(on) {
    const it = items[cur];
    // 3D 변환 기록만 있으면 먼저 3D 파일을 가져와 보관
    if (on && it && !it.model && it.task) {
      g3d.hidden = false;
      g3d.disabled = true;
      g3d.textContent = '3D 파일 가져오는 중…';
      try {
        const r = await ai.fetchModel(it.id);
        if (r?.model) it.model = r.model;
      } catch (err) {
        console.error('3D 파일 가져오기 실패', err);
      }
      it.task = null; // 실패해도 다시 시도하지 않음
      if (items[cur] !== it) return;
      if (isGrid()) buildGrid();
    }
    g3d.hidden = !it;
    g3d.disabled = !it?.model;
    on3d = Boolean(on && it?.model);
    g3d.classList.toggle('is-on', on3d);
    g3d.textContent = !it?.model ? '3D 파일이 없는 작품이에요' : on3d ? '이미지로 보기' : '3D로 보기';
    feature.classList.toggle('is-3d', on3d);
    if (!on3d) { gViewer?.stop(); return; }
    try {
      viewerMod ??= await import('./viewer3d.js');
      gViewer ??= viewerMod.createViewer($('#gViewer'));
      g3d.textContent = '불러오는 중…';
      await gViewer.load(it.model);
      if (!on3d || items[cur] !== it) return;
      g3d.textContent = '이미지로 보기';
      gViewer.setVisible(true);
      gViewer.start();
    } catch (err) {
      console.error(err);
      toast('3D를 불러오지 못했어요');
      show3d(false);
    }
  }
  g3d.addEventListener('click', () => show3d(!on3d));
  const step = (d) => select(cur + d);

  function add(item) {
    items.push(item);
    if (shared) mine.push(item);
    else writeSaved(items.slice(GALLERY_SEED.length));
    cur = items.length - 1;
    build();
    if (isGrid()) buildGrid();
  }

  // 공유 갤러리에서 최신 작품 목록을 받아와 다시 그림
  async function sync(fresh = false) {
    const res = await ai.loadWorks(fresh);
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
    if (isGrid()) buildGrid();
    // 실제 AI 모드: 3D 기록이 없는 예전 작품은 Meshy 작업 목록에서 찾아 연결 (한 번만)
    if (!triedBackfill && res.works.some((w) => !w.model && !w.task) && (await ai.mode()) === 'live') {
      triedBackfill = true;
      try {
        const r = await ai.backfillModels();
        if (r?.matched) sync(true);
      } catch (err) { console.error('예전 작품 3D 복구 실패', err); }
    }
  }
  let triedBackfill = false;
  // 방금 만든 작품의 3D 파일이 보관되면 연결
  function setModel(url) {
    const it = mine[mine.length - 1];
    if (!it) return;
    it.model = url;
    if (items[cur] === it) show3d(false);
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
    if (isGrid() || on3d) return;
    acc += e.deltaY;
    if (lock || Math.abs(acc) < 40) return;
    step(acc > 0 ? 1 : -1);
    acc = 0;
    lock = true;
    setTimeout(() => (lock = false), 500);
  }, { passive: true });

  build();
  return { render, step: (d) => !isGrid() && !on3d && step(d), add, showLatest, nextNo, sync, refresh, setModel, openGrid, isGrid, layout: () => { render(true); if (isGrid()) buildGrid(); } };
})();
enter.gallery = () => {
  gallery.openGrid(); // 들어오면 항상 모아보기부터
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

function saveCreation(f) {
  if (state.saved) return state.saving;
  state.saved = true;
  state.saving = saveCreationNow(f);
  return state.saving;
}
async function saveCreationNow(f) {
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
      return r.id;
    }
    if (DEBUG) toast('작품 저장 안 됨 (실제 AI 모드인지 확인)');
  } catch (err) {
    console.error('공유 갤러리 저장 실패', err);
    if (DEBUG) toast(`작품 저장 실패: ${err.message}`);
  }
  return null;
}

/* =========================================================
   키보드 · 전시장 자동 초기화 · 화면 크기
   ========================================================= */
window.addEventListener('keydown', (e) => {
  if (current === 'pick') {
    if (e.target.matches?.('input')) return; // 입력 중일 땐 방향키로 사진 넘기지 않음
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
  if (['pick', 'analyze', 'cook', 'taste', 'result'].includes(current)) {
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
  // 화면이 피그마 프레임보다 넓거나 길면 남는 여백 (피그마 px, 한쪽). 구석에 붙는 요소(로고·메뉴·버튼)가 이만큼 바깥으로 나감
  view.ox = Math.max(0, (W / u - (portrait ? 600 : 1440)) / 2);
  view.oy = Math.max(0, (H / u - (portrait ? 1100 : 1024)) / 2);
  app.classList.toggle('is-portrait', portrait);
  app.style.setProperty('--u', `${u}px`);
  app.style.setProperty('--ox', view.ox);
  app.style.setProperty('--oy', view.oy);
  carousel.render();
  gallery.layout();
}
new ResizeObserver(layout).observe(app);
layout();
ai.mode();

// 주소 끝에 #gallery 또는 #create를 붙이면 그 화면에서 시작
const hash = location.hash.replace('#', '');
if (hash === 'gallery') go('gallery');
else if (hash === 'create') startFlow();
else go('home');
