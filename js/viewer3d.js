/* =========================================================
   3D 뷰어 (three.js)
   .glb 파일을 불러와서 천천히 돌려 보여주고, 드래그하면 직접 돌려볼 수 있어.
   재질 색·밝기는 아래 MATERIAL 부분에서 바꾸면 돼.
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createViewer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  container.prepend(renderer.domElement);
  renderer.domElement.style.opacity = '0';

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;

  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-2, 3, 2.5);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.001, 100);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.rotateSpeed = 0.8;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  let resumeTimer;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resumeTimer); });
  controls.addEventListener('end', () => { resumeTimer = setTimeout(() => (controls.autoRotate = true), 2500); });

  // MATERIAL: 조형 재질 (피그마 렌더처럼 무광 회색)
  const material = new THREE.MeshStandardMaterial({ color: 0xcfcfcf, roughness: 0.55, metalness: 0 });
  // 컬러 재질: 두 음식의 대표색이 아래(A)에서 위(B)로 부드럽게 이어짐 (점마다 색을 칠함)
  const tinted = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0 });
  const PASTEL = 0.3; // 흰색을 섞는 정도 (0 = 원래 색 그대로, 1 = 흰색)
  let tint = null;

  const loader = new GLTFLoader();
  let model = null;
  let loadedUrl = null;
  let running = false;
  let raf = 0;

  function fit() {
    if (!model) return;
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = (sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * 0.9;
    camera.position.set(0, sphere.radius * 0.25, dist);
    camera.near = dist / 100;
    camera.far = dist * 10;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = dist * 0.55;
    controls.maxDistance = dist * 1.8;
    controls.update();
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
  }
  new ResizeObserver(resize).observe(container);

  async function load(url) {
    if (url === loadedUrl && model) return;
    let gltf;
    if (url.endsWith('.json')) {
      // 미리보기 페이지용: .glb를 JSON 안에 담아둔 경우
      const { glb } = await (await fetch(url)).json();
      const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
      gltf = await loader.parseAsync(bytes.buffer, '');
    } else {
      gltf = await loader.loadAsync(url);
    }
    if (model) scene.remove(model);
    const obj = gltf.scene;
    obj.traverse((o) => { if (o.isMesh) o.material = material; });
    const center = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    obj.position.sub(center); // 조형 중심을 화면 가운데로
    model = new THREE.Group();
    model.add(obj);
    scene.add(model);
    loadedUrl = url;
    applyTint();
    resize();
  }

  // 색 입히기: setColors('rgb(..)', 'rgb(..)') → 컬러, setColors(null) → 흰 무광
  function applyTint() {
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model);
    const span = box.max.y - box.min.y || 1;
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (!tint) { o.material = material; return; }
      const pos = o.geometry.attributes.position;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const t = THREE.MathUtils.smoothstep((v.y - box.min.y) / span, 0.1, 0.9);
        c.copy(tint[0]).lerp(tint[1], t);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      o.material = tinted;
    });
  }
  function setColors(a, b) {
    const white = new THREE.Color(0xffffff);
    tint = a && b ? [a, b].map((x) => new THREE.Color(x).lerp(white, PASTEL)) : null;
    applyTint();
  }

  function tick() {
    if (!running) return;
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  function start() { if (running) return; running = true; resize(); tick(); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function setVisible(v) { renderer.domElement.style.opacity = v ? '1' : '0'; }

  return { load, start, stop, setVisible, setColors };
}
