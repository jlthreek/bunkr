// C-UAS 포팅 헤드리스 검증: 실제 광화문 데이터로 배치 계산 + 타이밍.
// 사용: npx tsx scripts/test-cuas.ts [locId] [siteCap] [maxItems]
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCuasScenario } from "../src/optim/cuas/adapter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const locId = process.argv[2] ?? "gwanghwamun";
const siteCap = Number(process.argv[3] ?? 40);
const maxItems = Number(process.argv[4] ?? 8);

const reg = JSON.parse(readFileSync(resolve(ROOT, "locations.json"), "utf8"));
const loc = reg.locations[locId];
const rd = (n: string) => JSON.parse(readFileSync(resolve(ROOT, `public/data/${locId}/${n}.geojson`), "utf8"));
const fc = { zones: rd("priority_zones"), sites: rd("install_sites"), buildings: rd("buildings") };

console.log(`[test-cuas] ${locId} · siteCap=${siteCap} · maxItems=${maxItems}`);
console.log(`데이터: 구역 ${fc.zones.features.length} · 후보지 ${fc.sites.features.length} · 건물 ${fc.buildings.features.length}`);

const t0 = performance.now();
const r = runCuasScenario(fc, loc.center, { radiusM: loc.radius_m, siteCap, maxItems });
const ms = performance.now() - t0;

console.log(`\n셀 ${r.cellCount} · 후보 ${r.candidateCount} · 계산 ${ms.toFixed(0)}ms`);
console.log(`\n=== 선택된 배치 (${r.selected.length}기) ===`);
console.log("SITE        EQUIPMENT       TYPE      방위    고도    전력");
for (const c of r.selected) {
  const az = c.orientation_deg == null ? "PTZ/전방위" : `${c.orientation_deg}°`;
  console.log(
    `${c.site_id.padEnd(11)} ${c.equipment_id.padEnd(15)} ${c.equipment_type.padEnd(9)} ${az.padEnd(7)} ${c.altitude_m.toFixed(0).padStart(4)}m  ${c.power_kw}kW`
  );
}
const s = r.score;
console.log(`\n=== KPI ===`);
console.log(`objective        ${s.objective.toFixed(2)}`);
console.log(`detect  avg      ${s.coverage.detect_avg.toFixed(3)}`);
console.log(`identify avg     ${s.coverage.identify_avg.toFixed(3)}`);
console.log(`jam     avg      ${s.coverage.jam_avg.toFixed(3)}`);
console.log(`localize avg     ${s.coverage.localize_avg.toFixed(3)}`);
console.log(`uncovered ratio  ${s.coverage.uncovered_weight_ratio.toFixed(3)}`);
console.log(`leakage penalty  ${s.coverage.leakage_penalty.toFixed(3)}`);
console.log(`requirements     ${s.requirements_passed ? "PASS" : "FAIL"} (penalty ${s.requirement_penalty.toFixed(2)})`);
for (const chk of s.requirements) {
  console.log(`  ${chk.passed ? "✓" : "✗"} ${chk.name.padEnd(22)} ${chk.actual} ${chk.operator} ${chk.target}`);
}
