import { useCallback, useEffect, useState } from "react";
import {
  Download as DownloadIcon,
  Fingerprint,
  FolderOpen,
  Gauge,
  Info,
  RefreshCw,
  ShieldCheck,
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
import type { Settings as SettingsType, UpdateInfo, UpdateProgress } from "@/types";

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

export function SettingsView() {
  const { settings, saveSettings, api } = useAppState();
  const [draft, setDraft] = useState<SettingsType>(settings);
  const [down, setDown] = useState(settings.maxDownMbps?.toString() ?? "");
  const [up, setUp] = useState(settings.maxUpMbps?.toString() ?? "");

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

  const asset = updateInfo ? pickAsset(updateInfo) : null;

  return (
    <div className="space-y-4">
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
          <div className="flex items-start justify-between gap-4 rounded-md border bg-secondary/30 p-3">
            <div>
              <Label className="cursor-pointer">
                Проверять во время скачивания
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Файл сканируется сразу, как только дописались его куски — не
                дожидаясь конца раздачи.
              </p>
            </div>
            <Switch
              checked={draft.scanWhileDownloading}
              onCheckedChange={(v) =>
                setDraft({ ...draft, scanWhileDownloading: v })
              }
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border bg-secondary/30 p-3">
            <div>
              <Label className="cursor-pointer">
                Автоматический карантин угроз
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Файл с вердиктом «угроза» изолируется в отдельную папку и
                помечается в журнале.
              </p>
            </div>
            <Switch
              checked={draft.quarantineThreats}
              onCheckedChange={(v) =>
                setDraft({ ...draft, quarantineThreats: v })
              }
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border bg-secondary/30 p-3">
            <div>
              <Label className="cursor-pointer">
                Встроенный ключ VirusTotal
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                В приложении зашит общий ключ (обфусцирован в бинарнике).
                Свой ключ в поле ниже имеет приоритет. Отключите, если
                используете только свой.
              </p>
            </div>
            <Switch
              checked={draft.useBuiltInVt}
              onCheckedChange={(v) => setDraft({ ...draft, useBuiltInVt: v })}
            />
          </div>

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
                  {updateInfo?.currentVersion ?? "0.1.0"}
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" />
            Ограничения скорости
          </CardTitle>
          <CardDescription>
            Пусто — без ограничений. Значения в Мбит/с.
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
    </div>
  );
}
