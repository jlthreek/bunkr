// 최적배치 옵티마이저 계약 (순수 데이터 in/out, Cesium 무관 → 교체·테스트 용이).
// 알고리즘팀은 이 인터페이스로 구현체만 등록(또는 서버 호출로 감싸)면 됨.
import type { AssetKind } from "../assets";

export interface SiteInput {
  siteId: string;
  buildingId: string;
  lon: number;
  lat: number;
  installAltM: number;
  maxItems: number;
  powerKw: number;
  network: boolean;
  accessScore: number;
  installCost: number;
}

export interface ZoneInput {
  zoneId: string;
  zoneType: "protected" | "approach" | "sensitive";
  weight: number; // 보호/접근 +, 민감 -
  lon: number; // 무게중심
  lat: number;
}

export type AssetBudget = Record<AssetKind, number>;
export type AssetMeta = Record<AssetKind, { rangeM: number }>;

export interface OptimInput {
  sites: SiteInput[];
  zones: ZoneInput[];
  budget: AssetBudget;
  assetMeta: AssetMeta;
}

export interface Placement {
  siteId: string;
  kind: AssetKind;
  lon: number;
  lat: number;
  rangeM: number;
}

export interface OptimScore {
  protectedCoverage: number; // 0..1 (보호/접근 weight 커버 비율)
  collateralPenalty: number; // 재머/대응이 민감구역 침범한 |weight| 합
  cost: number; // 선택 후보지 install_cost 합
  total: number; // 종합 점수
}

export interface OptimResult {
  placements: Placement[];
  score: OptimScore;
  meta: { optimizer: string; ms: number };
}

// 옵티마이저 = 이름 + run(입력)→결과. async 로 두어 서버형 알고리즘도 수용.
export interface Optimizer {
  name: string;
  run(input: OptimInput): Promise<OptimResult>;
}
