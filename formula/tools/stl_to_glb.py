# STL(Rhino 등에서 내보낸 조형) → 웹용 GLB 변환
#  - 같은 자리 꼭짓점을 합쳐서 용량을 줄임 (STL은 꼭짓점이 여러 번 반복 저장됨)
#  - 앰비언트 오클루전(오목한 곳이 어두워지는 정도)을 미리 계산해서 꼭짓점 색(COLOR_0)으로 넣음
#    → 웹에서는 hover3d.js가 이 그늘을 AO_STRENGTH만큼만 곱해서 씀
#
# 쓰는 법:
#   pip install trimesh embreex rtree numpy   (+ STEP 파일이면 cascadio, 줄이기는 fast-simplification)
#   python3 formula/tools/stl_to_glb.py 조형.stl formula/forms/form_이름.glb
#   python3 formula/tools/stl_to_glb.py 조형.stp 결과.glb --axes "x,-z,y" --faces 150000
#
# 모델은 Z가 위쪽(Rhino 기본), 정면 SVG는 -Y 쪽에서 본 모양(X가 가로, Z가 세로)이어야 함
#  --axes: 정면이 SVG와 다르게 놓인 모델을 돌림. 새 x,y,z를 원래 축으로 적음
#          예) 위에서 본 모양이 SVG면 "x,-z,y" (원래 Y가 새 위쪽)
#  --faces: 삼각형이 이보다 많으면 이 개수로 줄임 (웹 용량)

import json
import struct
import sys

import numpy as np
import trimesh

RAYS = 64        # 꼭짓점마다 쏘는 광선 수 (많을수록 그늘이 매끈, 느려짐)
MAX_DIST = 30.0  # 이 거리(mm) 안에서 막히면 그늘로 봄


def bake_ao(mesh):
    V, N = mesh.vertices, mesh.vertex_normals
    rng = np.random.default_rng(1)
    u1, u2 = rng.random(RAYS), rng.random(RAYS)
    r, th = np.sqrt(u1), 2 * np.pi * u2
    local = np.stack([r * np.cos(th), r * np.sin(th), np.sqrt(1 - u1)], 1)   # 코사인 가중 반구
    a = np.where(np.abs(N[:, :1]) < 0.9, [[1, 0, 0]], [[0, 1, 0]])
    t = np.cross(N, a); t /= np.linalg.norm(t, axis=1, keepdims=True)
    b = np.cross(N, t)
    ao = np.zeros(len(V))
    step = 4000
    for s in range(0, len(V), step):
        n, tt, bb = N[s:s + step], t[s:s + step], b[s:s + step]
        dirs = (local[None, :, :1] * tt[:, None] + local[None, :, 1:2] * bb[:, None] + local[None, :, 2:] * n[:, None]).reshape(-1, 3)
        orig = np.repeat(V[s:s + step] + n * 0.05, RAYS, axis=0)
        locs, ri, _ = mesh.ray.intersects_location(orig, dirs, multiple_hits=False)
        hit = np.zeros(len(orig), bool)
        if len(ri):
            hit[ri[np.linalg.norm(locs - orig[ri], axis=1) < MAX_DIST]] = True
        ao[s:s + step] = 1 - hit.reshape(-1, RAYS).mean(1)
    # 이웃 꼭짓점과 살짝 섞어 얼룩을 줄임
    nb = mesh.vertex_neighbors
    return np.clip([(ao[i] * 2 + ao[k].mean()) / 3 if len(k) else ao[i] for i, k in enumerate(nb)], 0, 1)


