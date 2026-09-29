import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateReport } from "./report.js";

const example = JSON.parse(
  readFileSync(new URL("../../../schemas/eval-report.example.json", import.meta.url), "utf8"),
);

describe("validateReport", () => {
  it("accepts the reference example", () => {
    expect(validateReport(example)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a proportion without successes", () => {
    const { successes: _dropped, ...report } = example;
    const result = validateReport(report);
    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/successes/);
  });
});
