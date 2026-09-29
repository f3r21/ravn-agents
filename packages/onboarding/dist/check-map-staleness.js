// src/hook.ts
import { readFileSync as readFileSync2 } from "node:fs";

// src/build.ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// src/areas.ts
import { createHash } from "node:crypto";
var DEFAULT_AREA_OPTIONS = {
  maxFiles: 50,
  minFiles: 3,
  maxDepth: 3,
  exclude: []
};
function matchesPattern(file, pattern) {
  if (pattern === "*") return !file.includes("/");
  if (pattern.endsWith("/*")) {
    const dir = pattern.slice(0, -1);
    return file.startsWith(dir) && !file.slice(dir.length).includes("/");
  }
  if (pattern.endsWith("/")) return file.startsWith(pattern);
  return file === pattern;
}
function inArea(file, paths) {
  return paths.some((p) => matchesPattern(file, p));
}
function isExcluded(file, exclude) {
  return exclude.some((prefix) => file === prefix || file.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}
function slugify(text) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug === "" ? "root" : slug;
}
function detectAreas(allFiles, options = {}) {
  const opts = { ...DEFAULT_AREA_OPTIONS, ...options };
  const files = allFiles.filter((f) => !isExcluded(f, opts.exclude)).sort();
  const areas = [];
  const partition = (dir, dirFiles, depth) => {
    const splittable = depth === 0 || dirFiles.length > opts.maxFiles && depth < opts.maxDepth;
    if (!splittable) {
      areas.push({ slug: slugify(dir), title: dir, paths: [`${dir}/`] });
      return;
    }
    const prefix = dir === "" ? "" : `${dir}/`;
    const loose = [];
    const groups = /* @__PURE__ */ new Map();
    for (const file of dirFiles) {
      const rest = file.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) {
        loose.push(file);
        continue;
      }
      const child = `${prefix}${rest.slice(0, slash)}`;
      const group = groups.get(child) ?? [];
      group.push(file);
      groups.set(child, group);
    }
    const remainder = loose.length > 0 ? [dir === "" ? "*" : `${dir}/*`] : [];
    for (const [child, childFiles] of groups) {
      if (childFiles.length < opts.minFiles) remainder.push(`${child}/`);
      else partition(child, childFiles, depth + 1);
    }
    if (remainder.length > 0) {
      areas.push({
        slug: dir === "" ? "root" : slugify(dir),
        title: dir === "" ? "Repository root" : `${dir} (top level)`,
        paths: remainder
      });
    }
  };
  partition("", files, 0);
  return dedupeSlugs(areas).sort((a, b) => a.slug.localeCompare(b.slug));
}
function dedupeSlugs(areas) {
  const seen = /* @__PURE__ */ new Map();
  return areas.map((area) => {
    const count = seen.get(area.slug) ?? 0;
    seen.set(area.slug, count + 1);
    return count === 0 ? area : { ...area, slug: `${area.slug}-${count + 1}` };
  });
}
function areaHash(entries, paths, exclude = []) {
  const lines = entries.filter((e) => inArea(e.path, paths) && !isExcluded(e.path, exclude)).map((e) => `${e.hash} ${e.path}`).sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

// src/citations.ts
var CITATION = /`([^`\s]+?):(\d+)(?:-(\d+))?`/g;
function parseCitations(text) {
  const citations = [];
  for (const match of text.matchAll(CITATION)) {
    const [raw, path, start, end] = match;
    if (!path || !start || path.includes("://")) continue;
    const startLine = Number(start);
    citations.push({ raw, path: path.replace(/^\.\//, ""), start: startLine, end: end ? Number(end) : startLine });
  }
  return citations;
}

// src/draft.ts
var REQUIRED_SECTIONS = ["Summary", "Key files", "How it works"];
var OPTIONAL_SECTIONS = ["Gotchas"];
var KNOWN_SECTIONS = /* @__PURE__ */ new Set([...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS]);

// src/git.ts
import { execFileSync } from "node:child_process";
var GitError = class extends Error {
  constructor(message, args) {
    super(message);
    this.args = args;
    this.name = "GitError";
  }
};
function gitAt(root) {
  return {
    root,
    run(args) {
      try {
        return execFileSync("git", ["-C", root, ...args], {
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (error) {
        const stderr = error.stderr ?? "";
        throw new GitError(`git ${args.join(" ")} failed: ${stderr.trim() || String(error)}`, args);
      }
    }
  };
}
function findRepoRoot(cwd2) {
  try {
    return execFileSync("git", ["-C", cwd2, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return void 0;
  }
}
function headSha(git) {
  return git.run(["rev-parse", "HEAD"]).trim();
}
function commitExists(git, sha) {
  try {
    git.run(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}
function parseLsTree(output) {
  const entries = [];
  for (const record of output.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("	");
    const [mode, type, hash] = record.slice(0, tab).split(" ");
    if (tab < 0 || mode === void 0 || type === void 0 || hash === void 0) {
      throw new Error(`unexpected ls-tree record: ${record}`);
    }
    entries.push({ mode, type, hash, path: record.slice(tab + 1) });
  }
  return entries;
}
function listTree(git, rev) {
  return parseLsTree(git.run(["ls-tree", "-r", "-z", rev]));
}

// src/page.ts
var FACTS_HEADING = "## Generated facts";
function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match?.[1]) return { meta: {}, body: text };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw;
    }
  }
  return { meta, body: text.slice(match[0].length) };
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
function readAreaMeta(text) {
  const { meta } = parseFrontmatter(text);
  const str = (key) => typeof meta[key] === "string" ? meta[key] : void 0;
  const area = str("area");
  const title = str("title");
  const treeHash = str("tree_hash");
  const sha = str("built_at_sha");
  const builtAt = str("built_at");
  const status = str("status");
  if (!area || !title || !treeHash || !sha || !builtAt || !isStringArray(meta.paths)) {
    return "frontmatter is missing one of area, title, paths, tree_hash, built_at_sha, built_at";
  }
  if (status !== "ok" && status !== "missing") return `unknown status "${String(meta.status)}"`;
  const reason = str("reason");
  return {
    area,
    title,
    paths: meta.paths,
    tree_hash: treeHash,
    built_at_sha: sha,
    built_at: builtAt,
    status,
    summary: str("summary") ?? "",
    ...reason ? { reason } : {},
    generator: str("generator") ?? ""
  };
}
function proseOf(pageBody) {
  const cut = pageBody.indexOf(`
