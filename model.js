// ③ 3D 변환 (Meshy)
// POST { image }  → 변환 시작, { taskId } 반환
// GET  ?id=...    → 진행 상황 { status, progress }
// (선택) ③-1 이미지 정리 단계는 테스트 후 필요하면 추가. 프롬프트 원문: prompts/3-to-3d.md
import { send, readJSON, allowed, meshy, timed } from './_lib.js';
import { isImage } from './analyze.js';

export default async function model(req, res) {
  if (!process.env.MESHY_API_KEY) return send(res, 503, { error: 'no_key' });
  if (!allowed(req)) return send(res, 401, { error: 'access_code' });
  try {
    if (req.method === 'POST') {
      const { image } = await readJSON(req);
      if (!isImage(image)) return send(res, 400, { error: 'input' });
      const data = await timed('3D 변환 시작 요청', () => meshy('/image-to-3d', {
        method: 'POST',
        body: JSON.stringify({
          image_url: image,
          ai_model: process.env.MESHY_MODEL || 'latest',
          should_texture: false,          // 흰 무광이라 텍스처 없이 형태만 (크레딧 절약)
          should_remesh: true,
          topology: 'triangle',
          target_polycount: Number(process.env.MESHY_POLYCOUNT || 60000),
          target_formats: ['glb'],
          origin_at: 'center',
        }),
      }));
      return send(res, 200, { taskId: data.result });
    }
    if (req.method === 'GET') {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      if (!id || !/^[\w-]+$/.test(id)) return send(res, 400, { error: 'id' });
      const t = await meshy(`/image-to-3d/${id}`);
      return send(res, 200, {
        status: t.status,
        progress: t.progress ?? 0,
        glb: t.status === 'SUCCEEDED' ? t.model_urls?.glb || null : null,
        error: t.task_error?.message || null,
      });
    }
    send(res, 405, { error: 'method' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err).slice(0, 300) });
  }
}
