import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/*
 * Dev API with reload: `tsc --watch` keeps dist/ current and `node --watch-path` restarts api-server.mjs when dist/
 * changes, so the running API never serves code older than the sources. The first build runs before the API starts.
 */
const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const children = [];

function run(args, label) {
  const child = spawn(process.execPath, args, {
    cwd: serverRoot,
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (stopping) return;
    console.error(
      `✖ ${label} exited (${code ?? "signal"}); stopping the dev API watch.`,
    );
    stop(code ?? 1);
  });
  return child;
}

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

const firstBuild = spawn(process.execPath, [tsc], {
  cwd: serverRoot,
  stdio: "inherit",
});
firstBuild.on("exit", (code) => {
  if (code !== 0) {
    console.error("✖ First build failed; fix the type errors and retry.");
    process.exit(code ?? 1);
  }
  run([tsc, "--watch", "--preserveWatchOutput"], "tsc --watch");
  run(
    [
      "--watch-path=./dist",
      "--watch-preserve-output",
      "./scripts/dev/api-server.mjs",
    ],
    "dev API",
  );
});
