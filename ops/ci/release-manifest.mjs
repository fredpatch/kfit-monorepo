// S9A.2b: merge api/client/ops GHCR digest records into one deployment manifest.
// Usage: node release-manifest.mjs <parts-dir> <output-file>
import fs from "node:fs";
import path from "node:path";

const [dir, output] = process.argv.slice(2);
const {
  GITHUB_REPOSITORY: repository,
  GITHUB_SHA: commit,
  GITHUB_SERVER_URL: server,
  GITHUB_RUN_ID: run,
} = process.env;

if (!dir || !output || !/^[a-f0-9]{40}$/.test(commit || "")) {
  throw new Error(
    "usage: release-manifest.mjs <parts-dir> <output>, with GITHUB_SHA set",
  );
}
if (repository !== "fredpatch/kfit-monorepo") {
  throw new Error("unexpected repository");
}

const expected = ["api", "client", "ops"];
const images = {};
const files = fs
  .readdirSync(dir)
  .filter((file) => file.endsWith(".json"))
  .sort();

for (const file of files) {
  const part = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!expected.includes(part.image)) {
    throw new Error(`unexpected image kind: ${part.image}`);
  }
  if (images[part.image]) {
    throw new Error(`duplicate image kind: ${part.image}`);
  }

  const prefix = `ghcr.io/${repository}/${part.image}@sha256:`;
  const digest =
    typeof part.ref === "string" ? part.ref.slice(prefix.length) : "";
  if (!part.ref?.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`unexpected reference for ${part.image}`);
  }

  const expectedTag = `ghcr.io/${repository}/${part.image}:sha-${commit}`;
  if (part.tag !== expectedTag) {
    throw new Error(`tag for ${part.image} is not this commit`);
  }

  images[part.image] = { ref: part.ref, tag: part.tag };
}

if (
  Object.keys(images).sort().join(",") !== expected.slice().sort().join(",")
) {
  throw new Error("manifest needs exactly api, client and ops");
}

const manifest = {
  repository,
  commit,
  workflow_run: `${server}/${repository}/actions/runs/${run}`,
  created: new Date().toISOString(),
  images,
  compose_env: {
    KFIT_API_IMAGE: images.api.ref,
    KFIT_CLIENT_IMAGE: images.client.ref,
    KFIT_OPS_IMAGE: images.ops.ref,
  },
};

fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `release manifest for ${commit}: ${Object.keys(images).join(", ")}`,
);
