import { useMemo, useState } from "react";
import { ArrowDownUp, SearchX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { TorrentRow } from "./torrent-row";
import type { Torrent } from "@/types";

type Filter = "all" | "active" | "paused" | "done" | "threats";
type Sort = "added" | "name" | "progress" | "speed" | "size";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "paused", label: "Пауза" },
  { id: "done", label: "Готовые" },
  { id: "threats", label: "Угрозы" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "added", label: "По дате добавления" },
  { id: "name", label: "По имени" },
  { id: "progress", label: "По прогрессу" },
  { id: "speed", label: "По скорости" },
  { id: "size", label: "По размеру" },
];

function matches(t: Torrent, f: Filter): boolean {
  switch (f) {
    case "all":
      return true;
    case "active":
      return t.status === "downloading" || t.status === "checking";
    case "paused":
      return t.status === "paused";
    case "done":
      return t.status === "seeding" || t.progress >= 100;
    case "threats":
      return t.scan?.verdict === "malicious" || t.scan?.verdict === "suspicious";
  }
}

export function TorrentList({ onAdd }: { onAdd: () => void }) {
  const { torrents, query, setSelectedTorrentId } = useAppState();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("added");

  const threats = torrents.filter(
    (t) => t.scan?.verdict === "malicious" || t.scan?.verdict === "suspicious"
  ).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byQuery = torrents.filter((t) =>
      q ? t.name.toLowerCase().includes(q) : true
    );
    const byFilter = byQuery.filter((t) => matches(t, filter));

    const sorted = [...byFilter];
    switch (sort) {
      case "added":
        sorted.sort((a, b) => b.addedAt - a.addedAt);
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "ru"));
        break;
      case "progress":
        sorted.sort((a, b) => b.progress - a.progress);
        break;
      case "speed":
        sorted.sort((a, b) => b.downSpeed + b.upSpeed - (a.downSpeed + a.upSpeed));
        break;
      case "size":
        sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
        break;
    }
    return sorted;
  }, [torrents, query, filter, sort]);

  if (torrents.length === 0) {
    return <EmptyState onAdd={onAdd} />;
  }

  return (
    <div className="space-y-3">
      {/* Фильтры + сортировка */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                filter === f.id
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              {f.label}
              {f.id === "threats" && threats > 0 && filter !== "threats" && (
                <span className="rounded-full bg-destructive/20 px-1.5 text-[10px] font-semibold leading-4 text-destructive">
                  {threats}
                </span>
              )}
            </button>
          ))}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-auto flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {SORTS.find((s) => s.id === sort)?.label}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Сортировка
            </DropdownMenuLabel>
            {SORTS.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => setSort(s.id)}
                className={cn(sort === s.id && "bg-accent/50")}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Список */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <SearchX className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? `Ничего не найдено по запросу «${query.trim()}»`
              : "Под выбранный фильтр ничего не подошло"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <TorrentRow
              key={t.id}
              torrent={t}
              onOpen={() => setSelectedTorrentId(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
