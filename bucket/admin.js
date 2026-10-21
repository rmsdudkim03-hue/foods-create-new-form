/* 버킷리스트 방명록 — 관리 화면 (/bucket/admin.html)
   - 관리 코드를 넣으면 글 전체가 보이고, 글마다 '지우기'
   - 엑셀(CSV)·JSON으로 전체 내려받기 (전시가 끝나면 여기서 받아 두기)
   - 관리 코드는 이 기기에만 기억 (나가기를 누르면 지움) */
const API = '/api/bucket';
const $ = (id) => document.getElementById(id);
const KEY = 'bucket-admin';
let code = '';
try { code = localStorage.getItem(KEY) || ''; } catch { /* 없음 */ }
let items = [];

function when(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function open() {
  $('info').textContent = '불러오는 중…';
  const r = await fetch(`${API}?admin=1`, { headers: { 'x-admin-code': code }, cache: 'no-store' });
  if (r.status === 401) {
    $('info').textContent = '관리 코드가 맞지 않아요.';
    $('gate').hidden = false;
    $('tools').hidden = true;
    $('list').replaceChildren();
    return;
  }
  if (!r.ok) { $('info').textContent = `불러오지 못했어요 (${r.status})`; return; }
  items = (await r.json()).items;
  try { localStorage.setItem(KEY, code); } catch { /* 없음 */ }
  $('gate').hidden = true;
  $('tools').hidden = false;
  render();
}

function render() {
  $('info').textContent = `글 ${items.length}개 (최신순)`;
  $('list').replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    li.className = 'item';
    const box = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = it.text;
    const s = document.createElement('small');
    s.textContent = [it.name || '(이름 없음)', when(it.at)].join(' · ');
    box.append(p, s);
    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '지우기';
    del.onclick = () => remove(it, del);
    li.append(box, del);
    return li;
  }));
}

async function remove(it, btn) {
  if (!confirm(`이 글을 지울까요? 되돌릴 수 없어요.\n\n"${it.text}"`)) return;
  btn.disabled = true;
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-code': code },
    body: JSON.stringify({ remove: it.id }),
  });
  if (!r.ok) { alert('지우지 못했어요.'); btn.disabled = false; return; }
  items = items.filter((x) => x.id !== it.id);
  render();
}

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => when(new Date().toISOString()).slice(0, 10);

$('csv').onclick = () => {
  // 오래된 글부터. 맨 앞 ﻿는 엑셀에서 한글이 안 깨지게 하는 표시
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['번호', '버킷리스트', '이름', '남긴 시간'], ...[...items].reverse().map((it, i) => [i + 1, it.text, it.name, when(it.at)])];
  download(`bucketlist-${stamp()}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};
$('json').onclick = () => download(`bucketlist-${stamp()}.json`, JSON.stringify([...items].reverse(), null, 2), 'application/json');
$('reload').onclick = open;
$('logout').onclick = () => {
  code = '';
  try { localStorage.removeItem(KEY); } catch { /* 없음 */ }
  location.reload();
};
$('gate').addEventListener('submit', (e) => {
  e.preventDefault();
  code = $('code').value.trim();
  if (code) open();
});

if (code) open();
