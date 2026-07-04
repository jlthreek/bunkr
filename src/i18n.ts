// ── 다국어(i18n) 지원: 한국어 / 영어 ──────────────────────────
// 기본 언어는 브라우저 시스템 언어 기준(navigator.language)이며,
// 사용자가 토글 버튼으로 전환하면 localStorage 에 저장해 유지한다.
export type Lang = "ko" | "en";

const STORAGE_KEY = "bunkr:lang";

function detectSystemLang(): Lang {
  const nav =
    (typeof navigator !== "undefined" &&
      (navigator.language || (navigator as any).userLanguage)) ||
    "en";
  return nav.toLowerCase().startsWith("ko") ? "ko" : "en";
}

function loadInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch {
    /* localStorage 접근 불가 (프라이빗 모드 등) → 시스템 언어로 폴백 */
  }
  return detectSystemLang();
}

let currentLang: Lang = loadInitialLang();

type Listener = (lang: Lang) => void;
const listeners = new Set<Listener>();

export function getLang(): Lang {
  return currentLang;
}

export function onLangChange(fn: Listener): void {
  listeners.add(fn);
}

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* noop */
  }
  document.documentElement.lang = lang;
  applyStaticTranslations();
  listeners.forEach((fn) => fn(lang));
}

// 이름을 tr() 로 둔 이유: 코드베이스 전반에서 Track 변수명으로 `t`(예: `t: Track`)를
// 관용적으로 쓰고 있어, 번역 함수를 t()로 노출하면 거의 모든 호출부에서 이름이 충돌한다.
export function tr(key: string, vars?: Record<string, string | number>): string {
  const dict = DICT[currentLang] ?? DICT.en;
  let str = dict[key] ?? DICT.en[key] ?? DICT.ko[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

// data-i18n[-title|-placeholder] 속성이 붙은 정적 마크업을 현재 언어로 갱신
export function applyStaticTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = tr(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    el.title = tr(el.dataset.i18nTitle!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-placeholder]").forEach((el) => {
    (el as HTMLInputElement).placeholder = tr(el.dataset.i18nPlaceholder!);
  });
}

export function initI18n(): void {
  document.documentElement.lang = currentLang;
  applyStaticTranslations();
}

