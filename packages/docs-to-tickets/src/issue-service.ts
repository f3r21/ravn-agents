import { fail, ok, ToolError, toFailure, type ErrorCategory, type ToolResult } from "./errors.ts";
import { classifyGitHubError, GitHubHttpError, parseRepo, type GitHubClient, type GitHubIssue, type RepoRef } from "./github.ts";
import { idempotencyKey, readMarker } from "./idempotency.ts";
import type { ManifestEntry, ManifestStore } from "./manifest.ts";
import { summarise } from "./manifest.ts";
import type { Pacer } from "./pacer.ts";
import type { CreateArgs } from "./plan.ts";
import { renderFooter } from "./render.ts";
import { REVIEW_LABEL, route, type Thresholds } from "./routing.ts";

export interface ServiceDeps {
  /** False unless creation was enabled explicitly (RAVN_TICKETS_LIVE=1). */
  live: boolean;
  /** Null when no token is configured. */
  github: GitHubClient | null;
  thresholds: Thresholds;
  /** Null when CLAUDE_PLUGIN_DATA is missing; every tool call then fails with DT-NO-STATE-DIR. */
  manifests: ManifestStore | null;
  pacer: Pacer;
  sleep: (ms: number) => Promise<void>;
  nowS: () => number;
  /** Attempts per GitHub request, first one included. */
  maxAttempts?: number;
  /** Longest wait the server absorbs locally before handing the retry back to the agent. */
  maxWaitS?: number;
}

const ENABLE_HINT =
  "Creation is disabled (dry-run). To create issues, the user sets RAVN_TICKETS_LIVE=1 for the MCP server, " +
  "points it at a sandbox repository first, and restarts the session.";

const NEXT_STEP: Record<ErrorCategory, string> = {
  transient: "Wait retry_after_s, then call again with the same arguments; the idempotency key prevents duplicates.",
  validation: "Fix the field named in what_failed and call again once. If it fails again, stop and show the user.",
  business: "Explain the failure to the user and stop the batch. Do not retry.",
  permission:
    "Stop the batch and tell the user which permission is missing (issues:write, or push access for labels). Do not retry.",
};

/** The behaviour behind both tool definitions and the resource, independent of the MCP SDK. */
export class IssueService {
  private readonly deps: Required<ServiceDeps>;
  private login: string | null = null;
  /** Issues this tool created, per repo, keyed by idempotency key. Filled from GitHub on first use. */
  private readonly known = new Map<string, Map<string, GitHubIssue>>();
  /** Repos whose created issues have been listed from GitHub at least once in this process. */
  private readonly loaded = new Set<string>();

  constructor(deps: ServiceDeps) {
    this.deps = { maxAttempts: 3, maxWaitS: 60, ...deps };
  }

