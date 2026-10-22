import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App.js";
import { queryClient } from "./app/query-client.js";
import { Toaster } from "./components/ui/toaster.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import "./styles/index.css";
import "./styles/legacy.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("K'FIT client root element is missing");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <App />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
