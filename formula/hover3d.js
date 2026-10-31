// 조형 SVG에 마우스를 올리면 → 같은 모양의 3D 조형으로 바뀌며 빙글 돌아감
// 쓰는 법 (HTML):
//   <figure class="form3d" data-svg="forms/form_12.svg" data-model="forms/form_12.glb"></figure>
//   data-model이 없으면 SVG만 보여줌, data-fit이면 SVG 여백을 잘라 모양을 칸에 꽉 채움
//   data-face="top": SVG가 '위에서 본 모양'인 조형 (트레이처럼). 위에서 내려다보다가 비스듬히 세워지며 돎
//   data-blend: SVG와 3D 윤곽이 조금 다를 때, 바꿔 끼우지 않고 0.35초 동안 겹쳐서 바꿈
//   GLB에 모프 타깃이 있으면(unfold_glb.py로 만든 '펼친 → 접힌' 조형) 입체가 되며 모양도 접힘
//   data-auto: 마우스 없이 바로 입체가 되어 계속 돎 (히스토리 마지막 장). data-spin="0.35"로 빠르기(1초에 몇 라디안)
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
const VOL_MS = 600;        // 평면 → 입체로 바뀌는 시간 (빛·그늘·원근·기울기가 함께). 예전 1.1초 → 빠르게
const TILT = 0.45;         // 돌 때 위에서 내려다보는 정도 (라디안. 0이면 정면 그대로)
const FOV = 14;           // 카메라 화각(도). 작을수록 평면적, 클수록 원근이 강함
const BLEND_MS = 180;      // data-blend: SVG ↔ 3D 겹쳐 바뀌는 시간
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
  // data-fit: SVG 여백을 잘라 모양이 칸(figure)에 꽉 차게 (피그마에서 잰 조형 크기에 그대로 맞출 때)
  if ('fit' in el.dataset) svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  el.style.setProperty('--ar', (box.width / box.height).toFixed(4));   // 칸 비율을 모양에 맞출 때 씀 (히스토리)
  // 3D 파일이 아직 없는 조형은 평면 SVG만 (원래 색 그대로)
  if (!el.dataset.model) { el.classList.add('ready'); return; }
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
  const morph = !!geo.morphAttributes.position?.length;           // 펼친 모양 → 접힌 모양으로 바뀌는 조형
  if (!morph && !geo.index) geo = mergeVertices(geo);             // 꼭짓점 합치기 (GLB가 이미 합쳐져 있으면 건너뜀 — 무거운 계산이라 화면이 멈춤)
  const topView = el.dataset.face === 'top';
  if (topView) geo.rotateX(Math.PI / 2);                              // 윗면이 카메라(정면)를 보게 눕힘 → SVG(위에서 본 모양)와 같음
  if (!geo.attributes.normal) geo.computeVertexNormals();         // 매끈하게 보이도록 (GLB에 미리 넣어 둔 NORMAL이 있으면 그대로 씀, tools/bake_normals.py)
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

  // 기울 때 줄어드는 정도: 깊이(앞뒤) ÷ 높이가 클수록(납작하고 넓을수록) 위에서 보이는 바닥면이 커지니까 더 줄임
  const depthRatio = (bb.max.y - bb.min.y) / (bb.max.z - bb.min.z);
  // 위에서 본 조형은 세워지면 높이만큼 커 보이니까 처음 크기에 맞게 줄임
  const zoom = topView
    ? 1 - Math.min(1, (bb.max.z - bb.min.z) / ((bb.max.y - bb.min.y) * Math.cos(TILT) + (bb.max.z - bb.min.z) * Math.sin(TILT)))
    : Math.min(ZOOM_OUT, 0.07 * depthRatio);
  // 다 기울었을 때 각도: 정면 조형은 위가 살짝 앞으로(TILT), 위에서 본 조형은 누워 있다가 TILT만큼 내려다보는 각도로 세워짐
  const tiltEnd = topView ? -(Math.PI / 2 - TILT) : TILT;
  // 돌고 기울 때 조형이 차지하는 범위 (무대가 이보다 좁으면 잘리니까 넓힘)
  //  돌아가는 축에서 가장 먼 점까지 거리(r) + 높이의 절반(hz)을 기울인 만큼
  const pos = geo.attributes.position, dpos = morph ? geo.morphAttributes.position[0] : null;
  let rMax = 0, hMax = 0;
  for (let i = 0; i < pos.count; i++) for (const k of morph ? [0, 1] : [0]) {
    const x = pos.getX(i) + (k ? dpos.getX(i) : 0), y = pos.getY(i) + (k ? dpos.getY(i) : 0), z = pos.getZ(i) + (k ? dpos.getZ(i) : 0) - zc;
    rMax = Math.max(rMax, topView ? Math.hypot(x, z) : Math.hypot(x, y));
    hMax = Math.max(hMax, Math.abs(topView ? y : z));
  }
  const sc = (1 - zoom) * 1.1;                                    // 다 기울었을 때 크기 + 원근으로 가까운 쪽이 커지는 만큼 여유
  const needX = rMax * sc, needZ = (hMax * Math.cos(TILT) + rMax * Math.sin(TILT)) * sc;

  // 4. 카메라: 모델의 가로(X)·높이(Z)가 SVG 속 모양 자리에 딱 맞게
  const w = bb.max.x - bb.min.x;
  const s = box.width / w;                                        // SVG 1칸 = 모델 몇 mm
  const left = -w / 2 - (box.x - vb.x) / s;                      // 화면 왼쪽 끝(SVG viewBox 왼쪽)의 3D 위치
  const zMid = (bb.min.z + bb.max.z) / 2, boxMid = box.y + box.height / 2;
  const top = zMid + (boxMid - vb.y) / s;
  // 넓힌 만큼: 기본 PAD(세로는 2배), 돌 때 조형이 더 멀리 나가면 그만큼 더
  const halfW = vb.width / s / 2, halfH = vb.height / s / 2;
  const px = Math.max(PAD * vb.width / s, needX + Math.abs(left + halfW) - halfW);
  const py = Math.max(PAD * vb.height / s * 2, needZ + Math.abs(top - halfH - zc) - halfH);
  const fx = px * s / vb.width, fy = py * s / vb.height;          // 캔버스를 SVG 칸보다 넓히는 비율
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
  // 캔버스도 같은 비율로 넓힘
  Object.assign(canvas.style, { left: `${-fx * 100}%`, width: `${(1 + 2 * fx) * 100}%`, top: `${-fy * 100}%`, height: `${(1 + 2 * fy) * 100}%` });

  function resize() {
    const r = el.getBoundingClientRect();
    renderer.setSize(r.width * (1 + 2 * fx), r.height * (1 + 2 * fy), false);
  }
  resize();
  new ResizeObserver(resize).observe(el);

  const blend = 'blend' in el.dataset;
  const volMs = +el.dataset.ms || VOL_MS;
  const auto = 'auto' in el.dataset;
  const spin = SPIN && el.dataset.spin ? +el.dataset.spin : SPIN;                          // data-ms로 조형마다 입체가 되는 시간을 바꿀 수 있음 (접히는 조형은 천천히)

  // 5. 움직임
  //  올리면: SVG와 똑같은 평면 3D로 바꿔 끼움 → 빛·그늘이 서서히 생기며(vol) 원근·기울기가 같이 들어옴 → 돌기 시작
  //  떼면: 정면으로 돌아옴 → 기울기·원근·그늘이 빠지며 평면으로 → SVG로 바꿔 끼움
  const ease = (t) => t * t * (3 - 2 * t);
  let hover = false, angle = 0, speed = 0, vol = 0, mix = 0, last = 0, running = false;
  // 저절로 도는 조형(히스토리 마지막 장)은 그 장이 보일 때만 그림. 안 보이는 장에서 계속 그리면
  // 다른 장(Extract 구슬 등)의 마우스 반응이 느려짐
  const hostStep = el.closest('.pr-step');
  const shown = () => !document.hidden && (!hostStep || hostStep.classList.contains('on'));
  function frame(now) {
    if (auto && !shown()) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (hover && blend && mix < 1) {
      mix = Math.min(1, mix + dt * 1000 / BLEND_MS);               // 먼저 SVG → 평면 3D로 겹쳐 바뀜
    } else if (hover) {
      vol = Math.min(1, vol + dt * 1000 / volMs);
      if (vol > 0.25) {                                            // 입체가 조금 생기면 바로 돌기 시작
        speed += (spin - speed) * Math.min(1, dt * 4);
        angle += speed * dt;
      }
    } else {
      speed = 0;
      const target = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;   // 가장 가까운 정면
      angle += (target - angle) * Math.min(1, dt * 8);
      if (Math.abs(target - angle) < 0.02) {
        angle = target;
        if (vol > 0) vol = Math.max(0, vol - dt * 1000 / volMs);
        else mix = Math.max(0, mix - dt * 1000 / BLEND_MS);         // 평면이 되면 다시 SVG로 겹쳐 바뀜
      }
    }
    const v = ease(vol);
    flat.material.opacity = 1 - v;                                 // 평면 막이 걷힘
    flat.visible = v < 1;
    lens(v);                                                       // 평면 렌즈 → 원근 렌즈
    // 기울인 뒤 조형의 세로축으로 돌림 (위에서 본 조형은 누운 상태라 세로축이 Y)
    pivot.rotation.set(tiltEnd * v, topView ? angle : 0, topView ? 0 : angle);
    if (morph) mesh.morphTargetInfluences[0] = flat.morphTargetInfluences[0] = v;   // 펼친 판이 접힘
    pivot.scale.setScalar(1 - zoom * v);                           // 기울면 바닥면이 보이며 커지니까 그만큼 살짝 줄임
    renderer.render(scene, cam);
    const on = hover || vol > 0 || mix > 0;
    // 3D가 그려진 뒤 SVG와 바꿔 끼움 (모양이 같아서 티가 안 남). data-blend면 겹쳐서 천천히
    el.style.setProperty('--mix', blend ? mix : on ? 1 : 0);
    if (on) requestAnimationFrame(frame);
    else running = false;
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  if (auto) {
    hover = true; start();
    const wake = () => { if (shown()) start(); };
    if (hostStep) new MutationObserver(wake).observe(hostStep, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', wake);
  }                             // 저절로: 바로 입체가 되어 계속 돎
  else {
    el.addEventListener('pointerenter', () => { hover = true; start(); });
    el.addEventListener('pointerleave', () => { hover = false; start(); });
    if (el.matches(':hover')) { hover = true; start(); }            // 준비되는 동안 이미 마우스가 올라가 있었으면 바로 시작
  }
  // 그리는 프로그램(셰이더)을 미리 준비해 둠 → 처음 마우스를 올렸을 때 멈칫하지 않게 (가능하면 화면을 멈추지 않고 따로 준비)
  await (renderer.compileAsync ? renderer.compileAsync(scene, cam) : Promise.resolve(renderer.compile(scene, cam)));
  el.classList.add('ready');
}

// 3D 조형(8개, 약 20MB)은 첫 화면 모션이 끝난 뒤에 하나씩 불러옴
// (처음 열자마자 한꺼번에 불러오면 로고 해독 모션이 버벅임)
// 시작: 첫 화면 모션이 끝날 때쯤(LOAD_AFTER) 또는 조형 화면이 가까워지면(스크롤이 빠를 때) 중 먼저 오는 쪽
const LOAD_AFTER = 11000;  // ms — 맨 처음 화면 → 로고 해독 → 흰 화면 전환이 다 끝난 뒤 (그 전에 준비하면 모션이 뚝뚝 끊김)
let loading = false;
// 브라우저가 한가할 때까지 기다림 (최대 1.5초)
const idle = () => new Promise((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 1500 }) : setTimeout(r, 200)));
async function loadAll() {
  if (loading) return;
  loading = true;
  for (const el of document.querySelectorAll('.form3d')) {
    if (el._prep) continue;                         // 마우스를 올려서 이미 준비 중이면 건너뜀
    await idle();                                   // 브라우저가 한가할 때 하나씩 (스크롤·모션 중이면 기다림)
    await prep(el);
  }
}
// 조형 하나 준비 (한 번만)
const prep = (el) => (el._prep ||= setup(el).catch((err) => console.warn('3D 조형을 불러오지 못했어요', err)));
// 아직 준비 안 된 조형에 마우스를 올리면 기다리지 않고 그 조형부터 바로 준비
document.querySelectorAll('.form3d[data-model]').forEach((el) => el.addEventListener('pointerenter', () => prep(el), { once: true }));
// 확인용 작은 미리보기(check.html의 ?thumb)는 3D를 불러오지 않고 SVG만 (미리보기가 여러 개라 무거워짐)
if (/[?&]thumb\b/.test(location.search)) document.querySelectorAll('.form3d').forEach((el) => delete el.dataset.model);
const formsSec = document.querySelector('.forms');
if (formsSec && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); loadAll(); } }, { rootMargin: '0px 0px 50% 0px' });
  io.observe(formsSec);
  setTimeout(loadAll, LOAD_AFTER);
} else loadAll();
