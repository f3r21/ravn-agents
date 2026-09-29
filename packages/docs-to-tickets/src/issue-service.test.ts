import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolResult } from "./errors.ts";
import { GitHubHttpError, GitHubNetworkError, type GitHubClient, type GitHubIssue, type NewIssue, type RepoRef } from "./github.ts";
import { idempotencyKey, readMarker } from "./idempotency.ts";
import { IssueService } from "./issue-service.ts";
import { ManifestStore } from "./manifest.ts";
import { Pacer } from "./pacer.ts";
import type { CreateArgs } from "./plan.ts";
import { DEFAULT_THRESHOLDS } from "./routing.ts";
import { HIGH } from "./test-fixtures.ts";

/** In-memory GitHub. Never touches the network. */
class FakeGitHub implements GitHubClient {
  issues: GitHubIssue[] = [];
  labels = ["bug", "ui"];
  calls: string[] = [];
  /** Simulates a token without push access: labels are silently dropped on create. */
  dropLabels = false;
  /** Errors thrown by the next createIssue calls, in order. */
  createFailures: Error[] = [];
  /** When true, a failing createIssue still creates the issue (a POST that timed out after landing). */
  landOnFailure = false;
  listFailure: Error | null = null;

  async authenticatedLogin() {
    this.calls.push("login");
    return "bot";
  }
  async listIssuesByCreator(_repo: RepoRef, creator: string) {
    this.calls.push(`list:${creator}`);
    if (this.listFailure) throw this.listFailure;
    return this.issues.map((i) => ({ ...i }));
  }
  async listLabels() {
    this.calls.push("labels");
    return [...this.labels];
  }
  async createLabel(_repo: RepoRef, name: string) {
    this.calls.push(`label:${name}`);
    this.labels.push(name);
  }
  async createIssue(_repo: RepoRef, issue: NewIssue) {
    this.calls.push("create");
    const failure = this.createFailures.shift();
    if (failure && !this.landOnFailure) throw failure;
    const created: GitHubIssue = {
      number: 100 + this.issues.length,
      html_url: `https://github.com/o/r/issues/${100 + this.issues.length}`,
      title: issue.title,
      body: issue.body,
      state: "open",
      labels: this.dropLabels ? [] : issue.labels.filter((l) => this.labels.includes(l)),
    };
    this.issues.push(created);
    if (failure) throw failure;
    return { ...created };
  }
  async getIssue(_repo: RepoRef, number: number) {
    this.calls.push(`get:${number}`);
    return { ...this.issues.find((i) => i.number === number)! };
  }
}

function setup(options: { live: boolean; github?: FakeGitHub | null; maxWaitS?: number; noStateDir?: boolean }) {
  let clockMs = 0;
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
    clockMs += ms;
  };
  const base = mkdtempSync(path.join(tmpdir(), "dt-plugin-data-"));
  const manifests = ManifestStore.underBase(path.join(base, "tickets"));
  const github = options.github === undefined ? new FakeGitHub() : options.github;
  const service = new IssueService({
    live: options.live,
    github,
    thresholds: DEFAULT_THRESHOLDS,
    manifests: options.noStateDir ? null : manifests,
    pacer: new Pacer(1000, () => clockMs, sleep),
    sleep,
    nowS: () => clockMs / 1000,
    ...(options.maxWaitS === undefined ? {} : { maxWaitS: options.maxWaitS }),
  });
  return { service, github, manifests, sleeps, base };
}

function args(overrides: Partial<CreateArgs> = {}): CreateArgs {
  const base = { repo: "o/r", title: "Add the header icons", source_refs: ["header.1", "header.2"] };
  const merged = { ...base, ...overrides };
  return {
    body: "Body.\n",
    idempotency_key: idempotencyKey(merged.repo, merged.source_refs, merged.title),
    field_confidence: HIGH,
    labels: ["ui"],
    review_reasons: [],
    ...merged,
  };
}

const json = (r: ToolResult) => JSON.parse(r.content[0]!.text) as Record<string, any>;