const DICT: Record<Lang, Record<string, string>> = {
  ko: {
    // ── 상단 바 ──
    "mode.deploy.sub": "설계",
    "mode.operate.sub": "작전",
    "roe.label": "교전규칙",
    "roe.help.title": "교전규칙 설명",
    "roe.popover.title": "교전규칙 (ROE)",
    "roe.popover.p1": "AUTO는 조건 충족 시 시스템이 하드킬 교전을 자동 승인합니다.",
    "roe.popover.p2": "MANUAL은 하드킬 직전 교전 승인 큐에서 지휘관 승인을 기다립니다.",
    "roe.popover.p3": "소프트킬/재밍은 두 모드 모두 자동 대응합니다.",
    "loc.capsule.title": "작전지역 · Area of Operation",
    "loc.select.title": "작전지역 (Area of Operation)",
    "lang.toggle.title": "언어 전환 · Switch language",

    // ── 경보 스트립 ──
    "alert.hostile": "미해결 적대 트랙 {count} · {id} T {t} · RNG {rng}KM",

    // ── 좌측 레일 · 레이어 ──
    "layers.title": "레이어",
    "layers.zones": "우선구역",
    "layers.sites": "설치후보지",
    "layers.ao": "작전영역(AO)",
    "layers.drones": "위협체",
    "legend.protected": "보호구역",
    "legend.sensitive": "민감구역",
    "legend.sites": "센서/대응 배치 후보지",

    // ── 좌측 레일 · 위협 생성 ──
    "spawn.title": "위협 생성",
    "spawn.hint": "유형 선택 후 지도 클릭 → 생성",
    "spawn.hint.active": "{label} 생성 중 — 지도 클릭 (Esc 취소)",
    "spawn.drone.name": "드론",
    "spawn.drone.sub": "목표지향",
    "spawn.balloon.name": "풍선",
    "spawn.balloon.sub": "표류",
    "spawn.bird.name": "조류",
    "spawn.bird.sub": "표류",
    "spawn.pause": "⏸ 일시정지",
    "spawn.resume": "▶ 재생",
    "spawn.clear": "전체 제거",
    "spawn.advanced": "고급",
    "spawn.trails": "궤적",
    "spawn.altcompress": "고도압축",
    "sim.run": "● RUN",
    "sim.pause": "● PAUSE",

    // ── 우측 레일 ──
    "plan.panel.title": "센서·대응 배치 플랜",
    "plan.help.title":
      "배치 흐름: 설계(DEPLOY)에서 센서·대응 장비를 배치·최적화 → 플랜으로 저장 → 작전(OPERATE)에서 불러와 사용. 장비를 배치하지 않으면 위협을 탐지할 수 없습니다. (클릭: 자세히)",
    "plan.hint":
      "설계(DEPLOY)에서 센서·대응 장비를 배치·최적화해 플랜으로 저장하면, 여기서 불러와 작전에 사용합니다. 장비를 배치하지 않으면 위협을 탐지할 수 없습니다.",
    "plan.select.empty": "— 가져오지 못했습니다 (수동 배치 사용) —",
    "plan.goto": "＋ 설계에서 새 플랜 만들기",
    "cc.radar.title": "RADAR · 능동 탐지 (RCS/위치)",
    "cc.scanner.title": "스캐너 · 수동 탐지 (RF·EO/IR)",
    "cc.jammer.title": "소프트킬 · RF 재밍 (0.45km)",
    "cc.counter.title": "하드킬 · 물리 요격 (0.25km)",
    "cc.radar.label": "레이더",
    "cc.scanner.label": "스캐너",
    "cc.jammer.label": "소프트킬",
    "cc.counter.label": "하드킬",
    "auth.title": "교전 승인 큐",
    "auth.empty": "대기 중인 교전 없음",
    "auth.engage": "교전",
    "auth.hold": "보류",
    "threat.intensity": "위협 강도 (60s)",

    // ── 하단 스트립 ──
    "bottom.deploy.title": "배치 워크스페이스",
    "bottom.operate.title": "작전 콘솔",
    "bottom.collapse.title": "하단 패널 접기/펼치기",
    "bs.resize.title": "드래그해 폭 조절 (더블클릭: 기본값)",
    "bs.resize.v.title": "드래그해 높이 조절 (더블클릭: 기본값)",
    "place.panel.title": "센서·대응 장비 배치",
    "place.auto": "자동",
    "place.manual": "수동",
    "place.auto.hint": "최적화 엔진이 예산·제약 안에서 장비를 자동 배치합니다.",
    "optim.run": "최적 배치 실행",
    "optim.result.default": "최적배치 실행 → 보호커버·부수피해·비용 최적화",
    "optim.result.running": "최적 배치 계산 중…",
    "optim.result.failed": "최적화 실패 (콘솔 확인)",
    "asset.hint": "유형 선택 후 지도 클릭 → 배치",
    "asset.hint.active": "{label} 배치 중 — 지도 클릭 (Esc 취소)",
    "asset.radar.name": "레이더",
    "asset.radar.sub": "능동탐지",
    "asset.scanner.name": "스캐너",
    "asset.scanner.sub": "RF·EO/IR",
    "asset.jammer.name": "소프트킬",
    "asset.jammer.sub": "RF 재밍",
    "asset.counter.name": "하드킬",
    "asset.counter.sub": "물리 요격",
    "eff.jammer": "소프트킬 무장",
    "eff.counter": "하드킬 무장",
    "asset.deployed.title": "배치 장비",
    "asset.clear": "전체 삭제",
    "asset.empty": "배치된 장비 없음",
    "asset.row.title": "지도에서 위치 보기",
    "plan.library.title": "배치 플랜 저장소",
    "plan.name.placeholder": "플랜 이름 (예: 광화문 표준망)",
    "plan.save": "저장",
    "plan.empty": "저장된 플랜 없음",
    "plan.apply": "적용",
    "plan.untitled": "무제 플랜",
    "coverage.title": "배치 커버리지",
    "kpi.cover": "보호커버",
    "kpi.collat": "부수피해",
    "kpi.cost": "비용",
    "kpi.total": "종합점수",
    "track.title": "실시간 트랙",
    "track.th.id": "ID",
    "track.th.class": "분류",
    "track.th.spd": "SPD",
    "track.th.alt": "ALT",
    "track.th.t": "T",
    "track.th.response": "대응",
    "track.th.threat": "THREAT",
    "track.empty": "NO TRACKS IN WINDOW",
    "eventlog.title": "이벤트 로그",
    "eventlog.empty": "NO EVENTS",

    // ── 맵 크롬 ──
    "map.zoomin.title": "확대",
    "map.zoomout.title": "축소",
    "map.compass.title": "정북 정렬 · AO 재정렬",

    // ── 센서 미배치 안내 오버레이 ──
    "setup.title": "탐지 장비가 배치되지 않았습니다",
    "setup.msg":
      "배치된 센서(레이더·스캐너)가 없어 위협을 탐지할 수 없습니다. 설계(DEPLOY)에서 센서·대응 장비를 배치·최적화하거나, 저장된 플랜을 불러오세요.",
    "setup.dismiss": "그대로 진행",
    "setup.goto": "설계로 이동 →",

    // ── 교전 승인 모달 ──
    "engage.target": "대상",
    "engage.class": "분류",
    "engage.threat": "위협도",
    "engage.method": "방식",
    "engage.collat": "부수피해",
    "engage.approver": "승인자",
    "engage.abort": "Abort",
    "engage.confirm": "Confirm engage",

    // ── 동적 로그/상태 텍스트 ──
    "log.roe": "교전규칙 → {mode}",
    "log.detect": "{cls} 확인 · RNG {rng}KM",
    "log.engage.hard": "HARD-KILL 교전",
    "log.engage.soft": "RF JAM 교전",
    "log.authreq": "하드킬 승인 요청 · T {t}",
    "log.authorize": "교전 승인 (OPS-07)",
    "log.deny": "교전 보류 (OPS-07)",
    "log.plan.save": "플랜 저장 ({count}기)",
    "log.plan.load": "플랜 로드: {name}",
    "log.optim.result": "최적배치 {count}기 산출",
    "kill.hard": "하드",
    "kill.soft": "소프트",
    "kill.watch": "감시",
    "asset.name.placeholder": "먼저 장비를 배치하세요",
    "units.count": "{n}기",
    "optim.result.summary":
      "배치 <b>{count}</b>기 ({mix}) · {ms}ms<br>보호커버 <b>{cover}%</b> · 부수피해 <b>{collat}</b> · 비용 <b>{cost}k</b> · 종합 <b>{total}</b>",
    "optim.badge.cover": "보호커버 {cover}%",
    "optim.badge.collat": "부수피해 {collat}",
    "optim.badge.assets": "장비 {n}기",

    // ── 도메인 라벨 (위험도/구역) ──
    "risk.label": "위험도",
    "zone.protected": "보호구역",
    "zone.approach": "접근회랑",
    "zone.sensitive": "민감구역",
    "zone.field.zone_id": "구역 ID",
    "zone.field.zone_type": "구역 분류",
    "zone.field.weight": "위험 가중치",
    "zone.field.asset": "보호 자산",
    "zone.field.value": "중요도",
    "zone.field.poi": "POI 코드",
    "zone.field.population_max": "최대 인구",
    "zone.field.congest_lvl": "혼잡도",
    "zone.field.resnt_rate": "거주 비율",
    "zone.field.ppltn_time": "집계 시각",
    "zone.field.source": "출처",
    "area.field.area_id": "작전영역 ID",
    "area.field.name": "작전영역 이름",
    "area.field.name_en": "영문 이름",
    "area.field.center": "중심 좌표",
    "area.field.radius": "반경",
    "area.field.pop_density": "인구밀도",
    "info.default.zone": "우선구역",
    "info.default.ao": "작전영역",
    "info.zone.class": "구역 분류",
    "info.congest": "혼잡 상태",
    "info.congest.none": "정보 없음",
    "info.popmax": "최대 인구",
    "info.data.status": "데이터 상태",
    "info.ao.score": "범위",
    "info.ao.class": "분류",
    "info.ao.show": "표시 상태",
    "info.ao.show.active": "활성",
    "info.baseloc": "기준 위치",
    "asset.role.radar": "능동 탐지 (RADAR · RCS/위치)",
    "asset.role.scanner": "수동 탐지 (RF·EO/IR)",
    "asset.role.jammer": "소프트킬 (RF 차단)",
    "asset.role.counter": "하드킬 (교전)",
    // 트랙 분류 (TrackType 도메인 값은 한국어 리터럴 — 표시만 번역)
    "pred.드론": "드론",
    "pred.풍선": "풍선",
    "pred.새/기타": "새/기타",
    "pred.미상": "미상",
    "pop.count": "{n}명",
  },
  en: {
    "mode.deploy.sub": "Design",
    "mode.operate.sub": "Operate",
    "roe.label": "ROE",
    "roe.help.title": "ROE explanation",
    "roe.popover.title": "Rules of Engagement (ROE)",
    "roe.popover.p1":
      "In AUTO, the system automatically approves hard-kill engagements once conditions are met.",
    "roe.popover.p2":
      "In MANUAL, hard-kill requests wait for commander approval in the engagement queue.",
    "roe.popover.p3": "Soft-kill/jamming always responds automatically in both modes.",
    "loc.capsule.title": "Area of Operation",
    "loc.select.title": "Area of Operation",
    "lang.toggle.title": "Switch language · 언어 전환",

    "alert.hostile": "{count} unresolved hostile track(s) · {id} T {t} · RNG {rng}KM",

    "layers.title": "Layers",
    "layers.zones": "Priority Zones",
    "layers.sites": "Candidate Sites",
    "layers.ao": "Area of Operation (AO)",
    "layers.drones": "Threats",
    "legend.protected": "Protected zone",
    "legend.sensitive": "Sensitive zone",
    "legend.sites": "Sensor/response candidate site",

    "spawn.title": "Threat Spawner",
    "spawn.hint": "Select a type, then click the map → spawn",
    "spawn.hint.active": "Spawning {label} — click the map (Esc to cancel)",
    "spawn.drone.name": "Drone",
    "spawn.drone.sub": "Target-seeking",
    "spawn.balloon.name": "Balloon",
    "spawn.balloon.sub": "Drifting",
    "spawn.bird.name": "Bird",
    "spawn.bird.sub": "Drifting",
    "spawn.pause": "⏸ Pause",
    "spawn.resume": "▶ Resume",
    "spawn.clear": "Clear All",
    "spawn.advanced": "Advanced",
    "spawn.trails": "Trails",
    "spawn.altcompress": "Altitude Compression",
    "sim.run": "● RUN",
    "sim.pause": "● PAUSE",

    "plan.panel.title": "Sensor/Response Deployment Plan",
    "plan.help.title":
      "Deployment flow: place & optimize sensor/response equipment in Design (DEPLOY) → save as a plan → load it in Operate (OPERATE). Threats can't be detected without deployed equipment. (Click for details)",
    "plan.hint":
      "Place and optimize sensor/response equipment in Design (DEPLOY) and save it as a plan, then load it here for use in Operate. Threats can't be detected without deployed equipment.",
    "plan.select.empty": "— Could not load (using manual placement) —",
    "plan.goto": "＋ Create a new plan in Design",
    "cc.radar.title": "RADAR · active detection (RCS/position)",
    "cc.scanner.title": "Scanner · passive detection (RF·EO/IR)",
    "cc.jammer.title": "Soft-kill · RF jamming (0.45km)",
    "cc.counter.title": "Hard-kill · physical intercept (0.25km)",
    "cc.radar.label": "Radar",
    "cc.scanner.label": "Scanner",
    "cc.jammer.label": "Soft-kill",
    "cc.counter.label": "Hard-kill",
    "auth.title": "Engagement Approval Queue",
    "auth.empty": "No pending engagements",
    "auth.engage": "Engage",
    "auth.hold": "Hold",
    "threat.intensity": "Threat Intensity (60s)",

    "bottom.deploy.title": "Deployment Workspace",
    "bottom.operate.title": "Operations Console",
    "bottom.collapse.title": "Collapse/expand bottom panel",
    "bs.resize.title": "Drag to resize (double-click to reset)",
    "bs.resize.v.title": "Drag to adjust height (double-click to reset)",
    "place.panel.title": "Sensor/Response Equipment Placement",
    "place.auto": "Auto",
    "place.manual": "Manual",
    "place.auto.hint":
      "The optimization engine auto-places equipment within budget/constraints.",
    "optim.run": "Run Optimal Placement",
    "optim.result.default": "Run optimization → optimize coverage · collateral · cost",
    "optim.result.running": "Computing optimal placement…",
    "optim.result.failed": "Optimization failed (check console)",
    "asset.hint": "Select a type, then click the map → place",
    "asset.hint.active": "Placing {label} — click the map (Esc to cancel)",
    "asset.radar.name": "Radar",
    "asset.radar.sub": "Active detection",
    "asset.scanner.name": "Scanner",
    "asset.scanner.sub": "RF·EO/IR",
    "asset.jammer.name": "Soft-kill",
    "asset.jammer.sub": "RF jamming",
    "asset.counter.name": "Hard-kill",
    "asset.counter.sub": "Physical intercept",
    "eff.jammer": "Soft-kill armed",
    "eff.counter": "Hard-kill armed",
    "asset.deployed.title": "Deployed Equipment",
    "asset.clear": "Clear All",
    "asset.empty": "No equipment deployed",
    "asset.row.title": "View location on map",
    "plan.library.title": "Deployment Plan Library",
    "plan.name.placeholder": "Plan name (e.g. Gwanghwamun Standard Net)",
    "plan.save": "Save",
    "plan.empty": "No saved plans",
    "plan.apply": "Apply",
    "plan.untitled": "Untitled plan",
    "coverage.title": "Deployment Coverage",
    "kpi.cover": "Coverage",
    "kpi.collat": "Collateral",
    "kpi.cost": "Cost",
    "kpi.total": "Total Score",
    "track.title": "Live Tracks",
    "track.th.id": "ID",
    "track.th.class": "Class",
    "track.th.spd": "SPD",
    "track.th.alt": "ALT",
    "track.th.t": "T",
    "track.th.response": "Response",
    "track.th.threat": "THREAT",
    "track.empty": "NO TRACKS IN WINDOW",
    "eventlog.title": "Event Log",
    "eventlog.empty": "NO EVENTS",

    "map.zoomin.title": "Zoom in",
    "map.zoomout.title": "Zoom out",
    "map.compass.title": "Align north · recenter AO",

    "setup.title": "No detection equipment deployed",
    "setup.msg":
      "No sensors (radar/scanner) are deployed, so threats can't be detected. Place and optimize sensor/response equipment in Design (DEPLOY), or load a saved plan.",
    "setup.dismiss": "Proceed anyway",
    "setup.goto": "Go to Design →",

    "engage.target": "Target",
    "engage.class": "Class",
    "engage.threat": "Threat level",
    "engage.method": "Method",
    "engage.collat": "Collateral",
    "engage.approver": "Approver",
    "engage.abort": "Abort",
    "engage.confirm": "Confirm engage",

    "log.roe": "ROE → {mode}",
    "log.detect": "{cls} confirmed · RNG {rng}KM",
    "log.engage.hard": "HARD-KILL engagement",
    "log.engage.soft": "RF JAM engagement",
    "log.authreq": "Hard-kill approval requested · T {t}",
    "log.authorize": "Engagement approved (OPS-07)",
    "log.deny": "Engagement held (OPS-07)",
    "log.plan.save": "Plan saved ({count} units)",
    "log.plan.load": "Plan loaded: {name}",
    "log.optim.result": "Optimal placement computed ({count} units)",
    "kill.hard": "HARD",
    "kill.soft": "SOFT",
    "kill.watch": "WATCH",
    "asset.name.placeholder": "Place equipment first",
    "units.count": "{n} units",
    "optim.result.summary":
      "Placed <b>{count}</b> units ({mix}) · {ms}ms<br>Coverage <b>{cover}%</b> · Collateral <b>{collat}</b> · Cost <b>{cost}k</b> · Total <b>{total}</b>",
    "optim.badge.cover": "Coverage {cover}%",
    "optim.badge.collat": "Collateral {collat}",
    "optim.badge.assets": "{n} units",

    "risk.label": "RISK",
    "zone.protected": "Protected zone",
    "zone.approach": "Approach corridor",
    "zone.sensitive": "Sensitive zone",
    "zone.field.zone_id": "Zone ID",
    "zone.field.zone_type": "Zone type",
    "zone.field.weight": "Risk weight",
    "zone.field.asset": "Protected asset",
    "zone.field.value": "Importance",
    "zone.field.poi": "POI code",
    "zone.field.population_max": "Max population",
    "zone.field.congest_lvl": "Congestion level",
    "zone.field.resnt_rate": "Resident ratio",
    "zone.field.ppltn_time": "Census time",
    "zone.field.source": "Source",
    "area.field.area_id": "AO ID",
    "area.field.name": "AO name",
    "area.field.name_en": "English name",
    "area.field.center": "Center coordinates",
    "area.field.radius": "Radius",
    "area.field.pop_density": "Population density",
    "info.default.zone": "Priority zone",
    "info.default.ao": "Area of Operation",
    "info.zone.class": "Zone type",
    "info.congest": "Congestion",
    "info.congest.none": "No data",
    "info.popmax": "Max population",
    "info.data.status": "Data status",
    "info.ao.score": "Extent",
    "info.ao.class": "Class",
    "info.ao.show": "Display status",
    "info.ao.show.active": "Active",
    "info.baseloc": "Base location",
    "asset.role.radar": "Active detection (RADAR · RCS/position)",
    "asset.role.scanner": "Passive detection (RF·EO/IR)",
    "asset.role.jammer": "Soft-kill (RF denial)",
    "asset.role.counter": "Hard-kill (engagement)",
    "pred.드론": "Drone",
    "pred.풍선": "Balloon",
    "pred.새/기타": "Bird/Other",
    "pred.미상": "Unknown",
    "pop.count": "{n}",
  },
};
