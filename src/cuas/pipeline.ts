// cuas/pipeline.py 포팅 — 융합탐지 → 분류 → 위협평가 → 대응결심 (트랙 1개, 최신 스텝 판단).
import { median } from "./rng";
import { DT } from "./profiles";
import type { Observation } from "./observation";
import {
  assessThreat,
  classify,
  recommend,
  type Asset,
  type Response,
  type TrackType,
} from "./engine";

export const DT_MIN = DT / 60.0;

// ① 융합탐지 + ② 오탐저감: SNR 게이트 + RF-레이더 시공간 연관
export function fuseDetect(obs: Observation): {
  confirmed: boolean;
  pos: [number, number];
  rfAssoc: boolean;
} {
  const snrOk = obs.snr > 7;
  const pos: [number, number] = [obs.radar_x, obs.radar_y];
  let rfAssoc = false;
  if (obs.rf_present && !Number.isNaN(obs.rf_x)) {
    rfAssoc = Math.hypot(obs.rf_x - pos[0], obs.rf_y - pos[1]) < 0.6;
  }
  return { confirmed: snrOk, pos, rfAssoc };
}

export function trackSpeed(hist: Observation[]): number {
  const a = hist[0];
  const b = hist[hist.length - 1];
  const disp = Math.hypot(b.radar_x - a.radar_x, b.radar_y - a.radar_y) * 1000.0;
  const dt = b.t - a.t;
  return dt > 0 ? disp / dt : 0.0;
}

export function windAlignment(hist: Observation[], windDir: [number, number]): number {
  if (hist.length < 2) return 0.0;
  const dx = hist[hist.length - 1].x - hist[0].x;
  const dy = hist[hist.length - 1].y - hist[0].y;
  const dn = Math.hypot(dx, dy);
  if (dn < 1e-6) return 0.0;
  const wn = Math.hypot(windDir[0], windDir[1]);
  return (dx * windDir[0] + dy * windDir[1]) / (dn * wn + 1e-9);
}

export interface JudgeOpts {
  mobile?: boolean;
  platformSpeed?: number;
  popDensity?: number;
}

export interface Judgement {
  confirmed: boolean;
  pos: [number, number];
  rfAssoc: boolean;
  speed: number;
  ttype: TrackType;
  pUav: number;
  T: number;
  d: number;
  response: Response;
}

// 트랙 관측 히스토리(hist) 최신 스텝을 판단. 미탐지 시 confirmed=false.
export function judge(
  assets: Asset[],
  hist: Observation[],
  windDir: [number, number],
  opts: JudgeOpts = {}
): Judgement | { confirmed: false } {
  const obs = hist[hist.length - 1];
  const { confirmed, pos, rfAssoc } = fuseDetect(obs);
  if (!confirmed) return { confirmed: false };

  let speed = trackSpeed(hist);
  if (opts.mobile) speed = Math.abs(speed - (opts.platformSpeed ?? 0)); // ③ 자기운동 보정

  const rcs = median(hist.map((o) => o.rcs));
  const alt = median(hist.map((o) => o.alt));
  const mdop = hist.some((o) => o.mdop);
  const rfP = hist.some((o) => o.rf_present);
  const rfCls = hist.some((o) => o.rf_class === "custom/encrypted")
    ? "custom/encrypted"
    : obs.rf_class;
  const wa = windAlignment(hist, windDir);

  const { ttype, pUav } = classify(rcs, alt, mdop, rfP, rfCls, wa);
  const prev: [number, number] | null =
    hist.length > 1
      ? [hist[hist.length - 2].radar_x, hist[hist.length - 2].radar_y]
      : null;
  const { T, d } = assessThreat(assets, pos[0], pos[1], ttype, pUav, prev, DT_MIN);
  const response = recommend(T, ttype, opts.popDensity ?? 0.5);

  return { confirmed: true, pos, rfAssoc, speed, ttype, pUav, T, d, response };
}
