// 데이터 파이프라인 공통 설정 (백필 / 익스포트 공용)
// 활성 위치는 env LOCATION 으로 선택 (미지정 시 locations.json 의 default)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");

const REG = JSON.parse(readFileSync(resolve(ROOT, "locations.json"), "utf8"));
export const ACTIVE = process.env.LOCATION || REG.default;
const loc = REG.locations[ACTIVE];
if (!loc) {
  throw new Error(
    `unknown LOCATION="${ACTIVE}". 사용 가능: ${Object.keys(REG.locations).join(", ")}`
  );
}

// ── 활성 분석 대상 영역 ────────────────────────────────────────
export const AREA_ID = loc.area_id;
export const AREA_NAME = loc.name_en || loc.name;
export const CENTER = loc.center;
export const RADIUS_M = loc.radius_m;

const dLat = RADIUS_M / 111320;
const dLon = RADIUS_M / (111320 * Math.cos((CENTER.lat * Math.PI) / 180));
export const BBOX = {
  south: CENTER.lat - dLat,
  north: CENTER.lat + dLat,
  west: CENTER.lon - dLon,
  east: CENTER.lon + dLon,
};

// ── 좌표계 ────────────────────────────────────────────────────
export const EPSG5179 =
  "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs";
export const WGS84 = "EPSG:4326";

// ── 건물/후보지 파생 규칙 ──────────────────────────────────────
export const DEFAULT_LEVEL_HEIGHT_M = 3.0;
export const DEFAULT_BUILDING_HEIGHT_M = 9.0;
export const NOMINAL_GROUND_ALT_M = 0;
export const SITE_MIN_HEIGHT_M = 15;
export const SITE_MIN_AREA_M2 = 300;

// ── 경로 (위치별 네임스페이스) ─────────────────────────────────
export const DB_PATH = resolve(ROOT, `data/${ACTIVE}.sqlite`);
export const CACHE_DIR = resolve(ROOT, "data/cache");
export const OUT_WGS84_DIR = resolve(ROOT, `public/data/${ACTIVE}`);
export const OUT_5179_DIR = resolve(ROOT, `export/epsg5179/${ACTIVE}`);
