// cuas/simulator.py 관측부 포팅 — 트랙 위치(km) + 프로파일 → 스텝별 센서 관측값.
import { RNG } from "./rng";
import { RADAR_POS_NOISE, RF_CEP, type TrackProfile } from "./profiles";

export interface Observation {
  t: number;
  x: number;
  y: number;
  alt: number;
  radar_x: number;
  radar_y: number;
  rf_x: number; // NaN if no RF
  rf_y: number;
  rcs: number;
  mdop: boolean;
  rf_class: string;
  rf_present: boolean;
  snr: number;
}

/** 트랙 진위치 pos(km) + 프로파일 → 관측값 1건 (센서 잡음 포함). */
export function makeObservation(
  rng: RNG,
  t: number,
  pos: [number, number],
  prof: TrackProfile
): Observation {
  const [x, y] = pos;
  const rfX = prof.rfPresent ? x + rng.normal(0, RF_CEP) : NaN;
  const rfY = prof.rfPresent ? y + rng.normal(0, RF_CEP) : NaN;
  return {
    t,
    x,
    y,
    alt: prof.alt + rng.normal(0, 6),
    radar_x: x + rng.normal(0, RADAR_POS_NOISE),
    radar_y: y + rng.normal(0, RADAR_POS_NOISE),
    rf_x: rfX,
    rf_y: rfY,
    rcs: prof.rcs + rng.normal(0, 1.5),
    mdop: prof.mdop,
    rf_class: prof.rfClass,
    rf_present: prof.rfPresent,
    snr: rng.uniform(6, 20),
  };
}