def write_glb(path, pos, col, idx, target=None, normals=None, target_normals=None):
    # target: 접히는 조형처럼 모양이 바뀌는 경우, 바뀐 뒤 위치(모프 타깃). 파일에는 '차이'로 저장
    pos = pos.astype('<f4')
    colb = np.concatenate([(np.repeat(col[:, None], 3, 1) * 255).round().astype(np.uint8),
                           np.full((len(col), 1), 255, np.uint8)], 1)
    idx = idx.astype('<u4').ravel()
    parts = [pos.tobytes(), colb.tobytes(), idx.tobytes()]
    acc = [
        {'componentType': 5126, 'count': len(pos), 'type': 'VEC3', 'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()},
        {'componentType': 5121, 'normalized': True, 'count': len(pos), 'type': 'VEC4'},
        {'componentType': 5125, 'count': len(idx), 'type': 'SCALAR'},
    ]
    attrs = {'POSITION': 0, 'COLOR_0': 1}
    prim = {'attributes': attrs, 'indices': 2}

    def add(arr, **kw):
        arr = arr.astype('<f4')
        parts.append(arr.tobytes())
        acc.append({'componentType': 5126, 'count': len(arr), 'type': 'VEC3', **kw})
        return len(acc) - 1

    if normals is not None:
        attrs['NORMAL'] = add(normals)
    if target is not None:
        d = (target - pos).astype('<f4')
        t = {'POSITION': add(d, min=d.min(0).tolist(), max=d.max(0).tolist())}
        if target_normals is not None:
            t['NORMAL'] = add(target_normals - normals)
        prim['targets'] = [t]
    offs = np.concatenate([[0], np.cumsum([len(p) for p in parts])[:-1]]).tolist()
    for a, i in zip(acc, range(len(acc))):
        a['bufferView'] = i
    data = b''.join(parts)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'FORMULA stl_to_glb (AO in COLOR_0)'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': [prim], **({'weights': [0]} if target is not None else {})}],
        'buffers': [{'byteLength': len(data)}],
        'bufferViews': [{'buffer': 0, 'byteOffset': offs[i], 'byteLength': len(parts[i])} for i in range(len(parts))],
        'accessors': acc,
    }
    j = json.dumps(gltf, separators=(',', ':')).encode()
    j += b' ' * (-len(j) % 4)
    data += b'\0' * (-len(data) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 28 + len(j) + len(data))
    out += struct.pack('<II', len(j), 0x4E4F534A) + j + struct.pack('<II', len(data), 0x004E4942) + data
    open(path, 'wb').write(out)
    return len(out)


def load(src):
    if src.lower().endswith(('.stp', '.step')):
        # STEP(Rhino 등)은 OpenCASCADE로 삼각형 면으로 바꿈 (결과는 m 단위라 mm로)
        import cascadio, tempfile, os
        tmp = tempfile.mktemp(suffix='.glb')
        cascadio.step_to_glb(src, tmp, tol_linear=0.02, tol_angular=0.2)
        mesh = trimesh.load(tmp).to_geometry()
        os.remove(tmp)
        mesh.apply_scale(1000)
    else:
        mesh = trimesh.load(src, process=True)
    mesh.merge_vertices()
    return mesh


def reorient(mesh, axes):
    # "x,-z,y" → 새 x = 원래 x, 새 y = -원래 z, 새 z = 원래 y
    idx = {'x': 0, 'y': 1, 'z': 2}
    M = np.zeros((3, 3))
    for row, a in enumerate(axes.split(',')):
        a = a.strip()
        M[row, idx[a[-1]]] = -1 if a.startswith('-') else 1
    assert abs(np.linalg.det(M) - 1) < 1e-6, '축을 바꿀 때 좌우가 뒤집히면 안 됨 (부호를 확인)'
    T = np.eye(4); T[:3, :3] = M
    mesh.apply_transform(T)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--axes'); ap.add_argument('--faces', type=int)
    args = ap.parse_args()
    src, dst = args.src, args.dst
    mesh = load(src)
    if args.axes:
        reorient(mesh, args.axes)
    if args.faces and len(mesh.faces) > args.faces:
        mesh = mesh.simplify_quadric_decimation(face_count=args.faces)
        mesh.merge_vertices()
    print(f'꼭짓점 {len(mesh.vertices):,} / 삼각형 {len(mesh.faces):,}')
    ao = bake_ao(mesh)
    size = write_glb(dst, mesh.vertices, ao, mesh.faces)
    print(f'{dst} 저장 ({size / 1e6:.1f}MB, 그늘 평균 {ao.mean():.2f} 최소 {ao.min():.2f})')
