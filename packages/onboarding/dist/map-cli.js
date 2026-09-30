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
function filesInArea(files, paths, exclude = []) {
  return files.filter((f) => inArea(f, paths) && !isExcluded(f, exclude));
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
function countLines(content) {
  if (content === "") return 0;
  const lines = content.split("\n");
  return content.endsWith("\n") ? lines.length - 1 : lines.length;
}
function checkCitation(citation, lineCount) {
  const lines = lineCount(citation.path);
  if (lines === void 0) return `${citation.raw}: file does not exist at the stamped SHA`;
  if (citation.start < 1) return `${citation.raw}: line numbers start at 1`;
  if (citation.end < citation.start) return `${citation.raw}: range ends before it starts`;
  if (citation.end > lines) return `${citation.raw}: file has only ${lines} lines`;
  return void 0;
}
function checkCitations(citations, lineCount) {
  return citations.map((c) => checkCitation(c, lineCount)).filter((e) => e !== void 0);
}

// src/draft.ts
var REQUIRED_SECTIONS = ["Summary", "Key files", "How it works"];
var OPTIONAL_SECTIONS = ["Gotchas"];
var KNOWN_SECTIONS = /* @__PURE__ */ new Set([...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS]);
var DEFAULT_DRAFT_LIMITS = { maxLines: 90, maxChars: 9e3 };
function splitClaims(lines) {
  const claims = [];
  const headings = [];
  const stray = [];
  let section;
  let current;
  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const lineNo = index + 1;
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      section = heading[1].trim();
      headings.push({ name: section, line: lineNo });
      current = void 0;
      return;
    }
    if (line.trim() === "") {
      if (section === "Summary") current = void 0;
      return;
    }
    if (section === void 0) {
      stray.push(lineNo);
      return;
    }
    const startsBullet = /^\s*[-*]\s+/.test(line);
    const continuation = current !== void 0 && !startsBullet && (/^\s{2,}\S/.test(line) || section === "Summary");
    if (continuation && current) {
      current.text += ` ${line.trim()}`;
      return;
    }
    current = { section, line: lineNo, text: line.trim() };
    claims.push(current);
  });
  return { claims, headings, stray };
}
function firstSentence(text) {
  const plain = text.replace(/\s*\(?`[^`\s]+?:\d+(?:-\d+)?`\)?/g, "").replace(/\s+/g, " ").trim();
  const end = plain.search(/\.(\s|$)/);
  const sentence = end >= 0 ? plain.slice(0, end + 1) : plain;
  return sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}...` : sentence;
}
function checkDraft(draft, limits = DEFAULT_DRAFT_LIMITS) {
  const errors = [];
  const body = draft.replace(/\r\n/g, "\n").replace(/^\s*#\s+[^\n]*\n/, "").trim();
  const lines = body.split("\n");
  if (lines.length > limits.maxLines) errors.push(`draft has ${lines.length} lines; the limit is ${limits.maxLines}`);
  if (body.length > limits.maxChars) errors.push(`draft has ${body.length} characters; the limit is ${limits.maxChars}`);
  const { claims, headings, stray } = splitClaims(lines);
  if (stray.length > 0) errors.push(`text before the first "## " heading (line ${stray[0]})`);
  const seen = /* @__PURE__ */ new Set();
  for (const heading of headings) {
    if (!KNOWN_SECTIONS.has(heading.name)) {
      errors.push(`line ${heading.line}: unknown section "${heading.name}"; allowed: ${[...KNOWN_SECTIONS].join(", ")}`);
    }
    if (seen.has(heading.name)) errors.push(`line ${heading.line}: section "${heading.name}" appears twice`);
    seen.add(heading.name);
  }
  for (const required of REQUIRED_SECTIONS) {
    if (!seen.has(required)) errors.push(`missing section "${required}"`);
    else if (!claims.some((c) => c.section === required)) errors.push(`section "${required}" is empty`);
  }
  for (const claim of claims) {
    if (parseCitations(claim.text).length === 0) {
      errors.push(`line ${claim.line} (${claim.section}): claim has no \`path:line\` citation: "${claim.text.slice(0, 80)}"`);
    }
  }
  const summaryClaim = claims.find((c) => c.section === "Summary");
  return {
    errors,
    summary: summaryClaim ? firstSentence(summaryClaim.text) : "",
    citations: parseCitations(body),
    body: body.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n") + "\n"
  };
}

// src/facts.ts
var SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
var TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$)|(?:^|\/)(?:__tests__|__mocks__)\//;
var ENTRY_FILE = /(?:^|\/)(?:main|index|server|app|cli)\.[cm]?[jt]sx?$/;
var EXPORT_DECLARATION = /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
var EXPORT_DEFAULT_EXPRESSION = /^export\s+default\s+(?!function|class|async|abstract)/;
function isTestFile(path) {
  return TEST_FILE.test(path);
}
function scanExports(path, source) {
  const facts = [];
  const lines = source.split("\n");
  lines.forEach((text, index) => {
    const declaration = EXPORT_DECLARATION.exec(text);
    if (declaration?.[1] && declaration[2]) {
      facts.push({ name: declaration[2], kind: declaration[1].replace("*", ""), path, line: index + 1 });
    } else if (EXPORT_DEFAULT_EXPRESSION.test(text)) {
      facts.push({ name: "default", kind: "default", path, line: index + 1 });
    }
  });
  return facts;
}
function jsonKeyLine(source, key, after = 0) {
  const lines = source.split("\n");
  const needle = `"${key}"`;
  for (let i = after; i < lines.length; i++) {
    if (lines[i]?.includes(needle)) return i + 1;
  }
  return void 0;
}
function readPackageJson(path, source) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    return void 0;
  }
  const asStringRecord = (value) => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter((e) => typeof e[1] === "string")) : {};
  const scripts = asStringRecord(parsed.scripts);
  const scriptsStart = (jsonKeyLine(source, "scripts") ?? 1) - 1;
  const scriptLines = {};
  for (const name of Object.keys(scripts)) {
    const line = jsonKeyLine(source, name, scriptsStart);
    if (line !== void 0) scriptLines[name] = line;
  }
  const entryPoints = [];
  for (const field of ["main", "module", "types"]) {
    const value = parsed[field];
    if (typeof value === "string") entryPoints.push(`${field}: ${value}`);
  }
  if (typeof parsed.bin === "string") entryPoints.push(`bin: ${parsed.bin}`);
  else for (const [name, target] of Object.entries(asStringRecord(parsed.bin))) entryPoints.push(`bin ${name}: ${target}`);
  if (parsed.exports !== void 0) entryPoints.push(`exports: ${JSON.stringify(parsed.exports).slice(0, 120)}`);
  return {
    path,
    ...typeof parsed.name === "string" ? { name: parsed.name } : {},
    scripts,
    scriptLines,
    dependencies: asStringRecord(parsed.dependencies),
    devDependencies: Object.keys(asStringRecord(parsed.devDependencies)),
    entryPoints
  };
}
function htmlEntryScripts(source) {
  const scripts = [];
  for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)) {
    if (match[1]) scripts.push(match[1]);
  }
  return scripts;
}
function collectFacts(files, read) {
  const sorted = [...files].sort();
  const testFiles = sorted.filter(isTestFile);
  const exports = [];
  const packages = [];
  const entryPoints = [];
  for (const path of sorted) {
    if (SOURCE_FILE.test(path) && !isTestFile(path) && !path.endsWith(".d.ts")) {
      const source = read(path);
      if (source !== void 0) exports.push(...scanExports(path, source));
      if (ENTRY_FILE.test(path)) entryPoints.push(path);
    } else if (path === "package.json" || path.endsWith("/package.json")) {
      const source = read(path);
      const facts = source === void 0 ? void 0 : readPackageJson(path, source);
      if (facts) packages.push(facts);
    } else if (path.endsWith(".html")) {
      const source = read(path);
      for (const src of source === void 0 ? [] : htmlEntryScripts(source)) entryPoints.push(`${path} -> ${src}`);
    }
  }
  return { files: sorted, testFiles, exports, packages, entryPoints };
}
var DEFAULT_RENDER_LIMITS = { maxFiles: 40, maxExports: 60 };
function more(total, shown) {
  return total > shown ? [`- (+${total - shown} more, not listed)`] : [];
}
function renderFacts(facts, limits = DEFAULT_RENDER_LIMITS) {
  const out = ["## Generated facts", "", "Produced by code from the git tree at the stamped SHA; not written by a model.", ""];
  const sourceFiles = facts.files.filter((f) => !isTestFile(f));
  out.push(`### Files (${facts.files.length} total, ${facts.testFiles.length} tests)`, "");
  const shownFiles = sourceFiles.slice(0, limits.maxFiles);
  out.push(...shownFiles.map((f) => `- \`${f}\``), ...more(sourceFiles.length, shownFiles.length), "");
  if (facts.entryPoints.length > 0) {
    out.push("### Entry points", "", ...facts.entryPoints.map((e) => `- \`${e}\``), "");
  }
  for (const pkg of facts.packages) {
    out.push(`### Package \`${pkg.path}\`${pkg.name ? ` (${pkg.name})` : ""}`);
    if (pkg.entryPoints.length > 0) out.push("", ...pkg.entryPoints.map((e) => `- ${e}`));
    const scripts = Object.entries(pkg.scripts);
    if (scripts.length > 0) {
      out.push("", "Scripts:", "");
      for (const [name, command] of scripts) {
        const line = pkg.scriptLines[name];
        const where = line === void 0 ? "" : ` \`${pkg.path}:${line}\``;
        out.push(`- \`${name}\`: \`${command.replace(/`/g, "'")}\`${where}`);
      }
    }
    const deps = Object.entries(pkg.dependencies);
    if (deps.length > 0) out.push("", `Dependencies: ${deps.map(([n, v]) => `\`${n}@${v}\``).join(", ")}`);
    if (pkg.devDependencies.length > 0) out.push("", `Dev dependencies (${pkg.devDependencies.length}): ${pkg.devDependencies.join(", ")}`);
    out.push("");
  }
  if (facts.exports.length > 0) {
    out.push(`### Exports (${facts.exports.length})`, "");
    const shown = facts.exports.slice(0, limits.maxExports);
    out.push(...shown.map((e) => `- \`${e.name}\` (${e.kind}) \`${e.path}:${e.line}\``), ...more(facts.exports.length, shown.length), "");
  }
  return out.join("\n").trimEnd() + "\n";
}

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
function findRepoRoot(cwd) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
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
function showFile(git, rev, path) {
  return git.run(["show", `${rev}:${path}`]);
}
function dirtyPaths(git) {
  const output = git.run(["status", "--porcelain", "-z", "--untracked-files=all"]);
  const paths = [];
  const records = output.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    paths.push(record.slice(3));
    if (record[0] === "R" || record[0] === "C") i++;
  }
  return paths;
}
function changedFiles(git, from, to) {
  return git.run(["diff", "--name-only", "-z", from, to]).split("\0").filter((p) => p !== "");
}

