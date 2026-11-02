import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { crc32, deflateSync } from "node:zlib";
import sharp from "sharp";
import { encodeCatalogueImageAlt } from "@kfit/shared";
import {
  DocumentStorageError,
  PrivateDocumentStorage,
} from "../../documents/services/document-storage.service.js";
import { CatalogueImageFiles } from "../services/catalogue-image-files.js";
import {
  CatalogueImageError,
  processCatalogueImage,
} from "../services/catalogue-image.pipeline.js";
import {
  CatalogueImageService,
  parseCatalogueImageHeaders,
} from "../services/catalogue-image.service.js";

/* Synthetic fixtures only, generated here (no real photo). */

/** Stored landscape, left half red and right half blue, EXIF orientation 6 (displayed rotated 90°), with GPS and device tags. */
async function phoneJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "#ff0000" },
  })
    .composite([
      {
        input: {
          create: {
            width: 800,
            height: 1200,
            channels: 3,
            background: "#0000ff",
          },
        },
        left: 800,
        top: 0,
      },
    ])
    .jpeg({ quality: 70 })
    .withExif({
      IFD0: { Make: "PhoneCo", Model: "X1" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "0/1 23/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

const solidJpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#3e8e41" } })
    .jpeg()
    .toBuffer();

/** A PNG announcing 8000 × 6000 px (48 MP) with almost no pixel data: the decompression bomb shape. */
function pngBombHeader(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8000, 0);
  ihdr.writeUInt32BE(6000, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(16))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function pixel(webp: Buffer, x: number, y: number) {
  const { data, info } = await sharp(webp)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (y * info.width + x) * info.channels;
  return [data[at]!, data[at + 1]!, data[at + 2]!];
}
const close = (a: number[], b: number[]) =>
  a.every((value, i) => Math.abs(value - b[i]!) <= 40);

async function codeOf(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    if (
      error instanceof CatalogueImageError ||
      error instanceof DocumentStorageError
    )
      return error.code;
    throw error;
  }
  return "accepted";
}

test("CAT-04 pipeline: phone JPEG with GPS + orientation → upright 16:10 WebP at 1600 and 640, no metadata", async () => {
  const input = await phoneJpeg();
  assert.ok(input.length < 50_000, "fixture stays small");
  const inputMeta = await sharp(input).metadata();
  assert.equal(inputMeta.orientation, 6);
  assert.ok(inputMeta.exif?.includes("PhoneCo"), "fixture carries EXIF");

  const out = await processCatalogueImage(input);
  for (const [size, width, height] of [
    ["large", 1600, 1000],
    ["card", 640, 400],
  ] as const) {
    const meta = await sharp(out[size].bytes).metadata();
    assert.equal(meta.format, "webp", size);
    assert.deepEqual([meta.width, meta.height], [width, height], size);
    assert.deepEqual([out[size].width, out[size].height], [width, height]);
    assert.equal(meta.exif, undefined, `${size}: no EXIF (GPS, device)`);
    assert.equal(meta.xmp, undefined, `${size}: no XMP`);
    assert.equal(meta.icc, undefined, `${size}: no ICC`);
    assert.equal(meta.orientation, undefined, `${size}: no orientation tag`);
    assert.equal(
      out[size].bytes.includes("PhoneCo"),
      false,
      `${size}: no device`,
    );
  }
  // Rotated as displayed, the red/blue split is horizontal: each row has one colour from left to right.
  for (const y of [100, 500, 900]) {
    const left = await pixel(out.large.bytes, 20, y);
    const right = await pixel(out.large.bytes, 1580, y);
    assert.ok(close(left, right), `row ${y} is one colour (upright)`);
  }
});

test("CAT-04 pipeline: too small, decompression bomb and undecodable files are refused", async () => {
  assert.equal(
    await codeOf(processCatalogueImage(await solidJpeg(1199, 800))),
    "CATALOGUE_IMAGE_TOO_SMALL",
  );
  assert.equal(
    await codeOf(processCatalogueImage(await solidJpeg(1600, 749))),
    "CATALOGUE_IMAGE_TOO_SMALL",
  );
  assert.equal(
    await codeOf(processCatalogueImage(await solidJpeg(1200, 750))),
    "accepted",
    "the minimum is accepted",
  );
  assert.equal(
    await codeOf(processCatalogueImage(pngBombHeader())),
    "CATALOGUE_IMAGE_TOO_LARGE_PIXELS",
  );
  assert.equal(
    await codeOf(
      processCatalogueImage(
        Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(500, 7)]),
      ),
    ),
    "DOCUMENT_FILE_SIGNATURE_INVALID",
  );
});

