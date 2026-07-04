import {
  Ion,
  Viewer,
  Terrain,
  Cartesian3,
  Math as CesiumMath,
  createOsmBuildingsAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Color,
  Cartographic,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
  UrlTemplateImageryProvider,
  Entity,
  ConstantProperty,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./style.css";
import { setupGrid } from "./grid";
import { setupLayers, type Layers } from "./layers";
import {
  startDroneSim,
  type DroneSim,
  type Track,
  type SensorProvider,
  type RoeMode,
} from "./sim/drones";
import {
  setupAssets,
  ASSET_SPECS,
  type AssetLayer,
  type AssetKind,
} from "./assets";
import {
  getOptimizer,
  loadOptimInput,
  DEFAULT_BUDGET,
  type OptimResult,
} from "./optim";
import {
  savePlan,
  listPlans,
  getPlan,
  deletePlan,
  planMix,
  type SavedPlanKpis,
} from "./plans";
import { logEvent, renderEventLog, onLog } from "./ops/eventlog";
import { tr, getLang, setLang, onLangChange, initI18n } from "./i18n";
import locationsCfg from "../locations.json";

// ── 기준 위치 레지스트리 ───────────────────────────────────────
interface Loc {
  area_id: string;
  name: string;
  name_en?: string;
  center: { lon: number; lat: number };
  radius_m: number;
  pop_density?: number;
}
const LOCS = locationsCfg.locations as Record<string, Loc>;
const DEFAULT_LOC = locationsCfg.default as string;

// ── Cesium Ion 토큰 ───────────────────────────────────────────
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;
else console.warn("[bunkr] VITE_CESIUM_ION_TOKEN 미설정");

// ── Stadia Maps 베이스맵 (Alidade) ───────────────────────────
function stadia(style: string) {
  return new UrlTemplateImageryProvider({
    url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}.png`,
    credit: "© Stadia Maps · © OpenMapTiles · © OpenStreetMap",
    maximumLevel: 20,
  });
}

function buildLocationDescription(loc: Loc): string {
  const nf = getLang() === "ko" ? "ko-KR" : "en-US";
  const rows = [
    [tr("area.field.area_id"), loc.area_id],
    [tr("area.field.name"), loc.name],
    [tr("area.field.name_en"), loc.name_en],
    [tr("area.field.center"), `${loc.center.lat.toFixed(5)}, ${loc.center.lon.toFixed(5)}`],
    [tr("area.field.radius"), `${loc.radius_m.toLocaleString(nf)} m`],
    [tr("area.field.pop_density"), loc.pop_density ? `${loc.pop_density.toLocaleString(nf)} / km²` : undefined],
  ]
    .filter(([, value]) => value != null && value !== "")
    .map(
      ([label, value]) => `<div class="bi-row">
        <div class="bi-key">${escapeInfoHtml(String(label))}</div>
        <div class="bi-val">${escapeInfoHtml(String(value))}</div>
      </div>`
    )
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
      --accent: #88f298;
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
      box-shadow: 0 0 10px rgba(136,242,152,.55);
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
      border: 1px solid rgba(136,242,152,.45);
      border-radius: 8px;
      background: rgba(136,242,152,.11);
    }
    .bi-score b {
      display: block;
      font: 800 18px "IBM Plex Mono", ui-monospace, monospace;
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
  </style>
  <section class="bunkr-info">
    <div class="bi-hero">
      <div>
        <div class="bi-kicker">AREA OF OPERATION</div>
        <div class="bi-title">${escapeInfoHtml(locName(loc))}</div>
      </div>
      <div class="bi-score"><b>AO</b><span>${escapeInfoHtml(tr("info.default.ao"))}</span></div>
    </div>
    <div class="bi-summary">
      <div class="bi-metric"><span>${escapeInfoHtml(tr("info.baseloc"))}</span><b>${escapeInfoHtml(loc.name_en ?? loc.area_id)}</b></div>
      <div class="bi-metric"><span>${escapeInfoHtml(tr("info.data.status"))}</span><b>ACTIVE</b></div>
    </div>
    <div class="bi-schema">${rows}</div>
  </section>`;
}

function escapeInfoHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
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

// ── 현재 상태 ─────────────────────────────────────────────────
let centerEntity: Entity | undefined;
let current: Layers | undefined;
let currentSim: DroneSim | undefined;
let assetLayer: AssetLayer | undefined;
let viewerRef: Viewer | undefined; // 배치 장비 행 클릭 시 지도 이동용
let currentLocId = DEFAULT_LOC;
let optimIds: string[] = [];
let lastOptimKpis: SavedPlanKpis | undefined; // 저장 시 플랜에 첨부
let engageModalTrackId: string | null = null;
const sparkBuckets: number[] = []; // 60s 위협 강도 (2s × 30)
let alertSince: number | null = null;
let setupDismissed = false; // 센서 미배치 오버레이 재노출 방지

const combinedSensors: SensorProvider = {
  covers: (kind, lon, lat) => assetLayer?.covers(kind, lon, lat) ?? false,
  isKindActive: (kind) => assetLayer?.isKindActive(kind) ?? true,
};

const KIND_SHORT: Record<string, string> = { drone: "DRN", balloon: "BLN", bird: "BIRD" };
const PRED_SHORT: Record<string, string> = {
  드론: "UAV",
  풍선: "BLN",
  "새/기타": "BIRD",
  미상: "UNK",
};
const ASSET_BY_KIND = Object.fromEntries(
  ASSET_SPECS.map((s) => [s.kind, s])
) as Record<AssetKind, (typeof ASSET_SPECS)[number]>;

const $ = (id: string) => document.getElementById(id)!;

async function main() {
  initI18n();
  wireLangToggle();

  const viewer = new Viewer("cesiumContainer", {
    terrain: Terrain.fromWorldTerrain(),
    baseLayerPicker: false, // 크롬 정리 (기본 베이스맵 직접 지정)
    animation: false,
    timeline: false,
    geocoder: false, // 고정 AO — 검색 불필요
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false, // 축척바와 겹침 → 제거
    infoBox: true, // 엔티티 클릭 → 좌표·속성 확인 (위치·크롬은 CSS로 재정의)
    selectionIndicator: true,
  });
  viewer.scene.globe.enableLighting = true;
  viewerRef = viewer;
  // 터치 제스처: pinch 줌 · 두 손가락 회전/틸트 · 이동 (뷰포트 meta 로 페이지 줌 차단)
  const camCtrl = viewer.scene.screenSpaceCameraController;
  camCtrl.enableZoom = true;
  camCtrl.enableRotate = true;
  camCtrl.enableTilt = true;
  camCtrl.enableTranslate = true;
  camCtrl.enableLook = true;
  // 지도 위 라벨 선명도 (레티나 full-res 렌더)
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
  // 베이스맵: Stadia Alidade Smooth Dark (기본 Ion 이미저리 대체)
  viewer.imageryLayers.removeAll();
  viewer.imageryLayers.addImageryProvider(stadia("alidade_smooth_dark"));

  try {
    viewer.scene.primitives.add(await createOsmBuildingsAsync());
  } catch (e) {
    console.error("[bunkr] OSM Buildings 로드 실패:", e);
  }

  setupGrid(viewer, LOCS[DEFAULT_LOC].center, {
    scaleBarInner: $("scalebar-inner"),
    scaleBarLabel: $("scalebar-label"),
    hudScale: $("hud-scale"),
  });

  // 위치 스위처
  const sel = $("loc-select") as HTMLSelectElement;
  const renderLocOptions = () => {
    const cur = sel.value;
    sel.innerHTML = "";
    for (const [id, loc] of Object.entries(LOCS)) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = locName(loc);
      sel.appendChild(opt);
    }
    sel.value = cur || DEFAULT_LOC;
  };
  renderLocOptions();
  sel.value = DEFAULT_LOC;
  sel.addEventListener("change", () => loadLocation(viewer, sel.value, false));

  // 언어 전환 시 동적 UI 갱신 (정적 마크업은 i18n 모듈이 직접 갱신)
  onLangChange(() => {
    updateLangButtons();
    renderLocOptions();
    const loc = LOCS[currentLocId];
    if (loc) $("hud-title").textContent = `bunkr · ${locName(loc)} COP`;
    const running = currentSim?.running() ?? true;
    ($("sim-toggle") as HTMLButtonElement).textContent = running
      ? tr("spawn.pause")
      : tr("spawn.resume");
    $("sim-status").textContent = running ? tr("sim.run") : tr("sim.pause");
    // 힌트는 현재 모드 유지한 채 문구만 갱신
    const paletteKind = assetLayer?.getMode() ?? null;
    $("asset-hint").textContent = paletteKind
      ? tr("asset.hint.active", { label: tr(`asset.${paletteKind}.name`) })
      : tr("asset.hint");
    const spawnKind = currentSim?.getSpawnMode() ?? null;
    $("spawn-hint").textContent = spawnKind
      ? tr("spawn.hint.active", { label: tr(`spawn.${spawnKind}.name`) })
      : tr("spawn.hint");
    if (!lastOptimKpis) $("optim-result").textContent = tr("optim.result.default");
    renderAssetList();
    renderPlanList();
    renderPlanSelect();
  });

  // 레이어 토글
  wireToggle("lyr-zones", () => current?.zones);
  wireToggle("lyr-sites", () => current?.sites);
  wireToggle("lyr-ao", () => current?.ao);
  ($("lyr-drones") as HTMLInputElement).addEventListener("change", (e) =>
    currentSim?.setVisible((e.target as HTMLInputElement).checked)
  );

  // 위협 시뮬 컨트롤
  const btnToggle = $("sim-toggle") as HTMLButtonElement;
  const status = $("sim-status");
  btnToggle.addEventListener("click", () => {
    const run = currentSim?.toggle() ?? false;
    btnToggle.textContent = run ? tr("spawn.pause") : tr("spawn.resume");
    status.textContent = run ? tr("sim.run") : tr("sim.pause");
    status.classList.toggle("paused", !run);
  });
  $("sim-trails").addEventListener("change", (e) =>
    currentSim?.setTrailsVisible((e.target as HTMLInputElement).checked)
  );
  $("sim-altcompress").addEventListener("change", (e) =>
    currentSim?.setAltCompress((e.target as HTMLInputElement).checked)
  );
  for (const kind of ["drone", "balloon", "bird"] as const) {
    $(`spawn-${kind}`).addEventListener("click", () =>
      setSpawnMode(currentSim?.getSpawnMode() === kind ? null : kind)
    );
  }
  $("spawn-clear").addEventListener("click", () => currentSim?.clearTracks());

  // 방어 자산 배치
  assetLayer = setupAssets(viewer);
  assetLayer.onChange(() => {
    renderAssetList();
    updateCoverConf();
  });
  renderAssetList();
  for (const spec of ASSET_SPECS) {
    $(`asset-${spec.kind}`).addEventListener("click", () =>
      setPaletteMode(assetLayer!.getMode() === spec.kind ? null : spec.kind)
    );
  }
  $("eff-jammer").addEventListener("change", (e) =>
    assetLayer!.setKindActive("jammer", (e.target as HTMLInputElement).checked)
  );
  $("eff-counter").addEventListener("change", (e) =>
    assetLayer!.setKindActive("counter", (e.target as HTMLInputElement).checked)
  );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setPaletteMode(null);
      setSpawnMode(null);
    }
  });

  // 최적 배치
  $("optim-run").addEventListener("click", runOptimizer);
  $("asset-clear").addEventListener("click", () => assetLayer?.clear());

  // 위젯 카드 접기/펼치기 (좌측 모듈 + 우측 패널)
  document
    .querySelectorAll<HTMLElement>(".mod-head[data-toggle]")
    .forEach((h) =>
      h.addEventListener("click", () =>
        h.closest(".mod")!.classList.toggle("collapsed")
      )
    );
  document
    .querySelectorAll<HTMLElement>(".panel-head")
    .forEach((h) =>
      h.addEventListener("click", () =>
        h.closest(".panel")?.classList.toggle("collapsed")
      )
    );

  // 모드 탭 / ROE / 플랜 / 맵 컨트롤 / 교전
  wireModeTabs();
  wireRoe();
  wireRailToggles();
  $("bottom-collapse").addEventListener("click", () => {
    const app = $("app") as HTMLElement;
    app.dataset.bottom = app.dataset.bottom === "collapsed" ? "open" : "collapsed";
  });
  wireBottomResize();
  // 자산 배치: 자동/수동 토글
  document.querySelectorAll<HTMLElement>("[data-place-btn]").forEach((b) =>
    b.addEventListener("click", () => {
      const m = b.dataset.placeBtn!;
      ($("place-panel") as HTMLElement).dataset.place = m;
      document
        .querySelectorAll<HTMLElement>(".pt-seg")
        .forEach((s) => s.classList.toggle("active", s.dataset.placeBtn === m));
      if (m === "auto") setPaletteMode(null);
    })
  );
  // 배치 플랜: 도움말 토글 + 설계로 이동
  $("plan-help").addEventListener("click", () =>
    $("plan-hint").toggleAttribute("hidden")
  );
  $("plan-goto").addEventListener("click", () => setMode("deploy"));
  // 센서 미배치 안내 오버레이
  $("so-dismiss").addEventListener("click", () => {
    setupDismissed = true;
    $("setup-overlay").setAttribute("hidden", "");
  });
  $("so-goto").addEventListener("click", () => {
    $("setup-overlay").setAttribute("hidden", "");
    setMode("deploy");
  });
  wirePlanLibrary(viewer);
  wireMapControls(viewer);
  wireEngagementModal();
  startZuluClock();
  onLog(() => renderEventLog($("event-log")));

  // 실시간 틱 (4Hz): 트랙 테이블 · 위협조건 · 승인큐 · 경보
  const rows = $("track-rows");
  const cntDrones = $("cnt-drones");
  setInterval(() => {
    renderTrackTable(rows, cntDrones);
    renderAuthQueue();
    updateAlertStrip();
  }, 250);
  // 스파크라인 (2s 버킷)
  setInterval(pushSparkBucket, 2000);

  // 마우스 좌표 HUD
  const hudCoord = $("hud-coord");
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((m: { endPosition: Cartesian2 }) => {
    const cart = viewer.scene.pickPosition(m.endPosition);
    if (cart) return updateHud(cart);
    const ray = viewer.camera.getPickRay(m.endPosition);
    if (!ray) return;
    const ground = viewer.scene.globe.pick(ray, viewer.scene);
    if (ground) updateHud(ground);
  }, ScreenSpaceEventType.MOUSE_MOVE);

  function updateHud(cartesian: Cartesian3) {
    const c = Cartographic.fromCartesian(cartesian);
    hudCoord.textContent = `LAT ${CesiumMath.toDegrees(c.latitude).toFixed(
      5
    )}  LON ${CesiumMath.toDegrees(c.longitude).toFixed(5)}  ALT ${c.height.toFixed(
      0
    )} m`;
  }

  setMode("deploy");
  await loadLocation(viewer, DEFAULT_LOC, true);
}

