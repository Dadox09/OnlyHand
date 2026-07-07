import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev` — plain HTTP on localhost (no cert warning).
// `npm run dev:https` — self-signed HTTPS + --host, only for phones that
// block getUserMedia on http:// LAN origins.
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "https" ? [basicSsl()] : [],
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          mediapipe: ["@mediapipe/tasks-vision"],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
}));
