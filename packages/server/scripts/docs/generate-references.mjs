/*
 * DOC-01 DC6: generates docs/reference/{codes-erreur,variables-environnement,scripts-npm}.md from the sources, reading them
 * as text (no build, no dependency): CI runs `docs:check` right after Typecheck, before any build.
 *   node generate-references.mjs           writes the three files
 *   node generate-references.mjs --check   regenerates into a temp dir and compares; also checks every relative link and
 *                                          the front matter of every docs/ page (DC3). Exit 1 on any drift or error.
 * Values are never read from .env: only .env.example (keys and comments) is parsed.
 */
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_FILES = [
  "codes-erreur.md",
  "variables-environnement.md",
  "scripts-npm.md",
];
export const GENERATED_NOTICE =
  "> Fichier généré - ne pas modifier à la main (npm run docs:generate).";
export const FRONT_MATTER_KEYS = [
  "titre",
  "public",
  "statut",
  "vérifié-sur",
  "couvre",
];
export const AUDIENCES = [
  "coach",
  "administrateur",
  "exploitation",
  "développeur",
  "juriste",
];
export const STATUSES = ["brouillon", "à jour", "à revoir"];

/** Server-only codes that must exist: a missing one is an error, never a silently shorter table. */
export const SERVER_CODE_SOURCES = [
  {
    file: "packages/server/src/runtime/production-guards.ts",
    name: "productionGuardCodes",
    kind: "array",
    module: "démarrage production (S7.4a)",
  },
  {
    file: "packages/server/src/ops/ops-errors.ts",
    name: "opsErrorCodes",
    kind: "array",
    module: "sauvegarde / restauration (S7.4b)",
  },
  {
    file: "packages/server/src/security/runtime-floor.startup.ts",
    name: "SECURITY_FLOOR_NOT_MET",
    kind: "string",
    module: "plancher de sécurité (SEC-01)",
  },
  {
    file: "packages/server/src/security/reject-encoded-request-bodies.ts",
    name: "REQUEST_ENCODING_UNSUPPORTED",
    kind: "string",
    module: "requêtes HTTP (SEC-01)",
  },
];

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** Items of a `["A", "B"]` body; throws unless every item is a double-quoted constant code. */
export function parseCodeList(body, label) {
  const items = stripComments(body)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) throw new Error(`${label}: empty list`);
  return items.map((item) => {
    const match = /^"([A-Z][A-Z0-9_]*)"$/.exec(item);
    if (!match)
      throw new Error(`${label}: unexpected item ${item.slice(0, 40)}`);
    return match[1];
  });
}

/** Every `export const <name>ErrorCodes = [ … ] as const` of a source; throws when a declaration does not parse. */
export function parseErrorCodeArrays(source, label) {
  const declared = [
    ...source.matchAll(/export const (\w+ErrorCodes)\s*=/g),
  ].map((match) => match[1]);
  const parsed = [
    ...source.matchAll(
      /export const (\w+ErrorCodes)\s*=\s*\[([^\]]*)\]\s*as const/g,
    ),
  ].map((match) => ({
    name: match[1],
    codes: parseCodeList(match[2], `${label} ${match[1]}`),
  }));
  const missing = declared.filter(
    (name) => !parsed.some((array) => array.name === name),
  );
  if (missing.length)
    throw new Error(
      `${label}: ${missing.join(", ")} not in the form export const …ErrorCodes = [ "…" ] as const`,
    );
  return parsed;
}

/** A named `export const NAME = [ … ] as const` array or `export const NAME = "…"` string; throws when absent. */
export function parseNamedCodes(source, { name, kind }, label) {
  if (kind === "string") {
    const match = new RegExp(
      `export const ${name}\\s*=\\s*"([A-Z][A-Z0-9_]*)"`,
    ).exec(source);
    if (!match) throw new Error(`${label}: ${name} not found`);
    return [match[1]];
  }
  const match = new RegExp(
    `export const ${name}\\s*=\\s*\\[([^\\]]*)\\]\\s*as const`,
  ).exec(source);
  if (!match) throw new Error(`${label}: ${name} not found`);
  return parseCodeList(match[1], `${label} ${name}`);
}

