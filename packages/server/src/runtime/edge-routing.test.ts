import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as shared from "@kfit/shared";

/*
 * S9A.3: ops/nginx/kfitpulse.conf decides, path by path, whether a browser request reaches the API or the SPA.
 * This resolves every shared API route and every client route through the HTTPS server block with nginx's own
 * location precedence, including the automatic 301 nginx adds for a proxied prefix location ending in "/".
 */

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

type Location = {
  modifier: "=" | "^~" | "~" | "";
  pattern: string;
  upstream: string;
};

const edgeLocations = (): Location[] => {
  const conf = repoFile("ops/nginx/kfitpulse.conf");
  const server = conf.slice(conf.indexOf("server_name kfitpulse.io;"));
  return [
    ...server.matchAll(/location\s+(=|\^~|~)?\s*(\S+)\s*\{([^}]*)\}/g),
  ].map(([, modifier = "", pattern, body]) => ({
    modifier: modifier as Location["modifier"],
    pattern: pattern!,
    upstream: /proxy_pass\s+http:\/\/(\w+)/.exec(body!)?.[1] ?? "none",
  }));
};

type Outcome = { upstream: string } | { redirect: string };

/** nginx location selection: exact, longest prefix (^~ stops), regexes in order, else the longest prefix. */
const resolve = (locations: Location[], uri: string): Outcome => {
  const exact = locations.find((l) => l.modifier === "=" && l.pattern === uri);
  if (exact) return { upstream: exact.upstream };
  const prefixes = locations.filter(
    (l) => l.modifier === "" || l.modifier === "^~",
  );
  const redirecting = prefixes.find(
    (l) =>
      l.upstream !== "none" &&
      l.pattern.endsWith("/") &&
      l.pattern.slice(0, -1) === uri,
  );
  if (redirecting) return { redirect: redirecting.pattern };
  const longest = prefixes
    .filter((l) => uri.startsWith(l.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  if (longest?.modifier === "^~") return { upstream: longest.upstream };
  const regex = locations.find(
    (l) => l.modifier === "~" && new RegExp(l.pattern).test(uri),
  );
  if (regex) return { upstream: regex.upstream };
  return { upstream: longest?.upstream ?? "none" };
};

/** Where the browser finally lands, following nginx's own slash redirects. */
const landsOn = (locations: Location[], uri: string) => {
  let outcome = resolve(locations, uri);
  for (let hops = 0; "redirect" in outcome && hops < 3; hops++)
    outcome = resolve(locations, outcome.redirect);
  return "upstream" in outcome ? outcome.upstream : "redirect loop";
};

const routeStrings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(routeStrings)
      : [];

// devToolsApiRoutes is never mounted in production (runtime.express.integration.ts).
const productionApiPaths = [
  "/health",
  ...Object.entries(shared)
    .filter(
      ([name]) => name.endsWith("ApiRoutes") && name !== "devToolsApiRoutes",
    )
    .flatMap(([, routes]) => routeStrings(routes))
    .filter((path) => path.startsWith("/")),
].map((path) => path.replace(/:\w+/g, "x"));

const routerPaths = (file: string) =>
  [
    ...repoFile(`packages/client/src/app/router/${file}`).matchAll(
      /path="([^"]+)"/g,
    ),
  ]
    .map(([, path]) => path!)
    .filter((path) => path !== "*" && path !== "/admin");

const spaPaths = [
  "/",
  "/admin",
  "/admin/",
  ...routerPaths("public-routes.tsx"),
  ...[
    ...routerPaths("admin-routes.tsx"),
    ...routerPaths("legacy-routes.tsx"),
  ].map((path) => `/admin/${path}`),
]
  .map((path) => path.replace(/:\w+/g, "x"))
  .flatMap((path) =>
    path === "/" || path.endsWith("/") ? [path] : [path, `${path}/`],
  );

test("S9A.3: /admin/supervision with or without a trailing slash is the SPA page, never a redirect to the API", () => {
  const locations = edgeLocations();
  for (const uri of ["/admin/supervision", "/admin/supervision/"])
    assert.deepEqual(resolve(locations, uri), { upstream: "kfit_client" }, uri);
});

test("S9A.3: every supervision API endpoint reaches the API", () => {
  const locations = edgeLocations();
  const supervision = routeStrings(shared.supervisionApiRoutes).map((path) =>
    path.replace(/:\w+/g, "x"),
  );
  assert.ok(supervision.length >= 5);
  for (const uri of supervision)
    assert.deepEqual(resolve(locations, uri), { upstream: "kfit_api" }, uri);
});

test("S9A.3: every production API route is proxied to the API", () => {
  const locations = edgeLocations();
  assert.ok(productionApiPaths.length > 150, String(productionApiPaths.length));
  const missed = productionApiPaths.filter(
    (uri) => landsOn(locations, uri) !== "kfit_api",
  );
  assert.deepEqual(missed, []);
});

test("S9A.3: no client route, with or without a trailing slash, is captured by an API location", () => {
  const locations = edgeLocations();
  assert.ok(spaPaths.includes("/admin/supervision/"));
  assert.ok(spaPaths.length > 40, String(spaPaths.length));
  const captured = spaPaths.filter(
    (uri) => landsOn(locations, uri) !== "kfit_client",
  );
  assert.deepEqual(captured, []);
});
