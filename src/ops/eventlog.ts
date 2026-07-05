// ── 이벤트 로그 (작전 감사 추적) ───────────────────────────────
// 탐지·분류·교전·승인 이벤트를 Zulu 타임으로 기록한다. 링 버퍼 + 구독 모델.
export type OpsEventType =
  | "detect"
  | "classify"
  | "engage"
  | "authreq"
  | "authorize"
  | "deny"
  | "system";

export type OpsTone = "friendly" | "caution" | "hostile" | "neutral";

export interface OpsEvent {
  t: number; // epoch ms
  type: OpsEventType;
  trackId?: string;
  msg: string;
  tone?: OpsTone;
}

const CAP = 200;
const events: OpsEvent[] = [];
const subs: Array<() => void> = [];

export function logEvent(e: Omit<OpsEvent, "t">): void {
  events.push({ ...e, t: Date.now() });
  if (events.length > CAP) events.shift();
  for (const cb of subs) cb();
}

export function getEvents(): OpsEvent[] {
  return events;
}

export function clearEvents(): void {
  events.length = 0;
  for (const cb of subs) cb();
}

export function onLog(cb: () => void): void {
  subs.push(cb);
}

// UTC(Zulu) 시:분:초
export function zulu(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19) + "Z";
}

const TYPE_LABEL: Record<OpsEventType, string> = {
  detect: "DETECT",
  classify: "CLASS",
  engage: "ENGAGE",
  authreq: "AUTH-REQ",
  authorize: "AUTH-OK",
  deny: "AUTH-NO",
  system: "SYS",
};

// 최신 이벤트가 위로 오도록 렌더 (event-log-line 컴포넌트)
export function renderEventLog(el: HTMLElement): void {
  if (!events.length) {
    el.innerHTML = '<div class="log-empty">NO EVENTS</div>';
    return;
  }
  el.innerHTML = [...events]
    .reverse()
    .map((e) => {
      const tone = e.tone ?? "neutral";
      return (
        `<div class="log-line" data-tone="${tone}">` +
        `<span class="log-time">${zulu(e.t)}</span>` +
        `<span class="log-tag">${TYPE_LABEL[e.type]}</span>` +
        `<span class="log-id">${e.trackId ?? ""}</span>` +
        `<span class="log-msg">${e.msg}</span>` +
        `</div>`
      );
    })
    .join("");
}
