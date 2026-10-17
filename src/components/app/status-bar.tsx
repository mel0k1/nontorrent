import { ArrowDown, ArrowUp } from "lucide-react";
import { useAppState } from "@/hooks/use-app-state";
import { fmtSpeed } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const { stats, api } = useAppState();

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between border-t bg-card/40 px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            api.isDemo ? "bg-warning" : "bg-success animate-pulse"
          )}
        />
        {api.isDemo
          ? "Демо-данные · браузерный предпросмотр интерфейса"
          : `Движок: librqbit · DHT: ${stats.dhtNodes} узлов · раздач: ${stats.torrentCount}`}
      </div>
      <div className="flex items-center gap-3 tabular-nums">
        <span className="flex items-center gap-1">
          <ArrowDown className="h-3 w-3 text-primary" />
          {fmtSpeed(stats.downBytesPerSec)}
        </span>
        <span className="flex items-center gap-1">
          <ArrowUp className="h-3 w-3 text-success" />
          {fmtSpeed(stats.upBytesPerSec)}
        </span>
      </div>
    </footer>
  );
}
