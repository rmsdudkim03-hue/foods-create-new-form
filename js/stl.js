/* =========================================================
   3D 파일(GLB)을 3D 프린트용 STL로 바꿔서 내려받기 (갤러리 크게 보기의 'STL 다운로드')
   - 브라우저 안에서 바꿈 (서버·요금 없음)
   - 크기: 가장 긴 변을 100mm로 맞춤 (슬라이서에서 다시 바꿀 수 있음)
   - 바닥을 z=0에 놓고 가운데 정렬 (출력 프로그램에서 바로 쓰기 좋게)
   ========================================================= */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

const SIZE_MM = 100;

export async function downloadSTL(url, name = 'form') {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  // glTF는 위쪽이 y, STL(3D 프린트)은 위쪽이 z → x축으로 90도 돌림
  root.rotation.x = Math.PI / 2;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const k = SIZE_MM / Math.max(size.x, size.y, size.z, 1e-6);
  root.scale.setScalar(k);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  const c = b2.getCenter(new THREE.Vector3());
  root.position.set(-c.x, -c.y, -b2.min.z); // 가운데 + 바닥을 0에
  root.updateMatrixWorld(true);
  const data = new STLExporter().parse(root, { binary: true });
  const blob = new Blob([data], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[\\/:*?"<>|\s]+/g, '_') || 'form'}.stl`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
