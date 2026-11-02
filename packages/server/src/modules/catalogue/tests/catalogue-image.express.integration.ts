import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import express from "express";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import sharp from "sharp";
import {
  catalogueApiRoutes,
  catalogueImageAltHeader,
  catalogueImageRightsHeader,
  encodeCatalogueImageAlt,
  type CataloguePublicServicesResponse,
  type CatalogueServiceImageResponse,
} from "@kfit/shared";
import { db, pool } from "../../../db/client.js";
import { pgErrorInfo } from "../../../db/pg-error.js";
import { auditEvents, users } from "../../../db/schema/auth.js";
import { serviceImages, services } from "../../../db/schema/catalogue.js";
import {
  assertLocalTestDatabase,
  testFixtureName,
} from "../../../testing/integration-fixtures.js";
import { authCookieNames } from "../../auth/middleware/auth.cookies.js";
import type { AuthenticatedSessionContext } from "../../auth/types/auth.http.types.js";
import { PrivateDocumentStorage } from "../../documents/services/document-storage.service.js";
import { CatalogueController } from "../controllers/catalogue.controller.js";
import { CatalogueImagesController } from "../controllers/catalogue-images.controller.js";
import { DrizzleCatalogueRepository } from "../repositories/catalogue.repositories.js";
import { DrizzleCatalogueImageRepository } from "../repositories/catalogue-image.repository.js";
import { createExpressCatalogueRouter } from "../routes/express-catalogue.router.js";
import { createExpressCatalogueImagesRouter } from "../routes/express-catalogue-images.router.js";
import { CatalogueImageFiles } from "../services/catalogue-image-files.js";
import { CatalogueImageService } from "../services/catalogue-image.service.js";
import { CatalogueService } from "../services/catalogue.service.js";
import { IpRateLimiter } from "../../requests/services/ip-rate-limiter.js";

/* CAT-04 on kfit_test. Synthetic images generated here; the antivirus is stubbed (no ClamAV in tests). */

const userId = randomUUID();
const admin: AuthenticatedSessionContext = {
  userId,
  sessionId: randomUUID(),
  role: "admin",
};
const csrf = "synthetic-cat04-csrf";
const writeHeaders = {
  cookie: `${authCookieNames.csrfToken}=${csrf}`,
  "x-csrf-token": csrf,
};
const slugPrefix = `cat04-${randomUUID().slice(0, 8)}`;
let safe = false;
let root = "";
let url = "";
let server: ReturnType<typeof createServer> | null = null;
let photo: Buffer;

async function insertService(
  suffix: string,
  published: boolean,
): Promise<string> {
  const [row] = await db
    .insert(services)
    .values({
      name: testFixtureName(`Offre photo ${suffix}`),
      slug: `${slugPrefix}-${suffix}`,
      pricingMode: "quote",
      deliveryType: "one_time",
      isPublic: published,
      publishedAt: published ? new Date() : null,
    })
    .returning({ id: services.id });
  return row!.id;
}

before(async () => {
  assertLocalTestDatabase();
  safe = true;
  root = await mkdtemp(path.join(tmpdir(), "kfit-cat04-it-"));
  photo = await sharp({
    create: { width: 1300, height: 900, channels: 3, background: "#3e8e41" },
  })
    .jpeg()
    .toBuffer();
  await db.insert(users).values({
    id: userId,
    email: `cat04-${userId}@example.invalid`,
    passwordHash: "synthetic",
    role: "admin",
    status: "active",
  });
  const storage = new PrivateDocumentStorage({ root });
  const app = express();
  app.use(express.json());
  app.use(
    createExpressCatalogueRouter({
      controller: new CatalogueController(
        new CatalogueService(new DrizzleCatalogueRepository(db)),
      ),
      resolveSession: () => admin,
    }),
  );
  app.use(
    createExpressCatalogueImagesRouter({
      controller: new CatalogueImagesController(
        new CatalogueImageService(
          new DrizzleCatalogueImageRepository(db, {
            auditHashPepper: "synthetic-cat04-pepper",
          }),
          new CatalogueImageFiles({
            root: storage.root,
            validate: storage.validate.bind(storage),
            scan: async () => undefined,
          }),
        ),
      ),
      resolveSession: (req) => (req.headers["x-test-anonymous"] ? null : admin),
    }),
  );
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  try {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (safe) {
      const ours = await db
        .select({ id: services.id })
        .from(services)
        .where(like(services.slug, `${slugPrefix}%`));
      const ids = ours.map((row) => row.id);
      if (ids.length) {
        const images = await db
          .select({ id: serviceImages.id })
          .from(serviceImages)
          .where(inArray(serviceImages.serviceId, ids));
        if (images.length)
          await db.delete(auditEvents).where(
            inArray(
              auditEvents.entityId,
              images.map((row) => row.id),
            ),
          );
        await db
          .delete(serviceImages)
          .where(inArray(serviceImages.serviceId, ids));
        await db.delete(services).where(inArray(services.id, ids));
      }
      await db.delete(users).where(eq(users.id, userId));
    }
    if (root) await rm(root, { recursive: true, force: true });
  } finally {
    await pool.end();
  }
});

