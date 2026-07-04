import {
  Viewer,
  GeoJsonDataSource,
  Color,
  Cartesian2,
  Cartesian3,
  Cartographic,
  ConstantPositionProperty,
  PointGraphics,
  BillboardGraphics,
  HeightReference,
  LabelGraphics,
  LabelStyle,
  VerticalOrigin,
  ConstantProperty,
} from "cesium";
import { tr, getLang } from "./i18n";

// 인구 배지: 채워진(fill) 사람 아이콘 + 인구수를 하나의 캔버스 텍스처로 합성 (색상별 캐시)
const popBadgeCache = new Map<string, string>();
function popBadgeUrl(text: string, color: string): string {
  const key = `${text}|${color}`;
  const cached = popBadgeCache.get(key);
  if (cached) return cached;
  const scale = 2; // 레티나 선명도
  const h = 18 * scale;
  const iconSize = 13 * scale;
  const gap = 4 * scale;
  const padX = 2 * scale;
  const font = `500 ${11 * scale}px 'IBM Plex Mono', monospace`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const textW = measure.measureText(text).width;
  const w = padX + iconSize + gap + textW + padX;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  // 채워진 사람 실루엣 (머리 + 몸통)
  const cx = padX + iconSize / 2;
  const headR = iconSize * 0.22;
  const headCy = h * 0.34;
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  const bodyTop = h * 0.56;
  const bodyW = iconSize * 0.66;
  ctx.beginPath();
  ctx.moveTo(cx - bodyW / 2, h - 1);
  ctx.quadraticCurveTo(cx - bodyW / 2, bodyTop, cx, bodyTop);
  ctx.quadraticCurveTo(cx + bodyW / 2, bodyTop, cx + bodyW / 2, h - 1);
  ctx.closePath();
  ctx.fill();
  // 인구수 텍스트
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillText(text, padX + iconSize + gap, h / 2 + 1);
  const url = canvas.toDataURL();
  popBadgeCache.set(key, url);
  return url;
}

// ── 데이터 레이어 오버레이 (SQLite export → public/data/*.geojson) ──

// DESIGN.md semantic palette — 상태 의미색만 사용 (friendly/caution/hostile)
const ZONE_STYLE: Record<string, { fill: string; line: string }> = {
  protected: { fill: "#88f298", line: "#8afaa2" }, // 보호 = friendly (양수 weight)
  approach: { fill: "#d9b54a", line: "#e0c56a" }, // 접근 = caution
  sensitive: { fill: "#e0574a", line: "#e86a5e" }, // 민감 = hostile (음수 weight)
};
// 설치 후보지: 의미 미확정 → neutral candidate dot (DESIGN candidate-dot)
const SITE_COLOR = "#9aa0a6";

// 라벨은 i18n 사전(zone.* / area.field.*)에서 현재 언어로 조회
const zoneTypeLabel = (type: string) =>
  ["protected", "approach", "sensitive"].includes(type)
    ? tr(`zone.${type}`)
    : tr("info.default.zone");
