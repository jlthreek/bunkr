// SQLite → GeoJSON 익스포트
//   public/data/*.geojson       : WGS84 (Cesium 렌더)
//   export/epsg5179/*.geojson   : EPSG:5179 미터 (알고리즘팀 계약 산출물)
// 사용: node scripts/export-geojson.mjs
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import proj4 from "proj4";
import { openDb } from "./lib/db.mjs";
import { EPSG5179, WGS84, OUT_WGS84_DIR, OUT_5179_DIR } from "./config.mjs";

const toMeter = proj4(WGS84, EPSG5179);
const CRS_5179 = {
  type: "name",
  properties: { name: "urn:ogc:def:crs:EPSG::5179" },
};

// GeoJSON geometry 좌표 재귀 재투영 (WGS84 → 5179)
function reproj(coords) {
  if (typeof coords[0] === "number") {
    const { x, y } = toMeter.forward({ x: coords[0], y: coords[1] });
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
  }
  return coords.map(reproj);
}
function reprojGeom(geom) {
  return { type: geom.type, coordinates: reproj(geom.coordinates) };
}

function fc(features, crs) {
  const o = { type: "FeatureCollection" };
  if (crs) o.crs = crs;
  o.features = features;
  return o;
}
function feature(props, geom) {
  return { type: "Feature", properties: props, geometry: geom };
}

function ensure(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

const db = openDb();

// ── 각 레이어를 (props, wgs84Geom) 형태로 구성 ─────────────────
const layers = {};

layers.area_boundary = db
  .prepare("SELECT area_id,name,geom FROM area_boundary")
  .all()
  .map((r) => feature({ area_id: r.area_id, name: r.name }, JSON.parse(r.geom)));

layers.buildings = db
  .prepare(
    `SELECT building_id,name,ground_alt_m,height_m,levels,height_source,
            is_obstacle,footprint_area_m2,geom FROM buildings`
  )
  .all()
  .map((r) =>
    feature(
      {
        building_id: r.building_id,
        name: r.name,
        ground_alt_m: r.ground_alt_m,
        height_m: r.height_m,
        levels: r.levels,
        height_source: r.height_source, // 출처 추적
        is_obstacle: !!r.is_obstacle,
        rooftop_area_m2: r.footprint_area_m2,
      },
      JSON.parse(r.geom)
    )
  );

layers.install_sites = db
  .prepare(
    `SELECT site_id,building_id,name,install_alt_m,rooftop_area_m2,max_items,
            power_kw,network,access_score,install_cost,synthetic,lon,lat
     FROM install_sites`
  )
  .all()
  .map((r) =>
    feature(
      {
        site_id: r.site_id,
        building_id: r.building_id,
        name: r.name,
        install_alt_m: r.install_alt_m,
        rooftop_area_m2: r.rooftop_area_m2,
        max_items: r.max_items,
        power_kw: r.power_kw,
        network: !!r.network,
        access_score: r.access_score,
        install_cost: r.install_cost,
        synthetic: !!r.synthetic,
      },
      { type: "Point", coordinates: [r.lon, r.lat] }
    )
  );

layers.priority_zones = db
  .prepare("SELECT zone_id,name,zone_type,weight,geom FROM priority_zones")
  .all()
  .map((r) =>
    feature(
      { zone_id: r.zone_id, name: r.name, zone_type: r.zone_type, weight: r.weight },
      JSON.parse(r.geom)
    )
  );

db.close();

// ── 쓰기: WGS84 + EPSG:5179 ───────────────────────────────────
ensure(OUT_WGS84_DIR);
ensure(OUT_5179_DIR);

const manifest = [];
for (const [name, feats] of Object.entries(layers)) {
  // WGS84 (Cesium)
  writeFileSync(
    resolve(OUT_WGS84_DIR, `${name}.geojson`),
    JSON.stringify(fc(feats), null, 0)
  );
  // EPSG:5179 (알고리즘 계약)
  const feats5179 = feats.map((f) =>
    feature(f.properties, reprojGeom(f.geometry))
  );
  writeFileSync(
    resolve(OUT_5179_DIR, `${name}.geojson`),
    JSON.stringify(fc(feats5179, CRS_5179), null, 0)
  );
  manifest.push({ layer: name, count: feats.length });
  console.log(`[export] ${name}: ${feats.length} features`);
}

// Cesium 로더 편의용 매니페스트
writeFileSync(
  resolve(OUT_WGS84_DIR, "manifest.json"),
  JSON.stringify({ crs: "EPSG:4326", layers: manifest }, null, 2)
);
console.log(`[export] ✔ WGS84 → public/data/  ·  EPSG:5179 → export/epsg5179/`);
