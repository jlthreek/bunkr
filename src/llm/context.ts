// 실시간 COP 스냅샷 빌더 — 매 지휘관 질의 시 현재 통합상황도를 구조화해
// LLM(의사결정 지원관)에 유일한 사실 근거로 주입한다.
import type { Track } from "../sim/drones";
import type { PlacedAsset, AssetKind } from "../assets";
import { ASSET_SPECS } from "../assets";

// main.ts 가 매 질의 시점에 제공하는 라이브 상태.
export interface CopState {
  locName: string;
  popDensity: number; // 0~1 인구밀집(부수피해 판단)
  population?: {
    congest_lvl?: string;
    population_max?: number;
    ppltn_time?: string;
  };
  threatCondition: string; // LOW · ELEVATED · HIGH · CRITICAL
  tracks: Track[];
  assets: PlacedAsset[];
}

const ASSET_LABEL = Object.fromEntries(
  ASSET_SPECS.map((s) => [s.kind, s.label])
) as Record<AssetKind, string>;

// popDensity(0~1) → 서술형(부수피해 판단 보조)
function densityWord(d: number): string {
  if (d >= 0.7) return "매우 높음";
  if (d >= 0.5) return "높음";
  if (d >= 0.3) return "보통";
  return "낮음";
}

function killWord(kill: string): string {
  return kill === "hard" ? "하드킬" : kill === "soft" ? "소프트킬" : "감시";
}

// 트랙 1개 → 판독 가능한 한 줄. 미확인 트랙은 상세를 노출하지 않는다(센서 미확인).
function trackLine(t: Track): string {
  if (!t.detected) {
    return `- ${t.id}: 미확인(센서 미포착) · 분류/위협도 판단 제한`;
  }
  const eng =
    t.engaged === "hard"
      ? " · [교전:하드킬 진행]"
      : t.engaged === "soft"
      ? " · [교전:재밍 진행]"
      : "";
  return (
    `- ${t.id}: ${t.pred}(${t.subtype}) · 위협도 T=${t.T.toFixed(0)} · ` +
    `속도 ${t.speed.toFixed(0)}m/s · 고도 ${t.altM.toFixed(0)}m · ` +
    `방호자산까지 ${t.dAsset.toFixed(2)}km · ` +
    `권고 ${t.response.label}(${killWord(t.response.kill)}, 부수피해 ${t.response.collateral})${eng}`
  );
}

// 방어 자산 배치 요약(유형별 수량 + 효과기 활성).
function assetSummary(assets: PlacedAsset[]): string {
  if (!assets.length) return "배치된 방어 자산 없음(탐지·교전 자산 미전개).";
  const byKind: Record<string, number> = {};
  for (const a of assets) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  return Object.entries(byKind)
    .map(([k, n]) => `${ASSET_LABEL[k as AssetKind]} ${n}기`)
    .join(" · ");
}

// COP 스냅샷 → LLM 주입용 텍스트(간결 · 사실 위주).
export function buildSnapshot(state: CopState): string {
  const { tracks } = state;
  const detected = tracks.filter((t) => t.detected);
  const undet = tracks.filter((t) => !t.detected);
  // 위협도 내림차순(미확인은 뒤로)
  const ordered = [...tracks].sort((a, b) => {
    if (a.detected !== b.detected) return a.detected ? -1 : 1;
    return b.T - a.T;
  });

  const pop = state.population;
  const popLine = pop
    ? `인구밀집도 ${densityWord(state.popDensity)}(${state.popDensity.toFixed(
        2
      )})` +
      (pop.congest_lvl ? ` · 실시간 혼잡 "${pop.congest_lvl}"` : "") +
      (pop.population_max ? ` · 최대 인구 ~${pop.population_max.toLocaleString()}명` : "")
    : `인구밀집도 ${densityWord(state.popDensity)}(${state.popDensity.toFixed(2)})`;

  const lines = [
    `[작전지역] ${state.locName}`,
    `[부수피해 여건] ${popLine}`,
    `[THREAT CONDITION] ${state.threatCondition}`,
    `[방어 자산] ${assetSummary(state.assets)}`,
    `[추적 트랙] 총 ${tracks.length} (확인 ${detected.length} · 미확인 ${undet.length})`,
  ];
  if (ordered.length) {
    lines.push(...ordered.map(trackLine));
  } else {
    lines.push("- (현재 추적 중인 트랙 없음)");
  }
  return lines.join("\n");
}
