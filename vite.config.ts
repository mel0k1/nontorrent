import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Tauri ожидает фиксированный порт 1420; для браузерного превью порт задаётся флагом --port
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(here, "src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
