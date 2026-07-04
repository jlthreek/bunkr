// cuas/engine.py 포팅 — Gray-zone C-UAS 의사결정 엔진 (근거 기반 임계값).
// 근거: Sensors 19(22) Art.5048, Drones 7(1) Art.39, AHP(ISAHP2014), Effect-based WTA.
// ⚠️ 임계값은 논문 근거가 있으므로 값 변경 금지 (원본 그대로 이식).
import { clamp } from "./rng";

// ---- 공역 설정 (km 좌표계) ----
export const NFZ_R = 3.0;

// ---- AHP 위협 가중치 (CR=0.004) ----
export const W_PROX = 0.35;
export const W_INTENT = 0.19;
export const W_CAP = 0.35;
export const W_NFZ = 0.11;

// ---- 근거 기반 임계값 ----
export const RCS_GATE_QUAD = -10.0; // 상용 쿼드콥터 경계 (DJI Inspire1 -9.75 dBsm)
export const RCS_GATE_FIXED = -18.0; // 소형 고정익 (-17.62 dBsm)
export const SPEED_GATE = 15.0; // LSS 저속 게이트 (m/s)
export const BALLOON_RCS = -12.0; // 풍선 대RCS 임계
export const BALLOON_ALT = 400.0; // 풍선 고고도 임계 (m)
export const WIND_ALIGN = 0.5; // 풍향 정합 임계

// 방호자산 (원점 자산 = 우리 protected 구역에서 주입). r 은 자산 반경(km, 참고용).
export interface Asset {
  name: string;
  x: number;
  y: number;
  r: number;
  weight?: number; // 자산 가치 (목표 선택 가중치)
}

export type TrackType = "드론" | "풍선" | "새/기타" | "미상";

export function distToAsset(assets: Asset[], x: number, y: number): number {
  let m = Infinity;
  for (const a of assets) m = Math.min(m, Math.hypot(x - a.x, y - a.y));
  return m === Infinity ? 0 : m;
}

export function inNfz(assets: Asset[], x: number, y: number): boolean {
  return distToAsset(assets, x, y) < NFZ_R;
}

// ① 탐지: 저신호(LSS) 후보 게이트
export function lssGate(rcsDbsm: number, speedMs: number): boolean {
  const lowRcs = rcsDbsm <= RCS_GATE_QUAD;
  const lowSpeed = speedMs < SPEED_GATE;
  // 저RCS(고정익급)는 속도 무관하게 통과
  return lowRcs && (lowSpeed || rcsDbsm < RCS_GATE_FIXED);
}

// ② 식별: 위계적 분류 (드론/풍선/새). 반환 (유형, p_uav)
export function classify(
  rcsDbsm: number,
  altM: number,
  microDoppler: boolean,
  rfPresent: boolean,
  rfClass: string,
  _windAlign = 0.0
): { ttype: TrackType; pUav: number } {
  const rfEnc = rfPresent && rfClass === "custom/encrypted";
  // 능동체(로터/암호RF) → 드론
  if (microDoppler || rfEnc) return { ttype: "드론", pUav: 0.95 };
  // 로터·RF 부재 → 풍선/새 후보
  if (!microDoppler && !rfPresent) {
    // 풍선 고유: 대RCS + 고고도
    if (rcsDbsm > BALLOON_RCS && altM > BALLOON_ALT)
      return { ttype: "풍선", pUav: 0.15 };
    // 새: 소형·저고도
    return { ttype: "새/기타", pUav: 0.1 };
  }
  // RF는 있으나 비암호(상용) → 드론 가능성
  if (rfPresent) return { ttype: "드론", pUav: 0.8 };
  return { ttype: "미상", pUav: 0.5 };
}

// ④ 위협평가: AHP 가중 스코어 (0~100)
export function assessThreat(
  assets: Asset[],
  x: number,
  y: number,
  ttype: TrackType,
  pUav: number,
  prevXY: [number, number] | null,
  dtMin: number
): { T: number; d: number } {
  const d = distToAsset(assets, x, y);
  const prox = Math.pow(clamp(1 - d / NFZ_R, 0, 1), 0.7);
  let closing = 0.0;
  if (prevXY && dtMin > 0) {
    closing = (distToAsset(assets, prevXY[0], prevXY[1]) - d) / dtMin; // km/min, +면 접근
  }
  const intent = clamp(closing / 0.3, 0, 1);
  const cap = Math.min(0.85 * pUav + (ttype === "드론" ? 0.3 : 0.1), 1.0);
  const nfz = inNfz(assets, x, y) ? 1.0 : 0.0;
  const T = 100 * (W_PROX * prox + W_INTENT * intent + W_CAP * cap + W_NFZ * nfz);
  return { T: round(T, 1), d: round(d, 2) };
}

// ---- 대응옵션 (부수피해 고려, TOPSIS 랭킹) ----
export type KillType = "none" | "soft" | "hard";
export interface Response {
  key: string;
  label: string;
  kill: KillType;
  collateral: number;
}
export const RESPONSES: Record<string, Response> = {
  감시: { key: "감시", label: "감시 지속", kill: "none", collateral: 0.02 },
  재밍: { key: "재밍", label: "RF 재밍", kill: "soft", collateral: 0.2 },
  포획: { key: "포획", label: "포획·유도 회수", kill: "soft", collateral: 0.1 },
  요격: { key: "요격", label: "물리 요격(최후수단)", kill: "hard", collateral: 0.85 },
};

// ⑤ 대응결심: 위협도 + 부수피해(인구밀도) 고려한 옵션 추천
export function recommend(T: number, ttype: TrackType, popDensity = 0.5): Response {
  if (T < 45) return RESPONSES["감시"];
  if (T < 70) {
    // 비살상 우선: 드론은 재밍, 그 외(풍선)는 포획
    return ttype === "드론" ? RESPONSES["재밍"] : RESPONSES["포획"];
  }
  // 고위협: 인구밀집이면 하드킬 회피 → 포획, 저밀도면 요격 허용
  if (popDensity > 0.6) return RESPONSES["포획"];
  return RESPONSES["요격"];
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
