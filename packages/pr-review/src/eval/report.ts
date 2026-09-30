/** Builds the shared eval report (schemas/eval-report.schema.json) from graded variants. */

import { validateReport, wilson } from "@ravn-agents/eval-core";
import { aggregate, discordant, type Aggregate, type ItemGrade } from "./grade.ts";
import type { Item, Variant } from "./items.ts";

export interface ReportInput {
  grades: Partial<Record<Variant, ItemGrade[]>>;
  items: Item[];
  itemsPath: string;
  rubricPath: string;
  commit: string;
  date: string;
  judgeModel: string;
  humanAgreement: { n: number; agreement: number } | null;
  cost: { usd: number; inputTokens: number; outputTokens: number; wallSeconds: number };
  partial: boolean;
  /** Items whose result was recovered by `salvage` rather than produced end to end. */
  salvaged?: number;
  pluginVersion: string;
  models: { main: string; subagents: Record<string, string>; effort?: string };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

function recall(a: Aggregate): { value: number; successes: number; n: number } {
  return { value: a.bugItems ? a.caughtInline / a.bugItems : 0, successes: a.caughtInline, n: a.bugItems };
}

const EXPECTED: Record<string, string> = {
  "missed-defect": "A verified critical/high inline finding on the defect the later fix corrected",
  "found-not-inline": "The defect flagged inline (critical/high, verified, anchorable)",
  "dropped-true-positive": "The defect flagged inline",
  "noise-on-clean": "No inline findings on a PR no later fix touched",
};

export function buildReport(input: ReportInput): Record<string, unknown> {
  const main = input.grades.coordinator;
  if (!main?.length) throw new Error("the coordinator variant has no grades; nothing to report");
  const agg = aggregate(main);
  if (agg.bugItems === 0) throw new Error("no bug items were graded; recall is undefined");
  const r = recall(agg);

  const secondary: Record<string, unknown>[] = [];
  const any = { successes: agg.caughtAnywhere, n: agg.bugItems };
  secondary.push({ name: "caught_anywhere_recall", value: round(any.successes / any.n), n: any.n, unit: "proportion", ci: wilson(any.successes, any.n) });

  const base = input.grades["single-prompt"];
  const baseAgg = base?.length ? aggregate(base) : null;
  if (agg.inlineTotal > 0) {
    const s: Record<string, unknown> = {
      name: "inline_precision",
      value: round(agg.inlineMatched / agg.inlineTotal),
      n: agg.inlineTotal,
      unit: "proportion (lower bound: unmatched findings on bug PRs count as wrong)",
      ci: wilson(agg.inlineMatched, agg.inlineTotal),
    };
    if (baseAgg && baseAgg.inlineTotal > 0) s.baselineValue = round(baseAgg.inlineMatched / baseAgg.inlineTotal);
    secondary.push(s);
  }
  if (agg.cleanItems > 0) {
    const s: Record<string, unknown> = { name: "inline_findings_per_clean_pr", value: round(agg.inlineOnClean / agg.cleanItems), n: agg.cleanItems, unit: "findings" };
    if (baseAgg && baseAgg.cleanItems > 0) s.baselineValue = round(baseAgg.inlineOnClean / baseAgg.cleanItems);
    secondary.push(s);
  }
  const notes: string[] = [];
  for (const [variant, name] of [["all-finders", "all_finders_recall"], ["coordinator-sonnet-subagents", "sonnet_subagents_recall"]] as const) {
    const g = input.grades[variant];
    if (!g?.length) continue;
    const a = aggregate(g);
    if (!a.bugItems) continue;
    secondary.push({ name, value: round(a.caughtInline / a.bugItems), n: a.bugItems, unit: "proportion", ci: wilson(a.caughtInline, a.bugItems), baselineValue: round(r.value) });
    const d = discordant(g, main);
    notes.push(`${variant} vs coordinator on the same bug PRs: only ${variant} ${d.onlyA}, only coordinator ${d.onlyB}, both ${d.both}, neither ${d.neither}.`);
  }

  let baseline: Record<string, unknown> | null = null;
  if (baseAgg && baseAgg.bugItems > 0) {
    const b = recall(baseAgg);
    const d = discordant(main, base!);
    baseline = {
      label: "single-prompt review, claude-opus-5-5, same diff, same posting policy, no finders or verifier",
      value: round(b.value),
      n: b.n,
      successes: b.successes,
      ci: wilson(b.successes, b.n),
      paired: true,
      delta: round(r.value - b.value),
    };
    notes.push(`Paired with the single-prompt baseline: only coordinator ${d.onlyA}, only baseline ${d.onlyB}, both ${d.both}, neither ${d.neither} (exact McNemar uses the ${d.onlyA + d.onlyB} discordant items).`);
  } else {
    notes.push("No baseline run: the single-prompt variant was not run.");
  }

  const unconfirmed = input.items.filter((i) => !i.confirmed).length;
  if (unconfirmed) notes.push(`${unconfirmed} of ${input.items.length} items are unconfirmed SZZ candidates; do not quote this number until they are confirmed by hand.`);
  if (input.salvaged) {
    notes.push(`${input.salvaged} items were salvaged from transcripts after a harness permission failure: their drafts were recovered from denied writes and finalized offline, so the agent's own finalize step did not run.`);
  }
  if (agg.runFailures) notes.push(`${agg.runFailures} item runs failed and count as misses.`);

  const failures = main
    .filter((g) => g.failure)
    .map((g) => {
      const item = input.items.find((i) => i.id === g.itemId)!;
      return {
        itemId: g.itemId,
        category: g.failure!,
        expected: EXPECTED[g.failure!] ?? (item.kind === "bug" ? "A completed review that flags the defect inline" : "A completed review"),
        actual: g.ran
          ? `${g.inlineCount} inline (${g.inlineMatched} matching), ${g.summaryCount} in summary`
          : "The review did not complete",
        ...(item.kind === "bug" ? { categoryDetail: item.defects.map((d) => `${d.path}:${d.startLine}-${d.endLine}`).join(", ") } : {}),
      };
    });

  const repos = [...new Set(input.items.map((i) => i.repo))].join(", ");
  const report: Record<string, unknown> = {
    schemaVersion: "1.0",
    tool: "pr-review",
    metric: {
      name: "historical_bug_recall",
      kind: "proportion",
      definition:
        "Share of historical PRs whose defect (fixed by a later PR, SZZ-linked and hand-confirmed) the reviewer flagged in a verified critical/high inline comment on the original diff, matched by line overlap plus a model judge.",
      higherIsBetter: true,
    },
    value: round(r.value),
    n: r.n,
    successes: r.successes,
    trialsPerItem: 1,
    ci: wilson(r.successes, r.n),
    baseline,
    secondaryMetrics: secondary,
    failures,
    grader: {
      type: "mixed",
      judgeModel: input.judgeModel,
      rubric: input.rubricPath,
      ...(input.humanAgreement ? { humanAgreement: input.humanAgreement } : {}),
    },
    model: input.models,
    commit: input.commit,
    pluginVersion: input.pluginVersion,
    date: input.date,
    dataset: { repo: repos, ref: "per item: headSha in items.json", items: input.itemsPath, selection: "See items.json selection field." },
    cost: {
      usd: round(input.cost.usd),
      inputTokens: input.cost.inputTokens,
      outputTokens: input.cost.outputTokens,
      wallSeconds: Math.round(input.cost.wallSeconds),
    },
    partial: input.partial,
    notes: notes.join(" "),
  };
  const v = validateReport(report);
  if (!v.valid) throw new Error(`report does not match schemas/eval-report.schema.json:\n${v.errors.join("\n")}`);
  return report;
}