// ── 카메라 프레이밍 ───────────────────────────────────────────
function flyToLoc(viewer: Viewer, loc: Loc, duration: number) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(loc.center.lon, loc.center.lat - 0.03, 4200),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-42), roll: 0 },
    duration,
  });
}

// 위치 전환
async function loadLocation(viewer: Viewer, id: string, initial: boolean) {
  const loc = LOCS[id];
  if (!loc) return;
  currentLocId = id;
  const { lon, lat } = loc.center;

  $("hud-title").textContent = `bunkr · ${locName(loc)} COP`;

  if (centerEntity) viewer.entities.remove(centerEntity);
  centerEntity = viewer.entities.add({
    name: locName(loc),
    description: new ConstantProperty(buildLocationDescription(loc)),
    position: Cartesian3.fromDegrees(lon, lat, 30),
    point: {
      pixelSize: 12,
      color: Color.fromCssColorString("#88f298"),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: locName(loc),
      font: "600 12px 'IBM Plex Mono', monospace",
      fillColor: Color.fromCssColorString("#ffffff"),
      style: LabelStyle.FILL,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#0a0a0a").withAlpha(0.66),
      backgroundPadding: new Cartesian2(7, 4),
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -16),
    },
  });

  flyToLoc(viewer, loc, initial ? 2.5 : 1.5);

  current?.destroy();
  current = undefined;
  try {
    const layers = await setupLayers(viewer, id);
    current = layers;
    $("cnt-sites").textContent = String(layers.siteCount);
    applyToggleState("lyr-zones", layers.zones);
    applyToggleState("lyr-sites", layers.sites);
    applyToggleState("lyr-ao", layers.ao);
  } catch (e) {
    console.error("[bunkr] 레이어 로드 실패:", e);
    $("cnt-sites").textContent = "—";
  }

  assetLayer?.clear();
  optimIds = [];
  lastOptimKpis = undefined;
  setupDismissed = false;
  $("setup-overlay").setAttribute("hidden", "");
  setPaletteMode(null);
  $("optim-result").textContent = tr("optim.result.default");
  resetKpiCards();

  currentSim?.destroy();
  currentSim = undefined;
  currentSim = await startDroneSim(viewer, {
    locId: id,
    center: loc.center,
    radiusM: loc.radius_m,
    popDensity: loc.pop_density ?? 0.5,
    sensors: combinedSensors,
  });
  wireSimEvents(currentSim);
  (window as any).__bunkr = currentSim; // 데모/디버그: window.__bunkr.spawnAt('drone', lon, lat)
  currentSim.setROE(
    ($("roe-toggle").dataset.roe as RoeMode) ?? "auto"
  );
  currentSim.setVisible(($("lyr-drones") as HTMLInputElement).checked);
  currentSim.setTrailsVisible(($("sim-trails") as HTMLInputElement).checked);
  currentSim.setAltCompress(($("sim-altcompress") as HTMLInputElement).checked);
  syncSpawnPalette();

  const btnToggle = $("sim-toggle") as HTMLButtonElement;
  const status = $("sim-status");
  btnToggle.textContent = "⏸ 일시정지";
  status.textContent = "● RUN";
  status.classList.remove("paused");

  renderPlanList();
  renderPlanSelect();
  updateCoverConf();
}

