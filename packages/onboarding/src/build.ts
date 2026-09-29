import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Area, areaHash, detectAreas, filesInArea, isExcluded } from "./areas.js";
import { checkCitations, countLines, parseCitations } from "./citations.js";
import { checkDraft } from "./draft.js";
import { collectFacts, renderFacts } from "./facts.js";
import {
  type Git,
  type TreeEntry,
  changedFiles,
  commitExists,
  dirtyPaths,
  gitAt,
  headSha,
  listTree,
  showFile,
} from "./git.js";
import {
  type AreaPageMeta,
  GENERATOR,
  type IndexArea,
  type RepoOverview,
  parseFrontmatter,
  proseOf,
  readAreaMeta,
  renderAreaPage,
  renderIndex,
} from "./page.js";
import { type PageState, type StalenessReport, areasToRemap, blobMap, compareMap } from "./staleness.js";

export const MAP_DIR = "docs/codebase-map";
export const AREAS_DIR = `${MAP_DIR}/areas`;
export const BUILD_DIR = `${MAP_DIR}/.build`;
const PLAN_FILE = `${BUILD_DIR}/plan.json`;
const EXCLUDE = [MAP_DIR];

/** A problem the user can fix; the CLI prints it and exits 2 without a stack trace. */
export class MapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapError";
  }
}

export interface PlanArea extends Area {
  treeHash: string;
  fileCount: number;
  factsPath: string;
  draftPath: string;
  oldPage?: string;
  changedFiles?: string[];
}

export interface Plan {
  version: 1;
  head: string;
  builtAt: string;
  mode: "full" | "refresh";
  toMap: PlanArea[];
  keep: string[];
  remove: string[];
}

function write(root: string, relative: string, content: string): void {
  const full = join(root, relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function readIfExists(root: string, relative: string): string | undefined {
  const full = join(root, relative);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
}

function pagePath(slug: string): string {
  return `${AREAS_DIR}/${slug}.md`;
}

function repoFiles(entries: readonly TreeEntry[]): string[] {
  return entries.map((e) => e.path).filter((p) => !isExcluded(p, EXCLUDE));
}

interface LoadedMap {
  mapSha: string | undefined;
  pages: PageState[];
  invalid: { file: string; error: string }[];
}

export function mapExists(root: string): boolean {
  return existsSync(join(root, MAP_DIR, "INDEX.md"));
}

export function loadMap(root: string): LoadedMap {
  const index = readIfExists(root, `${MAP_DIR}/INDEX.md`);
  const indexSha = index === undefined ? undefined : parseFrontmatter(index).meta.built_at_sha;
  const pages: PageState[] = [];
  const invalid: { file: string; error: string }[] = [];
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
  return { mapSha: typeof indexSha === "string" ? indexSha : undefined, pages, invalid };
}

function blobsAtFactory(git: Git): (sha: string) => Map<string, string> | undefined {
  const cache = new Map<string, Map<string, string> | undefined>();
  return (sha) => {
    if (!cache.has(sha)) cache.set(sha, commitExists(git, sha) ? blobMap(listTree(git, sha)) : undefined);
    return cache.get(sha);
  };
}

/** Staleness of the map at `root`, or undefined when the repository has no map. */
export function mapStatus(root: string): StalenessReport | undefined {
  if (!mapExists(root)) return undefined;
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
    blobsAt: blobsAtFactory(git),
  });
}

/**
 * Decides which areas to map and writes the deterministic layer for each, ready for
 * the area-mapper subagents. Refuses a dirty tree: the map is stamped with HEAD, and a
 * page describing uncommitted code would carry a stamp that does not match it.
 */