  async create(args: CreateArgs): Promise<ToolResult> {
    let progress = "Nothing was sent to GitHub.";
    try {
      const repo = this.repoOf(args.repo);
      const manifests = this.store();
      const key = idempotencyKey(args.repo, args.source_refs, args.title);
      if (args.source_refs.length === 0) throw validation("DT-INPUT", "source_refs is empty; every ticket must cite at least one requirement id.");
      if (key !== args.idempotency_key) {
        throw validation(
          "DT-KEY-MISMATCH",
          `idempotency_key ${args.idempotency_key} does not match the title and source_refs (expected ${key}). The ticket changed after planning.`,
          "Re-run the plan step and use the idempotency_key it prints for this ticket.",
        );
      }
      const routing = route(args.field_confidence, this.deps.thresholds, args.review_reasons);
      const body = `${args.body.trimEnd()}\n${renderFooter({
        sourceRefs: args.source_refs,
        confidence: args.field_confidence,
        needsReview: routing.needsReview,
        reasons: routing.reasons,
        key,
      })}`;
      const entry = (status: ManifestEntry["status"], extra: Partial<ManifestEntry> = {}) =>
        manifests.upsert(args.repo, {
          key,
          title: args.title,
          source_refs: args.source_refs,
          needs_review: routing.needsReview,
          review_reasons: routing.reasons,
          status,
          ...extra,
        });

      if (!this.deps.live) {
        const previous = manifests.get(args.repo, key);
        if (previous?.status === "created") return ok(duplicateResult(previous.issue_number, previous.url, key, "dry-run"));
        entry("dry_run");
        return ok({
          mode: "dry-run",
          created: false,
          idempotency_key: key,
          needs_review: routing.needsReview,
          review_reasons: routing.reasons,
          would_create: { repo: args.repo, title: args.title, labels: withReview(args.labels, routing.needsReview), body },
          next_step: ENABLE_HINT,
        });
      }

      const github = this.requireGitHub();
      const existing = await this.findExisting(github, repo, args.repo, key, false);
      if (existing) {
        entry("skipped_duplicate", { issue_number: existing.number, url: existing.html_url });
        return ok(duplicateResult(existing.number, existing.html_url, key, "live"));
      }

      const repoLabels = new Set((await this.withRetry(() => github.listLabels(repo))).map((l) => l.toLowerCase()));
      const requested = withReview(args.labels, routing.needsReview);
      const notInRepo = args.labels.filter((l) => !repoLabels.has(l.toLowerCase()) && l !== REVIEW_LABEL);
      if (routing.needsReview && !repoLabels.has(REVIEW_LABEL)) {
        await this.ensureReviewLabel(github, repo);
        progress = `Created the ${REVIEW_LABEL} label in ${args.repo}.`;
      }
      const labels = requested.filter((l) => l === REVIEW_LABEL || repoLabels.has(l.toLowerCase()));

      entry("planned");
      const issue = await this.createOnce(github, repo, args.repo, key, { title: args.title, body, labels }, (p) => {
        progress = p;
      });
      this.cache(args.repo).set(key, issue);
      progress = `Created issue #${issue.number} (${issue.html_url}).`;

      const readBack = await this.withRetry(() => github.getIssue(repo, issue.number));
      const stuck = new Set(readBack.labels.map((l) => l.toLowerCase()));
      const dropped = labels.filter((l) => !stuck.has(l.toLowerCase()));
      if (routing.needsReview && !stuck.has(REVIEW_LABEL)) {
        entry("created", { issue_number: issue.number, url: issue.html_url, label_missing: true });
        return fail({
          category: "permission",
          retryable: false,
          failure_mode: "DT-LABEL-DROPPED",
          what_failed: `Issue #${issue.number} was created WITHOUT its ${REVIEW_LABEL} label. GitHub drops labels silently when the token lacks push access.`,
          what_was_done: `${progress} Read it back: labels are [${readBack.labels.join(", ")}].`,
          next_step: `Tell the user issue #${issue.number} (${issue.html_url}) needs review but is not labelled; stop the batch until the token has push access. Do not create it again.`,
        });
      }
      entry("created", { issue_number: issue.number, url: issue.html_url });
      return ok({
        mode: "live",
        created: true,
        issue: { number: issue.number, url: issue.html_url },
        idempotency_key: key,
        needs_review: routing.needsReview,
        labels: readBack.labels,
        labels_dropped: dropped,
        labels_not_in_repo: notInRepo,
      });
    } catch (error) {
      if (error instanceof ToolError) {
        this.recordFailure(args, error);
        return toFailure(error, progress);
      }
      const c = classifyGitHubError(error, this.deps.nowS());
      const wrapped = new ToolError({
        category: c.category,
        retryable: c.retryable,
        ...(c.retry_after_s === undefined ? {} : { retry_after_s: c.retry_after_s }),
        failure_mode: c.failure_mode,
        what_failed: c.summary,
        what_was_done: progress,
        next_step: NEXT_STEP[c.category],
      });
      this.recordFailure(args, wrapped);
      return toFailure(wrapped, progress);
    }
  }

