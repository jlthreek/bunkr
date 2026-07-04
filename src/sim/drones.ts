import {
  Viewer,
  Entity,
  Cartesian3,
  Cartographic,
  Color,
  CallbackProperty,
  CallbackPositionProperty,
  ColorMaterialProperty,
  LabelStyle,
  VerticalOrigin,
  HorizontalOrigin,
  Cartesian2,
  HeightReference,
  PolylineGlowMaterialProperty,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Math as CesiumMath,
} from "cesium";
import { iconFor, type DroneType } from "./icons";
import { RNG } from "../cuas/rng";
import { makeFrame, toKm, toLonLat, type Frame } from "../cuas/frame";
import { sampleProfile, type Kind, type TrackProfile } from "../cuas/profiles";
import { planPath, advanceAlongPath, type Pt, type Obstacle } from "../cuas/pathfinding";
import { makeObservation, type Observation } from "../cuas/observation";
import { judge, type Judgement } from "../cuas/pipeline";
import { RESPONSES, type Asset, type Response, type TrackType } from "../cuas/engine";

// ── cuas 엔진 기반 위협 시뮬레이션 ─────────────────────────────
// 트랙은 실제 제원(profiles)으로 생성 → 목표(자산)로 궤적 이동 → 매 스텝 관측 후
// pipeline.judge 로 분류·위협도·대응을 산출한다. 좌표는 local km(frame) ↔ WGS84.

// 킬체인 연동: 레이더·스캐너=탐지, 재머/대응=교전 (assets.ts AssetLayer 가 구현)
export interface SensorProvider {
  covers(kind: "radar" | "scanner" | "jammer" | "counter", lon: number, lat: number): boolean;
  isKindActive(kind: "radar" | "scanner" | "jammer" | "counter"): boolean;
}

const DESPAWN_R = 7.0; // 이탈 판정 반경(km)
const OBS_INTERVAL = 0.5; // 관측·판단 주기(s)
const TRAIL_INTERVAL = 0.4;
const HIST_CAP = 20;
const GROUND_INTERVAL = 0.5; // 지형고도 샘플 주기(s)

// 색상 캐시 — 매 프레임 Color.fromCssColorString 파싱 방지
const COL = {
  undet: Color.fromCssColorString("#8a949c"),
  soft: Color.fromCssColorString("#b06bff"),
  hard: Color.fromCssColorString("#ff8c42"),
  balloon: Color.fromCssColorString("#5eb0ff"),
  bird: Color.fromCssColorString("#9aa4ad"),
  low: Color.fromCssColorString("#37d67a"),
  med: Color.fromCssColorString("#f5a623"),
  high: Color.fromCssColorString("#ff3b46"),
};

let SEQ = 0;

// ── 고고도 뷰포트 최적화 ───────────────────────────────────────
// 실제 고도(altM)는 판단/라벨에 그대로 쓰되, 렌더 높이만 압축해 20km 풍선도
// 도심 카메라 한 화면에 담는다. 800m 이하(도심 드론)는 1:1, 이상은 로그 압축.
let altCompress = true;
const ALT_KNEE = 800;
function renderAlt(altM: number): number {
  if (!altCompress || altM <= ALT_KNEE) return altM;
  return ALT_KNEE + 700 * Math.log10(1 + (altM - ALT_KNEE) / 800);
}

export class Track {
  id: string;
  kind: Kind;
  prof: TrackProfile;
  km: Pt; // 현재 위치 (local km)
  private prevKm: Pt;
  altM: number;
  heading = 0; // rad, 0=N 시계방향
  windDir: Pt;
  waypoints: Pt[] | null; // 드론만 (목표지향)
  private wpIdx = 0;
  dead = false;
  private dwell = 0;
  private life = 0;
  private obsAcc = 0;
  private trailAcc = 0;
  private simT = 0;
  private hist: Observation[] = [];
  jud: Judgement | null = null;
  detected = false; // 스캐너로 확인됨 (latch)
  engaged: "soft" | "hard" | null = null; // 재머/대응에 의한 무력화
  private engTimer = 0;
  history: Cartesian3[] = [];
  lon = 0;
  lat = 0;
  groundH = 0;
  groundAcc = 1; // 지형고도 샘플 스로틀(첫 프레임 즉시 샘플)
  labelText = ""; // 라벨 캐시(상태 변화 시에만 갱신)
  entities: Entity[] = [];

