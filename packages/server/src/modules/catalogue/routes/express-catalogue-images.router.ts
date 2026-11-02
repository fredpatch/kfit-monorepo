import { randomUUID } from "node:crypto";
import {
  Router,
  raw,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  catalogueApiRoutes,
  catalogueImageAltHeader,
  catalogueImageMimeTypes,
  catalogueImageRightsHeader,
} from "@kfit/shared";
import { parseCookieHeader } from "../../auth/middleware/auth.cookies.js";
import {
  requireCsrf,
  requireSameOrigin,
} from "../../auth/middleware/auth.middleware.js";
import type { ExpressAuthSessionResolver } from "../../auth/routes/express-auth.router.js";
import type { AuthHttpRequestContext } from "../../auth/types/auth.http.types.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";
import type { CatalogueImagesController } from "../controllers/catalogue-images.controller.js";
import type { HttpJsonResponse } from "../types/catalogue.http.types.js";

/* CAT-04 K2/K4/K5. Upload: raw image bytes (no multipart), the description and the rights confirmation in headers. */

const imageRaw = raw({ type: [...catalogueImageMimeTypes], limit: "11mb" });
/** A body over the parser limit is the same refusal as a file over 10 MB. */
function imageBody(req: Request, res: Response, next: NextFunction) {
  imageRaw(req, res, (error?: unknown) => {
    if (error) {
      res.status(413).json({ error: "DOCUMENT_FILE_TOO_LARGE" });
      return;
    }
    next();
  });
}

const header = (req: Request, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

export function createExpressCatalogueImagesRouter(deps: {
  controller: CatalogueImagesController;
  resolveSession: ExpressAuthSessionResolver;
  rateLimiter?: IpRateLimiter;
  onRateLimited?: (() => void) | undefined;
}) {
  const router = Router();
  const limiter =
    deps.rateLimiter ??
    new IpRateLimiter({
      windowMs: 60_000,
      maxPerWindow: 20,
      onRefused: deps.onRateLimited,
    });

  async function context(req: Request): Promise<AuthHttpRequestContext> {
    const headers: Record<string, string | undefined> = {};
    for (const key of Object.keys(req.headers))
      headers[key.toLowerCase()] = header(req, key);
    return {
      requestId: headers["x-request-id"] ?? randomUUID(),
      method: req.method.toUpperCase() as AuthHttpRequestContext["method"],
      path: req.path,
      headers,
      cookies: parseCookieHeader(headers.cookie),
      session: await deps.resolveSession(req),
      ipAddress: req.ip ?? null,
      userAgent: headers["user-agent"] ?? null,
    };
  }
  const json = (res: Response, result: HttpJsonResponse) =>
    res.status(result.status).json(result.body);
  const serviceId = (req: Request) =>
    typeof req.params.serviceId === "string" ? req.params.serviceId : "";
  const file = (req: Request) =>
    typeof req.params.file === "string" ? req.params.file : "";

  async function write(
    req: Request,
    res: Response,
    run: (ctx: AuthHttpRequestContext) => Promise<HttpJsonResponse>,
  ) {
    try {
      const ctx = await context(req);
      const guard = requireSameOrigin(ctx) ?? requireCsrf(ctx);
      if (guard) return json(res, guard);
      json(res, await run(ctx));
    } catch {
      res.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  }

  router.put(
    catalogueApiRoutes.adminServiceImage,
    (req, res, next) => {
      if (limiter.allow(req.ip ?? "unknown")) return next();
      res.status(429).json({ error: "CATALOGUE_RATE_LIMITED" });
    },
    imageBody,
    (req, res) =>
      void write(req, res, (ctx) =>
        deps.controller.upload(ctx, serviceId(req), {
          bytes: req.body,
          mimeType: header(req, "content-type") ?? "",
          altHeader: header(req, catalogueImageAltHeader),
          rightsHeader: header(req, catalogueImageRightsHeader),
        }),
      ),
  );
  router.delete(
    catalogueApiRoutes.adminServiceImage,
    (req, res) =>
      void write(req, res, (ctx) =>
        deps.controller.remove(ctx, serviceId(req)),
      ),
  );

  /* K4: fixed type, never sniffed; the URL holds only the image id and the size. */
  async function serve(req: Request, res: Response, admin: boolean) {
    try {
      const result = await deps.controller.read(
        admin ? await context(req) : null,
        file(req),
      );
      res.set("X-Content-Type-Options", "nosniff");
      if ("bytes" in result) {
        res
          .status(200)
          .set({
            "Content-Type": "image/webp",
            "Content-Disposition": "inline",
            "Cache-Control": admin
              ? "private, no-store"
              : "public, max-age=31536000, immutable",
          })
          .send(result.bytes);
        return;
      }
      res.set("Cache-Control", "no-store");
      json(res, result);
    } catch {
      res.status(500).json({ error: "CATALOGUE_ROUTE_UNEXPECTED_FAILURE" });
    }
  }
  router.get(
    catalogueApiRoutes.publicImage,
    (req, res) => void serve(req, res, false),
  );
  router.get(
    catalogueApiRoutes.adminImage,
    (req, res) => void serve(req, res, true),
  );
  return router;
}
