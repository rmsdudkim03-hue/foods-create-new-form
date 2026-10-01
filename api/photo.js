// 사진 사이트(Unsplash·Pixabay·Pexels)의 사진을 우리 주소로 전달
// (브라우저에서 배경을 지우려면 사진 픽셀을 읽어야 하는데, 다른 사이트 사진은 막힐 수 있어서)
// GET  ?u=사진 주소
// POST { track } → 관람객이 고른 사진을 Unsplash에 알려줌 (Unsplash 이용 규칙)
import { send, readJSON, PHOTO_HOSTS, PHOTO_UA, trackPhoto } from './_lib.js';

export default async function photo(req, res) {
  try {
    if (req.method === 'POST') {
      const { track } = await readJSON(req);
      if (typeof track === 'string') await trackPhoto(track);
      return send(res, 200, { ok: true });
    }
    const u = new URL(req.url, 'http://x').searchParams.get('u') || '';
    let target;
    try { target = new URL(u); } catch { return send(res, 400, { error: 'url' }); }
    if (target.protocol !== 'https:' || !PHOTO_HOSTS.includes(target.hostname)) return send(res, 400, { error: 'url' });
    const r = await fetch(target, { headers: { 'User-Agent': PHOTO_UA } });
    if (!r.ok) return send(res, 502, { error: `photo ${r.status}` });
    const type = r.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) return send(res, 502, { error: 'type' });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_000_000) return send(res, 413, { error: 'too_large' });
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
