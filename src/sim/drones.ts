import {
  Viewer,
  Entity,
  Cartesian3,
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
} from "cesium";
import { iconFor, type DroneType } from "./icons";

// ── 위협체 유형 프로파일 ───────────────────────────────────────
interface Profile {
  label: string;
  speed: [number, number]; // 지상속도 m/s
  alt: [number, number]; // 순항고도 m (AGL 근사)
  turnRate: number; // 최대 선회율 rad/s
  climb: number; // 최대 상승/하강률 m/s
  threatBase: number; // 기본 위협도 0..1
  windFactor: number; // 바람 영향 계수
  jitter: number; // 경로 불규칙성 0..1
}
const PROFILES: Record<DroneType, Profile> = {
  quad: {
    label: "QUAD",
    speed: [5, 15],
    alt: [30, 120],
    turnRate: 1.2,
    climb: 4,
    threatBase: 0.55,
    windFactor: 0.15,
    jitter: 0.5,
  },
  fixedwing: {
    label: "FIXED-WING",
    speed: [18, 34],
    alt: [90, 200],
    turnRate: 0.35,
    climb: 5,
    threatBase: 0.7,
    windFactor: 0.1,
    jitter: 0.15,
  },
  balloon: {
    label: "BALLOON",
    speed: [1, 4],
    alt: [150, 400],
    turnRate: 0.08,
    climb: 0.6,
    threatBase: 0.3,
    windFactor: 1.0, // 바람에 표류
    jitter: 0.1,
  },
  bird: {
    label: "BIRD (clutter)",
    speed: [6, 13],
    alt: [20, 80],
    turnRate: 1.6,
    climb: 3,
    threatBase: 0.03,
    windFactor: 0.2,
    jitter: 0.9,
  },
};

// 스폰 유형 가중치 (섞어쏘기 느낌: 드론 위주 + 소수 풍선/조류)
const SPAWN_WEIGHTS: [DroneType, number][] = [
  ["quad", 0.42],
  ["fixedwing", 0.28],
  ["balloon", 0.14],
  ["bird", 0.16],
];

type State = "ingress" | "loiter" | "egress";

const M_PER_DEG_LAT = 111320;
let SEQ = 0;

interface AO {
  center: { lon: number; lat: number };
  radiusM: number;
}

class Track {
  id: string;
  type: DroneType;
  p: Profile;
  lon: number;
  lat: number;
  altM: number;
  heading: number; // rad, 0=N, 시계방향
  speed: number; // m/s (현재)
  cruiseAlt: number;
  cruiseSpeed: number;
  threat: number;
  state: State = "ingress";
  stateTimer: number; // 남은 상태 시간(s)
  wp: { lon: number; lat: number }; // 현재 웨이포인트
  dead = false;
  history: Cartesian3[] = [];
  private trailAccum = 0;
  groundH = 0;
  entities: Entity[] = [];