// ══ 모드 전환 ════════════════════════════════════════════════
function setMode(m: "deploy" | "operate") {
  ($("app") as HTMLElement).dataset.mode = m;
  document
    .querySelectorAll<HTMLElement>(".mode-tab")
    .forEach((b) => b.classList.toggle("active", b.dataset.modeBtn === m));
  if (m === "deploy") setSpawnMode(null);
  else setPaletteMode(null);
}
function wireModeTabs() {
  document.querySelectorAll<HTMLElement>(".mode-tab").forEach((b) =>
    b.addEventListener("click", () => setMode(b.dataset.modeBtn as "deploy" | "operate"))
  );
}

// ══ 언어 전환 (KO/EN) ════════════════════════════════════════
function locName(loc: Loc): string {
  return getLang() === "ko" ? loc.name : loc.name_en ?? loc.name;
}
function updateLangButtons() {
  const lang = getLang();
  document
    .querySelectorAll<HTMLElement>("[data-lang-btn]")
    .forEach((b) => b.classList.toggle("active", b.dataset.langBtn === lang));
}
function wireLangToggle() {
  updateLangButtons();
  document.querySelectorAll<HTMLElement>("[data-lang-btn]").forEach((b) =>
    b.addEventListener("click", () => setLang(b.dataset.langBtn as "ko" | "en"))
  );
}

