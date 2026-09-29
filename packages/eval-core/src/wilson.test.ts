import { describe, expect, it } from "vitest";
import { wilson } from "./wilson.js";

describe("wilson", () => {
  it("matches the reference interval for 12/20", () => {
    const ci = wilson(12, 20);
    expect(ci.lower).toBeCloseTo(0.387, 3);
    expect(ci.upper).toBeCloseTo(0.781, 3);
    expect(ci).toMatchObject({ method: "wilson", level: 0.95 });
  });

  it("stays inside [0, 1] at the extremes", () => {
    expect(wilson(0, 10).lower).toBe(0);
    expect(wilson(10, 10).upper).toBeCloseTo(1, 10);
  });

  it("rejects impossible counts", () => {
    expect(() => wilson(5, 0)).toThrow();
    expect(() => wilson(6, 5)).toThrow();
  });
});
