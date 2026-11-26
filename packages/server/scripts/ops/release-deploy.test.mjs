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
const FAKE_CURL = fileURLToPath(
  new URL("./fixtures/fake-curl.sh", import.meta.url),
);
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
// Synthetic, shaped like a fine-grained token.
const TOKEN = `github_pat_${"Q7".repeat(30)}`;

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "kfit-release-"));
  const bin = path.join(dir, "bin");
  for (const sub of ["bin", "config", "releases", "fake", "github"]) {
    mkdirSync(path.join(dir, sub));
  }
  writeFileSync(
    path.join(bin, "docker"),
    readFileSync(FAKE_DOCKER, "utf8").replace(/\r\n/g, "\n"),
  );
  chmodSync(path.join(bin, "docker"), 0o755);
  writeFileSync(
    path.join(bin, "curl"),
    readFileSync(FAKE_CURL, "utf8").replace(/\r\n/g, "\n"),
  );
  chmodSync(path.join(bin, "curl"), 0o755);
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
    github: path.join(dir, "github"),
    token: path.join(dir, "config", "github-actions-read.token"),
  };
  writeFileSync(files.token, `${TOKEN}\n`);
  chmodSync(files.token, 0o600);
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
    KFIT_GITHUB_TOKEN_FILE: files.token,
    FAKE_TOKEN: TOKEN,
    FAKE_GH: files.github,
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
  const deployCommit = (commit, extra = {}) => {
    rmSync(files.log, { force: true });
    return sh([HELPER, commit], { encoding: "utf8", env: env(extra) });
  };
  const curlCalls = (name = "curl.log") =>
    existsSync(path.join(files.fake, name))
      ? readFileSync(path.join(files.fake, name), "utf8").trim().split("\n")
      : [];
  const calls = () =>
    existsSync(files.log)
      ? readFileSync(files.log, "utf8").trim().split("\n")
      : [];
  const composeFiles = () =>
    readFileSync(path.join(files.fake, "compose-files"), "utf8")
      .trim()
      .split("\n");
  return {
    ...files,
    env,
    deploy,
    deployCommit,
    calls,
    curlCalls,
    composeFiles,
  };
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
        "github-actions-read.token",
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
        assert.match(result.stderr, new RegExp(`sudo .+ ${OLD_COMMIT}\\n`));
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

/* S9C commit mode: `kfit-release.sh <commit>` with the archived manifest, or the GitHub Actions artifact. */

const RUN_ID = 45814766545;
const ARTIFACT_ID = 4865;
const goodRun = (sha, over = {}) => ({
  id: RUN_ID,
  run_attempt: 1,
  head_sha: sha,
  head_branch: "main",
  path: ".github/workflows/publish-images.yml",
  status: "completed",
  conclusion: "success",
  repository: { full_name: REPO },
  ...over,
});
const goodArtifact = (sha, over = {}) => ({
  id: ARTIFACT_ID,
  name: `release-manifest-${sha}`,
  expired: false,
  size_in_bytes: 712,
  workflow_run: { id: RUN_ID, head_sha: sha, head_branch: "main" },
  ...over,
});

function makeZip(file, entries) {
  const code = [
    "import json, sys, zipfile",
    "with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as archive:",
    "    for entry in json.load(sys.stdin):",
    "        info = zipfile.ZipInfo(entry['name'])",
    "        if entry.get('symlink'): info.external_attr = 0o120777 << 16",
    "        archive.writestr(info, entry['data'])",
  ].join("\n");
  // Entries go through stdin: a large one would exceed the Windows command-line limit.
  const result = spawnSync(python, ["-c", code, file], {
    input: JSON.stringify(entries),
  });
  assert.equal(result.status, 0, String(result.stderr));
}