// ══ 패널 접기/펼치기 (좌·우·하단 — 상단바 아이콘 버튼) ══════════
function wireRailToggles() {
  const app = $("app") as HTMLElement;
  for (const r of ["left", "right", "bottom"]) app.dataset[r] = "open";
  document.querySelectorAll<HTMLElement>("[data-toggle-rail]").forEach((btn) => {
    const rail = btn.dataset.toggleRail!;
    btn.addEventListener("click", () => {
      const collapsed = app.dataset[rail] !== "collapsed";
      app.dataset[rail] = collapsed ? "collapsed" : "open";
      btn.classList.toggle("is-collapsed", collapsed);
    });
  });
}

// ══ 하단 패널 크기 조절 (좌·우 핸들: 폭 / 상단 핸들: 높이) ══════
function wireBottomResize() {
  const strip = $("bottom-strip") as HTMLElement;
  const MIN_W = 460;
  const MIN_H = 140;

  function maxWidthPx(): number {
    const cs = getComputedStyle(strip);
    const leftW = parseFloat(cs.getPropertyValue("--left-w")) || 0;
    const rightW = parseFloat(cs.getPropertyValue("--right-w")) || 0;
    const rail = Math.max(leftW, rightW);
    return window.innerWidth - 2 * rail - 32;
  }
  function maxHeightPx(): number {
    const cs = getComputedStyle(strip);
    const topbarH = parseFloat(cs.getPropertyValue("--topbar-h")) || 52;
    // 상단바 아래 여백(80px)까지는 지도를 남겨둔다
    return window.innerHeight - topbarH - 80;
  }

  function trackDrag(
    downEvent: MouseEvent,
    cursor: string,
    onMove: (e: MouseEvent) => void
  ) {
    downEvent.preventDefault();
    strip.classList.add("resizing");
    document.body.style.cursor = cursor;
    function onUp() {
      strip.classList.remove("resizing");
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startHDrag(side: "left" | "right", downEvent: MouseEvent) {
    const startX = downEvent.clientX;
    const startWidth = strip.getBoundingClientRect().width;
    trackDrag(downEvent, "ew-resize", (e) => {
      const dx = e.clientX - startX;
      const delta = side === "right" ? dx : -dx;
      // 중앙 정렬을 유지하는 요소이므로 한쪽을 당기면 양쪽이 함께 늘어난다.
      const raw = startWidth + delta * 2;
      const clamped = Math.min(Math.max(raw, MIN_W), maxWidthPx());
      strip.style.width = `${clamped}px`;
    });
  }

  function startVDrag(downEvent: MouseEvent) {
    const startY = downEvent.clientY;
    const startHeight = strip.getBoundingClientRect().height;
    trackDrag(downEvent, "ns-resize", (e) => {
      const raw = startHeight + (startY - e.clientY); // 위로 당기면 커진다
      const clamped = Math.min(Math.max(raw, MIN_H), maxHeightPx());
      strip.style.height = `${clamped}px`;
    });
  }

  const left = $("bs-resize-left");
  const right = $("bs-resize-right");
  const top = $("bs-resize-top");
  left.addEventListener("mousedown", (e) => startHDrag("left", e as MouseEvent));
  right.addEventListener("mousedown", (e) => startHDrag("right", e as MouseEvent));
  top.addEventListener("mousedown", (e) => startVDrag(e as MouseEvent));
  const resetWidth = () => (strip.style.width = "");
  const resetHeight = () => (strip.style.height = "");
  left.addEventListener("dblclick", resetWidth);
  right.addEventListener("dblclick", resetWidth);
  top.addEventListener("dblclick", resetHeight);

  // 창 크기 변경으로 레일·상단바와 겹치게 되면 재클램프
  window.addEventListener("resize", () => {
    if (strip.style.width) {
      const max = maxWidthPx();
      const current = parseFloat(strip.style.width);
      if (current > max) strip.style.width = `${Math.max(MIN_W, max)}px`;
    }
    if (strip.style.height) {
      const max = maxHeightPx();
      const current = parseFloat(strip.style.height);
      if (current > max) strip.style.height = `${Math.max(MIN_H, max)}px`;
    }
  });
}

// ══ 교전규칙 (ROE) ═══════════════════════════════════════════
function wireRoe() {
  const btn = $("roe-toggle");
  const help = $("roe-help");
  const popover = $("roe-popover");
  help.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = popover.hasAttribute("hidden");
    popover.toggleAttribute("hidden", !open);
    help.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (e) => {
    if (popover.hasAttribute("hidden")) return;
    const target = e.target as Node;
    if (popover.contains(target) || help.contains(target)) return;
    popover.setAttribute("hidden", "");
    help.setAttribute("aria-expanded", "false");
  });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    popover.setAttribute("hidden", "");
    help.setAttribute("aria-expanded", "false");
  });
  btn.addEventListener("click", () => {
    const next: RoeMode = btn.dataset.roe === "auto" ? "manual" : "auto";
    btn.dataset.roe = next;
    btn.textContent = next.toUpperCase();
    currentSim?.setROE(next);
    logEvent({
      type: "system",
      msg: tr("log.roe", { mode: next.toUpperCase() }),
      tone: next === "manual" ? "caution" : "neutral",
    });
  });
}

