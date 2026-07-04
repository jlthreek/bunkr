import { defineConfig, loadEnv, type PluginOption } from "vite";
import cesium from "vite-plugin-cesium";
import { createLlmHandler } from "./server/llm";

// LLM 프록시 플러그인 — /api/llm/chat 을 서버측(Node) Anthropic 호출로 연결.
// ANTHROPIC_API_KEY(=VITE_ 접두사 없음)는 dev/preview 서버 프로세스에만 존재하며
// 번들·클라이언트로 노출되지 않는다.
function llmProxy(apiKey: string | undefined): PluginOption {
  const wire = (server: { middlewares: { use: Function } }) => {
    const handler = createLlmHandler(apiKey);
    server.middlewares.use("/api/llm/chat", (req: any, res: any, next: any) => {
      Promise.resolve(handler(req, res)).catch(next);
    });
  };
  return {
    name: "aegis-llm-proxy",
    configureServer: wire,
    configurePreviewServer: wire,
  };
}

export default defineConfig(({ mode }) => {
  // '' prefix → VITE_ 접두사 없는 서버 전용 변수까지 로드.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [cesium(), llmProxy(env.ANTHROPIC_API_KEY)],
    server: {
      host: true,
      port: 5174,
    },
  };
});
