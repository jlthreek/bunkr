// WGS84 lon/lat ↔ local km 프레임 (원점 = AO center).
// cuas 엔진(engine.ts)은 km 유클리드 좌표로 동작하므로 판단 로직은 이 프레임에서 수행하고,
// 렌더(Cesium)만 lon/lat 로 되돌린다. x = 동쪽 km, y = 북쪽 km.
const KM_PER_DEG_LAT = 111.32;

export interface Frame {
  lon0: number;
  lat0: number;
  kLon: number; // 위도에서의 경도 1도당 km
}

export function makeFrame(lon0: number, lat0: number): Frame {
  return { lon0, lat0, kLon: KM_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180) };
}

export function toKm(f: Frame, lon: number, lat: number): { x: number; y: number } {
  return { x: (lon - f.lon0) * f.kLon, y: (lat - f.lat0) * KM_PER_DEG_LAT };
}

export function toLonLat(f: Frame, x: number, y: number): { lon: number; lat: number } {
  return { lon: f.lon0 + x / f.kLon, lat: f.lat0 + y / KM_PER_DEG_LAT };
}
