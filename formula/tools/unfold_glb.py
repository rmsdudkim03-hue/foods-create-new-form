# 물결처럼 접힌 판(리본) 조형 → '펼친 모양'에서 '접힌 모양'으로 바뀌는 웹용 GLB
#  - 옆에서 본(XZ) 리본의 가운데 선을 찾아, 그 선을 따라 잰 길이로 판을 평평하게 폄
#  - 파일의 기본 모양 = 펼친 판 (정면 SVG와 같은 모양), 모프 타깃 = 원래 접힌 모양
#    → hover3d.js가 마우스를 올리면 펼친 판이 물결로 접히며 3D가 됨
#  - 펼친 판은 세로로 세움 (리본 길이 방향 = 위아래). 접힌 모양도 같은 방향으로 세워서 보여줌
#
# 쓰는 법 (stl_to_glb.py와 같은 준비물 + scipy):
#   python3 formula/tools/unfold_glb.py 리본.stl formula/forms/no_05.glb --flip-x --flip-z --faces 150000
#   --flip-x: 펼친 판 좌우 뒤집기, --flip-z: 위아래 뒤집기 (SVG와 방향 맞출 때)

import argparse
import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

from stl_to_glb import load, bake_ao, write_glb


def centerline(P, samples=6000, smooth=30, step=0.2):
    # 옆모습 점들을 이웃끼리 이은 그래프에서 가장 먼 두 끝 사이 최단 경로 = 가운데 선
    rng = np.random.default_rng(0)
    Q = P[rng.choice(len(P), min(samples, len(P)), replace=False)]
    d, nb = cKDTree(Q).query(Q, k=10)
    G = coo_matrix((d.ravel(), (np.repeat(np.arange(len(Q)), 10), nb.ravel())), shape=(len(Q),) * 2).tocsr()
    far = lambda D: np.argmax(np.where(np.isinf(D), -1, D))
    a = far(dijkstra(G, directed=False, indices=0))
    D, pred = dijkstra(G, directed=False, indices=a, return_predecessors=True)
    path = [far(D)]
    while path[-1] != a:
        path.append(pred[path[-1]])
    C = Q[path[::-1]].copy()
    for _ in range(smooth):                                   # 매끈하게
        C[1:-1] = (C[:-2] + C[1:-1] * 2 + C[2:]) / 4
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))])
    ss = np.linspace(0, s[-1], int(s[-1] / step))             # 촘촘히 다시 나눔
    C = np.stack([np.interp(ss, s, C[:, 0]), np.interp(ss, s, C[:, 1])], 1)
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    return C, ss, np.stack([-T[:, 1], T[:, 0]], 1)            # 선 위 점, 길이, 바깥 방향


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--faces', type=int); ap.add_argument('--flip-x', action='store_true'); ap.add_argument('--flip-z', action='store_true')
    args = ap.parse_args()
    mesh = load(args.src)
    if args.faces and len(mesh.faces) > args.faces:
        mesh = mesh.simplify_quadric_decimation(face_count=args.faces)
        mesh.merge_vertices()
    V = mesh.vertices
    P = V[:, [0, 2]]
    C, ss, N = centerline(P)
    _, j = cKDTree(C).query(P)
    s = ss[j]                                                 # 리본을 따라 잰 길이
    n = ((P - C[j]) * N[j]).sum(1)                            # 판 두께 방향 위치
    if np.corrcoef(s, P[:, 0])[0, 1] < 0:                     # 선의 시작이 오른쪽 끝이면 뒤집어서 X와 같은 방향으로
        s, n = s.max() - s, -n                                #   (안 그러면 접히는 중간에 판이 뒤집히며 찌그러짐)
    a = -1 if args.flip_x else 1
    c = -1 if args.flip_z else 1
    b = a * c                                                 # 좌우가 거울처럼 뒤집히지 않게
    flat = np.stack([a * V[:, 1], b * n, c * s], 1)           # 펼친 판: 가로 = 폭, 세로 = 길이
    fold = np.stack([a * V[:, 1], b * V[:, 2], c * V[:, 0]], 1)  # 접힌 모양을 같은 방향으로 세움
    flat -= (flat.min(0) + flat.max(0)) / 2
    fold -= (fold.min(0) + fold.max(0)) / 2
    print(f'꼭짓점 {len(V):,} / 삼각형 {len(mesh.faces):,} / 펼친 길이 {s.max():.0f}mm × 폭 {np.ptp(V[:, 1]):.0f}mm')
    folded = mesh.copy(); folded.vertices = fold
    ao = bake_ao(folded)                                      # 그늘은 접힌 모양 기준
    flatm = mesh.copy(); flatm.vertices = flat
    size = write_glb(args.dst, flat, ao, mesh.faces, target=fold,
                     normals=np.asarray(flatm.vertex_normals), target_normals=np.asarray(folded.vertex_normals))
    print(f'{args.dst} 저장 ({size / 1e6:.1f}MB)')