  /** Issues this tool created in a repo: the manifest, reconciled with GitHub when live. */
  async listCreated(repoFull: string): Promise<ToolResult> {
    try {
      return ok(await this.listCreatedData(repoFull));
    } catch (error) {
      if (error instanceof ToolError) return toFailure(error, "Nothing was changed.");
      const c = classifyGitHubError(error, this.deps.nowS());
      return fail({
        category: c.category,
        retryable: c.retryable,
        ...(c.retry_after_s === undefined ? {} : { retry_after_s: c.retry_after_s }),
        failure_mode: c.failure_mode,
        what_failed: `Could not list issues: ${c.summary}. This is an access failure, not an empty result.`,
        what_was_done: "Nothing was changed.",
        next_step: NEXT_STEP[c.category],
      });
    }
  }

  async listCreatedData(repoFull: string) {
    const repo = this.repoOf(repoFull);
    const manifests = this.store();
    const manifest = manifests.load(repoFull);
    const byKey = new Map(manifest.entries.map((e) => [e.key, e]));
    const issues: Record<string, unknown>[] = [];
    if (this.deps.live && this.deps.github) {
      await this.findExisting(this.deps.github, repo, repoFull, "", true);
      for (const [key, issue] of this.cache(repoFull)) {
        const e = byKey.get(key);
        issues.push({
          idempotency_key: key,
          number: issue.number,
          url: issue.html_url,
          title: issue.title,
          state: issue.state,
          needs_review: issue.labels.includes(REVIEW_LABEL),
          source_refs: e?.source_refs ?? [],
        });
      }
    }
    const summary = summarise(manifest);
    return {
      repo: repoFull,
      mode: this.deps.live ? "live" : "dry-run",
      on_github: issues,
      manifest: {
        path: manifests.pathFor(repoFull),
        created: summary.created.length,
        skipped_duplicate: summary.skipped_duplicate.length,
        failed: summary.failed.map((e) => ({ key: e.key, title: e.title, error: e.error })),
        not_attempted: summary.not_attempted.map((e) => ({ key: e.key, title: e.title, status: e.status })),
        label_missing: manifest.entries.filter((e) => e.label_missing).map((e) => e.issue_number),
      },
    };
  }

  private repoOf(full: string): RepoRef {
    const repo = parseRepo(full);
    if (!repo) throw validation("DT-INPUT", `repo "${full}" is not in owner/name form.`);
    return repo;
  }

  private store(): ManifestStore {
    if (this.deps.manifests) return this.deps.manifests;
    throw new ToolError({
      category: "business",
      retryable: false,
      failure_mode: "DT-NO-STATE-DIR",
      what_failed: "CLAUDE_PLUGIN_DATA is not set, so the server has nowhere to keep the batch manifest.",
      what_was_done: "Nothing was sent to GitHub and nothing was written.",
      next_step:
        "Stop and tell the user the tickets MCP server must run as part of the ravn-agents plugin (Claude Code sets CLAUDE_PLUGIN_DATA for it), or with CLAUDE_PLUGIN_DATA set explicitly.",
    });
  }

  private requireGitHub(): GitHubClient {
    if (this.deps.github) return this.deps.github;
    throw new ToolError({
      category: "permission",
      retryable: false,
      failure_mode: "DT-GH-AUTH",
      what_failed: "Live mode is on but no GitHub token is configured.",
      what_was_done: "Nothing was sent to GitHub.",
      next_step: "Ask the user to set the plugin's github_token (issues:write on the target repo) and restart the session.",
    });
  }

  private cache(repoFull: string): Map<string, GitHubIssue> {
    let m = this.known.get(repoFull.toLowerCase());
    if (!m) {
      m = new Map();
      this.known.set(repoFull.toLowerCase(), m);
    }
    return m;
  }

