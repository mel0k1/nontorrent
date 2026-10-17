import {
  Ban,
  FileWarning,
  Fingerprint,
  HardDrive,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sigma,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppState } from "@/hooks/use-app-state";
import { fmtBytes, fmtTime, shortHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScanVerdict } from "@/types";

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
    icon: HardDrive,
    title: "clamd (ClamAV)",
    text: "если указан адрес демона — полная сигнатурная проверка локальным движком",
  },
  {
    icon: Fingerprint,
    title: "VirusTotal",
    text: "отпечаток файла сверяется с 70+ движками (по хэшу, без загрузки файла; нужен свой API-ключ)",
  },
  {
    icon: Ban,
    title: "Карантин",
    text: "угроза изолируется в отдельную папку с сохранением метаданных, файл не запустится случайно",
  },
];

export function SecurityView() {
  const { scanLog, quarantine } = useAppState();

  const malicious = scanLog.filter((e) => e.verdict === "malicious").length;
  const suspicious = scanLog.filter((e) => e.verdict === "suspicious").length;
  const quarantined = scanLog.filter((e) => e.quarantined).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
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
          value={quarantined}
          tone="neutral"
        />
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Как работает проверка</CardTitle>
          <CardDescription>
            Конвейер безопасности NonTorrent — от куска торрента до вердикта
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
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
      </Card>
    </div>
  );
}
