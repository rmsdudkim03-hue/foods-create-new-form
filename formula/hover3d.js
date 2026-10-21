// 조형 SVG에 마우스를 올리면 → 같은 모양의 3D 조형으로 바뀌며 빙글 돌아감
// 쓰는 법 (HTML):
//   <figure class="form3d" data-svg="forms/form_12.svg" data-model="forms/form_12.glb"></figure>
//   <script type="module" src="hover3d.js"></script>
// - SVG는 3D 조형을 '정면'에서 본 실루엣. 3D도 정면에서 시작해서 SVG와 딱 겹친 상태로 바뀜
// - 3D 질감은 data-material로 고름 (아래 MATERIALS). 색만 바꾸려면 data-color="#ffffff"
// - 마우스를 떼면 정면으로 돌아와서 다시 SVG로

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 3D 질감 후보 (data-material="이름"). color가 'svg'면 SVG 색을 씀
//  roughness: 0 매끈·반짝 ~ 1 거칠·무광 / clearcoat: 겉에 유약 한 겹 (0~1) / sheen: 부드러운 천·벨벳 느낌 (0~1)
const MATERIALS = {
  'pantone-602c': { color: '#E6D35A', roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3 },   // 실제 도색: 팬톤 602 C 유광 (화면용 근사색, 은은한 반광 렌더)
  'porcelain':   { color: '#f4f2ed', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 },   // 흰 유광 도자기
  'matte-white': { color: '#eeece6', roughness: 0.68, sheen: 0.4, sheenColor: '#ffffff' },          // 흰 무광 (석고·세라믹 비스크)
  'svg-glaze':   { color: 'svg', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },            // SVG 색 + 유약
  'svg-matte':   { color: 'svg', roughness: 0.7, sheen: 0.3, sheenColor: '#ffffff' },                // SVG 색 무광
  'cream':       { color: '#e9e2d3', roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.35 },   // 웹 글자색에 맞춘 미색 반무광
};
const DEFAULT_MATERIAL = 'pantone-602c';

const SPIN = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.9;   // 돌아가는 빠르기 (1초에 몇 라디안. 6.28이면 1초에 한 바퀴). 움직임 줄이기 설정이면 돌지 않음
const FADE_MS = 450;       // SVG ↔ 3D 바뀌는 시간
const TILT = 0.45;         // 돌 때 위에서 내려다보는 정도 (라디안. 0이면 정면 그대로)
const FOV = 14;           // 카메라 화각(도). 작을수록 평면적, 클수록 원근이 강함
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
  const svgColor = shape.getAttribute('fill') || '#ffffff';
  const preset = MATERIALS[el.dataset.material] || MATERIALS[DEFAULT_MATERIAL];
  const color = el.dataset.color || (preset.color === 'svg' ? svgColor : preset.color);
  // 평면 SVG도 3D와 같은 색으로 칠해서 바뀔 때 색이 튀지 않게 (원래 SVG 색을 쓰려면 data-keep-svg-color)
  if (!('keepSvgColor' in el.dataset)) shape.setAttribute('fill', color);

  // 2. 3D 무대 (배경 투명)
  const canvas = document.createElement('canvas');
  canvas.className = 'form3d-gl';
  el.append(canvas);
  el.style.aspectRatio = `${vb.width} / ${vb.height}`;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;               // 흰색이 날아가지 않게 부드럽게
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;                             // 조형 스스로 드리우는 부드러운 그림자
  renderer.shadowMap.type = THREE.VSMShadowMap;                  // 가장자리가 흐린 그림자
  const scene = new THREE.Scene();
  // 사진 스튜디오 같은 주변 빛 (반사·은은한 밝기)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const key = new THREE.DirectionalLight(0xffffff, 2.6);         // 왼쪽 위에서 비추는 주 조명
  key.position.set(-160, -90, 260);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 10;
  key.shadow.blurSamples = 16;
  key.shadow.intensity = 0.5;                                   // 그림자를 너무 진하지 않게
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.6;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);       // 오른쪽 뒤에서 윤곽을 살리는 빛
  fill.position.set(160, 140, 80);
  scene.add(fill);

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
  const { color: _c, ...look } = preset;
  // 모델에 구워 둔 앰비언트 오클루전(오목한 곳이 어두워지는 정도)을 꼭짓점 색으로 곱함
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ ...look, color, metalness: 0, vertexColors: !!geo.attributes.color }));
  mesh.castShadow = mesh.receiveShadow = true;
  // 그림자 범위를 조형 크기에 맞춤
  const r = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
  Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 1000 });
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
  // 원근 카메라 (좁은 화각으로 멀리서 → 정면은 SVG와 거의 같고, 돌 때는 원근감이 생김)
  const fL = left - px, fR = left + vb.width / s + px, fT = top + py, fB = top - vb.height / s - py;
  const H = fT - fB, dist = H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const cam = new THREE.PerspectiveCamera(FOV, (fR - fL) / H, 1, dist * 4);
  const aim = new THREE.Vector3((fL + fR) / 2, 0, (fT + fB) / 2);
  // 캔버스도 같은 비율로 넓힘 (가로는 양옆 PAD씩, 세로는 위아래 2×PAD씩)
  Object.assign(canvas.style, { left: `${-PAD * 100}%`, width: `${(1 + 2 * PAD) * 100}%`, top: `${-PAD * 200}%`, height: `${(1 + 4 * PAD) * 100}%` });
  cam.up.set(0, 0, 1);
  cam.position.set(aim.x, -dist, aim.z);
  cam.lookAt(aim);

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