/** `CODE: "message"` / `"CODE": "message"` entries of the client message maps (several distinct wordings are all kept). */
export function parseClientMessages(sources) {
  const messages = new Map();
  for (const source of sources) {
    for (const match of source.matchAll(
      /(?<![\w.])"?([A-Z][A-Z0-9_]{2,})"?\s*:\s*"((?:[^"\\\n]|\\.)*)"/g,
    )) {
      const text = JSON.parse(`"${match[2]}"`);
      if (!messages.has(match[1])) messages.set(match[1], []);
      if (!messages.get(match[1]).includes(text))
        messages.get(match[1]).push(text);
    }
  }
  return messages;
}

/**
 * .env.example: group = first line of a comment block that follows a blank line (section heading, kept for the keys below
 * it); description = the other comment lines directly above the key (a key right after another key has none).
 */
export function parseEnvExample(text) {
  const entries = [];
  let group = "",
    block = [],
    previous = "blank";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      previous = "blank";
      continue;
    }
    if (line.startsWith("#")) {
      const comment = line.replace(/^#\s?/, "");
      if (previous === "blank") {
        group = comment;
        block = [];
      } else {
        if (previous === "key") block = [];
        block.push(comment);
      }
      previous = "comment";
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match)
      throw new Error(`.env.example: unreadable line ${line.slice(0, 30)}`);
    entries.push({
      key: match[1],
      group,
      description: previous === "comment" ? block.join(" ") : "",
    });
    previous = "key";
  }
  return entries;
}

/** PRODUCTION_REQUIRED_ENV, resolving the constants and the spread it is built from. */
export function parseRequiredEnv(guardsSource, journalSource) {
  const body =
    /export const PRODUCTION_REQUIRED_ENV\s*=\s*\[([^\]]*)\]\s*as const/.exec(
      guardsSource,
    )?.[1];
  const secrets =
    /export const PRODUCTION_SECRET_ENV\s*=\s*\[([^\]]*)\]\s*as const/.exec(
      guardsSource,
    )?.[1];
  const journalKey =
    /export const PRIVACY_JOURNAL_DIR_ENV\s*=\s*"([A-Z0-9_]+)"/.exec(
      journalSource,
    )?.[1];
  if (!body || !secrets || !journalKey)
    throw new Error(
      "PRODUCTION_REQUIRED_ENV, PRODUCTION_SECRET_ENV or PRIVACY_JOURNAL_DIR_ENV not found",
    );
  return stripComments(body)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      if (item === "PRIVACY_JOURNAL_DIR_ENV") return [journalKey];
      if (item === "...PRODUCTION_SECRET_ENV")
        return parseCodeList(secrets, "PRODUCTION_SECRET_ENV");
      const match = /^"([A-Z][A-Z0-9_]*)"$/.exec(item);
      if (!match)
        throw new Error(`PRODUCTION_REQUIRED_ENV: unexpected item ${item}`);
      return [match[1]];
    });
}

const cell = (text) =>
  String(text).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const frontMatter = (titre, publicName, couvre) =>
  [
    "---",
    `titre: ${titre}`,
    `public: ${publicName}`,
    "statut: à jour",
    "vérifié-sur: généré (npm run docs:check en CI)",
    `couvre: [${couvre.join(", ")}]`,
    "---",
    "",
  ].join("\n");

async function walk(dir, accept) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", "dist", "diffs"].includes(entry.name))
        out.push(...(await walk(full, accept)));
    } else if (accept(full)) out.push(full);
  }
  return out.sort();
}
const posix = (root, file) =>
  path.relative(root, file).split(path.sep).join("/");