  /** Dedupe by listing the token user's issues and reading body markers; never through search. */
  private async findExisting(github: GitHubClient, repo: RepoRef, repoFull: string, key: string, refresh: boolean) {
    const cache = this.cache(repoFull);
    if (refresh || !this.loaded.has(repoFull.toLowerCase())) {
      this.login ??= await this.withRetry(() => github.authenticatedLogin());
      const login = this.login;
      const issues = await this.withRetry(() => github.listIssuesByCreator(repo, login));
      for (const issue of issues) {
        const k = readMarker(issue.body);
        if (k) cache.set(k, issue);
      }
      this.loaded.add(repoFull.toLowerCase());
    }
    return key ? cache.get(key) : undefined;
  }

  private async ensureReviewLabel(github: GitHubClient, repo: RepoRef): Promise<void> {
    try {
      await this.deps.pacer.run(() =>
        github.createLabel(repo, REVIEW_LABEL, "d93f0b", "Created by docs-to-tickets below the confidence threshold"),
      );
    } catch (error) {
      // 422 means the label already exists (created concurrently); anything else propagates.
      if (!(error instanceof GitHubHttpError && error.status === 422)) throw error;
    }
  }

  /**
   * One paced POST, retried only for transient failures. Before each retry the server lists
   * again: a POST that timed out may still have created the issue.
   */
  private async createOnce(
    github: GitHubClient,
    repo: RepoRef,
    repoFull: string,
    key: string,
    issue: { title: string; body: string; labels: string[] },
    report: (progress: string) => void,
  ): Promise<GitHubIssue> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.deps.pacer.run(() => github.createIssue(repo, issue));
      } catch (error) {
        const c = classifyGitHubError(error, this.deps.nowS());
        const wait = c.retry_after_s ?? 0;
        if (!c.retryable || attempt >= this.deps.maxAttempts || wait > this.deps.maxWaitS) throw error;
        report(`Attempt ${attempt} failed (${c.failure_mode}); waited ${wait}s and checked for a duplicate before retrying.`);
        await this.deps.sleep(wait * 1000);
        const landed = await this.findExisting(github, repo, repoFull, key, true);
        if (landed) return landed;
      }
    }
  }

  /** Retries a read on transient failures within the local wait budget. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const c = classifyGitHubError(error, this.deps.nowS());
        const wait = c.retry_after_s ?? 0;
        if (!c.retryable || attempt >= this.deps.maxAttempts || wait > this.deps.maxWaitS) throw error;
        await this.deps.sleep(wait * 1000);
      }
    }
  }

  private recordFailure(args: CreateArgs, error: ToolError): void {
    const manifests = this.deps.manifests;
    if (!manifests || !parseRepo(args.repo) || args.source_refs.length === 0) return;
    const key = idempotencyKey(args.repo, args.source_refs, args.title);
    const previous = manifests.get(args.repo, key);
    if (previous?.status === "created") return;
    manifests.upsert(args.repo, {
      key,
      title: args.title,
      source_refs: args.source_refs,
      needs_review: previous?.needs_review ?? false,
      review_reasons: previous?.review_reasons ?? [],
      status: "failed",
      error: { category: error.body.category, failure_mode: error.body.failure_mode, what_failed: error.body.what_failed },
    });
  }
}

function validation(failureMode: string, whatFailed: string, nextStep = NEXT_STEP.validation): ToolError {
  return new ToolError({
    category: "validation",
    retryable: false,
    failure_mode: failureMode,
    what_failed: whatFailed,
    what_was_done: "Nothing was sent to GitHub.",
    next_step: nextStep,
  });
}

function withReview(labels: readonly string[], needsReview: boolean): string[] {
  const out = labels.filter((l) => l !== REVIEW_LABEL);
  return needsReview ? [...out, REVIEW_LABEL] : out;
}

function duplicateResult(number: number | undefined, url: string | undefined, key: string, mode: string) {
  return {
    mode,
    created: false,
    existing: { number, url },
    idempotency_key: key,
    next_step: "Already created earlier with this idempotency key; skip it and continue with the next ticket.",
  };
}