export function plan(root: string, options: { refresh: boolean; now?: Date }): Plan {
  const git = gitAt(root);
  const dirty = dirtyPaths(git).filter((p) => !isExcluded(p, EXCLUDE));
  if (dirty.length > 0) {
    const shown = dirty.slice(0, 5).join(", ");
    throw new MapError(
      `the working tree has uncommitted changes (${shown}${dirty.length > 5 ? `, +${dirty.length - 5} more` : ""}). ` +
        "Commit or stash them first: the map is stamped with HEAD and must describe exactly that commit.",
    );
  }
  const head = headSha(git);
  const entries = listTree(git, head);
  const files = repoFiles(entries);
  const detected = detectAreas(files, { exclude: EXCLUDE });
  const existing = loadMap(root);
  const existingBySlug = new Map(existing.pages.map((p) => [p.meta.area, p.meta]));

  let selected: Area[];
  let keep: string[] = [];
  let remove: string[];
  if (options.refresh) {
    if (!mapExists(root)) throw new MapError(`no map at ${MAP_DIR}/INDEX.md to refresh; build it first without --refresh`);
    const report = compareMap({
      head,
      mapSha: existing.mapSha,
      headEntries: entries,
      detected,
      pages: existing.pages,
      exclude: EXCLUDE,
      blobsAt: blobsAtFactory(git),
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
  const readFromDisk = (path: string): string | undefined => readIfExists(root, path);
  const toMap: PlanArea[] = selected.map((area) => {
    const areaFiles = filesInArea(files, area.paths);
    const factsPath = `${BUILD_DIR}/facts/${area.slug}.md`;
    write(root, factsPath, renderFacts(collectFacts(areaFiles, readFromDisk)));
    const planned: PlanArea = {
      ...area,
      treeHash: areaHash(entries, area.paths, EXCLUDE),
      fileCount: areaFiles.length,
      factsPath,
      draftPath: `${BUILD_DIR}/drafts/${area.slug}.md`,
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

  const result: Plan = {
    version: 1,
    head,
    builtAt: (options.now ?? new Date()).toISOString(),
    mode: options.refresh ? "refresh" : "full",
    toMap,
    keep,
    remove,
  };
  write(root, PLAN_FILE, JSON.stringify(result, null, 2) + "\n");
  write(root, `${MAP_DIR}/.gitignore`, ".build/\n");
  return result;
}

export interface AssembledArea {
  slug: string;
  status: "ok" | "missing";
  errors: string[];
}

export interface AssembleResult {
  head: string;
  areas: AssembledArea[];
  removed: string[];
  indexLines: number;
}

function repoOverview(files: readonly string[], read: (path: string) => string | undefined): RepoOverview {
  const shallow = files.filter((f) => f.split("/").length <= 2);
  const facts = collectFacts(shallow, read);
  const rootPackage = facts.packages.find((p) => p.path === "package.json");
  const entryPoints = [...(rootPackage?.entryPoints ?? []), ...facts.entryPoints];
  const scripts = Object.entries(rootPackage?.scripts ?? {}).map(([name, command]) => {
    const line = rootPackage?.scriptLines[name];
    return { name, command, ...(line === undefined ? {} : { where: `package.json:${line}` }) };
  });
  return { scripts, entryPoints };
}

/**
 * Validates every draft named in the plan and writes the pages and INDEX.md. A draft that
 * fails validation is never written as prose: its page is marked `missing` with the reason
 * and keeps only the generated facts. Safe to run again after re-mapping rejected areas.
 */
export function assemble(root: string): AssembleResult {
  const planText = readIfExists(root, PLAN_FILE);
  if (planText === undefined) throw new MapError(`no plan at ${PLAN_FILE}; run the plan step first`);
  const planned = JSON.parse(planText) as Plan;
  const git = gitAt(root);
  const head = headSha(git);
  if (head !== planned.head) {
    throw new MapError(`HEAD moved from ${planned.head.slice(0, 12)} to ${head.slice(0, 12)} since the plan; run the plan step again`);
  }
  const entries = listTree(git, head);
  const inTree = new Set(entries.filter((e) => e.type === "blob").map((e) => e.path));
  const lineCache = new Map<string, number>();
  const lineCount = (path: string): number | undefined => {
    if (!inTree.has(path)) return undefined;
    if (!lineCache.has(path)) lineCache.set(path, countLines(showFile(git, head, path)));
    return lineCache.get(path);
  };

  const areas: AssembledArea[] = [];
  for (const area of planned.toMap) {
    const draft = readIfExists(root, area.draftPath);
    let errors: string[];
    let prose = "";
    let summary = "";
    if (draft === undefined) {
      errors = ["no draft was written (the mapper failed, timed out or wrote elsewhere)"];
    } else {
      const check = checkDraft(draft);
      errors = [...check.errors, ...checkCitations(check.citations, lineCount)];
      prose = check.body;
      summary = check.summary;
    }
    const ok = errors.length === 0;
    const meta: AreaPageMeta = {
      area: area.slug,
      title: area.title,
      paths: area.paths,
      tree_hash: area.treeHash,
      built_at_sha: planned.head,
      built_at: planned.builtAt,
      status: ok ? "ok" : "missing",
      summary: ok ? summary : `draft rejected or absent (${errors.length} problem${errors.length === 1 ? "" : "s"})`,
      ...(ok ? {} : { reason: errors[0] }),
      generator: GENERATOR,
    };
    const facts = readIfExists(root, area.factsPath) ?? "## Generated facts\n\n(unavailable)\n";
    write(root, pagePath(area.slug), renderAreaPage(meta, prose, facts));
    areas.push({ slug: area.slug, status: meta.status, errors });
  }
  for (const slug of planned.remove) rmSync(join(root, pagePath(slug)), { force: true });

  const map = loadMap(root);
  const indexAreas: IndexArea[] = map.pages.map(({ meta }) => ({
    slug: meta.area,
    title: meta.title,
    paths: meta.paths,
    status: meta.status,
    summary: meta.status === "ok" ? meta.summary : (meta.reason ?? meta.summary),
    builtAtSha: meta.built_at_sha,
  }));
  const files = repoFiles(entries);
  const index = renderIndex(
    { built_at_sha: planned.head, built_at: planned.builtAt, areas: indexAreas.length, generator: GENERATOR },
    indexAreas,
    repoOverview(files, (path) => (inTree.has(path) ? showFile(git, head, path) : undefined)),
  );
  write(root, `${MAP_DIR}/INDEX.md`, index);
  return { head, areas, removed: planned.remove, indexLines: index.split("\n").length - 1 };
}

export interface ValidationProblem {
  page: string;
  error: string;
}

/**
 * Re-checks every page's citations against the commit the page is stamped with. A CI job
 * can run this to keep a committed map honest.
 */
export function validateMap(root: string): ValidationProblem[] {
  if (!mapExists(root)) throw new MapError(`no map at ${MAP_DIR}/INDEX.md`);
  const git = gitAt(root);
  const problems: ValidationProblem[] = [];
  const index = readIfExists(root, `${MAP_DIR}/INDEX.md`) ?? "";
  const indexLines = index.split("\n").length - 1;
  if (indexLines > 200) problems.push({ page: `${MAP_DIR}/INDEX.md`, error: `${indexLines} lines; the budget is 200` });
  const trees = new Map<string, Map<string, string> | undefined>();
  const map = loadMap(root);
  for (const invalid of map.invalid) problems.push({ page: invalid.file, error: invalid.error });
  for (const { meta } of map.pages) {
    if (meta.status !== "ok") continue;
    const page = pagePath(meta.area);
    const sha = meta.built_at_sha;
    if (!trees.has(sha)) trees.set(sha, commitExists(git, sha) ? blobMap(listTree(git, sha)) : undefined);
    const tree = trees.get(sha);
    if (tree === undefined) {
      problems.push({ page, error: `stamped commit ${sha.slice(0, 12)} is not in this clone; cannot validate` });
      continue;
    }
    const prose = proseOf(parseFrontmatter(readFileSync(join(root, page), "utf8")).body);
    const check = checkDraft(prose.replace(/^[\s\S]*?(?=^## )/m, ""));
    const counts = new Map<string, number>();
    const lineCount = (path: string): number | undefined => {
      if (!tree.has(path)) return undefined;
      if (!counts.has(path)) counts.set(path, countLines(showFile(git, sha, path)));
      return counts.get(path);
    };
    for (const error of [...check.errors, ...checkCitations(check.citations, lineCount)]) problems.push({ page, error });
  }
  return problems;
}
