import { readFileSync } from "node:fs";
import { validateReport } from "@ravn-agents/eval-core";
import { describe, expect, it } from "vitest";
import { citedFiles, gradeByCode, hitsEvidence, judgePrompt, parseVerdict } from "./grade.js";
import { type EvalItem, type ItemSet, checkItemSet } from "./items.js";
import { type ReportMeta, type TrialResult, buildReport, failureCategory, mcnemarExact, median } from "./report.js";
import { type RunMetrics, parseTranscript } from "./transcript.js";

const itemSet = JSON.parse(readFileSync(new URL("../../evals/items.json", import.meta.url), "utf8")) as ItemSet;

const codeItem: EvalItem = {
  id: "T1",
  category: "where",
  question: "Where is the debounce delay?",
  mapRef: "ask",
  reference: { answer: "300 in use-board-filters.ts", evidence: ["src/features/board/use-board-filters.ts:120"] },
  grading: { kind: "code", mustMatch: ["use-board-filters\\.ts", "\\b300\\b"], mustNotMatch: ["\\b500\\b"] },
};

describe("the frozen item set", () => {
  it("is structurally valid, with 20+ items, stale and unanswerable questions and 10+ judge items", () => {
    expect(checkItemSet(itemSet)).toEqual([]);
    expect(itemSet.items.length).toBeGreaterThanOrEqual(20);
    expect(itemSet.items.filter((i) => i.category === "stale").length).toBeGreaterThanOrEqual(2);
    expect(itemSet.items.filter((i) => i.category === "unanswerable").length).toBeGreaterThanOrEqual(1);
    expect(itemSet.items.filter((i) => i.grading.kind === "judge").length).toBeGreaterThanOrEqual(10);
  });

  it("catches duplicate ids, bad evidence and bad regexes", () => {
    const broken: ItemSet = {
      ...itemSet,
      items: [
        codeItem,
        { ...codeItem, reference: { answer: "x", evidence: ["no-line"] }, grading: { kind: "code", mustMatch: ["("] } },
      ],
    };
    const problems = checkItemSet(broken);
    expect(problems.some((p) => p.includes("duplicate id"))).toBe(true);
    expect(problems.some((p) => p.includes("is not path:line"))).toBe(true);
    expect(problems.some((p) => p.includes("invalid regex"))).toBe(true);
  });
});

describe("gradeByCode", () => {
  it("passes when every required pattern matches, case-insensitively", () => {
    expect(gradeByCode(codeItem, "SEARCH_DEBOUNCE_MS is 300 in `src/features/board/USE-BOARD-FILTERS.ts:120`").pass).toBe(true);
  });

  it("fails and names what is missing or forbidden", () => {
    const grade = gradeByCode(codeItem, "It is 500 ms in use-board-filters.ts");
    expect(grade.pass).toBe(false);
    expect(grade.detail).toBe("missing /\\b300\\b/; forbidden /\\b500\\b/");
  });
});

describe("evidence", () => {
  it("collects files from citations and bare paths", () => {
    expect([...citedFiles("See `src/a.ts:3`, and api/graphql.ts (line 9).")].sort()).toEqual(["api/graphql.ts", "src/a.ts"]);
  });

  it("hits when the answer names a reference file", () => {
    expect(hitsEvidence(codeItem, "src/features/board/use-board-filters.ts:120")).toBe(true);
    expect(hitsEvidence(codeItem, "src/lib/env.ts:1")).toBe(false);
  });
});

describe("parseVerdict", () => {
  it("reads the last VERDICT line", () => {
    expect(parseVerdict("VERDICT: FAIL\nreconsidered\nVERDICT: PASS")).toMatchObject({ pass: true });
  });

  it("is an error, never a silent grade, when the line is missing", () => {
    expect(parseVerdict("Looks right to me.")).toEqual({ error: "judge output has no VERDICT: PASS|FAIL line" });
  });

  it("builds a prompt with the reference and the answer, the question last before the instruction", () => {
    const prompt = judgePrompt(codeItem, "an answer", "rubric text");
    expect(prompt).toContain("<reference_answer>300 in use-board-filters.ts</reference_answer>");
    expect(prompt.trimEnd().endsWith("VERDICT: PASS or VERDICT: FAIL")).toBe(true);
  });
});

describe("parseTranscript", () => {
  const lines = [
    { type: "system", subtype: "init" },
    { type: "assistant", message: { id: "m1", content: [{ type: "tool_use", id: "t1", name: "Read" }], usage: { input_tokens: 10, output_tokens: 5 } } },
    { type: "assistant", parent_tool_use_id: "t9", message: { id: "m2", content: [{ type: "tool_use", id: "t2", name: "Grep" }, { type: "text", text: "sub" }] } },
    { type: "assistant", message: { id: "m3", content: [{ type: "text", text: "draft" }] } },
    { type: "result", subtype: "success", result: "interim", duration_ms: 1000, total_cost_usd: 0.5 },
    {
      type: "result",
      subtype: "success",
      result: "final answer",
      duration_ms: 2000,
      num_turns: 3,
      total_cost_usd: 0.75,
      modelUsage: { a: { inputTokens: 1, cacheReadInputTokens: 100, cacheCreationInputTokens: 10, outputTokens: 7 }, b: { inputTokens: 2, outputTokens: 3 } },
    },
  ];

  it("takes the last result's answer and cumulative usage, and counts every tool call including subagents'", () => {
    const metrics = parseTranscript(lines.map((l) => JSON.stringify(l)).join("\n"));
    expect(metrics).toMatchObject({
      finalText: "final answer",
      inputTokens: 113,
      outputTokens: 10,
      toolCalls: 2,
      toolsByName: { Read: 1, Grep: 1 },
      costUsd: 0.75,
      wallSeconds: 3,
      turns: 3,
      isError: false,
    });
  });

  it("marks a transcript with no result event as an error", () => {
    expect(parseTranscript(JSON.stringify(lines[1]))).toMatchObject({ isError: true, errorDetail: "no result event (killed or crashed)" });
  });

  it("tolerates raw control characters inside a line", () => {
    const raw = '{"type":"result","subtype":"success","result":"a\tb"}';
    expect(parseTranscript(raw).finalText).toBe("a\tb");
  });
});

