import type {
  Api,
  AppEvent,
  ScanLogEntry,
  SessionStats,
  Settings,
  Torrent,
} from "@/types";

/*
  Демо-движок: интерфейс живёт без Tauri — в браузерном превью.
  Имитирует сессию librqbit и поток событий сканера.
*/

interface MockTorrent extends Torrent {
  baseDown: number;
  baseUp: number;
  threatAtProgress?: number;
  threatPushed?: boolean;
}

class Emitter {
  private subs = new Set<(e: AppEvent) => void>();
  emit(e: AppEvent) {
    this.subs.forEach((s) => s(e));
  }
  on(cb: (e: AppEvent) => void) {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  }
}

function hex(len: number): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function jitter(base: number, spread: number): number {
  return Math.max(0, Math.round(base + (Math.random() - 0.5) * spread));
}

const DL_DIR = "/home/user/Downloads";

function mk(id: number, p: Omit<Partial<MockTorrent>, "id"> & { name: string; sizeBytes: number }): MockTorrent {
  return {
    infoHash: hex(40),
    downloadedBytes: 0,
    uploadedBytes: 0,
    downSpeed: 0,
    upSpeed: 0,
    peers: 0,
    seeds: 0,
    status: "downloading",
    progress: 0,
    etaSeconds: null,
    outputPath: DL_DIR,
    addedAt: Date.now() - 3600_000,
    scan: null,
    baseDown: 0,
    baseUp: 0,
    ...p,
    id,
  } as MockTorrent;
}

function seedTorrents(): MockTorrent[] {
  return [
    mk(1, {
      name: "ubuntu-24.04.3-desktop-amd64.iso",
      sizeBytes: 5_171_828_736,
      downloadedBytes: 3_175_492_096,
      progress: 61.4,
      status: "downloading",
      peers: 38,
      seeds: 124,
      baseDown: 5_800_000,
      baseUp: 320_000,
      addedAt: Date.now() - 2_400_000,
      scan: { verdict: "pending", threatsFound: 0, scannedFiles: 12, totalFiles: 18, lastScanAt: Date.now() - 30_000 },
    }),
    mk(2, {
      name: "Big.Buck.Bunny.2008.2160p.Remux.mkv",
      sizeBytes: 14_140_000_000,
      downloadedBytes: 14_140_000_000,
      progress: 100,
      status: "seeding",
      peers: 12,
      seeds: 0,
      baseDown: 0,
      baseUp: 900_000,
      addedAt: Date.now() - 86_400_000,
      scan: { verdict: "clean", threatsFound: 0, scannedFiles: 1, totalFiles: 1, lastScanAt: Date.now() - 43_200_000 },
    }),
    mk(3, {
      name: "Adobe_Photoshop_2026_Activator.exe",
      sizeBytes: 884_000_000,
      downloadedBytes: 326_000_000,
      progress: 36.9,
      status: "downloading",
      peers: 3,
      seeds: 1,
      baseDown: 700_000,
      baseUp: 0,
      addedAt: Date.now() - 900_000,
      scan: { verdict: "malicious", threatsFound: 2, scannedFiles: 3, totalFiles: 9, lastScanAt: Date.now() - 120_000 },
    }),
    mk(4, {
      name: "archlinux-2026.10.01-x86_64.iso",
      sizeBytes: 1_340_000_000,
      downloadedBytes: 1_340_000_000,
      progress: 100,
      status: "paused",
      peers: 0,
      seeds: 0,
      baseDown: 0,
      baseUp: 0,
      addedAt: Date.now() - 172_800_000,
      scan: { verdict: "clean", threatsFound: 0, scannedFiles: 1, totalFiles: 1, lastScanAt: Date.now() - 150_000_000 },
    }),
    mk(5, {
      name: "Sintel.2010.1080p.x264-BLUEBIRD",
      sizeBytes: 1_180_000_000,
      downloadedBytes: 141_000_000,
      progress: 12.1,
      status: "downloading",
      peers: 21,
      seeds: 57,
      baseDown: 2_300_000,
      baseUp: 150_000,
      addedAt: Date.now() - 300_000,
      scan: { verdict: "pending", threatsFound: 0, scannedFiles: 2, totalFiles: 4, lastScanAt: null },
      threatAtProgress: 18,
    }),
  ];
}

