// OVERVIEW: AI 대화창을 쓰는 것처럼 (피그마 완성본 Frame 12·15·16·17·13)
//  화면에 들어오면 → 빈 입력창에 질문이 한 글자씩 쳐짐 → 보내면 말풍선이 입력창 위에 나타났다가 위로 올라감
//  → 입력창에 ■(답하는 중) + 점 세 개가 깜빡임(생각 중) → 답이 한 글자씩 나오고 → 영어가 떠오름
//  조금 더 내리면(NEXT_AT) 두 번째 질문: 앞 대화가 위로 밀려 흐려지고 같은 순서로 반복
//  그냥 지나쳐 내려가면 남은 대화는 바로 끝난 모습으로, 맨 위로 올라가면 처음부터 다시
(() => {
  const sec = document.getElementById('overview');
  if (!sec) return;
  const NEXT_AT = 0.45;   // 이 구간(0~1)을 지나면 두 번째 질문
  const TYPE_MS = 70;     // 질문 한 글자 치는 시간
  const STREAM_MS = 18;   // 답 한 글자 나오는 시간
  const THINK_MS = 1300;  // 점 세 개가 깜빡이는 시간
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const input = sec.querySelector('.ov-input');
  const typed = sec.querySelector('.ov-typed');
  const exs = [...sec.querySelectorAll('.ov-ex')].map((el) => {
    const ko = el.querySelector('.ov-ko');
    const ex = { el, q: el.querySelector('.ov-q'), dots: el.querySelector('.ov-dots'), ko, text: ko.textContent.trim() };
    ex.q.textContent = el.dataset.q;
    ko.textContent = '';
    return ex;
  });

  let run = 0, goal = 0, started = 0, running = false, beyond = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function play(i, id) {
    const ex = exs[i];
    const fast = () => reduce || beyond || i < goal - 1;          // 지나쳤으면 바로 끝난 모습으로
    const wait = (ms) => (fast() ? Promise.resolve() : sleep(ms));
    const alive = () => id === run;

    if (i > 0) { exs[i - 1].el.classList.add('past'); await wait(700); if (!alive()) return; }
    // 1. 질문 타이핑
    for (const ch of ex.el.dataset.q) {
      if (fast()) { typed.textContent = ex.el.dataset.q; break; }
      typed.textContent += ch;
      await sleep(TYPE_MS + Math.random() * 50);
      if (!alive()) return;
    }
    await wait(450); if (!alive()) return;
    // 2. 보내기: 입력창은 비고, 말풍선이 입력창 위에
    typed.textContent = '';
    input.classList.add('busy');
    ex.q.classList.add('sent');
    await wait(550); if (!alive()) return;
    // 3. 말풍선이 위로 + 생각 중
    if (i > 0) exs[i - 1].el.classList.add('gone');
    ex.q.classList.add('up');
    ex.dots.classList.add('on', 'think');
    await wait(THINK_MS); if (!alive()) return;
    ex.dots.classList.remove('think');
    // 4. 답이 한 글자씩
    for (let n = 0; n <= ex.text.length; n += 2) {
      if (fast()) break;
      ex.ko.textContent = ex.text.slice(0, n);
      await sleep(STREAM_MS);
      if (!alive()) return;
    }
    ex.ko.textContent = ex.text;
    ex.el.classList.add('en-on');
    input.classList.remove('busy');
  }

  async function pump() {
    if (running) return;
    running = true;
    const id = run;
    while (started < goal && id === run) await play(started++, id);
    if (id === run) running = false;
  }

  function reset() {
    run++; goal = 0; started = 0; running = false; beyond = false;
    typed.textContent = '';
    input.classList.remove('busy');
    exs.forEach((ex) => {
      ex.el.classList.remove('past', 'gone', 'en-on');
      ex.q.classList.remove('sent', 'up');
      ex.dots.classList.remove('on', 'think');
      ex.ko.textContent = '';
    });
  }

  let raf = 0;
  function check() {
    raf = 0;
    const r = sec.getBoundingClientRect();
    if (r.top >= innerHeight) { if (started) reset(); return; }   // 아직 위쪽(소개글)에 있으면 처음 상태로
    const p = -r.top / Math.max(1, r.height - innerHeight);       // 이 구간을 얼마나 내려왔나 (0~1)
    beyond = r.bottom <= innerHeight * 0.5;                        // 거의 지나침
    let want = 0;
    if (r.top < innerHeight * 0.35) want = 1;
    if (p > NEXT_AT || beyond) want = 2;
    if (want > goal) { goal = want; pump(); }
  }
  const ask = () => { if (!raf) raf = requestAnimationFrame(check); };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  check();
})();
