/** GitHub access through the `gh` CLI. Every failure becomes a typed ReviewError. */

import { execFile } from "node:child_process";
import { ReviewError, classifyGhFailure } from "./errors.ts";
import type { ReviewPayload } from "./types.ts";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a command; injectable so tests never touch the network. */
export type Runner = (cmd: string, args: string[], input?: string) => Promise<RunResult>;

export const execRunner: Runner = (cmd, args, input) =>
  new Promise((resolve) => {
    const child = execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException).code === "number" ? Number((err as NodeJS.ErrnoException).code) : 1) : 0;
      const enoent = (err as NodeJS.ErrnoException | null)?.code === "ENOENT";
      resolve({ code, stdout: stdout ?? "", stderr: enoent ? "gh: command not found (ENOENT)" : (stderr ?? "") });
    });
    if (input !== undefined) child.stdin?.end(input);
  });

export interface PrRef {
  repo: string;
  number: number;
}

/** Accepts a PR URL, `owner/repo#N`, or a bare number with `repo` supplied. */
export function parsePrRef(arg: string, repo?: string): PrRef {
  const url = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(arg);
  if (url) return { repo: url[1]!, number: Number(url[2]) };
  const short = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(arg);
  if (short) return { repo: short[1]!, number: Number(short[2]) };
  if (/^\d+$/.test(arg)) {
    if (!repo) throw new ReviewError("invalid_input", "A bare PR number needs --repo owner/name, or run inside a clone of the repo.");
    return { repo, number: Number(arg) };
  }
  throw new ReviewError("invalid_input", `Not a PR reference: ${arg}. Use a URL, owner/repo#N, or a number.`);
}

export class GitHub {
  private readonly run: Runner;

  constructor(run: Runner = execRunner) {
    this.run = run;
  }

  private async gh(args: string[], input?: string): Promise<string> {
    const res = await this.run("gh", args, input);
    if (res.code !== 0) throw classifyGhFailure(res.stderr, res.stdout);
    return res.stdout;
  }

  async currentRepo(): Promise<string | null> {
    const res = await this.run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
    return res.code === 0 ? res.stdout.trim() || null : null;
  }

  async prView(ref: PrRef): Promise<{
    number: number;
    title: string;
    body: string;
    author: { login: string };
    url: string;
    baseRefOid: string;
    headRefOid: string;
    headRefName: string;
    state: string;
    files: { path: string; additions: number; deletions: number; changeType?: string }[];
  }> {
    const fields = "number,title,body,author,url,baseRefOid,headRefOid,headRefName,state,files";
    return JSON.parse(await this.gh(["pr", "view", String(ref.number), "-R", ref.repo, "--json", fields]));
  }

  /** The PR diff. On a too-large diff, rebuilds one from the files API (patches may be partial). */
  async diff(ref: PrRef): Promise<{ text: string; source: "diff" | "files-api"; missingPatch: string[] }> {
    try {
      return { text: await this.gh(["pr", "diff", String(ref.number), "-R", ref.repo]), source: "diff", missingPatch: [] };
    } catch (err) {
      if (!(err instanceof ReviewError) || err.kind !== "diff_too_large") throw err;
    }
    const raw = await this.gh(["api", "--paginate", "--slurp", `repos/${ref.repo}/pulls/${ref.number}/files?per_page=100`]);
    const pages = JSON.parse(raw) as { filename: string; previous_filename?: string; status: string; patch?: string }[][];
    const missingPatch: string[] = [];
    const parts: string[] = [];
    for (const f of pages.flat()) {
      if (!f.patch) {
        missingPatch.push(f.filename);
        continue;
      }
      const oldPath = f.status === "added" ? "/dev/null" : `a/${f.previous_filename ?? f.filename}`;
      const newPath = f.status === "removed" ? "/dev/null" : `b/${f.filename}`;
      const mode = f.status === "added" ? "new file mode 100644\n" : f.status === "removed" ? "deleted file mode 100644\n" : "";
      parts.push(`diff --git a/${f.previous_filename ?? f.filename} b/${f.filename}\n${mode}--- ${oldPath}\n+++ ${newPath}\n${f.patch}\n`);
    }
    return { text: parts.join(""), source: "files-api", missingPatch };
  }

  /** A file's content at a ref, or null when it does not exist. */
  async fileAt(repo: string, path: string, ref: string): Promise<string | null> {
    try {
      return await this.gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${path}?ref=${ref}`]);
    } catch (err) {
      if (err instanceof ReviewError && err.kind === "not_found") return null;
      throw err;
    }
  }

  /** Inline comments and review bodies already on the PR. */
  async existingFeedback(ref: PrRef): Promise<{ path: string; line: number | null; body: string }[]> {
    const comments = JSON.parse(
      await this.gh(["api", "--paginate", "--slurp", `repos/${ref.repo}/pulls/${ref.number}/comments?per_page=100`]),
    ) as { path: string; line: number | null; body: string }[][];
    const reviews = JSON.parse(
      await this.gh(["api", "--paginate", "--slurp", `repos/${ref.repo}/pulls/${ref.number}/reviews?per_page=100`]),
    ) as { body: string }[][];
    return [
      ...comments.flat().map((c) => ({ path: c.path, line: c.line ?? null, body: c.body })),
      ...reviews.flat().filter((r) => r.body).map((r) => ({ path: "", line: null, body: r.body })),
    ];
  }

  /** Posts one review. Transient failures are retried serially with the server's wait, at most `attempts` times. */
  async postReview(
    ref: PrRef,
    payload: ReviewPayload,
    opts: { attempts?: number; sleep?: (s: number) => Promise<void> } = {},
  ): Promise<{ id: number; html_url: string }> {
    const attempts = opts.attempts ?? 3;
    const sleep = opts.sleep ?? ((s: number) => new Promise((r) => setTimeout(r, s * 1000)));
    let last: ReviewError | null = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const out = await this.gh(["api", "-X", "POST", `repos/${ref.repo}/pulls/${ref.number}/reviews`, "--input", "-"], JSON.stringify(payload));
        return JSON.parse(out);
      } catch (err) {
        if (!(err instanceof ReviewError) || !err.retryable) throw err;
        last = err;
        if (i < attempts - 1) await sleep(Math.min(err.retryAfter ?? 5 * 2 ** i, 300));
      }
    }
    throw last ?? new ReviewError("unknown", "postReview failed");
  }
}
