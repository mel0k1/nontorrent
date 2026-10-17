import { useAppState } from "@/hooks/use-app-state";
import { EmptyState } from "./empty-state";
import { TorrentRow } from "./torrent-row";

export function TorrentList({ onAdd }: { onAdd: () => void }) {
  const { torrents, query } = useAppState();

  const filtered = torrents.filter((t) =>
    query.trim()
      ? t.name.toLowerCase().includes(query.trim().toLowerCase())
      : true
  );

  if (filtered.length === 0) {
    return query.trim() ? (
      <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        Ничего не найдено по запросу «{query.trim()}»
      </div>
    ) : (
      <EmptyState onAdd={onAdd} />
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((t) => (
        <TorrentRow key={t.id} torrent={t} />
      ))}
    </div>
  );
}
