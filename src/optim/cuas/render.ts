// C-UAS 배치 결과 렌더 — 장비 유형별 마커 + 커버리지(고정 sector 부채꼴 /
// PTZ 점선 스윕 / omni·360 원) + orientation 리더. 자립형(main 에 한 줄 훅).
import {
  Viewer,
  Entity,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  PolylineDashMaterialProperty,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
} from "cesium";
import type { CuasResult } from "./adapter";
import type { Candidate, Equipment, EqType } from "./types";
import { angleDeltaDeg, antennaPanMode, coverageBeamwidthDeg } from "./scoring";

const TYPE_COLOR: Record<EqType, string> = {
  scanner: "#35e0e6",
  radar: "#39d98a",
  camera: "#ffd23f",
  jammer: "#b06bff",
};
const M_PER_DEG_LAT = 111320;

// 커버리지 폴리곤 평면좌표 [lon,lat,...]. full(원) 또는 sector(부채꼴). azimuth: 0=동, CCW.
function coverageFlat(lon: number, lat: number, rangeM: number, centerDeg: number, widthDeg: number): number[] {
  const kLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const full = widthDeg >= 359;
  const seg = full ? 72 : Math.max(10, Math.round(widthDeg / 5));
  const pts: number[] = [];
  if (!full) pts.push(lon, lat); // 부채꼴 꼭짓점
  const start = full ? 0 : centerDeg - widthDeg / 2;
  for (let i = 0; i <= seg; i++) {
    const a = ((start + (full ? (360 * i) / seg : (widthDeg * i) / seg)) * Math.PI) / 180;
    pts.push(lon + (Math.cos(a) * rangeM) / kLon, lat + (Math.sin(a) * rangeM) / M_PER_DEG_LAT);
  }
  return pts;
}

// 킬체인 역할(문서 §7): scanner·radar·camera=탐지, jammer=소프트킬, counter=없음.
export type SensorKind = "radar" | "scanner" | "jammer" | "counter";

export interface CuasRenderHandle {
  clear(): void;
  covers(kind: SensorKind, lon: number, lat: number): boolean;
}

// (lon,lat)가 해당 후보의 실제 커버리지(range_km + sector/PTZ) 안인지
function candidateCovers(c: Candidate, eq: Equipment, lon: number, lat: number): boolean {
  if (c.lon == null || c.lat == null) return false;
  const kLon = M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180);
  const dE = (lon - c.lon) * kLon;
  const dN = (lat - c.lat) * M_PER_DEG_LAT;
  const dist = Math.hypot(dE, dN);
  if (dist > eq.range_km * 1000) return false;
  // 고정 sector 는 방위각도 확인 (PTZ·omni 는 전 방위)
  const width = coverageBeamwidthDeg(eq);
  if (c.orientation_deg != null && width < 359 && antennaPanMode(eq) !== "ptz") {
    const az = (Math.atan2(dN, dE) * 180) / Math.PI;
    if (angleDeltaDeg(az, c.orientation_deg) > width / 2) return false;
  }
  return true;
}

export function renderCuasPlan(
  viewer: Viewer,
  result: CuasResult
): CuasRenderHandle {
  const eqMap = new Map<string, Equipment>(result.scenario.equipment.map((e) => [e.id, e]));
  const entities: Entity[] = [];

  for (const c of result.selected) {
    if (c.lon == null || c.lat == null) continue;
    const eq = eqMap.get(c.equipment_id);
    if (!eq) continue;
    const rangeM = eq.range_km * 1000;
    const color = Color.fromCssColorString(TYPE_COLOR[c.equipment_type] ?? "#ddd");
    const ptz = antennaPanMode(eq) === "ptz";
    const width = coverageBeamwidthDeg(eq);
    const isCircle = c.orientation_deg == null || width >= 359;

    const flat = coverageFlat(c.lon, c.lat, rangeM, c.orientation_deg ?? 0, isCircle ? 360 : width);
    // 채움은 방향성 sector(레이더)만 — omni/PTZ 원은 겹치면 blob 이라 외곽선만
    if (!isCircle) {
      entities.push(
        viewer.entities.add({
          polygon: {
            hierarchy: Cartesian3.fromDegreesArray(flat),
            material: new ColorMaterialProperty(color.withAlpha(0.12)),
          },
        })
      );
    }
    // 경계선 (지면 클램프, PTZ 점선). omni 원은 얇은 링만.
    const outline = [...flat];
    if (!isCircle) outline.push(c.lon, c.lat); // 부채꼴 닫기
    else outline.push(flat[0], flat[1]);
    entities.push(
      viewer.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArray(outline),
          width: isCircle ? 1.4 : 2,
          clampToGround: true,
          material: ptz
            ? new PolylineDashMaterialProperty({ color: color.withAlpha(0.7), dashLength: 16 })
            : (new ColorMaterialProperty(color.withAlpha(isCircle ? 0.5 : 0.85)) as any),
        },
      })
    );
    // orientation 리더 (고정 sector 만)
    if (!isCircle && !ptz) {
      const a = (c.orientation_deg! * Math.PI) / 180;
      const kLon = M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180);
      const lx = c.lon + (Math.cos(a) * rangeM) / kLon;
      const ly = c.lat + (Math.sin(a) * rangeM) / M_PER_DEG_LAT;
      entities.push(
        viewer.entities.add({
          polyline: {
            positions: Cartesian3.fromDegreesArray([c.lon, c.lat, lx, ly]),
            width: 2.5,
            clampToGround: true,
            material: new ColorMaterialProperty(color.withAlpha(0.9)),
          },
        })
      );
    }
    // 장비 마커 + 라벨
    const az = isCircle ? "" : `\n${ptz ? "PTZ" : "FIX"} ${c.orientation_deg}°`;
    entities.push(
      viewer.entities.add({
        position: Cartesian3.fromDegrees(c.lon, c.lat, 0),
        point: {
          pixelSize: 11,
          color,
          outlineColor: Color.BLACK.withAlpha(0.9),
          outlineWidth: 2,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${c.equipment_type.toUpperCase()} · ${eq.range_km}km${az}`,
          font: "600 11px 'IBM Plex Mono', monospace",
          fillColor: color,
          style: LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Color.BLACK,
          outlineWidth: 3,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -14),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          showBackground: true,
          backgroundColor: Color.fromCssColorString("#060e14").withAlpha(0.72),
          backgroundPadding: new Cartesian2(6, 4),
        },
      })
    );
  }

  // 킬체인 커버리지 질의 — 유형별 역할 매핑(문서 §7)
  function covers(kind: SensorKind, lon: number, lat: number): boolean {
    for (const c of result.selected) {
      const t = c.equipment_type;
      const match =
        kind === "radar" ? t === "radar"
        : kind === "scanner" ? t === "scanner" || t === "camera" // 카메라도 탐지 기여
        : kind === "jammer" ? t === "jammer"
        : false; // counter(하드킬)는 C-UAS 밖
      if (!match) continue;
      const eq = eqMap.get(c.equipment_id);
      if (eq && candidateCovers(c, eq, lon, lat)) return true;
    }
    return false;
  }

  return {
    clear() {
      for (const e of entities) viewer.entities.remove(e);
      entities.length = 0;
    },
    covers,
  };
}
