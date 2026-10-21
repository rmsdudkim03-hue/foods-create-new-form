// 조형 SVG에 마우스를 올리면 → 같은 모양의 3D 조형으로 바뀌며 빙글 돌아감
// 쓰는 법 (HTML):
//   <figure class="form3d" data-svg="forms/form_12.svg" data-model="forms/form_12.glb"></figure>
//   <script type="module" src="hover3d.js"></script>
// - SVG는 3D 조형을 '정면'에서 본 실루엣. 3D도 정면에서 시작해서 SVG와 딱 겹친 상태로 바뀜
// - 3D 색은 SVG 색을 그대로 씀 (data-color="#ffffff"로 바꿀 수 있음)
// - 마우스를 떼면 정면으로 돌아와서 다시 SVG로

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const SPIN = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.9;   // 돌아가는 빠르기 (1초에 몇 라디안. 6.28이면 1초에 한 바퀴). 움직임 줄이기 설정이면 돌지 않음
const FADE_MS = 450;       // SVG ↔ 3D 바뀌는 시간
const TILT = 0.32;         // 돌 때 위에서 내려다보는 정도 (라디안. 0이면 정면 그대로)
const PAD = 0.35;          // 3D 무대를 SVG보다 위아래·양옆으로 넓혀서 돌 때 잘리지 않게 (SVG 크기 대비)
const loader = new GLTFLoader();

async function setup(el) {
  // 1. SVG를 글자 그대로 넣음 (모양의 위치·크기를 재서 3D를 딱 맞추기 위해)
  const svgText = await (await fetch(el.dataset.svg)).text();
  const holder = document.createElement('div');
  holder.className = 'form3d-svg';
  holder.innerHTML = svgText;
  const svg = holder.querySelector('svg');
  svg.removeAttribute('width'); svg.removeAttribute('height');
  el.append(holder);
  const vb = svg.viewBox.baseVal;
  const shape = svg.querySelector('path, polygon, rect, circle, ellipse');
  const box = shape.getBBox();                                   // SVG 안에서 모양이 차지하는 칸
  const color = el.dataset.color || shape.getAttribute('fill') || '#ffffff';

  // 2. 3D 무대 (배경 투명)
  const canvas = document.createElement('canvas');
  canvas.className = 'form3d-gl';
  el.append(canvas);
  el.style.aspectRatio = `${vb.width} / ${vb.height}`;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5650, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-1, -2, 3);      // 왼쪽 앞 위에서 비춤
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.8);
  rim.position.set(2, 3, 1);
  scene.add(rim);

  // 3. 조형 불러오기 (Rhino STL처럼 Z가 위쪽인 모델 기준)
  const gltf = await loader.loadAsync(el.dataset.model);
  let geo = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !geo) geo = o.geometry; });
  geo = mergeVertices(geo);
  geo.computeVertexNormals();                                     // 매끈하게 보이도록
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
  geo.translate(-cx, -cy, 0);                                     // 세로축(가운데)을 중심으로 돌게
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, emissive: color, emissiveIntensity: 0.12 }));
  const pivot = new THREE.Group();
  pivot.add(mesh);
  scene.add(pivot);

  // 4. 정면 카메라: 모델의 가로(X)·높이(Z)가 SVG 속 모양 자리에 딱 맞게
  const w = bb.max.x - bb.min.x;
  const s = box.width / w;                                        // SVG 1칸 = 모델 몇 mm
  const left = -w / 2 - box.x / s;
  const zMid = (bb.min.z + bb.max.z) / 2, boxMid = box.y + box.height / 2;
  const top = zMid + boxMid / s;
  const px = PAD * vb.width / s, py = PAD * vb.height / s * 2;   // 넓힌 만큼 (세로는 더 넉넉히)
  const cam = new THREE.OrthographicCamera(left - px, left + vb.width / s + px, top + py, top - vb.height / s - py, 0.1, 5000);
  // 캔버스도 같은 비율로 넓힘 (가로는 양옆 PAD씩, 세로는 위아래 2×PAD씩)
  Object.assign(canvas.style, { left: `${-PAD * 100}%`, width: `${(1 + 2 * PAD) * 100}%`, top: `${-PAD * 200}%`, height: `${(1 + 4 * PAD) * 100}%` });
  cam.up.set(0, 0, 1);
  cam.position.set(0, -2000, 0);
  cam.lookAt(0, 0, 0);

  function resize() {
    const r = el.getBoundingClientRect();
    renderer.setSize(r.width * (1 + 2 * PAD), r.height * (1 + 4 * PAD), false);
  }
  resize();
  new ResizeObserver(resize).observe(el);

  // 5. 움직임: 올리면 SVG가 사라지며 3D가 돌기 시작, 떼면 정면으로 돌아와 SVG로
  let hover = false, angle = 0, speed = 0, mix = 0, tilt = 0, last = 0, running = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (hover) {
      speed += (SPIN - speed) * Math.min(1, dt * 3);             // 서서히 빨라짐
      angle += speed * dt;
      mix = Math.min(1, mix + dt * 1000 / FADE_MS);
      if (mix >= 1) tilt += (1 - tilt) * Math.min(1, dt * 2.5);  // 3D로 다 바뀐 뒤 살짝 기울임
    } else {
      tilt += (0 - tilt) * Math.min(1, dt * 6);
      // 가장 가까운 정면(한 바퀴 단위)으로 부드럽게 돌아옴
      const target = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
      angle += (target - angle) * Math.min(1, dt * 5);
      speed = 0;
      if (Math.abs(target - angle) < 0.01 && tilt < 0.01) {
        angle = target;
        mix = Math.max(0, mix - dt * 1000 / FADE_MS);
      }
    }
    pivot.rotation.set(TILT * tilt, 0, angle);   // 앞으로 기울인 뒤 세로축으로 돌림
    el.style.setProperty('--mix', mix.toFixed(3));
    renderer.render(scene, cam);
    if (hover || mix > 0) requestAnimationFrame(frame);
    else running = false;
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  el.addEventListener('pointerenter', () => { hover = true; start(); });
  el.addEventListener('pointerleave', () => { hover = false; start(); });
  el.classList.add('ready');
}

document.querySelectorAll('.form3d').forEach((el) => setup(el).catch((err) => console.warn('3D 조형을 불러오지 못했어요', err)));
