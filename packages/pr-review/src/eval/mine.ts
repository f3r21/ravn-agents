/**
 * SZZ-style candidate mining (research doc 3.5, steps 1-2). For each merged PR that looks like a
 * fix, blame the source lines it deleted or modified at its parent commit, then map the blamed
 * commits back to the PRs that introduced them. The output is a list of CANDIDATES: SZZ labels are
 * noisy (roughly half of "fixes" are not fixes), so every pair is confirmed by hand before it
 * enters items.json.
 */

import type { Runner } from "../github.ts";
import { parseDiff } from "../diff.ts";

export interface MergedPr {
  number: number;
  title: string;
  body: string;
  headRefName: string;
  baseRefName: string;
  mergedAt: string;
  mergeCommit: { oid: string } | null;
}

export interface InducingCandidate {
  pr: number;
  title: string;
  /** Deleted/modified lines of the fix that blame to this PR. */
  lines: number;
  /** Per file: line numbers in the blamed commit's version, and the line text. */
  locations: { path: string; line: number; text: string }[];
  commits: string[];
}

export interface FixCandidate {
  fixPr: number;
  fixTitle: string;
  fixCommit: string;
  /** No deleted source lines: SZZ cannot trace it (a "ghost" fix that only adds code). */
  ghost: boolean;
  inducing: InducingCandidate[];
  /** PR numbers the fix PR's text mentions, for hand confirmation. */
  mentions: number[];
}

const FIX_TITLE = /^(fix|revert)(\(|:|!)|\bregression\b|\bbug\b/i;
const NON_SOURCE =
  /(\.(md|mdx|txt|snap|lock)$|(^|\/)(CHANGELOG|LICENSE)|package-lock\.json$|\.(test|spec|stories)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?|e2e|docs|dist)\/|(^|\/)(vitest|vite|eslint|prettier|tsconfig)[^/]*$)/i;

/** Comment-only lines carry no behaviour; SZZ variants exclude them along with whitespace. */
const COMMENT_ONLY = /^\s*(\/\/|\/\*|\*|#(?!!)|<!--|\{\s*\/\*)/;

export function isFixTitle(title: string): boolean {
  return FIX_TITLE.test(title);
}

export function isSourcePath(path: string): boolean {
  return !NON_SOURCE.test(path);
}

/** Parses `git blame --line-porcelain` into (commit, original line, text) per blamed line. */
export function parseBlame(out: string): { commit: string; origLine: number; text: string }[] {
  const res: { commit: string; origLine: number; text: string }[] = [];
  let cur: { commit: string; origLine: number } | null = null;
  for (const line of out.split("\n")) {
    const header = /^([0-9a-f]{40}) (\d+) (\d+)/.exec(line);
    if (header) {
      cur = { commit: header[1]!, origLine: Number(header[2]) };
      continue;
    }
    if (line.startsWith("\t") && cur) {
      res.push({ ...cur, text: line.slice(1) });
      cur = null;
    }
  }
  return res;
}

export function mentionedPrs(text: string): number[] {
  return [...new Set([...text.matchAll(/(?:^|[\s(])#(\d{1,4})\b/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

export class Miner {
  private readonly prOfCommit = new Map<string, MergedPr | null>();
  readonly repo: string;
  readonly clone: string;
  private readonly run: Runner;
  private readonly merged: MergedPr[];

  constructor(repo: string, clone: string, run: Runner, merged: MergedPr[]) {
    this.repo = repo;
    this.clone = clone;
    this.run = run;
    this.merged = merged;
  }

  private async git(args: string[]): Promise<string> {
    const r = await this.run("git", ["-C", this.clone, ...args]);
    if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout;
  }

  /** The PR that introduced a commit, skipping promotion PRs (dev -> main) that only carry it. */
  async prFor(commit: string): Promise<MergedPr | null> {
    if (this.prOfCommit.has(commit)) return this.prOfCommit.get(commit)!;
    const r = await this.run("gh", ["api", `repos/${this.repo}/commits/${commit}/pulls`]);
    let found: MergedPr | null = null;
    if (r.code === 0) {
      const prs = JSON.parse(r.stdout) as { number: number; head: { ref: string }; merged_at: string | null }[];
      const real = prs.filter((p) => p.merged_at && p.head.ref !== "dev").sort((a, b) => a.number - b.number);
      const pick = real[0] ?? null;
      found = pick ? (this.merged.find((m) => m.number === pick.number) ?? null) : null;
    }
    this.prOfCommit.set(commit, found);
    return found;
  }

  async analyse(fix: MergedPr): Promise<FixCandidate | null> {
    if (!fix.mergeCommit) return null;
    const sha = fix.mergeCommit.oid;
    const parent = (await this.git(["rev-parse", `${sha}^1`])).trim();
    const diff = parseDiff(await this.git(["diff", "--no-color", "-U0", "-w", parent, sha]));
    const byPr = new Map<number, InducingCandidate>();
    let traced = 0;

    for (const file of diff) {
      if (file.status === "added" || !file.oldPath || !isSourcePath(file.oldPath)) continue;
      const deleted = file.hunks.flatMap((h) =>
        h.lines.filter((l) => l.kind === "del" && l.text.trim().length > 1 && !COMMENT_ONLY.test(l.text)).map((l) => l.oldLine!),
      );
      for (const line of deleted) {
        const blame = parseBlame(await this.git(["blame", "-w", "--line-porcelain", "-L", `${line},${line}`, parent, "--", file.oldPath]));
        for (const b of blame) {
          const pr = await this.prFor(b.commit);
          if (!pr || pr.number === fix.number) continue;
          traced++;
          const c = byPr.get(pr.number) ?? { pr: pr.number, title: pr.title, lines: 0, locations: [], commits: [] };
          c.lines++;
          c.locations.push({ path: file.oldPath, line: b.origLine, text: b.text.trim().slice(0, 160) });
          if (!c.commits.includes(b.commit)) c.commits.push(b.commit);
          byPr.set(pr.number, c);
        }
      }
    }
    return {
      fixPr: fix.number,
      fixTitle: fix.title,
      fixCommit: sha,
      ghost: traced === 0,
      inducing: [...byPr.values()].sort((a, b) => b.lines - a.lines),
      mentions: mentionedPrs(`${fix.title}\n${fix.body}`),
    };
  }
}

export async function listMerged(run: Runner, repo: string): Promise<MergedPr[]> {
  const r = await run("gh", [
    "pr", "list", "-R", repo, "--state", "merged", "--limit", "500",
    "--json", "number,title,body,headRefName,baseRefName,mergedAt,mergeCommit",
  ]);
  if (r.code !== 0) throw new Error(`gh pr list: ${r.stderr}`);
  return JSON.parse(r.stdout) as MergedPr[];
}

/** Fix-looking PRs, plus any numbers named by hand (a fix titled "feat" still fixes something). */
export function fixCandidates(merged: MergedPr[], extra: number[] = []): MergedPr[] {
  return merged.filter(
    (p) => extra.includes(p.number) || (p.headRefName !== "dev" && !p.headRefName.startsWith("dependabot/") && isFixTitle(p.title)),
  );
}