// ══ Zulu 시계 ════════════════════════════════════════════════
function startZuluClock() {
  const el = $("zclock");
  const tick = () =>
    (el.textContent = new Date().toLocaleTimeString("en-GB", { hour12: false }));
  tick();
  setInterval(tick, 1000);
}

// ══ 맵 컨트롤 (줌 / 재정렬) ══════════════════════════════════
function wireMapControls(viewer: Viewer) {
  $("zoom-in").addEventListener("click", () =>
    viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.35)
  );
  $("zoom-out").addEventListener("click", () =>
    viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.5)
  );
  // 나침반: 카메라 heading 을 실시간 반영, 클릭 시 정북 정렬 (Apple 지도 스타일)
  const dial = $("compass-dial");
  viewer.scene.postRender.addEventListener(() => {
    dial.style.transform = `rotate(${-viewer.camera.heading}rad)`;
  });
  $("compass").addEventListener("click", () =>
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC.clone(),
      orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 },
      duration: 0.4,
    })
  );
}

// ══ 시뮬 이벤트 → 로그 ═══════════════════════════════════════
function wireSimEvents(sim: DroneSim) {
  sim.onDetection((t) =>
    logEvent({
      type: "detect",
      trackId: t.id,
      msg: tr("log.detect", {
        cls: PRED_SHORT[t.pred] ?? "UNK",
        rng: distFromCenter(t),
      }),
      tone: "caution",
    })
  );
  sim.onEngagement((t) =>
    logEvent({
      type: "engage",
      trackId: t.id,
      msg: t.engaged === "hard" ? tr("log.engage.hard") : tr("log.engage.soft"),
      tone: t.engaged === "hard" ? "hostile" : "caution",
    })
  );
  sim.onEngagementRequest((t) =>
    logEvent({
      type: "authreq",
      trackId: t.id,
      msg: tr("log.authreq", { t: t.T.toFixed(0) }),
      tone: "hostile",
    })
  );
  // 탐지 자산(레이더·스캐너) 미배치 상태에서 위협 생성 시 안내 오버레이
  sim.onSpawn(() => {
    if (setupDismissed) return;
    const c = assetLayer?.countByKind();
    if (c && c.radar + c.scanner === 0) $("setup-overlay").removeAttribute("hidden");
  });
}

function distFromCenter(t: Track): string {
  const c = LOCS[currentLocId].center;
  const kLon = 111320 * Math.cos((c.lat * Math.PI) / 180);
  const d = Math.hypot((t.lon - c.lon) * kLon, (t.lat - c.lat) * 111320) / 1000;
  return d.toFixed(1);
}

// ══ 교전 승인 큐 + 모달 ══════════════════════════════════════
function renderAuthQueue() {
  const pending = currentSim?.pendingAuth() ?? [];
  $("auth-count").textContent = String(pending.length);
  const el = $("auth-queue");
  if (!pending.length) {
    el.innerHTML = `<div class="empty">${tr("auth.empty")}</div>`;
  } else {
    el.innerHTML = pending
      .map(
        (t) =>
          `<div class="auth-item"><div class="ai-line">${t.id} · ${
            PRED_SHORT[t.pred] ?? "UNK"
          } · T <b>${t.T.toFixed(0)}</b></div>` +
          `<div class="ai-actions"><button class="ai-ok" data-id="${t.id}">${tr("auth.engage")}</button>` +
          `<button class="ai-no" data-id="${t.id}">${tr("auth.hold")}</button></div></div>`
      )
      .join("");
    el.querySelectorAll<HTMLElement>(".ai-ok").forEach((b) =>
      b.addEventListener("click", () => resolveAuth(b.dataset.id!, true))
    );
    el.querySelectorAll<HTMLElement>(".ai-no").forEach((b) =>
      b.addEventListener("click", () => resolveAuth(b.dataset.id!, false))
    );
  }
  // MANUAL ROE: 대기 트랙이 있으면 모달을 띄운다(이미 열려있지 않을 때)
  const modal = $("engage-modal");
  if (pending.length && modal.hasAttribute("hidden")) openEngageModal(pending[0]);
  else if (!pending.length && !modal.hasAttribute("hidden")) closeEngageModal();
}