function publish(t, { runs, artifacts, zip }) {
  writeFileSync(
    path.join(t.github, "runs.json"),
    JSON.stringify({ total_count: runs.length, workflow_runs: runs }),
  );
  writeFileSync(
    path.join(t.github, "artifacts.json"),
    JSON.stringify({ total_count: artifacts.length, artifacts }),
  );
  const zipFile = path.join(t.github, "artifact.zip");
  if (typeof zip === "string") writeFileSync(zipFile, zip);
  else makeZip(zipFile, zip);
}
const manifestEntry = (commit, hex) => [
  {
    name: "release-manifest.json",
    data: JSON.stringify(manifest(commit, hex), null, 2) + "\n",
  },
];
const goodRelease = (sha = COMMIT) => ({
  runs: [goodRun(sha)],
  artifacts: [goodArtifact(sha)],
  zip: manifestEntry(sha, NEW),
});

const tokenNowhere = (t, result) => {
  const places = {
    stdout: result.stdout,
    stderr: result.stderr,
    "docker log": existsSync(t.log) ? readFileSync(t.log, "utf8") : "",
    "curl command lines": t.curlCalls().join("\n"),
    "release.env": readFileSync(t.release, "utf8"),
  };
  for (const name of readdirSync(t.releases)) {
    if (name.endsWith(".json")) {
      places[name] = readFileSync(path.join(t.releases, name), "utf8");
    }
  }
  for (const [where, text] of Object.entries(places)) {
    assert.equal(text.includes(TOKEN), false, `token leaked into ${where}`);
  }
};

