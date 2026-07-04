// 포팅된 cuas 제너레이터로 우리 지도(광화문 AO, WGS84)에 맞춘 위협체 리스트 생성.
// 사용: npx tsx scripts/gen-threats.ts [drones] [balloons] [birds] [seed] [locId]
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RNG } from "../src/cuas/rng";
import { makeFrame, toKm, toLonLat } from "../src/cuas/frame";
import { sampleProfile, type Kind } from "../src/cuas/profiles";
import { planPath, type Pt, type Obstacle } from "../src/cuas/pathfinding";
import { classify, distToAsset, type Asset } from "../src/cuas/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const nDrone = Number(process.argv[2] ?? 5);
const nBalloon = Number(process.argv[3] ?? 2);
const nBird = Number(process.argv[4] ?? 3);
const seed = Number(process.argv[5] ?? 42);
const locId = process.argv[6] ?? "gwanghwamun";

// 위치 center
const reg = JSON.parse(readFileSync(resolve(ROOT, "locations.json"), "utf8"));
const loc = reg.locations[locId];
const center = loc.center;
const frame = makeFrame(center.lon, center.lat);

// 자산 = 보호/접근 구역(weight>0) 중심
function centroid(geom: any): [number, number] {
  const rings: number[][][] =
    geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  let sx = 0, sy = 0, n = 0;
  for (const ring of rings) for (const [x, y] of ring) { sx += x; sy += y; n++; }
  return [sx / n, sy / n];
}
const zonesFc = JSON.parse(
  readFileSync(resolve(ROOT, `public/data/${locId}/priority_zones.geojson`), "utf8")
);
const assets: Asset[] = zonesFc.features
  .filter((f: any) => (f.properties?.weight ?? 0) > 0)
  .map((f: any) => {
    const [lon, lat] = centroid(f.geometry);
    const { x, y } = toKm(frame, lon, lat);
    return { name: f.properties.name, x, y, r: 0.3, weight: f.properties.weight };
  });

// 자산 가치(weight) 비례 목표 선택
function pickWeightedAsset(list: Asset[]): Asset {
  const total = list.reduce((s, a) => s + Math.max(0.1, a.weight ?? 1), 0);
  let r = rng.random() * total;
  for (const a of list) {
    r -= Math.max(0.1, a.weight ?? 1);
    if (r <= 0) return a;
  }
  return list[list.length - 1];
}

// 건물 장애물 (높이 인지 회피용)
const bFc = JSON.parse(
  readFileSync(resolve(ROOT, `public/data/${locId}/buildings.geojson`), "utf8")
);
const obstacles: Obstacle[] = [];
for (const f of bFc.features) {
  if (f.properties?.is_obstacle === false) continue;
  const ring = f.geometry?.coordinates?.[0];
  if (!ring || ring.length < 3) continue;
  const poly: Pt[] = ring.map(([lon, lat]: [number, number]) => {
    const { x, y } = toKm(frame, lon, lat);
    return [x, y] as Pt;
  });
  const h = f.properties?.height_m;
  obstacles.push(typeof h === "number" ? { polygon: poly, height: h } : poly);
}

const rng = new RNG(seed);
const mix: Kind[] = [
  ...Array(nDrone).fill("drone"),
  ...Array(nBalloon).fill("balloon"),
  ...Array(nBird).fill("bird"),
];
// shuffle (Fisher-Yates)
for (let i = mix.length - 1; i > 0; i--) {
  const j = Math.floor(rng.random() * (i + 1));
  [mix[i], mix[j]] = [mix[j], mix[i]];
}

