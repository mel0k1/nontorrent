import { Download, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/lib/utils";

const NAV = [
  { id: "downloads", label: "Загрузки", icon: Download },
  { id: "security", label: "Безопасность", icon: ShieldCheck },
  { id: "settings", label: "Настройки", icon: SettingsIcon },
] as const;

/**
 * Нижняя панель навигации: узкий док вместо боковой панели.
 * Слева — логотип NonTorrent, правее — переключение разделов с бейджами.
 */
export function BottomNav() {
  const { view, setView, torrents, scanLog } = useAppState();

  const activeCount = torrents.filter(
    (t) => t.status === "downloading" || t.status === "checking"
  ).length;
  const threats = scanLog.filter(
    (e) => e.verdict === "malicious" && !e.quarantined
  ).length;

  return (
    <footer className="flex h-12 shrink-0 items-center gap-2 border-t bg-card/60 px-3">
      <div className="mr-2 flex shrink-0 items-center gap-2">
        <img
          src="/nontorrent-logo.png"
          alt=""
          aria-hidden
          className="h-6 w-6 rounded-md ring-1 ring-border"
          draggable={false}
        />
        <span className="hidden text-xs font-semibold tracking-tight sm:block">
          NonTorrent
        </span>
      </div>

      <nav className="flex items-center gap-1">
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
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden md:block">{item.label}</span>
              {badge != null && (
                <span
                  className={cn(
                    "min-w-4 rounded-full px-1 py-0.5 text-center text-[10px] font-semibold leading-none",
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
    </footer>
  );
}
