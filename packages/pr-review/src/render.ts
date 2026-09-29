/** Turns a routing decision into the one GitHub review payload, and into the dry-run text. */

import { marker } from "./policy.ts";
import type { Draft, PrContext, ReviewPayload, RoutedFinding, Routing } from "./types.ts";

/** At most this many low-severity findings are listed; the rest are counted (Code Review's nit cap). */
export const LOW_CAP = 5;

function suggestionBlock(f: RoutedFinding): string {
  return f.suggestion !== undefined ? `\n\n\`\`\`suggestion\n${f.suggestion}\n\`\`\`` : "";
}

export function inlineBody(f: RoutedFinding): string {
  return `**${f.severity}** · ${f.category} · ${f.title}\n\n${f.body}${suggestionBlock(f)}\n\n${marker([f.fingerprint])}`;
}

function location(f: RoutedFinding): string {
  const range = f.startLine !== undefined ? `${f.startLine}-${f.line}` : String(f.line);
  return `\`${f.path}:${range}\`${f.side === "LEFT" ? " (base)" : ""}`;
}

/** Coverage gaps: files nobody reviewed and finders that did not finish. Never silent (D5 5.3). */
export function coverageGaps(draft: Draft, ctx: PrContext): string[] {
  const gaps: string[] = [];
  for (const e of ctx.excluded) gaps.push(`\`${e.path}\`: skipped (${e.reason})`);
  const excluded = new Set(ctx.excluded.map((e) => e.path));
  for (const n of draft.notReviewed) if (!excluded.has(n.path)) gaps.push(`\`${n.path}\`: not reviewed (${n.reason})`);
  for (const f of draft.finders) if (f.status !== "ok") gaps.push(`${f.category} finder ${f.status}: ${f.error ?? "no detail"}`);
  if (draft.verifier.status !== "ok") gaps.push(`verifier ${draft.verifier.status}: ${draft.verifier.error ?? "no detail"}`);
  return gaps;
}

export function summaryBody(draft: Draft, ctx: PrContext, routing: Routing): string {
  const lines: string[] = ["## Review summary", ""];
  if (draft.summary.trim()) lines.push(draft.summary.trim(), "");
  lines.push(
    `${routing.inline.length} inline, ${routing.summary.length} in this summary, ${routing.dropped.length} not posted (unverified, rejected or already posted).`,
    "",
  );

  const listed = routing.summary.filter((f) => f.severity !== "low");
  const low = routing.summary.filter((f) => f.severity === "low");
  if (listed.length || low.length) {
    lines.push("### Findings", "");
    for (const f of [...listed, ...low.slice(0, LOW_CAP)]) {
      lines.push(`- **${f.severity}** · ${f.category} · ${location(f)}: ${f.title}`);
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
    `Finders run: ${draft.selection.ran.join(", ") || "none (reviewed directly)"}. ${draft.selection.rationale}`,
  );
  const fps = [...routing.inline, ...routing.summary].map((f) => f.fingerprint);
  if (fps.length) lines.push("", marker(fps));
  return lines.join("\n");
}

export function buildPayload(draft: Draft, ctx: PrContext, routing: Routing): ReviewPayload {
  return {
    commit_id: ctx.headSha,
    event: "COMMENT",
    body: summaryBody(draft, ctx, routing),
    comments: routing.inline.map((f) => ({
      path: f.path,
      body: inlineBody(f),
      line: f.line,
      side: f.side,
      ...(f.startLine !== undefined ? { start_line: f.startLine, start_side: f.side } : {}),
    })),
  };
}

/** What dry-run prints: exactly what would be posted, then what was held back and why. */
export function renderText(ctx: PrContext, payload: ReviewPayload, routing: Routing): string {
  const out: string[] = [
    `PR ${ctx.repo}#${ctx.number} at ${ctx.headSha.slice(0, 12)}: ${ctx.title}`,
    "",
    "=== Review body (one COMMENT review) ===",
    payload.body,
    "",
    `=== Inline comments (${payload.comments.length}) ===`,
  ];
  for (const c of payload.comments) {
    const range = c.start_line !== undefined ? `${c.start_line}-${c.line}` : String(c.line);
    out.push(`--- ${c.path}:${range} (${c.side})`, c.body.replace(/\n\n<!-- ravn-pr-review:[^>]*-->$/, ""), "");
  }
  if (routing.dropped.length) {
    out.push(`=== Not posted (${routing.dropped.length}) ===`);
    for (const d of routing.dropped) out.push(`- [${d.finding.severity}] ${d.finding.path}:${d.finding.line} ${d.finding.title} (${d.reason})`);
  }
  return out.join("\n");
}
