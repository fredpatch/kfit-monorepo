import { createServer } from "node:http";
import { createServerApp } from "../../dist/app.js";
import { AuthController } from "../../dist/modules/auth/controllers/auth.controller.js";
import { clearAuthCookies } from "../../dist/modules/auth/services/auth-route.service.js";
import { authCookieNames } from "../../dist/modules/auth/middleware/auth.cookies.js";

const port = Number(process.env.AUTH_STAGING_SMOKE_PORT || 3001);

const session = {
  userId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  role: "coach",
  freshOtpConsumedAt: new Date("2026-08-25T08:00:00Z"),
};

function cookieOptions(maxAgeSeconds) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    ...(maxAgeSeconds === undefined ? {} : { maxAgeSeconds }),
  };
}

function csrfCookieOptions() {
  return { httpOnly: false, secure: true, sameSite: "lax", path: "/" };
}

function authCookies() {
  return [
    { name: authCookieNames.accessToken, value: "staging-smoke-access", options: cookieOptions(900) },
    { name: authCookieNames.refreshToken, value: "staging-smoke-refresh", options: cookieOptions(604800) },
    { name: authCookieNames.csrfToken, value: "staging-smoke-csrf", options: csrfCookieOptions() },
  ];
}

function resolveSession(request) {
  const cookieHeader = request.headers.cookie || "";
  return cookieHeader.includes(`${authCookieNames.accessToken}=`) ? session : null;
}

const controller = new AuthController({
  bootstrapService: {
    async status() { return { required: false }; },
    async create() { return { status: "already_completed" }; },
  },
  authRouteService: {
    async login() {
      return {
        status: "authenticated",
        body: { user: { id: session.userId, role: session.role }, session: { id: session.sessionId, freshOtp: false } },
        cookies: authCookies(),
      };
    },
    async refresh() {
      return {
        status: "authenticated",
        body: { user: { id: session.userId, role: session.role }, session: { id: session.sessionId, freshOtp: false } },
        cookies: authCookies(),
      };
    },
    async logout() { return { status: "logged_out", cookies: clearAuthCookies("production") }; },
  },
  otpChallengeService: {
    async issue() {
      return {
        code: "123456",
        challenge: { id: "00000000-0000-0000-0000-000000000001", deliveryChannel: "email", expiresAt: new Date(Date.now() + 300000) },
      };
    },
    async verify() {
      return { status: "verified", challenge: { id: "00000000-0000-0000-0000-000000000001", consumedAt: new Date() } };
    },
  },
});

const app = createServerApp({ authController: controller, resolveAuthSession: resolveSession });
const server = createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`K'FIT auth staging smoke server listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { server.close(() => process.exit(0)); });
}
