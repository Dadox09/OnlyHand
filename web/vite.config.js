import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  base: "./",
  // Self-signed HTTPS in dev: getUserMedia (webcam) is blocked on insecure
  // origins, and phones reach the dev server via LAN IP — not localhost.
  plugins: [basicSsl()],
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
});
