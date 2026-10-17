import type { Api } from "@/types";
import { createMockApi } from "./mock";
import { createTauriApi } from "./tauri";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let instance: Api | null = null;

// В браузере (превью) — демо-движок, в окне приложения — реальный бэкенд
export function getApi(): Api {
  if (!instance) {
    instance = isTauri ? createTauriApi() : createMockApi();
  }
  return instance;
}
