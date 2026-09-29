import { describe, expect, it } from "vitest";
import { parseDiff } from "../diff.ts";
import { route } from "../policy.ts";
import { DIFF } from "../test/fixtures.ts";
import { baselineDraft, parseClaudeResult, runVariant } from "./run.ts";
import type { Item } from "./items.ts";
import { loadItems } from "./items.ts";

describe("baselineDraft", () => {
  it("routes the single-prompt baseline through the same posting policy", () => {
    const draft = baselineDraft([
      { category: "correctness", path: "src/task-table.tsx", line: 12, side: "RIGHT", severity: "high", confidence: "high", title: "a", body: "b" },
      { category: "tests", path: "src/task-table.tsx", line: 12, side: "RIGHT", severity: "low", confidence: "low", title: "c", body: "d" },
    ]);
    const r = route(draft, parseDiff(DIFF), []);
    expect(r.inline).toHaveLength(1);
    expect(r.summary).toHaveLength(1);
  });
});

describe("parseClaudeResult", () => {
  it("reads the json result, or the last line of a stream", () => {
    expect(parseClaudeResult('{"total_cost_usd":1.5}')?.total_cost_usd).toBe(1.5);
    expect(parseClaudeResult('noise\n{"subtype":"success"}')?.subtype).toBe("success");
    expect(parseClaudeResult("not json")).toBeNull();
  });
});

describe("runVariant", () => {
  it("fails with a typed failure, and spends nothing, when no clone is configured", async () => {
    const item = { id: "x#1", repo: "o/x", pr: 1, kind: "bug", headSha: "a", defects: [] } as unknown as Item;
    let spawned = false;
    const res = await runVariant(item, "coordinator", {
      pluginDir: "/", clones: {}, outDir: "/tmp/pr-review-run-test", budgetUsdPerItem: 1, timeoutMinutes: 1,
      mainModel: "claude-opus-5-5", sonnetSubagentModel: "claude-sonnet-5-5",
      proc: async () => ((spawned = true), { code: 0, stdout: "", stderr: "" }),
    });
    expect(res).toMatchObject({ ok: false, failure: "run-failed" });
    expect(spawned).toBe(false);
  });
});

describe("evals/items.json", () => {
  const file = loadItems(new URL("../../evals/items.json", import.meta.url).pathname);
  it("holds both bug and clean items with unique ids and full head SHAs", () => {
    const bugs = file.items.filter((i) => i.kind === "bug");
    const clean = file.items.filter((i) => i.kind === "clean");
    // Recall and noise are separate proportions, so the two kinds need not balance.
    expect(bugs.length).toBeGreaterThan(0);
    expect(clean.length).toBeGreaterThan(0);
    expect(new Set(file.items.map((i) => i.id)).size).toBe(file.items.length);
    for (const i of file.items) expect(i.headSha).toMatch(/^[0-9a-f]{40}$/);
  });
});
