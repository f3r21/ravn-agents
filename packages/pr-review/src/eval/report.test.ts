import { describe, expect, it } from "vitest";
import type { ItemGrade } from "./grade.ts";
import type { Item } from "./items.ts";
import { buildReport, type ReportInput } from "./report.ts";

const item = (id: string, kind: Item["kind"]): Item => ({
  id, repo: "f3r21/ravn-ui-kit", pr: 1, kind, headSha: "a", mergedAt: "", title: "", changedLines: 1,
  defects: kind === "bug" ? [{ path: "a.ts", startLine: 1, endLine: 2, side: "RIGHT", description: "d", fixPr: 2 }] : [],
  labelConfidence: "high", evidence: "", confirmed: true, confirmedBy: "fj",
});
const grade = (itemId: string, kind: Item["kind"], caught: boolean, variant: ItemGrade["variant"], inline = caught ? 1 : 0): ItemGrade => ({
  itemId, kind, variant, ran: true, caughtInline: caught, caughtAnywhere: caught, caughtButDropped: false,
  inlineCount: inline, inlineMatched: caught ? 1 : 0, summaryCount: 0,
  failure: kind === "bug" && !caught ? "missed-defect" : kind === "clean" && inline ? "noise-on-clean" : null, judgements: [],
});

const items = [item("b1", "bug"), item("b2", "bug"), item("b3", "bug"), item("c1", "clean")];
const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  grades: {
    coordinator: [grade("b1", "bug", true, "coordinator"), grade("b2", "bug", true, "coordinator"), grade("b3", "bug", false, "coordinator"), grade("c1", "clean", false, "coordinator", 1)],
    "single-prompt": [grade("b1", "bug", true, "single-prompt"), grade("b2", "bug", false, "single-prompt"), grade("b3", "bug", false, "single-prompt"), grade("c1", "clean", false, "single-prompt", 3)],
  },
  items, itemsPath: "packages/pr-review/evals/items.json", rubricPath: "packages/pr-review/evals/rubric.md",
  commit: "abc1234", date: "2026-09-26T12:00:00.000Z", judgeModel: "claude-opus-5-5", humanAgreement: { n: 10, agreement: 0.9 },
  cost: { usd: 3.21, inputTokens: 100, outputTokens: 50, wallSeconds: 60 }, partial: false, pluginVersion: "0.1.0",
  models: { main: "claude-opus-5-5", subagents: { "pr-verifier": "claude-opus-5-5" } },
  ...over,
});

describe("buildReport", () => {
  it("produces a schema-valid report with k/n, a Wilson interval and a paired baseline", () => {
    const r = buildReport(input()) as Record<string, any>;
    expect(r).toMatchObject({ tool: "pr-review", value: 0.667, n: 3, successes: 2 });
    expect(r.ci.method).toBe("wilson");
    expect(r.baseline).toMatchObject({ successes: 1, n: 3, paired: true, delta: 0.333 });
    expect(r.notes).toMatch(/only coordinator 1, only baseline 0/);
    expect(r.failures.map((f: { itemId: string; category: string }) => [f.itemId, f.category])).toEqual([["b3", "missed-defect"], ["c1", "noise-on-clean"]]);
    const perClean = r.secondaryMetrics.find((m: { name: string }) => m.name === "inline_findings_per_clean_pr");
    expect(perClean).toMatchObject({ value: 1, baselineValue: 3 });
  });

  it("reports a null baseline, with the reason, when the baseline did not run", () => {
    const r = buildReport(input({ grades: { coordinator: input().grades.coordinator } })) as Record<string, any>;
    expect(r.baseline).toBeNull();
    expect(r.notes).toMatch(/No baseline run/);
  });

  it("warns when items are unconfirmed", () => {
    const r = buildReport(input({ items: items.map((i) => ({ ...i, confirmed: false })) })) as Record<string, any>;
    expect(r.notes).toMatch(/unconfirmed SZZ candidates/);
  });

  it("refuses to report without graded bug items", () => {
    expect(() => buildReport(input({ grades: { coordinator: [grade("c1", "clean", false, "coordinator")] } }))).toThrow(/no bug items/);
  });
});
