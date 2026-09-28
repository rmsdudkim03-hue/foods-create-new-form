// 이미지 한 장 그리기 (OpenAI 이미지 모델)
// kind: 'food' → 음식 참고 이미지 (저가 모델), 'form' → 맛보기 조형 (고화질 모델)
import { handler, send, drawImage } from './_lib.js';

export default handler(async (req, res, body) => {
  const kind = body.kind === 'form' ? 'form' : 'food';
  const p = String(body.prompt || '').slice(0, 4000);
  if (!p) return send(res, 400, { error: 'empty' });
  send(res, 200, { image: await drawImage({ prompt: p, kind }) });
});
