import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/*
 * S9A.7: the production backup runs natively from the ops container (no Docker socket) and the host scheduler only
 * ever runs a pulled GHCR digest of the ops image.
 */

const repoFile = (file) =>
  readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8").replace(
    /\r\n/g,
    "\n",
  );
const repoPath = (file) =>
  fileURLToPath(new URL(`../../../../${file}`, import.meta.url));

const OPS_IMAGE = `ghcr.io/fredpatch/kfit-monorepo/ops@sha256:${"a".repeat(64)}`;

const opsService = () => {
  const compose = repoFile("docker-compose.prod.yml");
  const start = compose.indexOf("\n  ops:\n");
  assert.ok(start > 0, "ops service present");
  return compose.slice(start, compose.indexOf("\nvolumes:", start));
};

test("S9A.7: the production ops service mounts private files, journal and backups, in native mode, without the Docker socket", () => {
  const ops = opsService();
  for (const [source, target] of [
    ["${KFIT_PRIVATE_HOST_DIR:-/srv/kfit/private}", "/srv/kfit/private"],
    [
      "${KFIT_PRIVACY_JOURNAL_HOST_DIR:-/srv/kfit/privacy-journal}",
      "/srv/kfit/privacy-journal",
    ],
    ["${KFIT_BACKUP_HOST_DIR:-/srv/kfit/backups}", "/srv/kfit/backups"],
  ]) {
    const mount = new RegExp(
      `- type: bind\\s+source: ${source.replace(/[$.{}:/-]/g, "\\$&")}\\s+target: ${target}\\s+bind:\\s+create_host_path: false`,
    );
    assert.match(ops, mount, target);
  }
  assert.match(ops, /BACKUP_PG_MODE: native/);
  assert.doesNotMatch(repoFile("docker-compose.prod.yml"), /docker\.sock/);
});

test("S9A.7: the ops image installs PostgreSQL 16 client tools and no Docker CLI", () => {
  const dockerfile = repoFile("packages/server/Dockerfile");
  const ops = dockerfile.slice(dockerfile.indexOf("FROM build AS ops"));
  assert.match(ops, /postgresql-client-16/);
  assert.match(ops, /PATH=\/usr\/lib\/postgresql\/16\/bin:\$PATH/);
  assert.match(ops, /KFIT_OPS_PREBUILT=true/);
  assert.match(ops, /USER node/);
  assert.doesNotMatch(ops, /docker-ce|docker\.io|docker-cli/);
});

test("S9A.7: the documented production backup mode is native, without a compose file", () => {
  const example = repoFile(".env.prod.example");
  assert.match(example, /^BACKUP_PG_MODE=native$/m);
  assert.doesNotMatch(example, /^BACKUP_COMPOSE_FILE=/m);
  assert.match(example, /^BACKUP_DIR=\/srv\/kfit\/backups\/primary$/m);
  assert.match(
    example,
    /^BACKUP_SECONDARY_DIR=\/srv\/kfit\/backups\/secondary$/m,
  );
});

const hasSh = spawnSync("sh", ["-c", "true"]).status === 0;

