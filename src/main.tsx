import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/onest";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/hooks/use-app-state";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider>
      <TooltipProvider delayDuration={150}>
        <App />
        <Toaster position="bottom-right" richColors={false} closeButton />
      </TooltipProvider>
    </AppProvider>
  </React.StrictMode>
);
