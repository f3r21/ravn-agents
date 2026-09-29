/**
 * The deterministic stages around the agents:
 *   prepare  -> fetch the PR, write the run directory the coordinator reads
 *   finalize -> validate draft.json, apply the posting policy, write review.json, render dry-run text
 *   post     -> send review.json as one COMMENT review (only with --post)
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { annotate, exclusionReason, parseDiff } from "./diff.ts";
import { ReviewError } from "./errors.ts";
import { GitHub, execRunner, parsePrRef, type PrRef, type Runner } from "./github.ts";
import { demoteInline, fingerprintsIn, route } from "./policy.ts";
import { buildPayload, renderText } from "./render.ts";
import type { Draft, PrContext, ReviewPayload, Routing } from "./types.ts";
import { validateDraft } from "./validate.ts";

const OUR_MARKER = "<!-- ravn-pr-review:";

export interface PrepareOptions {
  pr: string;
  repo?: string;
  out?: string;
  cwd?: string;
  run?: Runner;
}

async function localCheckout(run: Runner, cwd: string, repo: string, headSha: string): Promise<PrContext["localCheckout"]> {
  const top = await run("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
  if (top.code !== 0) return null;
  const remote = await run("git", ["-C", cwd, "remote", "get-url", "origin"]);
  if (remote.code !== 0 || !remote.stdout.toLowerCase().includes(repo.toLowerCase())) return null;
  const head = await run("git", ["-C", cwd, "rev-parse", "HEAD"]);
  return { path: top.stdout.trim(), atHead: head.stdout.trim() === headSha };
}

export async function prepare(opts: PrepareOptions): Promise<{ runDir: string; context: PrContext }> {
  const run = opts.run ?? execRunner;
  const gh = new GitHub(run);
  const cwd = opts.cwd ?? process.cwd();
  let ref: PrRef;
  try {
    ref = parsePrRef(opts.pr, opts.repo);
  } catch (err) {
    const current = /^\d+$/.test(opts.pr) ? await gh.currentRepo() : null;
    if (!current) throw err;
    ref = parsePrRef(opts.pr, current);
  }

  const pr = await gh.prView(ref);
  const diff = await gh.diff(ref);
  const parsed = parseDiff(diff.text);

  const runDir = opts.out ?? join(tmpdir(), "ravn-pr-review", `${ref.repo.replace("/", "-")}-${ref.number}-${pr.headRefOid.slice(0, 12)}`);
  mkdirSync(join(runDir, "files"), { recursive: true });
  writeFileSync(join(runDir, "diff.patch"), diff.text);

  const files: PrContext["files"] = [];
  const excluded: PrContext["excluded"] = diff.missingPatch.map((p) => ({ path: p, reason: "GitHub returned no patch (file too large)" }));
  parsed.forEach((f, i) => {
    const reason = exclusionReason(f);
    if (reason) {
      excluded.push({ path: f.path, reason });
      return;
    }
    const patch = `files/${String(i).padStart(3, "0")}.diff`;
    writeFileSync(join(runDir, patch), annotate(f) + "\n");
    let additions = 0;
    let deletions = 0;
    for (const h of f.hunks) {
      for (const l of h.lines) {
        if (l.kind === "add") additions++;
        else if (l.kind === "del") deletions++;
      }
    }
    files.push({ path: f.path, status: f.status, additions, deletions, patch });
  });

  const feedback = await gh.existingFeedback(ref);
  const ours = feedback.filter((c) => c.body.includes(OUR_MARKER));

  const context: PrContext = {
    repo: ref.repo,
    number: ref.number,
    title: pr.title,
    body: pr.body ?? "",
    author: pr.author?.login ?? "",
    url: pr.url,
    baseSha: pr.baseRefOid,
    headSha: pr.headRefOid,
    headRef: pr.headRefName,
    state: pr.state,
    files,
    excluded,
    claudeMd: await gh.fileAt(ref.repo, "CLAUDE.md", pr.headRefOid),
    priorFingerprints: fingerprintsIn(ours.map((c) => c.body)),
    priorComments: ours.map((c) => ({ ...c, body: c.body.replace(/<!-- ravn-pr-review:[^>]*-->/g, "").trim().slice(0, 600) })),
    diffSource: diff.source,
    localCheckout: await localCheckout(run, cwd, ref.repo, pr.headRefOid),
  };
  writeFileSync(join(runDir, "context.json"), JSON.stringify(context, null, 2));
  return { runDir, context };
}

export function readContext(runDir: string): PrContext {
  return JSON.parse(readFileSync(join(runDir, "context.json"), "utf8")) as PrContext;
}

export interface FinalizeResult {
  ok: boolean;
  errors: string[];
  text: string;
  routing: Routing | null;
  payload: ReviewPayload | null;
}

export function finalize(runDir: string): FinalizeResult {
  const draftPath = join(runDir, "draft.json");
  if (!existsSync(draftPath)) throw new ReviewError("invalid_draft", `No draft.json in ${runDir}: the coordinator did not write its output.`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(draftPath, "utf8"));
  } catch (err) {
    return { ok: false, errors: [`draft.json is not valid JSON: ${(err as Error).message}`], text: "", routing: null, payload: null };
  }
  const v = validateDraft(raw);
  if (!v.ok || !v.draft) return { ok: false, errors: v.errors, text: "", routing: null, payload: null };
  const draft: Draft = v.draft;
  const ctx = readContext(runDir);
  const reviewed = new Set(ctx.files.map((f) => f.path));
  const files = parseDiff(readFileSync(join(runDir, "diff.patch"), "utf8")).filter((f) => reviewed.has(f.path));

  const routing = route(draft, files, ctx.priorFingerprints);
  const payload = buildPayload(draft, ctx, routing);
  writeFileSync(join(runDir, "routing.json"), JSON.stringify(routing, null, 2));
  writeFileSync(join(runDir, "review.json"), JSON.stringify(payload, null, 2));
  return { ok: true, errors: [], text: renderText(ctx, payload, routing), routing, payload };
}

export async function post(runDir: string, run: Runner = execRunner): Promise<{ url: string; demoted: boolean }> {
  const ctx = readContext(runDir);
  const gh = new GitHub(run);
  const ref = { repo: ctx.repo, number: ctx.number };
  const current = await gh.prView(ref);
  if (current.headRefOid !== ctx.headSha) {
    throw new ReviewError(
      "head_moved",
      `The PR head moved from ${ctx.headSha.slice(0, 12)} to ${current.headRefOid.slice(0, 12)} after the review ran. Re-run the review; nothing was posted.`,
    );
  }
  const payload = JSON.parse(readFileSync(join(runDir, "review.json"), "utf8")) as ReviewPayload;
  try {
    const res = await gh.postReview(ref, payload);
    return { url: res.html_url, demoted: false };
  } catch (err) {
    if (!(err instanceof ReviewError) || err.kind !== "line_not_in_diff" || payload.comments.length === 0) throw err;
  }
  // One anchor was refused. GitHub does not say which, so every inline finding moves to the summary.
  const draft = validateDraft(JSON.parse(readFileSync(join(runDir, "draft.json"), "utf8"))).draft!;
  const routing = JSON.parse(readFileSync(join(runDir, "routing.json"), "utf8")) as Routing;
  const fallback = buildPayload(draft, ctx, demoteInline(routing, "GitHub rejected the line anchor"));
  writeFileSync(join(runDir, "review.json"), JSON.stringify(fallback, null, 2));
  const res = await gh.postReview(ref, fallback);
  return { url: res.html_url, demoted: true };
}