function openEngageModal(t: Track) {
  engageModalTrackId = t.id;
  $("em-target").textContent = t.id;
  $("em-class").textContent = `${PRED_SHORT[t.pred] ?? "UNK"} / ${KIND_SHORT[t.kind]}`;
  $("em-threat").textContent = `T ${t.T.toFixed(0)}`;
  $("em-collat").textContent = `POP ${(LOCS[currentLocId].pop_density ?? 0.5) > 0.6 ? "HIGH" : "LOW"}`;
  $("engage-modal").removeAttribute("hidden");
}
function closeEngageModal() {
  engageModalTrackId = null;
  $("engage-modal").setAttribute("hidden", "");
}
function resolveAuth(id: string, approve: boolean) {
  if (approve) currentSim?.authorize(id);
  else currentSim?.deny(id);
  logEvent({
    type: approve ? "authorize" : "deny",
    trackId: id,
    msg: approve ? tr("log.authorize") : tr("log.deny"),
    tone: approve ? "hostile" : "neutral",
  });
  renderAuthQueue();
}
function wireEngagementModal() {
  $("em-confirm").addEventListener("click", () => {
    if (engageModalTrackId) resolveAuth(engageModalTrackId, true);
  });
  $("em-abort").addEventListener("click", () => {
    if (engageModalTrackId) resolveAuth(engageModalTrackId, false);
  });
}

// ══ 경보 스트립 ══════════════════════════════════════════════
function updateAlertStrip() {
  const tracks = currentSim?.getTracks() ?? [];
  const hostile = tracks.filter(
    (t) => t.detected && t.pred === "드론" && t.T >= 70 && !t.engaged
  );
  const strip = $("alert-strip");
  if (!hostile.length) {
    alertSince = null;
    strip.setAttribute("hidden", "");
    return;
  }
  if (alertSince === null) alertSince = Date.now();
  const top = hostile.sort((a, b) => b.T - a.T)[0];
  $("alert-msg").textContent = tr("alert.hostile", {
    count: hostile.length,
    id: top.id,
    t: top.T.toFixed(0),
    rng: distFromCenter(top),
  });
  const s = Math.floor((Date.now() - alertSince) / 1000);
  $("alert-elapsed").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(
    s % 60
  ).padStart(2, "0")}`;
  strip.removeAttribute("hidden");
}

// ══ 스파크라인 ═══════════════════════════════════════════════
function pushSparkBucket() {
  const tracks = currentSim?.getTracks() ?? [];
  const max = tracks.reduce((m, t) => (t.detected ? Math.max(m, t.T) : m), 0);
  sparkBuckets.push(max);
  if (sparkBuckets.length > 30) sparkBuckets.shift();
  const el = $("sparkline");
  el.innerHTML = sparkBuckets
    .map((v) => {
      const tone = v < 1 ? "neutral" : v < 45 ? "friendly" : v < 70 ? "caution" : "hostile";
      const h = Math.max(4, (v / 100) * 100);
      return `<div class="sbar" data-tone="${tone}" style="height:${h}%"></div>`;
    })
    .join("");
}

// ══ 플랜 라이브러리 ══════════════════════════════════════════
function wirePlanLibrary(viewer: Viewer) {
  $("plan-save").addEventListener("click", () => {
    const nameEl = $("plan-name") as HTMLInputElement;
    const assets = (assetLayer?.list() ?? []).map((a) => ({
      kind: a.kind,
      lon: a.lon,
      lat: a.lat,
    }));
    if (!assets.length) {
      nameEl.placeholder = tr("asset.name.placeholder");
      return;
    }
    savePlan({ name: nameEl.value, locId: currentLocId, assets, kpis: lastOptimKpis });
    nameEl.value = "";
    logEvent({
      type: "system",
      msg: tr("log.plan.save", { count: assets.length }),
      tone: "friendly",
    });
    renderPlanList();
    renderPlanSelect();
  });

  ($("plan-select") as HTMLSelectElement).addEventListener("change", (e) => {
    const id = (e.target as HTMLSelectElement).value;
    if (id) loadPlanById(viewer, id);
  });
}

function loadPlanById(_viewer: Viewer, id: string) {
  const plan = getPlan(id);
  if (!plan || !assetLayer) return;
  for (const pid of optimIds) assetLayer.remove(pid);
  assetLayer.clear();
  optimIds = [];
  for (const a of plan.assets) assetLayer.placeAt(a.kind, a.lon, a.lat);
  logEvent({ type: "system", msg: tr("log.plan.load", { name: plan.name }), tone: "friendly" });
  updateCoverConf();
}

function renderPlanList() {
  const el = $("plan-list");
  const plans = listPlans(currentLocId);
  if (!plans.length) {
    el.innerHTML = `<div class="empty">${tr("plan.empty")}</div>`;
    return;
  }
  el.innerHTML = plans
    .map((p) => {
      const m = planMix(p.assets);
      const mix = ASSET_SPECS.filter((s) => m[s.kind]).map((s) => `${s.short} ${m[s.kind]}`).join(" · ");
      return (
        `<div class="plan-item"><div class="pi-main">` +
        `<span class="pi-name">${p.name}</span>` +
        `<span class="pi-meta">${tr("units.count", { n: p.assets.length })} · ${mix}</span></div>` +
        `<button class="pi-load" data-id="${p.id}">${tr("plan.apply")}</button>` +
        `<button class="pi-del" data-id="${p.id}">✕</button></div>`
      );
    })
    .join("");
  el.querySelectorAll<HTMLElement>(".pi-load").forEach((b) =>
    b.addEventListener("click", () => loadPlanById(null as any, b.dataset.id!))
  );
  el.querySelectorAll<HTMLElement>(".pi-del").forEach((b) =>
    b.addEventListener("click", () => {
      deletePlan(b.dataset.id!);
      renderPlanList();
      renderPlanSelect();
    })
  );
}

function renderPlanSelect() {
  const sel = $("plan-select") as HTMLSelectElement;
  const cur = sel.value;
  const plans = listPlans(currentLocId);
  sel.innerHTML =
    `<option value="">${tr("plan.select.empty")}</option>` +
    plans
      .map((p) => `<option value="${p.id}">${p.name} (${tr("units.count", { n: p.assets.length })})</option>`)
      .join("");
  if (plans.some((p) => p.id === cur)) sel.value = cur;
}

// ── 커버리지 신뢰도 (작전 우측 레일) ──
function updateCoverConf() {
  const c = assetLayer?.countByKind() ?? { radar: 0, scanner: 0, jammer: 0, counter: 0 };
  const on = (n: number) => (n > 0 ? `ONLINE · ${n}` : "OFFLINE");
  const set = (id: string, v: string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("cc-radar", on(c.radar));
  set("cc-scanner", on(c.scanner));
  set("cc-jammer", on(c.jammer));
  set("cc-counter", on(c.counter));
}

// ══ 트랙 테이블 ══════════════════════════════════════════════
function threatCss(t: Track): string {
  if (t.pred === "풍선" || (t.pred === "미상" && t.kind === "balloon")) return "#d9b54a";
  if (t.pred === "새/기타" || (t.pred === "미상" && t.kind === "bird")) return "#8a929a";
  if (t.T < 45) return "#88f298";
  if (t.T < 70) return "#d9b54a";
  return "#e0574a";
}
function fmtAltShort(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}k` : m.toFixed(0);
}
function killShort(kill: string): string {
  return kill === "hard" ? tr("kill.hard") : kill === "soft" ? tr("kill.soft") : tr("kill.watch");
}

