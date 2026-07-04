import {
  Viewer,
  Entity,
  Cartesian3,
  Cartographic,
  Color,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  HeightReference,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
  ColorMaterialProperty,
} from "cesium";

// ── 방어 자산 배치 (레이더/스캐너/재머/대응) + 커버리지 시각화 ──────────
export type AssetKind = "radar" | "scanner" | "jammer" | "counter";

export interface AssetKindSpec {
  kind: AssetKind;
  label: string; // 표시명
  short: string; // ID 접두
  color: string;
  rangeM: number; // 커버리지 반경(m)
  role: string; // 역할 설명
}

export const ASSET_SPECS: AssetKindSpec[] = [
  {
    kind: "radar",
    label: "레이더",
    short: "RDR",
    color: "#39d98a",
    rangeM: 1200,
    role: "능동 탐지 (RADAR · RCS/위치)",
  },
  {
    kind: "scanner",
    label: "스캐너",
    short: "SCN",
    color: "#35e0e6",
    rangeM: 800,
    role: "수동 탐지 (RF·EO/IR)",
  },
  {
    kind: "jammer",
    label: "재머",
    short: "JAM",
    color: "#b06bff",
    rangeM: 450,
    role: "소프트킬 (RF 차단)",
  },
  {
    kind: "counter",
    label: "대응",
    short: "EFF",
    color: "#ff8c42",
    rangeM: 250,
    role: "하드킬 (교전)",
  },
];
const SPEC = Object.fromEntries(ASSET_SPECS.map((s) => [s.kind, s])) as Record<
  AssetKind,
  AssetKindSpec
>;

export interface PlacedAsset {
  id: string;
  kind: AssetKind;
  lon: number;
  lat: number;
  entities: Entity[];
}

export interface AssetLayer {
  setMode(kind: AssetKind | null): void;
  getMode(): AssetKind | null;
  placeAt(kind: AssetKind, lon: number, lat: number): PlacedAsset;
  remove(id: string): void;
  clear(): void;
  list(): PlacedAsset[];
  countByKind(): Record<AssetKind, number>;
  onChange(cb: () => void): void;
  // 킬체인 연동: 커버리지 질의 + 효과기(재머/대응) 활성 제어
  covers(kind: AssetKind, lon: number, lat: number): boolean;
  isKindActive(kind: AssetKind): boolean;
  setKindActive(kind: AssetKind, v: boolean): void;
  destroy(): void;
}

function distM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const kLon = M_PER_DEG_LAT * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot((lon1 - lon2) * kLon, (lat1 - lat2) * M_PER_DEG_LAT);
}

const M_PER_DEG_LAT = 111320;
const SEQ: Record<AssetKind, number> = { radar: 0, scanner: 0, jammer: 0, counter: 0 };

function circleFlat(lon: number, lat: number, rM: number, seg = 72, close = false) {
  const out: number[] = [];
  const kLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const n = close ? seg + 1 : seg;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / seg;
    out.push(
      lon + (Math.sin(a) * rM) / kLon,
      lat + (Math.cos(a) * rM) / M_PER_DEG_LAT
    );
  }
  return out;
}

export function setupAssets(viewer: Viewer): AssetLayer {
  const assets: PlacedAsset[] = [];
  let mode: AssetKind | null = null;
  let changeCb: (() => void) | null = null;
  // 레이더·스캐너(센서)는 상시, 재머·대응(효과기)은 활성/비활성 토글
  const active: Record<AssetKind, boolean> = { radar: true, scanner: true, jammer: true, counter: true };

  function place(lon: number, lat: number, kind: AssetKind): PlacedAsset {
    const spec = SPEC[kind];
    const color = Color.fromCssColorString(spec.color);
    const id = `${spec.short}-${String(++SEQ[kind]).padStart(2, "0")}`;

    // 커버리지 채움 (지면 드레이프)
    const fill = viewer.entities.add({
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(circleFlat(lon, lat, spec.rangeM)),
        material: new ColorMaterialProperty(color.withAlpha(0.1)),
      },
    });
    // 커버리지 경계 링 (지면 클램프)
    const ring = viewer.entities.add({
      polyline: {
        positions: Cartesian3.fromDegreesArray(
          circleFlat(lon, lat, spec.rangeM, 72, true)
        ),
        width: 2,
        material: new ColorMaterialProperty(color.withAlpha(0.75)),
        clampToGround: true,
      },
    });
    // 자산 마커 + 라벨
    const marker = viewer.entities.add({
      position: Cartesian3.fromDegrees(lon, lat, 0),
      point: {
        pixelSize: 11,
        color,
        outlineColor: Color.BLACK.withAlpha(0.9),
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${id}\n${spec.label} · ${(spec.rangeM / 1000).toFixed(1)}km`,
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
        backgroundColor: Color.fromCssColorString("#060e14").withAlpha(0.7),
        backgroundPadding: new Cartesian2(6, 4),
      },
    });

    const asset: PlacedAsset = { id, kind, lon, lat, entities: [fill, ring, marker] };
    if (!active[kind]) {
      (fill.polygon as any).show = false;
      (ring.polyline as any).show = false;
    }
    assets.push(asset);
    changeCb?.();
    return asset;
  }

  // 지도 클릭 → 배치 (배치 모드일 때만)
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((e: { position: Cartesian2 }) => {
    if (!mode) return;
    const cart =
      viewer.scene.pickPosition(e.position) ??
      pickGlobe(viewer, e.position);
    if (!cart) return;
    const c = Cartographic.fromCartesian(cart);
    place(CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude), mode);
  }, ScreenSpaceEventType.LEFT_CLICK);

  return {
    setMode(k) {
      mode = k;
      viewer.scene.canvas.style.cursor = k ? "crosshair" : "";
    },
    getMode: () => mode,
    placeAt: (kind, lon, lat) => place(lon, lat, kind),
    remove(id) {
      const i = assets.findIndex((a) => a.id === id);
      if (i < 0) return;
      for (const e of assets[i].entities) viewer.entities.remove(e);
      assets.splice(i, 1);
      changeCb?.();
    },
    clear() {
      for (const a of assets) for (const e of a.entities) viewer.entities.remove(e);
      assets.length = 0;
      changeCb?.();
    },
    list: () => assets,
    countByKind() {
      const c: Record<AssetKind, number> = { radar: 0, scanner: 0, jammer: 0, counter: 0 };
      for (const a of assets) c[a.kind]++;
      return c;
    },
    onChange(cb) {
      changeCb = cb;
    },
    covers(kind, lon, lat) {
      if (!active[kind]) return false;
      const range = SPEC[kind].rangeM;
      for (const a of assets)
        if (a.kind === kind && distM(lon, lat, a.lon, a.lat) <= range) return true;
      return false;
    },
    isKindActive: (kind) => active[kind],
    setKindActive(kind, v) {
      active[kind] = v;
      // 커버리지(채움·링) 표시를 활성 상태에 연동
      for (const a of assets) {
        if (a.kind !== kind) continue;
        if (a.entities[0].polygon) (a.entities[0].polygon as any).show = v;
        if (a.entities[1].polyline) (a.entities[1].polyline as any).show = v;
      }
    },
    destroy() {
      handler.destroy();
      for (const a of assets) for (const e of a.entities) viewer.entities.remove(e);
      assets.length = 0;
      viewer.scene.canvas.style.cursor = "";
    },
  };
}

function pickGlobe(viewer: Viewer, pos: Cartesian2): Cartesian3 | undefined {
  const ray = viewer.camera.getPickRay(pos);
  if (!ray) return undefined;
  return viewer.scene.globe.pick(ray, viewer.scene);
}
