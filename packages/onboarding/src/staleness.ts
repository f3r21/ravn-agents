import { type Area, areaHash, inArea } from "./areas.js";
import type { TreeEntry } from "./git.js";
import type { AreaPageMeta } from "./page.js";

/** What the map knows about one area page, as read from disk. */
export interface PageState {
  meta: AreaPageMeta;
  /** Files the page's prose cites, which may lie outside the area. */
  citedPaths: string[];
}

export interface StaleArea {
  slug: string;
  title: string;
  reasons: string[];
}

export interface StalenessReport {
  mapSha: string | undefined;
  head: string;
  total: number;
  stale: StaleArea[];
  notCovered: { slug: string; reason: string }[];
  newAreas: { slug: string; paths: string[] }[];
  removedAreas: string[];
  invalidPages: { file: string; error: string }[];
  notes: string[];
}

/** Blob hashes by path at a commit, or undefined when this clone does not have the commit. */
export type BlobsAt = (sha: string) => Map<string, string> | undefined;

export function blobMap(entries: readonly TreeEntry[]): Map<string, string> {
  return new Map(entries.map((e) => [e.path, e.hash]));
}

/**
 * Compares the map with the tree at HEAD. Pure: all git access is passed in.
 *
 * An area is stale when its content hash differs from the stamp, or when a file its
 * prose cites from another area has changed since the page was built. The second rule
 * catches a page whose own files are untouched but whose claims point elsewhere.
 */
export function compareMap(input: {
  head: string;
  mapSha: string | undefined;
  headEntries: readonly TreeEntry[];
  detected: readonly Area[];
  pages: readonly PageState[];
  invalidPages?: { file: string; error: string }[];
  exclude: readonly string[];
  blobsAt: BlobsAt;
}): StalenessReport {
  const headBlobs = blobMap(input.headEntries);
  const stale: StaleArea[] = [];
  const notCovered: { slug: string; reason: string }[] = [];
  const notes: string[] = [];
  const missingCommits = new Set<string>();

  for (const { meta, citedPaths } of input.pages) {
    if (meta.status === "missing") {
      notCovered.push({ slug: meta.area, reason: meta.reason ?? "no validated prose" });
      continue;
    }
    const reasons: string[] = [];
    if (areaHash(input.headEntries, meta.paths, input.exclude) !== meta.tree_hash) {
      reasons.push("files in the area changed");
    }
    const then = input.blobsAt(meta.built_at_sha);
    if (then === undefined) {
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
    notes,
  };
}

export function isFresh(report: StalenessReport): boolean {
  return (
    report.stale.length === 0 &&
    report.notCovered.length === 0 &&
    report.newAreas.length === 0 &&
    report.removedAreas.length === 0 &&
    report.invalidPages.length === 0
  );
}

/** Slugs a refresh must re-map: stale, not covered, new, or with an unreadable page. */
export function areasToRemap(report: StalenessReport): string[] {
  return [
    ...new Set([
      ...report.stale.map((s) => s.slug),
      ...report.notCovered.map((s) => s.slug),
      ...report.newAreas.map((s) => s.slug),
    ]),
  ].sort();
}

function short(sha: string | undefined): string {
  return sha ? sha.slice(0, 7) : "unknown";
}

/**
 * One paragraph for Claude's context at session start. Names the stale areas and the
 * command that fixes them; never tells Claude to trust the map.
 */
export function formatReport(report: StalenessReport): string {
  const where = `built at ${short(report.mapSha)}, HEAD ${short(report.head)}`;
  if (isFresh(report)) {
    return `codebase-map: docs/codebase-map/ is fresh (${report.total} areas, ${where}). It is not loaded automatically; use the ask-codebase skill to route questions through it.`;
  }
  const parts: string[] = [];
  if (report.stale.length > 0) {
    const list = report.stale.map((s) => `${s.slug} (${s.reasons.join("; ")})`).join(", ");
    parts.push(`${report.stale.length} of ${report.total} areas stale: ${list}`);
  }
  if (report.notCovered.length > 0) parts.push(`not covered: ${report.notCovered.map((s) => s.slug).join(", ")}`);
  if (report.newAreas.length > 0) parts.push(`new areas with no page: ${report.newAreas.map((s) => s.slug).join(", ")}`);
  if (report.removedAreas.length > 0) parts.push(`pages for areas that no longer exist: ${report.removedAreas.join(", ")}`);
  if (report.invalidPages.length > 0) parts.push(`unreadable pages: ${report.invalidPages.map((p) => p.file).join(", ")}`);
  const notes = report.notes.length > 0 ? ` Note: ${report.notes.join("; ")}.` : "";
  return (
    `codebase-map: ${parts.join("; ")} (${where}). ` +
    "Treat those pages as possibly wrong and confirm against the code. " +
    `To re-map only these areas, run /ravn-agents:onboard --refresh.${notes}`
  );
}
