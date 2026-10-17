import { Magnet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/25">
        <Magnet className="h-7 w-7 text-primary" />
      </div>
      <h2 className="mt-5 text-base font-semibold">
        Пока ничего не качается
      </h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Добавьте .torrent-файл или magnet-ссылку — NonTorrent начнёт
        проверять содержимое ещё до завершения загрузки.
      </p>
      <Button onClick={onAdd} className="mt-5 gap-1.5">
        <Plus className="h-4 w-4" />
        Добавить загрузку
      </Button>
    </div>
  );
}
