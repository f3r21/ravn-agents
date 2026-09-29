#!/usr/bin/env node

// src/errors.ts
var ReviewError = class extends Error {
  kind;
  retryable;
  /** Seconds to wait before a retry, from `retry-after` or `x-ratelimit-reset`. */
  retryAfter;
  detail;
  constructor(kind, message, opts = {}) {
    super(message);
    this.name = "ReviewError";
    this.kind = kind;
    this.retryable = opts.retryable ?? false;
    this.retryAfter = opts.retryAfter ?? null;
    this.detail = opts.detail;
  }
  toJSON() {
    return { error: this.kind, retryable: this.retryable, retryAfter: this.retryAfter, message: this.message, detail: this.detail };
  }
};
var EXIT = {
  ok: 0,
  terminal: 2,
  invalidDraft: 3,
  retryable: 4
};
function exitCodeFor(err) {
  if (err.kind === "invalid_draft") return EXIT.invalidDraft;
  return err.retryable ? EXIT.retryable : EXIT.terminal;
}
function classifyGhFailure(stderr, stdout = "") {
  const text = `${stderr}
${stdout}`;
  const status = Number(/HTTP (\d{3})/.exec(text)?.[1] ?? /^HTTP\/[\d.]+ (\d{3})/m.exec(text)?.[1] ?? NaN);
  const retryAfterHeader = /retry-after:\s*(\d+)/i.exec(text)?.[1];
  const resetHeader = /x-ratelimit-reset:\s*(\d+)/i.exec(text)?.[1];
  const remaining = /x-ratelimit-remaining:\s*(\d+)/i.exec(text)?.[1];
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : resetHeader ? Math.max(0, Number(resetHeader) - Math.floor(Date.now() / 1e3)) : null;
  const msg = stderr.trim().split("\n").slice(-3).join(" ").slice(0, 500) || `gh failed (HTTP ${status})`;
  if (/gh: command not found|ENOENT/.test(text)) return new ReviewError("gh_missing", "The GitHub CLI (gh) is not installed or not on PATH.");
  if (/auth login|not logged in|authentication required/i.test(text) || status === 401) {
    return new ReviewError("gh_auth", "gh is not authenticated for this host. Run `gh auth login`.");
  }
  if (status === 406 || /too_large|diff is taking too long|maximum number of (lines|files)/i.test(text)) {
    return new ReviewError("diff_too_large", "GitHub refused to render the diff (too large).", { detail: msg });
  }
  if (status === 429 || status === 403 && (/rate limit|secondary rate/i.test(text) || remaining === "0" || retryAfterHeader)) {
    return new ReviewError("rate_limited", `GitHub rate limit: ${msg}`, { retryable: true, retryAfter: retryAfter ?? 60 });
  }
  if (status === 404 || /Could not resolve to a (PullRequest|Repository)/i.test(text)) {
    return new ReviewError("not_found", `Not found: ${msg}`);
  }
  if (status === 422) {
    if (/line must be part of the diff|pull_request_review_thread\.(line|start_line)|could not be resolved|is outside the diff/i.test(text)) {
      return new ReviewError("line_not_in_diff", `GitHub rejected an inline comment position: ${msg}`, { detail: msg });
    }
    return new ReviewError("validation_failed", `GitHub validation failed: ${msg}`, { detail: msg });
  }
  if (status >= 500 && status < 600) return new ReviewError("server_error", `GitHub server error ${status}`, { retryable: true, retryAfter: 5 });
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|connection reset|timeout/i.test(text)) {
    return new ReviewError("network", `Network failure talking to GitHub: ${msg}`, { retryable: true, retryAfter: 5 });
  }
  return new ReviewError("unknown", `gh failed: ${msg}`, { detail: msg });
}