export async function renderErrorCodes(root) {
  const sharedFiles = await walk(
    path.join(root, "packages/shared/src"),
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  const rows = [];
  for (const file of sharedFiles) {
    const module = path
      .relative(path.join(root, "packages/shared/src"), path.dirname(file))
      .split(path.sep)
      .join("/");
    for (const array of parseErrorCodeArrays(
      await readFile(file, "utf8"),
      posix(root, file),
    ))
      for (const code of array.codes)
        rows.push({
          code,
          module,
          source: `${posix(root, file)} · ${array.name}`,
        });
  }
  if (!rows.length)
    throw new Error("no *ErrorCodes array found in packages/shared/src");
  for (const source of SERVER_CODE_SOURCES) {
    for (const code of parseNamedCodes(
      await readFile(path.join(root, source.file), "utf8"),
      source,
      source.file,
    ))
      rows.push({
        code,
        module: source.module,
        source: `${source.file} · ${source.name}`,
      });
  }
  const clientFiles = await walk(
    path.join(root, "packages/client/src"),
    (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file),
  );
  const messages = parseClientMessages(
    await Promise.all(clientFiles.map((file) => readFile(file, "utf8"))),
  );
  const modules = [...new Set(rows.map((row) => row.module))];
  const lines = [
    frontMatter("Codes d'erreur", "développeur", ["DOC-01a"]),
    "# Codes d'erreur",
    "",
    GENERATED_NOTICE,
    "",
    "Sources : tableaux `…ErrorCodes` de `packages/shared/src`, codes serveur listés dans `scripts/docs/generate-references.mjs`. Message affiché : texte des tables de messages du client (`packages/client/src`), « - » quand le client n'en a pas (code non affiché tel quel ou message générique).",
    "",
    `${rows.length} codes, ${modules.length} modules.`,
    "",
  ];
  for (const module of modules) {
    const moduleRows = rows.filter((row) => row.module === module);
    lines.push(
      `## ${module}`,
      "",
      `Source : ${[...new Set(moduleRows.map((row) => `\`${row.source}\``))].join(", ")}`,
      "",
      "| Code | Message affiché |",
      "| --- | --- |",
    );
    for (const row of moduleRows)
      lines.push(
        `| \`${row.code}\` | ${cell(messages.get(row.code)?.join(" / ") ?? "-")} |`,
      );
    lines.push("");
  }
  return { text: lines.join("\n"), count: rows.length };
}

export async function renderEnvironment(root) {
  const entries = parseEnvExample(
    await readFile(path.join(root, ".env.example"), "utf8"),
  );
  const required = parseRequiredEnv(
    await readFile(
      path.join(root, "packages/server/src/runtime/production-guards.ts"),
      "utf8",
    ),
    await readFile(
      path.join(
        root,
        "packages/server/src/modules/privacy/services/privacy-journal.ts",
      ),
      "utf8",
    ),
  );
  const missing = required
    .filter((key) => !entries.some((entry) => entry.key === key))
    .map((key) => ({
      key,
      group: "",
      description: "Absente de .env.example : voir .env.prod.example.",
    }));
  const all = [...entries, ...missing];
  const lines = [
    frontMatter("Variables d'environnement", "exploitation", [
      "S7.4a",
      "S7.4b",
      "DOC-01a",
    ]),
    "# Variables d'environnement",
    "",
    GENERATED_NOTICE,
    "",
    "Source : clés et commentaires de `.env.example` (jamais les valeurs d'un `.env`). « Requis en production » = `PRODUCTION_REQUIRED_ENV` (`packages/server/src/runtime/production-guards.ts`) : l'API de production refuse de démarrer si la variable manque ou contient une valeur d'exemple. « Scripts ops » = lue par `ops:backup`, `ops:restore`, `ops:restore-drill`, pas par l'API.",
    "",
    `${all.length} variables.`,
    "",
    "| Variable | Groupe | Requis en production | Scripts ops | Description |",
    "| --- | --- | --- | --- | --- |",
    ...all.map(
      (entry) =>
        `| \`${entry.key}\` | ${cell(entry.group || "-")} | ${required.includes(entry.key) ? "oui" : "-"} | ${entry.key.startsWith("BACKUP_") ? "oui" : "-"} | ${cell(entry.description || "-")} |`,
    ),
    "",
  ];
  return { text: lines.join("\n"), count: all.length };
}

export async function renderScripts(root) {
  const manifests = [
    "package.json",
    "packages/shared/package.json",
    "packages/server/package.json",
    "packages/client/package.json",
  ];
  const lines = [
    frontMatter("Scripts npm", "développeur", ["DOC-01a"]),
    "# Scripts npm",
    "",
    GENERATED_NOTICE,
    "",
  ];
  let count = 0;
  const sections = [];
  for (const manifest of manifests) {
    const scripts =
      JSON.parse(await readFile(path.join(root, manifest), "utf8")).scripts ??
      {};
    const names = Object.keys(scripts);
    count += names.length;
    sections.push(
      `## \`${manifest}\``,
      "",
      manifest === "package.json"
        ? "Lancer depuis la racine : `npm run <script>`."
        : `Lancer depuis la racine : \`npm run <script> --workspace ${JSON.parse(await readFile(path.join(root, manifest), "utf8")).name}\`.`,
      "",
      "| Script | Commande |",
      "| --- | --- |",
      ...names.map((name) => `| \`${name}\` | \`${cell(scripts[name])}\` |`),
      "",
    );
  }
  lines.push(`${count} scripts.`, "", ...sections);
  return { text: lines.join("\n"), count };
}

