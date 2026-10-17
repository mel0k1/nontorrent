import {
  Disc,
  File,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  FileWarning,
  FolderOpen,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppState } from "@/hooks/use-app-state";
import { fmtBytes, fmtEta, fmtSpeed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Torrent, TorrentStatus } from "@/types";

const STATUS_LABELS: Record<TorrentStatus, string> = {
  downloading: "Скачивание",
  paused: "Пауза",
  seeding: "Раздача",
  checking: "Проверка",
  queued: "В очереди",
  metadata: "Метаданные",
  error: "Ошибка",
};

const STATUS_VARIANTS: Record<TorrentStatus, string> = {
  downloading: "bg-primary/15 text-primary",
  paused: "bg-muted text-muted-foreground",
  seeding: "bg-success/15 text-success",
  checking: "bg-warning/15 text-warning",
  queued: "bg-muted text-muted-foreground",
  metadata: "bg-muted text-muted-foreground",
  error: "bg-destructive/15 text-destructive",
};

function fileMeta(name: string): { Icon: typeof File; tint: string } {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["iso", "img"].includes(ext))
    return { Icon: Disc, tint: "text-primary" };
  if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext))
    return { Icon: FileVideo, tint: "text-sky-300" };
  if (["mp3", "flac", "wav", "ogg"].includes(ext))
    return { Icon: FileAudio, tint: "text-emerald-300" };
  if (["zip", "rar", "7z", "tar", "gz", "iso"].includes(ext))
    return { Icon: FileArchive, tint: "text-amber-300" };
  if (["exe", "msi", "bat", "cmd", "scr", "dll", "ps1", "vbs"].includes(ext))
    return { Icon: FileWarning, tint: "text-destructive" };
  if (["pdf", "doc", "docx", "epub", "txt"].includes(ext))
    return { Icon: FileText, tint: "text-muted-foreground" };
  return { Icon: File, tint: "text-muted-foreground" };
}

function ScanBadge({ torrent }: { torrent: Torrent }) {
  const scan = torrent.scan;
  if (!scan) return null;
  if (scan.verdict === "clean")
    return (
      <Badge variant="success">
        <ShieldCheck /> Чисто
      </Badge>
    );
  if (scan.verdict === "malicious")
    return (
      <Badge variant="destructive">
        <ShieldAlert /> Угроза{scan.threatsFound > 0 ? ` ×${scan.threatsFound}` : ""}
      </Badge>
    );
  if (scan.verdict === "suspicious")
    return (
      <Badge variant="warning">
        <ShieldQuestion /> Подозрительно
      </Badge>
    );
  if (scan.verdict === "pending")
    return (
      <Badge variant="muted">
        <Loader2 className="animate-spin" /> Проверка {scan.scannedFiles}/
        {scan.totalFiles}
      </Badge>
    );
  return null;
}

export function TorrentRow({
  torrent,
  onOpen,
}: {
  torrent: Torrent;
  onOpen?: () => void;
}) {
  const { pause, resume, remove, openFolder } = useAppState();
  const { Icon, tint } = fileMeta(torrent.name);
  const isActive =
    torrent.status === "downloading" || torrent.status === "checking";

  const progressTint =
    torrent.scan?.verdict === "malicious"
      ? "bg-destructive"
      : torrent.scan?.verdict === "suspicious"
        ? "bg-warning"
        : torrent.status === "seeding"
          ? "bg-success"
          : "bg-primary";

  const menuAction = (fn: () => Promise<void>, done?: string) => async () => {
    await fn();
    if (done) toast.success(done);
  };

  return (
    <div
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpen && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group flex cursor-pointer items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
        <Icon className={cn("h-5 w-5", tint)} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-full truncate text-sm font-medium">
                {torrent.name}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-md break-all">
              <p>{torrent.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {torrent.outputPath}
              </p>
            </TooltipContent>
          </Tooltip>
          <ScanBadge torrent={torrent} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
          <span>{fmtBytes(torrent.sizeBytes)}</span>
          <span>
            сиды {torrent.seeds} · пиры {torrent.peers}
          </span>
          {torrent.downSpeed > 0 && (
            <span className="text-primary">↓ {fmtSpeed(torrent.downSpeed)}</span>
          )}
          {torrent.upSpeed > 0 && (
            <span className="text-success">↑ {fmtSpeed(torrent.upSpeed)}</span>
          )}
          {torrent.uploadedBytes > 0 && <span>отдано {fmtBytes(torrent.uploadedBytes)}</span>}
        </div>
      </div>

      <div className="hidden w-44 shrink-0 flex-col items-end gap-1.5 sm:flex">
        <div className="flex w-full items-center gap-2">
          <Progress value={torrent.progress} indicatorClassName={progressTint} />
          <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {torrent.progress.toFixed(0)}%
          </span>
        </div>
        <div className="flex w-full items-center justify-end gap-2 text-[11px] text-muted-foreground">
          <Badge
            variant="outline"
            className={cn("border-0 px-1.5", STATUS_VARIANTS[torrent.status])}
          >
            {STATUS_LABELS[torrent.status]}
          </Badge>
          {isActive && (
            <span>
              ETA {fmtEta(torrent.etaSeconds)}
            </span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
          {torrent.status === "paused" ? (
            <DropdownMenuItem onClick={menuAction(() => resume(torrent.id))}>
              <Play /> Продолжить
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={menuAction(() => pause(torrent.id))}>
              <Pause /> Пауза
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={menuAction(() => openFolder(torrent.id))}>
            <FolderOpen /> Открыть папку
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={menuAction(() => remove(torrent.id, false), "Раздача удалена")}
          >
            <Trash2 /> Удалить раздачу
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={menuAction(
              () => remove(torrent.id, true),
              "Удалено вместе с файлами"
            )}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 /> Удалить + файлы
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
