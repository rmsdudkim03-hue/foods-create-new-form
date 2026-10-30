# GLB에 매끈한 곡면 방향(NORMAL)을 미리 계산해 넣기
#  - 사이트가 열릴 때마다 브라우저가 이 계산을 하면 조형 하나에 0.3~0.9초씩 화면이 멈춤 → 미리 파일에 넣어 둠
#  - three.js의 computeVertexNormals와 같은 방식(면 넓이만큼 가중해서 더한 뒤 길이 1로)
#  - 쓰는 법: python3 formula/tools/bake_normals.py formula/forms/no_03.glb [다른 파일...]
#    이미 NORMAL이 있는 파일(모프 조형 no_05 등)은 건드리지 않음
import json, struct, sys
import numpy as np

def bake(path):
    b = open(path, 'rb').read()
    jlen = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack('<I', b[off:off + 4])[0]
    bin_ = bytearray(b[off + 8: off + 8 + blen])
    prim = j['meshes'][0]['primitives'][0]
    if 'NORMAL' in prim['attributes']:
        print(path, '이미 NORMAL 있음 — 건너뜀'); return

    def read(ai):
        a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]
        comp = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        arr = np.frombuffer(bin_, dtype=comp, count=a['count'] * n, offset=start)
        return arr.reshape(-1, n) if n > 1 else arr

    pos = read(prim['attributes']['POSITION']).astype(np.float64)
    idx = read(prim['indices']).astype(np.int64).reshape(-1, 3)
    a, b2, c = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(c - b2, a - b2)                     # three.js와 같은 순서 (넓이 가중)
    nrm = np.zeros_like(pos)
    for k in range(3): np.add.at(nrm, idx[:, k], fn)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True); ln[ln == 0] = 1
    nrm = (nrm / ln).astype(np.float32)

    # 새 데이터를 BIN 끝에 붙임 (4바이트 정렬)
    while len(bin_) % 4: bin_.append(0)
    start = len(bin_); data = nrm.tobytes(); bin_ += data
    j['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(data), 'target': 34962})
    j['accessors'].append({'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': len(nrm), 'type': 'VEC3'})
    prim['attributes']['NORMAL'] = len(j['accessors']) - 1
    j['buffers'][0]['byteLength'] = len(bin_)

    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(bin_) % 4: bin_.append(0)
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(bin_))
    out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(bin_)) + b'BIN\x00' + bytes(bin_)
    open(path, 'wb').write(out)
    print(path, 'NORMAL 넣음', len(nrm))

for p in sys.argv[1:]: bake(p)
