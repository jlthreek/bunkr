// 어댑터: 우리 WGS84 GeoJSON(zones·sites·buildings) → C-UAS 로컬미터 Scenario.
// 로컬 좌표는 [0, 2r]×[0, 2r] (원점=코너), center=(r,r). 렌더 시 역변환.
import { makeFrame, toKm, toLonLat, type Frame } from "../../cuas/frame";
import type { Building, Region, Scenario, Site } from "./types";
import { DEFAULT_EQUIPMENT, DEFAULT_OPTIMIZATION } from "./equipment";
import { runCuas } from "./algorithm";
import type { Candidate, PlanScore } from "./types";

export interface FeatureCollections {
  zones: any;
  sites: any;
  buildings: any;
}

export interface AdapterOptions {
  radiusM: number;
  siteCap?: number; // 후보지 상한(성능)
  cellSizeM?: number;
  targetAltitudeM?: number;
  maxItems?: number;
}

// lon/lat → 로컬 미터 (동+r, 북+r)
function makeProject(frame: Frame, radiusM: number) {
  return (lon: number, lat: number): [number, number] => {
    const { x, y } = toKm(frame, lon, lat);
    return [x * 1000 + radiusM, y * 1000 + radiusM];
  };
}

function ringToLocal(ring: number[][], proj: (lon: number, lat: number) => [number, number]): number[][] {
  return ring.map(([lon, lat]) => proj(lon, lat));
}

export function buildScenario(fc: FeatureCollections, center: { lon: number; lat: number }, opt: AdapterOptions): Scenario {
  const frame = makeFrame(center.lon, center.lat);
  const proj = makeProject(frame, opt.radiusM);
  const size = 2 * opt.radiusM;

  // 구역 (보호+ / 민감-)
  const priority_regions: Region[] = [];
  for (const f of fc.zones.features) {
    const w = f.properties?.weight ?? 0;
    if (w === 0) continue;
    const g = f.geometry;
    if (g.type === "Polygon") {
      priority_regions.push({
        id: f.properties.zone_id, type: "polygon", weight: w,
        coordinates: g.coordinates.map((ring: number[][]) => ringToLocal(ring, proj)),
      });
    } else if (g.type === "MultiPolygon") {
      priority_regions.push({
        id: f.properties.zone_id, type: "multipolygon", weight: w,
        coordinates: g.coordinates.map((poly: number[][][]) => poly.map((ring) => ringToLocal(ring, proj))),
      });
    }
  }

  // 건물 (LOS 차폐)
  const buildings: Building[] = [];
  for (const f of fc.buildings.features) {
    if (f.properties?.is_obstacle === false) continue;
    const ring = f.geometry?.coordinates?.[0];
    if (!ring || ring.length < 3) continue;
    buildings.push({
      id: f.properties.building_id, footprint: ringToLocal(ring, proj),
      height: f.properties.height_m, ground_alt: f.properties.ground_alt_m ?? 0,
      is_obstacle: true,
    });
  }

  // 후보지 (rooftop_area 큰 순 상한)
  let siteFeatures = [...fc.sites.features];
  const cap = opt.siteCap ?? 40;
  if (siteFeatures.length > cap) {
    siteFeatures.sort((a, b) => (b.properties.rooftop_area_m2 ?? 0) - (a.properties.rooftop_area_m2 ?? 0));
    siteFeatures = siteFeatures.slice(0, cap);
  }
  const sites: Site[] = siteFeatures.map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const [x, y] = proj(lon, lat);
    const p = f.properties;
    return {
      id: p.site_id, name: p.name ?? p.site_id, x, y, building_id: p.building_id,
      install_alt_m: p.install_alt_m, rooftop_area_m2: p.rooftop_area_m2,
      power_kw: p.power_kw, network: !!p.network, access_score: p.access_score,
      max_items: p.max_items ?? 1, lon, lat,
    };
  });

  const optimization = { ...DEFAULT_OPTIMIZATION };
  if (opt.maxItems != null) optimization.max_items = opt.maxItems;

  return {
    name: "gwanghwamun cuas",
    area: {
      width_m: size, height_m: size, cell_size_m: opt.cellSizeM ?? 100,
      target_altitude_m: opt.targetAltitudeM ?? 120, target_altitude_mode: "absolute",
      default_ground_alt_m: 0,
    },
    optimization,
    terrain: { default_ground_alt_m: 0, points: [] },
    los: { samples: 36, clearance_m: 3, soft_block_margin_m: 8, hard_block_margin_m: 30 },
    priority_regions, buildings, sites, equipment: DEFAULT_EQUIPMENT,
  };
}

// 선택 후보의 로컬미터 → lon/lat 역변환 (렌더용). 방위각(orientation_deg)은 로컬 프레임 기준.
export function localToLonLat(center: { lon: number; lat: number }, radiusM: number, x: number, y: number) {
  const frame = makeFrame(center.lon, center.lat);
  return toLonLat(frame, (x - radiusM) / 1000, (y - radiusM) / 1000);
}

export interface CuasResult {
  selected: Candidate[];
  score: PlanScore;
  cellCount: number;
  candidateCount: number;
  scenario: Scenario;
}

export function runCuasScenario(fc: FeatureCollections, center: { lon: number; lat: number }, opt: AdapterOptions): CuasResult {
  const scenario = buildScenario(fc, center, opt);
  const r = runCuas(scenario, opt.maxItems);
  return { ...r, scenario };
}

// 브라우저: public/data/<loc>/ geojson fetch → 실행
export async function loadAndRunCuas(
  locId: string, center: { lon: number; lat: number }, radiusM: number, opt: Partial<AdapterOptions> = {}
): Promise<CuasResult> {
  const [zones, sites, buildings] = await Promise.all([
    fetch(`data/${locId}/priority_zones.geojson`).then((r) => r.json()),
    fetch(`data/${locId}/install_sites.geojson`).then((r) => r.json()),
    fetch(`data/${locId}/buildings.geojson`).then((r) => r.json()),
  ]);
  return runCuasScenario({ zones, sites, buildings }, center, { radiusM, ...opt });
}
