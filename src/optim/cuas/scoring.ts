// C-UAS 장비별 셀 점수 — placement_algorithm.py 충실 포팅 (sector/PTZ 안테나 모델 포함).
import type { Cell, Equipment, Scenario, Site } from "./types";
import { BuildingIndex, clamp, losQuality, siteBaseAltitude, targetAltitudeForCell } from "./geometry";

const DEFAULT_PTZ_TYPES = new Set(["camera", "jammer"]);
export const ORIENTATIONS_DEG = [0, 45, 90, 135, 180, 225, 270, 315];

export function distanceScore(distanceM: number, rangeKm: number): number {
  const eff = rangeKm * 1000.0;
  if (distanceM > eff) return 0.0;
  const ratio = distanceM / Math.max(eff, 1.0);
  let s: number;
  if (ratio <= 0.3) s = 1.0;
  else if (ratio <= 0.6) s = 0.85 - (ratio - 0.3) * 0.5;
  else if (ratio <= 0.9) s = 0.7 - (ratio - 0.6) * 1.0;
  else s = 0.35 - (ratio - 0.9) * 3.5;
  return Math.min(Math.max(s, 0.0), 1.0);
}

export function angleDeltaDeg(a: number, b: number): number {
  return Math.abs((((a - b + 180.0) % 360.0) + 360.0) % 360.0 - 180.0);
}

function angleInSector(angle: number, start: number, end: number): boolean {
  const norm = (v: number) => ((v % 360.0) + 360.0) % 360.0;
  angle = norm(angle); start = norm(start); end = norm(end);
  if (start <= end) return start <= angle && angle <= end;
  return angle >= start || angle <= end;
}

function azimuthBlocked(site: Site, azimuth: number): boolean {
  for (const sec of site.azimuth_blocked_deg ?? []) {
    if (sec.length !== 2) continue;
    if (angleInSector(azimuth, sec[0], sec[1])) return true;
  }
  return false;
}

export function antennaPanMode(eq: Equipment): "fixed" | "ptz" {
  const a = eq.antenna ?? ({} as any);
  if (a.pan_mode) return String(a.pan_mode).toLowerCase() as any;
  if ((a as any).ptz !== undefined) return (a as any).ptz ? "ptz" : "fixed";
  if (DEFAULT_PTZ_TYPES.has(eq.type)) return "ptz";
  return "fixed";
}

export function coverageBeamwidthDeg(eq: Equipment): number {
  const a = eq.antenna ?? ({} as any);
  if (antennaPanMode(eq) === "ptz") return a.pan_range_deg ?? 360.0;
  return a.beamwidth_deg ?? 360.0;
}

export function candidateOrientations(eq: Equipment): (number | null)[] {
  const mode = eq.antenna?.mode ?? "omni";
  if (mode === "omni") return [null];
  if (antennaPanMode(eq) === "ptz" && coverageBeamwidthDeg(eq) >= 359.0) return [null];
  return ORIENTATIONS_DEG;
}

function orientationScore(site: Site, eq: Equipment, orientation: number | null, cell: Cell): number {
  const mode = eq.antenna?.mode ?? "omni";
  const azimuth = ((Math.atan2(cell.y - site.y, cell.x - site.x) * 180) / Math.PI + 360) % 360;
  if (azimuthBlocked(site, azimuth)) return 0.0;
  if (mode === "omni") return 1.0;
  const beam = coverageBeamwidthDeg(eq);
  if (orientation === null) return beam >= 359.0 ? 1.0 : 0.0;
  const delta = angleDeltaDeg(azimuth, orientation);
  if (delta > beam / 2.0) return 0.0;
  return Math.max(0.0, Math.min(1.0, 1.0 - (delta / Math.max(beam / 2.0, 1.0)) * 0.35));
}

function instantaneousBeamScore(site: Site, eq: Equipment, centerCell: Cell, targetCell: Cell): number {
  const beam = eq.antenna?.beamwidth_deg ?? coverageBeamwidthDeg(eq);
  if (beam >= 359.0) return 1.0;
  const ca = ((Math.atan2(centerCell.y - site.y, centerCell.x - site.x) * 180) / Math.PI + 360) % 360;
  const ta = ((Math.atan2(targetCell.y - site.y, targetCell.x - site.x) * 180) / Math.PI + 360) % 360;
  const delta = angleDeltaDeg(ca, ta);
  if (delta > beam / 2.0) return 0.0;
  return Math.max(0.0, Math.min(1.0, 1.0 - (delta / Math.max(beam / 2.0, 1.0)) * 0.35));
}

