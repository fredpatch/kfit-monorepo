import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolvePrivateStorageRoot } from "../modules/documents/services/document-storage.service.js";
import {
  DEFAULT_PRIVATE_STORAGE_DIR,
  REPO_ROOT,
  resolveConfiguredPath,
} from "./paths.js";

const serverDir = path.join(REPO_ROOT, "packages", "server");

function inDirectory<T>(dir: string, run: () => T): T {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return run();
  } finally {
    process.chdir(previous);
  }
}

test("FIX-03 F1: REPO_ROOT is the monorepo root", () => {
  assert.equal(
    (
      JSON.parse(
        readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
      ) as { name: string }
    ).name,
    "kfit-monorepo",
  );
});

test("FIX-03 F1: an absolute path is kept; a relative one resolves from REPO_ROOT whatever the current directory", () => {
  const absolute = path.resolve(tmpdir(), "kfit-absolute");
  assert.equal(resolveConfiguredPath(absolute), absolute);
  for (const dir of [tmpdir(), serverDir, REPO_ROOT]) {
    assert.equal(
      inDirectory(dir, () => resolveConfiguredPath("backups/primary")),
      path.join(REPO_ROOT, "backups", "primary"),
      dir,
    );
    assert.equal(
      inDirectory(dir, () => resolveConfiguredPath(" ../../outside ")),
      path.resolve(REPO_ROOT, "../../outside"),
      dir,
    );
  }
});

test("FIX-03 F1: an empty value uses the fallback, or null without one", () => {
  assert.equal(resolveConfiguredPath(undefined), null);
  assert.equal(resolveConfiguredPath("  "), null);
  assert.equal(
    resolveConfiguredPath("", { fallback: "storage/x" }),
    path.join(REPO_ROOT, "storage", "x"),
  );
});

test("FIX-03 F1: the default storage root equals the pre-FIX-03 default of an API started from packages/server, from anywhere", () => {
  const legacy = inDirectory(serverDir, () =>
    path.resolve(path.join(process.cwd(), "../../storage/private/documents")),
  );
  assert.equal(legacy, path.join(REPO_ROOT, DEFAULT_PRIVATE_STORAGE_DIR));
  for (const dir of [serverDir, REPO_ROOT, tmpdir()])
    assert.equal(
      inDirectory(dir, () => resolvePrivateStorageRoot(undefined)),
      legacy,
      dir,
    );
  assert.equal(
    inDirectory(tmpdir(), () => resolvePrivateStorageRoot("storage/custom")),
    path.join(REPO_ROOT, "storage", "custom"),
  );
});
