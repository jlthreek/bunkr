import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [cesium()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5174,
  },
});