  constructor(
    kind: Kind,
    startKm: Pt, // 스폰 지점(사용자 지정)
    private frame: Frame,
    private assets: Asset[],
    private rng: RNG,
    private popDensity: number,
    private sensors: SensorProvider | null,
    private obstacles: Obstacle[] | null
  ) {
    this.kind = kind;
    this.prof = sampleProfile(rng, kind);
    this.id = `TRK-${(++SEQ).toString().padStart(3, "0")}`;
    this.altM = this.prof.alt;

    this.km = [startKm[0], startKm[1]];
    this.prevKm = [this.km[0], this.km[1]];

    if (kind === "drone" && assets.length) {
      const tgt = pickWeightedAsset(assets, rng); // 고가치 목표에 가중
      const goal: Pt = [tgt.x, tgt.y];
      // 높이 인지 회피: 순항고도(prof.alt)보다 높은 건물만 우회, 낮은 건물은 상공 통과
      this.waypoints = planPath(this.km, goal, this.obstacles, this.prof.alt);
      const dx = goal[0] - this.km[0];
      const dy = goal[1] - this.km[1];
      const n = Math.hypot(dx, dy) || 1;
      this.windDir = [dx / n, dy / n];
    } else {
      // 풍선·조류: 바람 표류
      const wx = rng.uniform(-1, 1);
      const wy = rng.uniform(-1, 1);
      const n = Math.hypot(wx, wy) || 1;
      this.windDir = [wx / n, wy / n];
      this.waypoints = null;
    }
    this.syncLonLat();
    this.updateLabel();
  }

  private syncLonLat() {
    const ll = toLonLat(this.frame, this.km[0], this.km[1]);
    this.lon = ll.lon;
    this.lat = ll.lat;
  }

  updateLabel() {
    this.labelText = trackLabel(this);
  }

  step(dt: number) {
    this.life += dt;
    const budget = (this.prof.speed * dt) / 1000.0; // km

    if (this.waypoints) {
      const [np, wp] = advanceAlongPath(this.km, this.waypoints, this.wpIdx, budget);
      this.km = np;
      this.wpIdx = wp;
      // 목표 도달 판정
      const last = this.waypoints[this.waypoints.length - 1];
      if (Math.hypot(last[0] - this.km[0], last[1] - this.km[1]) < 0.03) {
        this.dwell += dt;
        if (this.dwell > 8) this.dead = true;
      }
    } else {
      this.km = [this.km[0] + this.windDir[0] * budget, this.km[1] + this.windDir[1] * budget];
      if (Math.hypot(this.km[0], this.km[1]) > DESPAWN_R) this.dead = true;
    }
    if (this.life > 180) this.dead = true;

    // heading (실제 이동 방향)
    const dx = this.km[0] - this.prevKm[0];
    const dy = this.km[1] - this.prevKm[1];
    if (Math.hypot(dx, dy) > 1e-6) this.heading = Math.atan2(dx, dy); // 0=N(+y), 시계방향
    this.prevKm = [this.km[0], this.km[1]];
    this.syncLonLat();

    // 관측 + 판단 (throttle)
    this.obsAcc += dt;
    this.simT += dt;
    if (this.obsAcc >= OBS_INTERVAL) {
      this.obsAcc = 0;
      this.hist.push(makeObservation(this.rng, this.simT, this.km, this.prof));
      if (this.hist.length > HIST_CAP) this.hist.shift();
      const j = judge(this.assets, this.hist, this.windDir, {
        popDensity: this.popDensity,
      });
      if (j.confirmed) {
        this.jud = j;
        if (this.detected) this.updateLabel(); // 확인된 트랙만 라벨 갱신
      }
    }

    // 킬체인: 레이더·스캐너 융합 커버리지 진입 시 확인(latch) → 활성 재머/대응 커버리지 시 교전
    if (this.sensors && !this.engaged) {
      if (
        !this.detected &&
        (this.sensors.covers("radar", this.lon, this.lat) ||
          this.sensors.covers("scanner", this.lon, this.lat))
      ) {
        this.detected = true;
        this.updateLabel();
      }
      if (this.detected) {
        if (
          this.sensors.covers("counter", this.lon, this.lat) &&
          (this.pred === "드론" || this.pred === "풍선")
        ) {
          this.engaged = "hard";
          this.engTimer = 1.6;
          this.updateLabel();
        } else if (this.sensors.covers("jammer", this.lon, this.lat) && this.pred === "드론") {
          this.engaged = "soft";
          this.engTimer = 1.6;
          this.updateLabel();
        }
      }
    }
    if (this.engaged) {
      this.engTimer -= dt;
      if (this.engTimer <= 0) this.dead = true; // 무력화 완료 → 제거
    }

    // 트레일
    this.trailAcc += dt;
    if (this.trailAcc > TRAIL_INTERVAL) {
      this.trailAcc = 0;
      this.history.push(this.cart());
      if (this.history.length > 60) this.history.shift();
    }
  }

