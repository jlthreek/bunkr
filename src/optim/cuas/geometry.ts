// C-UAS 지오메트리·LOS — placement_algorithm.py 충실 포팅.
// 성능: 건물 point-in 조회를 공간 그리드로 인덱싱(LOS 샘플링 가속). 수학은 원본과 동일.
import type { Building, Cell, Region, Scenario } from "./types";

export function clamp(v: number, lo = 0.0, hi = 1.0): number {
  return Math.max(lo, Math.min(hi, v));
}

export function pointInPolygon(x: number, y: number, poly: number[][]): boolean {
  let inside = false;
  let j = poly.length - 1;
  for (let i = 0; i < poly.length; i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersects = yi > y !== yj > y;
    if (intersects) {
      const crossX = ((xj - xi) * (y - yi)) / Math.max(yj - yi, 1e-9) + xi;
      if (x < crossX) inside = !inside;
    }
    j = i;
  }
  return inside;
}

export function buildingFootprint(b: Building): number[][] {
  if (b.footprint) return b.footprint;
  const hw = (b.w ?? 0) / 2, hd = (b.d ?? 0) / 2;
  const x = b.x ?? 0, y = b.y ?? 0;
  b.footprint = [
    [x - hw, y - hd], [x + hw, y - hd], [x + hw, y + hd], [x - hw, y + hd], [x - hw, y - hd],
  ];
  return b.footprint;
}

export function buildingRoofAltitude(b: Building): number {
  if (b.roof_alt_m != null) return b.roof_alt_m;
  return (b.ground_alt ?? 0) + (b.height ?? 0);
}

export function siteBaseAltitude(s: { install_alt_m?: number; ground_alt?: number; height?: number }): number {
  if (s.install_alt_m != null) return s.install_alt_m;
  return (s.ground_alt ?? 0) + (s.height ?? 0);
}

export function terrainAltitudeAt(sc: Scenario, x: number, y: number): number {
  const terrain = sc.terrain ?? {};
  const def = terrain.default_ground_alt_m ?? sc.area.default_ground_alt_m ?? 0.0;
  const pts = terrain.points ?? [];
  if (!pts.length) return def;
  let ws = 0, wt = 0;
  for (const p of pts) {
    const dx = x - p.x, dy = y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 1.0) return p.ground_alt_m;
    const w = 1.0 / d2;
    ws += p.ground_alt_m * w;
    wt += w;
  }
  return wt > 0 ? ws / wt : def;
}

export function targetAltitudeForCell(sc: Scenario, cell: Cell): number {
  const t = sc.area.target_altitude_m;
  if ((sc.area.target_altitude_mode ?? "absolute") === "agl") {
    return terrainAltitudeAt(sc, cell.x, cell.y) + t;
  }
  return t;
}

export function regionContains(r: Region, x: number, y: number): boolean {
  switch (r.type) {
    case "rect":
      return r.x1! <= x && x <= r.x2! && r.y1! <= y && y <= r.y2!;
    case "polygon": {
      const rings = r.coordinates as number[][][];
      if (!rings?.length) return false;
      if (!pointInPolygon(x, y, rings[0])) return false;
      for (let i = 1; i < rings.length; i++) if (pointInPolygon(x, y, rings[i])) return false;
      return true;
    }
    case "multipolygon":
      return (r.coordinates as number[][][][]).some((poly) =>
        regionContains({ ...r, type: "polygon", coordinates: poly }, x, y)
      );
    case "ellipse": {
      const dx = (x - r.cx!) / r.rx!, dy = (y - r.cy!) / r.ry!;
      return dx * dx + dy * dy <= 1.0;
    }
    case "ellipse_ring": {
      const dxo = (x - r.cx!) / r.outer_rx!, dyo = (y - r.cy!) / r.outer_ry!;
      const dxi = (x - r.cx!) / r.inner_rx!, dyi = (y - r.cy!) / r.inner_ry!;
      return dxo * dxo + dyo * dyo <= 1.0 && dxi * dxi + dyi * dyi > 1.0;
    }
  }
  return false;
}

export function buildCells(sc: Scenario): Cell[] {
  const a = sc.area;
  const cols = Math.ceil(a.width_m / a.cell_size_m);
  const rows = Math.ceil(a.height_m / a.cell_size_m);
  const cells: Cell[] = [];
  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.min((col + 0.5) * a.cell_size_m, a.width_m);
      const y = Math.min((row + 0.5) * a.cell_size_m, a.height_m);
      let weight = 0.0;
      const ids: string[] = [];
      for (const r of sc.priority_regions) {
        if (regionContains(r, x, y)) {
          weight += r.weight;
          ids.push(r.id);
        }
      }
      cells.push({ index: idx, x, y, weight, regionIds: ids });
      idx++;
    }
  }
  return cells;
}

