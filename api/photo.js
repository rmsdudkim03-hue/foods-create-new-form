// 사진 사이트(Unsplash·Pixabay·Pexels)의 사진을 우리 주소로 전달
// (브라우저에서 배경을 지우려면 사진 픽셀을 읽어야 하는데, 다른 사이트 사진은 막힐 수 있어서)
// GET  ?u=사진 주소  (네이버 검색 사진은 &f=미리보기 주소&s=도장)
// POST { track } → 관람객이 고른 사진을 Unsplash에 알려줌 (Unsplash 이용 규칙)
import { send, readJSON, PHOTO_HOSTS, PHOTO_UA, trackPhoto, checkPhoto } from './_lib.js';

export default async function photo(req, res) {
  try {
    if (req.method === 'POST') {
      const { track } = await readJSON(req);
      if (typeof track === 'string') await trackPhoto(track);
      return send(res, 200, { ok: true });
    }
    const q = new URL(req.url, 'http://x').searchParams;
    const u = q.get('u') || '';
    const f = q.get('f') || '';
    // 네이버 검색 사진: 서버가 도장(s)을 찍어 준 주소만. 원본이 막히면 네이버 미리보기(f)로
    const signed = q.has('s') && checkPhoto(u, f, q.get('s'));
    const tries = signed ? [u, f].filter(Boolean) : [u];
    let got = null;
    let lastErr = 'url';
    for (const t of tries) {
      let target;
      try { target = new URL(t); } catch { continue; }
      if (target.protocol !== 'https:' || (!signed && !PHOTO_HOSTS.includes(target.hostname))) continue;
      try {
        // 네이버 사진 서버(pstatic)는 네이버에서 연 것처럼 보여야 열림
        const headers = { 'User-Agent': signed ? 'Mozilla/5.0' : PHOTO_UA };
        if (/pstatic\.net$/.test(target.hostname)) headers.Referer = 'https://search.naver.com/';
        const r = await fetch(target, { headers, redirect: 'follow', signal: AbortSignal.timeout(8000) }); // 느린 사이트는 8초에서 포기
        const type = r.headers.get('content-type') || '';
        if (!r.ok || !type.startsWith('image/')) { lastErr = `photo ${r.status}`; continue; }
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 4_000_000) { lastErr = 'too_large'; continue; }
        got = { type, buf };
        break;
      } catch (err) { lastErr = String(err.message || err); }
    }
    if (!got) return send(res, 502, { error: lastErr });
    const { type, buf } = got;
    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    // 같은 사진은 Vercel이 하루 동안 기억해서 다시 받지 않음
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.end(buf);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err).slice(0, 300) });
  }
}
