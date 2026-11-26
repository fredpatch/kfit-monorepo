import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/*
 * S9C: ops/deploy/kfit-release.sh deploys exactly the four digest refs of one release manifest, never builds, and
 * records release.env only after every healthcheck passes. Docker is a fake (fixtures/fake-docker.sh). The repository is
 * a throwaway git fixture: commit A (older release), commit B (HEAD) and an uncommitted working-tree compose file.
 */

const repoPath = (file) =>
  fileURLToPath(new URL(`../../../../${file}`, import.meta.url));
const HELPER = repoPath("ops/deploy/kfit-release.sh");
const BACKUP = repoPath("ops/systemd/kfit-backup.sh");
const FAKE_DOCKER = fileURLToPath(
  new URL("./fixtures/fake-docker.sh", import.meta.url),
);

const REPO = "fredpatch/kfit-monorepo";
const KINDS = ["api", "client", "ops", "renderer"];
const KEY = {
  api: "KFIT_API_IMAGE",
  client: "KFIT_CLIENT_IMAGE",
  ops: "KFIT_OPS_IMAGE",
  renderer: "KFIT_RENDERER_IMAGE",
};
const ref = (kind, hex) => `ghcr.io/${REPO}/${kind}@sha256:${hex.repeat(64)}`;
const NEW = { api: "a", client: "b", ops: "c", renderer: "d" };
const OLD = { api: "1", client: "2", ops: "3", renderer: "4" };

function manifest(commit, hex) {
  const images = {};
  const env = {};
  for (const kind of KINDS) {
    images[kind] = {
      ref: ref(kind, hex[kind]),
      tag: `ghcr.io/${REPO}/${kind}:sha-${commit}`,
    };
    env[KEY[kind]] = images[kind].ref;
  }
  return {
    repository: REPO,
    commit,
    workflow_run: `https://github.com/${REPO}/actions/runs/1`,
    created: "2026-11-26T00:00:00.000Z",
    images,
    compose_env: env,
  };
}
const releaseLines = (hex) =>
  KINDS.map((kind) => `${KEY[kind]}=${ref(kind, hex[kind])}`).join("\n") + "\n";

const sh = (args, options) => spawnSync("sh", args, options);
const hasSh = sh(["-c", "true"]).status === 0;
const works = (cmd) =>
  hasSh && sh(["-c", `${cmd} -c "import sys" 2>/dev/null`]).status === 0;
// Windows dev hosts often have only `python` (python3 is a Store stub); CI has python3.
const python = works("python3") ? "python3" : works("python") ? "python" : null;
const hasGit = spawnSync("git", ["--version"]).status === 0;