  constructor(type: DroneType, private ao: AO, private wind: { dir: number; speed: number }) {
    this.type = type;
    this.p = PROFILES[type];
    this.id = `TRK-${(++SEQ).toString().padStart(3, "0")}`;
    // 경계에서 진입
    const theta = Math.random() * Math.PI * 2;
    const [c, r] = [ao.center, ao.radiusM];
    this.lat = c.lat + (Math.cos(theta) * r) / M_PER_DEG_LAT;
    this.lon =
      c.lon +
      (Math.sin(theta) * r) / (M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180));
    this.heading = theta + Math.PI + (Math.random() - 0.5) * 0.6; // 안쪽으로
    this.cruiseAlt = rand(this.p.alt);
    this.cruiseSpeed = rand(this.p.speed);
    this.altM = this.cruiseAlt * (0.6 + Math.random() * 0.4);
    this.speed = this.cruiseSpeed;
    this.threat = this.p.threatBase;
    this.stateTimer = 20 + Math.random() * 40;
    this.wp = this.pickInnerWaypoint();
  }

  private pickInnerWaypoint() {
    const { center: c, radiusM: r } = this.ao;
    const rr = r * 0.85 * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    return {
      lat: c.lat + (Math.cos(a) * rr) / M_PER_DEG_LAT,
      lon:
        c.lon +
        (Math.sin(a) * rr) / (M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180)),
    };
  }
  private pickEgressWaypoint() {
    const { center: c, radiusM: r } = this.ao;
    // 중심→현재 위치의 바깥 방위각을 따라 경계 너머로 이탈
    const dN = (this.lat - c.lat) * M_PER_DEG_LAT;
    const dE = (this.lon - c.lon) * M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180);
    const a = Math.atan2(dE, dN) + rand([-0.4, 0.4]);
    return {
      lat: c.lat + (Math.cos(a) * r * 1.3) / M_PER_DEG_LAT,
      lon:
        c.lon +
        (Math.sin(a) * r * 1.3) / (M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180)),
    };
  }

  distToCenterM() {
    const c = this.ao.center;
    const dN = (this.lat - c.lat) * M_PER_DEG_LAT;
    const dE =
      (this.lon - c.lon) * M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180);
    return Math.hypot(dN, dE);
  }

  step(dt: number) {
    const p = this.p;

    // 목표 방위각
    const dN = (this.wp.lat - this.lat) * M_PER_DEG_LAT;
    const dE =
      (this.wp.lon - this.lon) * M_PER_DEG_LAT * Math.cos((this.lat * Math.PI) / 180);
    let desired = Math.atan2(dE, dN);

    // 풍선은 바람 방향을 주 진행으로
    if (this.type === "balloon") desired = this.wind.dir;

    // 불규칙성(jitter): 목표 방위각에 노이즈
    desired += (Math.random() - 0.5) * p.jitter * 0.5;

    // 선회율 제한으로 heading 접근
    let diff = wrapPi(desired - this.heading);
    const maxTurn = p.turnRate * dt;
    diff = clamp(diff, -maxTurn, maxTurn);
    this.heading = wrapPi(this.heading + diff);

    // 속도 완만 변화
    this.speed += clamp(this.cruiseSpeed - this.speed, -2 * dt, 2 * dt);
    if (this.type === "balloon") this.speed = this.wind.speed * (0.8 + Math.random() * 0.4);

    // 전진(+바람 표류)
    const dist = this.speed * dt;
    let moveN = Math.cos(this.heading) * dist;
    let moveE = Math.sin(this.heading) * dist;
    moveN += Math.cos(this.wind.dir) * this.wind.speed * p.windFactor * dt;
    moveE += Math.sin(this.wind.dir) * this.wind.speed * p.windFactor * dt;
    this.lat += moveN / M_PER_DEG_LAT;
    this.lon += moveE / (M_PER_DEG_LAT * Math.cos((this.lat * Math.PI) / 180));

    // 고도: 순항고도로 수렴(약간의 흔들림)
    const altErr = this.cruiseAlt + Math.sin(performance.now() / 3000 + SEQ) * 6 - this.altM;
    this.altM += clamp(altErr, -p.climb * dt, p.climb * dt);

    // 웨이포인트 도달 판정
    const dWp = Math.hypot(dN, dE);
    if (dWp < 40) this.wp = this.state === "egress" ? this.pickEgressWaypoint() : this.pickInnerWaypoint();

    // 상태 머신
    this.stateTimer -= dt;
    const distC = this.distToCenterM();
    if (this.state === "ingress" && distC < this.ao.radiusM * 0.7) {
      this.state = "loiter";
      this.stateTimer = 25 + Math.random() * 45;
    } else if (this.state === "loiter" && this.stateTimer <= 0) {
      this.state = "egress";
      this.wp = this.pickEgressWaypoint();
    } else if (this.state === "egress" && distC > this.ao.radiusM * 1.15) {
      this.dead = true;
    }

    // 위협도: 코어 접근 시 상승(조류는 낮게 유지)
    const prox = clamp(1 - distC / this.ao.radiusM, 0, 1);
    const target =
      this.type === "bird"
        ? this.p.threatBase
        : clamp(this.p.threatBase + prox * 0.4, 0, 1);
    this.threat += clamp(target - this.threat, -0.3 * dt, 0.3 * dt);

    // 트레일 샘플링(0.3s 간격, 최대 60)
    this.trailAccum += dt;
    if (this.trailAccum > 0.3) {
      this.trailAccum = 0;
      this.history.push(this.cart());
      if (this.history.length > 60) this.history.shift();
    }
  }

  cart() {
    return Cartesian3.fromDegrees(this.lon, this.lat, this.altM);
  }
  color() {
    // 위협도 → 초록→황→적, 조류/풍선 별도 톤
    if (this.type === "bird") return Color.fromCssColorString("#9aa4ad");
    if (this.type === "balloon") return Color.fromCssColorString("#5eb0ff");
    const t = this.threat;
    if (t < 0.4) return Color.fromCssColorString("#37d67a");
    if (t < 0.7) return Color.fromCssColorString("#f5a623");
    return Color.fromCssColorString("#ff3b46");
  }
  threatBar() {
    const n = Math.round(clamp(this.threat, 0, 1) * 5);
    return "■".repeat(n) + "□".repeat(5 - n);
  }
}

