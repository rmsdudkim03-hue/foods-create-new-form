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
  'pantone-602c': { color: '#E9D862', roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.3, sheenRoughness: 0.5, sheenColor: '#e6dfff' },   // 실제 도색: 팬톤 602 C 유광 (화면용 근사색, 은은한 반광 렌더)
  'svg-satin':   { color: 'svg', roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.3, sheenRoughness: 0.5, sheenColor: '#e6dfff' },   // 602C와 같은 반광 렌더 + SVG 색 (조형마다 색이 다를 때)
  'porcelain':   { color: '#f4f2ed', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 },   // 흰 유광 도자기
  'matte-white': { color: '#eeece6', roughness: 0.68, sheen: 0.4, sheenColor: '#ffffff' },          // 흰 무광 (석고·세라믹 비스크)
  'svg-glaze':   { color: 'svg', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },            // SVG 색 + 유약
  'svg-matte':   { color: 'svg', roughness: 0.7, sheen: 0.3, sheenColor: '#ffffff' },                // SVG 색 무광
  'cream':       { color: '#e9e2d3', roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.35 },   // 웹 글자색에 맞춘 미색 반무광
};
const DEFAULT_MATERIAL = 'pantone-602c';
const AO_STRENGTH = 0.32;     // 오목한 곳 그늘 진하기 (0 없음 ~ 1 구운 그대로)
const COOL = '#e3dbff';       // 반사광·그늘 쪽에 아주아주 살짝 섞는 보색(노랑의 반대쪽 = 아주 연한 보라)

