export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type AuthenticatedSessionContext = {
  userId: string;
  sessionId: string;
  role: "admin" | "coach";
  freshOtpConsumedAt?: Date | null;
};

export type AuthHttpRequestContext = {
  requestId: string;
  method: HttpMethod;
  path: string;
  cookies: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  ipAddress?: string | null;
  userAgent?: string | null;
  session?: AuthenticatedSessionContext | null;
};

export type HttpJsonResponse<TBody = unknown> = {
  status: number;
  body: TBody;
  cookies?: Array<{
    name: string;
    value: string;
    options: AuthCookieOptions;
  }>;
};

export type AuthCookieOptions = {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax" | "none";
  path: string;
  maxAgeSeconds?: number;
};

export type AuthRouteDefinition = {
  method: HttpMethod;
  path: string;
  handler: string;
  requiresAuth: boolean;
  requiresCsrf: boolean;
};