// src/pipeline.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/diff.ts
var HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
function stripPrefix(p) {
  if (p === "/dev/null") return null;
  return p.replace(/^[ab]\//, "");
}
function parseDiff(text) {
  const files = [];
  let file = null;
  let hunk = null;
  let oldNo = 0;
  let newNo = 0;
  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
      file = {
        path: m?.[2] ?? "",
        oldPath: m?.[1] ?? null,
        status: "modified",
        binary: false,
        hunks: []
      };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;
    if (!hunk) {
      if (raw.startsWith("new file mode")) file.status = "added";
      else if (raw.startsWith("deleted file mode")) file.status = "deleted";
      else if (raw.startsWith("rename from ")) file.status = "renamed";
      else if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) file.binary = true;
      else if (raw.startsWith("--- ")) {
        file.oldPath = stripPrefix(raw.slice(4).trim());
        continue;
      } else if (raw.startsWith("+++ ")) {
        const p = stripPrefix(raw.slice(4).trim());
        if (p) file.path = p;
        else if (file.oldPath) file.path = file.oldPath;
        continue;
      }
    }
    const h = HUNK_RE.exec(raw);
    if (h) {
      oldNo = Number(h[1]);
      newNo = Number(h[3]);
      hunk = { header: raw, oldStart: oldNo, newStart: newNo, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const tag = raw[0];
    const body = raw.slice(1);
    if (tag === "+") {
      hunk.lines.push({ kind: "add", oldLine: null, newLine: newNo++, text: body });
    } else if (tag === "-") {
      hunk.lines.push({ kind: "del", oldLine: oldNo++, newLine: null, text: body });
    } else if (tag === " ") {
      hunk.lines.push({ kind: "ctx", oldLine: oldNo++, newLine: newNo++, text: body });
    }
  }
  return files;
}
function commentableLines(file) {
  const right = /* @__PURE__ */ new Set();
  const left = /* @__PURE__ */ new Set();
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.newLine !== null) right.add(l.newLine);
      if (l.kind === "del" && l.oldLine !== null) left.add(l.oldLine);
      if (l.kind === "ctx" && l.oldLine !== null) left.add(l.oldLine);
    }
  }
  return { RIGHT: right, LEFT: left };
}
var GENERATED = [
  { re: /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/, reason: "lockfile" },
  { re: /(^|\/)dist\//, reason: "build output in dist/" },
  { re: /(^|\/)(build|coverage|storybook-static)\//, reason: "build output" },
  { re: /\.min\.(js|css)$/, reason: "minified" },
  { re: /\.map$/, reason: "source map" },
  { re: /(^|\/)__snapshots__\//, reason: "test snapshot" },
  { re: /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf)$/i, reason: "binary asset" }
];
function exclusionReason(file) {
  if (file.binary) return "binary file";
  if (file.status === "deleted") return "file deleted";
  for (const g of GENERATED) if (g.re.test(file.path)) return g.reason;
  return null;
}
function annotate(file) {
  const out = [`### ${file.path} (${file.status}${file.oldPath && file.oldPath !== file.path ? ` from ${file.oldPath}` : ""})`];
  for (const h of file.hunks) {
    out.push(h.header);
    for (const l of h.lines) {
      const o = l.oldLine === null ? "" : String(l.oldLine);
      const n = l.newLine === null ? "" : String(l.newLine);
      const mark = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
      out.push(`${o.padStart(6)} ${n.padStart(6)} ${mark}${l.text}`);
    }
  }
  return out.join("\n");
}

// src/github.ts
import { execFile } from "node:child_process";
var execRunner = (cmd, args, input) => new Promise((resolve) => {
  const child = execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" }, (err, stdout, stderr) => {
    const code = err ? typeof err.code === "number" ? Number(err.code) : 1 : 0;
    const enoent = err?.code === "ENOENT";
    resolve({ code, stdout: stdout ?? "", stderr: enoent ? "gh: command not found (ENOENT)" : stderr ?? "" });
  });
  if (input !== void 0) child.stdin?.end(input);
});
function parsePrRef(arg, repo) {
  const url = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(arg);
  if (url) return { repo: url[1], number: Number(url[2]) };
  const short = /^([\w.-]+\/[\w.-]+)#(\d+)$/.exec(arg);
  if (short) return { repo: short[1], number: Number(short[2]) };
  if (/^\d+$/.test(arg)) {
    if (!repo) throw new ReviewError("invalid_input", "A bare PR number needs --repo owner/name, or run inside a clone of the repo.");
    return { repo, number: Number(arg) };
  }
  throw new ReviewError("invalid_input", `Not a PR reference: ${arg}. Use a URL, owner/repo#N, or a number.`);
}
var GitHub = class {
  run;
  constructor(run = execRunner) {
    this.run = run;
  }
  async gh(args, input) {
    const res = await this.run("gh", args, input);
    if (res.code !== 0) throw classifyGhFailure(res.stderr, res.stdout);
    return res.stdout;
  }
  async currentRepo() {
    const res = await this.run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
    return res.code === 0 ? res.stdout.trim() || null : null;
  }
  async prView(ref) {
    const fields = "number,title,body,author,url,baseRefOid,headRefOid,headRefName,state,files";
    return JSON.parse(await this.gh(["pr", "view", String(ref.number), "-R", ref.repo, "--json", fields]));
  }
  /** The PR diff. On a too-large diff, rebuilds one from the files API (patches may be partial). */
  async diff(ref) {
    try {
      return { text: await this.gh(["pr", "diff", String(ref.number), "-R", ref.repo]), source: "diff", missingPatch: [] };
    } catch (err) {
      if (!(err instanceof ReviewError) || err.kind !== "diff_too_large") throw err;
    }
    const raw = await this.gh(["api", "--paginate", "--slurp", `repos/${ref.repo}/pulls/${ref.number}/files?per_page=100`]);
    const pages = JSON.parse(raw);
    const missingPatch = [];
    const parts = [];
    for (const f of pages.flat()) {
      if (!f.patch) {
        missingPatch.push(f.filename);
        continue;
      }
      const oldPath = f.status === "added" ? "/dev/null" : `a/${f.previous_filename ?? f.filename}`;
      const newPath = f.status === "removed" ? "/dev/null" : `b/${f.filename}`;
      const mode = f.status === "added" ? "new file mode 100644\n" : f.status === "removed" ? "deleted file mode 100644\n" : "";
      parts.push(`diff --git a/${f.previous_filename ?? f.filename} b/${f.filename}
${mode}--- ${oldPath}
+++ ${newPath}
${f.patch}
`);
    }
    return { text: parts.join(""), source: "files-api", missingPatch };
  }
  /** A file's content at a ref, or null when it does not exist. */
  async fileAt(repo, path, ref) {
    try {
      return await this.gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/${path}?ref=${ref}`]);
    } catch (err) {
      if (err instanceof ReviewError && err.kind === "not_found") return null;
      throw err;
    }
  }
  /** Inline comments and review bodies already on the PR. */
  async existingFeedback(ref) {
    const comments = JSON.parse(
      await this.gh(["api", "--paginate", "--slurp", `repos/${ref.repo}/pulls/${ref.number}/comments?per_page=100`])
    );
    const reviews = JSON.parse(
      await this.gh(["api", "--paginate", "--slurp", `repos/${ref.repo}/pulls/${ref.number}/reviews?per_page=100`])
    );
    return [
      ...comments.flat().map((c) => ({ path: c.path, line: c.line ?? null, body: c.body })),
      ...reviews.flat().filter((r) => r.body).map((r) => ({ path: "", line: null, body: r.body }))
    ];
  }
  /** Posts one review. Transient failures are retried serially with the server's wait, at most `attempts` times. */
  async postReview(ref, payload, opts = {}) {
    const attempts = opts.attempts ?? 3;
    const sleep = opts.sleep ?? ((s) => new Promise((r) => setTimeout(r, s * 1e3)));
    let last = null;
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
};

// src/policy.ts
import { createHash } from "node:crypto";
var INLINE_SEVERITIES = /* @__PURE__ */ new Set(["critical", "high"]);
var SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
function fingerprint(f) {
  const norm = f.title.toLowerCase().replace(/[`'"]/g, "").replace(/\s+/g, " ").trim();
  return createHash("sha1").update(`${f.category}|${f.path}|${norm}`).digest("hex").slice(0, 12);
}
var MARKER_RE = /<!-- ravn-pr-review:fp=([0-9a-f,]+) -->/g;
function marker(fps) {
  return `<!-- ravn-pr-review:fp=${fps.join(",")} -->`;
}
function fingerprintsIn(bodies) {
  const out = /* @__PURE__ */ new Set();
  for (const b of bodies) for (const m of b.matchAll(MARKER_RE)) for (const fp of m[1].split(",")) out.add(fp);
  return [...out];
}
function anchorProblem(f, files) {
  const file = files.get(f.path);
  if (!file) return "file is not part of the reviewed diff";
  const lines = commentableLines(file)[f.side];
  if (!lines.has(f.line)) return `line ${f.line} (${f.side}) is not shown in the diff`;
  if (f.startLine !== void 0) {
    if (!lines.has(f.startLine)) return `start line ${f.startLine} (${f.side}) is not shown in the diff`;
    const hunk = file.hunks.find((h) => h.lines.some((l) => (f.side === "RIGHT" ? l.newLine : l.oldLine) === f.line));
    const inSame = hunk?.lines.some((l) => (f.side === "RIGHT" ? l.newLine : l.oldLine) === f.startLine);
    if (!inSame) return "multi-line range spans more than one hunk";
  }
  return null;
}
function route(draft, files, priorFingerprints = []) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const prior = new Set(priorFingerprints);
  const routing = { inline: [], summary: [], dropped: [] };
  const sorted = [...draft.findings].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const seen = /* @__PURE__ */ new Set();
  for (const f of sorted) {
    const rf = { ...f, fingerprint: fingerprint(f) };
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
      routing.summary.push({ ...rf, body: `${rf.body}

_(Not posted inline: ${problem}.)_` });
      continue;
    }
    routing.summary.push(rf);
  }
  return routing;
}
function demoteInline(routing, reason) {
  return {
    inline: [],
    summary: [...routing.inline.map((f) => ({ ...f, body: `${f.body}

_(Not posted inline: ${reason}.)_` })), ...routing.summary],
    dropped: routing.dropped
  };
}

