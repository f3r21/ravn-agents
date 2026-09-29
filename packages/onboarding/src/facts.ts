/**
 * The deterministic layer of the map: facts read from files by code, never by a model.
 * Everything here carries a `path:line` so it can be checked like the prose layer.
 */

export interface ExportFact {
  name: string;
  kind: string;
  path: string;
  line: number;
}

export interface PackageFacts {
  path: string;
  name?: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: string[];
  entryPoints: string[];
  scriptLines: Record<string, number>;
}

export interface AreaFacts {
  files: string[];
  testFiles: string[];
  exports: ExportFact[];
  packages: PackageFacts[];
  entryPoints: string[];
}

export type ReadFile = (path: string) => string | undefined;

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$)|(?:^|\/)(?:__tests__|__mocks__)\//;
const ENTRY_FILE = /(?:^|\/)(?:main|index|server|app|cli)\.[cm]?[jt]sx?$/;
const EXPORT_DECLARATION =
  /^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const EXPORT_DEFAULT_EXPRESSION = /^export\s+default\s+(?!function|class|async|abstract)/;

export function isTestFile(path: string): boolean {
  return TEST_FILE.test(path);
}

/** Top-level `export` declarations, one per line that starts with `export`. */
export function scanExports(path: string, source: string): ExportFact[] {
  const facts: ExportFact[] = [];
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

/** Finds the 1-based line on which `"key":` first appears inside a JSON text. */
function jsonKeyLine(source: string, key: string, after = 0): number | undefined {
  const lines = source.split("\n");
  const needle = `"${key}"`;
  for (let i = after; i < lines.length; i++) {
    if (lines[i]?.includes(needle)) return i + 1;
  }
  return undefined;
}

export function readPackageJson(path: string, source: string): PackageFacts | undefined {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(source) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const asStringRecord = (value: unknown): Record<string, string> =>
    value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"))
      : {};
  const scripts = asStringRecord(parsed.scripts);
  const scriptsStart = (jsonKeyLine(source, "scripts") ?? 1) - 1;
  const scriptLines: Record<string, number> = {};
  for (const name of Object.keys(scripts)) {
    const line = jsonKeyLine(source, name, scriptsStart);
    if (line !== undefined) scriptLines[name] = line;
  }
  const entryPoints: string[] = [];
  for (const field of ["main", "module", "types"]) {
    const value = parsed[field];
    if (typeof value === "string") entryPoints.push(`${field}: ${value}`);
  }
  if (typeof parsed.bin === "string") entryPoints.push(`bin: ${parsed.bin}`);
  else for (const [name, target] of Object.entries(asStringRecord(parsed.bin))) entryPoints.push(`bin ${name}: ${target}`);
  if (parsed.exports !== undefined) entryPoints.push(`exports: ${JSON.stringify(parsed.exports).slice(0, 120)}`);
  return {
    path,
    ...(typeof parsed.name === "string" ? { name: parsed.name } : {}),
    scripts,
    scriptLines,
    dependencies: asStringRecord(parsed.dependencies),
    devDependencies: Object.keys(asStringRecord(parsed.devDependencies)),
    entryPoints,
  };
}

/** `<script type="module" src="...">` targets in an HTML entry page. */
export function htmlEntryScripts(source: string): string[] {
  const scripts: string[] = [];
  for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)) {
    if (match[1]) scripts.push(match[1]);
  }
  return scripts;
}

export function collectFacts(files: readonly string[], read: ReadFile): AreaFacts {
  const sorted = [...files].sort();
  const testFiles = sorted.filter(isTestFile);
  const exports: ExportFact[] = [];
  const packages: PackageFacts[] = [];
  const entryPoints: string[] = [];
  for (const path of sorted) {
    if (SOURCE_FILE.test(path) && !isTestFile(path) && !path.endsWith(".d.ts")) {
      const source = read(path);
      if (source !== undefined) exports.push(...scanExports(path, source));
      if (ENTRY_FILE.test(path)) entryPoints.push(path);
    } else if (path === "package.json" || path.endsWith("/package.json")) {
      const source = read(path);
      const facts = source === undefined ? undefined : readPackageJson(path, source);
      if (facts) packages.push(facts);
    } else if (path.endsWith(".html")) {
      const source = read(path);
      for (const src of source === undefined ? [] : htmlEntryScripts(source)) entryPoints.push(`${path} -> ${src}`);
    }
  }
  return { files: sorted, testFiles, exports, packages, entryPoints };
}

export interface RenderLimits {
  maxFiles: number;
  maxExports: number;
}

export const DEFAULT_RENDER_LIMITS: RenderLimits = { maxFiles: 40, maxExports: 60 };

function more(total: number, shown: number): string[] {
  return total > shown ? [`- (+${total - shown} more, not listed)`] : [];
}

/**
 * Renders the generated section of an area page. Long lists are cut at a fixed limit and
 * the cut is stated, never silent.
 */
export function renderFacts(facts: AreaFacts, limits: RenderLimits = DEFAULT_RENDER_LIMITS): string {
  const out: string[] = ["## Generated facts", "", "Produced by code from the git tree at the stamped SHA; not written by a model.", ""];
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
        const where = line === undefined ? "" : ` \`${pkg.path}:${line}\``;
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
