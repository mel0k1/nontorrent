import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Версия из package.json — доступна в клиентском коде как __APP_VERSION__
const pkgVersion: string = JSON.parse(
  readFileSync(path.join(here, "package.json"), "utf8"),
).version;

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
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