// src/page.ts
var GENERATOR = "ravn-agents/onboarding 0.1.0";
var INDEX_MAX_LINES = 200;
var FACTS_HEADING = "## Generated facts";
function renderFrontmatter(meta) {
  const lines = Object.entries(meta).filter(([, value]) => value !== void 0).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---
${lines.join("\n")}
---
`;
}
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
function renderAreaPage(meta, prose, facts) {
  const short2 = meta.built_at_sha.slice(0, 12);
  const banner = meta.status === "ok" ? `> Codebase map page, built at \`${short2}\`. It says where to look; confirm every claim against the cited code before relying on it.` : `> Codebase map page, built at \`${short2}\`. **Not covered by the map:** ${meta.reason ?? "no validated prose"}. Only the generated facts below are available; search the code directly.`;
  const parts = [renderFrontmatter(meta), `# ${meta.title}`, "", banner, ""];
  if (meta.status === "ok") parts.push(prose.trim(), "");
  parts.push(facts.trim(), "");
  return parts.join("\n");
}
function cell(text) {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
function renderIndex(meta, areas, overview) {
  const short2 = meta.built_at_sha.slice(0, 12);
  const lines = [
    renderFrontmatter(meta).trimEnd(),
    "# Codebase map",
    "",
    `Built at \`${short2}\` on ${meta.built_at.slice(0, 10)} by ${meta.generator}.`,
    "This map is a router, not a source of truth: it tells you which files to read. Confirm any",
    "claim against the cited code, and prefer the code when the two disagree. It is never loaded",
    "automatically; reach it through the `ask-codebase` skill. Refresh with `/ravn-agents:onboard --refresh`.",
    "",
    "## Areas",
    "",
    "| Area | Paths | What lives there | Page |",
    "|---|---|---|---|"
  ];
  for (const area of areas) {
    const stamp = area.builtAtSha === meta.built_at_sha ? "" : ` (built at \`${area.builtAtSha.slice(0, 7)}\`)`;
    const what = area.status === "ok" ? area.summary : `**Not covered:** ${area.summary}`;
    lines.push(
      `| ${cell(area.title)} | ${area.paths.map((p) => `\`${p}\``).join(" ")} | ${cell(what)} | [${area.slug}](areas/${area.slug}.md)${stamp} |`
    );
  }
  if (overview.entryPoints.length > 0) {
    lines.push("", "## Entry points", "", ...overview.entryPoints.slice(0, 15).map((e) => `- \`${e}\``));
  }
  if (overview.scripts.length > 0) {
    lines.push("", "## Commands (root package.json)", "");
    for (const s of overview.scripts.slice(0, 40)) {
      lines.push(`- \`${s.name}\`: \`${s.command.replace(/`/g, "'")}\`${s.where ? ` \`${s.where}\`` : ""}`);
    }
  }
  const text = lines.join("\n") + "\n";
  const count = text.split("\n").length - 1;
  if (count > INDEX_MAX_LINES) {
    throw new Error(`INDEX.md would have ${count} lines; the budget is ${INDEX_MAX_LINES}. Raise maxFiles so fewer areas are produced.`);
  }
  return text;
}

// src/staleness.ts
function blobMap(entries) {
  return new Map(entries.map((e) => [e.path, e.hash]));
}
function compareMap(input) {
  const headBlobs = blobMap(input.headEntries);
  const stale = [];
  const notCovered = [];
  const notes = [];
  const missingCommits = /* @__PURE__ */ new Set();
  for (const { meta, citedPaths } of input.pages) {
    if (meta.status === "missing") {
      notCovered.push({ slug: meta.area, reason: meta.reason ?? "no validated prose" });
      continue;
    }
    const reasons = [];
    if (areaHash(input.headEntries, meta.paths, input.exclude) !== meta.tree_hash) {
      reasons.push("files in the area changed");
    }
    const then = input.blobsAt(meta.built_at_sha);
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
  const known = new Set(input.pages.map((p) => p.meta.area));
  const detectedSlugs = new Set(input.detected.map((a) => a.slug));
  return {
    mapSha: input.mapSha,
    head: input.head,
    total: input.pages.length,
    stale,
    notCovered,
    newAreas: input.detected.filter((a) => !known.has(a.slug)).map((a) => ({ slug: a.slug, paths: a.paths })),
    removedAreas: [...known].filter((slug) => !detectedSlugs.has(slug)).sort(),
    invalidPages: input.invalidPages ?? [],
    notes
  };
}
function isFresh(report) {
  return report.stale.length === 0 && report.notCovered.length === 0 && report.newAreas.length === 0 && report.removedAreas.length === 0 && report.invalidPages.length === 0;
}
function areasToRemap(report) {
  return [
    .../* @__PURE__ */ new Set([
      ...report.stale.map((s) => s.slug),
      ...report.notCovered.map((s) => s.slug),
      ...report.newAreas.map((s) => s.slug)
    ])
  ].sort();
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
var MapError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MapError";
  }
};
function write(root, relative, content) {
  const full = join(root, relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}
function readIfExists(root, relative) {
  const full = join(root, relative);
  return existsSync(full) ? readFileSync(full, "utf8") : void 0;
}
function pagePath(slug) {
  return `${AREAS_DIR}/${slug}.md`;
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
function plan(root, options) {
  const git = gitAt(root);
  const dirty = dirtyPaths(git).filter((p) => !isExcluded(p, EXCLUDE));
  if (dirty.length > 0) {
    const shown = dirty.slice(0, 5).join(", ");
    throw new MapError(
      `the working tree has uncommitted changes (${shown}${dirty.length > 5 ? `, +${dirty.length - 5} more` : ""}). Commit or stash them first: the map is stamped with HEAD and must describe exactly that commit.`
    );
  }
  const head = headSha(git);
  const entries = listTree(git, head);
  const files = repoFiles(entries);
  const detected = detectAreas(files, { exclude: EXCLUDE });
  const existing = loadMap(root);
  const existingBySlug = new Map(existing.pages.map((p) => [p.meta.area, p.meta]));
  let selected;
  let keep = [];
  let remove;
  if (options.refresh) {
    if (!mapExists(root)) throw new MapError(`no map at ${MAP_DIR}/INDEX.md to refresh; build it first without --refresh`);
    const report = compareMap({
      head,
      mapSha: existing.mapSha,
      headEntries: entries,
      detected,
      pages: existing.pages,
      exclude: EXCLUDE,
      blobsAt: blobsAtFactory(git)
    });
    const remap = new Set(areasToRemap(report));
    selected = detected.filter((a) => remap.has(a.slug));
    remove = report.removedAreas;
    keep = existing.pages.map((p) => p.meta.area).filter((slug) => !remap.has(slug) && !remove.includes(slug));
  } else {
    selected = detected;
    const detectedSlugs = new Set(detected.map((a) => a.slug));
    remove = existing.pages.map((p) => p.meta.area).filter((slug) => !detectedSlugs.has(slug));
  }
  rmSync(join(root, BUILD_DIR), { recursive: true, force: true });
  const readFromDisk = (path) => readIfExists(root, path);
  const toMap = selected.map((area) => {
    const areaFiles = filesInArea(files, area.paths);
    const factsPath = `${BUILD_DIR}/facts/${area.slug}.md`;
    write(root, factsPath, renderFacts(collectFacts(areaFiles, readFromDisk)));
    const planned = {
      ...area,
      treeHash: areaHash(entries, area.paths, EXCLUDE),
      fileCount: areaFiles.length,
      factsPath,
      draftPath: `${BUILD_DIR}/drafts/${area.slug}.md`
    };
    const old = existingBySlug.get(area.slug);
    if (options.refresh && old?.status === "ok") {
      planned.oldPage = pagePath(area.slug);
      if (commitExists(git, old.built_at_sha)) {
        planned.changedFiles = changedFiles(git, old.built_at_sha, head).filter((f) => filesInArea([f], area.paths).length > 0);
      }
    }
    return planned;
  });
  const result = {
    version: 1,
    head,
    builtAt: (options.now ?? /* @__PURE__ */ new Date()).toISOString(),
    mode: options.refresh ? "refresh" : "full",
    toMap,
    keep,
    remove
  };
  write(root, PLAN_FILE, JSON.stringify(result, null, 2) + "\n");
  write(root, `${MAP_DIR}/.gitignore`, ".build/\n");
  return result;
}
function repoOverview(files, read) {
  const shallow = files.filter((f) => f.split("/").length <= 2);
  const facts = collectFacts(shallow, read);
  const rootPackage = facts.packages.find((p) => p.path === "package.json");
  const entryPoints = [...rootPackage?.entryPoints ?? [], ...facts.entryPoints];
  const scripts = Object.entries(rootPackage?.scripts ?? {}).map(([name, command]) => {
    const line = rootPackage?.scriptLines[name];
    return { name, command, ...line === void 0 ? {} : { where: `package.json:${line}` } };
  });
  return { scripts, entryPoints };
}
function assemble(root) {
  const planText = readIfExists(root, PLAN_FILE);
  if (planText === void 0) throw new MapError(`no plan at ${PLAN_FILE}; run the plan step first`);
  const planned = JSON.parse(planText);
  const git = gitAt(root);
  const head = headSha(git);
  if (head !== planned.head) {
    throw new MapError(`HEAD moved from ${planned.head.slice(0, 12)} to ${head.slice(0, 12)} since the plan; run the plan step again`);
  }
  const entries = listTree(git, head);
  const inTree = new Set(entries.filter((e) => e.type === "blob").map((e) => e.path));
  const lineCache = /* @__PURE__ */ new Map();
  const lineCount = (path) => {
    if (!inTree.has(path)) return void 0;
    if (!lineCache.has(path)) lineCache.set(path, countLines(showFile(git, head, path)));
    return lineCache.get(path);
  };
  const areas = [];
  for (const area of planned.toMap) {
    const draft = readIfExists(root, area.draftPath);
    let errors;
    let prose = "";
    let summary = "";
    if (draft === void 0) {
      errors = ["no draft was written (the mapper failed, timed out or wrote elsewhere)"];
    } else {
      const check = checkDraft(draft);
      errors = [...check.errors, ...checkCitations(check.citations, lineCount)];
      prose = check.body;
      summary = check.summary;
    }
    const ok = errors.length === 0;
    const meta = {
      area: area.slug,
      title: area.title,
      paths: area.paths,
      tree_hash: area.treeHash,
      built_at_sha: planned.head,
      built_at: planned.builtAt,
      status: ok ? "ok" : "missing",
      summary: ok ? summary : `draft rejected or absent (${errors.length} problem${errors.length === 1 ? "" : "s"})`,
      ...ok ? {} : { reason: errors[0] },
      generator: GENERATOR
    };
    const facts = readIfExists(root, area.factsPath) ?? "## Generated facts\n\n(unavailable)\n";
    write(root, pagePath(area.slug), renderAreaPage(meta, prose, facts));
    areas.push({ slug: area.slug, status: meta.status, errors });
  }
  for (const slug of planned.remove) rmSync(join(root, pagePath(slug)), { force: true });
  const map = loadMap(root);
  const indexAreas = map.pages.map(({ meta }) => ({
    slug: meta.area,
    title: meta.title,
    paths: meta.paths,
    status: meta.status,
    summary: meta.status === "ok" ? meta.summary : meta.reason ?? meta.summary,
    builtAtSha: meta.built_at_sha
  }));
  const files = repoFiles(entries);
  const index = renderIndex(
    { built_at_sha: planned.head, built_at: planned.builtAt, areas: indexAreas.length, generator: GENERATOR },
    indexAreas,
    repoOverview(files, (path) => inTree.has(path) ? showFile(git, head, path) : void 0)
  );
  write(root, `${MAP_DIR}/INDEX.md`, index);
  return { head, areas, removed: planned.remove, indexLines: index.split("\n").length - 1 };
}
function validateMap(root) {
  if (!mapExists(root)) throw new MapError(`no map at ${MAP_DIR}/INDEX.md`);
  const git = gitAt(root);
  const problems = [];
  const index = readIfExists(root, `${MAP_DIR}/INDEX.md`) ?? "";
  const indexLines = index.split("\n").length - 1;
  if (indexLines > 200) problems.push({ page: `${MAP_DIR}/INDEX.md`, error: `${indexLines} lines; the budget is 200` });
  const trees = /* @__PURE__ */ new Map();
  const map = loadMap(root);
  for (const invalid of map.invalid) problems.push({ page: invalid.file, error: invalid.error });
  for (const { meta } of map.pages) {
    if (meta.status !== "ok") continue;
    const page = pagePath(meta.area);
    const sha = meta.built_at_sha;
    if (!trees.has(sha)) trees.set(sha, commitExists(git, sha) ? blobMap(listTree(git, sha)) : void 0);
    const tree = trees.get(sha);
    if (tree === void 0) {
      problems.push({ page, error: `stamped commit ${sha.slice(0, 12)} is not in this clone; cannot validate` });
      continue;
    }
    const prose = proseOf(parseFrontmatter(readFileSync(join(root, page), "utf8")).body);
    const check = checkDraft(prose.replace(/^[\s\S]*?(?=^## )/m, ""));
    const counts = /* @__PURE__ */ new Map();
    const lineCount = (path) => {
      if (!tree.has(path)) return void 0;
      if (!counts.has(path)) counts.set(path, countLines(showFile(git, sha, path)));
      return counts.get(path);
    };
    for (const error of [...check.errors, ...checkCitations(check.citations, lineCount)]) problems.push({ page, error });
  }
  return problems;
}

// src/cli.ts
var USAGE = `usage: map-cli <command> [--repo <dir>]

