// 사진 배경 지우기 (서버에서 전문 AI로: fal.ai의 BiRefNet)
// POST { image: 'data:image/jpeg;base64,...' (화면에서 1024px 이하로 줄인 사진) }
//   → { image: 'data:image/png;base64,...' (배경이 투명한 사진) }
// FAL_KEY가 없으면 503 → 화면은 브라우저 안에서 지우는 예전 방식으로 대신함
import { handler, send } from './_lib.js';

const FAL = process.env.FAL_BASE || 'https://fal.run';
const MODEL = process.env.CUTOUT_MODEL || 'fal-ai/birefnet/v2';

export default handler(async (req, res, body) => {
  if (!process.env.FAL_KEY) return send(res, 503, { error: 'no_key' });
  const image = String(body.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 3_000_000) return send(res, 400, { error: 'input' });
  const t0 = Date.now();
  const r = await fetch(`${FAL}/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: image,
      model: 'General Use (Light)',      // 빠르고 일반 사진에 맞는 설정
      operating_resolution: '1024x1024',
      output_format: 'png',
      refine_foreground: true,            // 가장자리 색 번짐 정리
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`fal ${r.status}: ${data.detail?.[0]?.msg || data.detail || data.error || 'error'}`);
  const url = data.image?.url;
  if (!url) throw new Error('fal: 빈 응답');
  // 결과 사진을 받아서 그대로 돌려줌 (다른 사이트 사진은 화면에서 픽셀을 못 읽을 수 있어서)
  const out = url.startsWith('data:') ? url : await fetch(url).then(async (x) => {
    if (!x.ok) throw new Error(`fal 결과 ${x.status}`);
    return `data:${x.headers.get('content-type') || 'image/png'};base64,${Buffer.from(await x.arrayBuffer()).toString('base64')}`;
  });
  console.log(`[시간] 배경 제거 (fal BiRefNet): ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  console.log('[토큰] 배경 제거 (fal BiRefNet) 1장');
  send(res, 200, { image: out });
});
