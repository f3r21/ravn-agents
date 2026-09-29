import type { ErrorCategory } from "./errors.ts";

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  labels: string[];
  state: string;
}

export interface NewIssue {
  title: string;
  body: string;
  labels: string[];
}

/** The narrow slice of the GitHub REST API the server needs. Tests pass a fake. */
export interface GitHubClient {
  authenticatedLogin(): Promise<string>;
  /** Every issue (open and closed, pull requests excluded) opened by `creator`, all pages. */
  listIssuesByCreator(repo: RepoRef, creator: string): Promise<GitHubIssue[]>;
  listLabels(repo: RepoRef): Promise<string[]>;
  createLabel(repo: RepoRef, name: string, color: string, description: string): Promise<void>;
  createIssue(repo: RepoRef, issue: NewIssue): Promise<GitHubIssue>;
  getIssue(repo: RepoRef, number: number): Promise<GitHubIssue>;
}

export function parseRepo(full: string): RepoRef | null {
  const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(full.trim());
  return m ? { owner: m[1]!, repo: m[2]! } : null;
}

export class GitHubHttpError extends Error {
  readonly status: number;
  readonly headers: Record<string, string>;
  constructor(status: number, headers: Record<string, string>, message: string) {
    super(message);
    this.name = "GitHubHttpError";
    this.status = status;
    this.headers = headers;
  }
}

/** A request that may or may not have reached GitHub (timeout, reset connection). */
export class GitHubNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubNetworkError";
  }
}

export interface Classification {
  category: ErrorCategory;
  retryable: boolean;
  retry_after_s?: number;
  failure_mode: string;
  summary: string;
}

/** Maps a GitHub failure to the error taxonomy (FAILURE-MODES.md). `nowS` is Unix seconds. */
export function classifyGitHubError(error: unknown, nowS: number): Classification {
  if (error instanceof GitHubNetworkError) {
    return { category: "transient", retryable: true, retry_after_s: 2, failure_mode: "DT-GH-NETWORK", summary: error.message };
  }
  if (!(error instanceof GitHubHttpError)) {
    const message = error instanceof Error ? error.message : String(error);
    return { category: "business", retryable: false, failure_mode: "DT-UNEXPECTED", summary: message };
  }
  const { status, headers, message } = error;
  const summary = `GitHub answered ${status}: ${message}`;
  if ((status === 403 || status === 429) && headers["x-ratelimit-remaining"] === "0") {
    const reset = Number(headers["x-ratelimit-reset"]);
    const wait = Number.isFinite(reset) ? Math.max(1, Math.ceil(reset - nowS)) : 60;
    return { category: "transient", retryable: true, retry_after_s: wait, failure_mode: "DT-GH-PRIMARY-RATE-LIMIT", summary };
  }
  if ((status === 403 || status === 429) && (headers["retry-after"] !== undefined || /secondary rate limit/i.test(message))) {
    const retryAfter = Number(headers["retry-after"]);
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
    return { category: "transient", retryable: true, retry_after_s: wait, failure_mode: "DT-GH-SECONDARY-RATE-LIMIT", summary };
  }
  if (status === 401) return { category: "permission", retryable: false, failure_mode: "DT-GH-AUTH", summary };
  if (status === 403 || status === 404) return { category: "permission", retryable: false, failure_mode: "DT-GH-PERMISSION", summary };
  if (status === 410) return { category: "business", retryable: false, failure_mode: "DT-GH-ISSUES-DISABLED", summary };
  if (status === 422) return { category: "validation", retryable: false, failure_mode: "DT-GH-VALIDATION", summary };
  if (status >= 500) return { category: "transient", retryable: true, retry_after_s: 5, failure_mode: "DT-GH-SERVER", summary };
  return { category: "business", retryable: false, failure_mode: "DT-UNEXPECTED", summary };
}

interface RawIssue {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  labels: (string | { name?: string })[];
  pull_request?: unknown;
}

const toIssue = (raw: RawIssue): GitHubIssue => ({
  number: raw.number,
  html_url: raw.html_url,
  title: raw.title,
  body: raw.body,
  state: raw.state,
  labels: raw.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
});

/** GitHub REST over fetch. Every request is sent once; retrying is the caller's decision. */
export class FetchGitHubClient implements GitHubClient {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(token: string, baseUrl = "https://api.github.com", timeoutMs = 30_000) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "ravn-agents-docs-to-tickets",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new GitHubNetworkError(`${method} ${path} did not complete: ${(error as Error).message}`);
    }
    if (!response.ok) {
      const headers = Object.fromEntries([...response.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
      const text = await response.text();
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // Non-JSON error body; keep the raw text.
      }
      throw new GitHubHttpError(response.status, headers, message);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  private repoPath({ owner, repo }: RepoRef): string {
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  async authenticatedLogin(): Promise<string> {
    return (await this.request<{ login: string }>("GET", "/user")).login;
  }

  async listIssuesByCreator(repo: RepoRef, creator: string): Promise<GitHubIssue[]> {
    const out: GitHubIssue[] = [];
    for (let page = 1; ; page++) {
      const query = `state=all&per_page=100&page=${page}&creator=${encodeURIComponent(creator)}`;
      const batch = await this.request<RawIssue[]>("GET", `${this.repoPath(repo)}/issues?${query}`);
      out.push(...batch.filter((i) => i.pull_request === undefined).map(toIssue));
      if (batch.length < 100) return out;
    }
  }

  async listLabels(repo: RepoRef): Promise<string[]> {
    const out: string[] = [];
    for (let page = 1; ; page++) {
      const batch = await this.request<{ name: string }[]>("GET", `${this.repoPath(repo)}/labels?per_page=100&page=${page}`);
      out.push(...batch.map((l) => l.name));
      if (batch.length < 100) return out;
    }
  }

  async createLabel(repo: RepoRef, name: string, color: string, description: string): Promise<void> {
    await this.request("POST", `${this.repoPath(repo)}/labels`, { name, color, description });
  }

  async createIssue(repo: RepoRef, issue: NewIssue): Promise<GitHubIssue> {
    return toIssue(await this.request<RawIssue>("POST", `${this.repoPath(repo)}/issues`, issue));
  }

  async getIssue(repo: RepoRef, number: number): Promise<GitHubIssue> {
    return toIssue(await this.request<RawIssue>("GET", `${this.repoPath(repo)}/issues/${number}`));
  }
}