commands:
  plan [--refresh]   choose the areas to map and write their generated facts
  assemble           validate the mappers' drafts, write the pages and INDEX.md
  status [--json]    report which areas are stale against HEAD
  validate           re-check every page's citations against its stamped commit`;
function parseArgs(argv) {
  const flags = /* @__PURE__ */ new Set();
  let repo = process.cwd();
  let command;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") {
      const value = argv[++i];
      if (!value) throw new MapError("--repo needs a directory");
      repo = value;
    } else if (arg?.startsWith("--")) {
      flags.add(arg);
    } else if (command === void 0) {
      command = arg;
    } else {
      throw new MapError(`unexpected argument: ${arg}`);
    }
  }
  return { command, repo, flags };
}
function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function run(argv) {
  const args = parseArgs(argv);
  if (args.command === void 0 || args.flags.has("--help")) {
    process.stdout.write(`${USAGE}
`);
    return args.command === void 0 ? 2 : 0;
  }
  const root = findRepoRoot(args.repo);
  if (root === void 0) throw new MapError(`${args.repo} is not inside a git repository`);
  switch (args.command) {
    case "plan": {
      const result = plan(root, { refresh: args.flags.has("--refresh") });
      print({
        repo: root,
        head: result.head,
        mode: result.mode,
        upToDate: result.toMap.length === 0 && result.remove.length === 0,
        toMap: result.toMap.map((a) => ({
          slug: a.slug,
          title: a.title,
          paths: a.paths,
          fileCount: a.fileCount,
          factsPath: a.factsPath,
          draftPath: a.draftPath,
          ...a.oldPage ? { oldPage: a.oldPage } : {},
          ...a.changedFiles ? { changedFiles: a.changedFiles.slice(0, 40) } : {}
        })),
        keep: result.keep,
        remove: result.remove
      });
      return 0;
    }
    case "assemble": {
      const result = assemble(root);
      print(result);
      return result.areas.some((a) => a.status !== "ok") ? 1 : 0;
    }
    case "status": {
      const report = mapStatus(root);
      if (args.flags.has("--json")) {
        print(report ?? { map: "none" });
      } else if (report === void 0) {
        process.stdout.write("codebase-map: this repository has no docs/codebase-map/INDEX.md. Build one with /ravn-agents:onboard.\n");
      } else {
        process.stdout.write(`${formatReport(report)}
`);
      }
      return 0;
    }
    case "validate": {
      const problems = validateMap(root);
      print({ ok: problems.length === 0, problems });
      return problems.length === 0 ? 0 : 1;
    }
    default:
      throw new MapError(`unknown command "${args.command}"
${USAGE}`);
  }
}

// src/map-cli.ts
try {
  process.exitCode = run(process.argv.slice(2));
} catch (error) {
  if (error instanceof MapError) {
    process.stderr.write(`map-cli: ${error.message}
`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