// src/render.ts
var LOW_CAP = 5;
function suggestionBlock(f) {
  return f.suggestion !== void 0 ? `

\`\`\`suggestion
${f.suggestion}
\`\`\`` : "";
}
function inlineBody(f) {
  return `**${f.severity}** \xB7 ${f.category} \xB7 ${f.title}

${f.body}${suggestionBlock(f)}

${marker([f.fingerprint])}`;
}
function location(f) {
  const range = f.startLine !== void 0 ? `${f.startLine}-${f.line}` : String(f.line);
  return `\`${f.path}:${range}\`${f.side === "LEFT" ? " (base)" : ""}`;
}
function coverageGaps(draft, ctx) {
  const gaps = [];
  for (const e of ctx.excluded) gaps.push(`\`${e.path}\`: skipped (${e.reason})`);
  const excluded = new Set(ctx.excluded.map((e) => e.path));
  for (const n of draft.notReviewed) if (!excluded.has(n.path)) gaps.push(`\`${n.path}\`: not reviewed (${n.reason})`);
  for (const f of draft.finders) if (f.status !== "ok") gaps.push(`${f.category} finder ${f.status}: ${f.error ?? "no detail"}`);
  if (draft.verifier.status !== "ok") gaps.push(`verifier ${draft.verifier.status}: ${draft.verifier.error ?? "no detail"}`);
  return gaps;
}
function summaryBody(draft, ctx, routing) {
  const lines = ["## Review summary", ""];
  if (draft.summary.trim()) lines.push(draft.summary.trim(), "");
  lines.push(
    `${routing.inline.length} inline, ${routing.summary.length} in this summary, ${routing.dropped.length} not posted (unverified, rejected or already posted).`,
    ""
  );
  const listed = routing.summary.filter((f) => f.severity !== "low");
  const low = routing.summary.filter((f) => f.severity === "low");
  if (listed.length || low.length) {
    lines.push("### Findings", "");
    for (const f of [...listed, ...low.slice(0, LOW_CAP)]) {
      lines.push(`- **${f.severity}** \xB7 ${f.category} \xB7 ${location(f)}: ${f.title}`);
      for (const l of f.body.split("\n")) lines.push(`  ${l}`);
    }
    if (low.length > LOW_CAP) lines.push(`- ${low.length - LOW_CAP} more low-severity findings not listed.`);
    lines.push("");
  }
  const gaps = coverageGaps(draft, ctx);
  if (gaps.length) {
    lines.push("### Coverage gaps", "");
    for (const g of gaps) lines.push(`- ${g}`);
    lines.push("");
  }
  lines.push(
    `Finders run: ${draft.selection.ran.join(", ") || "none (reviewed directly)"}. ${draft.selection.rationale}`
  );
  const fps = [...routing.inline, ...routing.summary].map((f) => f.fingerprint);
  if (fps.length) lines.push("", marker(fps));
  return lines.join("\n");
}
function buildPayload(draft, ctx, routing) {
  return {
    commit_id: ctx.headSha,
    event: "COMMENT",
    body: summaryBody(draft, ctx, routing),
    comments: routing.inline.map((f) => ({
      path: f.path,
      body: inlineBody(f),
      line: f.line,
      side: f.side,
      ...f.startLine !== void 0 ? { start_line: f.startLine, start_side: f.side } : {}
    }))
  };
}
function renderText(ctx, payload, routing) {
  const out = [
    `PR ${ctx.repo}#${ctx.number} at ${ctx.headSha.slice(0, 12)}: ${ctx.title}`,
    "",
    "=== Review body (one COMMENT review) ===",
    payload.body,
    "",
    `=== Inline comments (${payload.comments.length}) ===`
  ];
  for (const c of payload.comments) {
    const range = c.start_line !== void 0 ? `${c.start_line}-${c.line}` : String(c.line);
    out.push(`--- ${c.path}:${range} (${c.side})`, c.body.replace(/\n\n<!-- ravn-pr-review:[^>]*-->$/, ""), "");
  }
  if (routing.dropped.length) {
    out.push(`=== Not posted (${routing.dropped.length}) ===`);
    for (const d of routing.dropped) out.push(`- [${d.finding.severity}] ${d.finding.path}:${d.finding.line} ${d.finding.title} (${d.reason})`);
  }
  return out.join("\n");
}

