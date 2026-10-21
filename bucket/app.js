/* 버킷리스트 방명록 — 화면 동작
   - 처음 열면 최신 글 30개, '더 보기'로 다음 30개
   - 30초마다 새 글이 있는지 확인해서 맨 위에 붙임 (다른 관람객 글이 실시간처럼 보이게)
   - 내가 쓴 글은 이 휴대폰에 기억해 두고 노란 배경으로 표시 */
const API = '/api/bucket';
const MAX = 80;
const $ = (id) => document.getElementById(id);
const form = $('write'), text = $('text'), name = $('name'), count = $('count'), sendBtn = $('send'), msg = $('msg');
const list = $('list'), empty = $('empty'), more = $('more');

const shown = new Set(); // 화면에 있는 글 id
let next = null;          // 다음 쪽 표시

// 내가 쓴 글 id (이 휴대폰에만 저장. 못 쓰는 환경이면 그냥 넘어감)
const MINE_KEY = 'bucket-mine';
let mine = [];
try { mine = JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch { /* 없음 */ }
function rememberMine(id) {
  mine = [id, ...mine].slice(0, 20);
  try { localStorage.setItem(MINE_KEY, JSON.stringify(mine)); } catch { /* 없음 */ }
}

// 날짜 표시: 10월 21일 14:05
function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function card(it) {
  const li = document.createElement('li');
  li.className = 'item' + (mine.includes(it.id) ? ' mine' : '');
  const p = document.createElement('p');
  p.textContent = it.text; // 글을 그대로 글자로만 넣음 (태그가 섞여 있어도 실행되지 않게)
  const s = document.createElement('small');
  s.textContent = [it.name, when(it.at)].filter(Boolean).join(' · ');
  li.append(p, s);
  return li;
}

function add(items, { top = false } = {}) {
  const fresh = items.filter((it) => !shown.has(it.id));
  fresh.forEach((it) => shown.add(it.id));
  const nodes = fresh.map(card);
  if (top) {
    nodes.forEach((n) => n.classList.add('new'));
    list.prepend(...nodes);
  } else list.append(...nodes);
  empty.hidden = shown.size > 0;
}

async function load(cursor) {
  const r = await fetch(API + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''));
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function first() {
  try {
    const d = await load();
    if (!d.enabled) {
      say('지금은 글을 저장할 수 없어요. 잠시 후 다시 열어 주세요.', true);
      return;
    }
    add(d.items);
    next = d.next;
    more.hidden = !next;
  } catch {
    say('글을 불러오지 못했어요. 새로고침해 주세요.', true);
  }
}

more.addEventListener('click', async () => {
  more.disabled = true;
  try {
    const d = await load(next);
    add(d.items);
    next = d.next;
  } catch { /* 다음에 다시 */ }
  more.disabled = false;
  more.hidden = !next;
});

// 새 글 확인 (화면을 보고 있을 때만)
setInterval(async () => {
  if (document.hidden) return;
  try { add((await load()).items, { top: true }); } catch { /* 다음에 다시 */ }
}, 30_000);

// 글자 수 · 버튼 켜기
function update() {
  // 줄바꿈은 안 받음 (한 줄짜리 글)
  if (text.value.includes('\n')) text.value = text.value.replace(/\n+/g, ' ');
  count.textContent = `${text.value.length}/${MAX}`;
  sendBtn.disabled = !text.value.trim();
  // 글이 길어지면 칸이 따라 늘어남
  text.style.height = 'auto';
  text.style.height = text.scrollHeight + 'px';
}
text.addEventListener('input', update);
// 엔터 = 남기기
text.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
});

function say(t, bad = false) {
  msg.textContent = t;
  msg.classList.toggle('bad', bad);
}

const ERRORS = {
  bad_word: '고운 말로 다시 써 주세요 🙂',
  too_fast: '조금 뒤에 다시 남겨 주세요.',
  empty: '버킷리스트를 적어 주세요.',
  no_store: '지금은 글을 저장할 수 없어요.',
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sendBtn.disabled) return;
  sendBtn.disabled = true;
  say('남기는 중…');
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.value, name: name.value }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      say(ERRORS[d.error] || '남기지 못했어요. 다시 시도해 주세요.', true);
      sendBtn.disabled = false;
      return;
    }
    rememberMine(d.item.id);
    add([d.item], { top: true });
    text.value = '';
    update();
    text.blur();
    say('남겼어요. 고마워요!');
    list.firstElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    say('인터넷 연결을 확인해 주세요.', true);
    sendBtn.disabled = false;
  }
});

update();
first();