  // ── 판단 결과 접근자 ──
  get pred(): TrackType {
    return this.jud?.ttype ?? "미상";
  }
  get T(): number {
    return this.jud?.T ?? 0;
  }
  get response(): Response {
    return this.jud?.response ?? RESPONSES["감시"];
  }
  get speed(): number {
    return this.jud?.speed ?? this.prof.speed;
  }
  get dAsset(): number {
    return this.jud?.d ?? 0;
  }
  get subtype(): string {
    return this.prof.subtype;
  }

  cart() {
    return Cartesian3.fromDegrees(this.lon, this.lat, renderAlt(this.altM));
  }
  iconType(): DroneType {
    if (!this.detected) return "unknown"; // 미확인 → 물음표 박스
    if (this.kind === "balloon") return "balloon";
    if (this.kind === "bird") return "bird";
    return this.prof.subtype === "고정익" ? "fixedwing" : "quad";
  }
  color(): Color {
    if (!this.detected) return COL.undet; // 미확인 = 그레이
    if (this.engaged === "soft") return COL.soft; // 재밍
    if (this.engaged === "hard") return COL.hard; // 하드킬
    const p = this.pred;
    if (p === "풍선" || (p === "미상" && this.kind === "balloon")) return COL.balloon;
    if (p === "새/기타" || (p === "미상" && this.kind === "bird")) return COL.bird;
    const t = this.T;
    if (t < 45) return COL.low;
    if (t < 70) return COL.med;
    return COL.high;
  }
  threatBar(): string {
    const n = Math.round(Math.max(0, Math.min(100, this.T)) / 20);
    return "■".repeat(n) + "□".repeat(5 - n);
  }
}

// ── 렌더링: 트랙당 엔티티 세트 ────────────────────────────────
const M_PER_DEG_LAT = 111320;

