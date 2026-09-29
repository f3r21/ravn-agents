import { describe, expect, it } from "vitest";
import { checkShape } from "./ticket-schema.ts";
import { APPROVAL, DARK_MODE, REQUIREMENTS, ticket } from "./test-fixtures.ts";
import { reasonsByTicket, validateExtraction } from "./validate.ts";

const rules = (tickets = [ticket(), APPROVAL, DARK_MODE], outOfScope: { ref: string; reason: string }[] = [], labels?: string[]) =>
  validateExtraction({ tickets, out_of_scope: outOfScope }, REQUIREMENTS, { repoLabels: labels }).violations.map((v) => v.rule);

describe("validateExtraction", () => {
  it("accepts a clean batch", () => {
    expect(rules()).toEqual([]);
  });

  it("rejects ids that are not in the brief", () => {
    expect(rules([ticket({ source_refs: ["toolbar.1", "toolbar.9"] }), APPROVAL, DARK_MODE])).toContain("unknown-ref");
  });

  it("reports requirements neither ticketed nor excluded", () => {
    const report = validateExtraction({ tickets: [ticket(), APPROVAL], out_of_scope: [] }, REQUIREMENTS);
    expect(report.uncovered).toEqual(["extras.1"]);
    expect(validateExtraction({ tickets: [ticket(), APPROVAL], out_of_scope: [{ ref: "extras.1", reason: "later" }] }, REQUIREMENTS).uncovered).toEqual([]);
  });

  it("flags criteria that share no terms with the cited requirement", () => {
    const invented = ticket({ acceptance_criteria: ["The toolbar shows the export icon.", "Payments settle within one hour."] });
    expect(rules([invented, APPROVAL, DARK_MODE])).toEqual(["ungrounded-criterion"]);
  });

  it("flags a priority that contradicts the brief", () => {
    expect(rules([ticket({ priority: "optional" }), APPROVAL, DARK_MODE])).toEqual(["priority-mismatch"]);
    expect(rules([ticket(), APPROVAL, { ...DARK_MODE, priority: "required" }])).toEqual(["priority-mismatch"]);
  });

  it("flags near-duplicate titles but allows splitting one requirement", () => {
    expect(rules([ticket(), { ...ticket(), title: "Add the export and print icons to toolbar" }, APPROVAL, DARK_MODE])).toContain(
      "duplicate-ticket",
    );
    const email = { ...APPROVAL, title: "Email the requester the approval result", acceptance_criteria: ["The requester gets an approval email."] };
    expect(rules([ticket(), APPROVAL, email, DARK_MODE])).toEqual([]);
  });

  it("requires type_detail for type other and non-empty criteria", () => {
    expect(rules([ticket({ type: "other" }), APPROVAL, DARK_MODE])).toEqual(["type-detail"]);
    expect(rules([ticket({ acceptance_criteria: [] }), APPROVAL, DARK_MODE])).toEqual(["empty-criteria"]);
  });

  it("checks labels against the repository's label set only when given", () => {
    const labelled = ticket({ labels: ["ui", "made-up"] });
    expect(rules([labelled, APPROVAL, DARK_MODE])).toEqual([]);
    expect(rules([labelled, APPROVAL, DARK_MODE], [], ["UI", "bug"])).toEqual(["unknown-label"]);
  });

  it("flags out-of-scope entries that are unknown or also cited", () => {
    expect(rules(undefined, [{ ref: "nope.1", reason: "x" }, { ref: "toolbar.1", reason: "y" }])).toEqual([
      "unknown-out-of-scope-ref",
      "cited-and-excluded",
    ]);
  });

  it("groups ticket findings as review reasons", () => {
    const report = validateExtraction({ tickets: [ticket({ type: "other" }), APPROVAL, DARK_MODE], out_of_scope: [] }, REQUIREMENTS);
    expect(reasonsByTicket(report, 3)[0]).toEqual([expect.stringMatching(/^type-detail:/)]);
    expect(reasonsByTicket(report, 3)[1]).toEqual([]);
  });
});

describe("checkShape", () => {
  it("accepts a valid extraction and names the failing path otherwise", () => {
    expect(checkShape({ tickets: [ticket()], out_of_scope: [] }).ok).toBe(true);
    const bad = checkShape({ tickets: [{ ...ticket(), confidence: { ...ticket().confidence, type: "certain" } }], out_of_scope: [] });
    expect(bad.ok).toBe(false);
    expect(bad.ok ? [] : bad.errors.join()).toMatch(/\/tickets\/0\/confidence\/type/);
  });

  it("rejects extra properties", () => {
    expect(checkShape({ tickets: [], out_of_scope: [], notes: "x" }).ok).toBe(false);
  });
});
