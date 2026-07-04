// cuas/pathfinding.py 포팅 — 그리드 A* + 스무딩. 좌표계 km (frame.ts local km).
// obstacles: 건물 등 장애물 폴리곤 [[x,y],...] (km). 없으면 목표 직행 폴백.
export type Pt = [number, number];
export type Polygon = Pt[];
export type Bounds = [number, number, number, number]; // xmin,xmax,ymin,ymax
// 장애물: 폴리곤만(고도무관 항상 회피) 또는 {polygon, height(m)}(고도 기반 회피)
export type Obstacle = Polygon | { polygon: Polygon; height: number };

const DEFAULT_RESOLUTION = 0.05; // km/cell (50m)
export const DEFAULT_CLEARANCE_M = 15.0; // 건물 높이 대비 안전 여유고도(m)
const NEIGHBORS: Pt[] = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

function polygonOf(o: Obstacle): Polygon {
  return Array.isArray(o) ? o : o.polygon;
}
function heightOf(o: Obstacle): number | null {
  return Array.isArray(o) ? null : o.height;
}
// 드론 고도가 건물높이+여유고도보다 높으면 상공 통과 → 회피 대상 제외.
// altitude=null(미상) 또는 건물높이 미상이면 안전하게 회피 유지.
function filterByAltitude(
  obstacles: Obstacle[],
  altitude: number | null,
  clearance: number
): Obstacle[] {
  if (altitude == null) return obstacles;
  return obstacles.filter((o) => {
    const h = heightOf(o);
    return h == null || altitude <= h + clearance;
  });
}

function gridDims(bounds: Bounds, res: number): [number, number] {
  const [xmin, xmax, ymin, ymax] = bounds;
  return [
    Math.max(1, Math.ceil((xmax - xmin) / res)),
    Math.max(1, Math.ceil((ymax - ymin) / res)),
  ];
}

// 각 건물 footprint 의 bbox 셀을 점유로 마킹 (셀중심 판정의 소형건물 누락 개선 + 빠름).
function buildGrid(obstacles: Obstacle[], bounds: Bounds, res: number): boolean[][] {
  const [nx, ny] = gridDims(bounds, res);
  const [xmin, , ymin] = bounds;
  const grid: boolean[][] = Array.from({ length: nx }, () => new Array(ny).fill(false));
  for (const o of obstacles) {
    const poly = polygonOf(o);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of poly) {
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
    const i0 = Math.max(0, Math.floor((minx - xmin) / res));
    const i1 = Math.min(nx - 1, Math.floor((maxx - xmin) / res));
    const j0 = Math.max(0, Math.floor((miny - ymin) / res));
    const j1 = Math.min(ny - 1, Math.floor((maxy - ymin) / res));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) grid[i][j] = true;
  }
  return grid;
}

function xyToIdx(x: number, y: number, bounds: Bounds, res: number): Pt {
  const [xmin, , ymin] = bounds;
  const [nx, ny] = gridDims(bounds, res);
  const i = Math.min(nx - 1, Math.max(0, Math.floor((x - xmin) / res)));
  const j = Math.min(ny - 1, Math.max(0, Math.floor((y - ymin) / res)));
  return [i, j];
}

function idxToXy(i: number, j: number, bounds: Bounds, res: number): Pt {
  const [xmin, , ymin] = bounds;
  return [xmin + (i + 0.5) * res, ymin + (j + 0.5) * res];
}

// 최소 힙 (f, g, node-key)
class MinHeap {
  private a: [number, number, number][] = [];
  push(item: [number, number, number]) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number, number] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < a.length && a[l][0] < a[s][0]) s = l;
        if (r < a.length && a[r][0] < a[s][0]) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