// ── 렌더링: 트랙당 엔티티 세트 생성 ────────────────────────────
function buildEntities(viewer: Viewer, t: Track) {
  const posCb = new CallbackPositionProperty(() => t.cart(), false);

  // 1) 유형 아이콘(방위각 회전) + 코어 점
  const icon = viewer.entities.add({
    position: posCb,
    billboard: {
      image: iconFor(t.type),
      width: 34,
      height: 34,
      color: new CallbackProperty(() => t.color(), false) as any,
      rotation: new CallbackProperty(() => -t.heading, false) as any,
      alignedAxis: Cartesian3.ZERO,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new NearFarScalar(500, 1.1, 8000, 0.5),
    },
    label: {
      text: new CallbackProperty(
        () =>
          `${t.id} · ${t.p.label}\n` +
          `SPD ${t.speed.toFixed(0)}m/s  ALT ${t.altM.toFixed(0)}m\n` +
          `HDG ${((t.heading * 180) / Math.PI + 360) % 360 | 0}°  ${t.state.toUpperCase()}\n` +
          `THREAT ${t.threatBar()}`,
        false
      ) as any,
      font: "600 11px 'SF Mono', monospace",
      fillColor: new CallbackProperty(() => t.color(), false) as any,
      style: LabelStyle.FILL_AND_OUTLINE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(20, -8),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      showBackground: true,
      backgroundColor: Color.fromCssColorString("#060e14").withAlpha(0.7),
      backgroundPadding: new Cartesian2(6, 4),
      translucencyByDistance: new NearFarScalar(3000, 1.0, 9000, 0.0),
    },
  });

  // 2) 속도 리더선(진행방향으로 4초 앞)
  const leader = viewer.entities.add({
    polyline: {
      positions: new CallbackProperty(() => {
        const ahead = Math.max(60, t.speed * 4);
        const lat2 = t.lat + (Math.cos(t.heading) * ahead) / M_PER_DEG_LAT;
        const lon2 =
          t.lon +
          (Math.sin(t.heading) * ahead) /
            (M_PER_DEG_LAT * Math.cos((t.lat * Math.PI) / 180));
        return [t.cart(), Cartesian3.fromDegrees(lon2, lat2, t.altM)];
      }, false),
      width: 1.6,
      material: new ColorMaterialProperty(
        new CallbackProperty(() => t.color().withAlpha(0.9), false)
      ),
      arcType: 0 as any,
    },
  });

  // 3) 궤적 트레일(글로우)
  const trailColor = new CallbackProperty(() => t.color(), false);
  const trail = viewer.entities.add({
    polyline: {
      positions: new CallbackProperty(() => t.history, false),
      width: 3,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.25,
        taperPower: 0.5,
        color: trailColor as any,
      }),
    },
  });

  // 4) 지면 드롭선(3D 위치 판독용)
  const drop = viewer.entities.add({
    polyline: {
      positions: new CallbackProperty(
        () => [
          t.cart(),
          Cartesian3.fromDegrees(t.lon, t.lat, t.groundH),
        ],
        false
      ),
      width: 1,
      material: new ColorMaterialProperty(
        new CallbackProperty(() => t.color().withAlpha(0.28), false)
      ),
    },
  });

  // 5) 지면 접지점 링
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

