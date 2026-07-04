// 옵티마이저 레지스트리 + 입력 데이터 로더.
// 알고리즘팀 구현이 나오면 여기 OPTIMIZERS 에 등록(또는 remote 래퍼 추가)하고
// ACTIVE 만 바꾸면 됨.
import { greedyOptimizer } from "./greedy";
import type { AssetBudget, AssetMeta, OptimInput, Optimizer } from "./types";
import { ASSET_SPECS } from "../assets";

export * from "./types";

export const OPTIMIZERS: Record<string, Optimizer> = {
  greedy: greedyOptimizer,
  // 예: remote: remoteOptimizer,   ← 알고리즘팀 서버 래퍼
};
let ACTIVE = "greedy";

export function getOptimizer(name = ACTIVE): Optimizer {
  return OPTIMIZERS[name] ?? greedyOptimizer;
}
export function setOptimizer(name: string) {
  if (OPTIMIZERS[name]) ACTIVE = name;
}
export function listOptimizers() {
  return Object.keys(OPTIMIZERS);
}

export const DEFAULT_BUDGET: AssetBudget = { scanner: 3, jammer: 2, counter: 2 };

export function assetMetaFromSpecs(): AssetMeta {
  return Object.fromEntries(
    ASSET_SPECS.map((s) => [s.kind, { rangeM: s.rangeM }])
  ) as AssetMeta;
}

// GeoJSON geometry 무게중심 [lon,lat]
function centroid(geom: any): [number, number] {
  const rings: number[][][] =
    geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  let sx = 0,
    sy = 0,
    n = 0;
  for (const ring of rings)
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
      n++;
    }
  return [sx / n, sy / n];
}

// public/data/<loc>/ 의 install_sites·priority_zones 를 옵티마이저 입력으로 로드
export async function loadOptimInput(
  locId: string,
  budget: AssetBudget = DEFAULT_BUDGET
): Promise<OptimInput> {
  const [sitesFc, zonesFc] = await Promise.all([
    fetch(`data/${locId}/install_sites.geojson`).then((r) => r.json()),
    fetch(`data/${locId}/priority_zones.geojson`).then((r) => r.json()),
  ]);

  const sites = sitesFc.features.map((f: any) => {
    const [lon, lat] = f.geometry.coordinates;
    const p = f.properties;
    return {
      siteId: p.site_id,
      buildingId: p.building_id,
      lon,
      lat,
      installAltM: p.install_alt_m,
      maxItems: p.max_items,
      powerKw: p.power_kw,
      network: !!p.network,
      accessScore: p.access_score,
      installCost: p.install_cost,
    };
  });

  const zones = zonesFc.features.map((f: any) => {
    const [lon, lat] = centroid(f.geometry);
    const p = f.properties;
    return {
      zoneId: p.zone_id,
      zoneType: p.zone_type,
      weight: p.weight,
      lon,
      lat,
    };
  });

  return { sites, zones, budget, assetMeta: assetMetaFromSpecs() };
}