function seedLog(): ScanLogEntry[] {
  const t = Date.now();
  return [
    {
      id: hex(8),
      file: "Big.Buck.Bunny.2008.2160p.Remux.mkv",
      torrentName: "Big.Buck.Bunny.2008.2160p.Remux.mkv",
      sizeBytes: 14_140_000_000,
      sha256: hex(64),
      verdict: "clean",
      detections: [],
      engines: ["Хэш", "Эвристика"],
      scannedAt: t - 43_200_000,
      quarantined: false,
    },
    {
      id: hex(8),
      file: "Adobe_Photoshop_2026_Activator.exe",
      torrentName: "Adobe_Photoshop_2026_Activator.exe",
      sizeBytes: 44_100_000,
      sha256: hex(64),
      verdict: "malicious",
      detections: [
        "Win.Trojan.Agent.aqx — clamd",
        "47/72 движков — VirusTotal",
      ],
      engines: ["Хэш", "Эвристика", "clamd", "VirusTotal"],
      scannedAt: t - 122_000,
      quarantined: false,
    },
    {
      id: hex(8),
      file: "Adobe_Photoshop_2026_Activator/Readme_Pass.txt",
      torrentName: "Adobe_Photoshop_2026_Activator.exe",
      sizeBytes: 2_240,
      sha256: hex(64),
      verdict: "suspicious",
      detections: ["Двойное расширение / исполняемая сигнатура MZ"],
      engines: ["Эвристика"],
      scannedAt: t - 121_000,
      quarantined: false,
    },
    {
      id: hex(8),
      file: "archlinux-2026.10.01-x86_64.iso",
      torrentName: "archlinux-2026.10.01-x86_64.iso",
      sizeBytes: 1_340_000_000,
      sha256: hex(64),
      verdict: "clean",
      detections: [],
      engines: ["Хэш", "Эвристика"],
      scannedAt: t - 150_000_000,
      quarantined: false,
    },
  ];
}

