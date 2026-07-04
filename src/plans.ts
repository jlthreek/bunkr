// ── 플랜 라이브러리 ────────────────────────────────────────────
// 설계(DEPLOY) 모드에서 배치한 방어 자산 구성을 이름 붙여 localStorage 에 저장하고,
// 작전(OPERATE) 모드에서 로드해 배포된 센서망으로 재구성한다.
// PlacedAsset 에서 Cesium entities 를 제외한 {kind,lon,lat} 만 직렬화한다.
import type { AssetKind } from "./assets";

export interface SavedPlanAsset {
  kind: AssetKind;
  lon: number;
  lat: number;
  // 2차 C-UAS 엔진(섹터/지향) 대비 예약 필드
  azimuth?: number;
  rangeM?: number;
}

export interface SavedPlanKpis {
  coverage: number; // 보호 커버리지 0..1
  collateral: number; // 부수피해 penalty
  cost: number; // 설치비용
  total: number; // 종합점수
}

export interface SavedPlan {
  id: string;
  name: string;
  locId: string;
  createdAt: number;
  assets: SavedPlanAsset[];
  kpis?: SavedPlanKpis;
}

const KEY = "bunkr.plans.v1";

function readAll(): SavedPlan[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedPlan[]) : [];
  } catch {
    return [];
  }
}

function writeAll(plans: SavedPlan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans));
  } catch (e) {
    console.error("[plans] 저장 실패:", e);
  }
}

// 특정 위치(locId)의 플랜만, 최신순
export function listPlans(locId?: string): SavedPlan[] {
  const all = readAll().sort((a, b) => b.createdAt - a.createdAt);
  return locId ? all.filter((p) => p.locId === locId) : all;
}

export function getPlan(id: string): SavedPlan | undefined {
  return readAll().find((p) => p.id === id);
}

export function savePlan(input: {
  name: string;
  locId: string;
  assets: SavedPlanAsset[];
  kpis?: SavedPlanKpis;
}): SavedPlan {
  const plan: SavedPlan = {
    id: `PLAN-${Date.now().toString(36).toUpperCase()}`,
    name: input.name.trim() || "무제 플랜",
    locId: input.locId,
    createdAt: Date.now(),
    assets: input.assets,
    kpis: input.kpis,
  };
  const all = readAll();
  all.push(plan);
  writeAll(all);
  return plan;
}

export function deletePlan(id: string): void {
  writeAll(readAll().filter((p) => p.id !== id));
}

export function renamePlan(id: string, name: string): void {
  const all = readAll();
  const p = all.find((x) => x.id === id);
  if (p) {
    p.name = name.trim() || p.name;
    writeAll(all);
  }
}

// 자산 종류 요약 (예: "RDR 2 · SCN 3 · JAM 2 · EFF 2")
export function planMix(assets: SavedPlanAsset[]): Record<AssetKind, number> {
  const m: Record<string, number> = {};
  for (const a of assets) m[a.kind] = (m[a.kind] ?? 0) + 1;
  return m as Record<AssetKind, number>;
}
