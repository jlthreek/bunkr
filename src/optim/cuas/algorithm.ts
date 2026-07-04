// C-UAS 배치 알고리즘 본체 — placement_algorithm.py 충실 포팅
// (후보생성 → 점수 사전계산 → 요구조건 → greedy + local search).
import type {
  Candidate, Cell, Optimization, PlanScore, RequirementCheck, Scenario, Site,
} from "./types";
import { BuildingIndex, buildCells } from "./geometry";
import { candidateOrientations, evaluateEquipmentCell } from "./scoring";

function candidateAllowed(site: Site, eq: { type: string; requires_network?: boolean; power_kw?: number; min_rooftop_area_m2?: number }): boolean {
  if (site.allowed_equipment_types && !site.allowed_equipment_types.includes(eq.type)) return false;
  if (eq.requires_network && !site.network) return false;
  if ((site.power_kw ?? 0) < (eq.power_kw ?? 0)) return false;
  if ((site.rooftop_area_m2 ?? 0) < (eq.min_rooftop_area_m2 ?? 0)) return false;
  return true;
}

export function buildCandidates(sc: Scenario, cells: Cell[], index: BuildingIndex): Candidate[] {
  const threatBands = sc.optimization.threat_bands;
  const losCache = new Map<string, number>();
  const candidates: Candidate[] = [];
  let idx = 0;
  for (const site of sc.sites) {
    for (const eq of sc.equipment) {
      if (!candidateAllowed(site, eq)) continue;
      for (const orientation of candidateOrientations(eq)) {
        const detect = new Float64Array(cells.length);
        const identify = new Float64Array(cells.length);
        const jam = new Float64Array(cells.length);
        const scanner = new Float64Array(cells.length);
        const leakage = new Float64Array(cells.length);
        for (let c = 0; c < cells.length; c++) {
          const [d, i, j, s, l] = evaluateEquipmentCell(
            site, eq, orientation, cells[c], cells, sc, threatBands, index, losCache
          );
          detect[c] = d; identify[c] = i; jam[c] = j; scanner[c] = s; leakage[c] = l;
        }
        candidates.push({
          index: idx++, site_id: site.id, site_name: site.name,
          equipment_id: eq.id, equipment_name: eq.name, equipment_type: eq.type,
          orientation_deg: orientation, power_kw: eq.power_kw,
          required_rooftop_area_m2: eq.min_rooftop_area_m2 ?? 0,
          x: site.x, y: site.y, lon: site.lon ?? null, lat: site.lat ?? null,
          altitude_m: (site.install_alt_m ?? (site.ground_alt ?? 0) + (site.height ?? 0)) + (eq.mount_height_m ?? 0),
          access_score: site.access_score ?? 0.7,
          detect, identify, jam, scanner, leakage,
        });
      }
    }
  }
  return candidates;
}

function combineProbability(values: number[]): number {
  let miss = 1.0;
  for (const v of values) miss *= 1.0 - Math.max(0.0, Math.min(1.0, v));
  return 1.0 - miss;
}

function localizationScore(selected: Candidate[], cell: Cell): number {
  const scanners = selected.filter((c) => c.scanner[cell.index] > 0.18);
  if (scanners.length < 2) return 0.0;
  let best = 0.0;
  for (let i = 0; i < scanners.length; i++) {
    for (let j = i + 1; j < scanners.length; j++) {
      const a = scanners[i], b = scanners[j];
      const va = Math.atan2(a.y - cell.y, a.x - cell.x);
      const vb = Math.atan2(b.y - cell.y, b.x - cell.x);
      const sep = Math.abs(Math.sin(va - vb));
      const strength = Math.min(a.scanner[cell.index], b.scanner[cell.index]);
      best = Math.max(best, sep * strength);
    }
  }
  const redundancy = Math.min(1.0, 0.15 * (scanners.length - 2));
  return Math.min(1.0, best + redundancy);
}

