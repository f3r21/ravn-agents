/**
 * The posting policy, applied in code rather than in a prompt (decision 17):
 * verified + critical/high + anchorable -> inline; other verified findings -> the summary comment;
 * unverified, rejected, duplicate or already-posted findings -> never shown.
 */

import { createHash } from "node:crypto";
import { commentableLines, type DiffFile } from "./diff.ts";
import type { Draft, Finding, RoutedFinding, Routing, Severity } from "./types.ts";

export const INLINE_SEVERITIES: ReadonlySet<Severity> = new Set(["critical", "high"]);
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Stable across pushes: ignores the line number, which moves when code above it changes. */
export function fingerprint(f: Pick<Finding, "category" | "path" | "title">): string {
  const norm = f.title.toLowerCase().replace(/[`'"]/g, "").replace(/\s+/g, " ").trim();
  return createHash("sha1").update(`${f.category}|${f.path}|${norm}`).digest("hex").slice(0, 12);
}

export const MARKER_RE = /<!-- ravn-pr-review:fp=([0-9a-f,]+) -->/g;

export function marker(fps: string[]): string {
  return `<!-- ravn-pr-review:fp=${fps.join(",")} -->`;
}

/** Fingerprints found in bodies this tool posted earlier. */
export function fingerprintsIn(bodies: string[]): string[] {
  const out = new Set<string>();
  for (const b of bodies) for (const m of b.matchAll(MARKER_RE)) for (const fp of m[1]!.split(",")) out.add(fp);
  return [...out];
}

/** Why a finding cannot be an inline comment, or null when GitHub will accept its anchor. */
export function anchorProblem(f: Finding, files: Map<string, DiffFile>): string | null {
  const file = files.get(f.path);
  if (!file) return "file is not part of the reviewed diff";
  const lines = commentableLines(file)[f.side];
  if (!lines.has(f.line)) return `line ${f.line} (${f.side}) is not shown in the diff`;
  if (f.startLine !== undefined) {
    if (!lines.has(f.startLine)) return `start line ${f.startLine} (${f.side}) is not shown in the diff`;
    const hunk = file.hunks.find((h) => h.lines.some((l) => (f.side === "RIGHT" ? l.newLine : l.oldLine) === f.line));
    const inSame = hunk?.lines.some((l) => (f.side === "RIGHT" ? l.newLine : l.oldLine) === f.startLine);
    if (!inSame) return "multi-line range spans more than one hunk";
  }
  return null;
}

export function route(draft: Draft, files: DiffFile[], priorFingerprints: string[] = []): Routing {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const prior = new Set(priorFingerprints);
  const routing: Routing = { inline: [], summary: [], dropped: [] };

  const sorted = [...draft.findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const seen = new Set<string>();

  for (const f of sorted) {
    const rf: RoutedFinding = { ...f, fingerprint: fingerprint(f) };
    if (draft.verifier.status === "failed") {
      routing.dropped.push({ finding: rf, reason: "verifier failed; nothing is posted unverified" });
      continue;
    }
    if (f.verification.verdict !== "confirmed") {
      routing.dropped.push({ finding: rf, reason: `verifier: ${f.verification.verdict}` });
      continue;
    }
    if (seen.has(rf.fingerprint)) {
      routing.dropped.push({ finding: rf, reason: "duplicate of a higher-ranked finding" });
      continue;
    }
    seen.add(rf.fingerprint);
    if (prior.has(rf.fingerprint)) {
      routing.dropped.push({ finding: rf, reason: "already posted on this PR" });
      continue;
    }
    if (INLINE_SEVERITIES.has(f.severity)) {
      const problem = anchorProblem(f, byPath);
      if (problem === null) {
        routing.inline.push(rf);
        continue;
      }
      routing.summary.push({ ...rf, body: `${rf.body}\n\n_(Not posted inline: ${problem}.)_` });
      continue;
    }
    routing.summary.push(rf);
  }
  return routing;
}

/** After GitHub rejects an inline anchor (422), everything goes to the summary; nothing is lost. */
export function demoteInline(routing: Routing, reason: string): Routing {
  return {
    inline: [],
    summary: [...routing.inline.map((f) => ({ ...f, body: `${f.body}\n\n_(Not posted inline: ${reason}.)_` })), ...routing.summary],
    dropped: routing.dropped,
  };
}