function renderTrackTable(rows: HTMLElement, cnt: HTMLElement) {
  const tracks = currentSim?.getTracks() ?? [];
  cnt.textContent = String(tracks.length);
  const cntB = document.getElementById("cnt-drones-b");
  if (cntB) cntB.textContent = String(tracks.length);
  if (!tracks.length) {
    rows.innerHTML =
      '<tr><td colspan="7" class="track-empty">NO TRACKS IN WINDOW</td></tr>';
    updateThreatCondition([]);
    return;
  }
  const sorted = [...tracks].sort((a, b) => b.T - a.T);
  rows.innerHTML = sorted
    .map((t) => {
      if (!t.detected) {
        return (
          `<tr class="undet"><td>${t.id}</td><td>?</td>` +
          `<td>—</td><td>—</td><td>—</td><td>—</td>` +
          `<td class="thr">□□□□□</td></tr>`
        );
      }
      const col = threatCss(t);
      const eng = t.engaged === "hard" ? " KILL" : t.engaged === "soft" ? " JAM" : "";
      return (
        `<tr><td>${t.id}</td><td>${PRED_SHORT[t.pred] ?? "UNK"}` +
        `<span class="truth">${KIND_SHORT[t.kind]}</span></td>` +
        `<td>${t.speed.toFixed(0)}</td><td>${fmtAltShort(t.altM)}</td>` +
        `<td>${t.T.toFixed(0)}</td><td>${killShort(t.response.kill)}${eng}</td>` +
        `<td class="thr" style="color:${col}">${t.threatBar()}</td></tr>`
      );
    })
    .join("");
  updateThreatCondition(sorted);
}

function updateThreatCondition(sorted: Track[]) {
  const box = $("threat-cond");
  const label = $("threat-cond-level");
  const max = sorted.reduce(
    (m, t) => (!t.detected || t.pred === "새/기타" ? m : Math.max(m, t.T)),
    0
  );
  let level: string, text: string;
  if (max < 45) [level, text] = ["low", "LOW"];
  else if (max < 70) [level, text] = ["elevated", "ELEVATED"];
  else if (max < 90) [level, text] = ["high", "HIGH"];
  else [level, text] = ["critical", "CRITICAL"];
  box.dataset.level = level;
  label.textContent = text;
}

// ══ 최적 배치 ════════════════════════════════════════════════
async function runOptimizer() {
  const btn = $("optim-run") as HTMLButtonElement;
  const out = $("optim-result");
  setPaletteMode(null);
  btn.disabled = true;
  out.textContent = tr("optim.result.running");
  try {
    const input = await loadOptimInput(currentLocId, DEFAULT_BUDGET);
    const res = await getOptimizer().run(input);
    for (const id of optimIds) assetLayer?.remove(id);
    optimIds = [];
    for (const p of res.placements) {
      const a = assetLayer?.placeAt(p.kind, p.lon, p.lat);
      if (a) optimIds.push(a.id);
    }
    renderOptimKpis(res);
    logEvent({
      type: "system",
      msg: tr("log.optim.result", { count: res.placements.length }),
      tone: "friendly",
    });
  } catch (e) {
    console.error("[optim] 최적화 실패:", e);
    out.textContent = tr("optim.result.failed");
  } finally {
    btn.disabled = false;
  }
}

