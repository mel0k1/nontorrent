import {
  Ban,
  Binary,
  ChevronDown,
  Fingerprint,
  FolderLock,
  HardDrive,
  ListChecks,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sigma,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppState } from "@/hooks/use-app-state";
import { fmtBytes, fmtDate, fmtTime, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QuarantineItem, ScanVerdict, SecurityInfo } from "@/types";

function VerdictBadge({ verdict }: { verdict: ScanVerdict }) {
  switch (verdict) {
    case "clean":
      return (
        <Badge variant="success">
          <ShieldCheck /> Чисто
        </Badge>
      );
    case "malicious":
      return (
        <Badge variant="destructive">
          <ShieldAlert /> Угроза
        </Badge>
      );
    case "suspicious":
      return (
        <Badge variant="warning">
          <ShieldQuestion /> Подозрительно
        </Badge>
      );
    case "skipped":
      return <Badge variant="muted">Пропущено</Badge>;
    default:
      return <Badge variant="muted">Ожидает</Badge>;
  }
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "neutral" | "danger" | "warning" | "ok";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
            tone === "danger" && "bg-destructive/15 text-destructive",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "ok" && "bg-success/15 text-success",
            tone === "neutral" && "bg-secondary text-muted-foreground"
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-lg font-semibold leading-none tabular-nums">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const PIPELINE = [
  {
    icon: Sigma,
    title: "Хэш SHA-256",
    text: "каждый готовый файл считается хэшем — точная идентификация и кэш вердиктов",
  },
  {
    icon: ShieldQuestion,
    title: "Эвристика",
    text: "двойные расширения, MZ-сигнатура внутри «не-исполняемых» файлов, упаковщики по энтропии",
  },
  {
    icon: Binary,
    title: "YARA",
    text: "локальные сигнатуры: дропперы, эксплойты ярлыков, упаковщики. Работает без интернета",
  },
  {
    icon: HardDrive,
    title: "clamd (ClamAV)",
    text: "если указан адрес демона — полная сигнатурная проверка локальным движком",
  },
  {
    icon: Fingerprint,
    title: "VirusTotal",
    text: "отпечаток файла сверяется с 70+ движками по хэшу; вердикты кэшируются на диск между запусками",
  },
  {
    icon: Ban,
    title: "Карантин",
    text: "угроза изолируется в отдельную папку с сохранением метаданных, файл не запустится случайно",
  },
];