// PTZ 재머 누설: 보호구역 조향 가능 방향들과 민감셀 순간빔폭 겹침(보호가중 평균)
function ptzJammerLeakageOverlap(
  site: Site, eq: Equipment, orientation: number | null, sensitiveCell: Cell, cells: Cell[]
): number {
  if (antennaPanMode(eq) !== "ptz") return 1.0;
  let wo = 0.0, tw = 0.0;
  for (const pc of cells) {
    if (pc.weight <= 0) continue;
    if (orientationScore(site, eq, orientation, pc) <= 0.0) continue;
    if (distanceScore(Math.hypot(pc.x - site.x, pc.y - site.y), eq.range_km) <= 0.0) continue;
    const w = pc.weight;
    wo += w * instantaneousBeamScore(site, eq, pc, sensitiveCell);
    tw += w;
  }
  return tw <= 0.0 ? 0.0 : wo / tw;
}

function verticalScore(site: Site, eq: Equipment, cell: Cell, sc: Scenario): number {
  const vb = eq.antenna?.vertical_beamwidth_deg;
  if (vb == null) return 1.0;
  const horizontal = Math.max(Math.hypot(cell.x - site.x, cell.y - site.y), 1.0);
  const siteAlt = siteBaseAltitude(site) + (eq.mount_height_m ?? 0.0);
  const targetAlt = targetAltitudeForCell(sc, cell);
  const elevation = (Math.atan2(targetAlt - siteAlt, horizontal) * 180) / Math.PI;
  const tilt = eq.antenna?.tilt_deg ?? 0.0;
  const delta = Math.abs(elevation - tilt);
  const half = Math.max(vb / 2.0, 1.0);
  if (delta > half) return 0.0;
  return clamp(1.0 - 0.3 * (delta / half));
}

function bandFactor(eq: Equipment, threatBands: Record<string, number>): number {
  const supported = new Set(eq.bands ?? []);
  const total = Object.values(threatBands).reduce((a, b) => a + b, 0);
  if (total <= 0) return 1.0;
  let s = 0;
  for (const [band, w] of Object.entries(threatBands)) if (supported.has(band)) s += w;
  return s / total;
}

function perf(eq: Equipment, key: string, def: number): number {
  return eq.performance?.[key] ?? def;
}

function applyLos(base: number, quality: number, eq: Equipment, defaultFloor: number): number {
  const floor = perf(eq, "nlos_floor", defaultFloor);
  return base * clamp(floor + (1.0 - floor) * quality);
}

// 반환: [detect, identify, jam, scanner, leakage]
export function evaluateEquipmentCell(
  site: Site, eq: Equipment, orientation: number | null, cell: Cell, cells: Cell[],
  sc: Scenario, threatBands: Record<string, number>, index: BuildingIndex, losCache: Map<string, number>
): [number, number, number, number, number] {
  const distance = Math.hypot(cell.x - site.x, cell.y - site.y);
  const orient = orientationScore(site, eq, orientation, cell);
  const vertical = verticalScore(site, eq, cell, sc);
  const access = 0.75 + 0.25 * (site.access_score ?? 0.7);
  const los = losQuality(sc, site, eq, cell, index, losCache);
  const base = distanceScore(distance, eq.range_km) * orient * vertical * access;

  switch (eq.type) {
    case "scanner": {
      const value = applyLos(base * bandFactor(eq, threatBands), los, eq, 0.35);
      const detect = value * perf(eq, "detect_factor", 0.82);
      const scanner = value * perf(eq, "localization_factor", 1.0);
      return [detect, 0, 0, scanner, 0];
    }
    case "radar": {
      const value = applyLos(base, los, eq, 0.18);
      return [value * perf(eq, "detect_factor", 0.94), 0, 0, 0, 0];
    }
    case "camera": {
      const detectValue = applyLos(base, los, eq, 0.08);
      const idRange = eq.identify_range_km ?? eq.range_km;
      const idBase = distanceScore(distance, idRange) * orient * vertical * access;
      const idValue = applyLos(idBase, los, eq, 0.06);
      return [detectValue * perf(eq, "detect_factor", 0.5), idValue * perf(eq, "identify_factor", 0.92), 0, 0, 0];
    }
    case "jammer": {
      const value = applyLos(base * bandFactor(eq, threatBands), los, eq, 0.3);
      const jam = value * perf(eq, "jam_factor", 1.0);
      let leakage = 0.0;
      if (cell.weight < 0) {
        let lf = perf(eq, "leakage_factor", 1.0);
        if (antennaPanMode(eq) === "ptz") {
          lf *= perf(eq, "ptz_leakage_factor", 0.25);
          lf *= ptzJammerLeakageOverlap(site, eq, orientation, cell, cells);
        }
        leakage = jam * lf;
      }
      return [0, 0, jam, 0, leakage];
    }
  }
  return [0, 0, 0, 0, 0];
}