describe("dry-run (default)", () => {
  it("never calls GitHub and records the would-be issue", async () => {
    const { service, github, manifests } = setup({ live: false });
    const result = await service.create(args({ field_confidence: { ...HIGH, acceptance_criteria: "low" } }));
    expect(result.isError).toBeUndefined();
    const body = json(result);
    expect(body).toMatchObject({ mode: "dry-run", created: false, needs_review: true });
    expect(body.would_create.labels).toEqual(["ui", "needs-review"]);
    expect(readMarker(body.would_create.body)).toBe(body.idempotency_key);
    expect(body.next_step).toMatch(/RAVN_TICKETS_LIVE=1/);
    expect(github!.calls).toEqual([]);
    expect(manifests.load("o/r").entries.map((e) => e.status)).toEqual(["dry_run"]);
  });

  it("lists from the manifest only", async () => {
    const { service, github } = setup({ live: false });
    await service.create(args());
    const listed = json(await service.listCreated("o/r"));
    expect(listed.mode).toBe("dry-run");
    expect(listed.manifest.not_attempted).toHaveLength(1);
    expect(github!.calls).toEqual([]);
  });
});

describe("live creation against a fake GitHub", () => {
  it("creates, reads back and records the issue", async () => {
    const { service, github, manifests } = setup({ live: true });
    const body = json(await service.create(args()));
    expect(body).toMatchObject({ mode: "live", created: true, issue: { number: 100 }, needs_review: false, labels: ["ui"] });
    expect(github!.calls).toEqual(["login", "list:bot", "labels", "create", "get:100"]);
    expect(manifests.load("o/r").entries[0]).toMatchObject({ status: "created", issue_number: 100 });
  });

  it("skips a ticket whose key already exists on GitHub instead of duplicating it", async () => {
    const first = setup({ live: true });
    await first.service.create(args());
    // A fresh process (resumed batch) with the same GitHub state.
    const second = setup({ live: true, github: first.github });
    const body = json(await second.service.create(args()));
    expect(body).toMatchObject({ created: false, existing: { number: 100 } });
    expect(first.github!.issues).toHaveLength(1);
    expect(second.manifests.load("o/r").entries[0]!.status).toBe("skipped_duplicate");
  });

  it("creates the needs-review label when missing and routes low confidence", async () => {
    const { service, github } = setup({ live: true });
    const body = json(await service.create(args({ field_confidence: { ...HIGH, source_refs: "medium" } })));
    expect(body).toMatchObject({ created: true, needs_review: true, labels: ["ui", "needs-review"] });
    expect(github!.calls).toContain("label:needs-review");
  });

  it("reports an error, not success, when the review label is silently dropped", async () => {
    const { service, github, manifests } = setup({ live: true });
    github!.dropLabels = true;
    const result = await service.create(args({ review_reasons: ["unknown-ref: x"] }));
    expect(result.isError).toBe(true);
    const { error } = json(result);
    expect(error).toMatchObject({ category: "permission", retryable: false, failure_mode: "DT-LABEL-DROPPED" });
    expect(error.what_failed).toMatch(/#100 was created WITHOUT its needs-review label/);
    expect(manifests.load("o/r").entries[0]).toMatchObject({ status: "created", label_missing: true });
  });

  it("leaves labels the repository lacks off the issue and says so", async () => {
    const { service } = setup({ live: true });
    const body = json(await service.create(args({ labels: ["ui", "made-up"] })));
    expect(body.labels).toEqual(["ui"]);
    expect(body.labels_not_in_repo).toEqual(["made-up"]);
  });

  it("spaces consecutive creates at least one second apart", async () => {
    const { service, sleeps } = setup({ live: true });
    await service.create(args());
    await service.create(args({ title: "Add the sidebar", source_refs: ["sidebar.1"] }));
    expect(sleeps).toEqual([1000]);
  });

  it("after a timed-out POST that actually landed, finds the issue instead of creating it twice", async () => {
    const { service, github } = setup({ live: true });
    github!.createFailures = [new GitHubNetworkError("socket hang up")];
    github!.landOnFailure = true;
    const body = json(await service.create(args()));
    expect(body).toMatchObject({ created: true, issue: { number: 100 } });
    expect(github!.issues).toHaveLength(1);
    expect(github!.calls.filter((c) => c === "create")).toHaveLength(1);
  });

  it("retries a transient failure locally within the wait budget", async () => {
    const { service, github, sleeps } = setup({ live: true });
    github!.createFailures = [new GitHubHttpError(502, {}, "Bad gateway")];
    const body = json(await service.create(args()));
    expect(body.created).toBe(true);
    expect(sleeps).toContain(5000);
  });

  it("hands a long rate-limit wait back to the agent as retryable, and records the failure", async () => {
    const { service, github, manifests } = setup({ live: true, maxWaitS: 60 });
    github!.createFailures = [new GitHubHttpError(403, { "retry-after": "600" }, "secondary rate limit")];
    const result = await service.create(args());
    expect(result.isError).toBe(true);
    expect(json(result).error).toMatchObject({ category: "transient", retryable: true, retry_after_s: 600, failure_mode: "DT-GH-SECONDARY-RATE-LIMIT" });
    expect(manifests.load("o/r").entries[0]).toMatchObject({ status: "failed", error: { failure_mode: "DT-GH-SECONDARY-RATE-LIMIT" } });
  });

  it("stops after the retry cap", async () => {
    const { service, github } = setup({ live: true });
    github!.createFailures = [1, 2, 3, 4].map(() => new GitHubHttpError(503, {}, "unavailable"));
    const result = await service.create(args());
    expect(json(result).error).toMatchObject({ category: "transient", failure_mode: "DT-GH-SERVER" });
    expect(github!.calls.filter((c) => c === "create")).toHaveLength(3);
  });

  it("does not retry a permission failure", async () => {
    const { service, github } = setup({ live: true });
    github!.createFailures = [new GitHubHttpError(403, {}, "Resource not accessible by integration")];
    const { error } = json(await service.create(args()));
    expect(error).toMatchObject({ category: "permission", retryable: false });
    expect(github!.calls.filter((c) => c === "create")).toHaveLength(1);
  });

  it("refuses when live without a token", async () => {
    const { service } = setup({ live: true, github: null });
    expect(json(await service.create(args())).error).toMatchObject({ category: "permission", failure_mode: "DT-GH-AUTH" });
  });
});

describe("state directory", () => {
  it("keeps each repo's manifest under <CLAUDE_PLUGIN_DATA>/tickets/<owner>__<repo>/", async () => {
    const { service, manifests, base } = setup({ live: false });
    await service.create(args());
    expect(manifests.pathFor("o/r")).toBe(path.join(base, "tickets", "o__r", "manifest.json"));
    expect(json(await service.listCreated("o/r")).manifest.path).toBe(path.join(base, "tickets", "o__r", "manifest.json"));
  });

  it("refuses every call with a structured error when CLAUDE_PLUGIN_DATA is missing", async () => {
    const { service, github } = setup({ live: true, noStateDir: true });
    for (const result of [await service.create(args()), await service.listCreated("o/r")]) {
      expect(result.isError).toBe(true);
      expect(json(result).error).toMatchObject({ category: "business", retryable: false, failure_mode: "DT-NO-STATE-DIR" });
    }
    expect(github!.calls).toEqual([]);
  });
});

describe("input checks", () => {
  it("rejects a key that no longer matches the ticket", async () => {
    const { service, github } = setup({ live: true });
    const { error } = json(await service.create({ ...args(), title: "Edited after planning" }));
    expect(error).toMatchObject({ category: "validation", failure_mode: "DT-KEY-MISMATCH" });
    expect(github!.calls).toEqual([]);
  });

  it("rejects a malformed repo", async () => {
    const { service } = setup({ live: false });
    expect(json(await service.create(args({ repo: "not a repo" }))).error.failure_mode).toBe("DT-INPUT");
  });
});

describe("listCreated", () => {
  it("returns marker issues from GitHub keyed by idempotency key", async () => {
    const { service, github } = setup({ live: true });
    await service.create(args());
    github!.issues.push({ number: 7, html_url: "u", title: "Someone else's", body: "no marker", state: "open", labels: [] });
    const listed = json(await service.listCreated("o/r"));
    expect(listed.on_github).toHaveLength(1);
    expect(listed.on_github[0]).toMatchObject({ number: 100, idempotency_key: args().idempotency_key, source_refs: ["header.1", "header.2"] });
    expect(listed.manifest.created).toBe(1);
  });

  it("reports an access failure as an error, never as an empty list", async () => {
    const { service, github } = setup({ live: true });
    github!.listFailure = new GitHubHttpError(404, {}, "Not Found");
    const result = await service.listCreated("o/r");
    expect(result.isError).toBe(true);
    expect(json(result).error.what_failed).toMatch(/access failure, not an empty result/);
  });
});
