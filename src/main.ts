import {
  Ion,
  Viewer,
  Terrain,
  Cartesian3,
  Math as CesiumMath,
  createOsmBuildingsAsync,
  createWorldImageryAsync,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Color,
  Cartographic,
  LabelStyle,
  VerticalOrigin,
  Cartesian2,
  UrlTemplateImageryProvider,
  ProviderViewModel,
  Entity,
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
import { startDroneSim, type DroneSim, type Track, type SensorProvider } from "./sim/drones";
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
import { setupDsoPanel } from "./llm/panel";
import locationsCfg from "../locations.json";

// ── 기준 위치 레지스트리 ───────────────────────────────────────
interface Loc {
  area_id: string;
  name: string;
  name_en?: string;
  center: { lon: number; lat: number };
  radius_m: number;
  pop_density?: number; // 실시간 인구밀집 (부수피해 → 대응결심)
  population?: {
    congest_lvl?: string;
    population_max?: number;
    ppltn_time?: string;
  };
}
const LOCS = locationsCfg.locations as Record<string, Loc>;
const DEFAULT_LOC = locationsCfg.default as string;

// ── Cesium Ion 토큰 ───────────────────────────────────────────
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;
else console.warn("[yangjae3dmap] VITE_CESIUM_ION_TOKEN 미설정");

// ── 베이스맵 (모두 API 키 불필요 · 배포 도메인 무관) ───────────
// Stadia 는 배포 도메인에서 키를 요구하므로 제외. 기본 = Ion Satellite(위성).
// 나머지는 피커(우상단 지구본 아이콘)로 전환 가능한 대체 테마.
function carto(style: string) {
  return new UrlTemplateImageryProvider({
    url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`,
    subdomains: ["a", "b", "c", "d"],
    credit: "© CARTO · © OpenStreetMap contributors",
    maximumLevel: 20,
  });
}
function esri(path: string) {
  return new UrlTemplateImageryProvider({
    url: `https://server.arcgisonline.com/ArcGIS/rest/services/${path}/MapServer/tile/{z}/{y}/{x}`,
    credit: "© Esri",
    maximumLevel: 19,
  });
}
function tiles(url: string, credit: string, sub?: string[], maxL = 19) {
  return new UrlTemplateImageryProvider({
    url,
    ...(sub ? { subdomains: sub } : {}),
    credit,
    maximumLevel: maxL,
  });
}
const vm = (name: string, tooltip: string, fn: () => any) =>
  new ProviderViewModel({ name, tooltip, iconUrl: "", creationFunction: fn });

// [0]=기본 = Ion Satellite(위성). 이후 위성 → 다크 → 라이트 → 지형 순.
const BASEMAPS = [
  vm("Ion Satellite", "Cesium Ion 위성 (기본)", () => createWorldImageryAsync()),
  vm("Esri Imagery", "Esri 위성", () => esri("World_Imagery")),
  vm("Dark Matter", "CartoDB Dark", () => carto("dark_all")),
  vm("Dark (라벨없음)", "CartoDB Dark no-labels", () => carto("dark_nolabels")),
  vm("Esri Dark Gray", "Esri Dark Gray Canvas", () => esri("Canvas/World_Dark_Gray_Base")),
  vm("Voyager", "CartoDB Voyager (밝은 컬러)", () => carto("rastertiles/voyager")),
  vm("Positron", "CartoDB Light", () => carto("light_all")),
  vm("Esri Street", "Esri World Street", () => esri("World_Street_Map")),
  vm("OSM", "OpenStreetMap Standard", () =>
    tiles("https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap contributors")),
  vm("OpenTopo", "OpenTopoMap 지형", () =>
    tiles("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", "© OpenTopoMap (CC-BY-SA) · © OSM", ["a", "b", "c"], 17)),
];

// ── 현재 상태 ─────────────────────────────────────────────────
let centerEntity: Entity | undefined;
let current: Layers | undefined;
let currentSim: DroneSim | undefined;
let assetLayer: AssetLayer | undefined;
let currentLocId = DEFAULT_LOC;
// 최적배치가 만든 자산 id (재실행 시 이전 최적분만 제거 — 수동 배치는 유지).
let optimIds: string[] = [];

// 수동 배치와 최적 배치는 동일한 PlacedAsset 모델을 공유하므로, 킬체인 센서는
// assetLayer 하나만 질의한다(활성 토글·커버리지 판정 모두 여기서 처리).
const combinedSensors: SensorProvider = {
  covers: (kind, lon, lat) => assetLayer?.covers(kind, lon, lat) ?? false,
  isKindActive: (kind) => assetLayer?.isKindActive(kind) ?? true,
};

const KIND_SHORT: Record<string, string> = {
  drone: "DRN",
  balloon: "BLN",
  bird: "BIRD",
};
const PRED_SHORT: Record<string, string> = {
  드론: "UAV",
  풍선: "BLN",
  "새/기타": "BIRD",
  미상: "UNK",
};
const ASSET_BY_KIND = Object.fromEntries(
  ASSET_SPECS.map((s) => [s.kind, s])
) as Record<AssetKind, (typeof ASSET_SPECS)[number]>;

async function main() {
  const viewer = new Viewer("cesiumContainer", {
    terrain: Terrain.fromWorldTerrain(),
    baseLayerPicker: true,
    imageryProviderViewModels: BASEMAPS,
    selectedImageryProviderViewModel: BASEMAPS[0],
    terrainProviderViewModels: [],
    animation: false,
    timeline: false,
    geocoder: true,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: true,
  });
  viewer.scene.globe.enableLighting = true;

  // 실제 3D 건물 (전역, 위치 무관)
  try {
    viewer.scene.primitives.add(await createOsmBuildingsAsync());
  } catch (e) {
    console.error("[yangjae3dmap] OSM Buildings 로드 실패:", e);
  }

  // 축척 연동 전술 그리드 + 스케일바 (그리드 정렬 기준점 = 기본 위치)
  setupGrid(viewer, LOCS[DEFAULT_LOC].center, {
    scaleBarInner: document.getElementById("scalebar-inner")!,
    scaleBarLabel: document.getElementById("scalebar-label")!,
    hudScale: document.getElementById("hud-scale")!,
  });

  // 위치 스위처 채우기
  const sel = document.getElementById("loc-select") as HTMLSelectElement;
  for (const [id, loc] of Object.entries(LOCS)) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = loc.name;
    sel.appendChild(opt);
  }
  sel.value = DEFAULT_LOC;
  sel.addEventListener("change", () => loadLocation(viewer, sel.value, false));

  // 레이어 토글 (현재 로드된 레이어를 참조)
  wireToggle("lyr-zones", () => current?.zones);
  wireToggle("lyr-sites", () => current?.sites);
  wireToggle("lyr-ao", () => current?.ao);

  // 위협체 레이어 토글
  (document.getElementById("lyr-drones") as HTMLInputElement).addEventListener(
    "change",
    (e) => currentSim?.setVisible((e.target as HTMLInputElement).checked)
  );

  // 위협 시뮬 컨트롤
  const btnToggle = document.getElementById("sim-toggle") as HTMLButtonElement;
  const status = document.getElementById("sim-status")!;
  btnToggle.addEventListener("click", () => {
    const run = currentSim?.toggle() ?? false;
    btnToggle.textContent = run ? "⏸ 일시정지" : "▶ 재생";
    status.textContent = run ? "● RUN" : "● PAUSE";
    status.classList.toggle("paused", !run);
  });
  document
    .getElementById("sim-trails")!
    .addEventListener("change", (e) =>
      currentSim?.setTrailsVisible((e.target as HTMLInputElement).checked)
    );
  // 위협 스폰 팔레트 (지도 클릭으로 직접 스폰 — 자동생성 없음)
  for (const kind of ["drone", "balloon", "bird"] as const) {
    document
      .getElementById(`spawn-${kind}`)!
      .addEventListener("click", () =>
        setSpawnMode(currentSim?.getSpawnMode() === kind ? null : kind)
      );
  }
  document
    .getElementById("spawn-clear")!
    .addEventListener("click", () => currentSim?.clearTracks());
  document
    .getElementById("sim-altcompress")!
    .addEventListener("change", (e) =>
      currentSim?.setAltCompress((e.target as HTMLInputElement).checked)
    );

  // 방어 자산 배치
  assetLayer = setupAssets(viewer);
  assetLayer.onChange(renderAssetList);
  renderAssetList();
  for (const spec of ASSET_SPECS) {
    document
      .getElementById(`asset-${spec.kind}`)!
      .addEventListener("click", () =>
        setPaletteMode(assetLayer!.getMode() === spec.kind ? null : spec.kind)
      );
  }
  document
    .getElementById("asset-clear")!
    .addEventListener("click", () => assetLayer!.clear());
  // 효과기 활성/비활성 (재머·하드킬)
  document
    .getElementById("eff-jammer")!
    .addEventListener("change", (e) =>
      assetLayer!.setKindActive("jammer", (e.target as HTMLInputElement).checked)
    );
  document
    .getElementById("eff-counter")!
    .addEventListener("change", (e) =>
      assetLayer!.setKindActive("counter", (e.target as HTMLInputElement).checked)
    );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setPaletteMode(null);
      setSpawnMode(null);
    }
  });

  // 자동 최적 배치 (모듈형 옵티마이저 — 수동과 동일 PlacedAsset 모델로 배치)
  document.getElementById("optim-name")!.textContent = getOptimizer().name;
  document.getElementById("optim-run")!.addEventListener("click", runOptimizer);

  // 모듈 접기/펼치기
  document.querySelectorAll<HTMLElement>(".mod-head[data-toggle]").forEach((h) =>
    h.addEventListener("click", () => h.closest(".mod")!.classList.toggle("collapsed"))
  );

  // 실시간 트랙 테이블 + THREAT CONDITION (4Hz)
  const rows = document.getElementById("track-rows")!;
  const cntDrones = document.getElementById("cnt-drones")!;
  setInterval(() => renderTrackTable(rows, cntDrones), 250);

  // 마우스 위치 → HUD 좌표
  const hudCoord = document.getElementById("hud-coord")!;
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

  // AI 결심지원(DSO) 패널 — 매 질의 시 라이브 COP 스냅샷을 주입해 지휘관 보좌.
  setupDsoPanel(() => {
    const loc = LOCS[currentLocId];
    return {
      locName: loc.name,
      popDensity: loc.pop_density ?? 0.5,
      population: loc.population,
      threatCondition:
        document.getElementById("threat-cond-level")?.textContent?.trim() ??
        "LOW",
      tracks: currentSim?.getTracks() ?? [],
      assets: assetLayer?.list() ?? [],
    };
  });

  await loadLocation(viewer, DEFAULT_LOC, true);
}

