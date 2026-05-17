import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
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
