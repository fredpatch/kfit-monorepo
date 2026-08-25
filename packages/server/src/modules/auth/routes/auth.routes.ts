import type { AuthRouteDefinition } from "../types/auth.http.types.js";

export const authRoutes: AuthRouteDefinition[] = [
  {
    method: "GET",
    path: "/auth/session",
    handler: "currentSession",
    requiresAuth: true,
    requiresCsrf: false,
  },
  {
    method: "POST",
    path: "/auth/otp/sensitive-action",
    handler: "requestSensitiveActionOtp",
    requiresAuth: true,
    requiresCsrf: true,
  },
  {
    method: "POST",
    path: "/auth/otp/sensitive-action/verify",
    handler: "verifySensitiveActionOtp",
    requiresAuth: true,
    requiresCsrf: true,
  },
];