// 위치 전환: 카메라·마커·타이틀·레이어 갱신
async function loadLocation(viewer: Viewer, id: string, initial: boolean) {
  const loc = LOCS[id];
  if (!loc) return;
  currentLocId = id;
  const { lon, lat } = loc.center;

  document.getElementById("hud-title")!.textContent = `AEGIS · ${loc.name} COP`;

  // 중심 마커 재배치
  if (centerEntity) viewer.entities.remove(centerEntity);
  centerEntity = viewer.entities.add({
    name: loc.name,
    position: Cartesian3.fromDegrees(lon, lat, 30),
    point: {
      pixelSize: 12,
      color: Color.fromCssColorString("#35e0e6"),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
    },
    label: {
      text: loc.name,
      font: "13px 'SF Mono', monospace",
      fillColor: Color.fromCssColorString("#dff7f8"),
      style: LabelStyle.FILL_AND_OUTLINE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(0, -16),
    },
  });

  // 카메라 진입 (위협 스폰 반경 ~5km + 압축된 고고도 트랙까지 담도록 넓게 프레이밍)
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat - 0.03, 4200),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-42),
      roll: 0,
    },
    duration: initial ? 2.5 : 1.5,
  });

  // 데이터 레이어 교체
  current?.destroy();
  current = undefined;
  try {
    const layers = await setupLayers(viewer, id);
    current = layers;
    document.getElementById("cnt-sites")!.textContent = String(layers.siteCount);
    applyToggleState("lyr-zones", layers.zones);
    applyToggleState("lyr-sites", layers.sites);
    applyToggleState("lyr-ao", layers.ao);
  } catch (e) {
    console.error("[yangjae3dmap] 레이어 로드 실패:", e);
    document.getElementById("cnt-sites")!.textContent = "—";
  }

  // 배치 자산 초기화 (AO가 바뀌면 무의미). 수동·최적 모두 assetLayer 하나로 관리.
  assetLayer?.clear();
  optimIds = [];
  setPaletteMode(null);
  document.getElementById("optim-result")!.textContent =
    "최적배치 실행 → 보호커버·부수피해·비용 최적화";

  // 위협 시뮬 재시작 (새 AO 기준, cuas 엔진)
  currentSim?.destroy();
  currentSim = undefined;
  currentSim = await startDroneSim(viewer, {
    locId: id,
    center: loc.center,
    radiusM: loc.radius_m,
    popDensity: loc.pop_density ?? 0.5, // 실시간 인구밀집 → 대응결심 부수피해
    sensors: combinedSensors, // 수동·최적 배치(동일 모델) → 탐지·교전
  });
  currentSim.setVisible(
    (document.getElementById("lyr-drones") as HTMLInputElement).checked
  );
  currentSim.setTrailsVisible(
    (document.getElementById("sim-trails") as HTMLInputElement).checked
  );
  currentSim.setAltCompress(
    (document.getElementById("sim-altcompress") as HTMLInputElement).checked
  );
  syncSpawnPalette(); // 새 sim: 스폰 모드 초기화 반영
  // 컨트롤 상태 초기화
  const btnToggle = document.getElementById("sim-toggle") as HTMLButtonElement;
  const status = document.getElementById("sim-status")!;
  btnToggle.textContent = "⏸ 일시정지";
  status.textContent = "● RUN";
  status.classList.remove("paused");
}

