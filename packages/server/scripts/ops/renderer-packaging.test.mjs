import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
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
 * S9B: PDF rendering runs in its own internal service. The API keeps no browser and no extra capability; the renderer
 * has no data access and no port; the release manifest and the backup scheduler know the fourth image.
 */

const repoFile = (file) =>
  readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8").replace(
    /\r\n/g,
    "\n",
  );
/** Configuration only: comment lines (YAML / Dockerfile `#`) may name what is forbidden. */
const withoutComments = (text) =>
  text
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
const repoPath = (file) =>
  fileURLToPath(new URL(`../../../../${file}`, import.meta.url));

/** A service block of docker-compose.prod.yml, up to the next service or top-level key. */
const service = (name) => {
  const compose = withoutComments(repoFile("docker-compose.prod.yml"));
  const start = compose.indexOf(`\n  ${name}:\n`);
  assert.ok(start > 0, `${name} service present`);
  const rest = compose.slice(start + 1);
  const end = rest.slice(1).search(/\n {2}[a-z][a-z-]*:\n|\n[a-z][a-z-]*:\n/);
  return rest.slice(0, end === -1 ? undefined : end + 1);
};

test("S9B: the API service has no SYS_ADMIN, no browser runtime settings, and reaches the renderer by its internal URL", () => {
  const api = service("api");
  assert.doesNotMatch(
    api,
    /cap_add|SYS_ADMIN|shm_size|init: true|privileged|seccomp/,
  );
  assert.match(api, /PDF_RENDERER_URL: http:\/\/renderer:3100/);
  assert.match(api, /renderer:\s+condition: service_healthy/);
});

test("S9B: the renderer is internal only, without data, secrets, mounts or ports, and alone holds SYS_ADMIN for Chromium's sandbox", () => {
  const renderer = service("renderer");
  assert.match(
    renderer,
    /image: \$\{KFIT_RENDERER_IMAGE:-kfit-prod-renderer:local\}/,
  );
  assert.match(renderer, /target: renderer/);
  assert.match(renderer, /cap_add:\s+- SYS_ADMIN\n/);
  assert.match(renderer, /init: true/);
  assert.match(renderer, /shm_size: "256mb"/);
  assert.match(renderer, /networks:\s+- kfit_backend\n/);
  assert.match(renderer, /expose:\s+- "3100"/);
  assert.match(renderer, /healthcheck:[\s\S]*127\.0\.0\.1:3100\/health/);
  for (const forbidden of [
    /env_file/,
    /\n {4}ports:/,
    /\n {4}volumes:/,
    /kfit_edge/,
    /DATABASE_URL|SMTP_|AUTH_|BACKUP_|POSTGRES_/,
    /\/srv\/kfit/,
    /privileged|seccomp|no-sandbox/,
  ])
    assert.doesNotMatch(renderer, forbidden, String(forbidden));
  const compose = withoutComments(repoFile("docker-compose.prod.yml"));
  assert.equal(
    (compose.match(/^\s+- SYS_ADMIN$/gm) ?? []).length,
    1,
    "SYS_ADMIN is granted once, to the renderer",
  );
});

test("S9B: the API image ships no browser and the renderer image only the renderer", () => {
  const dockerfile = withoutComments(repoFile("packages/server/Dockerfile"));
  const stage = (name) => {
    const start = dockerfile.indexOf(`AS ${name}\n`);
    const next = dockerfile.indexOf("\nFROM ", start);
    return dockerfile.slice(start, next === -1 ? undefined : next);
  };
  const api = stage("runtime");
  assert.doesNotMatch(
    api,
    /\/opt\/puppeteer|PUPPETEER_CACHE_DIR|libgtk|libnss3|fonts-/,
  );
  assert.match(
    api,
    /rm -f \/app\/packages\/server\/dist\/pdf-renderer\/html-to-pdf\.\*/,
  );
  assert.match(api, /USER node/);
  const renderer = stage("renderer");
  assert.match(renderer, /COPY --from=deps \/opt\/puppeteer \/opt\/puppeteer/);
  assert.match(
    renderer,
    /COPY --from=build \/app\/packages\/server\/dist\/pdf-renderer /,
  );
  assert.doesNotMatch(
    renderer,
    /COPY --from=build \/app\/packages\/server\/dist \./,
  );
  assert.doesNotMatch(renderer, /packages\/shared/);
  assert.match(renderer, /USER node/);
  assert.match(
    renderer,
    /CMD \["node", "scripts\/prod\/pdf-renderer-server\.mjs"\]/,
  );
  assert.doesNotMatch(dockerfile, /--no-sandbox|privileged|seccomp=unconfined/);
});

test("S9B: images are published and verified for api, client, ops and renderer; the renderer preflight runs real Chromium", () => {
  const workflow = repoFile(".github/workflows/publish-images.yml");
  for (const image of ["api", "client", "ops", "renderer"])
    assert.match(workflow, new RegExp(`- image: ${image}\\n`), image);
  assert.match(
    workflow,
    /if: matrix\.image == 'renderer'[\s\S]*node scripts\/preflight\/pdf\.mjs/,
  );
  assert.doesNotMatch(workflow, /matrix\.image == 'api'[\s\S]{0,80}preflight/);
});

const manifestPart = (dir, image, commit) => {
  const repo = "ghcr.io/fredpatch/kfit-monorepo";
  writeFileSync(
    path.join(dir, `${image}.json`),
    JSON.stringify({
      image,
      ref: `${repo}/${image}@sha256:${image[0].repeat(64).replace(/[^0-9a-f]/g, "a")}`,
      tag: `${repo}/${image}:sha-${commit}`,
    }),
  );
};

test("S9B: the release manifest needs all four images and its compose_env is exactly the four image refs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "kfit-manifest-"));
  const commit = "0123456789abcdef0123456789abcdef01234567";
  const assemble = () =>
    spawnSync(
      process.execPath,
      [
        repoPath("ops/ci/release-manifest.mjs"),
        dir,
        path.join(dir, "out", "m.json"),
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_REPOSITORY: "fredpatch/kfit-monorepo",
          GITHUB_SHA: commit,
          GITHUB_SERVER_URL: "https://github.com",
          GITHUB_RUN_ID: "1",
        },
      },
    );
  try {
    mkdirSync(path.join(dir, "out"));
    for (const image of ["api", "client", "ops"])
      manifestPart(dir, image, commit);
    const missing = assemble();
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /exactly api, client, ops and renderer/);

    manifestPart(dir, "renderer", commit);
    const ok = assemble();
    assert.equal(ok.status, 0, ok.stderr);
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "out", "m.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(manifest.compose_env).sort(), [
      "KFIT_API_IMAGE",
      "KFIT_CLIENT_IMAGE",
      "KFIT_OPS_IMAGE",
      "KFIT_RENDERER_IMAGE",
    ]);
    for (const [key, ref] of Object.entries(manifest.compose_env))
      assert.match(
        ref,
        /^ghcr\.io\/fredpatch\/kfit-monorepo\/[a-z]+@sha256:[0-9a-f]{64}$/,
        key,
      );
    assert.equal(
      manifest.compose_env.KFIT_RENDERER_IMAGE,
      manifest.images.renderer.ref,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
