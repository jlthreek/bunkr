// Baseline 옵티마이저: 매우 단순한 greedy.
// 자산별로 "한계 이득(새로 덮는 보호 weight − 부수피해 − 비용)"이 최대인 후보지를
// 순서대로 채택. 알고리즘팀 구현으로 교체될 자리(placeholder).
import type {
  Optimizer,
  OptimInput,
  OptimResult,
  Placement,
  SiteInput,
  ZoneInput,
} from "./types";
import type { AssetKind } from "../assets";

const KINDS: AssetKind[] = ["scanner", "jammer", "counter"];
const COST_SCALE = 20000; // install_cost 정규화

function distM(aLon: number, aLat: number, bLon: number, bLat: number) {
  const kLat = 111320;
  const kLon = 111320 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot((aLon - bLon) * kLon, (aLat - bLat) * kLat);
}

function covers(site: SiteInput, zone: ZoneInput, rangeM: number) {
  return distM(site.lon, site.lat, zone.lon, zone.lat) <= rangeM;
}

export const greedyOptimizer: Optimizer = {
  name: "greedy-baseline",
  async run(input: OptimInput): Promise<OptimResult> {
    const t0 = performance.now();
    const used = new Set<string>();
    const placements: Placement[] = [];

    for (const kind of KINDS) {
      const n = input.budget[kind] ?? 0;
      const range = input.assetMeta[kind].rangeM;
      const isSoftHard = kind !== "scanner"; // 재머·대응만 부수피해 발생

      for (let k = 0; k < n; k++) {
        // 이 종류가 이미 덮은 양수 구역 (한계 이득 계산용)
        const coveredPos = new Set<string>();
        for (const p of placements) {
          if (p.kind !== kind) continue;
          for (const z of input.zones)
            if (z.weight > 0 && covers(siteAt(input, p.siteId)!, z, range))
              coveredPos.add(z.zoneId);
        }

        let best: SiteInput | null = null;
        let bestVal = -Infinity;
        for (const s of input.sites) {
          if (used.has(s.siteId)) continue;
          let v = 0;
          for (const z of input.zones) {
            if (!covers(s, z, range)) continue;
            if (z.weight > 0) {
              if (!coveredPos.has(z.zoneId)) v += z.weight; // 한계 이득
            } else if (isSoftHard) {
              v += z.weight; // 민감구역 침범 = 음수 페널티
            }
          }
          v -= s.installCost / COST_SCALE;
          if (v > bestVal) {
            bestVal = v;
            best = s;
          }
        }
        if (!best) break;
        used.add(best.siteId);
        placements.push({
          siteId: best.siteId,
          kind,
          lon: best.lon,
          lat: best.lat,
          rangeM: range,
        });
      }
    }

    const score = scoreConfig(placements, input);
    return {
      placements,
      score,
      meta: { optimizer: greedyOptimizer.name, ms: performance.now() - t0 },
    };
  },
};

function siteAt(input: OptimInput, id: string) {
  return input.sites.find((s) => s.siteId === id);
}

// 배치 구성 종합 점수
function scoreConfig(placements: Placement[], input: OptimInput): OptimResult["score"] {
  const posZones = input.zones.filter((z) => z.weight > 0);
  const totalPos = posZones.reduce((a, z) => a + z.weight, 0) || 1;

  let coveredPos = 0;
  for (const z of posZones) {
    const hit = placements.some((p) =>
      covers(siteAt(input, p.siteId)!, z, p.rangeM)
    );
    if (hit) coveredPos += z.weight;
  }

  let collateral = 0;
  for (const z of input.zones) {
    if (z.weight >= 0) continue;
    const hit = placements.some(
      (p) => p.kind !== "scanner" && covers(siteAt(input, p.siteId)!, z, p.rangeM)
    );
    if (hit) collateral += Math.abs(z.weight);
  }

  const cost = placements.reduce(
    (a, p) => a + (siteAt(input, p.siteId)?.installCost ?? 0),
    0
  );

  const protectedCoverage = coveredPos / totalPos;
  const total = coveredPos - collateral - cost / COST_SCALE;
  return { protectedCoverage, collateralPenalty: collateral, cost, total };
}