const imageRoute = (serviceId: string) =>
  url + catalogueApiRoutes.adminServiceImage.replace(":serviceId", serviceId);

function upload(
  serviceId: string,
  options: {
    alt?: string | null;
    rights?: string | null;
    bytes?: Buffer;
    csrf?: boolean;
  } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "image/jpeg",
    ...(options.csrf === false ? {} : writeHeaders),
  };
  if (options.alt !== null)
    headers[catalogueImageAltHeader] = encodeCatalogueImageAlt(
      options.alt ?? "La coach prépare une assiette « équilibrée »",
    );
  if (options.rights !== null)
    headers[catalogueImageRightsHeader] = options.rights ?? "confirmed";
  return fetch(imageRoute(serviceId), {
    method: "PUT",
    headers,
    body: new Uint8Array(options.bytes ?? photo),
  });
}

async function uploaded(serviceId: string) {
  const response = await upload(serviceId);
  assert.equal(response.status, 200);
  return ((await response.json()) as CatalogueServiceImageResponse).image;
}

const publicFile = (imageId: string, size = "large") =>
  `${url}/public/catalogue/images/${imageId}-${size}.webp`;
const adminFile = (imageId: string, size = "large") =>
  `${url}/admin/catalogue/images/${imageId}-${size}.webp`;

async function exists(file: string) {
  return access(path.join(root, file)).then(
    () => true,
    () => false,
  );
}

test("CAT-04 upload: one active row, two files under catalogue/, ids-only audit, public list carries the image", async () => {
  const serviceId = await insertService("published", true);
  const image = await uploaded(serviceId);
  assert.equal(image.altText, "La coach prépare une assiette « équilibrée »");
  assert.deepEqual([image.width, image.height], [1600, 1000]);
  assert.match(image.urls.card, /^\/admin\/catalogue\/images\//);

  const rows = await db
    .select()
    .from(serviceImages)
    .where(eq(serviceImages.serviceId, serviceId));
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.equal(row.removedAt, null);
  assert.equal(row.rightsConfirmedBy, userId);
  assert.ok(row.rightsConfirmedAt instanceof Date);
  assert.match(row.sha256, /^[0-9a-f]{64}$/);
  assert.equal(await exists(row.cardStorageKey), true);
  assert.equal(await exists(row.largeStorageKey), true);

  const [audit] = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityId, image.id),
        eq(auditEvents.eventType, "catalogue.image_set"),
      ),
    );
  assert.deepEqual(Object.keys(audit!.metadataJson as object).sort(), [
    "cardSizeBytes",
    "height",
    "imageId",
    "largeSizeBytes",
    "replacedImageId",
    "serviceId",
    "width",
  ]);
  assert.equal(
    JSON.stringify(audit!.metadataJson).includes("assiette"),
    false,
    "no description in the audit",
  );

  const list = (await (
    await fetch(url + catalogueApiRoutes.publicServices)
  ).json()) as CataloguePublicServicesResponse;
  const listed = list.services.find((service) => service.id === serviceId);
  assert.equal(
    listed?.image?.urls.large,
    `/public/catalogue/images/${image.id}-large.webp`,
  );
});

test("CAT-04 public route: 200 with fixed headers for a published offer; unknown size or file 404", async () => {
  const serviceId = await insertService("headers", true);
  const image = await uploaded(serviceId);
  const response = await fetch(publicFile(image.id));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(response.headers.get("content-disposition"), "inline");
  const meta = await sharp(
    Buffer.from(await response.arrayBuffer()),
  ).metadata();
  assert.deepEqual(
    [meta.format, meta.width, meta.height],
    ["webp", 1600, 1000],
  );
  assert.equal(
    (await fetch(publicFile(image.id, "card"))).status,
    200,
    "card size",
  );
  for (const missing of [
    publicFile(image.id, "huge"),
    publicFile(randomUUID()),
    `${url}/public/catalogue/images/${image.id}.webp`,
  ])
    assert.equal((await fetch(missing)).status, 404, missing);
});

test("CAT-04 draft offer: public 404, admin preview 200 (private), preview needs a session", async () => {
  const serviceId = await insertService("draft", false);
  const image = await uploaded(serviceId);
  assert.equal((await fetch(publicFile(image.id))).status, 404);
  const preview = await fetch(adminFile(image.id));
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "private, no-store");
  assert.equal(preview.headers.get("content-type"), "image/webp");
  assert.equal(
    (
      await fetch(adminFile(image.id), {
        headers: { "x-test-anonymous": "1" },
      })
    ).status,
    401,
  );
});