const SPIN = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.9;   // 돌아가는 빠르기 (1초에 몇 라디안. 6.28이면 1초에 한 바퀴). 움직임 줄이기 설정이면 돌지 않음
const ZOOM_OUT = 0.2;      // 입체가 되며 위에서 보이는 바닥면만큼 조금 작아지게 (최대값. 납작하고 넓은 조형일수록 많이, 세로로 긴 조형은 거의 안 줄어듦)
const VOL_MS = 1100;       // 평면 → 입체로 바뀌는 시간 (빛·그늘·원근·기울기가 함께)
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
  scene.environmentIntensity = 1.15;
  const key = new THREE.DirectionalLight(0xfffaf0, 2.0);         // 왼쪽 위에서 비추는 주 조명
  key.position.set(-160, -90, 260);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 10;
  key.shadow.blurSamples = 16;
  key.shadow.intensity = 0.18;                                  // 그림자를 너무 진하지 않게
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.6;
  scene.add(key);
  // 오른쪽 뒤에서 가장자리를 스치는 연보라 빛 → 유광 반사(하이라이트)에 보라가 살짝 맺힘
  // (노란 표면에 보라 빛을 그냥 비추면 섞여서 회색이 되니까, 반사로만 보이게 뒤쪽에서)
  const fill = new THREE.DirectionalLight(COOL, 0.8);
  fill.position.set(170, 230, 110);
  scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xfff8ea, COOL, 0.85));    // 중간톤을 채우는 은은한 빛 (아래쪽 그늘은 살짝 연보라)

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
  // 구워 둔 그늘을 AO_STRENGTH만큼만 (검게 꺼지지 않게)
  const ao = geo.attributes.color;
  if (ao) for (let i = 0; i < ao.count; i++) {
    const v = 1 - (1 - ao.getX(i)) * AO_STRENGTH;
    ao.setXYZ(i, v, v, v);
  }
  // 모델에 구워 둔 앰비언트 오클루전(오목한 곳이 어두워지는 정도)을 꼭짓점 색으로 곱함
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ ...look, color, metalness: 0, vertexColors: !!geo.attributes.color }));
  mesh.castShadow = mesh.receiveShadow = true;
  // 그림자 범위를 조형 크기에 맞춤
  const r = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
  Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 1000 });
  const pivot = new THREE.Group();
  pivot.add(mesh);
  scene.add(pivot);

  // 처음엔 빛 없이 평면 색만 보이게 덮는 막 (SVG와 똑같은 색·모양) → 서서히 걷히며 입체가 드러남
  const flat = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth, toneMapped: false,
  }));
  flat.renderOrder = 1;
  pivot.add(flat);
  // 기울기 중심을 조형 높이의 가운데로 (바닥 기준으로 기울면 아래로 쏠려 보임)
  const zc = (bb.min.z + bb.max.z) / 2;
  pivot.position.z = zc;
  mesh.position.z = flat.position.z = -zc;

  // 4. 카메라: 모델의 가로(X)·높이(Z)가 SVG 속 모양 자리에 딱 맞게
  const w = bb.max.x - bb.min.x;
  const s = box.width / w;                                        // SVG 1칸 = 모델 몇 mm
  const left = -w / 2 - box.x / s;
  const zMid = (bb.min.z + bb.max.z) / 2, boxMid = box.y + box.height / 2;
  const top = zMid + boxMid / s;
  const px = PAD * vb.width / s, py = PAD * vb.height / s * 2;   // 넓힌 만큼 (세로는 더 넉넉히)
  const fL = left - px, fR = left + vb.width / s + px, fT = top + py, fB = top - vb.height / s - py;
  const W = fR - fL, H = fT - fB, dist = H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const aim = new THREE.Vector3((fL + fR) / 2, 0, (fT + fB) / 2);
  // 같은 자리에서 보는 두 렌즈: 평면(직교, SVG와 픽셀까지 같음) ↔ 원근(좁은 화각)
  const cam = new THREE.PerspectiveCamera(FOV, W / H, 1, dist * 4);
  const ortho = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, dist * 4);
  for (const c of [cam, ortho]) { c.up.set(0, 0, 1); c.position.set(aim.x, -dist, aim.z); c.lookAt(aim); c.updateProjectionMatrix(); }
  const P_FLAT = ortho.projectionMatrix.clone(), P_DEEP = cam.projectionMatrix.clone();
  function lens(t) {
    // 두 렌즈를 t만큼 섞음 (가운데 높이의 크기는 그대로, 원근만 서서히 생김)
    const e = cam.projectionMatrix.elements, a = P_FLAT.elements, b = P_DEEP.elements;
    for (let i = 0; i < 16; i++) e[i] = a[i] + (b[i] - a[i]) * t;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
  // 캔버스도 같은 비율로 넓힘 (가로는 양옆 PAD씩, 세로는 위아래 2×PAD씩)
  Object.assign(canvas.style, { left: `${-PAD * 100}%`, width: `${(1 + 2 * PAD) * 100}%`, top: `${-PAD * 200}%`, height: `${(1 + 4 * PAD) * 100}%` });

  function resize() {
    const r = el.getBoundingClientRect();
    renderer.setSize(r.width * (1 + 2 * PAD), r.height * (1 + 4 * PAD), false);
  }
  resize();
  new ResizeObserver(resize).observe(el);

  // 기울 때 줄어드는 정도: 깊이(앞뒤) ÷ 높이가 클수록(납작하고 넓을수록) 위에서 보이는 바닥면이 커지니까 더 줄임
  const depthRatio = (bb.max.y - bb.min.y) / (bb.max.z - bb.min.z);
  const zoom = Math.min(ZOOM_OUT, 0.07 * depthRatio);

  // 5. 움직임
  //  올리면: SVG와 똑같은 평면 3D로 바꿔 끼움 → 빛·그늘이 서서히 생기며(vol) 원근·기울기가 같이 들어옴 → 돌기 시작
  //  떼면: 정면으로 돌아옴 → 기울기·원근·그늘이 빠지며 평면으로 → SVG로 바꿔 끼움
  const ease = (t) => t * t * (3 - 2 * t);
  let hover = false, angle = 0, speed = 0, vol = 0, last = 0, running = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (hover) {
      vol = Math.min(1, vol + dt * 1000 / VOL_MS);
      if (vol > 0.45) {                                            // 입체가 반쯤 생기면 돌기 시작
        speed += (SPIN - speed) * Math.min(1, dt * 2);
        angle += speed * dt;
      }
    } else {
      speed = 0;
      const target = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;   // 가장 가까운 정면
      angle += (target - angle) * Math.min(1, dt * 5);
      if (Math.abs(target - angle) < 0.02) {
        angle = target;
        vol = Math.max(0, vol - dt * 1000 / VOL_MS);
      }
    }
    const v = ease(vol);
    flat.material.opacity = 1 - v;                                 // 평면 막이 걷힘
    flat.visible = v < 1;
    lens(v);                                                       // 평면 렌즈 → 원근 렌즈
    pivot.rotation.set(TILT * v, 0, angle);                        // 앞으로 기울인 뒤 세로축으로 돌림
    pivot.scale.setScalar(1 - zoom * v);                           // 기울면 바닥면이 보이며 커지니까 그만큼 살짝 줄임
    renderer.render(scene, cam);
    const on = hover || vol > 0;
    el.style.setProperty('--mix', on ? 1 : 0);                     // 3D가 그려진 뒤 SVG와 바꿔 끼움 (모양이 같아서 티가 안 남)
    if (on) requestAnimationFrame(frame);
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