function evaluateRequirements(
  selected: Candidate[], coverage: PlanScore["coverage"], powerKw: number, req: NonNullable<Optimization["requirements"]>
): [RequirementCheck[], number] {
  const checks: RequirementCheck[] = [];
  let penalty = 0.0;
  const typeCounts: Record<string, number> = {};
  for (const c of selected) typeCounts[c.equipment_type] = (typeCounts[c.equipment_type] ?? 0) + 1;

  const add = (name: string, actual: number, op: "min" | "max", target: number, scale = 1.0) => {
    let passed: boolean, deficit: number;
    if (op === "min") { passed = actual >= target; deficit = Math.max(0.0, target - actual); }
    else { passed = actual <= target; deficit = Math.max(0.0, actual - target); }
    if (deficit > 0.0) penalty += deficit * scale;
    checks.push({ name, actual: round6(actual), operator: op, target, passed });
  };

  const metricMap: [keyof typeof req, keyof PlanScore["coverage"], "min" | "max", number][] = [
    ["detect_avg_min", "detect_avg", "min", 100.0],
    ["identify_avg_min", "identify_avg", "min", 100.0],
    ["jam_avg_min", "jam_avg", "min", 100.0],
    ["localize_avg_min", "localize_avg", "min", 100.0],
    ["uncovered_weight_ratio_max", "uncovered_weight_ratio", "max", 100.0],
    ["leakage_penalty_max", "leakage_penalty", "max", 1.0],
  ];
  for (const [key, metric, op, scale] of metricMap) {
    if (req[key] != null) add(metric, coverage[metric], op, req[key] as number, scale);
  }
  if (req.power_kw_max != null) add("power_kw", powerKw, "max", req.power_kw_max, 5.0);
  if (req.equipment_count_min != null) add("equipment_count", selected.length, "min", req.equipment_count_min, 5.0);
  if (req.equipment_count_max != null) add("equipment_count", selected.length, "max", req.equipment_count_max, 5.0);
  for (const [t, target] of Object.entries(req.min_type_counts ?? {})) add(`${t}_count`, typeCounts[t] ?? 0, "min", target, 5.0);
  for (const [t, target] of Object.entries(req.max_type_counts ?? {})) add(`${t}_count`, typeCounts[t] ?? 0, "max", target, 5.0);
  return [checks, penalty];
}

export function scorePlan(selected: Candidate[], cells: Cell[], opt: Optimization): PlanScore {
  const w = opt.coverage_weights;
  let objective = 0.0, positiveWeight = 0.0;
  let detectTotal = 0.0, identifyTotal = 0.0, jamTotal = 0.0, localizeTotal = 0.0;
  let leakagePenalty = 0.0, uncovered = 0.0;
  const byCell: PlanScore["cells"] = [];

  for (const cell of cells) {
    if (cell.weight === 0) continue;
    const detect = combineProbability(selected.map((c) => c.detect[cell.index]));
    const identify = combineProbability(selected.map((c) => c.identify[cell.index]));
    const jam = combineProbability(selected.map((c) => c.jam[cell.index]));
    const localize = localizationScore(selected, cell);
    if (cell.weight > 0) {
      const cs = cell.weight * (w.detect * detect + w.identify * identify + w.jam * jam + w.localize * localize);
      objective += cs;
      positiveWeight += cell.weight;
      detectTotal += cell.weight * detect;
      identifyTotal += cell.weight * identify;
      jamTotal += cell.weight * jam;
      localizeTotal += cell.weight * localize;
      if (detect < 0.35 && jam < 0.35) uncovered += cell.weight;
    } else {
      const leak = combineProbability(selected.map((c) => c.leakage[cell.index]));
      leakagePenalty += Math.abs(cell.weight) * leak;
      objective -= Math.abs(cell.weight) * leak * 0.75;
    }
    byCell.push({ index: cell.index, x: cell.x, y: cell.y, weight: cell.weight, detect, identify, jam, localize });
  }

  const denom = Math.max(positiveWeight, 1.0);
  const powerKw = selected.reduce((a, c) => a + c.power_kw, 0);
  const coverage = {
    detect_avg: detectTotal / denom, identify_avg: identifyTotal / denom,
    jam_avg: jamTotal / denom, localize_avg: localizeTotal / denom,
    uncovered_weight_ratio: uncovered / denom, leakage_penalty: leakagePenalty,
  };
  const [checks, reqPenalty] = evaluateRequirements(selected, coverage, powerKw, opt.requirements ?? {});
  objective -= reqPenalty * (opt.requirement_penalty_weight ?? 1.0);
  return {
    objective, coverage, requirements: checks,
    requirements_passed: checks.every((c) => c.passed),
    requirement_penalty: reqPenalty, power_kw: powerKw, cells: byCell,
  };
}

