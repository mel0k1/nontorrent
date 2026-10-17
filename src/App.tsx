import { useState } from "react";
import { AddTorrentDialog } from "@/components/app/add-torrent-dialog";
import { SecurityView } from "@/components/app/security-view";
import { SettingsView } from "@/components/app/settings-view";
import { Sidebar } from "@/components/app/sidebar";
import { StatusBar } from "@/components/app/status-bar";
import { Topbar } from "@/components/app/topbar";
import { TorrentList } from "@/components/app/torrent-list";
import { AppProvider, useAppState } from "@/hooks/use-app-state";

function Shell() {
  const [addOpen, setAddOpen] = useState(false);
  const { view } = useAppState();

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onAdd={() => setAddOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
            {view === "downloads" && (
              <TorrentList onAdd={() => setAddOpen(true)} />
            )}
            {view === "security" && <SecurityView />}
            {view === "settings" && <SettingsView />}
          </div>
        </main>
        <StatusBar />
      </div>

      <AddTorrentDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
