import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppState } from "@/hooks/use-app-state";

export function AddTorrentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addTorrent, api } = useAppState();
  const [source, setSource] = useState("");
  const [scan, setScan] = useState(true);
  const [busy, setBusy] = useState(false);

  const canSubmit = source.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await addTorrent(source.trim(), scan);
      setSource("");
      setScan(true);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  async function browse() {
    const path = await api.pickTorrentFile();
    if (path) setSource(path);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Добавить торрент</DialogTitle>
          <DialogDescription>
            .torrent-файл или magnet-ссылка. Проверка безопасности начнётся
            до завершения загрузки — по мере готовности файлов.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source">Источник</Label>
            <div className="flex gap-2">
              <Input
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="magnet:?xt=urn:btih:… или /path/to/file.torrent"
                className="font-mono text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
              />
              {!api.isDemo && (
                <Button variant="outline" onClick={browse} className="shrink-0 gap-1.5">
                  <FolderOpen className="h-4 w-4" />
                  Обзор…
                </Button>
              )}
            </div>
            {api.isDemo && (
              <p className="text-xs text-muted-foreground">
                В браузерном предпросмотре работает демо-движок — добавление
                создаст тестовую раздачу.
              </p>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border bg-secondary/40 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="scan-toggle" className="cursor-pointer">
                Проверять на вирусы во время скачивания
              </Label>
              <p className="text-xs text-muted-foreground">
                Файлы проверяются по мере скачивания — не дожидаясь конца
                раздачи. Как именно — в разделе «Безопасность».
              </p>
            </div>
            <Switch
              id="scan-toggle"
              checked={scan}
              onCheckedChange={setScan}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Добавляем…" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