// ── 건물 공간 인덱스 (LOS point-in-building 가속) ──────────────
export class BuildingIndex {
  private cell = 40;
  private buckets = new Map<number, number[]>();
  private minx = 0;
  private miny = 0;
  private nx = 1;
  constructor(private buildings: Building[]) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    const bboxes: [number, number, number, number][] = [];
    for (const b of buildings) {
      const fp = buildingFootprint(b);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of fp) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      bboxes.push([x0, y0, x1, y1]);
      minx = Math.min(minx, x0); miny = Math.min(miny, y0);
      maxx = Math.max(maxx, x1); maxy = Math.max(maxy, y1);
    }
    if (!buildings.length) return;
    this.minx = minx; this.miny = miny;
    this.nx = Math.max(1, Math.ceil((maxx - minx) / this.cell) + 1);
    for (let bi = 0; bi < buildings.length; bi++) {
      const [x0, y0, x1, y1] = bboxes[bi];
      const i0 = Math.floor((x0 - minx) / this.cell), i1 = Math.floor((x1 - minx) / this.cell);
      const j0 = Math.floor((y0 - miny) / this.cell), j1 = Math.floor((y1 - miny) / this.cell);
      for (let i = i0; i <= i1; i++)
        for (let j = j0; j <= j1; j++) {
          const key = j * this.nx + i;
          let arr = this.buckets.get(key);
          if (!arr) this.buckets.set(key, (arr = []));
          arr.push(bi);
        }
    }
  }
  // (x,y)를 포함하는 장애물 건물 목록
  query(x: number, y: number): Building[] {
    const i = Math.floor((x - this.minx) / this.cell);
    const j = Math.floor((y - this.miny) / this.cell);
    const arr = this.buckets.get(j * this.nx + i);
    if (!arr) return [];
    const out: Building[] = [];
    for (const bi of arr) out.push(this.buildings[bi]);
    return out;
  }
}

function pointInBuilding(b: Building, x: number, y: number): boolean {
  if (!b.footprint && b.w != null) {
    const hw = b.w / 2, hd = (b.d ?? 0) / 2;
    return (b.x ?? 0) - hw <= x && x <= (b.x ?? 0) + hw && (b.y ?? 0) - hd <= y && y <= (b.y ?? 0) + hd;
  }
  return pointInPolygon(x, y, buildingFootprint(b));
}

// 3D LOS 품질 0~1 (원본 los_quality). 캐시 + 건물 인덱스.
export function losQuality(
  sc: Scenario,
  site: { id: string; x: number; y: number; building_id?: string; install_alt_m?: number; ground_alt?: number; height?: number },
  equipment: { id: string; mount_height_m?: number },
  cell: Cell,
  index: BuildingIndex,
  cache: Map<string, number>
): number {
  const key = `${site.id}|${equipment.id}|${cell.index}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const cfg = sc.los ?? {};
  const samples = cfg.samples ?? 36;
  const clearance = cfg.clearance_m ?? 3.0;
  const softM = cfg.soft_block_margin_m ?? 8.0;
  const hardM = cfg.hard_block_margin_m ?? 30.0;
  const sx = site.x, sy = site.y;
  const sz = siteBaseAltitude(site) + (equipment.mount_height_m ?? 0.0);
  const tz = targetAltitudeForCell(sc, cell);
  const dx = cell.x - sx, dy = cell.y - sy;
  let maxBlock = 0.0;

  for (let step = 1; step < samples; step++) {
    const t = step / samples;
    const px = sx + dx * t, py = sy + dy * t;
    const lineAlt = sz + (tz - sz) * t;
    const terrainAlt = terrainAltitudeAt(sc, px, py);
    maxBlock = Math.max(maxBlock, terrainAlt + clearance - lineAlt);
    for (const b of index.query(px, py)) {
      if (b.is_obstacle === false) continue;
      if (b.id === site.building_id && t < 0.08) continue;
      if (pointInBuilding(b, px, py)) {
        maxBlock = Math.max(maxBlock, buildingRoofAltitude(b) + clearance - lineAlt);
      }
    }
  }

  let q: number;
  if (maxBlock <= 0.0) q = 1.0;
  else if (maxBlock <= softM) q = 1.0 - 0.45 * (maxBlock / Math.max(softM, 1.0));
  else if (maxBlock <= hardM) q = 0.55 - 0.37 * ((maxBlock - softM) / Math.max(hardM - softM, 1.0));
  else q = 0.1;
  cache.set(key, q);
  return q;
}