describe("statistics", () => {
  it("computes medians of odd and even lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });

  it("computes the exact McNemar p-value on discordant pairs", () => {
    expect(mcnemarExact(0, 0)).toBe(1);
    expect(mcnemarExact(6, 0)).toBeCloseTo(0.03125, 5);
    expect(mcnemarExact(3, 3)).toBe(1);
  });
});

describe("buildReport", () => {
  const metrics = (over: Partial<RunMetrics> = {}): RunMetrics => ({
    finalText: "x",
    inputTokens: 100,
    outputTokens: 10,
    toolCalls: 4,
    toolsByName: {},
    costUsd: 0.1,
    wallSeconds: 20,
    turns: 3,
    isError: false,
    ...over,
  });
  const trial = (itemId: string, condition: "map" | "baseline", pass: boolean, over: Partial<TrialResult> = {}): TrialResult => ({
    itemId,
    condition,
    trial: 1,
    answer: "answer",
    metrics: metrics(),
    pass,
    grader: "code",
    detail: "",
    evidenceHit: pass,
    transcript: `t/${itemId}-${condition}.jsonl`,
    ...over,
  });
  const items: EvalItem[] = [
    codeItem,
    { ...codeItem, id: "T2", category: "stale", mapRef: "stale" },
    { ...codeItem, id: "T3", category: "unanswerable", grading: { kind: "judge" } },
  ];
  const meta: ReportMeta = {
    commit: "abcdef1",
    date: "2026-09-26T12:00:00.000Z",
    datasetRef: "a".repeat(40),
    repo: "f3r21/ravn-task-management-challenge",
    itemsPath: "packages/onboarding/evals/items.json",
    selection: "test",
    rubricPath: "packages/onboarding/evals/rubric.md",
    judgeModel: "claude-opus-5-5",
    answerModel: "claude-opus-5-5",
    subagentModels: { "area-mapper": "claude-opus-5-5" },
    trialsPerItem: 1,
    partial: false,
    buildCost: { usd: 2.44, wallSeconds: 185 },
  };

  it("produces a schema-valid paired report with Wilson intervals, failures by failure mode and human agreement", () => {
    const results = [
      trial("T1", "map", true),
      trial("T1", "baseline", true),
      trial("T2", "map", false),
      trial("T2", "baseline", false),
      trial("T3", "map", true, { grader: "judge" }),
      trial("T3", "baseline", false, { grader: "judge", metrics: metrics({ toolCalls: 12 }) }),
    ];
    const report = buildReport(items, results, meta, { T3: true }) as Record<string, unknown>;
    expect(validateReport(report)).toEqual({ valid: true, errors: [] });
    expect(report).toMatchObject({ value: 0.6667, n: 3, successes: 2, baseline: { successes: 1, paired: true, delta: 0.3333 } });
    expect(report.failures).toEqual([expect.objectContaining({ itemId: "T2", category: "F1" })]);
    expect(report.grader).toMatchObject({ type: "mixed", humanAgreement: { n: 1, agreement: 1 } });
    expect(report.notes).toContain("map-only passes 1, baseline-only passes 0");
    const secondary = report.secondaryMetrics as { name: string; value: number; baselineValue?: number }[];
    expect(secondary.find((s) => s.name === "median_tool_calls_per_answer")).toMatchObject({ value: 4, baselineValue: 4 });
    expect(secondary.find((s) => s.name === "map_build_cost_usd")).toMatchObject({ value: 2.44 });
  });

  it("excludes unpaired items and marks the run partial", () => {
    const report = buildReport(items, [trial("T1", "map", true), trial("T1", "baseline", true), trial("T2", "map", true)], meta) as Record<string, unknown>;
    expect(report).toMatchObject({ n: 1, partial: true });
    expect(report.notes).toContain("excluded: T2, T3");
  });

  it("requires every trial to pass (pass^k)", () => {
    const results = [trial("T1", "map", true), trial("T1", "map", false, { trial: 2 }), trial("T1", "baseline", true)];
    expect(buildReport([codeItem], results, { ...meta, trialsPerItem: 2 })).toMatchObject({ successes: 0 });
  });

  it("maps failed trials to failure-mode ids", () => {
    expect(failureCategory(codeItem, trial("T1", "map", false, { metrics: metrics({ isError: true }) }))).toBe("F12");
    expect(failureCategory(codeItem, trial("T1", "map", false, { grader: "error" }))).toBe("F15");
    expect(failureCategory(items[2] as EvalItem, trial("T3", "map", false))).toBe("F11");
    expect(failureCategory(codeItem, trial("T1", "map", false))).toBe("F10");
  });
});
