import { marker } from "./idempotency.ts";
import { CONFIDENCE_FIELDS, type FieldConfidence, type Requirement, type Ticket } from "./types.ts";

/** The issue body the plan proposes: description, acceptance criteria, and the quoted source text. */
export function renderTicketBody(ticket: Ticket, requirements: ReadonlyMap<string, Requirement>): string {
  const criteria = ticket.acceptance_criteria.map((c) => `- [ ] ${c}`).join("\n");
  const sources = ticket.source_refs
    .map((ref) => {
      const r = requirements.get(ref);
      return r ? `- \`${ref}\` (${r.section}): ${r.text}` : `- \`${ref}\``;
    })
    .join("\n");
  return `${ticket.description.trim()}\n\n## Acceptance criteria\n\n${criteria}\n\n## Source\n\n${sources}\n`;
}

export interface FooterInput {
  sourceRefs: readonly string[];
  confidence: FieldConfidence;
  needsReview: boolean;
  reasons: readonly string[];
  key: string;
}

/** Appended by the server to every issue it creates: provenance, confidence, routing and the dedupe marker. */
export function renderFooter(f: FooterInput): string {
  const confidence = CONFIDENCE_FIELDS.map((field) => `${field} ${f.confidence[field]}`).join(" · ");
  const review = f.needsReview
    ? `\n**Needs review** before work starts:\n${f.reasons.map((r) => `- ${r}`).join("\n")}\n`
    : "";
  return [
    "",
    "---",
    `**Source requirements:** ${f.sourceRefs.map((r) => `\`${r}\``).join(", ")}`,
    `**Field confidence:** ${confidence}`,
    review,
    marker(f.key),
    "",
  ].join("\n");
}

export interface PlannedTicket {
  index: number;
  key: string;
  ticket: Ticket;
  body: string;
  needsReview: boolean;
  reasons: string[];
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** One Markdown preview of the whole batch, shown to the user before anything is created. */
export function renderPreview(
  repo: string,
  planned: readonly PlannedTicket[],
  uncovered: readonly string[],
  outOfScope: readonly { ref: string; reason: string }[],
  batchFindings: readonly string[],
  mode: string,
): string {
  const review = planned.filter((p) => p.needsReview).length;
  const rows = planned.map(
    (p) =>
      `| ${p.index + 1} | ${cell(p.ticket.title)} | ${p.ticket.source_refs.join(", ")} | ${p.ticket.type} | ${p.ticket.priority} | ${
        p.needsReview ? "**needs-review**" : "auto"
      } |`,
  );
  const reasons = planned
    .filter((p) => p.needsReview)
    .map((p) => `- #${p.index + 1} ${cell(p.ticket.title)}\n${p.reasons.map((r) => `  - ${cell(r)}`).join("\n")}`);
  return [
    `# Ticket batch for ${repo} (${mode})`,
    "",
    `${planned.length} tickets: ${planned.length - review} auto, ${review} routed to \`needs-review\`.`,
    "",
    "| # | Title | Source | Type | Priority | Route |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    ...(reasons.length ? ["## Why tickets need review", "", ...reasons, ""] : []),
    ...(outOfScope.length ? ["## Out of scope", "", ...outOfScope.map((o) => `- \`${o.ref}\`: ${cell(o.reason)}`), ""] : []),
    ...(uncovered.length ? ["## Not covered by any ticket", "", ...uncovered.map((id) => `- \`${id}\``), ""] : []),
    ...(batchFindings.length ? ["## Batch findings", "", ...batchFindings.map((f) => `- ${cell(f)}`), ""] : []),
  ].join("\n");
}
