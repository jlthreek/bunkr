// LLM 프록시 (서버측) — Vite dev/preview 미들웨어에서 실행.
// Anthropic Haiku 를 서버에서 호출해 SSE 로 스트리밍한다. API 키는 이 프로세스
// (Node)에만 존재하며 클라이언트로 노출되지 않는다. 브라우저는 /api/llm/chat 만 호출.
import Anthropic from "@anthropic-ai/sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import { SYSTEM_PROMPT } from "../src/llm/prompt";

// 사용자 지정: Anthropic Claude Haiku 4.5. (Haiku 는 effort/adaptive thinking
// 파라미터를 지원하지 않으므로 표준 스트리밍만 사용한다.)
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;

type ChatMessage = { role: "user" | "assistant"; content: string };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error("payload too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// apiKey 부재 시에도 미들웨어는 설치하되, 요청 시 안내 에러를 반환한다.
export function createLlmHandler(apiKey: string | undefined) {
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end("method not allowed");
    }
    // SSE 헤더
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    if (!client) {
      send({
        error:
          "ANTHROPIC_API_KEY 미설정 — .env 에 키를 넣고 dev 서버를 재시작하세요.",
      });
      return res.end();
    }

    try {
      const raw = await readBody(req);
      const { messages } = JSON.parse(raw) as { messages: ChatMessage[] };
      if (!Array.isArray(messages) || !messages.length) {
        send({ error: "빈 요청" });
        return res.end();
      }

      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      stream.on("text", (delta) => send({ text: delta }));
      await stream.finalMessage();
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (e: any) {
      // 스트림 시작 후라도 클라이언트가 에러를 표시하도록 SSE 로 전달.
      send({ error: e?.message ? String(e.message) : String(e) });
      res.end();
    }
  };
}