function buildEntities(viewer: Viewer, t: Track) {
  const posCb = new CallbackPositionProperty(() => t.cart(), false);

  const icon = viewer.entities.add({
    position: posCb,
    billboard: {
      image: new CallbackProperty(() => iconFor(t.iconType()), false) as any,
      width: 34,
      height: 34,
      color: new CallbackProperty(() => t.color(), false) as any,
      rotation: new CallbackProperty(() => -t.heading, false) as any,
      alignedAxis: Cartesian3.ZERO,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new NearFarScalar(500, 1.1, 12000, 0.5),
    },
    label: {
      text: new CallbackProperty(() => t.labelText, false) as any,
      font: "600 11px 'IBM Plex Mono', monospace",
      fillColor: new CallbackProperty(() => t.color(), false) as any,
      style: LabelStyle.FILL_AND_OUTLINE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(20, -8),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#060e14").withAlpha(0.72),
      backgroundPadding: new Cartesian2(6, 4),
      translucencyByDistance: new NearFarScalar(6000, 1.0, 16000, 0.0),
    },
  });

  const leader = viewer.entities.add({
    polyline: {
      positions: new CallbackProperty(() => {
        const ahead = Math.max(60, t.speed * 4);
        const lat2 = t.lat + (Math.cos(t.heading) * ahead) / M_PER_DEG_LAT;
        const lon2 =
          t.lon +
          (Math.sin(t.heading) * ahead) /
            (M_PER_DEG_LAT * Math.cos((t.lat * Math.PI) / 180));
        return [t.cart(), Cartesian3.fromDegrees(lon2, lat2, renderAlt(t.altM))];
      }, false),
      width: 1.6,
      material: new ColorMaterialProperty(
        new CallbackProperty(() => t.color().withAlpha(0.9), false)
      ),
      arcType: 0 as any,
    },
  });

  const trail = viewer.entities.add({
    polyline: {
      positions: new CallbackProperty(() => t.history, false),
      width: 3,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.25,
        taperPower: 0.5,
        color: new CallbackProperty(() => t.color(), false) as any,
      }),
    },
  });

  const drop = viewer.entities.add({
    polyline: {
      positions: new CallbackProperty(
        () => [t.cart(), Cartesian3.fromDegrees(t.lon, t.lat, t.groundH)],
        false
      ),
      width: 1,
      material: new ColorMaterialProperty(
        new CallbackProperty(() => t.color().withAlpha(0.24), false)
      ),
    },
  });

  const ground = viewer.entities.add({
    position: new CallbackPositionProperty(
      () => Cartesian3.fromDegrees(t.lon, t.lat, t.groundH),
      false
    ),
    point: {
      pixelSize: 4,
      color: new CallbackProperty(() => t.color().withAlpha(0.5), false) as any,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  t.entities = [icon, leader, trail, drop, ground];
}

function fmtAlt(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m.toFixed(0)}m`;
}

// 라벨: 미확인은 정보 없이 "?", 교전 중은 상태, 확인되면 전체 텔레메트리
function trackLabel(t: Track): string {
  if (!t.detected) return `${t.id}\n? UNKNOWN`;
  if (t.engaged === "soft") return `${t.id} · ${t.pred}\nJAMMED (soft-kill)`;
  if (t.engaged === "hard") return `${t.id} · ${t.pred}\nNEUTRALIZED (hard-kill)`;
  return (
    `${t.id} · ${t.pred}(${t.subtype})\n` +
    `SPD ${t.speed.toFixed(0)}m/s  ALT ${fmtAlt(t.altM)}\n` +
    `T ${t.T.toFixed(0)}  ${t.response.label}\n` +
    `THREAT ${t.threatBar()}`
  );
}

// ── 자산 로드 (protected·approach 구역 중심 → km) ──────────────
async function loadAssets(locId: string, frame: Frame): Promise<Asset[]> {
  try {
    const fc = await fetch(`data/${locId}/priority_zones.geojson`).then((r) => r.json());
    const assets: Asset[] = [];
    for (const f of fc.features) {
      if ((f.properties?.weight ?? 0) <= 0) continue; // 보호/접근만 자산
      const [lon, lat] = centroid(f.geometry);
      const { x, y } = toKm(frame, lon, lat);
      assets.push({
        name: f.properties.name ?? f.properties.zone_id,
        x,
        y,
        r: 0.3,
        weight: f.properties.weight,
      });
    }
    if (assets.length) return assets;
  } catch (e) {
    console.warn("[sim] 자산 로드 실패, 중심 폴백:", e);
  }
  return [{ name: "center", x: 0, y: 0, r: 0.3 }];
}

function centroid(geom: any): [number, number] {
  const rings: number[][][] =
    geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  let sx = 0, sy = 0, n = 0;
  for (const ring of rings)
    for (const [x, y] of ring) {
      sx += x;
      sy += y;
      n++;
    }
  return [sx / n, sy / n];
}

// 자산 가치(weight) 비례 목표 선택 — 고가치 목표일수록 자주 표적이 됨
function pickWeightedAsset(assets: Asset[], rng: RNG): Asset {
  const total = assets.reduce((s, a) => s + Math.max(0.1, a.weight ?? 1), 0);
  let r = rng.random() * total;
  for (const a of assets) {
    r -= Math.max(0.1, a.weight ?? 1);
    if (r <= 0) return a;
  }
  return assets[assets.length - 1];
}

// ── 건물 장애물 로드 (footprint → km 폴리곤 + height_m) ─────────
async function loadObstacles(locId: string, frame: Frame): Promise<Obstacle[]> {
  try {
    const fc = await fetch(`data/${locId}/buildings.geojson`).then((r) => r.json());
    const obs: Obstacle[] = [];
    for (const f of fc.features) {
      if (f.properties?.is_obstacle === false) continue;
      const ring = f.geometry?.coordinates?.[0];
      if (!ring || ring.length < 3) continue;
      const poly: Pt[] = ring.map(([lon, lat]: [number, number]) => {
        const { x, y } = toKm(frame, lon, lat);
        return [x, y] as Pt;
      });
      const h = f.properties?.height_m;
      obs.push(typeof h === "number" ? { polygon: poly, height: h } : poly);
    }
    return obs;
  } catch (e) {
    console.warn("[sim] 건물 장애물 로드 실패, 직선 폴백:", e);
    return [];
  }
}

// ── 컨트롤러 (수동 스폰 — 자동 생성 없음) ──────────────────────
export interface DroneSim {
  pause(): void;
  resume(): void;
  toggle(): boolean;
  running(): boolean;
  setSpawnMode(kind: Kind | null): void; // 지도 클릭 스폰 모드
  getSpawnMode(): Kind | null;
  spawnAt(kind: Kind, lon: number, lat: number): Track; // 지정 위치에 직접 스폰
  clearTracks(): void;
  setTrailsVisible(v: boolean): void;
  setVisible(v: boolean): void;
  setAltCompress(v: boolean): void;
  getTracks(): Track[];
  getAssets(): Asset[];
  getFrame(): Frame;
  destroy(): void;
}

export interface DroneSimOptions {
  locId: string;
  center: { lon: number; lat: number };
  radiusM: number;
  popDensity?: number;
  seed?: number;
  sensors?: SensorProvider; // 스캐너 탐지 + 재머/대응 교전 연동
}

export async function startDroneSim(
  viewer: Viewer,
  opts: DroneSimOptions
): Promise<DroneSim> {
  const frame = makeFrame(opts.center.lon, opts.center.lat);
  const rng = new RNG(opts.seed ?? 42);
  const [assets, obstacles] = await Promise.all([
    loadAssets(opts.locId, frame),
    loadObstacles(opts.locId, frame),
  ]);
  const popDensity = opts.popDensity ?? 0.5;

  const tracks: Track[] = [];
  let running = true;
  let visible = true;
  let lastMs: number | undefined;
  let spawnMode: Kind | null = null;

  function spawnAt(kind: Kind, lon: number, lat: number): Track {
    const { x, y } = toKm(frame, lon, lat);
    const t = new Track(
      kind,
      [x, y],
      frame,
      assets,
      rng,
      popDensity,
      opts.sensors ?? null,
      obstacles
    );
    buildEntities(viewer, t);
    for (const e of t.entities) e.show = visible;
    tracks.push(t);
    return t;
  }
  function removeTrack(t: Track) {
    for (const e of t.entities) viewer.entities.remove(e);
  }

  // 스텝 진행 + 죽은 트랙 제거 (자동 재생성 없음)
  const onTick = () => {
    const nowMs = performance.now();
    if (lastMs === undefined) lastMs = nowMs;
    let dt = (nowMs - lastMs) / 1000;
    lastMs = nowMs;
    if (!running) return;
    dt = Math.max(0, Math.min(dt, 0.1));

    for (let i = tracks.length - 1; i >= 0; i--) {
      const t = tracks[i];
      t.step(dt);
      // 지형고도 샘플은 스로틀(매 프레임 → ~2Hz)
      t.groundAcc += dt;
      if (t.groundAcc >= GROUND_INTERVAL) {
        t.groundAcc = 0;
        const h = viewer.scene.globe.getHeight(
          viewer.scene.globe.ellipsoid.cartesianToCartographic(t.cart())
        );
        if (h != null) t.groundH = h;
      }
      if (t.dead) {
        removeTrack(t);
        tracks.splice(i, 1);
      }
    }
  };
  viewer.scene.preUpdate.addEventListener(onTick as any);

  // 지도 클릭 → 스폰 (스폰 모드일 때만)
  const clickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  clickHandler.setInputAction((e: { position: Cartesian2 }) => {
    if (!spawnMode) return;
    const cart =
      viewer.scene.pickPosition(e.position) ?? pickGlobe(viewer, e.position);
    if (!cart) return;
    const c = Cartographic.fromCartesian(cart);
    spawnAt(spawnMode, CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude));
  }, ScreenSpaceEventType.LEFT_CLICK);

  return {
    pause() {
      running = false;
    },
    resume() {
      running = true;
      lastMs = undefined;
    },
    toggle() {
      running = !running;
      if (running) lastMs = undefined;
      return running;
    },
    running: () => running,
    setSpawnMode(kind) {
      spawnMode = kind;
      viewer.scene.canvas.style.cursor = kind ? "crosshair" : "";
    },
    getSpawnMode: () => spawnMode,
    spawnAt,
    clearTracks() {
      for (const t of tracks) removeTrack(t);
      tracks.length = 0;
    },
    setTrailsVisible(v) {
      for (const t of tracks) (t.entities[2].polyline as any).show = v;
    },
    setVisible(v) {
      visible = v;
      for (const t of tracks) for (const e of t.entities) e.show = v;
    },
    setAltCompress(v) {
      altCompress = v;
    },
    getTracks: () => tracks,
    getAssets: () => assets,
    getFrame: () => frame,
    destroy() {
      viewer.scene.preUpdate.removeEventListener(onTick as any);
      clickHandler.destroy();
      viewer.scene.canvas.style.cursor = "";
      for (const t of tracks) removeTrack(t);
      tracks.length = 0;
    },
  };
}

function pickGlobe(viewer: Viewer, pos: Cartesian2): Cartesian3 | undefined {
  const ray = viewer.camera.getPickRay(pos);
  if (!ray) return undefined;
  return viewer.scene.globe.pick(ray, viewer.scene);
}
