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
  const rows = [
    ["작전영역 ID", loc.area_id],
    ["작전영역 이름", loc.name],
    ["영문 이름", loc.name_en],
    ["중심 좌표", `${loc.center.lat.toFixed(5)}, ${loc.center.lon.toFixed(5)}`],
    ["반경", `${loc.radius_m.toLocaleString("ko-KR")} m`],
    ["인구밀도", loc.pop_density ? `${loc.pop_density.toLocaleString("ko-KR")} / km²` : undefined],
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
        <div class="bi-title">${escapeInfoHtml(loc.name)}</div>
      </div>
      <div class="bi-score"><b>AO</b><span>작전영역</span></div>
    </div>
    <div class="bi-summary">
      <div class="bi-metric"><span>기준 위치</span><b>${escapeInfoHtml(loc.name_en ?? loc.area_id)}</b></div>
      <div class="bi-metric"><span>데이터 상태</span><b>ACTIVE</b></div>
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
  for (const [id, loc] of Object.entries(LOCS)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = loc.name;
    sel.appendChild(opt);
  }
  sel.value = DEFAULT_LOC;
  sel.addEventListener("change", () => loadLocation(viewer, sel.value, false));

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
    btnToggle.textContent = run ? "⏸ 일시정지" : "▶ 재생";
    status.textContent = run ? "● RUN" : "● PAUSE";
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

  $("hud-title").textContent = `bunkr · ${loc.name} COP`;

  if (centerEntity) viewer.entities.remove(centerEntity);
  centerEntity = viewer.entities.add({
    name: loc.name,
    description: new ConstantProperty(buildLocationDescription(loc)),
    position: Cartesian3.fromDegrees(lon, lat, 30),
    point: {
      pixelSize: 12,
      color: Color.fromCssColorString("#88f298"),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: loc.name,
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
  $("optim-result").textContent = "최적배치 실행 → 보호커버·부수피해·비용 최적화";
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
      msg: `교전규칙 → ${next.toUpperCase()}`,
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
      msg: `${PRED_SHORT[t.pred] ?? "UNK"} 확인 · RNG ${distFromCenter(t)}KM`,
      tone: "caution",
    })
  );
  sim.onEngagement((t) =>
    logEvent({
      type: "engage",
      trackId: t.id,
      msg: t.engaged === "hard" ? "HARD-KILL 교전" : "RF JAM 교전",
      tone: t.engaged === "hard" ? "hostile" : "caution",
    })
  );
  sim.onEngagementRequest((t) =>
    logEvent({
      type: "authreq",
      trackId: t.id,
      msg: `하드킬 승인 요청 · T ${t.T.toFixed(0)}`,
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
    el.innerHTML = '<div class="empty">대기 중인 교전 없음</div>';
  } else {
    el.innerHTML = pending
      .map(
        (t) =>
          `<div class="auth-item"><div class="ai-line">${t.id} · ${
            PRED_SHORT[t.pred] ?? "UNK"
          } · T <b>${t.T.toFixed(0)}</b></div>` +
          `<div class="ai-actions"><button class="ai-ok" data-id="${t.id}">교전</button>` +
          `<button class="ai-no" data-id="${t.id}">보류</button></div></div>`
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
    msg: approve ? "교전 승인 (OPS-07)" : "교전 보류 (OPS-07)",
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
  $("alert-msg").textContent = `미해결 적대 트랙 ${hostile.length} · ${top.id} T ${top.T.toFixed(
    0
  )} · RNG ${distFromCenter(top)}KM`;
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
      nameEl.placeholder = "먼저 장비를 배치하세요";
      return;
    }
    savePlan({ name: nameEl.value, locId: currentLocId, assets, kpis: lastOptimKpis });
    nameEl.value = "";
    logEvent({ type: "system", msg: `플랜 저장 (${assets.length}기)`, tone: "friendly" });
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
  logEvent({ type: "system", msg: `플랜 로드: ${plan.name}`, tone: "friendly" });
  updateCoverConf();
}

function renderPlanList() {
  const el = $("plan-list");
  const plans = listPlans(currentLocId);
  if (!plans.length) {
    el.innerHTML = '<div class="empty">저장된 플랜 없음</div>';
    return;
  }
  el.innerHTML = plans
    .map((p) => {
      const m = planMix(p.assets);
      const mix = ASSET_SPECS.filter((s) => m[s.kind]).map((s) => `${s.short} ${m[s.kind]}`).join(" · ");
      return (
        `<div class="plan-item"><div class="pi-main">` +
        `<span class="pi-name">${p.name}</span>` +
        `<span class="pi-meta">${p.assets.length}기 · ${mix}</span></div>` +
        `<button class="pi-load" data-id="${p.id}">적용</button>` +
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
    '<option value="">— 가져오지 못했습니다 (수동 배치 사용) —</option>' +
    plans.map((p) => `<option value="${p.id}">${p.name} (${p.assets.length}기)</option>`).join("");
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
  return kill === "hard" ? "하드" : kill === "soft" ? "소프트" : "감시";
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
  out.textContent = "최적 배치 계산 중…";
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
    logEvent({ type: "system", msg: `최적배치 ${res.placements.length}기 산출`, tone: "friendly" });
  } catch (e) {
    console.error("[optim] 최적화 실패:", e);
    out.textContent = "최적화 실패 (콘솔 확인)";
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
  $("optim-result").innerHTML =
    `배치 <b>${res.placements.length}</b>기 (${mix}) · ${res.meta.ms.toFixed(0)}ms<br>` +
    `보호커버 <b>${(s.protectedCoverage * 100).toFixed(0)}%</b> · ` +
    `부수피해 <b>${s.collateralPenalty.toFixed(1)}</b> · ` +
    `비용 <b>${(s.cost / 1000).toFixed(0)}k</b> · 종합 <b>${s.total.toFixed(1)}</b>`;

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
    [`보호커버 ${(s.protectedCoverage * 100).toFixed(0)}%`, s.protectedCoverage >= 0.8],
    [`부수피해 ${s.collateralPenalty.toFixed(1)}`, s.collateralPenalty <= 10],
    [`장비 ${res.placements.length}기`, res.placements.length <= 12],
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
    ? `${ASSET_BY_KIND[kind].label} 배치 중 — 지도 클릭 (Esc 취소)`
    : "유형 선택 후 지도 클릭 → 배치";
}

const KIND_LABEL: Record<string, string> = { drone: "드론", balloon: "풍선", bird: "조류" };

function setSpawnMode(kind: "drone" | "balloon" | "bird" | null) {
  if (kind) setPaletteMode(null);
  currentSim?.setSpawnMode(kind);
  syncSpawnPalette();
  const hint = document.getElementById("spawn-hint");
  if (hint)
    hint.textContent = kind
      ? `${KIND_LABEL[kind]} 생성 중 — 지도 클릭 (Esc 취소)`
      : "유형 선택 후 지도 클릭 → 생성";
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
    el.innerHTML = '<div class="empty">배치된 장비 없음</div>';
    return;
  }
  el.innerHTML = list
    .map((a) => {
      const s = ASSET_BY_KIND[a.kind];
      return (
        `<div class="asset-row" data-id="${a.id}" title="지도에서 위치 보기"><span class="dot" style="background:${s.color}"></span>` +
        `<span class="aid">${a.id}</span><span class="arole">${s.role}</span>` +
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
