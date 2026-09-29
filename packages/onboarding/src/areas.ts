import { createHash } from "node:crypto";
import type { TreeEntry } from "./git.js";

/**
 * An area is one page of the map: a set of path patterns over the repository.
 *
 * Patterns are deliberately tiny so staleness can be checked without a model:
 * - `dir/`   every file under `dir`, at any depth
 * - `dir/*`  files directly inside `dir` only (`*` alone means the repository root)
 * - `file`   exactly that file
 */
export interface Area {
  slug: string;
  title: string;
  paths: string[];
}

export interface AreaOptions {
  /** A directory with more files than this is split into its subdirectories. */
  maxFiles: number;
  /** A subdirectory with fewer files than this is folded into its parent's remainder area. */
  minFiles: number;
  /** Directories deeper than this are never split further. The root is depth 0. */
  maxDepth: number;
  /** Path prefixes left out of every area, such as the map directory itself. */
  exclude: string[];
}

export const DEFAULT_AREA_OPTIONS: AreaOptions = {
  maxFiles: 50,
  minFiles: 3,
  maxDepth: 3,
  exclude: [],
};

export function matchesPattern(file: string, pattern: string): boolean {
  if (pattern === "*") return !file.includes("/");
  if (pattern.endsWith("/*")) {
    const dir = pattern.slice(0, -1);
    return file.startsWith(dir) && !file.slice(dir.length).includes("/");
  }
  if (pattern.endsWith("/")) return file.startsWith(pattern);
  return file === pattern;
}

export function inArea(file: string, paths: readonly string[]): boolean {
  return paths.some((p) => matchesPattern(file, p));
}

export function isExcluded(file: string, exclude: readonly string[]): boolean {
  return exclude.some((prefix) => file === prefix || file.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "root" : slug;
}

/**
 * Splits a repository's files into areas. Pure and deterministic: the same file list
 * always yields the same areas, so the hook and the refresh agree on what an area is.
 */
export function detectAreas(allFiles: readonly string[], options: Partial<AreaOptions> = {}): Area[] {
  const opts = { ...DEFAULT_AREA_OPTIONS, ...options };
  const files = allFiles.filter((f) => !isExcluded(f, opts.exclude)).sort();
  const areas: Area[] = [];

  const partition = (dir: string, dirFiles: string[], depth: number): void => {
    const splittable = depth === 0 || (dirFiles.length > opts.maxFiles && depth < opts.maxDepth);
    if (!splittable) {
      areas.push({ slug: slugify(dir), title: dir, paths: [`${dir}/`] });
      return;
    }
    const prefix = dir === "" ? "" : `${dir}/`;
    const loose: string[] = [];
    const groups = new Map<string, string[]>();
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
    const remainder: string[] = loose.length > 0 ? [dir === "" ? "*" : `${dir}/*`] : [];
    for (const [child, childFiles] of groups) {
      if (childFiles.length < opts.minFiles) remainder.push(`${child}/`);
      else partition(child, childFiles, depth + 1);
    }
    if (remainder.length > 0) {
      areas.push({
        slug: dir === "" ? "root" : slugify(dir),
        title: dir === "" ? "Repository root" : `${dir} (top level)`,
        paths: remainder,
      });
    }
  };

  partition("", files, 0);
  return dedupeSlugs(areas).sort((a, b) => a.slug.localeCompare(b.slug));
}

function dedupeSlugs(areas: Area[]): Area[] {
  const seen = new Map<string, number>();
  return areas.map((area) => {
    const count = seen.get(area.slug) ?? 0;
    seen.set(area.slug, count + 1);
    return count === 0 ? area : { ...area, slug: `${area.slug}-${count + 1}` };
  });
}

/**
 * Content hash of an area: sha1 over the sorted `<blob> <path>` lines of its files.
 *
 * Git's own tree hash (`git rev-parse <sha>:<dir>`) would only work for single-directory
 * areas and would change whenever the map itself is committed under `docs/`. This hash
 * uses the same blob ids git stores, so it changes exactly when a file in the area is
 * added, removed, renamed or edited.
 */
export function areaHash(entries: readonly TreeEntry[], paths: readonly string[], exclude: readonly string[] = []): string {
  const lines = entries
    .filter((e) => inArea(e.path, paths) && !isExcluded(e.path, exclude))
    .map((e) => `${e.hash} ${e.path}`)
    .sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

export function filesInArea(files: readonly string[], paths: readonly string[], exclude: readonly string[] = []): string[] {
  return files.filter((f) => inArea(f, paths) && !isExcluded(f, exclude));
}