// ── 제약 ──────────────────────────────────────────────────────
function violatesConstraints(cand: Candidate, selected: Candidate[], sc: Scenario, maxItems: number): boolean {
  if (selected.includes(cand)) return true;
  if (selected.length >= maxItems) return true;
  const siteById = new Map(sc.sites.map((s) => [s.id, s]));
  const site = siteById.get(cand.site_id)!;
  const cons = sc.optimization.site_constraints ?? {};
  if (cons.exclusive_site && selected.some((c) => c.site_id === cand.site_id)) return true;

  const siteSelected = selected.filter((c) => c.site_id === cand.site_id);
  const siteLimit = site.max_items ?? 1;
  if (siteSelected.length + 1 > siteLimit) return true;

  const sitePower = siteSelected.reduce((a, c) => a + c.power_kw, 0);
  if (sitePower + cand.power_kw > (site.power_kw ?? 0)) return true;

  const siteArea = siteSelected.reduce((a, c) => a + c.required_rooftop_area_m2, 0);
  if (siteArea + cand.required_rooftop_area_m2 > (site.rooftop_area_m2 ?? 0)) return true;

  const sameEqLimit = site.same_equipment_limit ?? cons.same_equipment_per_site_limit ?? 1;
  const sameEqCount = siteSelected.filter((c) => c.equipment_id === cand.equipment_id).length;
  if (sameEqCount + 1 > sameEqLimit) return true;

  const typeLimits: Record<string, number> = { ...(cons.type_limits_per_site ?? {}), ...(site.type_limits ?? {}) };
  const typeLimit = typeLimits[cand.equipment_type] ?? siteLimit;
  const sameTypeCount = siteSelected.filter((c) => c.equipment_type === cand.equipment_type).length;
  if (sameTypeCount + 1 > typeLimit) return true;

  for (const pair of cons.incompatible_type_pairs_per_site ?? []) {
    if (pair.length !== 2) continue;
    const blocked = new Set(pair);
    if (blocked.has(cand.equipment_type)) {
      for (const item of siteSelected) {
        if (blocked.has(item.equipment_type) && item.equipment_type !== cand.equipment_type) return true;
      }
    }
  }
  return false;
}

function requiredMinTypeCounts(sc: Scenario): Record<string, number> {
  return { ...(sc.optimization.requirements?.min_type_counts ?? {}) };
}
function meetsMinTypeCounts(selected: Candidate[], sc: Scenario): boolean {
  const req = requiredMinTypeCounts(sc);
  const counts: Record<string, number> = {};
  for (const c of selected) counts[c.equipment_type] = (counts[c.equipment_type] ?? 0) + 1;
  return Object.entries(req).every(([t, n]) => (counts[t] ?? 0) >= n);
}

type Rank = [number, number, number];
function planRank(r: PlanScore): Rank {
  return [r.requirements_passed ? 1 : 0, -r.requirement_penalty, r.objective];
}
function rankGt(a: Rank, b: Rank): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  if (a[1] !== b[1]) return a[1] > b[1];
  return a[2] > b[2];
}
function planImproves(trial: PlanScore, baseline: PlanScore, minGain: number): boolean {
  const t = planRank(trial), b = planRank(baseline);
  if (t[0] !== b[0] || t[1] !== b[1]) return t[0] !== b[0] ? t[0] > b[0] : t[1] > b[1];
  return t[2] > b[2] + minGain;
}