export function SecurityView() {
  const { scanLog, quarantine, api } = useAppState();
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  // «Как работает проверка» — справка: по умолчанию скрыта, открывается кликом
  const [pipelineOpen, setPipelineOpen] = useState(false);
  // карантин: список + флаг занятости на время действий
  const [quarantineItems, setQuarantineItems] = useState<QuarantineItem[]>([]);
  const [qBusy, setQBusy] = useState(false);
  // имя файла, для которого нажали «Удалить» и ждём подтверждения
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadQuarantine = useCallback(() => {
    setQBusy(true);
    api
      .listQuarantine()
      .then(setQuarantineItems)
      .catch(() => {})
      .finally(() => setQBusy(false));
  }, [api]);

  useEffect(() => {
    api
      .getSecurityInfo()
      .then(setInfo)
      .catch(() => {});
  }, [api, scanLog.length]);

  // карантин: подгружаем сразу, при возврате на страницу и когда меняется
  // счётчик «В карантине» — например, сканер только что изолировал угрозу
  const quarantinedFiles = info?.quarantinedFiles ?? 0;
  useEffect(() => {
    loadQuarantine();
  }, [loadQuarantine, quarantinedFiles]);

  async function restoreItem(name: string) {
    setQBusy(true);
    try {
      await api.restoreQuarantine(name);
      toast.success("Файл восстановлен", {
        description: "Возвращён по исходному пути",
      });
    } catch (e) {
      toast.error("Не удалось восстановить", { description: String(e) });
    } finally {
      setQBusy(false);
      loadQuarantine();
    }
  }

  async function deleteItem(name: string) {
    setQBusy(true);
    try {
      await api.deleteQuarantine(name);
      toast.success("Файл удалён навсегда");
    } catch (e) {
      toast.error("Не удалось удалить", { description: String(e) });
    } finally {
      setQBusy(false);
      loadQuarantine();
    }
  }

  const malicious = scanLog.filter((e) => e.verdict === "malicious").length;
  const suspicious = scanLog.filter((e) => e.verdict === "suspicious").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Проверок в журнале"
          value={scanLog.length}
          tone="neutral"
        />
        <StatCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Угрозы"
          value={malicious}
          tone={malicious > 0 ? "danger" : "ok"}
        />
        <StatCard
          icon={<ShieldQuestion className="h-4 w-4" />}
          label="Подозрительные"
          value={suspicious}
          tone={suspicious > 0 ? "warning" : "ok"}
        />
        <StatCard
          icon={<Ban className="h-4 w-4" />}
          label="В карантине"
          value={info?.quarantinedFiles ?? 0}
          tone="neutral"
        />
        <StatCard
          icon={<Binary className="h-4 w-4" />}
          label="Правила YARA"
          value={info?.yaraRules ?? 0}
          tone="neutral"
        />
        <StatCard
          icon={<Fingerprint className="h-4 w-4" />}
          label="Кэш вердиктов VT"
          value={info?.vtCacheEntries ?? 0}
          tone="neutral"
        />
      </div>

      <Tabs defaultValue="journal">
        <TabsList>
          <TabsTrigger value="journal" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            Журнал проверок
          </TabsTrigger>
          <TabsTrigger value="quarantine" className="gap-1.5">
            <FolderLock className="h-3.5 w-3.5" />
            Карантин
            {quarantineItems.length > 0 && (
              <span className="rounded-full bg-destructive/20 px-1.5 text-[10px] font-semibold text-destructive">
                {quarantineItems.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Журнал проверок</CardTitle>
              <CardDescription>
                Каждый файл проходит многоступенчатую проверку во время скачивания
                и повторную — после завершения раздачи.
              </CardDescription>
            </CardHeader>
            <CardContent>
            {scanLog.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ShieldCheck className="h-8 w-8 text-success" />
              <p className="text-sm text-muted-foreground">
                Журнал пуст — пока всё чисто
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[38%]">Файл</TableHead>
                  <TableHead>Размер</TableHead>
                  <TableHead>SHA-256</TableHead>
                  <TableHead>Вердикт</TableHead>
                  <TableHead>Движки</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scanLog.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate text-sm font-medium">
                        {e.file}
                      </div>
                      {e.torrentName && e.torrentName !== e.file && (
                        <div className="truncate text-xs text-muted-foreground">
                          из «{e.torrentName}» · {fmtTime(e.scannedAt)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs tabular-nums">
                      {fmtBytes(e.sizeBytes)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{shortHash(e.sha256)}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="font-mono">
                          {e.sha256 ?? "—"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <VerdictBadge verdict={e.verdict} />
                      {e.detections.length > 0 && (
                        <div className="mt-1 max-w-[240px] space-y-0.5">
                          {e.detections.map((d, i) => (
                            <p
                              key={i}
                              className="truncate text-[11px] text-muted-foreground"
                              title={d}
                            >
                              {d}
                            </p>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {e.engines.map((eng) => (
                          <Badge key={eng} variant="secondary" className="text-[10px]">
                            {eng}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {(e.verdict === "malicious" ||
                        e.verdict === "suspicious") &&
                        !e.quarantined && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            onClick={async () => {
                              try {
                                await quarantine(e.id);
                              } catch {
                                toast.error("Карантин недоступен");
                              }
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            В карантин
                          </Button>
                        )}
                      {e.quarantined && (
                        <Badge variant="muted">
                          <Ban /> Карантин
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quarantine">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Карантин</CardTitle>
              <CardDescription>
                Угрозы изолируются здесь — файл не запустится случайно.
                Восстановите, если вердикт оказался ложным, или удалите навсегда.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quarantineItems.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <FolderLock className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Карантин пуст — угроз пока не изолировано
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Файл</TableHead>
                      <TableHead>Размер</TableHead>
                      <TableHead>SHA-256</TableHead>
                      <TableHead>Помещён</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quarantineItems.map((q) => {
                      const confirming = confirmDelete === q.name;
                      return (
                        <TableRow key={q.name}>
                          <TableCell className="max-w-[280px]">
                            <div className="truncate text-sm font-medium">
                              {q.fileName}
                            </div>
                            <div
                              className="truncate text-xs text-muted-foreground"
                              title={q.original}
                            >
                              {q.original || "исходный путь неизвестен"}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {fmtBytes(q.sizeBytes)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{shortHash(q.sha256)}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="font-mono">
                                {q.sha256 ?? "—"}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                            {q.quarantinedAt ? fmtDate(q.quarantinedAt) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                disabled={qBusy}
                                onClick={() => restoreItem(q.name)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Восстановить
                              </Button>
                              <Button
                                variant={confirming ? "destructive" : "ghost"}
                                size="sm"
                                className={cn(
                                  "gap-1.5",
                                  !confirming && "text-destructive hover:text-destructive"
                                )}
                                disabled={qBusy}
                                onClick={() => {
                                  if (!confirming) {
                                    setConfirmDelete(q.name);
                                    setTimeout(() => {
                                      setConfirmDelete((cur) =>
                                        cur === q.name ? null : cur
                                      );
                                    }, 4000);
                                    return;
                                  }
                                  setConfirmDelete(null);
                                  deleteItem(q.name);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {confirming ? "Точно?" : "Удалить"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <button
          type="button"
          onClick={() => setPipelineOpen((v) => !v)}
          aria-expanded={pipelineOpen}
          className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
        >
          <div>
            <CardTitle className="text-base">Как работает проверка</CardTitle>
            <CardDescription className="mt-1">
              {PIPELINE.length} ступеней конвейера безопасности — от куска
              торрента до вердикта
            </CardDescription>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              pipelineOpen && "rotate-180"
            )}
          />
        </button>
        {pipelineOpen && (
          <CardContent className="grid gap-3 border-t pt-5 md:grid-cols-3 xl:grid-cols-6">
            {PIPELINE.map((step, i) => (
              <div key={step.title} className="rounded-md border bg-secondary/30 p-3">
                <div className="flex items-center gap-2">
                  <step.icon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">
                    {i + 1}. {step.title}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  {step.text}
                </p>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
