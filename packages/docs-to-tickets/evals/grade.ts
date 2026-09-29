import { meets, route, type FieldThreshold, type Thresholds } from "../src/routing.ts";
import { CONFIDENCE_LEVELS, type Confidence, type Extraction, type Requirement, type TicketType } from "../src/types.ts";
import { reasonsByTicket, validateExtraction } from "../src/validate.ts";

export type Split = "calibration" | "eval";

export interface Item {
  id: string;
  text: string;
  /** PR of f3r21/ravn-task-management-challenge that implemented this requirement. */
  pr: number;
  split: Split;
  optional: boolean;
  acceptableTypes: TicketType[];
}

export interface ItemsFile {
  frozen: string;
  source: string;
  briefSha256: string;
  groundTruth: string;
  split: string;
  items: Item[];
}

export interface Coverage {
  n: number;
  k: number;
  covered: string[];
  missed: string[];
}

/** Requirement coverage: an item is covered when at least one ticket cites it. Set arithmetic, no judge. */
export function coverage(items: readonly Item[], extraction: Extraction, split: Split): Coverage {
  const cited = new Set(extraction.tickets.flatMap((t) => t.source_refs));
  const scoped = items.filter((i) => i.split === split);
  const covered = scoped.filter((i) => cited.has(i.id)).map((i) => i.id);
  const missed = scoped.filter((i) => !cited.has(i.id)).map((i) => i.id);
  return { n: scoped.length, k: covered.length, covered, missed };
}

export const GRADED_FIELDS = ["source_refs", "type", "priority"] as const;
export type GradedField = (typeof GRADED_FIELDS)[number];

export interface TicketGrade {
  index: number;
  /** Which split the ticket's in-scope requirements fall in; "mixed" tickets are kept out of calibration. */
  split: Split | "mixed" | "none";
  /** null when the field cannot be graded (no in-scope requirement cited). */
  correct: Record<GradedField, boolean | null>;
  confidence: Record<GradedField, Confidence>;
}

/**
 * Per-field correctness from the frozen labels:
 * - source_refs: every cited in-scope requirement belongs to one PR group (no merge across work items);
 * - type: accepted by every cited in-scope requirement;
 * - priority: optional exactly when every cited in-scope requirement is optional.
 */
export function gradeTickets(items: readonly Item[], extraction: Extraction): TicketGrade[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return extraction.tickets.map((t, index) => {
    const scoped = t.source_refs.flatMap((r) => (byId.has(r) ? [byId.get(r)!] : []));
    const splits = new Set(scoped.map((i) => i.split));
    const split: TicketGrade["split"] = scoped.length === 0 ? "none" : splits.size > 1 ? "mixed" : [...splits][0]!;
    const graded = scoped.length > 0;
    const expectOptional = scoped.every((i) => i.optional);
    return {
      index,
      split,
      correct: {
        source_refs: graded ? new Set(scoped.map((i) => i.pr)).size === 1 : null,
        type: graded ? scoped.every((i) => i.acceptableTypes.includes(t.type)) : null,
        priority: graded ? (t.priority === "optional") === expectOptional : null,
      },
      confidence: { source_refs: t.confidence.source_refs, type: t.confidence.type, priority: t.confidence.priority },
    };
  });
}

export function fieldAccuracy(grades: readonly TicketGrade[], field: GradedField, splits: readonly TicketGrade["split"][]) {
  const scored = grades.filter((g) => splits.includes(g.split) && g.correct[field] !== null);
  return { n: scored.length, k: scored.filter((g) => g.correct[field]).length };
}

/**
 * Per field, the most permissive confidence level whose accepted tickets on the calibration split
 * reach the target precision. A level is only eligible when some ticket was observed at exactly
 * that level and at least `minAccepted` tickets are accepted: no evidence, no lowering. No level
 * reaching the target means the field always routes to review. Fields without labels keep the default.
 */
export function calibrate(
  grades: readonly TicketGrade[],
  base: Thresholds,
  target = base.target_precision,
  minAccepted = 3,
): Thresholds {
  const calibration = grades.filter((g) => g.split === "calibration");
  const fields = { ...base.fields };
  for (const field of GRADED_FIELDS) {
    const labelled = calibration.filter((g) => g.correct[field] !== null);
    if (labelled.length === 0) continue;
    let chosen: FieldThreshold = { min: "never", accepted: 0, correct: 0 };
    for (const level of CONFIDENCE_LEVELS) {
      if (!labelled.some((g) => g.confidence[field] === level)) continue;
      const accepted = labelled.filter((g) => meets(g.confidence[field], level));
      const correct = accepted.filter((g) => g.correct[field]).length;
      if (accepted.length >= minAccepted && correct / accepted.length >= target) {
        chosen = { min: level, accepted: accepted.length, correct };
        break;
      }
    }
    fields[field] = chosen;
  }
  return {
    version: 1,
    calibrated: true,
    target_precision: target,
    fields,
    notes:
      `Fitted on ${calibration.length} calibration-split tickets. acceptance_criteria has no code grader and keeps ` +
      `min "${fields.acceptance_criteria.min}" until a judged calibration run.`,
  };
}

/** Share of eval-split tickets the production routing would send to needs-review. */
export function reviewShare(
  grades: readonly TicketGrade[],
  extraction: Extraction,
  requirements: readonly Requirement[],
  thresholds: Thresholds,
) {
  const reasons = reasonsByTicket(validateExtraction(extraction, requirements), extraction.tickets.length);
  const scoped = grades.filter((g) => g.split === "eval" || g.split === "mixed");
  const routed = scoped.filter((g) => route(extraction.tickets[g.index]!.confidence, thresholds, reasons[g.index]).needsReview);
  return { n: scoped.length, k: routed.length };
}