function renderOptimKpis(res: OptimResult) {
  const s = res.score;
  const byKind: Record<string, number> = {};
  for (const p of res.placements) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1;
  const mix = Object.entries(byKind)
    .map(([k, n]) => `${ASSET_BY_KIND[k as AssetKind].short} ${n}`)
    .join(" · ");
  $("optim-result").innerHTML = tr("optim.result.summary", {
    count: res.placements.length,
    mix,
    ms: res.meta.ms.toFixed(0),
    cover: (s.protectedCoverage * 100).toFixed(0),
    collat: s.collateralPenalty.toFixed(1),
    cost: (s.cost / 1000).toFixed(0),
    total: s.total.toFixed(1),
  });

  // 우측 레일 KPI 카드 + 배지
  lastOptimKpis = {
    coverage: s.protectedCoverage,
    collateral: s.collateralPenalty,
    cost: s.cost,
    total: s.total,
  };
  $("kpi-cover").textContent = `${(s.protectedCoverage * 100).toFixed(0)}%`;
  $("kpi-collat").textContent = s.collateralPenalty.toFixed(1);
  $("kpi-cost").textContent = `${(s.cost / 1000).toFixed(0)}k`;
  $("kpi-total").textContent = s.total.toFixed(1);
  const badges: Array<[string, boolean]> = [
    [tr("optim.badge.cover", { cover: (s.protectedCoverage * 100).toFixed(0) }), s.protectedCoverage >= 0.8],
    [tr("optim.badge.collat", { collat: s.collateralPenalty.toFixed(1) }), s.collateralPenalty <= 10],
    [tr("optim.badge.assets", { n: res.placements.length }), res.placements.length <= 12],
  ];
  $("kpi-badges").innerHTML = badges
    .map(([t, ok]) => `<span class="badge" data-pass="${ok}">${t}</span>`)
    .join("");
}

function resetKpiCards() {
  for (const id of ["kpi-cover", "kpi-collat", "kpi-cost", "kpi-total"]) {
    const el = document.getElementById(id);
    if (el) el.textContent = "--";
  }
  const badges = document.getElementById("kpi-badges");
  if (badges) badges.innerHTML = "";
}

// ══ 배치 모드 / 스폰 모드 ════════════════════════════════════
function setPaletteMode(kind: AssetKind | null) {
  if (kind) {
    currentSim?.setSpawnMode(null);
    syncSpawnPalette();
  }
  assetLayer?.setMode(kind);
  for (const spec of ASSET_SPECS) {
    $(`asset-${spec.kind}`).classList.toggle("active", kind === spec.kind);
  }
  $("asset-hint").textContent = kind
    ? tr("asset.hint.active", { label: tr(`asset.${kind}.name`) })
    : tr("asset.hint");
}

function setSpawnMode(kind: "drone" | "balloon" | "bird" | null) {
  if (kind) setPaletteMode(null);
  currentSim?.setSpawnMode(kind);
  syncSpawnPalette();
  const hint = document.getElementById("spawn-hint");
  if (hint)
    hint.textContent = kind
      ? tr("spawn.hint.active", { label: tr(`spawn.${kind}.name`) })
      : tr("spawn.hint");
}
function syncSpawnPalette() {
  const cur = currentSim?.getSpawnMode() ?? null;
  for (const k of ["drone", "balloon", "bird"]) {
    document.getElementById(`spawn-${k}`)?.classList.toggle("active", cur === k);
  }
}

// ══ 배치 장비 목록 ═══════════════════════════════════════════
function renderAssetList() {
  const list = assetLayer?.list() ?? [];
  const total = document.getElementById("asset-total");
  if (total) total.textContent = `(${list.length})`;
  const el = $("asset-list");
  if (!list.length) {
    el.innerHTML = `<div class="empty">${tr("asset.empty")}</div>`;
    return;
  }
  el.innerHTML = list
    .map((a) => {
      const s = ASSET_BY_KIND[a.kind];
      return (
        `<div class="asset-row" data-id="${a.id}" title="${tr("asset.row.title")}"><span class="dot" style="background:${s.color}"></span>` +
        `<span class="aid">${a.id}</span><span class="arole">${tr(`asset.role.${a.kind}`)}</span>` +
        `<span class="rm" data-id="${a.id}">✕</span></div>`
      );
    })
    .join("");
  // 행 클릭 → 해당 장비 위치로 지도 확대
  el.querySelectorAll<HTMLElement>(".asset-row").forEach((row) =>
    row.addEventListener("click", () => {
      const a = assetLayer?.list().find((x) => x.id === row.dataset.id);
      if (a && viewerRef)
        viewerRef.camera.flyTo({
          destination: Cartesian3.fromDegrees(a.lon, a.lat, 1400),
          orientation: { heading: 0, pitch: CesiumMath.toRadians(-55), roll: 0 },
          duration: 0.8,
        });
    })
  );
  // 삭제 (행 클릭과 분리)
  el.querySelectorAll<HTMLElement>(".rm").forEach((x) =>
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      assetLayer?.remove(x.dataset.id!);
    })
  );
}

function wireToggle(id: string, get: () => { show: boolean } | undefined) {
  const cb = document.getElementById(id) as HTMLInputElement | null;
  if (!cb) return;
  cb.addEventListener("change", () => {
    const ds = get();
    if (ds) ds.show = cb.checked;
  });
}

function applyToggleState(id: string, ds: { show: boolean }) {
  const cb = document.getElementById(id) as HTMLInputElement | null;
  if (cb) ds.show = cb.checked;
}

main().catch((e) => console.error(e));