test("CAT-04 files: the document checks run first and a wrong signature never reaches the antivirus", async () => {
  let scans = 0;
  const storage = new PrivateDocumentStorage({ root: tmpdir() });
  const files = new CatalogueImageFiles({
    root: storage.root,
    validate: storage.validate.bind(storage),
    scan: async () => {
      scans += 1;
    },
  });
  const pdf = Buffer.from("%PDF-1.7 synthetic");
  assert.equal(
    await codeOf(files.screen(pdf, "image/jpeg")),
    "DOCUMENT_FILE_SIGNATURE_INVALID",
  );
  assert.equal(
    await codeOf(files.screen(pdf, "application/pdf")),
    "DOCUMENT_FILE_TYPE_UNSUPPORTED",
  );
  assert.equal(
    await codeOf(files.screen(Buffer.alloc(0), "image/jpeg")),
    "DOCUMENT_FILE_TOO_LARGE",
  );
  assert.equal(scans, 0);
  assert.equal(
    await codeOf(files.screen(await solidJpeg(1200, 750), "image/jpeg")),
    "accepted",
  );
  assert.equal(scans, 1);
});

test("CAT-04 files: both sizes written under catalogue/, read back, removed; foreign keys refused", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "kfit-cat04-"));
  try {
    const storage = new PrivateDocumentStorage({ root });
    const files = new CatalogueImageFiles(storage);
    const imageId = "7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f";
    const processed = await processCatalogueImage(await solidJpeg(1200, 750));
    const keys = await files.write(imageId, processed);
    assert.deepEqual(keys, {
      card: `catalogue/${imageId}-card.webp`,
      large: `catalogue/${imageId}-large.webp`,
    });
    assert.deepEqual((await readdir(path.join(root, "catalogue"))).sort(), [
      `${imageId}-card.webp`,
      `${imageId}-large.webp`,
    ]);
    assert.ok((await files.read(keys.card)).equals(processed.card.bytes));
    assert.equal(
      await codeOf(files.read("../secret.webp")),
      "DOCUMENT_STORAGE_FAILURE",
    );
    await files.remove(keys);
    assert.deepEqual(await readdir(path.join(root, "catalogue")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CAT-04 headers: description and rights confirmation are required (C7, C8)", () => {
  const alt = encodeCatalogueImageAlt("La coach en séance");
  assert.deepEqual(parseCatalogueImageHeaders(alt, "confirmed"), {
    ok: true,
    value: { altText: "La coach en séance" },
  });
  for (const missing of [
    undefined,
    "",
    encodeCatalogueImageAlt("   "),
    encodeCatalogueImageAlt("x".repeat(151)),
  ])
    assert.deepEqual(parseCatalogueImageHeaders(missing, "confirmed"), {
      ok: false,
      error: "CATALOGUE_IMAGE_ALT_REQUIRED",
    });
  for (const rights of [undefined, "", "true", "Confirmed"])
    assert.deepEqual(parseCatalogueImageHeaders(alt, rights), {
      ok: false,
      error: "CATALOGUE_IMAGE_RIGHTS_REQUIRED",
    });
});

function fakes(options: {
  state?: "service_archived" | null;
  setImage?: "ok" | "throws";
  removeFails?: boolean;
}) {
  const calls: string[] = [];
  const logged: string[] = [];
  const keys = (id: string) => ({
    card: `catalogue/${id}-card.webp`,
    large: `catalogue/${id}-large.webp`,
  });
  const service = new CatalogueImageService(
    {
      serviceState: async () => {
        calls.push("state");
        return options.state ?? null;
      },
      setImage: async (input) => {
        calls.push("setImage");
        if (options.setImage === "throws") throw new Error("db down");
        return {
          ok: true,
          image: {
            id: input.id,
            serviceId: input.serviceId,
            altText: input.altText,
            width: input.width,
            height: input.height,
            updatedAt: new Date("2026-11-02T08:00:00Z"),
          },
          replaced: { id: "old-image", keys: keys("old-image") },
        };
      },
      removeImage: async () => ({
        ok: true,
        removed: { id: "old-image", keys: keys("old-image") },
      }),
      servableKeys: async () => null,
    },
    {
      screen: async () => {
        calls.push("screen");
      },
      write: async (id) => {
        calls.push("write");
        return keys(id);
      },
      read: async () => Buffer.alloc(0),
      remove: async (removed) => {
        calls.push(`remove:${removed.large.slice(10, 19)}`);
        if (options.removeFails) throw new Error("EBUSY");
      },
    },
    (imageId) => logged.push(imageId),
  );
  return { service, calls, logged };
}
const actor = {
  userId: "user-1",
  requestId: "req-1",
  ipAddress: null,
  userAgent: null,
};
const serviceId = "3c2b1a09-8f7e-4d6c-9b5a-1f2e3d4c5b6a";

test("CAT-04 service: a malformed offer id is an unknown offer, before any query", async () => {
  const { service, calls } = fakes({});
  const upload = {
    bytes: Buffer.alloc(1),
    mimeType: "image/jpeg",
    altHeader: encodeCatalogueImageAlt("Description"),
    rightsHeader: "confirmed",
  };
  assert.deepEqual(await service.upload("not-a-uuid", upload, actor), {
    ok: false,
    error: "CATALOGUE_SERVICE_NOT_FOUND",
  });
  assert.deepEqual(await service.remove("not-a-uuid", actor), {
    ok: false,
    error: "CATALOGUE_SERVICE_NOT_FOUND",
  });
  assert.deepEqual(calls, []);
});

test("CAT-04 service: refusals before any file work; checks → processing → write → transaction → old files deleted", async () => {
  const bytes = await solidJpeg(1200, 750);
  const upload = (altHeader: unknown, rightsHeader: unknown) => ({
    bytes,
    mimeType: "image/jpeg",
    altHeader,
    rightsHeader,
  });
  const alt = encodeCatalogueImageAlt("Description");

  const missingAlt = fakes({});
  assert.deepEqual(
    await missingAlt.service.upload(
      serviceId,
      upload(undefined, "confirmed"),
      actor,
    ),
    { ok: false, error: "CATALOGUE_IMAGE_ALT_REQUIRED" },
  );
  assert.deepEqual(missingAlt.calls, []);

  const archived = fakes({ state: "service_archived" });
  assert.deepEqual(
    await archived.service.upload(serviceId, upload(alt, "confirmed"), actor),
    { ok: false, error: "CATALOGUE_SERVICE_ARCHIVED" },
  );
  assert.deepEqual(archived.calls, ["state"]);

  const ok = fakes({});
  const result = await ok.service.upload(
    serviceId,
    upload(alt, "confirmed"),
    actor,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(ok.calls, [
    "state",
    "screen",
    "write",
    "setImage",
    "remove:old-image",
  ]);
  if (result.ok)
    assert.match(
      result.value.image.urls.large,
      /^\/admin\/catalogue\/images\/[0-9a-f-]{36}-large\.webp$/,
    );
});

test("CAT-04 service: a failed transaction removes the new files; a failed old-file delete is logged, not fatal", async () => {
  const bytes = await solidJpeg(1200, 750);
  const upload = {
    bytes,
    mimeType: "image/jpeg",
    altHeader: encodeCatalogueImageAlt("Description"),
    rightsHeader: "confirmed",
  };
  const broken = fakes({ setImage: "throws" });
  await assert.rejects(
    broken.service.upload(serviceId, upload, actor),
    /db down/,
  );
  assert.equal(broken.calls.at(-1)?.startsWith("remove:"), true);
  assert.notEqual(broken.calls.at(-1), "remove:old-image");

  const stuck = fakes({ removeFails: true });
  assert.equal((await stuck.service.upload(serviceId, upload, actor)).ok, true);
  assert.deepEqual(stuck.logged, ["old-image"]);
  assert.deepEqual(await stuck.service.remove(serviceId, actor), {
    ok: true,
    value: { removed: true },
  });
  assert.deepEqual(stuck.logged, ["old-image", "old-image"]);
});
