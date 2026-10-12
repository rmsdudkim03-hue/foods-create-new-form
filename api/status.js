// 지금 AI를 쓸 수 있는지 알려줌 (키가 없거나 접근 코드가 틀리면 화면은 데모 모드로 동작)
import { send, allowed } from './_lib.js';

export default function status(req, res) {
  send(res, 200, {
    live: Boolean(process.env.OPENAI_API_KEY && process.env.MESHY_API_KEY),
    // 실제 AI를 못 쓰는 이유 (화면 안내용. 키 값은 보내지 않음)
    missing: ['OPENAI_API_KEY', 'MESHY_API_KEY'].filter((k) => !process.env[k]),
    needsCode: Boolean(process.env.ACCESS_CODE),
    codeOk: allowed(req),
    cutout: Boolean(process.env.FAL_KEY), // 서버에서 배경 지우기 (없으면 브라우저에서)
  });
}
