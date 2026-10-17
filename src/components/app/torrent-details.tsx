import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  FolderOpen,
  Loader2,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppState } from "@/hooks/use-app-state";
import { fmtBytes, fmtDate, fmtEta, fmtSpeed } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScanVerdict, TorrentFile, TorrentStatus } from "@/types";

const STATUS_LABELS: Record<TorrentStatus, string> = {
  downloading: "Скачивание",
  paused: "Пауза",
  seeding: "Раздача",
  checking: "Проверка",
  queued: "В очереди",
  metadata: "Метаданные",
  error: "Ошибка",
};

function VerdictBadge({ verdict }: { verdict: ScanVerdict }) {
  if (verdict === "clean")
    return (
      <Badge variant="success">
        <ShieldCheck /> Чисто
      </Badge>
    );
  if (verdict === "malicious")
    return (
      <Badge variant="destructive">
        <ShieldAlert /> Угроза
      </Badge>
    );
  if (verdict === "suspicious")
    return (
      <Badge variant="warning">
        <ShieldQuestion /> Подозрительно
      </Badge>
    );
  return <Badge variant="muted">Не проверен</Badge>;
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Детальная панель раздачи: сводка + файлы с вердиктами
 * и выборочной скачкой (какие файлы качать).
 */
export function TorrentDetails({
  torrentId,
  onBack,
}: {
  torrentId: number;
  onBack: () => void;
}) {
  const { api, pause, resume, remove, openFolder } = useAppState();
  const [details, setDetails] = useState<Awaited<
    ReturnType<typeof api.getTorrentDetails>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  // несохранённые правки выбора файлов: index → качать?
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map());
  const [applying, setApplying] = useState(false);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getTorrentDetails(torrentId);
      setError(null);
      // пока пользователь не применил правки — не затираем его выбор
      setDetails((prev) =>
        dirtyRef.current && prev
          ? { ...d, files: prev.files }
          : d
      );
    } catch (e) {
      setError(String(e));
    }
  }, [api, torrentId]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!dirtyRef.current) load();
    }, 2000);
    return () => clearInterval(timer);
  }, [load]);

  const files = details?.files ?? [];

  const effectiveIncluded = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const f of files) {
      map.set(f.index, overrides.has(f.index) ? overrides.get(f.index)! : f.included);
    }
    return map;
  }, [files, overrides]);

  const dirty = overrides.size > 0;
  dirtyRef.current = dirty;

  const selectedCount = [...effectiveIncluded.values()].filter(Boolean).length;

  function toggle(index: number, checked: boolean) {
    setOverrides((m) => new Map(m).set(index, checked));
  }

  function setAll(checked: boolean) {
    setOverrides(
      new Map(files.map((f) => [f.index, checked] as [number, boolean]))
    );
  }

  async function apply() {
    if (!details) return;
    setApplying(true);
    try {
      const indices = files
        .filter((f) => effectiveIncluded.get(f.index))
        .map((f) => f.index);
      await api.setTorrentFiles(details.id, indices);
      setOverrides(new Map());
      await load();
      toast.success(
        indices.length === 0
          ? "Все файлы исключены — раздача не будет качаться"
          : `Выбор применён: ${indices.length} из ${files.length} файлов`
      );
    } catch (e) {
      toast.error("Не удалось применить выбор файлов", {
        description: String(e),
      });
    } finally {
      setApplying(false);
    }
  }

  const t = details;
  const isActive = t?.status === "downloading" || t?.status === "checking";

  return (
    <div className="space-y-4">
      {/* Шапка: назад + имя + действия */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Назад к списку">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {t?.name ?? "…"}
          </h1>
          {t?.scan && t.scan.verdict !== "clean" && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.scan.verdict === "malicious" &&
                `Угроз: ${t.scan.threatsFound} · `}
              проверено файлов {t.scan.scannedFiles}/{t.scan.totalFiles}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {t && (t.status === "paused" ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => resume(t.id)}>
              <Play className="h-3.5 w-3.5" />
              Продолжить
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => pause(t.id)}>
              <Pause className="h-3.5 w-3.5" />
              Пауза
            </Button>
          ))}
          {t && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => openFolder(t.id)}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Папка
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Не удалось загрузить раздачу: {error}
          </CardContent>
        </Card>
      )}

      {t && !error && (
        <>
          {/* Сводка */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Сводка</CardTitle>
              <CardDescription>
                {STATUS_LABELS[t.status]}
                {isActive && t.etaSeconds != null && ` · осталось ${fmtEta(t.etaSeconds)}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Progress value={t.progress} className="h-2" />
                <span className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {t.progress.toFixed(0)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <InfoCell label="Размер" value={fmtBytes(t.sizeBytes)} />
                <InfoCell
                  label="Скачано"
                  value={fmtBytes(t.downloadedBytes)}
                />
                <InfoCell label="Отдано" value={fmtBytes(t.uploadedBytes)} />
                <InfoCell label="Скорость" value={
                  t.downSpeed > 0 || t.upSpeed > 0
                    ? `↓ ${fmtSpeed(t.downSpeed)} · ↑ ${fmtSpeed(t.upSpeed)}`
                    : "—"
                } />
                <InfoCell label="Сиды / пиры" value={`${t.seeds} / ${t.peers}`} />
                <InfoCell label="Добавлена" value={fmtDate(t.addedAt)} />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Папка
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {t.outputPath}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-lg break-all font-mono">
                    {t.outputPath}
                  </TooltipContent>
                </Tooltip>
              </div>
            </CardContent>
          </Card>

          {/* Файлы */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Файлы раздачи</CardTitle>
                  <CardDescription>
                    Каждый файл проверяется отдельно. Сними галочку — файл не
                    будет скачан.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
                    Выбрать все
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setAll(false)}>
                    Снять все
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {files.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Метаданные ещё получены — список файлов появится позже.
                </p>
              )}
              {files.map((f: TorrentFile) => {
                const included = effectiveIncluded.get(f.index) ?? f.included;
                const fileProgress =
                  f.sizeBytes > 0
                    ? Math.min(100, (f.downloadedBytes / f.sizeBytes) * 100)
                    : 0;
                return (
                  <div
                    key={f.index}
                    className={cn(
                      "flex items-center gap-3 rounded-md border bg-secondary/30 px-3 py-2.5",
                      !included && "opacity-50"
                    )}
                  >
                    <Checkbox
                      checked={included}
                      onCheckedChange={(v) => toggle(f.index, v === true)}
                      aria-label={`Качать ${f.name}`}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {f.name}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-md break-all font-mono">
                        {f.name}
                      </TooltipContent>
                    </Tooltip>
                    {f.verdict ? (
                      <VerdictBadge verdict={f.verdict} />
                    ) : included ? (
                      <Badge variant="muted">Не проверен</Badge>
                    ) : null}
                    <div className="flex w-28 shrink-0 items-center gap-2">
                      <Progress
                        value={fileProgress}
                        className="h-1.5"
                        indicatorClassName={
                          f.verdict === "malicious"
                            ? "bg-destructive"
                            : f.verdict === "suspicious"
                              ? "bg-warning"
                              : undefined
                        }
                      />
                      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {fileProgress.toFixed(0)}%
                      </span>
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {fmtBytes(f.sizeBytes)}
                    </span>
                  </div>
                );
              })}

              {/* Панель применения выбора */}
              {dirty && (
                <div className="flex items-center justify-between gap-3 rounded-md border bg-secondary/60 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    Выбрано {selectedCount} из {files.length} файлов — изменения
                    ещё не применены
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOverrides(new Map())}
                    >
                      <X className="h-3.5 w-3.5" />
                      Отменить
                    </Button>
                    <Button size="sm" onClick={apply} disabled={applying}>
                      {applying ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Применить
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
