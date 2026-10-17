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
  getTorrents(): Promise<Torrent[]>;
  getStats(): Promise<SessionStats>;
  getScanLog(): Promise<ScanLogEntry[]>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  openFolder(id: number): Promise<void>;
  quarantineEntry(id: string): Promise<void>;
  pickTorrentFile(): Promise<string | null>;
  checkUpdate(): Promise<UpdateInfo>;
  downloadUpdate(url: string, name: string): Promise<string>;
  installUpdate(path: string, kind: string): Promise<void>;
  onUpdateProgress(cb: (p: UpdateProgress) => void): () => void;
  onEvent(cb: (e: AppEvent) => void): () => void;
  dispose(): void;
}
