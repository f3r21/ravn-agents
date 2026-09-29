import { describe, expect, it } from "vitest";
import { fingerprint } from "../policy.ts";
import type { RoutedFinding, Routing } from "../types.ts";
import { finding } from "../test/fixtures.ts";
import { aggregate, discordant, gradeItem, humanAgreement, nearDefect, type Judge } from "./grade.ts";
import type { Item, VariantResult } from "./items.ts";

const bug: Item = {
  id: "kit#1", repo: "o/kit", pr: 1, kind: "bug", headSha: "a", mergedAt: "", title: "t", changedLines: 10,
  defects: [{ path: "src/a.ts", startLine: 50, endLine: 52, side: "RIGHT", description: "off by one", fixPr: 2 }],
  labelConfidence: "high", evidence: "", confirmed: true, confirmedBy: "fj",
};
const clean: Item = { ...bug, id: "kit#3", kind: "clean", defects: [] };

const rf = (over: Partial<RoutedFinding>): RoutedFinding => {
  const f = finding({ path: "src/a.ts", line: 51, ...over });
  return { ...f, fingerprint: fingerprint(f) };
};
const result = (item: Item, routing: Routing | null, over: Partial<VariantResult> = {}): VariantResult => ({
  itemId: item.id, variant: "coordinator", ok: routing !== null, routing, costUsd: 1, inputTokens: 1, outputTokens: 1, wallSeconds: 1, transcript: null, ...over,
});
const yes: Judge = async () => ({ match: true, reason: "same" });
const no: Judge = async () => ({ match: false, reason: "different" });

describe("nearDefect", () => {
  it("needs the same file and a line within the slack", () => {
    expect(nearDefect(rf({ line: 60 }), bug.defects[0]!)).toBe(true);
    expect(nearDefect(rf({ line: 70 }), bug.defects[0]!)).toBe(false);
    expect(nearDefect(rf({ path: "src/b.ts" }), bug.defects[0]!)).toBe(false);
  });
});

describe("gradeItem", () => {
  it("counts an inline match as caught, and only asks the judge about nearby findings", async () => {
    let calls = 0;
    const judge: Judge = async (...a) => (calls++, yes(...a));
    const g = await gradeItem(bug, result(bug, { inline: [rf({}), rf({ line: 200, title: "far" })], summary: [], dropped: [] }), judge);
    expect(g).toMatchObject({ caughtInline: true, caughtAnywhere: true, inlineMatched: 1, inlineCount: 2, failure: null });
    expect(calls).toBe(1);
  });

  it("classifies a summary-only match and a verifier-dropped match", async () => {
    const summary = await gradeItem(bug, result(bug, { inline: [], summary: [rf({ severity: "medium" })], dropped: [] }), yes);
    expect(summary.failure).toBe("found-not-inline");
    const dropped = await gradeItem(bug, result(bug, { inline: [], summary: [], dropped: [{ finding: rf({}), reason: "verifier: rejected" }] }), yes);
    expect(dropped.failure).toBe("dropped-true-positive");
  });

  it("does not credit a nearby finding the judge rejects", async () => {
    const g = await gradeItem(bug, result(bug, { inline: [rf({})], summary: [], dropped: [] }), no);
    expect(g).toMatchObject({ caughtInline: false, failure: "missed-defect", inlineMatched: 0 });
    expect(g.judgements[0]!.reason).toBe("different");
  });

  it("marks a failed run as a miss with its failure mode, and inline findings on a clean PR as noise", async () => {
    expect((await gradeItem(bug, result(bug, null, { failure: "timeout" }), yes)).failure).toBe("timeout");
    expect((await gradeItem(clean, result(clean, { inline: [rf({})], summary: [], dropped: [] }), yes)).failure).toBe("noise-on-clean");
  });
});

describe("aggregate and discordant", () => {
  it("sum recall and precision inputs and count paired disagreements", async () => {
    const hit = await gradeItem(bug, result(bug, { inline: [rf({})], summary: [], dropped: [] }), yes);
    const noisy = await gradeItem(clean, result(clean, { inline: [rf({})], summary: [], dropped: [] }), yes);
    const a = aggregate([hit, noisy]);
    expect(a).toMatchObject({ bugItems: 1, caughtInline: 1, cleanItems: 1, inlineOnClean: 1, inlineTotal: 2, inlineMatched: 1 });
    const miss = await gradeItem(bug, result(bug, { inline: [], summary: [], dropped: [] }), yes);
    expect(discordant([hit], [miss])).toEqual({ onlyA: 1, onlyB: 0, both: 0, neither: 0 });
  });
});

describe("humanAgreement", () => {
  it("scores only the decisions a human labelled", async () => {
    const g = await gradeItem(bug, result(bug, { inline: [rf({})], summary: [], dropped: [] }), yes);
    const key = g.judgements[0]!.key;
    expect(humanAgreement(g.judgements, { [key]: false })).toEqual({ n: 1, agreement: 0 });
    expect(humanAgreement(g.judgements, {})).toBeNull();
  });
});