// 실시간 트랙 테이블 렌더
function threatCss(t: Track): string {
  if (t.pred === "풍선" || (t.pred === "미상" && t.kind === "balloon")) return "#5eb0ff";
  if (t.pred === "새/기타" || (t.pred === "미상" && t.kind === "bird")) return "#9aa4ad";
  if (t.T < 45) return "#37d67a";
  if (t.T < 70) return "#f5a623";
  return "#ff3b46";
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
  const sorted = [...tracks].sort((a, b) => b.T - a.T);
  rows.innerHTML = sorted
    .map((t) => {
      // 미확인 트랙: 상세 없이 "?"만
      if (!t.detected) {
        return (
          `<tr class="undet"><td>${t.id}</td><td>?</td>` +
          `<td>—</td><td>—</td><td>—</td><td>—</td>` +
          `<td class="thr">□□□□□</td></tr>`
        );
      }
      const col = threatCss(t);
      const eng =
        t.engaged === "hard" ? " KILL" : t.engaged === "soft" ? " JAM" : "";
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

// THREAT CONDITION — 라이브 최고 위협도(조류 판정 제외)로 결정. T 는 0~100.
function updateThreatCondition(sorted: Track[]) {
  const box = document.getElementById("threat-cond")!;
  const label = document.getElementById("threat-cond-level")!;
  // 확인(detected)되고 조류가 아닌 트랙만 위협 조건에 반영
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

// 최적 배치 실행: 옵티마이저(교체 가능) → 결과를 수동과 동일한 PlacedAsset 으로 배치.
async function runOptimizer() {
  const btn = document.getElementById("optim-run") as HTMLButtonElement;
  const out = document.getElementById("optim-result")!;
  setPaletteMode(null);
  btn.disabled = true;
  out.textContent = "최적 배치 계산 중…";
  try {
    const input = await loadOptimInput(currentLocId, DEFAULT_BUDGET);
    const res = await getOptimizer().run(input);
    // 이전 최적배치분만 제거(수동 배치는 유지) 후 재배치.
    for (const id of optimIds) assetLayer?.remove(id);
    optimIds = [];
    for (const p of res.placements) {
      const a = assetLayer?.placeAt(p.kind, p.lon, p.lat);
      if (a) optimIds.push(a.id);
    }
    renderOptimKpis(res);
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
  document.getElementById("optim-result")!.innerHTML =
    `배치 <b>${res.placements.length}</b>기 (${mix}) · ${res.meta.ms.toFixed(0)}ms<br>` +
    `보호커버 <b>${(s.protectedCoverage * 100).toFixed(0)}%</b> · ` +
    `부수피해 <b>${s.collateralPenalty.toFixed(1)}</b> · ` +
    `비용 <b>${(s.cost / 1000).toFixed(0)}k</b> · ` +
    `종합 <b>${s.total.toFixed(1)}</b>`;
}

// 자산 배치 모드 전환 + 팔레트 UI 반영
function setPaletteMode(kind: AssetKind | null) {
  if (kind) {
    // 위협 스폰과 상호배타
    currentSim?.setSpawnMode(null);
    syncSpawnPalette();
  }
  assetLayer?.setMode(kind);
  for (const spec of ASSET_SPECS) {
    document
      .getElementById(`asset-${spec.kind}`)!
      .classList.toggle("active", kind === spec.kind);
  }
  const hint = document.getElementById("asset-hint")!;
  hint.textContent = kind
    ? `${ASSET_BY_KIND[kind].label} 배치 중 — 지도 클릭 (Esc 취소)`
    : "유형 선택 후 지도 클릭 → 배치";
}

const KIND_LABEL: Record<string, string> = { drone: "드론", balloon: "풍선", bird: "조류" };

// 위협 스폰 모드 전환 + 팔레트 UI 반영
function setSpawnMode(kind: "drone" | "balloon" | "bird" | null) {
  if (kind) setPaletteMode(null); // 자산 배치와 상호배타
  currentSim?.setSpawnMode(kind);
  syncSpawnPalette();
  const hint = document.getElementById("spawn-hint")!;
  hint.textContent = kind
    ? `${KIND_LABEL[kind]} 스폰 중 — 지도 클릭 (Esc 취소)`
    : "유형 선택 후 지도 클릭 → 스폰";
}
function syncSpawnPalette() {
  const cur = currentSim?.getSpawnMode() ?? null;
  for (const k of ["drone", "balloon", "bird"]) {
    document.getElementById(`spawn-${k}`)?.classList.toggle("active", cur === k);
  }
}

// 배치 자산 목록 렌더
function renderAssetList() {
  const list = assetLayer?.list() ?? [];
  document.getElementById("asset-total")!.textContent = String(list.length);
  const el = document.getElementById("asset-list")!;
  if (!list.length) {
    el.innerHTML = '<div class="empty">배치된 자산 없음</div>';
    return;
  }
  el.innerHTML = list
    .map((a) => {
      const s = ASSET_BY_KIND[a.kind];
      return (
        `<div class="asset-row"><span class="dot" style="background:${s.color}"></span>` +
        `<span class="aid">${a.id}</span><span class="arole">${s.role}</span>` +
        `<span class="rm" data-id="${a.id}">✕</span></div>`
      );
    })
    .join("");
  el.querySelectorAll<HTMLElement>(".rm").forEach((x) =>
    x.addEventListener("click", () => assetLayer?.remove(x.dataset.id!))
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
