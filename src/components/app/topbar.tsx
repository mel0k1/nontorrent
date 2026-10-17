import {
  ArrowDown,
  ArrowUp,
  Globe,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppState } from "@/hooks/use-app-state";
import { fmtSpeed } from "@/lib/format";

const TITLES: Record<string, string> = {
  downloads: "Загрузки",
  security: "Безопасность",
  settings: "Настройки",
};

function StatPill({
  icon,
  text,
  className,
}: {
  icon: React.ReactNode;
  text: string;
  className?: string;
}) {
  return (
    <div
      className={
        "hidden h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground lg:flex " +
        (className ?? "")
      }
    >
      {icon}
      <span className="tabular-nums">{text}</span>
    </div>
  );
}

export function Topbar({ onAdd }: { onAdd: () => void }) {
  const { view, query, setQuery, stats } = useAppState();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/60 px-4 backdrop-blur md:px-6">
      <h1 className="text-sm font-semibold tracking-tight">
        {TITLES[view] ?? view}
      </h1>

      {view === "downloads" && (
        <div className="relative ml-2 w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по раздачам…"
            className="h-8 border-0 bg-secondary/60 pl-8 focus-visible:ring-1"
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <StatPill
          icon={<ArrowDown className="h-3.5 w-3.5 text-primary" />}
          text={fmtSpeed(stats.downBytesPerSec)}
        />
        <StatPill
          icon={<ArrowUp className="h-3.5 w-3.5 text-success" />}
          text={fmtSpeed(stats.upBytesPerSec)}
        />
        <StatPill
          icon={<Globe className="h-3.5 w-3.5" />}
          text={`DHT: ${stats.dhtNodes}`}
        />
        <Button onClick={onAdd} size="sm" className="ml-1 gap-1.5">
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </div>
    </header>
  );
}
