"""FORMULA 로고 방식(구슬 + 오목한 이음새)으로 아이콘 SVG를 만드는 도구
   python3 formula/tools/bead_icons.py  →  formula/icons/*.svg + 모아보기 formula/icons/index.html

   구슬(원) 반지름 R, 구슬 사이 간격 S. 이어진 두 구슬 사이는 로고처럼 안으로 오목한 곡선(필렛)으로 메움:
   이음새 가운데 폭의 절반 = NECK × R, 필렛 반지름 f = (w² + d²/4 − R²) / (2(R − w))
   모든 조각을 하나로 합쳐(union) 한 덩어리 패스로 저장 → 피그마에 넣으면 바로 하나의 도형"""
import math, os
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union
from shapely import affinity

BOX = 48          # 아이콘 칸 (48×48)
R = 6.0           # 구슬 반지름
S = 1.8 * R       # 이어진 구슬 사이 간격
NECK = 0.68       # 이음새 가운데 굵기 (구슬 반지름 대비). 작을수록 잘록함
FIT = 42          # 아이콘이 이보다 크면 칸 안에 들어가게 줄임
INK = '#1e1d1b'
RES = 48          # 원을 몇 조각으로 근사할지 (클수록 매끈)

def neck(c1, c2, r=R):
    """두 구슬 사이를 잇는 오목한 이음새"""
    (x1, y1), (x2, y2) = c1, c2
    d = math.hypot(x2 - x1, y2 - y1)
    w = NECK * r
    f = (w * w + d * d / 4 - r * r) / (2 * (r - w))
    if f <= 0:                       # 구슬끼리 이미 충분히 겹치면 이음새 필요 없음
        return Polygon()
    ux, uy = (x2 - x1) / d, (y2 - y1) / d      # 두 구슬을 잇는 방향
    nx, ny = -uy, ux                            # 그에 수직
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    h = w + f
    shapes = []
    pts = []
    for side in (1, -1):
        fx, fy = mx + nx * h * side, my + ny * h * side     # 필렛 원 중심
        shapes.append(Point(fx, fy).buffer(f, RES))
        for (cx, cy) in ((x1, y1), (x2, y2)):
            vx, vy = fx - cx, fy - cy
            L = math.hypot(vx, vy)
            pts.append((side, (cx, cy), (cx + vx / L * r, cy + vy / L * r)))   # 구슬 위의 접점
    a = [p for s, c, p in pts if s == 1]
    b = [p for s, c, p in pts if s == -1]
    quad = Polygon([a[0], a[1], b[1], b[0]])
    return quad.difference(unary_union(shapes))

def bead_shape(beads, edges, r=R):
    parts = [Point(x, y).buffer(r, RES) for x, y in beads]
    parts += [neck(beads[i], beads[j], r) for i, j in edges]
    return unary_union(parts)

def auto_edges(beads, lim=1.08):
    return [(i, j) for i in range(len(beads)) for j in range(i + 1, len(beads))
            if math.dist(beads[i], beads[j]) <= lim * S]

def line(p, q, n):
    return [(p[0] + (q[0] - p[0]) * k / (n - 1), p[1] + (q[1] - p[1]) * k / (n - 1)) for k in range(n)]

def chain(pts, closed=False):
    e = [(k, k + 1) for k in range(len(pts) - 1)]
    if closed: e.append((len(pts) - 1, 0))
    return e

def dedupe(pts):
    out = []
    for p in pts:
        if not any(math.dist(p, q) < 1e-6 for q in out): out.append(p)
    return out

def ring(n, rad, start=-90):
    return [(rad * math.cos(math.radians(start + 360 * k / n)), rad * math.sin(math.radians(start + 360 * k / n))) for k in range(n)]

