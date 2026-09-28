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
    resize();
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

  return { load, start, stop, setVisible };
}