test(
  "S9A.7: the scheduled backup refuses anything but a pulled ops digest, then runs ops:backup without pull or build",
  { skip: !hasSh && "no POSIX sh" },
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kfit-backup-scheduler-"));
    try {
      const bin = path.join(dir, "bin");
      const log = path.join(dir, "docker.log");
      spawnSync("sh", ["-c", `mkdir -p "${bin}"`]);
      const fakeDocker = path.join(bin, "docker");
      writeFileSync(
        fakeDocker,
        `#!/bin/sh\nif [ "$1" = image ]; then exit "\${FAKE_INSPECT:-0}"; fi\nprintf '%s\\n' "$KFIT_OPS_IMAGE" "$KFIT_ENV_FILE" "$@" > "$FAKE_LOG"\n`,
      );
      chmodSync(fakeDocker, 0o755);
      const envFile = path.join(dir, ".env.prod");
      writeFileSync(
        envFile,
        "BACKUP_ENCRYPTION_KEY=never-read-by-the-script\n",
      );
      const release = path.join(dir, "release.env");
      const schedule = (lines, extra = {}) => {
        rmSync(log, { force: true });
        if (lines === null) rmSync(release, { force: true });
        else writeFileSync(release, lines.join("\n") + "\n");
        return spawnSync("sh", [repoPath("ops/systemd/kfit-backup.sh")], {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${path.delimiter}${process.env.PATH}`,
            KFIT_RELEASE_ENV: release,
            KFIT_ENV_FILE: envFile,
            FAKE_LOG: log,
            ...extra,
          },
        });
      };
      const refused = (result, pattern) => {
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, pattern);
        assert.throws(() => readFileSync(log), "compose never ran");
      };

      refused(schedule(null), /release env file not readable/);
      refused(schedule(["# no ops image"]), /KFIT_OPS_IMAGE must be/);
      refused(
        schedule(["KFIT_OPS_IMAGE=kfit-prod-ops:local"]),
        /KFIT_OPS_IMAGE must be/,
      );
      refused(
        schedule([
          `KFIT_OPS_IMAGE=ghcr.io/fredpatch/kfit-monorepo/ops:sha-${"b".repeat(40)}`,
        ]),
        /KFIT_OPS_IMAGE must be/,
      );
      refused(
        schedule([
          `KFIT_OPS_IMAGE=ghcr.io/someone-else/kfit-monorepo/ops@sha256:${"a".repeat(64)}`,
        ]),
        /KFIT_OPS_IMAGE must be/,
      );
      refused(
        schedule([`KFIT_OPS_IMAGE=${OPS_IMAGE}`, "BACKUP_ENCRYPTION_KEY=0123"]),
        /may only contain/,
      );
      refused(
        schedule([
          `KFIT_OPS_IMAGE=${OPS_IMAGE}`,
          `KFIT_WORKER_IMAGE=ghcr.io/fredpatch/kfit-monorepo/worker@sha256:${"d".repeat(64)}`,
        ]),
        /may only contain/,
      );
      refused(
        schedule([`KFIT_OPS_IMAGE=${OPS_IMAGE}`, "$(touch /tmp/kfit-pwned)"]),
        /may only contain/,
      );
      refused(
        schedule([`KFIT_OPS_IMAGE=${OPS_IMAGE}`], { FAKE_INSPECT: "1" }),
        /ops image not present locally/,
      );

      // S9B: the release.env derived from a four-image manifest (api, client, ops, renderer) is accepted.
      const ok = schedule([
        "# release 0123abc",
        `KFIT_API_IMAGE=ghcr.io/fredpatch/kfit-monorepo/api@sha256:${"c".repeat(64)}`,
        `KFIT_CLIENT_IMAGE=ghcr.io/fredpatch/kfit-monorepo/client@sha256:${"e".repeat(64)}`,
        `KFIT_OPS_IMAGE=${OPS_IMAGE}`,
        `KFIT_RENDERER_IMAGE=ghcr.io/fredpatch/kfit-monorepo/renderer@sha256:${"f".repeat(64)}`,
      ]);
      assert.equal(ok.status, 0, ok.stderr);
      const [image, env, ...args] = readFileSync(log, "utf8")
        .trim()
        .split("\n");
      assert.equal(image, OPS_IMAGE);
      assert.equal(env, envFile);
      assert.equal(args.slice(0, 2).join(" "), "compose -f");
      assert.equal(
        args.slice(3).join(" "),
        "--profile ops run --rm --no-deps -T --pull never ops npm run ops:backup --workspace @kfit/server",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);


test("S9D: systemd chains verified off-site copy only after the encrypted backup succeeds", () => {
  const service = repoFile("ops/systemd/kfit-backup.service");
  assert.match(service, /^EnvironmentFile=\/srv\/kfit\/config\/offsite-backup\.env$/m);
  assert.match(service, /^ExecStart=.*\/ops\/systemd\/kfit-backup\.sh$/m);
  assert.match(service, /^ExecStartPost=.*\/ops\/systemd\/kfit-offsite-backup\.sh$/m);
});

test(
  "S9D: off-site transport uploads only the latest complete bundle, append-only, then verifies by download",
  { skip: !hasSh && "no POSIX sh" },
  () => {
    const dir = mkdtempSync(path.join(tmpdir(), "kfit-offsite-backup-"));
    try {
      const bin = path.join(dir, "bin");
      const backups = path.join(dir, "primary");
      const log = path.join(dir, "rclone.log");
      mkdirSync(bin);
      mkdirSync(backups);

      const fakeRclone = path.join(bin, "rclone");
      writeFileSync(
        fakeRclone,
        `#!/bin/sh\nprintf '%s\\n' "$@" >> "$FAKE_RCLONE_LOG"\nprintf '%s\\n' -- >> "$FAKE_RCLONE_LOG"\nexit "${FAKE_RCLONE_STATUS:-0}"\n`,
      );
      chmodSync(fakeRclone, 0o755);

      const config = path.join(dir, "rclone.conf");
      writeFileSync(config, "[kfit-r2]\ntype = s3\n");
      if (process.platform !== "win32") chmodSync(config, 0o600);

      const makeBundle = (name) => {
        const bundle = path.join(backups, name);
        mkdirSync(bundle);
        for (const file of [
          "db.dump.enc",
          "files.tar.enc",
          "journal.jsonl.enc",
          "manifest.json",
        ]) {
          writeFileSync(path.join(bundle, file), file);
        }
        return bundle;
      };
      makeBundle("kfit-backup-20261126T010000Z");
      const latest = makeBundle("kfit-backup-20261126T020000Z");

      const run = (extra = {}) =>
        spawnSync("sh", [repoPath("ops/systemd/kfit-offsite-backup.sh")], {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${path.delimiter}${process.env.PATH}`,
            KFIT_BACKUP_PRIMARY_DIR: backups,
            KFIT_RCLONE_CONFIG: config,
            KFIT_OFFSITE_REMOTE: "kfit-r2:kfit-production-backups",
            FAKE_RCLONE_LOG: log,
            ...extra,
          },
        });

      const ok = run();
      assert.equal(ok.status, 0, ok.stderr);
      assert.match(ok.stdout, /kfit-backup-20261126T020000Z uploaded and verified/);
      const args = readFileSync(log, "utf8");
      assert.match(args, new RegExp(`copy\\n${latest.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, "\\\\$&")}\\n`));
      assert.match(args, /kfit-r2:kfit-production-backups\/kfit-backup-20261126T020000Z/);
      assert.match(args, /--immutable/);
      assert.match(args, /check/);
      assert.match(args, /--one-way/);
      assert.match(args, /--download/);
      assert.doesNotMatch(args, /sync|delete|purge/);

      rmSync(log, { force: true });
      const missingRemote = run({ KFIT_OFFSITE_REMOTE: "" });
      assert.equal(missingRemote.status, 1);
      assert.match(missingRemote.stderr, /KFIT_OFFSITE_REMOTE is required/);
      assert.throws(() => readFileSync(log), "rclone never ran");

      writeFileSync(path.join(latest, "unexpected.txt"), "no");
      const malformed = run();
      assert.equal(malformed.status, 1);
      assert.match(malformed.stderr, /unexpected entries/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
