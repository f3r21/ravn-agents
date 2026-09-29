/**
 * Matching findings to ground-truth defects (research doc 3.4): a deterministic file/line-overlap
 * pre-filter first, then a model judge only for the pairs that pass it. Judge decisions are
 * recorded so a human can grade a sample and measure agreement.
 */

import type { RoutedFinding } from "../types.ts";
import type { Defect, Item, VariantResult } from "./items.ts";

/** How far (in lines) a finding may sit from the defect's range and still be judged. */
export const LINE_SLACK = 10;

export type Where = "inline" | "summary" | "dropped";

export interface JudgeVerdict {
  match: boolean;
  reason: string;
}

export type Judge = (item: Item, defect: Defect, finding: RoutedFinding) => Promise<JudgeVerdict>;

export interface JudgeRecord {
  key: string;
  itemId: string;
  defectIndex: number;
  fingerprint: string;
  where: Where;
  defect: string;
  finding: string;
  match: boolean;
  reason: string;
}

export interface ItemGrade {
  itemId: string;
  kind: Item["kind"];
  variant: VariantResult["variant"];
  ran: boolean;
  /** Bug items: some defect matched by an inline finding. The headline recall numerator. */
  caughtInline: boolean;
  /** Bug items: some defect matched by an inline or summary finding. */
  caughtAnywhere: boolean;
  /** Bug items: a defect matched only by a finding the pipeline dropped (verifier or policy). */
  caughtButDropped: boolean;
  inlineCount: number;
  /** Inline findings that match a ground-truth defect. */
  inlineMatched: number;
  summaryCount: number;
  failure: string | null;
  judgements: JudgeRecord[];
}

export function nearDefect(f: RoutedFinding, d: Defect, slack = LINE_SLACK): boolean {
  if (f.path !== d.path) return false;
  const lo = (f.startLine ?? f.line) - slack;
  const hi = f.line + slack;
  return lo <= d.endLine && hi >= d.startLine;
}

export function judgeKey(itemId: string, defectIndex: number, fingerprint: string): string {
  return `${itemId}|${defectIndex}|${fingerprint}`;
}

export async function gradeItem(item: Item, result: VariantResult, judge: Judge): Promise<ItemGrade> {
  const base: ItemGrade = {
    itemId: item.id,
    kind: item.kind,
    variant: result.variant,
    ran: result.ok && result.routing !== null,
    caughtInline: false,
    caughtAnywhere: false,
    caughtButDropped: false,
    inlineCount: result.routing?.inline.length ?? 0,
    inlineMatched: 0,
    summaryCount: result.routing?.summary.length ?? 0,
    failure: null,
    judgements: [],
  };
  if (!base.ran || !result.routing) return { ...base, failure: result.failure ?? "run-failed" };

  const pools: [Where, RoutedFinding[]][] = [
    ["inline", result.routing.inline],
    ["summary", result.routing.summary],
    ["dropped", result.routing.dropped.map((d) => d.finding)],
  ];
  const matchedInline = new Set<string>();

  for (const [index, defect] of item.defects.entries()) {
    for (const [where, findings] of pools) {
      for (const f of findings) {
        if (!nearDefect(f, defect)) continue;
        const v = await judge(item, defect, f);
        base.judgements.push({
          key: judgeKey(item.id, index, f.fingerprint),
          itemId: item.id,
          defectIndex: index,
          fingerprint: f.fingerprint,
          where,
          defect: defect.description,
          finding: `${f.title}\n${f.body}`,
          match: v.match,
          reason: v.reason,
        });
        if (!v.match) continue;
        if (where === "inline") {
          base.caughtInline = true;
          matchedInline.add(f.fingerprint);
        }
        if (where !== "dropped") base.caughtAnywhere = true;
        else base.caughtButDropped = true;
      }
    }
  }
  base.inlineMatched = matchedInline.size;

  if (item.kind === "bug" && !base.caughtInline) {
    base.failure = base.caughtAnywhere ? "found-not-inline" : base.caughtButDropped ? "dropped-true-positive" : "missed-defect";
  }
  if (item.kind === "clean" && base.inlineCount > 0) base.failure = "noise-on-clean";
  return base;
}

export interface Aggregate {
  variant: VariantResult["variant"];
  bugItems: number;
  caughtInline: number;
  caughtAnywhere: number;
  cleanItems: number;
  inlineOnClean: number;
  /** Inline findings across all items, and how many matched ground truth. */
  inlineTotal: number;
  inlineMatched: number;
  runFailures: number;
}

export function aggregate(grades: ItemGrade[]): Aggregate {
  const variant = grades[0]?.variant ?? "coordinator";
  const bugs = grades.filter((g) => g.kind === "bug");
  const clean = grades.filter((g) => g.kind === "clean");
  return {
    variant,
    bugItems: bugs.length,
    caughtInline: bugs.filter((g) => g.caughtInline).length,
    caughtAnywhere: bugs.filter((g) => g.caughtAnywhere).length,
    cleanItems: clean.length,
    inlineOnClean: clean.reduce((n, g) => n + g.inlineCount, 0),
    inlineTotal: grades.reduce((n, g) => n + g.inlineCount, 0),
    inlineMatched: grades.reduce((n, g) => n + g.inlineMatched, 0),
    runFailures: grades.filter((g) => !g.ran).length,
  };
}

/** Paired comparison on the same bug items: counts where exactly one system caught the bug. */
export function discordant(a: ItemGrade[], b: ItemGrade[]): { onlyA: number; onlyB: number; both: number; neither: number } {
  const byId = new Map(b.filter((g) => g.kind === "bug").map((g) => [g.itemId, g]));
  const out = { onlyA: 0, onlyB: 0, both: 0, neither: 0 };
  for (const g of a.filter((x) => x.kind === "bug")) {
    const o = byId.get(g.itemId);
    if (!o) continue;
    if (g.caughtInline && o.caughtInline) out.both++;
    else if (g.caughtInline) out.onlyA++;
    else if (o.caughtInline) out.onlyB++;
    else out.neither++;
  }
  return out;
}

/** Share of judge decisions a human agreed with, over the keys the human labelled. */
export function humanAgreement(records: JudgeRecord[], labels: Record<string, boolean>): { n: number; agreement: number } | null {
  const labelled = records.filter((r) => r.key in labels);
  if (!labelled.length) return null;
  const agree = labelled.filter((r) => labels[r.key] === r.match).length;
  return { n: labelled.length, agreement: agree / labelled.length };
}
