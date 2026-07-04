import {
  Viewer,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  CustomDataSource,
  Math as CesiumMath,
  PerspectiveFrustum,
} from "cesium";

// ── 축척 연동 전술 그리드 + 스케일바 ────────────────────────────────
// 카메라 줌에 따라 격자 간격을 nice 값(…100·250·500·1000…)으로 자동 스냅.

const NICE_M = [
  5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000,
  25000, 50000, 100000, 200000,
];
const M_PER_DEG_LAT = 111320;
const TARGET_PX_PER_CELL = 90; // 격자 한 칸이 화면에서 대략 이 픽셀이 되도록
const DPI_M_PER_PX = 0.0254 / 96; // 96dpi 기준 1px 의 실제 길이(m) → 축척비 산출
const MAJOR_EVERY = 5; // 5칸마다 굵은 주선

export interface GridElements {
  scaleBarInner: HTMLElement;
  scaleBarLabel: HTMLElement;
  hudScale: HTMLElement;
}

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString()} km` : `${m} m`;
}

export function setupGrid(
  viewer: Viewer,
  origin: { lon: number; lat: number },
  el: GridElements
) {
  const ds = new CustomDataSource("tactical-grid");
  viewer.dataSources.add(ds);
  const scene = viewer.scene;
  const cyan = Color.fromCssColorString("#35e0e6");

  function metersPerPixel(): number {
    const w = scene.canvas.clientWidth;
    const h = scene.canvas.clientHeight;
    const p1 = viewer.camera.pickEllipsoid(new Cartesian2(w / 2, h / 2));
    const p2 = viewer.camera.pickEllipsoid(new Cartesian2(w / 2 + 100, h / 2));
    if (p1 && p2) return Cartesian3.distance(p1, p2) / 100;
    // 지평선이 보여 픽킹 실패 → 카메라 고도·FOV 로 근사
    const height = viewer.camera.positionCartographic.height;
    const frustum = scene.camera.frustum as PerspectiveFrustum;
    const fovy = frustum.fovy ?? 1;
    return (2 * height * Math.tan(fovy / 2)) / h;
  }

  function centerCarto(): Cartographic {
    const w = scene.canvas.clientWidth;
    const h = scene.canvas.clientHeight;
    const c = viewer.camera.pickEllipsoid(new Cartesian2(w / 2, h / 2));
    if (c) return Cartographic.fromCartesian(c);
    return viewer.camera.positionCartographic; // 카메라 직하점
  }

  function niceSpacing(mpp: number): number {
    const raw = mpp * TARGET_PX_PER_CELL;
    for (const n of NICE_M) if (n >= raw) return n;
    return NICE_M[NICE_M.length - 1];
  }

  function rebuild() {
    const mpp = metersPerPixel();
    if (!isFinite(mpp) || mpp <= 0) return;
    const S = niceSpacing(mpp);
    const center = centerCarto();
    const cLatRad = center.latitude;

    const dLat = S / M_PER_DEG_LAT;
    const dLon = S / (M_PER_DEG_LAT * Math.cos(cLatRad));

    const w = scene.canvas.clientWidth;
    const h = scene.canvas.clientHeight;
    const R = (mpp * Math.hypot(w, h)) / 2 * 1.3; // 화면 대각 절반 + 여유
    const n = Math.min(Math.ceil(R / S), 90); // 라인 수 상한

    const cLon = CesiumMath.toDegrees(center.longitude);
    const cLat = CesiumMath.toDegrees(center.latitude);
    // 격자를 origin 기준으로 정렬 → 팬 해도 라인이 흔들리지 않음
    const i0 = Math.round((cLon - origin.lon) / dLon);
    const j0 = Math.round((cLat - origin.lat) / dLat);

    const latMin = origin.lat + (j0 - n) * dLat;
    const latMax = origin.lat + (j0 + n) * dLat;
    const lonMin = origin.lon + (i0 - n) * dLon;
    const lonMax = origin.lon + (i0 + n) * dLon;

    ds.entities.suspendEvents();
    ds.entities.removeAll();

    // 세로선 (경도 고정)
    for (let i = i0 - n; i <= i0 + n; i++) {
      const lon = origin.lon + i * dLon;
      const major = i % MAJOR_EVERY === 0;
      ds.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArray([lon, latMin, lon, latMax]),
          width: major ? 1.6 : 0.7,
          material: cyan.withAlpha(major ? 0.32 : 0.13),
          clampToGround: true,
        },
      });
    }
    // 가로선 (위도 고정)
    for (let j = j0 - n; j <= j0 + n; j++) {
      const lat = origin.lat + j * dLat;
      const major = j % MAJOR_EVERY === 0;
      ds.entities.add({
        polyline: {
          positions: Cartesian3.fromDegreesArray([lonMin, lat, lonMax, lat]),
          width: major ? 1.6 : 0.7,
          material: cyan.withAlpha(major ? 0.32 : 0.13),
          clampToGround: true,
        },
      });
    }
    ds.entities.resumeEvents();

    updateScale(mpp, S);
  }

  function updateScale(mpp: number, S: number) {
    const px = Math.round(S / mpp);
    el.scaleBarInner.style.width = `${px}px`;
    el.scaleBarLabel.textContent = fmtDist(S);
    const denom = Math.round(mpp / DPI_M_PER_PX);
    el.hudScale.textContent = `GRID ${fmtDist(S)} · 1:${denom.toLocaleString()}`;
  }

  // 이동 중엔 스케일바만 즉시 갱신, 격자는 rAF 로 throttle 하여 rebuild
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      rebuild();
    });
  }

  viewer.camera.percentageChanged = 0.2;
  viewer.camera.changed.addEventListener(schedule);
  scene.camera.moveEnd.addEventListener(rebuild);

  rebuild();
}