const list = mix.map((kind, i) => {
  const prof = sampleProfile(rng, kind);
  const ang = rng.uniform(0, 2 * Math.PI);
  const r0 = rng.uniform(3.8, 4.8);
  const spawnKm: Pt = [r0 * Math.cos(ang), r0 * Math.sin(ang)];
  const spawnLL = toLonLat(frame, spawnKm[0], spawnKm[1]);

  let target: Asset | null = null;
  let waypoints: Pt[] | null = null;
  if (kind === "drone" && assets.length) {
    target = pickWeightedAsset(assets);
    // 높이 인지 회피: 순항고도보다 높은 건물만 우회
    waypoints = planPath(spawnKm, [target.x, target.y], obstacles, prof.alt);
  }
  // 스폰 시점 관측 기반 초기 분류 (윈드정합 0)
  const { ttype, pUav } = classify(prof.rcs, prof.alt, prof.mdop, prof.rfPresent, prof.rfClass, 0);
  const dAsset = distToAsset(assets, spawnKm[0], spawnKm[1]);

  return {
    id: `T${String(i).padStart(2, "0")}`,
    truth: kind,
    subtype: prof.subtype,
    pred: ttype,
    p_uav: pUav,
    spawn: { lon: +spawnLL.lon.toFixed(6), lat: +spawnLL.lat.toFixed(6), km: [round(spawnKm[0]), round(spawnKm[1])] },
    target: target ? target.name : "(표류)",
    target_lonlat: target ? ll(frame, target) : null,
    alt_m: Math.round(prof.alt),
    speed_mps: +prof.speed.toFixed(1),
    rcs_dbsm: +prof.rcs.toFixed(1),
    mdop: prof.mdop,
    rf_class: prof.rfClass,
    dist_to_asset_km: +dAsset.toFixed(2),
    waypoints_km: waypoints ? waypoints.map((w) => [round(w[0]), round(w[1])]) : null,
  };
});

function round(v: number) { return Math.round(v * 1000) / 1000; }
function ll(f: any, a: Asset) {
  const p = toLonLat(f, a.x, a.y);
  return { lon: +p.lon.toFixed(6), lat: +p.lat.toFixed(6) };
}

// ── 콘솔 표 출력 ──
console.log(`\n[gen-threats] ${locId} AO · seed=${seed} · 자산 ${assets.length}개 (${assets.map(a=>a.name).join(", ")})`);
console.log(`총 ${list.length}기 (드론 ${nDrone} · 풍선 ${nBalloon} · 조류 ${nBird})\n`);
console.log(
  "ID   truth    subtype             pred      p_uav  alt(m)  spd    rcs    d(km)  target"
);
for (const t of list) {
  console.log(
    `${t.id}  ${pad(t.truth, 7)}  ${pad(t.subtype, 18)}  ${pad(t.pred, 8)}  ` +
    `${t.p_uav.toFixed(2)}   ${pad(String(t.alt_m), 6)}  ${pad(t.speed_mps.toFixed(0), 4)}  ` +
    `${pad(t.rcs_dbsm.toFixed(1), 6)} ${pad(t.dist_to_asset_km.toFixed(2), 5)}  ${t.target}`
  );
}
function pad(s: string, n: number) { return (s + " ".repeat(n)).slice(0, n); }

// ── 파일 저장: JSON 리스트 + 스폰 GeoJSON ──
const outJson = resolve(ROOT, `public/data/${locId}/threats_sample.json`);
writeFileSync(outJson, JSON.stringify({ locId, seed, count: list.length, assets: assets.map(a=>a.name), tracks: list }, null, 2));

const geo = {
  type: "FeatureCollection",
  name: "threats_sample_spawn",
  features: list.map((t) => ({
    type: "Feature",
    properties: {
      id: t.id, truth: t.truth, subtype: t.subtype, pred: t.pred,
      p_uav: t.p_uav, alt_m: t.alt_m, speed_mps: t.speed_mps, rcs_dbsm: t.rcs_dbsm,
      target: t.target,
    },
    geometry: { type: "Point", coordinates: [t.spawn.lon, t.spawn.lat] },
  })),
};
const outGeo = resolve(ROOT, `public/data/${locId}/threats_sample.geojson`);
writeFileSync(outGeo, JSON.stringify(geo, null, 2));

console.log(`\n저장: public/data/${locId}/threats_sample.json · threats_sample.geojson`);
