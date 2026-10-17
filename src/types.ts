export type TorrentStatus =
  | "downloading"
  | "paused"
  | "seeding"
  | "checking"
  | "queued"
  | "metadata"
  | "error";

export type ScanVerdict =
  | "clean"
  | "suspicious"
  | "malicious"
  | "pending"
  | "skipped";

export interface TorrentScanState {
  verdict: ScanVerdict;
  threatsFound: number;
  scannedFiles: number;
  totalFiles: number;
  lastScanAt: number | null;
}

export interface Torrent {
  id: number;
  name: string;
  infoHash: string | null;
  sizeBytes: number;
  downloadedBytes: number;
  uploadedBytes: number;
  downSpeed: number;
  upSpeed: number;
  peers: number;
  seeds: number;
  status: TorrentStatus;
  progress: number;
  etaSeconds: number | null;
  outputPath: string;
  addedAt: number;
  scan: TorrentScanState | null;
}

/** Один файл внутри раздачи (детальная панель) */
export interface TorrentFile {
  index: number;
  name: string;
  sizeBytes: number;
  downloadedBytes: number;
  included: boolean;
  verdict: ScanVerdict | null;
}

/** Детальная панель раздачи */
export interface TorrentDetails extends Torrent {
  files: TorrentFile[];
}

/** Файл в карантине */
export interface QuarantineItem {
  /** Имя *.quarantined-файла в папке карантина (идентификатор) */
  name: string;
  original: string;
  fileName: string;
  sizeBytes: number;
  sha256: string | null;
  quarantinedAt: number | null;
}

export interface ScanLogEntry {
  id: string;
  file: string;
  torrentName: string | null;
  sizeBytes: number;
  sha256: string | null;
  verdict: ScanVerdict;
  detections: string[];
  engines: string[];
  scannedAt: number;
  quarantined: boolean;
}

export interface SessionStats {
  downBytesPerSec: number;
  upBytesPerSec: number;
  dhtNodes: number;
  torrentCount: number;
}

export interface Settings {
  downloadDir: string;
  scanWhileDownloading: boolean;
  quarantineThreats: boolean;
  vtApiKey: string;
  useBuiltInVt: boolean;
  clamdAddress: string;
  maxDownMbps: number | null;
  maxUpMbps: number | null;
  yaraEnabled: boolean;
  closeToTray: boolean;
  autostart: boolean;
  schedulerEnabled: boolean;
  schedulerRules: SchedulerRule[];
  /** Пауза всех раздач при обнаружении угрозы */
  pauseOnThreat: boolean;
  /** Watch-папка: пусто = выключено */
  watchDir: string;
}

export interface SchedulerRule {
  /** 0 = понедельник … 6 = воскресенье */
  days: number[];
  start: string;
  end: string;
  downMbps: number | null;
  upMbps: number | null;
}

export interface SecurityInfo {
  yaraRules: number;
  customRuleFiles: number;
  vtCacheEntries: number;
  quarantinedFiles: number;
}

export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
  kind: "windows-setup" | "linux-deb" | "linux-appimage" | "other";
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  notes: string | null;
  publishedAt: string | null;
  assets: UpdateAsset[];
}

export interface UpdateProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  done: boolean;
}

export type AppEvent =
  | { kind: "scan_completed"; entry: ScanLogEntry }
  | { kind: "threat_found"; entry: ScanLogEntry };

export type ViewId = "downloads" | "security" | "settings";

export interface Api {
  isDemo: boolean;
  addTorrent(source: string, scanWhileDownloading: boolean): Promise<void>;
  pauseTorrent(id: number): Promise<void>;
  resumeTorrent(id: number): Promise<void>;
  removeTorrent(id: number, deleteFiles: boolean): Promise<void>;
  pauseAll(): Promise<void>;
  resumeAll(): Promise<void>;
  getTorrents(): Promise<Torrent[]>;
  getTorrentDetails(id: number): Promise<TorrentDetails>;
  setTorrentFiles(id: number, indices: number[]): Promise<void>;
  getStats(): Promise<SessionStats>;
  getScanLog(): Promise<ScanLogEntry[]>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  openFolder(id: number): Promise<void>;
  quarantineEntry(id: string): Promise<void>;
  listQuarantine(): Promise<QuarantineItem[]>;
  restoreQuarantine(name: string): Promise<void>;
  deleteQuarantine(name: string): Promise<void>;
  getAutostart(): Promise<boolean>;
  setAutostart(enabled: boolean): Promise<void>;
  getSecurityInfo(): Promise<SecurityInfo>;
  pickTorrentFile(): Promise<string | null>;
  pickFolder(): Promise<string | null>;
  checkUpdate(): Promise<UpdateInfo>;
  downloadUpdate(url: string, name: string): Promise<string>;
  installUpdate(path: string, kind: string): Promise<void>;
  onUpdateProgress(cb: (p: UpdateProgress) => void): () => void;
  onEvent(cb: (e: AppEvent) => void): () => void;
  dispose(): void;
}
