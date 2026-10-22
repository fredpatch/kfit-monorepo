import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function createApiProxy(target: string): ProxyOptions {
  return {
    target,
    configure(proxy) {
      proxy.on("proxyReq", (proxyReq, req) => {
        const forwardedHost = req.headers.host;
        if (forwardedHost) proxyReq.setHeader("x-forwarded-host", forwardedHost);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://127.0.0.1:3000";
  const apiProxy = createApiProxy(apiTarget);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/auth": apiProxy,
        "/catalogue": apiProxy,
        "/admin/catalogue": apiProxy,
        "/admin/requests": apiProxy,
        "/admin/customers": apiProxy,
        "/admin/subscriptions": apiProxy,
        "/admin/appointments": apiProxy,
        "/admin/today": apiProxy,
        "/admin/follow-ups": apiProxy,
        "/admin/goals": apiProxy,
        "/admin/questionnaire-templates": apiProxy,
        "/admin/questionnaire-assignments": apiProxy,
        "/requests": apiProxy,
        "/public/consents": apiProxy,
        "/public/appointments": apiProxy,
        "/public/questionnaires": apiProxy,
        "/public/documents": apiProxy,
        "/admin/documents": apiProxy,
        "/admin/document-versions": apiProxy,
        "/admin/document-delivery-links": apiProxy,
        "/admin/progress-measurements": apiProxy,
        "/health": apiProxy,
      },
    },
  };
});
