// AEGIS 의사결정 지원(AI) 패널 — 지휘관 자유 질의 ↔ COP 기반 스트리밍 응답.
// 매 질의 시 buildSnapshot 으로 현재 통합상황도를 사용자 메시지에 주입하고,
// /api/llm/chat(서버 프록시 → Haiku)로 SSE 스트리밍한다.
import { buildSnapshot, type CopState } from "./context";
import { tr, applyStaticTranslations, onLangChange } from "../i18n";

type Msg = { role: "user" | "assistant"; content: string };

// 지휘관에게 보이는 질의는 순수 질문만, 서버로 보내는 사용자 메시지는
// <현재_COP_상황> 스냅샷 + 질문. 히스토리는 사용자에게 보인 텍스트로 유지하되,
// 서버 전송 시 최신 스냅샷을 매번 최신 질의에만 주입한다.
function withSnapshot(question: string, snapshot: string): string {
  return `<현재_COP_상황>\n${snapshot}\n</현재_COP_상황>\n\n${question}`;
}

// 경량 마크다운 → HTML (굵게 · 불릿 · 헤더 · 줄바꿈). 외부 의존성 없음.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function renderMarkdown(md: string): string {
  const lines = esc(md).split("\n");
  const out: string[] = [];
  let inList = false;
  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+?)`/g, "<code>$1</code>");
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•]\s+(.*)$/);
    const header = line.match(/^\s*#{1,4}\s+(.*)$/);
    if (bullet) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (header) { out.push(`<h4>${inline(header[1])}</h4>`); continue; }
    if (line === "") { out.push("<br/>"); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

export interface DsoPanel {
  destroy(): void;
}

// getState: 질의 시점의 라이브 COP 상태를 반환하는 콜백(main.ts 제공).
export function setupDsoPanel(getState: () => CopState): DsoPanel {
  const history: Msg[] = [];
  let streaming = false;

  // ── DOM 구성 ──
  const root = document.createElement("div");
  root.id = "dso";
  root.className = "collapsed";
  root.innerHTML = `
    <button id="dso-launch" data-i18n-title="dso.launch.title" title="AI 결심지원 열기">
      <span class="dso-star">✦</span>
      <span class="dso-launch-txt" data-i18n="dso.launch.txt">결심지원 AI</span>
    </button>
    <div id="dso-panel" role="dialog" aria-label="AI 결심지원">
      <header class="dso-head">
        <span class="dso-badge">DSO</span>
        <div class="dso-title">
          <div class="dso-name"><span data-i18n="dso.name">결심지원</span> <b>AI</b><span class="dso-beta">BETA</span></div>
          <div class="dso-sub">DECISION SUPPORT · Haiku</div>
        </div>
        <button id="dso-min" data-i18n-title="dso.min.title" title="접기">—</button>
      </header>
      <div class="dso-log" id="dso-log"></div>
      <div class="dso-chips" id="dso-chips">
        <button data-q="현 상황을 브리핑해줘." data-i18n="dso.chip.brief">상황 브리핑</button>
        <button data-q="지금 가장 위협적인 트랙과 그 이유는?" data-i18n="dso.chip.threat">최우선 위협</button>
        <button data-q="현재 표적들에 대한 대응 옵션을 부수피해까지 고려해 권고해줘." data-i18n="dso.chip.roe">대응 권고</button>
      </div>
      <form class="dso-input" id="dso-form">
        <textarea id="dso-text" rows="1" data-i18n-placeholder="dso.placeholder" placeholder="지휘관 질의…  (예: TRK-003 요격?)"></textarea>
        <button type="submit" id="dso-send" data-i18n-title="dso.send.title" title="전송">➤</button>
      </form>
    </div>`;
  document.body.appendChild(root);
  applyStaticTranslations(root); // 초기 렌더를 현재 언어로 정렬

  const logEl = root.querySelector<HTMLElement>("#dso-log")!;
  const textEl = root.querySelector<HTMLTextAreaElement>("#dso-text")!;
  const formEl = root.querySelector<HTMLFormElement>("#dso-form")!;
  const sendBtn = root.querySelector<HTMLButtonElement>("#dso-send")!;

  // 초기 어시스턴트 인사(히스토리에는 넣지 않음 — 컨텍스트 절약)
  appendBubble("assistant", tr("dso.greeting"));

  // 언어 전환: 정적 라벨은 applyStaticTranslations 가 자동 갱신하고,
  // 대화 시작 전(히스토리 없음)이면 인사말 버블만 현재 언어로 다시 그린다.
  onLangChange(() => {
    if (history.length === 0) {
      logEl.innerHTML = "";
      appendBubble("assistant", tr("dso.greeting"));
    }
  });

  function scrollDown() {
    logEl.scrollTop = logEl.scrollHeight;
  }

  // 말풍선 추가 → 콘텐츠 갱신용 엘리먼트 반환
  function appendBubble(role: "user" | "assistant", text: string): HTMLElement {
    const row = document.createElement("div");
    row.className = `dso-msg ${role}`;
    const body = document.createElement("div");
    body.className = "dso-bubble";
    if (role === "assistant") body.innerHTML = renderMarkdown(text);
    else body.textContent = text;
    row.appendChild(body);
    logEl.appendChild(row);
    scrollDown();
    return body;
  }

  function setBusy(b: boolean) {
    streaming = b;
    sendBtn.disabled = b;
    textEl.disabled = b;
    root.classList.toggle("busy", b);
  }

  async function ask(question: string) {
    if (streaming || !question.trim()) return;
    const q = question.trim();
    appendBubble("user", q);

    // 최신 COP 스냅샷을 최신 질의에만 주입.
    let snapshot = "";
    try {
      snapshot = buildSnapshot(getState());
    } catch (e) {
      snapshot = "(COP 스냅샷 생성 실패)";
    }
    const wire: Msg[] = [
      ...history,
      { role: "user", content: withSnapshot(q, snapshot) },
    ];
    // 화면 히스토리는 순수 질문으로 유지
    history.push({ role: "user", content: q });

    const bubble = appendBubble("assistant", "");
    bubble.classList.add("streaming");
    bubble.innerHTML = '<span class="dso-cursor">▍</span>';
    setBusy(true);

    let acc = "";
    try {
      const res = await fetch("/api/llm/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: wire }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // SSE 프레임 분해
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const f of frames) {
          const line = f.replace(/^data:\s?/, "").trim();
          if (!line || line === "[DONE]") continue;
          let j: { text?: string; error?: string };
          try {
            j = JSON.parse(line);
          } catch {
            continue; // 비 JSON 프레임(heartbeat 등) 무시
          }
          if (j.error) throw new Error(j.error);
          if (j.text) {
            acc += j.text;
            bubble.innerHTML =
              renderMarkdown(acc) + '<span class="dso-cursor">▍</span>';
            scrollDown();
          }
        }
      }
      if (!acc.trim()) throw new Error("응답 없음");
      bubble.innerHTML = renderMarkdown(acc);
      history.push({ role: "assistant", content: acc });
    } catch (e: any) {
      bubble.classList.add("error");
      bubble.innerHTML = renderMarkdown(
        `⚠ 응답 실패: ${esc(e?.message ?? String(e))}`
      );
      // 실패한 질의는 히스토리에서 제거(다음 턴 오염 방지)
      if (history[history.length - 1]?.role === "user") history.pop();
    } finally {
      bubble.classList.remove("streaming");
      setBusy(false);
      scrollDown();
    }
  }

  // ── 이벤트 ──
  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = textEl.value;
    textEl.value = "";
    textEl.style.height = "auto";
    ask(q);
  });
  textEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });
  textEl.addEventListener("input", () => {
    textEl.style.height = "auto";
    textEl.style.height = Math.min(textEl.scrollHeight, 120) + "px";
  });
  root.querySelector("#dso-chips")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-q]");
    if (b) ask(b.dataset.q!);
  });

  // 열기/접기
  const open = () => root.classList.remove("collapsed");
  const close = () => root.classList.add("collapsed");
  root.querySelector("#dso-launch")!.addEventListener("click", () => {
    open();
    textEl.focus();
  });
  root.querySelector("#dso-min")!.addEventListener("click", close);

  return {
    destroy() {
      root.remove();
    },
  };
}
