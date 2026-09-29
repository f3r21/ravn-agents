import { idempotencyKey } from "./idempotency.ts";
import { renderPreview, renderTicketBody, type PlannedTicket } from "./render.ts";
import { route, type Thresholds } from "./routing.ts";
import { checkShape } from "./ticket-schema.ts";
import type { Extraction, FieldConfidence, Requirement } from "./types.ts";
import { reasonsByTicket, validateExtraction, type Violation } from "./validate.ts";

/** Arguments for one `github_issue_create` call, exactly as the plan fixes them. */
export interface CreateArgs {
  repo: string;
  title: string;
  body: string;
  source_refs: string[];
  idempotency_key: string;
  field_confidence: FieldConfidence;
  labels: string[];
  review_reasons: string[];
}

export type Plan =
  | { ok: false; shapeErrors: string[] }
  | {
      ok: true;
      repo: string;
      extraction: Extraction;
      tickets: PlannedTicket[];
      violations: Violation[];
      uncovered: string[];
      createArgs: CreateArgs[];
      preview: string;
    };

export interface PlanInput {
  repo: string;
  requirements: readonly Requirement[];
  extraction: unknown;
  thresholds: Thresholds;
  repoLabels?: readonly string[];
  mode?: string;
}

/** Shape check, semantic validation, idempotency keys and review routing for a whole batch. */
export function buildPlan(input: PlanInput): Plan {
  const shape = checkShape(input.extraction);
  if (!shape.ok) return { ok: false, shapeErrors: shape.errors };
  const extraction = shape.value;
  const byId = new Map(input.requirements.map((r) => [r.id, r]));
  const report = validateExtraction(extraction, input.requirements, { repoLabels: input.repoLabels });
  const reasons = reasonsByTicket(report, extraction.tickets.length);

  const tickets: PlannedTicket[] = extraction.tickets.map((ticket, index) => {
    const routing = route(ticket.confidence, input.thresholds, reasons[index]);
    return {
      index,
      key: idempotencyKey(input.repo, ticket.source_refs, ticket.title),
      ticket,
      body: renderTicketBody(ticket, byId),
      needsReview: routing.needsReview,
      reasons: routing.reasons,
    };
  });
  const createArgs = tickets.map(
    (p): CreateArgs => ({
      repo: input.repo,
      title: p.ticket.title,
      body: p.body,
      source_refs: p.ticket.source_refs,
      idempotency_key: p.key,
      field_confidence: p.ticket.confidence,
      labels: p.ticket.labels,
      review_reasons: reasons[p.index]!,
    }),
  );
  const batchFindings = report.violations
    .filter((v) => v.ticket === null && v.rule !== "uncovered-requirement")
    .map((v) => v.message);
  const preview = renderPreview(
    input.repo,
    tickets,
    report.uncovered,
    extraction.out_of_scope,
    batchFindings,
    input.mode ?? "dry-run",
  );
  return { ok: true, repo: input.repo, extraction, tickets, violations: report.violations, uncovered: report.uncovered, createArgs, preview };
}

/** The one targeted retry turn: the specific violations, not a generic "try again". */
export function retryFeedback(violations: readonly Violation[] | readonly string[]): string {
  const lines = violations.map((v) => (typeof v === "string" ? v : v.message));
  return [
    "Your previous extraction failed these checks. Return the full corrected JSON (all tickets, not only the changed ones).",
    "Fix each finding; if a finding is correct as written, keep the ticket and the reviewer will decide.",
    "",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
}