test(
  "S9C commit mode: without an archive, the one successful run's artifact is downloaded, validated and deployed",
  { skip },
  () => {
    const t = setup();
    try {
      const release = goodRelease();
      publish(t, release);
      const result = t.deployCommit(COMMIT);
      assert.equal(result.status, 0, result.stderr);

      const api =
        "https://api.github.com/repos/fredpatch/kfit-monorepo/actions";
      assert.deepEqual(t.curlCalls("curl-urls"), [
        `${api}/workflows/publish-images.yml/runs?head_sha=${COMMIT}&per_page=100`,
        `${api}/runs/${RUN_ID}/artifacts?name=release-manifest-${COMMIT}&per_page=100`,
        `${api}/artifacts/${ARTIFACT_ID}/zip`,
      ]);
      for (const line of t.curlCalls()) {
        assert.match(line, /--fail/);
        assert.match(line, /--proto =https --proto-redir =https --location /);
        assert.doesNotMatch(line, /--location-trusted|--insecure|-k /);
        assert.match(line, /-H @\S*github\.header/);
        assert.match(line, /X-GitHub-Api-Version: 2022-11-28/);
      }
      assert.equal(
        readFileSync(path.join(t.releases, `${COMMIT}.json`), "utf8"),
        release.zip[0].data,
      );
      assert.equal(readFileSync(t.release, "utf8"), releaseLines(NEW));
      for (const line of t.composeFiles()) assert.equal(line, "# compose B");
      tokenNowhere(t, result);
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C commit mode: an archived manifest is used without GitHub, including for rollback",
  { skip },
  () => {
    const t = setup();
    try {
      writeFileSync(
        path.join(t.releases, `${COMMIT}.json`),
        JSON.stringify(manifest(COMMIT, NEW), null, 2) + "\n",
      );
      const offline = { FAKE_GH: "", KFIT_GITHUB_TOKEN_FILE: t.marker };
      const deployed = t.deployCommit(COMMIT, offline);
      assert.equal(deployed.status, 0, deployed.stderr);
      assert.equal(readFileSync(t.release, "utf8"), releaseLines(NEW));

      const rollback = t.deployCommit(OLD_COMMIT, offline);
      assert.equal(rollback.status, 0, rollback.stderr);
      assert.equal(readFileSync(t.release, "utf8"), releaseLines(OLD));
      for (const line of t.composeFiles().slice(-4)) {
        assert.equal(line, "# compose A");
      }
      assert.deepEqual(t.curlCalls(), [], "GitHub never contacted");
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C commit mode: unfinished, failed, foreign or ambiguous runs, bad artifacts, bad ZIPs and HTTP failures stop before Docker",
  { skip },
  () => {
    const t = setup();
    const release = (change) => {
      const r = goodRelease();
      change(r);
      return r;
    };
    const cases = [
      [
        "run in progress",
        release(
          (r) =>
            (r.runs = [
              goodRun(COMMIT, { status: "in_progress", conclusion: null }),
            ]),
        ),
        {},
        /is 'in_progress', not completed/,
      ],
      [
        "run failed",
        release((r) => (r.runs = [goodRun(COMMIT, { conclusion: "failure" })])),
        {},
        /no successful publish-images run .*'failure'/,
      ],
      [
        "run of another commit",
        release((r) => (r.runs = [goodRun(OLD_COMMIT)])),
        {},
        /no \.github\/workflows\/publish-images\.yml run on main/,
      ],
      [
        "run of another workflow",
        release(
          (r) =>
            (r.runs = [goodRun(COMMIT, { path: ".github/workflows/ci.yml" })]),
        ),
        {},
        /no \.github\/workflows\/publish-images\.yml run on main/,
      ],
      [
        "run on another branch",
        release(
          (r) => (r.runs = [goodRun(COMMIT, { head_branch: "feature" })]),
        ),
        {},
        /run on main/,
      ],
      [
        "run of another repository",
        release(
          (r) =>
            (r.runs = [
              goodRun(COMMIT, {
                repository: { full_name: "someone/kfit-monorepo" },
              }),
            ]),
        ),
        {},
        /run on main/,
      ],
      [
        "two successful runs",
        release((r) => r.runs.push(goodRun(COMMIT, { id: RUN_ID + 1 }))),
        {},
        /several successful publish-images runs/,
      ],
      [
        "paginated runs",
        release((r) => (r.runs = [goodRun(COMMIT)])),
        { runsTotal: 101 },
        /incomplete or paginated/,
      ],
      [
        "no artifact",
        release((r) => (r.artifacts = [])),
        {},
        /has no artifact release-manifest-/,
      ],
      [
        "two artifacts",
        release((r) =>
          r.artifacts.push(goodArtifact(COMMIT, { id: ARTIFACT_ID + 1 })),
        ),
        {},
        /several artifacts named/,
      ],
      [
        "expired artifact",
        release(
          (r) => (r.artifacts = [goodArtifact(COMMIT, { expired: true })]),
        ),
        {},
        /has expired/,
      ],
      [
        "artifact of another run",
        release(
          (r) =>
            (r.artifacts = [
              goodArtifact(COMMIT, {
                workflow_run: { id: 1, head_sha: COMMIT, head_branch: "main" },
              }),
            ]),
        ),
        {},
        /does not belong to run/,
      ],
      [
        "artifact of another commit",
        release(
          (r) =>
            (r.artifacts = [
              goodArtifact(COMMIT, {
                workflow_run: {
                  id: RUN_ID,
                  head_sha: OLD_COMMIT,
                  head_branch: "main",
                },
              }),
            ]),
        ),
        {},
        /does not belong to run/,
      ],
      [
        "malformed ZIP",
        release((r) => (r.zip = "this is not a zip archive")),
        {},
        /not a valid ZIP archive/,
      ],
      [
        "path traversal",
        release(
          (r) =>
            (r.zip = [
              { name: "../release-manifest.json", data: r.zip[0].data },
            ]),
        ),
        {},
        /exactly one file, release-manifest\.json/,
      ],
      [
        "absolute path",
        release(
          (r) =>
            (r.zip = [{ name: "/release-manifest.json", data: r.zip[0].data }]),
        ),
        {},
        /exactly one file, release-manifest\.json/,
      ],
      [
        "extra file",
        release((r) => r.zip.push({ name: "extra.sh", data: "touch pwned" })),
        {},
        /exactly one file, release-manifest\.json/,
      ],
      [
        "symlink entry",
        release(
          (r) =>
            (r.zip = [
              {
                name: "release-manifest.json",
                data: "/etc/passwd",
                symlink: true,
              },
            ]),
        ),
        {},
        /not a regular file/,
      ],
      [
        "oversized manifest",
        release(
          (r) =>
            (r.zip = [
              { name: "release-manifest.json", data: " ".repeat(70000) },
            ]),
        ),
        {},
        /larger than 64 KiB/,
      ],
      [
        "manifest of another commit",
        release((r) => (r.zip = manifestEntry(OLD_COMMIT, NEW))),
        {},
        /manifest commit .* is not the requested commit/,
      ],
      [
        "manifest failing the strict parser",
        release((r) => {
          const bad = manifest(COMMIT, NEW);
          bad.compose_env.KFIT_API_IMAGE = "kfit-prod-api:local";
          r.zip = [
            { name: "release-manifest.json", data: JSON.stringify(bad) },
          ];
        }),
        {},
        /KFIT_API_IMAGE must be/,
      ],
      [
        "runs HTTP error",
        goodRelease(),
        { FAKE_GH_FAIL: "runs.json" },
        /GitHub request failed \(workflow runs\)/,
      ],
      [
        "artifacts HTTP error",
        goodRelease(),
        { FAKE_GH_FAIL: "artifacts.json" },
        /GitHub request failed \(artifacts\)/,
      ],
      [
        "download HTTP error",
        goodRelease(),
        { FAKE_GH_FAIL: "artifact.zip" },
        /GitHub request failed \(artifact download\)/,
      ],
      [
        "GitHub unreachable",
        goodRelease(),
        { FAKE_GH: "" },
        /GitHub request failed \(workflow runs\)/,
      ],
      [
        "token rejected",
        goodRelease(),
        { FAKE_TOKEN: "another" },
        /GitHub request failed \(workflow runs\)/,
      ],
    ];
    try {
      for (const [name, data, extra, pattern] of cases) {
        rmSync(path.join(t.fake, "curl.log"), { force: true });
        const { runsTotal, ...env } = extra;
        publish(t, data);
        if (runsTotal) {
          writeFileSync(
            path.join(t.github, "runs.json"),
            JSON.stringify({
              total_count: runsTotal,
              workflow_runs: data.runs,
            }),
          );
        }
        const result = t.deployCommit(COMMIT, env);
        assert.equal(result.status, 1, `${name}: ${result.stderr}`);
        assert.match(result.stderr, pattern, name);
        assert.deepEqual(t.calls(), [], `${name}: Docker never called`);
        assert.equal(
          existsSync(path.join(t.releases, `${COMMIT}.json`)),
          false,
          name,
        );
        assert.equal(readFileSync(t.release, "utf8"), releaseLines(OLD), name);
        assert.equal(existsSync(path.join(t.dir, "pwned")), false, name);
        tokenNowhere(t, result);
      }
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);

test(
  "S9C commit mode: a missing local commit or a bad token file stops before any network call",
  { skip },
  () => {
    const t = setup();
    try {
      publish(t, goodRelease(MISSING_COMMIT));
      const absent = t.deployCommit(MISSING_COMMIT);
      assert.equal(absent.status, 1);
      assert.match(absent.stderr, /is not in .*git fetch first/);

      publish(t, goodRelease());
      const tokenCases = [
        [t.marker, /token file not readable/],
        [t.releases, /must be a regular file/],
      ];
      writeFileSync(path.join(t.dir, "two.token"), `${TOKEN}\n${TOKEN}\n`);
      tokenCases.push([path.join(t.dir, "two.token"), /exactly one token/]);
      writeFileSync(path.join(t.dir, "empty.token"), "\n");
      tokenCases.push([path.join(t.dir, "empty.token"), /exactly one token/]);
      writeFileSync(path.join(t.dir, "header.token"), `${TOKEN}\r\nX-Evil: 1`);
      tokenCases.push([path.join(t.dir, "header.token"), /exactly one token/]);
      if (process.platform !== "win32") {
        writeFileSync(path.join(t.dir, "open.token"), `${TOKEN}\n`);
        chmodSync(path.join(t.dir, "open.token"), 0o644);
        tokenCases.push([
          path.join(t.dir, "open.token"),
          /readable by group or others/,
        ]);
      }
      for (const [file, pattern] of tokenCases) {
        const result = t.deployCommit(COMMIT, { KFIT_GITHUB_TOKEN_FILE: file });
        assert.equal(result.status, 1, file);
        assert.match(result.stderr, pattern, file);
        tokenNowhere(t, result);
      }
      assert.deepEqual(t.curlCalls(), [], "no network call");
      assert.deepEqual(t.calls(), [], "Docker never called");
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  },
);
