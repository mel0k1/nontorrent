import { useCallback, useEffect, useState } from "react";
import {
  AlarmClock,
  Download as DownloadIcon,
  Fingerprint,
  FolderOpen,
  Gauge,
  Info,
  MonitorCog,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/lib/utils";
import { fmtBytes } from "@/lib/format";
import type {
  SchedulerRule,
  Settings as SettingsType,
  UpdateInfo,
  UpdateProgress,
} from "@/types";

type Os = "windows" | "linux" | "other";

function currentOs(): Os {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "other";
}

function pickAsset(info: UpdateInfo) {
  const os = currentOs();
  if (os === "windows") {
    return (
      info.assets.find((a) => a.kind === "windows-setup") ?? null
    );
  }
  if (os === "linux") {
    return (
      info.assets.find((a) => a.kind === "linux-appimage") ??
      info.assets.find((a) => a.kind === "linux-deb") ??
      null
    );
  }
  return null;
}

const ASSET_LABEL: Record<string, string> = {
  "windows-setup": "Установщик Windows (NSIS)",
  "linux-deb": "Пакет Linux (.deb)",
  "linux-appimage": "Linux (AppImage)",
};

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function emptyRule(): SchedulerRule {
  return {
    days: [0, 1, 2, 3, 4],
    start: "09:00",
    end: "23:00",
    downMbps: null,
    upMbps: null,
  };
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border bg-secondary/30 p-3">
      <div>
        <Label className="cursor-pointer">{title}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Редактор одного правила планировщика */
function RuleRow({
  rule,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  rule: SchedulerRule;
  index: number;
  onChange: (r: SchedulerRule) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const toggleDay = (d: number) => {
    const days = rule.days.includes(d)
      ? rule.days.filter((x) => x !== d)
      : [...rule.days, d].sort();
    onChange({ ...rule, days });
  };

  const limitInput = (
    field: "downMbps" | "upMbps",
    value: number | null,
    placeholder: string,
  ) => (
    <Input
      type="number"
      min={0}
      step="0.5"
      value={value ?? ""}
      onChange={(e) =>
        onChange({
          ...rule,
          [field]: e.target.value.trim() === "" ? null : Number(e.target.value),
        })
      }
      placeholder={placeholder}
      className="h-8 text-xs"
    />
  );

  return (
    <div className="space-y-2.5 rounded-md border bg-secondary/30 p-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {DAY_LABELS.map((label, d) => {
            const active = rule.days.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={cn(
                  "h-7 w-9 rounded-md border text-[11px] font-medium transition-colors",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent/60"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Удалить правило"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Начало</Label>
          <Input
            type="time"
            value={rule.start}
            onChange={(e) => onChange({ ...rule, start: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Конец</Label>
          <Input
            type="time"
            value={rule.end}
            onChange={(e) => onChange({ ...rule, end: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Скачивание, Мбит/с
          </Label>
          {limitInput("downMbps", rule.downMbps, "без лимита")}
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            Отдача, Мбит/с
          </Label>
          {limitInput("upMbps", rule.upMbps, "без лимита")}
        </div>
      </div>
    </div>
  );
}

export function SettingsView() {
  const { settings, saveSettings, api } = useAppState();
  const [draft, setDraft] = useState<SettingsType>(settings);
  const [down, setDown] = useState(settings.maxDownMbps?.toString() ?? "");
  const [up, setUp] = useState(settings.maxUpMbps?.toString() ?? "");
  // фактическое состояние автозапуска ОС (может отличаться от настройки)
  const [osAutostart, setOsAutostart] = useState<boolean | null>(null);

  // состояние обновлений
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    setDraft(settings);
    setDown(settings.maxDownMbps?.toString() ?? "");
    setUp(settings.maxUpMbps?.toString() ?? "");
  }, [settings]);

  useEffect(() => {
    api
      .getAutostart()
      .then(setOsAutostart)
      .catch(() => setOsAutostart(null));
  }, [api]);

  useEffect(() => {
    return api.onUpdateProgress((p) => setProgress(p));
  }, [api]);

  function collect(): SettingsType {
    return {
      ...draft,
      maxDownMbps: down.trim() === "" ? null : Number(down.replace(",", ".")),
      maxUpMbps: up.trim() === "" ? null : Number(up.replace(",", ".")),
    };
  }

  const numOk = (v: string) =>
    v.trim() === "" ||
    (!Number.isNaN(Number(v.replace(",", "."))) && Number(v.replace(",", ".")) >= 0);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    try {
      const info = await api.checkUpdate();
      setUpdateInfo(info);
      if (info.updateAvailable) {
        toast.success(`Доступна версия ${info.latestVersion}`, {
          description: "Скачайте установщик в разделе обновлений",
        });
      } else if (info.latestVersion) {
        toast.info("У вас последняя версия");
      } else {
        toast.info("Релизы ещё не публиковались");
      }
    } catch (e) {
      toast.error("Не удалось проверить обновления", {
        description: String(e),
      });
    } finally {
      setChecking(false);
    }
  }, [api]);

  const downloadAndInstall = useCallback(async () => {
    if (!updateInfo) return;
    const asset = pickAsset(updateInfo);
    if (!asset) {
      toast.error("Для этой ОС нет готовой сборки", {
        description: "Скачайте файл вручную со страницы релизов",
      });
      return;
    }
    setDownloading(true);
    setProgress(null);
    try {
      const path = await api.downloadUpdate(asset.url, asset.name);
      toast.success("Обновление скачано", { description: asset.name });
      await api.installUpdate(path, asset.kind);
    } catch (e) {
      toast.error("Обновление не удалось", { description: String(e) });
    } finally {
      setDownloading(false);
    }
  }, [api, updateInfo]);

  /** Автозапуск: меняем и настройку, и регистрацию в ОС, сразу сохраняем */
  const changeAutostart = async (enabled: boolean) => {
    setDraft((d) => ({ ...d, autostart: enabled }));
    try {
      await api.setAutostart(enabled);
      await saveSettings({ ...collect(), autostart: enabled });
      setOsAutostart(enabled);
    } catch (e) {
      toast.error("Не удалось изменить автозапуск", { description: String(e) });
      setDraft((d) => ({ ...d, autostart: !enabled }));
    }
  };

  const asset = updateInfo ? pickAsset(updateInfo) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorCog className="h-4 w-4 text-primary" />
            Приложение
          </CardTitle>
          <CardDescription>
            Поведение окна, трей и запуск вместе с системой.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            title="Сворачивать в трей при закрытии"
            description="Закрытие окна не завершает раздачи — приложение остаётся в трее. Выход — из меню трея."
            checked={draft.closeToTray}
            onChange={(v) => setDraft({ ...draft, closeToTray: v })}
          />
          <ToggleRow
            title="Запускать при входе в систему"
            description="По умолчанию отключён. Включается только здесь — NonTorrent сам регистрирует автозапуск в ОС."
            checked={draft.autostart}
            onChange={changeAutostart}
          />
          <p className="text-xs text-muted-foreground">
            Состояние в системе:{" "}
            {osAutostart === null
              ? "неизвестно"
              : osAutostart
                ? "автозапуск включён"
                : "автозапуск отключён"}
            {osAutostart !== null && osAutostart !== draft.autostart && (
              <span className="text-warning"> — не совпадает с настройкой</span>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4 text-primary" />
            Папка загрузок
          </CardTitle>
          <CardDescription>
            Куда складываются файлы. Каждая раздача создаёт подпапку со своим
            именем.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            value={draft.downloadDir}
            onChange={(e) => setDraft({ ...draft, downloadDir: e.target.value })}
            placeholder="/home/user/Downloads"
            className="font-mono text-xs"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Fingerprint className="h-4 w-4 text-primary" />
            Антивирус
          </CardTitle>
          <CardDescription>
            Конвейер проверки файлов. Чем больше источников включено — тем
            надёжнее вердикт.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            title="Проверять во время скачивания"
            description="Файл сканируется сразу, как только дописались его куски — не дожидаясь конца раздачи."
            checked={draft.scanWhileDownloading}
            onChange={(v) => setDraft({ ...draft, scanWhileDownloading: v })}
          />

          <ToggleRow
            title="YARA-сигнатуры"
            description="Локальные правила (встроенные + файлы из папки приложения yara_rules): дропперы, эксплойты ярлыков, упаковщики. Работают без интернета."
            checked={draft.yaraEnabled}
            onChange={(v) => setDraft({ ...draft, yaraEnabled: v })}
          />

          <ToggleRow
            title="Автоматический карантин угроз"
            description="Файл с вердиктом «угроза» изолируется в отдельную папку и помечается в журнале."
            checked={draft.quarantineThreats}
            onChange={(v) => setDraft({ ...draft, quarantineThreats: v })}
          />

          <ToggleRow
            title="Встроенный ключ VirusTotal"
            description="В приложении зашит общий ключ (обфусцирован в бинарнике). Свой ключ в поле ниже имеет приоритет. Отключите, если используете только свой."
            checked={draft.useBuiltInVt}
            onChange={(v) => setDraft({ ...draft, useBuiltInVt: v })}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="clamd">Адрес clamd</Label>
              <Input
                id="clamd"
                value={draft.clamdAddress}
                onChange={(e) =>
                  setDraft({ ...draft, clamdAddress: e.target.value })
                }
                placeholder="127.0.0.1:3310"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Локальный ClamAV-демон (опционально). Сигнатуры вместо одних
                эвристик.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vtkey">Свой ключ VirusTotal API</Label>
              <Input
                id="vtkey"
                type="password"
                value={draft.vtApiKey}
                onChange={(e) =>
                  setDraft({ ...draft, vtApiKey: e.target.value })
                }
                placeholder="необязательно"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Проверка отпечатка по 70+ движкам. Файл не загружается —
                только хэш.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlarmClock className="h-4 w-4 text-primary" />
            Планировщик скорости
          </CardTitle>
          <CardDescription>
            Почасовые лимиты: правило сработало — ограничения применились.
            Ни одно не подошло — действуют базовые ограничения ниже.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            title="Включить планировщик"
            description={
              api.isDemo
                ? "В демо-режиме лимиты не применяются к движку"
                : "Лимиты применяются к сессии автоматически, каждые 30 секунд"
            }
            checked={draft.schedulerEnabled}
            onChange={(v) => setDraft({ ...draft, schedulerEnabled: v })}
          />

          {draft.schedulerEnabled && (
            <div className="space-y-3">
              {draft.schedulerRules.length === 0 && (
                <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Правил нет — ограничения не меняются. Добавьте первое.
                </p>
              )}
              {draft.schedulerRules.map((rule, i) => (
                <RuleRow
                  key={i}
                  index={i}
                  rule={rule}
                  canRemove={draft.schedulerRules.length > 1}
                  onChange={(r) =>
                    setDraft((d) => {
                      const rules = [...d.schedulerRules];
                      rules[i] = r;
                      return { ...d, schedulerRules: rules };
                    })
                  }
                  onRemove={() =>
                    setDraft((d) => ({
                      ...d,
                      schedulerRules: d.schedulerRules.filter((_, j) => j !== i),
                    }))
                  }
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    schedulerRules: [...d.schedulerRules, emptyRule()],
                  }))
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить правило
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" />
            Ограничения скорости
          </CardTitle>
          <CardDescription>
            Базовые лимиты — вне правил планировщика. Пусто — без ограничений.
            Значения в Мбит/с.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="down">Скачивание</Label>
            <Input
              id="down"
              type="number"
              min={0}
              value={down}
              onChange={(e) => setDown(e.target.value)}
              placeholder="без ограничений"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="up">Отдача</Label>
            <Input
              id="up"
              type="number"
              min={0}
              value={up}
              onChange={(e) => setUp(e.target.value)}
              placeholder="без ограничений"
            />
          </div>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            {api.isDemo
              ? "В демо-режиме настройки не применяются к движку"
              : "Настройки применяются сразу и сохраняются локально"}
          </p>
          <Button
            onClick={() => saveSettings(collect())}
            disabled={!numOk(down) || !numOk(up)}
          >
            <ShieldCheck className="h-4 w-4" />
            Сохранить
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw
              className={cn("h-4 w-4 text-primary", checking && "animate-spin")}
            />
            Обновления
          </CardTitle>
          <CardDescription>
            Проверка новых версий в GitHub Releases. Установщик скачивается
            и запускается автоматически.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm">
                Текущая версия{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {updateInfo?.currentVersion ?? "0.2.0"}
                </span>
                {updateInfo?.updateAvailable && (
                  <>
                    {" "}· доступна{" "}
                    <span className="font-mono text-xs text-success">
                      {updateInfo.latestVersion}
                    </span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {updateInfo
                  ? updateInfo.updateAvailable
                    ? "Можно скачать и установить прямо из приложения."
                    : "У вас последняя версия NonTorrent."
                  : "Проверьте вручную — авто-проверка выполняется при запуске."}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={checkForUpdates}
              disabled={checking || downloading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} />
              Проверить обновления
            </Button>
          </div>

          {updateInfo?.updateAvailable && !downloading && (
            <div className="flex items-center justify-between gap-4 rounded-md border bg-secondary/30 p-3">
              <div>
                <p className="text-sm font-medium">
                  {updateInfo.latestVersion}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {asset
                    ? `${ASSET_LABEL[asset.kind] ?? asset.name} · ${fmtBytes(asset.size)}`
                    : "Готовых сборок для этой ОС нет — доступны только части файлов"}
                </p>
              </div>
              <Button size="sm" onClick={downloadAndInstall}>
                <DownloadIcon className="h-3.5 w-3.5" />
                Скачать и установить
              </Button>
            </div>
          )}

          {downloading && (
            <div className="space-y-2 rounded-md border bg-secondary/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Скачивание обновления…</span>
                <span className="font-mono">
                  {progress
                    ? progress.totalBytes > 0
                      ? `${fmtBytes(progress.downloadedBytes)} / ${fmtBytes(progress.totalBytes)}`
                      : fmtBytes(progress.downloadedBytes)
                    : ""}
                </span>
              </div>
              <Progress value={progress?.percent ?? 0} />
              <p className="text-[11px] text-muted-foreground">
                После загрузки запустится установщик, приложение закроется.
              </p>
            </div>
          )}

          {updateInfo?.notes && updateInfo.updateAvailable && (
            <div className="rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Что нового
              </p>
              <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-muted-foreground">
                {updateInfo.notes.slice(0, 600)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