export function createMockApi(): Api {
  let torrents = seedTorrents();
  let scanLog = seedLog();
  const emitter = new Emitter();
  const settings: Settings = {
    downloadDir: DL_DIR,
    scanWhileDownloading: true,
    quarantineThreats: true,
    vtApiKey: "",
    clamdAddress: "",
    maxDownMbps: null,
    maxUpMbps: null,
  };

  const nextTorrentId = () =>
    torrents.reduce((m, t) => Math.max(m, t.id), 0) + 1;

  function pushEntry(entry: Omit<ScanLogEntry, "id">) {
    const full: ScanLogEntry = { ...entry, id: hex(8) };
    scanLog = [full, ...scanLog];
    emitter.emit({
      kind: full.verdict === "malicious" ? "threat_found" : "scan_completed",
      entry: full,
    });
  }

  function tick() {
    for (const t of torrents) {
      if (t.status === "downloading") {
        t.downSpeed = jitter(t.baseDown, t.baseDown * 0.35);
        t.upSpeed = jitter(t.baseUp, t.baseUp * 0.4);
        const chunk = Math.round(t.downSpeed * 1.5);
        t.downloadedBytes = Math.min(t.sizeBytes, t.downloadedBytes + chunk);
        t.progress = +((t.downloadedBytes / t.sizeBytes) * 100).toFixed(1);
        t.etaSeconds =
          t.downSpeed > 0
            ? Math.round((t.sizeBytes - t.downloadedBytes) / t.downSpeed)
            : null;
        t.peers = Math.max(1, t.peers + (Math.random() > 0.5 ? 1 : -1));

        // инкрементальное сканирование: файлы дописались — идём в сканер
        if (t.scan && t.scan.totalFiles > 0 && t.scan.verdict === "pending" && Math.random() < 0.3) {
          t.scan = {
            ...t.scan,
            scannedFiles: Math.min(t.scan.totalFiles, t.scan.scannedFiles + 1),
            lastScanAt: Date.now(),
          };
          if (Math.random() < 0.5) {
            pushEntry({
              file: `${t.name}/part-${String(t.scan.scannedFiles).padStart(2, "0")}.bin`,
              torrentName: t.name,
              sizeBytes: 4_194_304,
              sha256: hex(64),
              verdict: "clean",
              detections: [],
              engines: ["Хэш", "Эвристика"],
              scannedAt: Date.now(),
              quarantined: false,
            });
          }
        }

        // сценарий «подозрительный файл внутри раздачи»
        if (t.threatAtProgress && !t.threatPushed && t.progress >= t.threatAtProgress) {
          t.threatPushed = true;
          t.scan = {
            verdict: "suspicious",
            threatsFound: 1,
            scannedFiles: t.scan?.scannedFiles ?? 2,
            totalFiles: t.scan?.totalFiles ?? 4,
            lastScanAt: Date.now(),
          };
          pushEntry({
            file: `${t.name}/autoplay.scr`,
            torrentName: t.name,
            sizeBytes: 312_320,
            sha256: hex(64),
            verdict: "suspicious",
            detections: [
              "Энтропия 7.93 — признаки упаковщика",
              "Исполняемая сигнатура MZ в файле .scr",
            ],
            engines: ["Эвристика"],
            scannedAt: Date.now(),
            quarantined: false,
          });
        }

        if (t.progress >= 100) {
          t.status = "seeding";
          t.downSpeed = 0;
          t.etaSeconds = null;
          t.progress = 100;
        }
      } else if (t.status === "seeding") {
        t.upSpeed = jitter(t.baseUp, t.baseUp * 0.3);
        t.downSpeed = 0;
        t.uploadedBytes += Math.round(t.upSpeed * 1.5);
      }
    }
  }

  const timer = setInterval(tick, 1500);

  const api: Api = {
    isDemo: true,

    async addTorrent(source, scan) {
      const name =
        source
          .replace(/^magnet:\?xt=urn:btih:/i, "magnet:")
          .split(/[\\/]/)
          .pop() || source;
      const cleanName = decodeURIComponent(name.split("&dn=")[1] || name.replace(/^magnet:/, "magnet-загрузка"));
      const size = 800_000_000 + Math.floor(Math.random() * 4_000_000_000);
      const t = mk(nextTorrentId(), {
        name: cleanName,
        sizeBytes: size,
        status: "downloading",
        peers: 4 + Math.floor(Math.random() * 30),
        seeds: 5 + Math.floor(Math.random() * 60),
        baseDown: 1_500_000 + Math.floor(Math.random() * 4_000_000),
        baseUp: 100_000,
        addedAt: Date.now(),
        scan: scan
          ? { verdict: "pending", threatsFound: 0, scannedFiles: 0, totalFiles: 3 + Math.floor(Math.random() * 8), lastScanAt: null }
          : null,
      });
      torrents = [t, ...torrents];
    },

    async pauseTorrent(id) {
      torrents = torrents.map((t) =>
        t.id === id
          ? { ...t, status: "paused", downSpeed: 0, upSpeed: 0, etaSeconds: null }
          : t
      );
    },

    async resumeTorrent(id) {
      torrents = torrents.map((t) =>
        t.id === id
          ? { ...t, status: t.progress >= 100 ? "seeding" : "downloading" }
          : t
      );
    },

    async removeTorrent(id, deleteFiles) {
      torrents = torrents.filter((t) => t.id !== id);
      if (deleteFiles && Math.random() < 0.5) {
        // в демо иногда оставляем след в журнале — файлы «удалены»
        pushEntry({
          file: `tor#removed-${id}/* (файлы удалены вместе с раздачей)`,
          torrentName: null,
          sizeBytes: 0,
          sha256: null,
          verdict: "skipped",
          detections: [],
          engines: ["—"],
          scannedAt: Date.now(),
          quarantined: false,
        });
      }
    },

    async getTorrents() {
      // Служебные поля движка наружу не отдаём
      return torrents.map((t) => {
        const { baseDown: _a, baseUp: _b, threatAtProgress: _c, threatPushed: _d, ...rest } = t;
        void _a;
        void _b;
        void _c;
        void _d;
        return rest as Torrent;
      });
    },

    async getStats(): Promise<SessionStats> {
      const down = torrents.reduce((s, t) => s + t.downSpeed, 0);
      const up = torrents.reduce((s, t) => s + t.upSpeed, 0);
      return {
        downBytesPerSec: down,
        upBytesPerSec: up,
        dhtNodes: jitter(340, 120),
        torrentCount: torrents.length,
      };
    },

    async getScanLog() {
      return scanLog;
    },

    async getSettings() {
      return { ...settings };
    },

    async saveSettings(s) {
      Object.assign(settings, s);
    },

    async openFolder() {
      // в браузере некуда открывать
    },

    async quarantineEntry(id) {
      scanLog = scanLog.map((e) =>
        e.id === id ? { ...e, quarantined: true } : e
      );
    },

    async pickTorrentFile() {
      return null;
    },

    onEvent(cb) {
      return emitter.on(cb);
    },

    dispose() {
      clearInterval(timer);
    },
  };

  return api;
}