test("CAT-04 replace and « Retirer »: old row removed_at set, old files deleted, old URL 404", async () => {
  const serviceId = await insertService("replace", true);
  const first = await uploaded(serviceId);
  const [firstRow] = await db
    .select()
    .from(serviceImages)
    .where(eq(serviceImages.id, first.id));
  const second = await uploaded(serviceId);
  assert.notEqual(second.id, first.id);

  const [old] = await db
    .select()
    .from(serviceImages)
    .where(eq(serviceImages.id, first.id));
  assert.ok(old!.removedAt instanceof Date);
  assert.equal(await exists(firstRow!.cardStorageKey), false);
  assert.equal(await exists(firstRow!.largeStorageKey), false);
  assert.equal((await fetch(publicFile(first.id))).status, 404);
  assert.equal((await fetch(publicFile(second.id))).status, 200);
  const [replacedAudit] = await db
    .select({ metadata: auditEvents.metadataJson })
    .from(auditEvents)
    .where(eq(auditEvents.entityId, second.id));
  assert.equal(
    (replacedAudit!.metadata as { replacedImageId: string }).replacedImageId,
    first.id,
  );

  const [secondRow] = await db
    .select()
    .from(serviceImages)
    .where(eq(serviceImages.id, second.id));
  const removed = await fetch(imageRoute(serviceId), {
    method: "DELETE",
    headers: writeHeaders,
  });
  assert.equal(removed.status, 200);
  assert.deepEqual(await removed.json(), { removed: true });
  assert.equal(
    (
      await db
        .select()
        .from(serviceImages)
        .where(
          and(
            eq(serviceImages.serviceId, serviceId),
            isNull(serviceImages.removedAt),
          ),
        )
    ).length,
    0,
  );
  assert.equal(await exists(secondRow!.largeStorageKey), false);
  assert.equal((await fetch(publicFile(second.id))).status, 404);
  const [removedAudit] = await db
    .select({ metadata: auditEvents.metadataJson })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entityId, second.id),
        eq(auditEvents.eventType, "catalogue.image_removed"),
      ),
    );
  assert.deepEqual(removedAudit!.metadata, {
    serviceId,
    imageId: second.id,
  });

  const again = await fetch(imageRoute(serviceId), {
    method: "DELETE",
    headers: writeHeaders,
  });
  assert.equal(again.status, 404);
  assert.deepEqual(await again.json(), { error: "CATALOGUE_IMAGE_NOT_FOUND" });
});

test("CAT-04 archived offer: public URL 404, files kept, upload and « Retirer » refused", async () => {
  const serviceId = await insertService("archived", true);
  const image = await uploaded(serviceId);
  const [row] = await db
    .select()
    .from(serviceImages)
    .where(eq(serviceImages.id, image.id));
  await db
    .update(services)
    .set({
      archivedAt: new Date(),
      availabilityStatus: "archived",
      isPublic: false,
    })
    .where(eq(services.id, serviceId));
  assert.equal((await fetch(publicFile(image.id))).status, 404);
  assert.equal(await exists(row!.largeStorageKey), true, "files kept");
  const refused = await upload(serviceId);
  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), {
    error: "CATALOGUE_SERVICE_ARCHIVED",
  });
  const retire = await fetch(imageRoute(serviceId), {
    method: "DELETE",
    headers: writeHeaders,
  });
  assert.equal(retire.status, 409);
});

test("CAT-04 refusals: description, rights, CSRF, too small, unknown offer", async () => {
  const serviceId = await insertService("refusals", true);
  const cases: Array<[Response, number, string]> = [
    [
      await upload(serviceId, { alt: null }),
      400,
      "CATALOGUE_IMAGE_ALT_REQUIRED",
    ],
    [
      await upload(serviceId, { alt: "x".repeat(151) }),
      400,
      "CATALOGUE_IMAGE_ALT_REQUIRED",
    ],
    [
      await upload(serviceId, { rights: null }),
      400,
      "CATALOGUE_IMAGE_RIGHTS_REQUIRED",
    ],
    [await upload(serviceId, { csrf: false }), 403, "AUTH_CSRF_INVALID"],
    [
      await upload(serviceId, {
        bytes: await sharp({
          create: { width: 800, height: 600, channels: 3, background: "#fff" },
        })
          .jpeg()
          .toBuffer(),
      }),
      422,
      "CATALOGUE_IMAGE_TOO_SMALL",
    ],
    [
      await upload(serviceId, { bytes: Buffer.from("%PDF-1.7 synthetic") }),
      422,
      "DOCUMENT_FILE_SIGNATURE_INVALID",
    ],
    [await upload(randomUUID()), 404, "CATALOGUE_SERVICE_NOT_FOUND"],
  ];
  for (const [response, status, error] of cases) {
    assert.equal(response.status, status, error);
    assert.deepEqual(await response.json(), { error });
  }
  assert.equal(
    (
      await db
        .select()
        .from(serviceImages)
        .where(eq(serviceImages.serviceId, serviceId))
    ).length,
    0,
  );
});