// src/types.ts
var SEVERITIES = ["critical", "high", "medium", "low"];
var CONFIDENCES = ["high", "medium", "low"];
var CATEGORIES = ["correctness", "security", "tests", "conventions"];
var VERDICTS = ["confirmed", "rejected", "uncertain"];

// src/validate.ts
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var isStr = (v) => typeof v === "string";
var isPosInt = (v) => Number.isInteger(v) && v > 0;
function oneOf(v, allowed) {
  return isStr(v) && allowed.includes(v);
}
function checkFinding(f, i, errors) {
  const at = `findings[${i}]`;
  if (!isObj(f)) {
    errors.push(`${at} is not an object`);
    return;
  }
  if (!isStr(f.id) || !f.id) errors.push(`${at}.id must be a non-empty string`);
  if (!oneOf(f.category, CATEGORIES)) errors.push(`${at}.category must be one of ${CATEGORIES.join(", ")}`);
  if (!isStr(f.path) || !f.path) errors.push(`${at}.path must be a repo-relative path`);
  if (!isPosInt(f.line)) errors.push(`${at}.line must be a positive integer`);
  if (f.startLine !== void 0 && (!isPosInt(f.startLine) || isPosInt(f.line) && f.startLine >= f.line)) {
    errors.push(`${at}.startLine must be a positive integer below line`);
  }
  if (f.side !== "LEFT" && f.side !== "RIGHT") errors.push(`${at}.side must be LEFT or RIGHT`);
  if (!oneOf(f.severity, SEVERITIES)) errors.push(`${at}.severity must be one of ${SEVERITIES.join(", ")}`);
  if (!oneOf(f.confidence, CONFIDENCES)) errors.push(`${at}.confidence must be one of ${CONFIDENCES.join(", ")}`);
  if (!isStr(f.title) || !f.title.trim()) errors.push(`${at}.title must be a non-empty string`);
  if (!isStr(f.body) || !f.body.trim()) errors.push(`${at}.body must be a non-empty string`);
  if (f.suggestion !== void 0 && !isStr(f.suggestion)) errors.push(`${at}.suggestion must be a string when present`);
  const v = f.verification;
  if (!isObj(v)) {
    errors.push(`${at}.verification is required (verdict, evidence, reason)`);
  } else {
    if (!oneOf(v.verdict, VERDICTS)) errors.push(`${at}.verification.verdict must be one of ${VERDICTS.join(", ")}`);
    if (!Array.isArray(v.evidence) || !v.evidence.every(isStr)) errors.push(`${at}.verification.evidence must be an array of "path:line" strings`);
    else if (v.verdict === "confirmed" && v.evidence.length === 0) errors.push(`${at}.verification.evidence must cite at least one path:line when confirmed`);
    if (!isStr(v.reason)) errors.push(`${at}.verification.reason must be a string`);
  }
}
function validateDraft(input) {
  const errors = [];
  if (!isObj(input)) return { ok: false, errors: ["draft is not a JSON object"], draft: null };
  const d = input;
  if (d.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!oneOf(d.mode, ["routed", "all-finders", "self"])) errors.push("mode must be routed, all-finders or self");
  if (!isObj(d.selection)) errors.push("selection is required");
  else {
    const s = d.selection;
    if (!Array.isArray(s.ran) || !s.ran.every((c) => oneOf(c, CATEGORIES))) errors.push("selection.ran must list finder categories");
    if (!Array.isArray(s.skipped)) errors.push("selection.skipped must be an array");
    else
      s.skipped.forEach((k, i) => {
        if (!isObj(k) || !oneOf(k.category, CATEGORIES) || !isStr(k.reason)) errors.push(`selection.skipped[${i}] needs category and reason`);
      });
    if (!isStr(s.rationale) || !s.rationale.trim()) errors.push("selection.rationale must explain the choice");
  }
  if (!Array.isArray(d.finders)) errors.push("finders must be an array");
  else
    d.finders.forEach((f, i) => {
      if (!isObj(f) || !oneOf(f.category, CATEGORIES) || !oneOf(f.status, ["ok", "failed", "partial"]) || !Array.isArray(f.files)) {
        errors.push(`finders[${i}] needs category, status (ok|failed|partial) and files`);
      } else if (f.status !== "ok" && !isStr(f.error)) errors.push(`finders[${i}].error must say what failed`);
    });
  if (!isObj(d.verifier) || !oneOf(d.verifier.status, ["ok", "failed", "partial"]) || !isStr(d.verifier.model)) {
    errors.push("verifier needs status (ok|failed|partial) and model");
  }
  if (!Array.isArray(d.findings)) errors.push("findings must be an array");
  else {
    d.findings.forEach((f, i) => checkFinding(f, i, errors));
    const ids = d.findings.filter(isObj).map((f) => f.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup !== void 0) errors.push(`duplicate finding id: ${String(dup)}`);
  }
  if (!Array.isArray(d.notReviewed) || !d.notReviewed.every((n) => isObj(n) && isStr(n.path) && isStr(n.reason))) {
    errors.push("notReviewed must be an array of {path, reason}");
  }
  if (!isStr(d.summary)) errors.push("summary must be a string");
  return errors.length ? { ok: false, errors, draft: null } : { ok: true, errors: [], draft: input };
}

