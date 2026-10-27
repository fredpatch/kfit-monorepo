import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("./run.mjs", import.meta.url));

async function withProbe(work) {
  const dir = await mkdtemp(path.join(tmpdir(), "kfit run probe "));
  const out = path.join(dir, "argv.json");
  const probe = path.join(dir, "probe.mjs");
  await writeFile(
    probe,
    `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));\n`,
  );
  try {
    await work({
      probe,
      read: async () => JSON.parse(await readFile(out, "utf8")),
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const run = (args, env) =>
  spawnSync(process.execPath, [runner, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

test("FIX-03 F3: arguments with spaces, quotes and carets reach the target script unchanged", async () => {
  await withProbe(async ({ probe, read }) => {
    const args = [
      "--bundle",
      "C:/Users/Prime Daily/backups/kfit-backup-20261026T020000Z",
      "--target-db",
      "kfit_restore_x",
      "--files-target",
      `D:/a "quoted" dir/^caret & more`,
      "--confirm-overwrite",
    ];
    const result = run(["restore", "--skip-build", ...args], {
      NODE_ENV: "test",
      KFIT_OPS_RUNNER_TARGET: probe,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(await read(), args);
  });
});

test("FIX-03 F3: --skip-build and the target override are refused outside NODE_ENV=test; an unknown job is refused", async () => {
  await withProbe(async ({ probe }) => {
    const refused = run(["backup", "--skip-build"], {
      NODE_ENV: "production",
      KFIT_OPS_RUNNER_TARGET: probe,
    });
    assert.equal(refused.status, 1);
    assert.match(
      refused.stderr,
      /--skip-build is only accepted with NODE_ENV=test/,
    );
  });
  const unknown = run(["drop-everything"], { NODE_ENV: "test" });
  assert.equal(unknown.status, 1);
  assert.match(
    unknown.stderr,
    /usage: node scripts\/ops\/run\.mjs <backup\|restore\|restore-drill\|privacy-replay\|privacy-journal-sync\|create-user\|set-role>/,
  );
});