${FACTS_HEADING}`);
  return cut >= 0 ? pageBody.slice(0, cut) : pageBody;
}

// src/staleness.ts
function blobMap(entries) {
  return new Map(entries.map((e) => [e.path, e.hash]));
}
function compareMap(input2) {
  const headBlobs = blobMap(input2.headEntries);
  const stale = [];
  const notCovered = [];
  const notes = [];
  const missingCommits = /* @__PURE__ */ new Set();
  for (const { meta, citedPaths } of input2.pages) {
    if (meta.status === "missing") {
      notCovered.push({ slug: meta.area, reason: meta.reason ?? "no validated prose" });
      continue;
    }
    const reasons = [];
    if (areaHash(input2.headEntries, meta.paths, input2.exclude) !== meta.tree_hash) {
      reasons.push("files in the area changed");
    }
    const then = input2.blobsAt(meta.built_at_sha);
    if (then === void 0) {
      missingCommits.add(meta.built_at_sha);
    } else {
      const outside = [...new Set(citedPaths)].filter((p) => !inArea(p, meta.paths));
      const changed = outside.filter((p) => then.get(p) !== headBlobs.get(p)).sort();
      if (changed.length > 0) {
        const shown = changed.slice(0, 3).join(", ");
        reasons.push(`cited files outside the area changed: ${shown}${changed.length > 3 ? ` (+${changed.length - 3} more)` : ""}`);
      }
    }
    if (reasons.length > 0) stale.push({ slug: meta.area, title: meta.title, reasons });
  }
  for (const sha of missingCommits) {
    notes.push(`build commit ${sha.slice(0, 12)} is not in this clone; cited files outside an area were not checked`);
  }
  const known = new Set(input2.pages.map((p) => p.meta.area));
  const detectedSlugs = new Set(input2.detected.map((a) => a.slug));
  return {
    mapSha: input2.mapSha,
    head: input2.head,
    total: input2.pages.length,
    stale,
    notCovered,
    newAreas: input2.detected.filter((a) => !known.has(a.slug)).map((a) => ({ slug: a.slug, paths: a.paths })),
    removedAreas: [...known].filter((slug) => !detectedSlugs.has(slug)).sort(),
    invalidPages: input2.invalidPages ?? [],
    notes
  };
}
function isFresh(report) {
  return report.stale.length === 0 && report.notCovered.length === 0 && report.newAreas.length === 0 && report.removedAreas.length === 0 && report.invalidPages.length === 0;
}
function short(sha) {
  return sha ? sha.slice(0, 7) : "unknown";
}
function formatReport(report) {
  const where = `built at ${short(report.mapSha)}, HEAD ${short(report.head)}`;
  if (isFresh(report)) {
    return `codebase-map: docs/codebase-map/ is fresh (${report.total} areas, ${where}). It is not loaded automatically; use the ask-codebase skill to route questions through it.`;
  }
  const parts = [];
  if (report.stale.length > 0) {
    const list = report.stale.map((s) => `${s.slug} (${s.reasons.join("; ")})`).join(", ");
    parts.push(`${report.stale.length} of ${report.total} areas stale: ${list}`);
  }
  if (report.notCovered.length > 0) parts.push(`not covered: ${report.notCovered.map((s) => s.slug).join(", ")}`);
  if (report.newAreas.length > 0) parts.push(`new areas with no page: ${report.newAreas.map((s) => s.slug).join(", ")}`);
  if (report.removedAreas.length > 0) parts.push(`pages for areas that no longer exist: ${report.removedAreas.join(", ")}`);
  if (report.invalidPages.length > 0) parts.push(`unreadable pages: ${report.invalidPages.map((p) => p.file).join(", ")}`);
  const notes = report.notes.length > 0 ? ` Note: ${report.notes.join("; ")}.` : "";
  return `codebase-map: ${parts.join("; ")} (${where}). Treat those pages as possibly wrong and confirm against the code. To re-map only these areas, run /ravn-agents:onboard --refresh.${notes}`;
}

// src/build.ts
var MAP_DIR = "docs/codebase-map";
var AREAS_DIR = `${MAP_DIR}/areas`;
var BUILD_DIR = `${MAP_DIR}/.build`;
var PLAN_FILE = `${BUILD_DIR}/plan.json`;
var EXCLUDE = [MAP_DIR];
function readIfExists(root, relative) {
  const full = join(root, relative);
  return existsSync(full) ? readFileSync(full, "utf8") : void 0;
}
function repoFiles(entries) {
  return entries.map((e) => e.path).filter((p) => !isExcluded(p, EXCLUDE));
}
function mapExists(root) {
  return existsSync(join(root, MAP_DIR, "INDEX.md"));
}
function loadMap(root) {
  const index = readIfExists(root, `${MAP_DIR}/INDEX.md`);
  const indexSha = index === void 0 ? void 0 : parseFrontmatter(index).meta.built_at_sha;
  const pages = [];
  const invalid = [];
  const dir = join(root, AREAS_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    const meta = readAreaMeta(text);
    if (typeof meta === "string") {
      invalid.push({ file: `${AREAS_DIR}/${file}`, error: meta });
      continue;
    }
    const prose = proseOf(parseFrontmatter(text).body);
    pages.push({ meta, citedPaths: parseCitations(prose).map((c) => c.path) });
  }
  return { mapSha: typeof indexSha === "string" ? indexSha : void 0, pages, invalid };
}
function blobsAtFactory(git) {
  const cache = /* @__PURE__ */ new Map();
  return (sha) => {
    if (!cache.has(sha)) cache.set(sha, commitExists(git, sha) ? blobMap(listTree(git, sha)) : void 0);
    return cache.get(sha);
  };
}
function mapStatus(root) {
  if (!mapExists(root)) return void 0;
  const git = gitAt(root);
  const head = headSha(git);
  const headEntries = listTree(git, head);
  const map = loadMap(root);
  return compareMap({
    head,
    mapSha: map.mapSha,
    headEntries,
    detected: detectAreas(repoFiles(headEntries), { exclude: EXCLUDE }),
    pages: map.pages,
    invalidPages: map.invalid,
    exclude: EXCLUDE,
    blobsAt: blobsAtFactory(git)
  });
}

// src/session-start.ts
function sessionStartOutput(cwd2) {
  const root = findRepoRoot(cwd2);
  if (root === void 0) return void 0;
  const report = mapStatus(root);
  if (report === void 0) return void 0;
  const message = formatReport(report);
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
    ...isFresh(report) ? {} : { systemMessage: message }
  };
}

// src/hook.ts
function readInput() {
  if (process.stdin.isTTY) return {};
  try {
    const raw = readFileSync2(0, "utf8");
    return raw.trim() === "" ? {} : JSON.parse(raw);
  } catch {
    return {};
  }
}
var input = readInput();
var cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
try {
  const output = sessionStartOutput(cwd);
  if (output) process.stdout.write(JSON.stringify(output));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    JSON.stringify({ systemMessage: `codebase-map: staleness check failed (${reason.slice(0, 200)}); treat the map as possibly stale.` })
  );
}
process.exitCode = 0;