// ── 컨트롤러 ──────────────────────────────────────────────────
export interface DroneSim {
  pause(): void;
  resume(): void;
  toggle(): boolean; // returns running
  running(): boolean;
  spawnBurst(n?: number): void;
  setTargetCount(n: number): void;
  setTrailsVisible(v: boolean): void;
  setVisible(v: boolean): void;
  getTracks(): Track[];
  destroy(): void;
}

export interface DroneSimOptions {
  targetCount?: number;
}

export function startDroneSim(
  viewer: Viewer,
  ao: AO,
  opts: DroneSimOptions = {}
): DroneSim {
  const wind = {
    dir: Math.random() * Math.PI * 2,
    speed: 2 + Math.random() * 4,
  };
  const tracks: Track[] = [];
  let targetCount = opts.targetCount ?? 7;
  let running = true;
  let visible = true;
  let lastMs: number | undefined;

  function spawn(type?: DroneType) {
    const t = new Track(type ?? weightedType(), ao, wind);
    buildEntities(viewer, t);
    for (const e of t.entities) e.show = visible;
    tracks.push(t);
    return t;
  }

  function removeTrack(t: Track) {
    for (const e of t.entities) viewer.entities.remove(e);
  }

  for (let i = 0; i < targetCount; i++) spawn();

  const onTick = () => {
    const nowMs = performance.now();
    if (lastMs === undefined) lastMs = nowMs;
    let dt = (nowMs - lastMs) / 1000;
    lastMs = nowMs;
    if (!running) return;
    dt = clamp(dt, 0, 0.1); // 프레임 스파이크 방지

    for (let i = tracks.length - 1; i >= 0; i--) {
      const t = tracks[i];
      t.step(dt);
      // 접지 고도 샘플(간헐적으로 충분하지만 매 프레임도 저렴)
      const h = viewer.scene.globe.getHeight(
        viewer.scene.globe.ellipsoid.cartesianToCartographic(t.cart())
      );
      if (h != null) t.groundH = h;
      if (t.dead) {
        removeTrack(t);
        tracks.splice(i, 1);
      }
    }
    // 목표 수 유지
    while (tracks.length < targetCount) spawn();
  };
  viewer.scene.preUpdate.addEventListener(onTick as any);

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
    spawnBurst(n = 5) {
      for (let i = 0; i < n; i++) spawn();
      targetCount = Math.max(targetCount, tracks.length);
    },
    setTargetCount(n) {
      targetCount = Math.max(0, n);
      while (tracks.length > targetCount) {
        const t = tracks.pop()!;
        removeTrack(t);
      }
    },
    setTrailsVisible(v) {
      for (const t of tracks) (t.entities[2].polyline as any).show = v;
    },
    setVisible(v) {
      visible = v;
      for (const t of tracks) for (const e of t.entities) e.show = v;
    },
    getTracks: () => tracks,
    destroy() {
      viewer.scene.preUpdate.removeEventListener(onTick as any);
      for (const t of tracks) removeTrack(t);
      tracks.length = 0;
    },
  };
}

// ── 유틸 ──────────────────────────────────────────────────────
function rand([a, b]: [number, number]) {
  return a + Math.random() * (b - a);
}
function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
function wrapPi(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function weightedType(): DroneType {
  const r = Math.random();
  let acc = 0;
  for (const [t, w] of SPAWN_WEIGHTS) {
    acc += w;
    if (r <= acc) return t;
  }
  return "quad";
}

export type { Track };