test("CAT-04 constraint: at most one active image per offer (service_images_one_active_uq)", async () => {
  const serviceId = await insertService("constraint", true);
  const image = await uploaded(serviceId);
  const [row] = await db
    .select()
    .from(serviceImages)
    .where(eq(serviceImages.id, image.id));
  const { id: _id, removedAt: _removed, ...copy } = row!;
  await assert.rejects(
    db.insert(serviceImages).values({ ...copy, id: randomUUID() }),
    (error: unknown) =>
      pgErrorInfo(error)?.constraint === "service_images_one_active_uq",
  );
});

/** A second router on the same storage and database, with its own session and limiter. */
async function withImagesRouter(
  options: {
    session: AuthenticatedSessionContext;
    maxPerWindow?: number;
    onRefused?: () => void;
  },
  run: (base: string) => Promise<void>,
) {
  const storage = new PrivateDocumentStorage({ root });
  const app = express();
  app.use(
    createExpressCatalogueImagesRouter({
      controller: new CatalogueImagesController(
        new CatalogueImageService(
          new DrizzleCatalogueImageRepository(db, {
            auditHashPepper: "synthetic-cat04-pepper",
          }),
          new CatalogueImageFiles({
            root: storage.root,
            validate: storage.validate.bind(storage),
            scan: async () => undefined,
          }),
        ),
      ),
      resolveSession: () => options.session,
      rateLimiter: new IpRateLimiter({
        windowMs: 60_000,
        maxPerWindow: options.maxPerWindow ?? 100,
        onRefused: options.onRefused,
      }),
    }),
  );
  const local = createServer(app);
  local.listen(0, "127.0.0.1");
  await once(local, "listening");
  try {
    await run(`http://127.0.0.1:${(local.address() as AddressInfo).port}`);
  } finally {
    local.closeAllConnections();
    await new Promise<void>((resolve) => local.close(() => resolve()));
  }
}

const sendPhoto = (base: string, serviceId: string) =>
  fetch(
    base +
      catalogueApiRoutes.adminServiceImage.replace(":serviceId", serviceId),
    {
      method: "PUT",
      headers: {
        "content-type": "image/jpeg",
        ...writeHeaders,
        [catalogueImageAltHeader]: encodeCatalogueImageAlt("Description"),
        [catalogueImageRightsHeader]: "confirmed",
      },
      body: new Uint8Array(photo),
    },
  );

test("CAT-04 K5: the upload route is rate limited per IP (429 CATALOGUE_RATE_LIMITED, refusal counted)", async () => {
  const serviceId = await insertService("limited", true);
  let refused = 0;
  await withImagesRouter(
    { session: admin, maxPerWindow: 1, onRefused: () => (refused += 1) },
    async (base) => {
      assert.equal((await sendPhoto(base, serviceId)).status, 200);
      const limited = await sendPhoto(base, serviceId);
      assert.equal(limited.status, 429);
      assert.deepEqual(await limited.json(), {
        error: "CATALOGUE_RATE_LIMITED",
      });
    },
  );
  assert.equal(refused, 1);
});

test("CAT-04 a non-admin session cannot upload, remove or preview (403 CATALOGUE_ADMIN_FORBIDDEN)", async () => {
  const serviceId = await insertService("forbidden", false);
  const image = await uploaded(serviceId);
  await withImagesRouter(
    { session: { ...admin, role: "coach" } },
    async (base) => {
      const route =
        base +
        catalogueApiRoutes.adminServiceImage.replace(":serviceId", serviceId);
      const responses = [
        await sendPhoto(base, serviceId),
        await fetch(route, { method: "DELETE", headers: writeHeaders }),
        await fetch(`${base}/admin/catalogue/images/${image.id}-large.webp`),
      ];
      for (const response of responses) {
        assert.equal(response.status, 403);
        assert.deepEqual(await response.json(), {
          error: "CATALOGUE_ADMIN_FORBIDDEN",
        });
      }
    },
  );
  const [row] = await db
    .select()
    .from(serviceImages)
    .where(eq(serviceImages.id, image.id));
  assert.equal(row!.removedAt, null, "the photo is still there");
});