const FIXTURE = mkdtempSync(path.join(tmpdir(), "kfit-release-repo-"));
test.after(() => rmSync(FIXTURE, { recursive: true, force: true }));
const git = (...args) => {
  const result = spawnSync(
    "git",
    ["-c", "user.name=fixture", "-c", "user.email=fixture@test", ...args],
    { cwd: FIXTURE, encoding: "utf8", input: "" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const commitCompose = (line) => {
  writeFileSync(path.join(FIXTURE, "docker-compose.prod.yml"), `${line}\n`);
  git("add", "docker-compose.prod.yml");
  git("commit", "-q", "-m", line);
  return git("rev-parse", "HEAD");
};
let OLD_COMMIT = "1".repeat(40);
let COMMIT = "2".repeat(40);
let NO_COMPOSE_COMMIT = "3".repeat(40);
if (hasGit) {
  git("init", "-q");
  OLD_COMMIT = commitCompose("# compose A");
  COMMIT = commitCompose("# compose B");
  writeFileSync(
    path.join(FIXTURE, "docker-compose.prod.yml"),
    "# compose working tree\n",
  );
  NO_COMPOSE_COMMIT = git("commit-tree", git("mktree"), "-m", "no compose");
}
const MISSING_COMMIT = "e".repeat(40);

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "kfit-release-"));
  const bin = path.join(dir, "bin");
  for (const sub of ["bin", "config", "releases", "fake"]) {
    mkdirSync(path.join(dir, sub));
  }
  writeFileSync(
    path.join(bin, "docker"),
    readFileSync(FAKE_DOCKER, "utf8").replace(/\r\n/g, "\n"),
  );
  chmodSync(path.join(bin, "docker"), 0o755);
  if (python !== "python3") {
    // Strip Windows CRLF so the shim behaves like a Linux python3.
    writeFileSync(
      path.join(bin, "python3"),
      `#!/bin/sh\nout=$(${python} "$@"); status=$?\n[ -n "$out" ] && printf '%s\\n' "$out" | tr -d '\\r'\nexit $status\n`,
    );
    chmodSync(path.join(bin, "python3"), 0o755);
  }
  const files = {
    dir,
    fake: path.join(dir, "fake"),
    log: path.join(dir, "fake", "docker.log"),
    envFile: path.join(dir, "config", ".env.prod"),
    release: path.join(dir, "config", "release.env"),
    releases: path.join(dir, "releases"),
    incoming: path.join(dir, "incoming.json"),
    marker: path.join(dir, "pwned"),
  };
  writeFileSync(files.envFile, "POSTGRES_PASSWORD=never-read-by-the-helper\n");
  writeFileSync(files.release, releaseLines(OLD));
  writeFileSync(
    path.join(files.releases, `${OLD_COMMIT}.json`),
    JSON.stringify(manifest(OLD_COMMIT, OLD), null, 2) + "\n",
  );
  const env = (extra) => ({
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    KFIT_REPO: FIXTURE,
    KFIT_ENV_FILE: files.envFile,
    KFIT_RELEASE_ENV: files.release,
    KFIT_RELEASES_DIR: files.releases,
    KFIT_DEPLOY_HEALTH_TIMEOUT: "0",
    KFIT_DEPLOY_HEALTH_INTERVAL: "0",
    FAKE_DIR: files.fake,
    ...extra,
  });
  const deploy = (content, extra = {}, file = files.incoming) => {
    rmSync(files.log, { force: true });
    if (content !== undefined) {
      writeFileSync(
        file,
        typeof content === "string"
          ? content
          : JSON.stringify(content, null, 2) + "\n",
      );
    }
    return sh([HELPER, file], { encoding: "utf8", env: env(extra) });
  };
  const calls = () =>
    existsSync(files.log)
      ? readFileSync(files.log, "utf8").trim().split("\n")
      : [];
  const composeFiles = () =>
    readFileSync(path.join(files.fake, "compose-files"), "utf8")
      .trim()
      .split("\n");
  return { ...files, env, deploy, calls, composeFiles };
}

const skip =
  (!hasSh && "no POSIX sh") ||
  (!python && "no Python 3") ||
  (!hasGit && "no git");