function seedMinTypeCounts(candidates: Candidate[], cells: Cell[], sc: Scenario, maxItems: number): Candidate[] {
  const req = requiredMinTypeCounts(sc);
  if (!Object.keys(req).length) return [];
  const opt = sc.optimization;
  const selected: Candidate[] = [];
  for (;;) {
    const counts: Record<string, number> = {};
    for (const c of selected) counts[c.equipment_type] = (counts[c.equipment_type] ?? 0) + 1;
    const missing = new Set(Object.entries(req).filter(([t, n]) => (counts[t] ?? 0) < n).map(([t]) => t));
    if (!missing.size) return selected;
    let best: Candidate | null = null, bestRes: PlanScore | null = null;
    for (const cand of candidates) {
      if (!missing.has(cand.equipment_type)) continue;
      if (violatesConstraints(cand, selected, sc, maxItems)) continue;
      const res = scorePlan([...selected, cand], cells, opt);
      if (!bestRes || rankGt(planRank(res), planRank(bestRes))) { best = cand; bestRes = res; }
    }
    if (!best) return selected;
    selected.push(best);
  }
}

export function greedySelect(candidates: Candidate[], cells: Cell[], sc: Scenario, maxItems: number): Candidate[] {
  const opt = sc.optimization;
  const minGain = opt.minimum_gain ?? 0.0;
  let selected = seedMinTypeCounts(candidates, cells, sc, maxItems);
  let current = scorePlan(selected, cells, opt);
  for (;;) {
    let best: Candidate | null = null, bestRes: PlanScore | null = null;
    for (const cand of candidates) {
      if (violatesConstraints(cand, selected, sc, maxItems)) continue;
      const res = scorePlan([...selected, cand], cells, opt);
      if (!planImproves(res, current, minGain)) continue;
      if (!bestRes || rankGt(planRank(res), planRank(bestRes))) { best = cand; bestRes = res; }
    }
    if (!best) break;
    selected.push(best);
    current = bestRes ?? scorePlan(selected, cells, opt);
  }
  return selected;
}

export function localSearch(selected: Candidate[], candidates: Candidate[], cells: Cell[], sc: Scenario, maxItems: number): Candidate[] {
  const opt = sc.optimization;
  let improved = true;
  while (improved) {
    improved = false;
    let baseline = scorePlan(selected, cells, opt);
    for (const old of [...selected]) {
      const reduced = selected.filter((c) => c.index !== old.index);
      for (const nw of candidates) {
        if (nw.index === old.index) continue;
        if (violatesConstraints(nw, reduced, sc, maxItems)) continue;
        const trial = [...reduced, nw];
        if (!meetsMinTypeCounts(trial, sc)) continue;
        const value = scorePlan(trial, cells, opt);
        if (planImproves(value, baseline, 0.2)) { selected = trial; baseline = value; improved = true; break; }
      }
      if (improved) break;
    }
  }
  return selected;
}

function round6(n: number): number { return Math.round(n * 1e6) / 1e6; }

// 전체 실행: 시나리오 → 선택된 배치 + 점수
export function runCuas(sc: Scenario, maxItems?: number): { selected: Candidate[]; score: PlanScore; cellCount: number; candidateCount: number } {
  const cells = buildCells(sc);
  const index = new BuildingIndex(sc.buildings);
  const candidates = buildCandidates(sc, cells, index);
  const mi = maxItems ?? sc.optimization.max_items;
  let selected = greedySelect(candidates, cells, sc, mi);
  selected = localSearch(selected, candidates, cells, sc, mi);
  const score = scorePlan(selected, cells, sc.optimization);
  return { selected, score, cellCount: cells.length, candidateCount: candidates.length };
}
