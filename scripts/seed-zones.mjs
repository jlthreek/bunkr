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

// 서울시 실시간 도시데이터 혼잡도 → 민감(부수피해) 가중치 파생
const CONGEST_BASE = { 여유: 3, 보통: 5, "약간 붐빔": 7, 붐빔: 9 };
function popWeight(ppltnMax, lvl) {
  const base = CONGEST_BASE[lvl] ?? 4;
  return -Math.max(2, Math.min(9, base + Math.round(ppltnMax / 8000)));
}

// 위치별 예시 구역 (실제 배치 감각에 맞춰 editable)
const ZONES_BY_LOC = {
  // 광화문: 고가치 목표(protected) + 실시간 인구밀집(sensitive, 서울시 도시데이터 POI @2026-07-04 21:05)
  gwanghwamun: [
    // ── 고가치 목표 ──
    {
      zone_id: "Z_GH_GOV",
      name: "정부서울청사",
      zone_type: "protected",
      weight: 10,
      geom: box(126.9758, 37.5754, 170, 170),
      meta: { asset: "government_complex", value: "critical" },
    },
    {
      zone_id: "Z_GH_EMBASSY",
      name: "주한미국대사관",
      zone_type: "protected",
      weight: 9,
      geom: box(126.9801, 37.5663, 140, 140),
      meta: { asset: "us_embassy", value: "critical" },
    },
    {
      zone_id: "Z_GH_PALACE",
      name: "경복궁",
      zone_type: "protected",
      weight: 7,
      geom: box(126.977, 37.5793, 240, 220),
      meta: { asset: "gyeongbokgung", value: "high" },
    },
    {
      zone_id: "Z_GH_SEJONG",
      name: "세종문화회관·외교부",
      zone_type: "protected",
      weight: 5,
      geom: box(126.9755, 37.5731, 150, 140),
      meta: { asset: "sejong_center", value: "high" },
    },
    // ── 실시간 인구밀집 (민감, 부수피해) ──
    {
      zone_id: "Z_GH_PLAZA",
      name: "광화문광장",
      zone_type: "sensitive",
      weight: popWeight(5000, "여유"),
      geom: box(126.9769, 37.5735, 120, 300),
      meta: {
        poi: "POI088",
        population_max: 5000,
        congest_lvl: "여유",
        resnt_rate: 14.1,
        ppltn_time: "2026-07-04 21:05",
        source: "seoul_live citydata_ppltn",
      },
    },
    {
      zone_id: "Z_GH_CBD",
      name: "광화문·덕수궁 도심",
      zone_type: "sensitive",
      weight: popWeight(18000, "여유"),
      geom: box(126.9762, 37.569, 340, 300),
      meta: {
        poi: "POI009",
        population_max: 18000,
        congest_lvl: "여유",
        resnt_rate: 16.4,
        ppltn_time: "2026-07-04 21:05",
        source: "seoul_live citydata_ppltn",
      },
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
  `INSERT INTO priority_zones(zone_id,name,zone_type,weight,geom,meta)
   VALUES(@zone_id,@name,@zone_type,@weight,@geom,@meta)
   ON CONFLICT(zone_id) DO UPDATE SET
     name=excluded.name, zone_type=excluded.zone_type,
     weight=excluded.weight, geom=excluded.geom, meta=excluded.meta`
);
const tx = db.transaction(() => {
  db.exec("DELETE FROM priority_zones");
  for (const z of ZONES ?? [])
    stmt.run({
      zone_id: z.zone_id,
      name: z.name,
      zone_type: z.zone_type,
      weight: z.weight,
      geom: JSON.stringify(z.geom),
      meta: z.meta ? JSON.stringify(z.meta) : null,
    });
});
tx();
console.log(`[seed-zones] (${ACTIVE}) ✔ priority_zones=${ZONES?.length ?? 0}`);
for (const z of ZONES ?? [])
  console.log(`  - ${z.zone_id} ${z.zone_type} w=${z.weight} ${z.name}`);
db.close();
