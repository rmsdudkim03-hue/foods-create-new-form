// 완성된 3D 파일(.glb)을 우리 주소로 전달 (다른 사이트 파일을 브라우저가 막는 경우 대비)
import { send, meshy } from './_lib.js';

export default async function modelFile(req, res) {
  if (!process.env.MESHY_API_KEY) return send(res, 503, { error: 'no_key' });
  try {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    if (!id || !/^[\w-]+$/.test(id)) return send(res, 400, { error: 'id' });
    const t = await meshy(`/image-to-3d/${id}`);
    const url = t.model_urls?.glb;
    if (t.status !== 'SUCCEEDED' || !url) return send(res, 409, { error: 'not_ready' });
    const r = await fetch(url);
    if (!r.ok) throw new Error(`glb ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4_400_000) return send(res, 413, { error: 'too_large', url });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(buf);
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err).slice(0, 300) });
  }
}
