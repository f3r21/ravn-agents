import { normaliseTitle } from "./idempotency.ts";
import type { Extraction, Requirement, Ticket } from "./types.ts";

export type RuleId =
  | "no-refs"
  | "unknown-ref"
  | "empty-criteria"
  | "ungrounded-criterion"
  | "type-detail"
  | "priority-mismatch"
  | "duplicate-ticket"
  | "unknown-label"
  | "uncovered-requirement"
  | "unknown-out-of-scope-ref"
  | "cited-and-excluded";

export interface Violation {
  /** Index into `tickets`, or null for a batch-level finding. */
  ticket: number | null;
  rule: RuleId;
  message: string;
}

export interface ValidationReport {
  violations: Violation[];
  /** Requirement ids neither cited by a ticket nor listed as out of scope. */
  uncovered: string[];
}

export interface ValidateOptions {
  /** The target repository's label names. When given, every ticket label must be one of them. */
  repoLabels?: readonly string[];
}

const STOPWORDS = new Set(
  "the and for with that this when from into should will must have each your their them than then there these those show user users add use using able allow".split(
    " ",
  ),
);

/** Content-word stems: lowercased words of 4+ letters, cut to 5 characters so plurals and tenses meet. */
function stems(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((w) => w.length >= 4 && !STOPWORDS.has(w)).map((w) => w.slice(0, 5)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Semantic checks that a schema cannot express. Schema-valid output can still cite requirements
 * that do not exist, invent criteria, duplicate work or silently drop part of the brief.
 */
export function validateExtraction(
  extraction: Extraction,
  requirements: readonly Requirement[],
  options: ValidateOptions = {},
): ValidationReport {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const violations: Violation[] = [];
  const add = (ticket: number | null, rule: RuleId, message: string) => violations.push({ ticket, rule, message });

  extraction.tickets.forEach((t, i) => checkTicket(t, i, byId, options, add));
  checkDuplicates(extraction.tickets, add);

  const cited = new Set(extraction.tickets.flatMap((t) => t.source_refs));
  const excluded = new Set<string>();
  for (const o of extraction.out_of_scope) {
    if (!byId.has(o.ref)) add(null, "unknown-out-of-scope-ref", `out_of_scope cites "${o.ref}", which is not a requirement id.`);
    else if (cited.has(o.ref)) add(null, "cited-and-excluded", `"${o.ref}" is cited by a ticket and also listed as out of scope.`);
    excluded.add(o.ref);
  }
  const uncovered = requirements.map((r) => r.id).filter((id) => !cited.has(id) && !excluded.has(id));
  for (const id of uncovered) {
    add(null, "uncovered-requirement", `Requirement ${id} ("${byId.get(id)!.text}") is neither ticketed nor listed as out of scope.`);
  }
  return { violations, uncovered };
}

function checkTicket(
  t: Ticket,
  i: number,
  byId: Map<string, Requirement>,
  options: ValidateOptions,
  add: (ticket: number | null, rule: RuleId, message: string) => void,
): void {
  const label = `Ticket ${i + 1} ("${t.title}")`;
  if (t.source_refs.length === 0) add(i, "no-refs", `${label} cites no requirement.`);
  const known = t.source_refs.flatMap((ref) => {
    const r = byId.get(ref);
    if (!r) add(i, "unknown-ref", `${label} cites "${ref}", which is not a requirement id.`);
    return r ? [r] : [];
  });
  if (t.acceptance_criteria.length === 0) add(i, "empty-criteria", `${label} has no acceptance criteria.`);

  const grounding = stems(known.map((r) => `${r.section} ${r.text}`).join(" "));
  if (known.length > 0) {
    t.acceptance_criteria.forEach((criterion, c) => {
      const own = stems(criterion);
      if (own.size > 0 && ![...own].some((s) => grounding.has(s))) {
        add(i, "ungrounded-criterion", `${label} criterion ${c + 1} ("${criterion}") shares no terms with its cited requirements.`);
      }
    });
  }

  if (t.type === "other" && !t.type_detail?.trim()) add(i, "type-detail", `${label} has type "other" without type_detail.`);

  if (known.length > 0) {
    const allOptional = known.every((r) => r.optional);
    if (t.priority === "optional" && !known.some((r) => r.optional)) {
      add(i, "priority-mismatch", `${label} is marked optional but none of its requirements is optional.`);
    } else if (t.priority === "required" && allOptional) {
      add(i, "priority-mismatch", `${label} is marked required but every cited requirement is optional.`);
    }
  }

  if (options.repoLabels) {
    const allowed = new Set(options.repoLabels.map((l) => l.toLowerCase()));
    for (const l of t.labels) {
      if (!allowed.has(l.toLowerCase())) add(i, "unknown-label", `${label} uses label "${l}", which the repository does not have.`);
    }
  }
}

function checkDuplicates(
  tickets: readonly Ticket[],
  add: (ticket: number | null, rule: RuleId, message: string) => void,
): void {
  const titles = tickets.map((t) => new Set(normaliseTitle(t.title).split(" ")));
  const refs = tickets.map((t) => [...t.source_refs].sort().join(","));
  for (let j = 1; j < tickets.length; j++) {
    for (let i = 0; i < j; i++) {
      // Splitting one requirement into several tickets is allowed, so shared refs alone are not a
      // duplicate; shared refs plus similar titles are.
      const similarity = jaccard(titles[i]!, titles[j]!);
      const sameRefs = refs[i] === refs[j] && refs[i] !== "";
      if (similarity >= 0.8 || (sameRefs && similarity >= 0.5)) {
        add(j, "duplicate-ticket", `Ticket ${j + 1} ("${tickets[j]!.title}") duplicates ticket ${i + 1} ("${tickets[i]!.title}").`);
        break;
      }
    }
  }
}

/** Violations grouped per ticket, as review reasons. Batch-level findings are not included. */
export function reasonsByTicket(report: ValidationReport, ticketCount: number): string[][] {
  const out: string[][] = Array.from({ length: ticketCount }, () => []);
  for (const v of report.violations) if (v.ticket !== null) out[v.ticket]!.push(`${v.rule}: ${v.message}`);
  return out;
}
