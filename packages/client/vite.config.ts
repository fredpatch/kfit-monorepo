import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

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
    plugins: [react()],
    server: {
      proxy: {
        "/auth": apiProxy,
        "/catalogue": apiProxy,
        "/admin/catalogue": apiProxy,
        "/health": apiProxy,
      },
    },
  };
});
