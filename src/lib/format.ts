export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  const i = Math.min(
    Math.floor(Math.log(n) / Math.log(1024)),
    units.length - 1
  );
  const v = n / Math.pow(1024, i);
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function fmtSpeed(bytesPerSec: number): string {
  return `${fmtBytes(bytesPerSec)}/с`;
}

export function fmtEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)} с`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} ч ${m.toString().padStart(2, "0")} мин`;
  const mm = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${mm} мин ${s.toString().padStart(2, "0")} с`;
}

export function fmtTime(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtDate(epochMs: number): string {
  const d = new Date(epochMs);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortHash(sha: string | null): string {
  if (!sha) return "—";
  return `${sha.slice(0, 8)}…${sha.slice(-4)}`;
}
