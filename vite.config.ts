import { defineConfig } from "vite";

/** Relative base so `index.html` can load from `file://` when opened by Electron. */
export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
