/** Shared shapes between the CLI, the agents' JSON output and the eval harness. */

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** Finder categories. Each one has an agent file `agents/pr-finder-<category>.md`. */
export const CATEGORIES = ["correctness", "security", "tests", "conventions"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Side = "LEFT" | "RIGHT";

export const VERDICTS = ["confirmed", "rejected", "uncertain"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** One candidate issue as a finder reports it, plus the verifier's ruling. */
export interface Finding {
  id: string;
  category: Category;
  path: string;
  /** Line in the file on `side`: head for RIGHT, base for LEFT. */
  line: number;
  startLine?: number;
  side: Side;
  severity: Severity;
  confidence: Confidence;
  title: string;
  body: string;
  /** Replacement text for a committable suggestion; only when it fixes the issue entirely. */
  suggestion?: string;
  verification: {
    verdict: Verdict;
    /** `path:line` citations the verifier read to reach the verdict. */
    evidence: string[];
    reason: string;
  };
}

export type FinderStatus = "ok" | "failed" | "partial";

/** What the coordinator records about each finder it ran (or chose not to run). */
export interface FinderRun {
  category: Category;
  status: FinderStatus;
  /** Files the finder was given. */
  files: string[];
  /** Filled when status is not ok: what failed and what was not reviewed as a result. */
  error?: string;
}

/** The coordinator's output file, `draft.json`, read by `finalize`. */
export interface Draft {
  schemaVersion: 1;
  mode: "routed" | "all-finders" | "self";
  selection: {
    ran: Category[];
    skipped: { category: Category; reason: string }[];
    rationale: string;
  };
  finders: FinderRun[];
  verifier: { status: FinderStatus; model: string; error?: string };
  findings: Finding[];
  /** Files nobody reviewed, with the reason. Rendered as coverage gaps. */
  notReviewed: { path: string; reason: string }[];
  summary: string;
}

/** Written by `prepare`, read by the coordinator and by `finalize`. */
export interface PrContext {
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  url: string;
  baseSha: string;
  headSha: string;
  headRef: string;
  state: string;
  /** Reviewed files, each with its line-numbered patch under the run directory. */
  files: { path: string; status: string; additions: number; deletions: number; patch: string }[];
  excluded: { path: string; reason: string }[];
  /** Repo instructions at the head SHA, when present. */
  claudeMd: string | null;
  /** Fingerprints of findings this tool already posted on the PR. */
  priorFingerprints: string[];
  priorComments: { path: string; line: number | null; body: string }[];
  diffSource: "diff" | "files-api";
  localCheckout: { path: string; atHead: boolean } | null;
}

export interface RoutedFinding extends Finding {
  fingerprint: string;
}

export interface Routing {
  inline: RoutedFinding[];
  summary: RoutedFinding[];
  /** Unverified, rejected, or already posted; never shown on the PR. */
  dropped: { finding: RoutedFinding; reason: string }[];
}

/** Body of `POST /repos/{owner}/{repo}/pulls/{n}/reviews`. */
export interface ReviewPayload {
  commit_id: string;
  event: "COMMENT";
  body: string;
  comments: {
    path: string;
    body: string;
    line: number;
    side: Side;
    start_line?: number;
    start_side?: Side;
  }[];
}
