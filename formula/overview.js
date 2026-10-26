// OVERVIEW: AI 대화창을 쓰는 것처럼 (피그마 완성본 Frame 12·15·16·17·13)
//  화면에 들어오면 → 빈 입력창에 질문이 한 글자씩 쳐짐 → 보내면 말풍선이 입력창 위에 나타났다가 위로 올라감
//  → 입력창에 ■(답하는 중) + 점 세 개가 깜빡임(생각 중) → 답이 낱말마다 흐릿하게 스며 나오고(Claude처럼) → 영어가 떠오름
//  조금 더 내리면(NEXT_AT) 두 번째 질문: 앞 대화가 위로 밀려 흐려지고 같은 순서로 반복
//  그냥 지나쳐 내려가면 남은 대화는 바로 끝난 모습으로, 맨 위로 올라가면 처음부터 다시
(() => {
  const sec = document.getElementById('overview');
  if (!sec) return;
  const NEXT_AT = 0.45;   // 이 구간(0~1)을 지나면 두 번째 질문
  const TYPE_MS = 70;     // 질문 한 글자 치는 시간
  const STREAM_MS = 55;   // 답 낱말 하나가 나오는 간격
  const THINK_MS = 1300;  // 점 세 개가 깜빡이는 시간
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const input = sec.querySelector('.ov-input');
  const typed = sec.querySelector('.ov-typed');
  // 답 글을 낱말마다 <span class="w">로 나눠 둠 (굵은 글씨 <b>, 줄바꿈은 그대로)
  function splitWords(ko) {
    const words = [];
    const walk = (node, into) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          for (const part of n.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { into.append(part); continue; }
            const w = document.createElement('span'); w.className = 'w'; w.textContent = part;
            into.append(w); words.push(w);
          }
        } else if (n.nodeType === 1) {
          const copy = n.cloneNode(false); into.append(copy); walk(n, copy);
        }
      }
    };
    const box = document.createElement('div');
    ko.innerHTML = ko.innerHTML.trim();
    walk(ko, box);
    ko.replaceChildren(...box.childNodes);
    return words;
  }
  const exs = [...sec.querySelectorAll('.ov-ex')].map((el) => {
    const ko = el.querySelector('.ov-ko');
    const ex = { el, q: el.querySelector('.ov-q'), dots: el.querySelector('.ov-dots'), ko, words: splitWords(ko) };
    ex.q.textContent = el.dataset.q;
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
    // 2. 보내기 (Claude처럼): 입력창의 글자가 그 자리에서 떠올라 말풍선이 되며 오른쪽 위로
    const from = typed.getBoundingClientRect();
    typed.textContent = '';
    input.classList.add('busy');
    ex.q.classList.add('sent');
    if (!fast()) {
      const to = ex.q.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(ex.q).paddingLeft) || 0;
      ex.q.style.transition = 'none';
      ex.q.style.transform = `translate(${from.left - to.left - pad}px, ${from.top + from.height / 2 - (to.top + to.height / 2)}px)`;
      ex.q.style.backgroundColor = 'transparent';
      void ex.q.offsetWidth;
      ex.q.style.transition = '';
      ex.q.classList.add('fly');
      ex.q.style.transform = '';
      ex.q.style.backgroundColor = '';
    }
    await wait(550); if (!alive()) return;
    // 3. 말풍선이 위로 + 생각 중
    if (i > 0) exs[i - 1].el.classList.add('gone');
    ex.q.classList.add('up');
    ex.dots.classList.add('on', 'think');
    await wait(THINK_MS); if (!alive()) return;
    ex.dots.classList.remove('think');
    // 4. 답이 낱말마다 스며 나옴 (Claude처럼 흐릿 → 또렷)
    for (const w of ex.words) {
      if (fast()) break;
      w.classList.add('on');
      await sleep(STREAM_MS);
      if (!alive()) return;
    }
    ex.words.forEach((w) => w.classList.add('on'));
    ex.el.classList.add('en-on');
    input.classList.remove('busy');
  }

  // 대화가 나오는 동안은 아래로 스크롤 못 함 (lock.js). 첫 질문은 이 구간 맨 위에 맞춘 뒤 붙잡음
  const LOCK = window.FORMULA_LOCK;
  async function pump() {
    if (running) return;
    running = true;
    const id = run;
    while (started < goal && id === run) {
      if (LOCK && !beyond && !reduce) {
        const y = started === 0 ? sec.offsetTop : scrollY;
        if (started === 0 && Math.abs(scrollY - y) > 2) scrollTo({ top: y, behavior: 'smooth' });
        LOCK.hold('overview', y);
      }
      await play(started++, id);
      if (LOCK) LOCK.release('overview');
    }
    if (id === run) running = false;
  }

  function reset() {
    run++; goal = 0; started = 0; running = false; beyond = false;
    if (LOCK) LOCK.release('overview');
    typed.textContent = '';
    input.classList.remove('busy');
    exs.forEach((ex) => {
      ex.el.classList.remove('past', 'gone', 'en-on');
      ex.q.classList.remove('sent', 'up');
      ex.dots.classList.remove('on', 'think');
      ex.q.classList.remove('fly'); ex.q.style.transform = ''; ex.q.style.backgroundColor = '';
      ex.words.forEach((w) => w.classList.remove('on'));
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