test(
  "S9C: a valid four-image manifest is deployed with --no-build, then recorded atomically as current",
  { skip },
  () => {
    const t = setup();
    try {
      const oldLink = path.join(t.dir, "release-old-link");
      linkSync(t.release, oldLink);
      const result = t.deploy(manifest(COMMIT, NEW));
      assert.equal(result.status, 0, result.stderr);

      const calls = t.calls();
      const compose = calls.filter((line) => line.startsWith("compose "));
      assert.ok(compose.length > 0);
      for (const line of compose) {
        assert.doesNotMatch(line, /(^| )build( |$)/, "never compose build");
        assert.ok(line.includes("docker-compose.prod.yml"), line);
      }
      assert.ok(
        compose.some((line) =>
          line.endsWith("--profile ops config --format json"),
        ),
      );
      assert.ok(
        compose.some((line) =>
          line.endsWith("--profile ops pull api client ops renderer"),
        ),
      );
      const up = compose.filter((line) => / up( |$)/.test(line));
      assert.equal(up.length, 1);
      assert.ok(up[0].endsWith(" up -d --no-build --pull never"), up[0]);
      assert.doesNotMatch(up[0], /--profile/, "ops and mailpit never started");

      // release.env was still the previous release while Compose deployed the new one.
      assert.equal(
        readFileSync(path.join(t.fake, "release-at-up"), "utf8"),
        releaseLines(OLD),
      );
      assert.equal(readFileSync(t.release, "utf8"), releaseLines(NEW));
      // Replaced by rename: a hard link to the old file still holds the old content.
      assert.equal(readFileSync(oldLink, "utf8"), releaseLines(OLD));
      assert.equal(
        readFileSync(path.join(t.releases, `${COMMIT}.json`), "utf8"),
        readFileSync(t.incoming, "utf8"),
      );
      assert.deepEqual(readdirSync(path.join(t.dir, "config")).sort(), [
        ".env.prod",
        "release.env",
      ]);
      assert.deepEqual(
        readdirSync(t.releases).sort(),
        [`${COMMIT}.json`, `${OLD_COMMIT}.json`].sort(),
      );
      assert.match(result.stdout, new RegExp(`${COMMIT} is current`));
      // HEAD's committed compose file, not the uncommitted working-tree one.
      for (const line of t.composeFiles()) assert.equal(line, "# compose B");
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C: a stale shell (KFIT_API_IMAGE, COMPOSE_PROFILES, COMPOSE_PROJECT_NAME) cannot change the deployed release",
  { skip },
  () => {
    const t = setup();
    try {
      const result = t.deploy(manifest(COMMIT, NEW), {
        KFIT_API_IMAGE: "kfit-prod-api:local",
        KFIT_RENDERER_IMAGE: ref("renderer", "9"),
        COMPOSE_PROFILES: "mailpit-bridge",
        COMPOSE_PROJECT_NAME: "kfit-other",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        readFileSync(path.join(t.fake, "running-api"), "utf8").trim(),
        `id-${ref("api", "a")}`,
      );
      assert.equal(
        readFileSync(path.join(t.fake, "running-renderer"), "utf8").trim(),
        `id-${ref("renderer", "d")}`,
      );
      assert.equal(
        readFileSync(path.join(t.fake, "compose-env"), "utf8"),
        "",
        "no COMPOSE_* variable reaches Compose",
      );
      assert.equal(readFileSync(t.release, "utf8"), releaseLines(NEW));
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C: malformed, foreign, pre-S9B or injection-looking manifests are refused before any Docker call",
  { skip },
  () => {
    const t = setup();
    const valid = () => manifest(COMMIT, NEW);
    const withRef = (kind, value) => {
      const m = valid();
      m.compose_env[KEY[kind]] = value;
      m.images[kind].ref = value;
      return m;
    };
    const change = (fn) => {
      const m = valid();
      fn(m);
      return m;
    };
    const tag = `ghcr.io/${REPO}/api:sha-${COMMIT}`;
    const cases = [
      ["unreadable", undefined, /manifest not readable/],
      ["invalid JSON", "{", /not valid UTF-8 JSON/],
      ["not an object", "[]", /must be a JSON object/],
      [
        "wrong repository",
        change((m) => (m.repository = "someone/kfit-monorepo")),
        /repository must be/,
      ],
      [
        "missing commit",
        change((m) => delete m.commit),
        /commit must be 40 lowercase hex/,
      ],
      [
        "uppercase commit",
        change((m) => (m.commit = COMMIT.toUpperCase())),
        /commit must be 40 lowercase hex/,
      ],
      [
        "missing renderer",
        change((m) => delete m.compose_env.KFIT_RENDERER_IMAGE),
        /compose_env must hold exactly/,
      ],
      [
        "pre-S9B three-image manifest",
        change((m) => {
          delete m.compose_env.KFIT_RENDERER_IMAGE;
          delete m.images.renderer;
        }),
        /before S9B are refused/,
      ],
      [
        "extra KFIT_WORKER_IMAGE",
        change((m) => (m.compose_env.KFIT_WORKER_IMAGE = ref("worker", "e"))),
        /compose_env must hold exactly/,
      ],
      [
        "api key pointing to the renderer image",
        withRef("api", ref("renderer", "d")),
        /KFIT_API_IMAGE must be/,
      ],
      ["tag instead of digest", withRef("api", tag), /KFIT_API_IMAGE must be/],
      [
        "latest",
        withRef("api", `ghcr.io/${REPO}/api:latest`),
        /KFIT_API_IMAGE must be/,
      ],
      [
        "local image",
        withRef("api", "kfit-prod-api:local"),
        /KFIT_API_IMAGE must be/,
      ],
      [
        "short digest",
        withRef("api", `ghcr.io/${REPO}/api@sha256:${"a".repeat(63)}`),
        /KFIT_API_IMAGE must be/,
      ],
      [
        "uppercase digest",
        withRef("api", `ghcr.io/${REPO}/api@sha256:${"A".repeat(64)}`),
        /KFIT_API_IMAGE must be/,
      ],
      [
        "other registry owner",
        withRef(
          "ops",
          `ghcr.io/someone/kfit-monorepo/ops@sha256:${"c".repeat(64)}`,
        ),
        /KFIT_OPS_IMAGE must be/,
      ],
      [
        "trailing newline and command in a ref",
        withRef("api", `${ref("api", "a")}\n$(touch ${t.marker})`),
        /KFIT_API_IMAGE must be/,
      ],
      [
        "trailing space in a ref",
        withRef("api", `${ref("api", "a")} `),
        /KFIT_API_IMAGE must be/,
      ],
      [
        "command in the commit",
        change((m) => (m.commit = `$(touch ${t.marker})`)),
        /commit must be/,
      ],
      [
        "injected key",
        change((m) => {
          m.compose_env[`KFIT_API_IMAGE=x\n$(touch ${t.marker})`] = "x";
        }),
        /compose_env must hold exactly/,
      ],
      [
        "unexpected top-level key",
        change((m) => (m.compose_env_extra = {})),
        /unexpected keys/,
      ],
      [
        "duplicate key",
        JSON.stringify(valid()).replace(
          '"commit":',
          `"commit":"${OLD_COMMIT}","commit":`,
        ),
        /duplicate key: "commit"/,
      ],
      [
        "commit absent from the repository",
        manifest(MISSING_COMMIT, NEW),
        /is not in .* \(git fetch first\)/,
      ],
      [
        "commit without docker-compose.prod.yml",
        manifest(NO_COMPOSE_COMMIT, NEW),
        /cannot be read from commit/,
      ],
      [
        "images disagreeing with compose_env",
        change((m) => (m.images.api.ref = ref("api", "f"))),
        /images\.api does not match/,
      ],
      [
        "tag of another commit",
        change(
          (m) => (m.images.ops.tag = `ghcr.io/${REPO}/ops:sha-${OLD_COMMIT}`),
        ),
        /images\.ops does not match/,
      ],
    ];
    try {
      for (const [name, content, pattern] of cases) {
        rmSync(t.incoming, { force: true });
        const result = t.deploy(content);
        assert.equal(result.status, 1, `${name}: ${result.stderr}`);
        assert.match(result.stderr, pattern, name);
        assert.deepEqual(t.calls(), [], `${name}: Docker never called`);
        assert.equal(readFileSync(t.release, "utf8"), releaseLines(OLD));
        assert.equal(existsSync(t.marker), false, `${name}: nothing executed`);
        assert.equal(
          existsSync(path.join(t.releases, `${COMMIT}.json`)),
          false,
        );
      }
      // A different manifest already archived under the same commit is ambiguous.
      writeFileSync(path.join(t.releases, `${COMMIT}.json`), "{}\n");
      const ambiguous = t.deploy(manifest(COMMIT, NEW));
      assert.equal(ambiguous.status, 1);
      assert.match(ambiguous.stderr, /already exists with different content/);
      assert.deepEqual(t.calls(), []);
      assert.equal(
        existsSync(path.join(t.releases, ".kfit-release.lock")),
        false,
      );
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C: a failed pull or a missing image stops before Compose up",
  { skip },
  () => {
    const t = setup();
    try {
      for (const extra of [
        { FAKE_PULL_FAIL: "1" },
        { FAKE_IMAGE_MISSING: "1" },
      ]) {
        const result = t.deploy(manifest(COMMIT, NEW), extra);
        assert.equal(result.status, 1, JSON.stringify(extra));
        assert.match(result.stderr, /nothing was changed/);
        assert.equal(
          t.calls().some((line) => / up( |$)/.test(line)),
          false,
        );
        assert.equal(readFileSync(t.release, "utf8"), releaseLines(OLD));
      }
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C: without healthy services (or with a wrong running image) release.env keeps the previous release and the rollback is printed",
  { skip },
  () => {
    const t = setup();
    try {
      for (const [extra, pattern] of [
        [
          { FAKE_HEALTH_renderer: "starting" },
          /not healthy after 0s: renderer=starting/,
        ],
        [{ FAKE_HEALTH_clamav: "unhealthy" }, /clamav=unhealthy/],
        [{ FAKE_RUNNING_API: ref("api", "1") }, /api is not running/],
      ]) {
        const result = t.deploy(manifest(COMMIT, NEW), extra);
        assert.equal(result.status, 1, JSON.stringify(extra));
        assert.match(result.stderr, pattern);
        assert.match(result.stderr, /is not recorded as current/);
        assert.ok(
          result.stderr.includes(
            path.join(t.releases, `${OLD_COMMIT}.json`).replace(/\\/g, "/"),
          ) ||
            result.stderr.includes(path.join(t.releases, `${OLD_COMMIT}.json`)),
          result.stderr,
        );
        assert.equal(readFileSync(t.release, "utf8"), releaseLines(OLD));
        assert.equal(
          existsSync(path.join(t.releases, `${COMMIT}.json`)),
          false,
        );
      }
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C: an older manifest is deployed with its own commit's docker-compose.prod.yml, never HEAD's or the working tree's",
  { skip },
  () => {
    const t = setup();
    try {
      const result = t.deploy(manifest(OLD_COMMIT, OLD));
      assert.equal(result.status, 0, result.stderr);
      const used = t.composeFiles();
      assert.ok(used.length >= 4, "config, pull, up and ps all use it");
      for (const line of used) assert.equal(line, "# compose A");
      for (const line of t.calls().filter((c) => c.startsWith("compose "))) {
        assert.ok(
          !line.includes(path.join(FIXTURE, "docker-compose.prod.yml")),
        );
        assert.ok(line.includes(`--project-directory ${FIXTURE}`), line);
      }
      assert.equal(
        readFileSync(path.join(FIXTURE, "docker-compose.prod.yml"), "utf8"),
        "# compose working tree\n",
        "working tree untouched",
      );
      assert.equal(git("rev-parse", "HEAD"), COMMIT, "HEAD untouched");
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C: rollback reruns the same helper on the archived previous manifest, and the backup timer accepts the result",
  { skip },
  () => {
    const t = setup();
    try {
      assert.equal(t.deploy(manifest(COMMIT, NEW)).status, 0);
      const archived = path.join(t.releases, `${OLD_COMMIT}.json`);
      const before = readFileSync(archived, "utf8");
      const rollback = t.deploy(undefined, {}, archived);
      assert.equal(rollback.status, 0, rollback.stderr);
      assert.equal(readFileSync(t.release, "utf8"), releaseLines(OLD));
      assert.equal(readFileSync(archived, "utf8"), before);

      // S9A.7 parser unchanged: the release.env written by the helper runs the backup with the release's ops digest.
      rmSync(t.log, { force: true });
      const backup = sh([BACKUP], { encoding: "utf8", env: t.env() });
      assert.equal(backup.status, 0, backup.stderr);
      assert.ok(
        t
          .calls()
          .at(-1)
          .endsWith(
            "--profile ops run --rm --no-deps -T --pull never ops npm run ops:backup --workspace @kfit/server",
          ),
      );
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);