// src/pipeline.ts
var OUR_MARKER = "<!-- ravn-pr-review:";
async function localCheckout(run, cwd, repo, headSha) {
  const top = await run("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
  if (top.code !== 0) return null;
  const remote = await run("git", ["-C", cwd, "remote", "get-url", "origin"]);
  if (remote.code !== 0 || !remote.stdout.toLowerCase().includes(repo.toLowerCase())) return null;
  const head = await run("git", ["-C", cwd, "rev-parse", "HEAD"]);
  return { path: top.stdout.trim(), atHead: head.stdout.trim() === headSha };
}
async function prepare(opts) {
  const run = opts.run ?? execRunner;
  const gh = new GitHub(run);
  const cwd = opts.cwd ?? process.cwd();
  let ref;
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
  const files = [];
  const excluded = diff.missingPatch.map((p) => ({ path: p, reason: "GitHub returned no patch (file too large)" }));
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
  const context = {
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
    localCheckout: await localCheckout(run, cwd, ref.repo, pr.headRefOid)
  };
  writeFileSync(join(runDir, "context.json"), JSON.stringify(context, null, 2));
  return { runDir, context };
}
function readContext(runDir) {
  return JSON.parse(readFileSync(join(runDir, "context.json"), "utf8"));
}
function finalize(runDir) {
  const draftPath = join(runDir, "draft.json");
  if (!existsSync(draftPath)) throw new ReviewError("invalid_draft", `No draft.json in ${runDir}: the coordinator did not write its output.`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(draftPath, "utf8"));
  } catch (err) {
    return { ok: false, errors: [`draft.json is not valid JSON: ${err.message}`], text: "", routing: null, payload: null };
  }
  const v = validateDraft(raw);
  if (!v.ok || !v.draft) return { ok: false, errors: v.errors, text: "", routing: null, payload: null };
  const draft = v.draft;
  const ctx = readContext(runDir);
  const reviewed = new Set(ctx.files.map((f) => f.path));
  const files = parseDiff(readFileSync(join(runDir, "diff.patch"), "utf8")).filter((f) => reviewed.has(f.path));
  const routing = route(draft, files, ctx.priorFingerprints);
  const payload = buildPayload(draft, ctx, routing);
  writeFileSync(join(runDir, "routing.json"), JSON.stringify(routing, null, 2));
  writeFileSync(join(runDir, "review.json"), JSON.stringify(payload, null, 2));
  return { ok: true, errors: [], text: renderText(ctx, payload, routing), routing, payload };
}
async function post(runDir, run = execRunner) {
  const ctx = readContext(runDir);
  const gh = new GitHub(run);
  const ref = { repo: ctx.repo, number: ctx.number };
  const current = await gh.prView(ref);
  if (current.headRefOid !== ctx.headSha) {
    throw new ReviewError(
      "head_moved",
      `The PR head moved from ${ctx.headSha.slice(0, 12)} to ${current.headRefOid.slice(0, 12)} after the review ran. Re-run the review; nothing was posted.`
    );
  }
  const payload = JSON.parse(readFileSync(join(runDir, "review.json"), "utf8"));
  try {
    const res2 = await gh.postReview(ref, payload);
    return { url: res2.html_url, demoted: false };
  } catch (err) {
    if (!(err instanceof ReviewError) || err.kind !== "line_not_in_diff" || payload.comments.length === 0) throw err;
  }
  const draft = validateDraft(JSON.parse(readFileSync(join(runDir, "draft.json"), "utf8"))).draft;
  const routing = JSON.parse(readFileSync(join(runDir, "routing.json"), "utf8"));
  const fallback = buildPayload(draft, ctx, demoteInline(routing, "GitHub rejected the line anchor"));
  writeFileSync(join(runDir, "review.json"), JSON.stringify(fallback, null, 2));
  const res = await gh.postReview(ref, fallback);
  return { url: res.html_url, demoted: true };
}

