import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Api,
  ScanLogEntry,
  SecurityInfo,
  SessionStats,
  Settings,
  Torrent,
  UpdateInfo,
  UpdateProgress,
} from "@/types";

// Реальный бэкенд: Tauri IPC → Rust (src-tauri)
export function createTauriApi(): Api {
  return {
    isDemo: false,

    async addTorrent(source, scan) {
      await invoke("add_torrent", {
        source,
        scanWhileDownloading: scan,
      });
    },

    async pauseTorrent(id) {
      await invoke("pause_torrent", { id });
    },

    async resumeTorrent(id) {
      await invoke("resume_torrent", { id });
    },

    async removeTorrent(id, deleteFiles) {
      await invoke("remove_torrent", { id, deleteFiles });
    },

    async pauseAll() {
      await invoke("pause_all_torrents");
    },

    async resumeAll() {
      await invoke("resume_all_torrents");
    },

    async getAutostart(): Promise<boolean> {
      return invoke<boolean>("get_autostart");
    },

    async setAutostart(enabled) {
      await invoke("set_autostart", { enabled });
    },

    async getSecurityInfo(): Promise<SecurityInfo> {
      return invoke<SecurityInfo>("get_security_info");
    },

    async getTorrents(): Promise<Torrent[]> {
      return invoke<Torrent[]>("list_torrents");
    },

    async getStats(): Promise<SessionStats> {
      return invoke<SessionStats>("session_stats");
    },

    async getScanLog(): Promise<ScanLogEntry[]> {
      return invoke<ScanLogEntry[]>("get_scan_log");
    },

    async getSettings(): Promise<Settings> {
      return invoke<Settings>("get_settings");
    },

    async saveSettings(s: Settings) {
      await invoke("save_settings", { settings: s });
    },

    async openFolder(id) {
      await invoke("open_folder", { id });
    },

    async quarantineEntry(id) {
      await invoke("quarantine_entry", { id });
    },

    async pickTorrentFile(): Promise<string | null> {
      const picked = await open({
        multiple: false,
        directory: false,
        title: "Выберите .torrent-файл",
        filters: [{ name: "Torrent-файлы", extensions: ["torrent"] }],
      });
      return typeof picked === "string" ? picked : null;
    },

    async checkUpdate(): Promise<UpdateInfo> {
      return invoke<UpdateInfo>("check_updates");
    },

    async downloadUpdate(url, name) {
      return invoke<string>("download_update", { url, name });
    },

    async installUpdate(path, kind) {
      await invoke("install_update", { path, kind });
    },

    onUpdateProgress(cb) {
      const p = listen<UpdateProgress>("update://progress", (e) => cb(e.payload));
      return () => {
        p.then((u) => u()).catch(() => {});
      };
    },

    onEvent(cb) {
      const unsubs: Promise<UnlistenFn>[] = [
        listen<ScanLogEntry>("scan://completed", (e) => {
          cb({
            kind:
              e.payload.verdict === "malicious"
                ? "threat_found"
                : "scan_completed",
            entry: e.payload,
          });
        }),
      ];
      return () => {
        unsubs.forEach((p) => p.then((u) => u()).catch(() => {}));
      };
    },

    dispose() {
      // для Tauri-режима очистка не требуется
    },
  };
}