export async function renderAll(root) {
  const [errors, env, scripts] = await Promise.all([
    renderErrorCodes(root),
    renderEnvironment(root),
    renderScripts(root),
  ]);
  return {
    files: {
      "codes-erreur.md": errors.text,
      "variables-environnement.md": env.text,
      "scripts-npm.md": scripts.text,
    },
    counts: {
      codes: errors.count,
      variables: env.count,
      scripts: scripts.count,
    },
  };
}

/** DC3: front matter with the five keys and allowed values. Returns problems as strings. */
export function checkFrontMatter(text, label) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!match) return [`${label}: front matter missing`];
  const fields = Object.fromEntries(
    match[1].split(/\r?\n/).map((line) => {
      const index = line.indexOf(":");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
  );
  const problems = FRONT_MATTER_KEYS.filter((key) => !fields[key]).map(
    (key) => `${label}: front matter key ${key} missing`,
  );
  if (
    fields.public &&
    !fields.public.split(/\s*,\s*/).every((value) => AUDIENCES.includes(value))
  )
    problems.push(
      `${label}: public "${fields.public}" not in ${AUDIENCES.join(" | ")}`,
    );
  if (fields.statut && !STATUSES.includes(fields.statut))
    problems.push(
      `${label}: statut "${fields.statut}" not in ${STATUSES.join(" | ")}`,
    );
  return problems;
}

/** Relative markdown links that do not resolve to a file or directory (http, mailto and #anchors are skipped). */
export async function brokenLinks(file, text) {
  const broken = [];
  const withoutCode = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  for (const match of withoutCode.matchAll(
    /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
  )) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = path.resolve(
      path.dirname(file),
      decodeURIComponent(target.split("#")[0].split("?")[0]),
    );
    if (
      !(await stat(resolved).then(
        () => true,
        () => false,
      ))
    )
      broken.push(target);
  }
  return broken;
}

async function main() {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const referenceDir = path.join(root, "docs", "reference");
  const check = process.argv.includes("--check");
  const { files, counts } = await renderAll(root);
  if (!check) {
    for (const [name, text] of Object.entries(files))
      await writeFile(path.join(referenceDir, name), text);
    console.log(
      `✔ docs:generate - ${counts.codes} codes, ${counts.variables} variables, ${counts.scripts} scripts`,
    );
    return;
  }
  const problems = [];
  const temp = await mkdtemp(path.join(tmpdir(), "kfit-docs-check-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      await writeFile(path.join(temp, name), text);
      const fresh = await readFile(path.join(temp, name), "utf8");
      const current = await readFile(
        path.join(referenceDir, name),
        "utf8",
      ).catch(() => null);
      if (current === null)
        problems.push(
          `docs/reference/${name}: missing (npm run docs:generate)`,
        );
      else if (current.replace(/\r\n/g, "\n") !== fresh)
        problems.push(
          `docs/reference/${name}: out of date (npm run docs:generate)`,
        );
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  const pages = await walk(path.join(root, "docs"), (file) =>
    file.endsWith(".md"),
  );
  for (const file of [...pages, path.join(root, "README.md")]) {
    const text = await readFile(file, "utf8");
    const label = posix(root, file);
    if (file !== path.join(root, "README.md"))
      problems.push(...checkFrontMatter(text, label));
    for (const target of await brokenLinks(file, text))
      problems.push(`${label}: broken link ${target}`);
  }
  if (problems.length) {
    console.error(`✖ docs:check - ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `✔ docs:check - references up to date (${counts.codes} codes, ${counts.variables} variables, ${counts.scripts} scripts), ${pages.length} pages, links and front matter ok`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`✖ docs - ${error.message}`);
    process.exit(1);
  });
}
