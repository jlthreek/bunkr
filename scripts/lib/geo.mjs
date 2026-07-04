// 지오메트리/좌표 유틸 (proj4 재투영, 면적, 무게중심, 해시 파생)
import proj4 from "proj4";
import { EPSG5179, WGS84 } from "../config.mjs";

const toMeter = proj4(WGS84, EPSG5179);

/** [lon,lat] → [x,y] (EPSG:5179, m) */
export function lonLatToMeter(lon, lat) {
  const { x, y } = toMeter.forward({ x: lon, y: lat });
  return [round(x, 3), round(y, 3)];
}

/** WGS84 ring([[lon,lat],...]) → EPSG:5179 ring([[x,y],...]) */
export function ringToMeter(ring) {
  return ring.map(([lon, lat]) => lonLatToMeter(lon, lat));
}

/** shoelace 면적(㎡). ring 은 미터 좌표([[x,y],...]) */
export function ringAreaM2(meterRing) {
  let a = 0;
  for (let i = 0; i < meterRing.length - 1; i++) {
    const [x1, y1] = meterRing[i];
    const [x2, y2] = meterRing[i + 1];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** WGS84 ring 무게중심 [lon,lat] (단순 평균, 폐합점 제외) */
export function ringCentroid(ring) {
  const pts = ring.slice(0, -1);
  let sx = 0,
    sy = 0;
  for (const [lon, lat] of pts) {
    sx += lon;
    sy += lat;
  }
  return [round(sx / pts.length, 7), round(sy / pts.length, 7)];
}

/** 첫점=끝점 보장 */
export function closeRing(ring) {
  if (ring.length < 3) return ring;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) return [...ring, [fx, fy]];
  return ring;
}

/** 문자열 → 0..1 결정론적 해시값 (합성 필드 재현용) */
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function round(n, d = 3) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