# ── 아이콘 정의: 단위는 구슬 간격(1 = S). (구슬 좌표, 잇는 쌍) ──
def icons():
    I = {}
    p = ring(6, 1.0); I['01-ring'] = (p, chain(p, True))                         # 구멍 난 꽃 (고리)
    p = line((-1, 0), (1, 0), 3); I['02-dash'] = (p, chain(p))                    # 막대
    p = ring(3, 0.78, -90); I['03-trio'] = (p, [])                                # 떨어진 세 알
    p = dedupe(line((-0.7, -1.3), (0.6, 0), 3) + line((0.6, 0), (-0.7, 1.3), 3)); I['04-chevron'] = (p, chain(p))   # >
    p = [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]; I['05-plus'] = (p, [(0, 1), (0, 2), (0, 3), (0, 4)])
    p = line((-1.6, 0), (1.1, 0), 4) + [(0.45, -1.0), (0.45, 1.0)]
    I['06-arrow-right'] = (p, chain(p[:4]) + [(3, 4), (3, 5)])
    I['07-arrow-down'] = ([(-y, x) for x, y in p], I['06-arrow-right'][1])
    I['08-dot'] = ([(0, 0)], [])
    p = [(-0.5, 0), (0.5, 0)]; I['09-pair'] = (p, [(0, 1)])
    p = [(-1, -1), (-1, 0), (-1, 1), (0, 1), (1, 1)]; I['10-corner'] = (p, chain(p))
    p = [(x, 0.55 * math.sin(x * math.pi / 2)) for x in (-2, -1, 0, 1, 2)]; I['11-wave'] = (p, chain(p))
    p = [(-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)]; I['12-square'] = (p, chain(p, True))
    t = ring(3, 1.55, -90); p = dedupe(line(t[0], t[1], 4) + line(t[1], t[2], 4) + line(t[2], t[0], 4)); I['13-triangle'] = (p, chain(p, True))
    p = [(0, 1.5), (0, 0.5), (-0.75, -0.2), (-1.4, -0.95), (0.75, -0.2), (1.4, -0.95)]
    I['14-branch'] = (p, [(0, 1), (1, 2), (2, 3), (1, 4), (4, 5)])
    p = [(0, 0)] + ring(5, 1.25); I['15-flower'] = (p, [(0, k) for k in range(1, 6)])
    a = [(-0.55 + 0.9 * (1 - math.cos(math.radians(t))), 1.6 * math.sin(math.radians(t))) for t in (-75, -38, 0, 38, 75)]
    a = [(x - 0.3, y) for x, y in a]; I['16-paren-open'] = (a, chain(a))
    I['17-paren-close'] = ([(-x, y) for x, y in a], chain(a))
    p = [(-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7), (0.7, 0.7)]; I['18-grid'] = (p, [])
    p = [(-1.6, 0.05), (-0.9, 0.75), (-0.2, 0.05), (0.5, -0.65), (1.2, -1.35)]; p = [(x + 0.2, y + 0.3) for x, y in p]; I['19-check'] = (p, chain(p))
    d1 = line((-1.45, -1.45), (1.45, 1.45), 5); d2 = [q for q in line((1.45, -1.45), (-1.45, 1.45), 5) if abs(q[0]) > 1e-6]
    p = d1 + d2; I['20-close'] = (p, chain(d1) + [(5, 6), (6, 2), (2, 7), (7, 8)])
    rows = []; e = []
    for k, yy in enumerate((-1.45, 0, 1.45)):
        rows += line((-1, yy), (1, yy), 3); e += [(3 * k, 3 * k + 1), (3 * k + 1, 3 * k + 2)]
    I['21-menu'] = (rows, e)
    p = ring(10, 1.62) + [(0, 0)]; I['22-target'] = (p, chain(p[:10], True))
    return I

def to_svg(geom):
    geom = affinity.translate(geom, BOX / 2, BOX / 2)
    polys = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    d = ''
    for pg in polys:
        for ring_ in [pg.exterior] + list(pg.interiors):
            c = list(ring_.coords)[:-1]
            d += 'M' + 'L'.join(f'{x:.2f} {y:.2f}' for x, y in c) + 'Z'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{BOX}" height="{BOX}" viewBox="0 0 {BOX} {BOX}"><path fill="{INK}" fill-rule="evenodd" d="{d}"/></svg>\n'

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'icons')
    os.makedirs(out, exist_ok=True)
    cards = []
    for name, (pts, edges) in icons().items():
        beads = [(x * S, y * S) for x, y in pts]
        g = bead_shape(beads, edges).simplify(0.02)
        b = g.bounds   # 칸 가운데로
        g = affinity.translate(g, -(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2)
        k = min(1, FIT / max(b[2] - b[0], b[3] - b[1]))
        g = affinity.scale(g, k, k, origin=(0, 0))
        svg = to_svg(g)
        open(os.path.join(out, f'{name}.svg'), 'w').write(svg)
        cards.append(f'<figure><img src="{name}.svg" alt=""><figcaption>{name}</figcaption></figure>')
    open(os.path.join(out, 'index.html'), 'w').write('''<!doctype html><meta charset="utf-8"><title>FORMULA 구슬 아이콘</title>
<style>body{margin:0;padding:40px;background:#fafaf8;font:13px "DM Sans",sans-serif;color:#1e1d1b}
main{display:grid;grid-template-columns:repeat(6,140px);gap:28px 20px}figure{margin:0;text-align:center}
img{width:96px;height:96px}figcaption{margin-top:8px;color:#6f6b64}</style><main>''' + ''.join(cards) + '</main>\n')
    print(len(cards), 'icons')

if __name__ == '__main__':
    main()
