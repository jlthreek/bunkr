import {
  Viewer,
  GeoJsonDataSource,
  Color,
  Cartesian3,
  Cartographic,
  ConstantPositionProperty,
  PointGraphics,
  HeightReference,
  LabelGraphics,
  LabelStyle,
  VerticalOrigin,
} from "cesium";

// ── 데이터 레이어 오버레이 (SQLite export → public/data/*.geojson) ──

const ZONE_STYLE: Record<string, { fill: string; line: string }> = {
  protected: { fill: "#22c55e", line: "#4ade80" }, // 보호 (양수 weight)
  approach: { fill: "#f59e0b", line: "#fbbf24" }, // 접근
  sensitive: { fill: "#ef4444", line: "#f87171" }, // 민감 (음수 weight)
};
const SITE_COLOR = "#8ad8ff";

export interface Layers {
  zones: GeoJsonDataSource;
  sites: GeoJsonDataSource;
  ao: GeoJsonDataSource;
  siteCount: number;
  destroy(): void;
}

export async function setupLayers(
  viewer: Viewer,
  locId: string
): Promise<Layers> {
  const base = `data/${locId}`;
  const [zones, sites, ao] = await Promise.all([
    loadZones(viewer, base),
    loadSites(viewer, base),
    loadArea(viewer, base),
  ]);
  return {
    zones,
    sites,
    ao,
    siteCount: sites.entities.values.length,
    destroy() {
      viewer.dataSources.remove(zones, true);
      viewer.dataSources.remove(sites, true);
      viewer.dataSources.remove(ao, true);
    },
  };
}

// 우선구역: zone_type 별 색·라벨, 지면 클램프
async function loadZones(viewer: Viewer, base: string): Promise<GeoJsonDataSource> {
  const ds = await GeoJsonDataSource.load(`${base}/priority_zones.geojson`, {
    clampToGround: true,
  });
  for (const e of ds.entities.values) {
    const type = e.properties?.zone_type?.getValue() as string;
    const name = e.properties?.name?.getValue() as string;
    const weight = e.properties?.weight?.getValue() as number;
    const s = ZONE_STYLE[type] ?? ZONE_STYLE.sensitive;
    if (e.polygon) {
      e.polygon.material = Color.fromCssColorString(s.fill).withAlpha(0.2) as any;
      e.polygon.outline = true as any;
      e.polygon.outlineColor = Color.fromCssColorString(s.line) as any;
    }
    // 폴리곤 무게중심에 라벨
    const c = polygonCentroid(e, viewer);
    if (c) {
      e.position = new ConstantPositionProperty(c);
      e.label = new LabelGraphics({
        text: `${name}\n${weight > 0 ? "+" : ""}${weight}`,
        font: "600 12px 'SF Mono', monospace",
        fillColor: Color.fromCssColorString(s.line),
        style: LabelStyle.FILL_AND_OUTLINE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  }
  viewer.dataSources.add(ds);
  return ds;
}

// 설치 후보지: 옥상 높이(install_alt_m)에 점 마커
async function loadSites(viewer: Viewer, base: string): Promise<GeoJsonDataSource> {
  const ds = await GeoJsonDataSource.load(`${base}/install_sites.geojson`);
  const now = viewer.clock.currentTime;
  const color = Color.fromCssColorString(SITE_COLOR);
  for (const e of ds.entities.values) {
    const alt = (e.properties?.install_alt_m?.getValue() as number) ?? 20;
    const base = e.position?.getValue(now);
    if (base) {
      const carto = Cartographic.fromCartesian(base);
      const raised = Cartesian3.fromRadians(carto.longitude, carto.latitude, alt);
      e.position = new ConstantPositionProperty(raised);
    }
    e.billboard = undefined; // 기본 핀 제거
    e.point = new PointGraphics({
      pixelSize: 7,
      color,
      outlineColor: Color.BLACK.withAlpha(0.85),
      outlineWidth: 1,
      heightReference: HeightReference.RELATIVE_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY, // 건물에 가려지지 않게
    });
  }
  viewer.dataSources.add(ds);
  return ds;
}

// 분석 영역(AO) 경계: 외곽선만
async function loadArea(viewer: Viewer, base: string): Promise<GeoJsonDataSource> {
  const ds = await GeoJsonDataSource.load(`${base}/area_boundary.geojson`, {
    clampToGround: true,
  });
  for (const e of ds.entities.values) {
    if (e.polygon) {
      e.polygon.material = Color.fromCssColorString("#35e0e6").withAlpha(0.04) as any;
      e.polygon.outline = true as any;
      e.polygon.outlineColor = Color.fromCssColorString("#35e0e6") as any;
    }
  }
  viewer.dataSources.add(ds);
  return ds;
}

function polygonCentroid(e: any, viewer: Viewer): Cartesian3 | null {
  const hier = e.polygon?.hierarchy?.getValue(viewer.clock.currentTime);
  const pts: Cartesian3[] = hier?.positions;
  if (!pts || !pts.length) return null;
  const sum = new Cartesian3(0, 0, 0);
  for (const p of pts) Cartesian3.add(sum, p, sum);
  return Cartesian3.multiplyByScalar(sum, 1 / pts.length, new Cartesian3());
}
