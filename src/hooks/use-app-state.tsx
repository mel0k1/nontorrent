import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { getApi } from "@/services/api";
import type {
  Api,
  ScanLogEntry,
  SessionStats,
  Settings,
  Torrent,
  ViewId,
} from "@/types";

const defaultSettings: Settings = {
  downloadDir: "",
  scanWhileDownloading: true,
  quarantineThreats: true,
  vtApiKey: "",
  useBuiltInVt: true,
  clamdAddress: "",
  maxDownMbps: null,
  maxUpMbps: null,
};

const zeroStats: SessionStats = {
  downBytesPerSec: 0,
  upBytesPerSec: 0,
  dhtNodes: 0,
  torrentCount: 0,
};

interface AppStateValue {
  api: Api;
  torrents: Torrent[];
  stats: SessionStats;
  scanLog: ScanLogEntry[];
  settings: Settings;
  view: ViewId;
  setView: (v: ViewId) => void;
  query: string;
  setQuery: (q: string) => void;
  addTorrent: (source: string, scan: boolean) => Promise<void>;
  pause: (id: number) => Promise<void>;
  resume: (id: number) => Promise<void>;
  remove: (id: number, deleteFiles: boolean) => Promise<void>;
  openFolder: (id: number) => Promise<void>;
  quarantine: (entryId: string) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  refresh: () => Promise<void>;
}

const AppStateCtx = createContext<AppStateValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const api = useMemo(() => getApi(), []);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [stats, setStats] = useState<SessionStats>(zeroStats);
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [view, setView] = useState<ViewId>("downloads");
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [t, s, log] = await Promise.all([
        api.getTorrents(),
        api.getStats(),
        api.getScanLog(),
      ]);
      setTorrents(t);
      setStats(s);
      setScanLog(log);
    } catch (e) {
      console.error("refresh failed", e);
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setSettings(s))
      .catch(() => {});
  }, [api]);

  // авто-проверка обновлений при запуске (только в установленном приложении)
  useEffect(() => {
    if (api.isDemo) return;
    api
      .checkUpdate()
      .then((info) => {
        if (info.updateAvailable) {
          toast.info(`Доступна версия ${info.latestVersion}`, {
            description: "Загрузки → Настройки → Обновления",
          });
        }
      })
      .catch(() => {});
  }, [api]);

  // События сканера: тост об угрозе + мгновенное обновление журнала
  useEffect(() => {
    const off = api.onEvent((e) => {
      if (e.kind === "threat_found") {
        toast.error("Обнаружена угроза", {
          description: e.entry.file,
        });
      }
      refresh();
    });
    return off;
  }, [api, refresh]);

  const actions = useMemo(
    () => ({
      addTorrent: async (source: string, scan: boolean) => {
        try {
          await api.addTorrent(source, scan);
          toast.success("Торрент добавлен", {
            description: scan
              ? "Проверка запустится по мере скачивания"
              : undefined,
          });
          await refresh();
        } catch (err) {
          toast.error("Не удалось добавить торрент", {
            description: String(err),
          });
        }
      },
      pause: async (id: number) => {
        await api.pauseTorrent(id);
        await refresh();
      },
      resume: async (id: number) => {
        await api.resumeTorrent(id);
        await refresh();
      },
      remove: async (id: number, deleteFiles: boolean) => {
        await api.removeTorrent(id, deleteFiles);
        toast.success(deleteFiles ? "Удалено вместе с файлами" : "Раздача удалена");
        await refresh();
      },
      openFolder: async (id: number) => {
        try {
          await api.openFolder(id);
        } catch {
          toast.error("Не удалось открыть папку");
        }
      },
      quarantine: async (entryId: string) => {
        await api.quarantineEntry(entryId);
        toast.success("Файл отправлен в карантин");
        await refresh();
      },
      saveSettings: async (s: Settings) => {
        try {
          await api.saveSettings(s);
          setSettings(s);
          toast.success("Настройки сохранены");
        } catch (err) {
          toast.error("Не удалось сохранить настройки", {
            description: String(err),
          });
        }
      },
    }),
    [api, refresh]
  );

  const value: AppStateValue = {
    api,
    torrents,
    stats,
    scanLog,
    settings,
    view,
    setView,
    query,
    setQuery,
    ...actions,
    refresh,
  };

  return <AppStateCtx.Provider value={value}>{children}</AppStateCtx.Provider>;
}

export function useAppState(): AppStateValue {
  const v = useContext(AppStateCtx);
  if (!v) throw new Error("useAppState должен использоваться внутри AppProvider");
  return v;
}