function astar(grid: boolean[][], start: Pt, goal: Pt): Pt[] | null {
  const nx = grid.length, ny = grid[0].length;
  const key = (i: number, j: number) => i * ny + j;
  const h = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const heap = new MinHeap();
  heap.push([h(start, goal), 0, key(start[0], start[1])]);
  const cameFrom = new Map<number, number>();
  const gscore = new Map<number, number>([[key(start[0], start[1]), 0]]);
  const visited = new Set<number>();
  const goalKey = key(goal[0], goal[1]);
  while (heap.size) {
    const top = heap.pop()!;
    const cur = top[2];
    if (visited.has(cur)) continue;
    visited.add(cur);
    if (cur === goalKey) {
      const path: Pt[] = [];
      let k: number | undefined = cur;
      while (k !== undefined) {
        path.push([Math.floor(k / ny), k % ny]);
        k = cameFrom.get(k);
      }
      return path.reverse();
    }
    const ci = Math.floor(cur / ny), cj = cur % ny;
    const g = top[1];
    for (const [dx, dy] of NEIGHBORS) {
      const ni = ci + dx, nj = cj + dy;
      if (ni < 0 || ni >= nx || nj < 0 || nj >= ny || grid[ni][nj]) continue;
      const nk = key(ni, nj);
      const ng = g + h([ci, cj], [ni, nj]);
      if (ng < (gscore.get(nk) ?? Infinity)) {
        gscore.set(nk, ng);
        cameFrom.set(nk, cur);
        heap.push([ng + h([ni, nj], goal), ng, nk]);
      }
    }
  }
  return null;
}

function lineOfSight(grid: boolean[][], a: Pt, b: Pt): boolean {
  const nx = grid.length, ny = grid[0].length;
  const n = Math.floor(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))) * 2 + 1;
  for (let s = 0; s < n; s++) {
    const t = n === 1 ? 0 : s / (n - 1);
    const i = Math.round(a[0] + (b[0] - a[0]) * t);
    const j = Math.round(a[1] + (b[1] - a[1]) * t);
    if (i < 0 || i >= nx || j < 0 || j >= ny || grid[i][j]) return false;
  }
  return true;
}

function smooth(grid: boolean[][], path: Pt[]): Pt[] {
  if (path.length < 3) return path;
  const out: Pt[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !lineOfSight(grid, path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

/** start/goal (km). obstacles 없으면 직선 폴백. altitude(m) 주면 그보다 낮은(+clearance) 건물은 상공 통과. */
export function planPath(
  start: Pt,
  goal: Pt,
  obstacles: Obstacle[] | null = null,
  altitude: number | null = null,
  clearance = DEFAULT_CLEARANCE_M,
  resolution = DEFAULT_RESOLUTION
): Pt[] {
  if (!obstacles || !obstacles.length) return [[goal[0], goal[1]]];
  obstacles = filterByAltitude(obstacles, altitude, clearance);
  if (!obstacles.length) return [[goal[0], goal[1]]]; // 모든 건물보다 높음 → 상공 직행
  const xs = [start[0], goal[0], ...obstacles.flatMap((o) => polygonOf(o).map((q) => q[0]))];
  const ys = [start[1], goal[1], ...obstacles.flatMap((o) => polygonOf(o).map((q) => q[1]))];
  const pad = 0.3;
  const bounds: Bounds = [
    Math.min(...xs) - pad, Math.max(...xs) + pad,
    Math.min(...ys) - pad, Math.max(...ys) + pad,
  ];
  const grid = buildGrid(obstacles, bounds, resolution);
  const s = xyToIdx(start[0], start[1], bounds, resolution);
  const g = xyToIdx(goal[0], goal[1], bounds, resolution);
  if (grid[s[0]][s[1]] || grid[g[0]][g[1]]) return [[goal[0], goal[1]]];
  const path = astar(grid, s, g);
  if (!path) return [[goal[0], goal[1]]];
  const sm = smooth(grid, path);
  const wps = sm.slice(1).map(([i, j]) => idxToXy(i, j, bounds, resolution));
  if (!wps.length) return [[goal[0], goal[1]]];
  wps[wps.length - 1] = [goal[0], goal[1]]; // 목표점 정확 스냅
  return wps;
}

/** p(km)에서 budget(km)만큼 웨이포인트 추적 전진. 반환 [새 위치, 갱신 wpIdx]. */
export function advanceAlongPath(
  p: Pt,
  waypoints: Pt[],
  wpIdx: number,
  budget: number
): [Pt, number] {
  let [px, py] = p;
  const n = waypoints.length;
  while (budget > 1e-9 && wpIdx < n) {
    const [gx, gy] = waypoints[wpIdx];
    const dx = gx - px, dy = gy - py;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-9) {
      wpIdx++;
      continue;
    }
    if (budget >= dist) {
      px = gx;
      py = gy;
      budget -= dist;
      wpIdx++;
    } else {
      px += (dx / dist) * budget;
      py += (dy / dist) * budget;
      budget = 0;
    }
  }
  return [[px, py], Math.min(wpIdx, n - 1)];
}