// src/cli.ts
function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : void 0;
}
function positional(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) i++;
    else out.push(args[i]);
  }
  return out;
}
var USAGE = "usage: ravn-pr-review prepare <pr> [--repo owner/name] [--out dir] | finalize <runDir> | post <runDir>";
async function main(argv) {
  const [cmd, ...rest] = argv;
  const [target] = positional(rest);
  if (!cmd || !target) {
    process.stderr.write(`${USAGE}
`);
    return EXIT.terminal;
  }
  switch (cmd) {
    case "prepare": {
      const { runDir, context } = await prepare({ pr: target, repo: flag(rest, "--repo"), out: flag(rest, "--out") });
      const lines = context.files.reduce((n, f) => n + f.additions + f.deletions, 0);
      process.stdout.write(
        JSON.stringify(
          {
            runDir,
            pr: `${context.repo}#${context.number}`,
            headSha: context.headSha,
            reviewedFiles: context.files.length,
            changedLines: lines,
            excluded: context.excluded.length,
            priorFindings: context.priorFingerprints.length,
            hasClaudeMd: context.claudeMd !== null,
            localCheckout: context.localCheckout
          },
          null,
          2
        ) + "\n"
      );
      return EXIT.ok;
    }
    case "finalize": {
      const res = finalize(target);
      if (!res.ok) {
        process.stderr.write(JSON.stringify({ error: "invalid_draft", retryable: true, errors: res.errors }) + "\n");
        return EXIT.invalidDraft;
      }
      process.stdout.write(res.text + "\n");
      return EXIT.ok;
    }
    case "post": {
      const res = await post(target);
      process.stdout.write(
        `Posted one review: ${res.url}${res.demoted ? "\nGitHub refused an inline anchor, so every finding went into the summary." : ""}
`
      );
      return EXIT.ok;
    }
    default:
      process.stderr.write(`${USAGE}
`);
      return EXIT.terminal;
  }
}
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    if (err instanceof ReviewError) {
      process.stderr.write(JSON.stringify(err.toJSON()) + "\n");
      process.exit(exitCodeFor(err));
    }
    process.stderr.write(JSON.stringify({ error: "unknown", retryable: false, message: String(err?.stack ?? err) }) + "\n");
    process.exit(EXIT.terminal);
  }
);
