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
import "./style.css";
import { setupGrid } from "./grid";
import { setupLayers, type Layers } from "./layers";
import { startDroneSim, type DroneSim, type Track } from "./sim/drones";
import locationsCfg from "../locations.json";

// ── 기준 위치 레지스트리 ───────────────────────────────────────
interface Loc {
  area_id: string;
  name: string;
  name_en?: string;
  center: { lon: number; lat: number };
  radius_m: number;
}
const LOCS = locationsCfg.locations as Record<string, Loc>;
const DEFAULT_LOC = locationsCfg.default as string;

// ── Cesium Ion 토큰 ───────────────────────────────────────────
const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;
else console.warn("[yangjae3dmap] VITE_CESIUM_ION_TOKEN 미설정");

// ── Stadia Maps 베이스맵 (Alidade) ───────────────────────────
function stadia(style: string) {
  return new UrlTemplateImageryProvider({
    url: `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}.png`,
    credit: "© Stadia Maps · © OpenMapTiles · © OpenStreetMap",
    maximumLevel: 20,
  });
}
const alidadeDark = new ProviderViewModel({
  name: "Alidade Smooth Dark",
  tooltip: "Stadia Alidade Smooth Dark (기본)",
  iconUrl: "",
  creationFunction: () => stadia("alidade_smooth_dark"),
});
const alidadeLight = new ProviderViewModel({
  name: "Alidade Smooth",
  tooltip: "Stadia Alidade Smooth (라이트)",
  iconUrl: "",
  creationFunction: () => stadia("alidade_smooth"),
});
const satellite = new ProviderViewModel({
  name: "Satellite",
  tooltip: "위성 영상 (Bing / Cesium Ion)",
  iconUrl: "",
  creationFunction: () => createWorldImageryAsync(),
});

// ── 현재 상태 ─────────────────────────────────────────────────
let centerEntity: Entity | undefined;
let current: Layers | undefined;
let currentSim: DroneSim | undefined;

const TYPE_SHORT: Record<string, string> = {
  quad: "QUAD",
  fixedwing: "FWNG",
  balloon: "BLN",
  bird: "BIRD",
};

async function main() {
  const viewer = new Viewer("cesiumContainer", {
    terrain: Terrain.fromWorldTerrain(),
    baseLayerPicker: true,
    imageryProviderViewModels: [alidadeDark, alidadeLight, satellite],
    selectedImageryProviderViewModel: alidadeDark,
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
    .getElementById("sim-burst")!
    .addEventListener("click", () => currentSim?.spawnBurst(5));
  document
    .getElementById("sim-trails")!
    .addEventListener("change", (e) =>
      currentSim?.setTrailsVisible((e.target as HTMLInputElement).checked)
    );

  // 실시간 트랙 테이블 (4Hz)
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

  await loadLocation(viewer, DEFAULT_LOC, true);
}

// 위치 전환: 카메라·마커·타이틀·레이어 갱신
async function loadLocation(viewer: Viewer, id: string, initial: boolean) {
  const loc = LOCS[id];
  if (!loc) return;
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

  // 카메라 진입
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat - 0.012, 1600),
    orientation: {
      heading: 0,
      pitch: CesiumMath.toRadians(-35),
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

  // 위협 시뮬 재시작 (새 AO 기준)
  currentSim?.destroy();
  currentSim = startDroneSim(
    viewer,
    { center: loc.center, radiusM: loc.radius_m },
    { targetCount: 7 }
  );
  currentSim.setVisible(
    (document.getElementById("lyr-drones") as HTMLInputElement).checked
  );
  currentSim.setTrailsVisible(
    (document.getElementById("sim-trails") as HTMLInputElement).checked
  );
  // 컨트롤 상태 초기화
  const btnToggle = document.getElementById("sim-toggle") as HTMLButtonElement;
  const status = document.getElementById("sim-status")!;
  btnToggle.textContent = "⏸ 일시정지";
  status.textContent = "● RUN";
  status.classList.remove("paused");
}

// 실시간 트랙 테이블 렌더
function threatCss(t: Track): string {
  if (t.type === "bird") return "#9aa4ad";
  if (t.type === "balloon") return "#5eb0ff";
  if (t.threat < 0.4) return "#37d67a";
  if (t.threat < 0.7) return "#f5a623";
  return "#ff3b46";
}
function renderTrackTable(rows: HTMLElement, cnt: HTMLElement) {
  const tracks = currentSim?.getTracks() ?? [];
  cnt.textContent = String(tracks.length);
  const sorted = [...tracks].sort((a, b) => b.threat - a.threat);
  rows.innerHTML = sorted
    .map((t) => {
      const hdg = (((t.heading * 180) / Math.PI + 360) % 360) | 0;
      const col = threatCss(t);
      return (
        `<tr><td>${t.id}</td><td>${TYPE_SHORT[t.type]}</td>` +
        `<td>${t.speed.toFixed(0)}</td><td>${t.altM.toFixed(0)}</td>` +
        `<td>${hdg}°</td><td>${t.state[0].toUpperCase()}</td>` +
        `<td class="thr" style="color:${col}">${t.threatBar()}</td></tr>`
      );
    })
    .join("");
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
