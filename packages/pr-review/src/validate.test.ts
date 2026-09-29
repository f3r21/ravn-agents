import { describe, expect, it } from "vitest";
import { validateDraft } from "./validate.ts";
import { draft, finding } from "./test/fixtures.ts";

describe("validateDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateDraft(draft([finding()]))).toMatchObject({ ok: true, errors: [] });
  });

  it("names each broken field so the coordinator can fix it", () => {
    const bad = draft([finding({ severity: "urgent" as never, line: 0, side: "BOTH" as never })]);
    const { ok, errors } = validateDraft(bad);
    expect(ok).toBe(false);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/findings\[0\]\.severity/),
        expect.stringMatching(/findings\[0\]\.line/),
        expect.stringMatching(/findings\[0\]\.side/),
      ]),
    );
  });

  it("requires evidence for a confirmed finding", () => {
    const { errors } = validateDraft(draft([finding({ verification: { verdict: "confirmed", evidence: [], reason: "trust me" } })]));
    expect(errors.join()).toMatch(/cite at least one path:line/);
  });

  it("requires a failed finder to say what failed", () => {
    const { errors } = validateDraft(draft([], { finders: [{ category: "security", status: "failed", files: [] }] }));
    expect(errors.join()).toMatch(/finders\[0\]\.error/);
  });

  it("rejects duplicate ids and non-objects", () => {
    expect(validateDraft(draft([finding(), finding()])).errors.join()).toMatch(/duplicate finding id/);
    expect(validateDraft("[]").ok).toBe(false);
  });
});
