import React, { Suspense, lazy } from "react";
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

// DEV-only component gallery (UX-1). The condition is static in production builds, so the module is dropped.
const UiGallery = import.meta.env.DEV ? lazy(() => import("./dev/UiGallery.js").then((m) => ({ default: m.UiGallery }))) : null;
const showGallery = UiGallery !== null && window.location.pathname === "/__ui";

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {showGallery && UiGallery ? (
          <Suspense fallback={null}>
            <UiGallery />
          </Suspense>
        ) : (
          /* Screens not yet rebuilt keep their former look inside .legacy (removed in UX-13). */
          <div className="legacy">
            <App />
          </div>
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
