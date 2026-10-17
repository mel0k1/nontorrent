import { Download, Magnet, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/lib/utils";

const NAV = [
  { id: "downloads", label: "Загрузки", icon: Download },
  { id: "security", label: "Безопасность", icon: ShieldCheck },
  { id: "settings", label: "Настройки", icon: SettingsIcon },
] as const;

export function Sidebar() {
  const { view, setView, torrents, scanLog } = useAppState();

  const activeCount = torrents.filter(
    (t) => t.status === "downloading" || t.status === "checking"
  ).length;
  const threats = scanLog.filter(
    (e) => e.verdict === "malicious" && !e.quarantined
  ).length;

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-card/40 md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
          <Magnet className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-none tracking-tight">
            NonTorrent
          </p>
          <p className="mt-1 text-[11px] leading-none text-muted-foreground">
            качает и проверяет
          </p>
        </div>
      </div>

      <nav className="mt-3 flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = view === item.id;
          const badge =
            item.id === "downloads" && activeCount > 0
              ? activeCount
              : item.id === "security" && threats > 0
                ? threats
                : null;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {badge != null && (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none",
                    item.id === "security"
                      ? "bg-destructive/20 text-destructive"
                      : "bg-primary/20 text-primary"
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
