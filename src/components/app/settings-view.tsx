import { useEffect, useState } from "react";
import {
  Fingerprint,
  FolderOpen,
  Gauge,
  HardDrive,
  Info,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { useAppState } from "@/hooks/use-app-state";
import type { Settings as SettingsType } from "@/types";

export function SettingsView() {
  const { settings, saveSettings, api } = useAppState();
  const [draft, setDraft] = useState<SettingsType>(settings);
  const [down, setDown] = useState(settings.maxDownMbps?.toString() ?? "");
  const [up, setUp] = useState(settings.maxUpMbps?.toString() ?? "");

  useEffect(() => {
    setDraft(settings);
    setDown(settings.maxDownMbps?.toString() ?? "");
    setUp(settings.maxUpMbps?.toString() ?? "");
  }, [settings]);

  function collect(): SettingsType {
    return {
      ...draft,
      maxDownMbps: down.trim() === "" ? null : Number(down.replace(",", ".")),
      maxUpMbps: up.trim() === "" ? null : Number(up.replace(",", ".")),
    };
  }

  const numOk = (v: string) =>
    v.trim() === "" || (!Number.isNaN(Number(v.replace(",", "."))) && Number(v.replace(",", ".")) >= 0);

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
              <Label htmlFor="vtkey">Ключ VirusTotal API</Label>
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
            Сохранить
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
