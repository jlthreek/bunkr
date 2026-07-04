// priority_zones 시드 (보호/접근/민감 구역). 위치별 손 관리 예시 구역.
// 사용: LOCATION=gwanghwamun node scripts/seed-zones.mjs  (재실행 시 전량 교체)
import { openDb } from "./lib/db.mjs";
import { ACTIVE } from "./config.mjs";

// WGS84 사각 폴리곤 헬퍼 (중심 lon/lat, 반폭·반높이 m)
function box(lon, lat, halfW, halfH) {
  const dLat = halfH / 111320;
  const dLon = halfW / (111320 * Math.cos((lat * Math.PI) / 180));
  const ring = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ];
  return { type: "Polygon", coordinates: [ring] };
}

// 위치별 예시 구역 (실제 배치 감각에 맞춰 editable)
const ZONES_BY_LOC = {
  gwanghwamun: [
    {
      zone_id: "Z_GH_GOV",
      name: "정부서울청사 핵심 보호",
      zone_type: "protected",
      weight: 10,
      geom: box(126.9758, 37.5754, 180, 180),
    },
    {
      zone_id: "Z_GH_PALACE",
      name: "경복궁 문화유산 보호",
      zone_type: "protected",
      weight: 8,
      geom: box(126.9769, 37.5786, 260, 230),
    },
    {
      zone_id: "Z_GH_PLAZA",
      name: "광화문광장 군중밀집(민감)",
      zone_type: "sensitive",
      weight: -8,
      geom: box(126.9769, 37.5735, 120, 300),
    },
    {
      zone_id: "Z_GH_APPROACH_S",
      name: "세종대로 남측 접근 회랑",
      zone_type: "approach",
      weight: 5,
      geom: box(126.9769, 37.5698, 220, 320),
    },
  ],
  yangjae: [
    {
      zone_id: "Z_CORE",
      name: "양재역 핵심 보호구역",
      zone_type: "protected",
      weight: 10,
      geom: box(127.03454, 37.48378, 180, 150),
    },
    {
      zone_id: "Z_APPROACH_S",
      name: "남측 양재대로 접근 회랑",
      zone_type: "approach",
      weight: 5,
      geom: box(127.0347, 37.4782, 250, 400),
    },
    {
      zone_id: "Z_RESID_NE",
      name: "북동측 주거지(민감)",
      zone_type: "sensitive",
      weight: -8,
      geom: box(127.0435, 37.4901, 320, 260),
    },
    {
      zone_id: "Z_SCHOOL_W",
      name: "서측 학교·생활권(민감)",
      zone_type: "sensitive",
      weight: -6,
      geom: box(127.0278, 37.4845, 220, 200),
    },
  ],
};

const ZONES = ZONES_BY_LOC[ACTIVE];
if (!ZONES) {
  console.warn(`[seed-zones] ${ACTIVE} 용 구역 정의 없음 — priority_zones 비움`);
}

const db = openDb();
const stmt = db.prepare(
  `INSERT INTO priority_zones(zone_id,name,zone_type,weight,geom)
   VALUES(@zone_id,@name,@zone_type,@weight,@geom)
   ON CONFLICT(zone_id) DO UPDATE SET
     name=excluded.name, zone_type=excluded.zone_type,
     weight=excluded.weight, geom=excluded.geom`
);
const tx = db.transaction(() => {
  db.exec("DELETE FROM priority_zones");
  for (const z of ZONES ?? []) stmt.run({ ...z, geom: JSON.stringify(z.geom) });
});
tx();
console.log(`[seed-zones] (${ACTIVE}) ✔ priority_zones=${ZONES?.length ?? 0}`);
for (const z of ZONES ?? [])
  console.log(`  - ${z.zone_id} ${z.zone_type} w=${z.weight} ${z.name}`);
db.close();
