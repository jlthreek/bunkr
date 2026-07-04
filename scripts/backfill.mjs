// OSM(Overpass) → SQLite canonical store 백필
// 사용: node scripts/backfill.mjs
import {
  ACTIVE,
  AREA_ID,
  AREA_NAME,
  BBOX,
  CENTER,
  RADIUS_M,
  DEFAULT_LEVEL_HEIGHT_M,
  DEFAULT_BUILDING_HEIGHT_M,
  NOMINAL_GROUND_ALT_M,
  SITE_MIN_HEIGHT_M,
  SITE_MIN_AREA_M2,
} from "./config.mjs";
import { fetchOverpass, parseBuildings, resolveHeight } from "./lib/overpass.mjs";
import {
  ringToMeter,
  ringAreaM2,
  ringCentroid,
  closeRing,
  hash01,
  round,
} from "./lib/geo.mjs";
import {
  openDb,
  resetTables,
  upsertMeta,
  insertArea,
  insertBuilding,
  insertSite,
} from "./lib/db.mjs";

function bboxPolygonWgs84() {
  const { south, west, north, east } = BBOX;
  return {
    type: "Polygon",
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

async function main() {
  console.log(
    `[backfill] AO=${AREA_ID} center=(${CENTER.lon},${CENTER.lat}) r=${RADIUS_M}m`
  );
  const raw = await fetchOverpass(BBOX);
  const { buildings } = parseBuildings(raw);
  console.log(`[backfill] OSM 건물 way: ${buildings.length}`);

  const db = openDb();
  resetTables(db);

  const meta = upsertMeta(db);
  const area = insertArea(db);
  const bld = insertBuilding(db);
  const site = insertSite(db);

  const tx = db.transaction(() => {
    meta.run({ key: "area_id", value: AREA_ID });
    meta.run({ key: "crs_source", value: "EPSG:4326 (WGS84)" });
    meta.run({ key: "crs_export", value: "EPSG:5179" });
    meta.run({ key: "bbox", value: JSON.stringify(BBOX) });
    meta.run({ key: "ground_alt_note", value: "nominal 0m (평지 근사)" });

    area.run({
      area_id: AREA_ID,
      name: AREA_NAME,
      geom: JSON.stringify(bboxPolygonWgs84()),
    });

    let nBld = 0,
      nSite = 0;
    for (const b of buildings) {
      const ring = closeRing(b.ring);
      if (ring.length < 4) continue;
      const meterRing = ringToMeter(ring);
      const area_m2 = round(ringAreaM2(meterRing), 1);
      if (area_m2 < 1) continue;
      const [clon, clat] = ringCentroid(ring);
      const h = resolveHeight(b.tags, DEFAULT_LEVEL_HEIGHT_M, DEFAULT_BUILDING_HEIGHT_M);
      const bid = `B_${b.osmId}`;

      bld.run({
        building_id: bid,
        osm_id: b.osmId,
        name: b.tags.name ?? null,
        ground_alt_m: NOMINAL_GROUND_ALT_M,
        height_m: round(h.height_m, 1),
        levels: h.levels ?? null,
        height_source: h.height_source,
        is_obstacle: 1,
        footprint_area_m2: area_m2,
        centroid_lon: clon,
        centroid_lat: clat,
        geom: JSON.stringify({ type: "Polygon", coordinates: [ring] }),
      });
      nBld++;

      // 옥상 설치 후보지 채택
      if (h.height_m >= SITE_MIN_HEIGHT_M && area_m2 >= SITE_MIN_AREA_M2) {
        const r = hash01(bid); // 결정론적 합성 파라미터
        const install_alt = round(NOMINAL_GROUND_ALT_M + h.height_m, 1);
        const max_items = Math.max(1, Math.min(4, Math.floor(area_m2 / 4000) + 1));
        const power_kw = round(5 + r * 15, 1); // 5~20kW
        const network = r > 0.15 ? 1 : 0; // 대부분 연결 가능
        const access_score = round(0.4 + (1 - Math.min(h.height_m, 200) / 200) * 0.5, 2);
        const install_cost = Math.round(8000 + h.height_m * 120 + r * 6000);

        site.run({
          site_id: `S_${b.osmId}`,
          building_id: bid,
          name: b.tags.name ? `${b.tags.name} rooftop` : `rooftop ${b.osmId}`,
          install_alt_m: install_alt,
          rooftop_area_m2: area_m2,
          max_items,
          power_kw,
          network,
          access_score,
          install_cost,
          synthetic: 1,
          lon: clon,
          lat: clat,
        });
        nSite++;
      }
    }
    meta.run({ key: "n_buildings", value: String(nBld) });
    meta.run({ key: "n_install_sites", value: String(nSite) });
    return { nBld, nSite };
  });

  const { nBld, nSite } = tx();
  db.close();
  console.log(`[backfill] ✔ buildings=${nBld}  install_sites=${nSite}`);
  console.log(`[backfill] DB: data/${ACTIVE}.sqlite (priority_zones 는 seed 스크립트로 별도)`);
}

main().catch((e) => {
  console.error("[backfill] 실패:", e);
  process.exit(1);
});
