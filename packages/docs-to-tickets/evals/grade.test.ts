import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateReport } from "@ravn-agents/eval-core";
import { describe, expect, it } from "vitest";
import { loadBrief, parseRequirements, renderBrief } from "../src/brief.ts";
import { DEFAULT_THRESHOLDS } from "../src/routing.ts";
import { HIGH, ticket } from "../src/test-fixtures.ts";
import type { Extraction } from "../src/types.ts";
import { calibrate, coverage, fieldAccuracy, gradeTickets, type Item, type ItemsFile } from "./grade.ts";
import { buildReport } from "./report.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const itemsFile = JSON.parse(readFileSync(path.join(here, "items.json"), "utf8")) as ItemsFile;

describe("frozen items", () => {
  const brief = loadBrief(path.join(here, "brief"));

  it("match the brief copy they were frozen from", () => {
    expect(createHash("sha256").update(renderBrief(brief)).digest("hex")).toBe(itemsFile.briefSha256);
  });

  it("are exactly the 39 checkboxes, with the parser's ids and text", () => {
    const checkboxes = parseRequirements(brief).filter((r) => r.kind === "checkbox");
    expect(itemsFile.items.map((i) => [i.id, i.text])).toEqual(checkboxes.map((r) => [r.id, r.text]));
  });

  it("split 13 calibration / 26 eval by whole sections", () => {
    const cal = itemsFile.items.filter((i) => i.split === "calibration");
    expect(cal).toHaveLength(13);
    const sectionSplits = new Map<string, Set<string>>();
    for (const i of itemsFile.items) {
      const s = i.id.split(".")[0]!;
      sectionSplits.set(s, (sectionSplits.get(s) ?? new Set()).add(i.split));
    }
    expect([...sectionSplits.values()].every((s) => s.size === 1)).toBe(true);
  });

  it("map every checkbox to one of PRs #1-#7", () => {
    expect(new Set(itemsFile.items.map((i) => i.pr))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
  });
});

const ITEMS: Item[] = [
  { id: "a.1", text: "", pr: 1, split: "eval", optional: false, acceptableTypes: ["feature"] },
  { id: "a.2", text: "", pr: 1, split: "eval", optional: true, acceptableTypes: ["chore"] },
  { id: "b.1", text: "", pr: 2, split: "calibration", optional: false, acceptableTypes: ["feature"] },
  { id: "b.2", text: "", pr: 2, split: "calibration", optional: false, acceptableTypes: ["feature"] },
];

const extraction = (tickets: Extraction["tickets"]): Extraction => ({ tickets, out_of_scope: [] });

describe("coverage", () => {
  it("counts an item covered when any ticket cites it, per split", () => {
    const ex = extraction([ticket({ source_refs: ["a.1", "b.1"] })]);
    expect(coverage(ITEMS, ex, "eval")).toMatchObject({ n: 2, k: 1, missed: ["a.2"] });
    expect(coverage(ITEMS, ex, "calibration")).toMatchObject({ n: 2, k: 1, missed: ["b.2"] });
  });
});

describe("gradeTickets", () => {
  it("grades grouping, type and priority against the labels", () => {
    const grades = gradeTickets(
      ITEMS,
      extraction([
        ticket({ source_refs: ["a.1"], type: "feature", priority: "required" }),
        ticket({ source_refs: ["a.2"], type: "feature", priority: "required" }),
        ticket({ source_refs: ["a.1", "b.1"] }),
        ticket({ source_refs: ["x.9"] }),
      ]),
    );
    expect(grades.map((g) => g.split)).toEqual(["eval", "eval", "mixed", "none"]);
    expect(grades[0]!.correct).toEqual({ source_refs: true, type: true, priority: true });
    expect(grades[1]!.correct).toEqual({ source_refs: true, type: false, priority: false });
    expect(grades[2]!.correct.source_refs).toBe(false);
    expect(grades[3]!.correct.type).toBeNull();
    expect(fieldAccuracy(grades, "type", ["eval"])).toEqual({ n: 2, k: 1 });
  });
});

describe("calibrate", () => {
  const cal = (conf: "high" | "medium" | "low", correct: boolean) =>
    ticket({ source_refs: ["b.1"], type: correct ? "feature" : "docs", confidence: { ...HIGH, type: conf } });

  it("lowers a threshold only as far as observed precision allows", () => {
    const ex = extraction([cal("high", true), cal("high", true), cal("high", true), cal("medium", true), cal("low", false)]);
    const t = calibrate(gradeTickets(ITEMS, ex), DEFAULT_THRESHOLDS, 0.9, 3);
    expect(t.fields.type).toEqual({ min: "medium", accepted: 4, correct: 4 });
    expect(t.calibrated).toBe(true);
  });

  it("never lowers to a level nobody reported, and routes everything when no level is precise enough", () => {
    const allHigh = extraction([cal("high", true), cal("high", true), cal("high", true)]);
    expect(calibrate(gradeTickets(ITEMS, allHigh), DEFAULT_THRESHOLDS).fields.type.min).toBe("high");
    const bad = extraction([cal("high", false), cal("high", false), cal("high", true)]);
    expect(calibrate(gradeTickets(ITEMS, bad), DEFAULT_THRESHOLDS).fields.type.min).toBe("never");
  });

  it("ignores eval-split tickets", () => {
    const ex = extraction([ticket({ source_refs: ["a.1"], type: "docs", confidence: { ...HIGH, type: "low" } })]);
    expect(calibrate(gradeTickets(ITEMS, ex), DEFAULT_THRESHOLDS).fields.type).toEqual(DEFAULT_THRESHOLDS.fields.type);
  });
});

describe("buildReport", () => {
  it("produces a schema-valid report with a paired baseline", () => {
    const fixture = JSON.parse(readFileSync(path.join(here, "fixtures", "challenge-extraction.json"), "utf8")) as Extraction;
    const requirements = parseRequirements(loadBrief(path.join(here, "brief")));
    const run = { extraction: fixture, attempts: 1, firstViolations: [], finalViolations: [], inputTokens: 1000, outputTokens: 500 };
    const baseline = { ...run, extraction: { ...fixture, tickets: fixture.tickets.slice(0, 5) } };
    const report = buildReport({
      items: itemsFile.items,
      requirements,
      system: run,
      baseline,
      thresholds: DEFAULT_THRESHOLDS,
      model: "claude-opus-5-5",
      commit: "5410f93",
      date: "2026-09-26T00:00:00.000Z",
      wallSeconds: 1,
      partial: true,
      notes: "test",
    });
    expect(validateReport(report)).toEqual({ valid: true, errors: [] });
    expect(report).toMatchObject({ n: 26, successes: 26 });
    expect(report.baseline).toMatchObject({ paired: true, n: 26 });
    expect(report.baseline!.successes).toBeLessThan(26);
    expect(report.failures).toEqual([]);
  });
});
