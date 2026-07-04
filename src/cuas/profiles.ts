// cuas/simulator.py 서브타입 실제 제원 포팅.
// 고도(m, AGL), 속도(m/s), RCS(dBsm). 값은 engine.ts 분류 임계값을 정확히 통과/미통과하도록 설계됨.
import { RNG } from "./rng";

// ---- 시뮬레이션/관측 상수 (simulator.py) ----
export const DT = 2.0; // 스텝 간격(초)
export const N_STEPS = 40;
export const RADAR_POS_NOISE = 0.04; // km (레이더 위치 정밀)
export const RF_CEP = 0.42; // km (RF TDOA CEP — 실측 AADM1.csv 중앙값 420m)

export type Kind = "drone" | "balloon" | "bird";
export type RfClass = "custom/encrypted" | "commercial" | "none";

export interface TrackProfile {
  kind: Kind;
  subtype: string;
  speed: number; // m/s (트랙 고정)
  alt: number; // m (트랙 고정, 관측 시 노이즈 추가)
  rcs: number; // dBsm (트랙 고정, 관측 시 노이즈 추가)
  mdop: boolean; // 로터 마이크로도플러
  rfClass: RfClass;
  rfPresent: boolean;
}

const DRONE_SUBTYPES = ["쿼드콥터", "고정익", "자폭형(FPV)", "회전익(헬기형)"] as const;
const BALLOON_SUBTYPES = ["오물풍선", "고고도 미사일 풍선"] as const;

function clipNormal(rng: RNG, mu: number, sigma: number, lo: number, hi: number): number {
  const v = rng.normal(mu, sigma);
  return v < lo ? lo : v > hi ? hi : v;
}

// 유형별 서브타입 물리 프로파일 샘플링 (simulator.spawn 근거 그대로)
export function sampleProfile(rng: RNG, kind: Kind): TrackProfile {
  if (kind === "drone") {
    const subtype = rng.choice(DRONE_SUBTYPES);
    let speed: number, alt: number, rcs: number;
    if (subtype === "쿼드콥터") {
      speed = rng.uniform(10, 18); // 로터형: 저속 정밀기동
      alt = rng.uniform(60, 150);
      rcs = clipNormal(rng, -9.75, 1.2, -13, -6); // DJI Inspire1 실측
    } else if (subtype === "고정익") {
      speed = rng.uniform(16, 26); // 고속 장거리
      alt = rng.uniform(120, 300);
      rcs = clipNormal(rng, -17.62, 1.2, -21, -14); // 소형 고정익 실측
    } else if (subtype === "자폭형(FPV)") {
      speed = rng.uniform(25, 45); // 저고도 고속 강하공격
      alt = rng.uniform(30, 100);
      rcs = clipNormal(rng, -14.0, 1.2, -18, -10); // 소형 5인치급
    } else {
      speed = rng.uniform(5, 15); // 회전익: 저속 정밀체공(ISR)
      alt = rng.uniform(80, 250);
      rcs = clipNormal(rng, -6.0, 1.2, -10, -3); // 대형 동체+로터
    }
    return {
      kind,
      subtype,
      speed,
      alt,
      rcs,
      mdop: true,
      rfClass: rng.random() < 0.6 ? "custom/encrypted" : "commercial",
      rfPresent: true,
    };
  }
  if (kind === "balloon") {
    const subtype = rng.choice(BALLOON_SUBTYPES);
    let speed: number, alt: number, rcs: number;
    if (subtype === "오물풍선") {
      speed = rng.uniform(4, 9); // 지상풍 종속
      alt = rng.uniform(3000, 5000); // 제원 3~5km
      rcs = rng.uniform(-8, -3);
    } else {
      speed = rng.uniform(8, 20); // 성층권 강풍
      alt = rng.uniform(18000, 20000); // 정찰/디코이 ~18~20km
      rcs = rng.uniform(-11, -6); // 디코이 RCS저감, BALLOON_RCS(-12) 상회 유지
    }
    return { kind, subtype, speed, alt, rcs, mdop: false, rfClass: "none", rfPresent: false };
  }
  // bird
  return {
    kind,
    subtype: "조류",
    speed: rng.uniform(8, 16),
    alt: rng.uniform(30, 120),
    rcs: rng.uniform(-26, -20),
    mdop: false,
    rfClass: "none",
    rfPresent: false,
  };
}
