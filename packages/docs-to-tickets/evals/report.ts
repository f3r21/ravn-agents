import { wilson } from "@ravn-agents/eval-core";
import type { Thresholds } from "../src/routing.ts";
import type { Requirement } from "../src/types.ts";
import type { ExtractionRun } from "../src/extract.ts";
import { coverage, fieldAccuracy, GRADED_FIELDS, gradeTickets, reviewShare, type Item } from "./grade.ts";

/** Opus 5.5 list price, USD per million tokens (input, output). */
const PRICE = { input: 4, output: 20 };

export interface ReportInput {
  items: Item[];
  requirements: Requirement[];
  system: ExtractionRun;
  baseline: ExtractionRun | null;
  thresholds: Thresholds;
  model: string;
  commit: string;
  date: string;
  wallSeconds: number;
  partial: boolean;
  notes: string;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

function proportion(name: string, k: number, n: number) {
  return n === 0 ? [] : [{ name, value: round(k / n), n, unit: "proportion", ci: wilson(k, n) }];
}

/** The shared eval report (schemas/eval-report.schema.json) for one run. */
export function buildReport(input: ReportInput) {
  const { items, system, baseline } = input;
  const head = coverage(items, system.extraction, "eval");
  const cal = coverage(items, system.extraction, "calibration");
  const grades = gradeTickets(items, system.extraction);
  const base = baseline ? coverage(items, baseline.extraction, "eval") : null;
  const share = reviewShare(grades, system.extraction, input.requirements, input.thresholds);
  const tokens = {
    input: system.inputTokens + (baseline?.inputTokens ?? 0),
    output: system.outputTokens + (baseline?.outputTokens ?? 0),
  };
  const textOf = new Map(items.map((i) => [i.id, i.text]));

  return {
    schemaVersion: "1.0",
    tool: "docs-to-tickets",
    metric: {
      name: "requirement_coverage_recall",
      kind: "proportion",
      definition:
        "Share of eval-split brief checkboxes cited in source_refs by at least one extracted ticket (after validation and at most one retry).",
      higherIsBetter: true,
    },
    value: head.n ? round(head.k / head.n) : 0,
    n: head.n,
    successes: head.k,
    trialsPerItem: 1,
    ci: wilson(head.k, head.n),
    baseline: base
      ? {
          label: "single-pass extraction: same model and schema, no few-shot examples, no validation retry",
          value: round(base.k / base.n),
          n: base.n,
          successes: base.k,
          ci: wilson(base.k, base.n),
          paired: true,
          delta: round(head.k / head.n - base.k / base.n),
        }
      : null,
    secondaryMetrics: [
      ...proportion("calibration_split_recall", cal.k, cal.n),
      ...GRADED_FIELDS.flatMap((f) => {
        const a = fieldAccuracy(grades, f, ["eval", "mixed"]);
        return proportion(`${f}_accuracy`, a.k, a.n);
      }),
      ...proportion("needs_review_share", share.k, share.n),
      { name: "tickets", value: system.extraction.tickets.length, unit: "count" },
      { name: "extraction_attempts", value: system.attempts, unit: "count" },
      { name: "violations_after_retry", value: system.finalViolations.length, unit: "count" },
      { name: "mixed_split_tickets", value: grades.filter((g) => g.split === "mixed").length, unit: "count" },
    ],
    failures: head.missed.map((id) => ({
      itemId: id,
      category: "DT-EXTRACT-MISSED-REQ",
      expected: `A ticket citing ${id}: ${textOf.get(id)}`,
      actual: "No ticket cites it.",
    })),
    grader: { type: "code", rubric: "packages/docs-to-tickets/evals/rubric.md" },
    model: { main: input.model, subagents: { "ticket-extractor": input.model } },
    commit: input.commit,
    pluginVersion: "0.1.0",
    date: input.date,
    dataset: {
      repo: "f3r21/ravn-task-management-challenge",
      ref: "bc7e263a18677db91d2ff30526713091702c50e6",
      items: "packages/docs-to-tickets/evals/items.json",
      selection:
        "The brief's 39 checkboxes; 26 eval, 13 calibration, stratified by implementing PR (#1-#7). Bonus, general and goal bullets are parsed but not scored.",
    },
    cost: {
      usd: round((tokens.input * PRICE.input + tokens.output * PRICE.output) / 1e6),
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      wallSeconds: round(input.wallSeconds),
    },
    partial: input.partial,
    notes: input.notes,
  };
}