const zoneFieldLabel = (key: string) => tr(`zone.field.${key}`);
const areaFieldLabel = (key: string) => tr(`area.field.${key}`);

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
    const popMax = e.properties?.population_max?.getValue() as number | undefined;
    const congest = e.properties?.congest_lvl?.getValue() as string | undefined;
    const s = ZONE_STYLE[type] ?? ZONE_STYLE.sensitive;
    void congest;
    e.description = new ConstantProperty(buildZoneDescription(e, type, weight, s));
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
        text: `${name}\n${tr("risk.label")} ${weight > 0 ? "+" : ""}${weight}`,
        font: "600 11px 'IBM Plex Mono', monospace",
        fillColor: Color.fromCssColorString(s.line),
        style: LabelStyle.FILL,
        showBackground: true,
        backgroundColor: Color.fromCssColorString("#0a0a0a").withAlpha(0.62),
        backgroundPadding: new Cartesian2(7, 4),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
      // 실시간 인구밀집: 채워진 사람 아이콘 + 인구수 배지 (라벨 블록 바로 아래)
      if (popMax) {
        const text = `${(popMax / 1000).toFixed(popMax >= 1000 ? 0 : 1)}k`;
        ds.entities.add({
          position: c,
          billboard: new BillboardGraphics({
            image: popBadgeUrl(text, s.line),
            pixelOffset: new Cartesian2(0, 22),
            verticalOrigin: VerticalOrigin.TOP,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }),
        });
      }
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
    e.description = new ConstantProperty(buildAreaDescription(e));
    if (e.polygon) {
      // 분석영역(AO)은 상태가 아님 → neutral hairline (green/red 남용 금지)
      e.polygon.material = Color.fromCssColorString("#ffffff").withAlpha(0.03) as any;
      e.polygon.outline = true as any;
      e.polygon.outlineColor = Color.fromCssColorString("#8a929a") as any;
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

function buildZoneDescription(
  e: any,
  type: string,
  weight: number,
  style: { fill: string; line: string }
): string {
  const props = e.properties;
  const get = (key: string) => props?.[key]?.getValue?.();
  const name = String(get("name") ?? tr("info.default.zone"));
  const population = get("population_max");
  const congest = get("congest_lvl");
  const typeLabel = zoneTypeLabel(type);
  const tone = weight < 0 ? "hostile" : weight > 0 ? "friendly" : "neutral";
  const rows = [
    "zone_id",
    "zone_type",
    "weight",
    "asset",
    "value",
    "poi",
    "population_max",
    "congest_lvl",
    "resnt_rate",
    "ppltn_time",
    "source",
  ]
    .map((key) => {
      const value = get(key);
      if (value == null || value === "") return "";
      return `<div class="bi-row">
        <div class="bi-key">${escapeHtml(zoneFieldLabel(key))}</div>
        <div class="bi-val">${formatZoneValue(key, value, typeLabel)}</div>
      </div>`;
    })
    .join("");

  return `<style>
    html, body {
      margin: 0;
      overflow: hidden;
      background: transparent;
      color: #fff;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .cesium-infoBox-description {
      margin: 0;
      padding: 0;
    }
    .bunkr-info {
      --accent: ${style.line};
      padding: 14px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.015)),
        rgba(12, 12, 12, .92);
    }
    .bi-hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: start;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }
    .bi-kicker {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font: 700 10px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: .9px;
      text-transform: uppercase;
      color: rgba(255,255,255,.58);
    }
    .bi-kicker::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 55%, transparent);
    }
    .bi-title {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: 0;
      color: #fff;
    }
    .bi-score {
      min-width: 62px;
      padding: 8px 10px;
      text-align: center;
      border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent) 12%, rgba(255,255,255,.05));
    }
    .bi-score b {
      display: block;
      font: 800 20px "IBM Plex Mono", ui-monospace, monospace;
      color: var(--accent);
    }
    .bi-score span {
      display: block;
      margin-top: 2px;
      font-size: 10px;
      color: rgba(255,255,255,.55);
    }
    .bi-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .bi-metric {
      padding: 9px 10px;
      border-radius: 8px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.07);
    }
    .bi-metric span {
      display: block;
      margin-bottom: 3px;
      font-size: 10px;
      color: rgba(255,255,255,.50);
    }
    .bi-metric b {
      font: 700 13px "IBM Plex Mono", ui-monospace, monospace;
      color: #fff;
    }
    .bi-schema {
      display: grid;
      gap: 2px;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.08);
    }
    .bi-row {
      display: grid;
      grid-template-columns: minmax(116px, .8fr) minmax(0, 1.25fr);
      gap: 1px;
      background: rgba(255,255,255,.06);
    }
    .bi-key,
    .bi-val {
      min-width: 0;
      padding: 9px 10px;
      line-height: 1.35;
    }
    .bi-key {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      text-align: right;
      background: rgba(255,255,255,.08);
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,.70);
    }
    .bi-val {
      overflow-wrap: anywhere;
      background: rgba(0,0,0,.28);
      font: 600 12px "IBM Plex Mono", ui-monospace, monospace;
      color: rgba(245,255,255,.96);
    }
    .bi-tag {
      display: inline-flex;
      align-items: center;
      min-height: 21px;
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 16%, rgba(255,255,255,.05));
      color: var(--accent);
      font: 700 11px "IBM Plex Mono", ui-monospace, monospace;
    }
  </style>
  <section class="bunkr-info" data-tone="${tone}">
    <div class="bi-hero">
      <div>
        <div class="bi-kicker">${escapeHtml(typeLabel)}</div>
        <div class="bi-title">${escapeHtml(name)}</div>
      </div>
      <div class="bi-score"><b>${formatSigned(weight)}</b><span>${escapeHtml(tr("risk.label"))}</span></div>
    </div>
    <div class="bi-summary">
      <div class="bi-metric"><span>${escapeHtml(tr("info.zone.class"))}</span><b>${escapeHtml(typeLabel)}</b></div>
      <div class="bi-metric"><span>${escapeHtml(tr("info.congest"))}</span><b>${escapeHtml(congest ? String(congest) : tr("info.congest.none"))}</b></div>
      <div class="bi-metric"><span>${escapeHtml(tr("info.popmax"))}</span><b>${formatPopulation(population)}</b></div>
      <div class="bi-metric"><span>${escapeHtml(tr("info.data.status"))}</span><b>LIVE</b></div>
    </div>
    <div class="bi-schema">${rows}</div>
  </section>`;
}

function buildAreaDescription(e: any): string {
  const props = e.properties;
  const get = (key: string) => props?.[key]?.getValue?.();
  const name = String(get("name") ?? tr("info.default.ao"));
  const rows = ["area_id", "name"]
    .map((key) => {
      const value = get(key);
      if (value == null || value === "") return "";
      return `<div class="bi-row">
        <div class="bi-key">${escapeHtml(areaFieldLabel(key))}</div>
        <div class="bi-val">${escapeHtml(String(value).replace(/_/g, " "))}</div>
      </div>`;
    })
    .join("");

  return `<style>
    html, body {
      margin: 0;
      overflow: hidden;
      background: transparent;
      color: #fff;
      font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .bunkr-info {
      --accent: #9aa0a6;
      padding: 14px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.015)),
        rgba(12, 12, 12, .92);
    }
    .bi-hero {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: start;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255,255,255,.10);
    }
    .bi-kicker {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font: 700 10px "IBM Plex Mono", ui-monospace, monospace;
      letter-spacing: .9px;
      text-transform: uppercase;
      color: rgba(255,255,255,.58);
    }
    .bi-kicker::before {
      content: "";
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 10px rgba(154,160,166,.55);
    }
    .bi-title {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.3;
      color: #fff;
    }
    .bi-score {
      min-width: 62px;
      padding: 8px 10px;
      text-align: center;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 8px;
      background: rgba(255,255,255,.06);
    }
    .bi-score b {
      display: block;
      font: 800 18px "IBM Plex Mono", ui-monospace, monospace;
      color: #fff;
    }
    .bi-score span {
      display: block;
      margin-top: 2px;
      font-size: 10px;
      color: rgba(255,255,255,.55);
    }
    .bi-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .bi-metric {
      padding: 9px 10px;
      border-radius: 8px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.07);
    }
    .bi-metric span {
      display: block;
      margin-bottom: 3px;
      font-size: 10px;
      color: rgba(255,255,255,.50);
    }
    .bi-metric b {
      font: 700 13px "IBM Plex Mono", ui-monospace, monospace;
      color: #fff;
    }
    .bi-schema {
      display: grid;
      gap: 2px;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,.08);
    }
    .bi-row {
      display: grid;
      grid-template-columns: minmax(116px, .8fr) minmax(0, 1.25fr);
      gap: 1px;
      background: rgba(255,255,255,.06);
    }
    .bi-key,
    .bi-val {
      min-width: 0;
      padding: 9px 10px;
      line-height: 1.35;
    }
    .bi-key {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      text-align: right;
      background: rgba(255,255,255,.08);
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,.70);
    }
    .bi-val {
      overflow-wrap: anywhere;
      background: rgba(0,0,0,.28);
      font: 600 12px "IBM Plex Mono", ui-monospace, monospace;
      color: rgba(245,255,255,.96);
    }
  </style>
  <section class="bunkr-info">
    <div class="bi-hero">
      <div>
        <div class="bi-kicker">AREA OF OPERATION</div>
        <div class="bi-title">${escapeHtml(name)}</div>
      </div>
      <div class="bi-score"><b>AO</b><span>${escapeHtml(tr("info.ao.score"))}</span></div>
    </div>
    <div class="bi-summary">
      <div class="bi-metric"><span>${escapeHtml(tr("info.ao.class"))}</span><b>${escapeHtml(tr("info.default.ao"))}</b></div>
      <div class="bi-metric"><span>${escapeHtml(tr("info.ao.show"))}</span><b>${escapeHtml(tr("info.ao.show.active"))}</b></div>
    </div>
    <div class="bi-schema">${rows}</div>
  </section>`;
}

function formatZoneValue(key: string, value: unknown, typeLabel: string): string {
  if (key === "zone_type") return `<span class="bi-tag">${escapeHtml(typeLabel)}</span>`;
  if (key === "weight") return escapeHtml(formatSigned(Number(value)));
  if (key === "population_max") return escapeHtml(formatPopulation(value));
  if (key === "resnt_rate") return `${escapeHtml(String(value))}%`;
  return escapeHtml(String(value).replace(/_/g, " "));
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPopulation(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return tr("info.congest.none");
  return tr("pop.count", { n: n.toLocaleString(getLang() === "ko" ? "ko-KR" : "en-US") });
}

function escapeHtml(value: string | undefined | null): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
