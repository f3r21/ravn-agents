import { describe, expect, it } from "vitest";
import { parseDiff } from "./diff.ts";
import { anchorProblem, demoteInline, fingerprint, fingerprintsIn, marker, route } from "./policy.ts";
import { DIFF, draft, finding } from "./test/fixtures.ts";

const files = parseDiff(DIFF).filter((f) => f.path.startsWith("src/"));

describe("route", () => {
  it("posts verified high and critical findings inline", () => {
    const r = route(draft([finding(), finding({ id: "c-2", severity: "critical", line: 43, title: "Other" })]), files);
    expect(r.inline.map((f) => f.id)).toEqual(["c-2", "correctness-1"]);
    expect(r.summary).toEqual([]);
  });

  it("sends verified medium and low findings to the summary", () => {
    const r = route(draft([finding({ severity: "medium" }), finding({ id: "c-2", severity: "low", title: "Nit" })]), files);
    expect(r.inline).toEqual([]);
    expect(r.summary.map((f) => f.id)).toEqual(["correctness-1", "c-2"]);
  });

  it("never shows rejected or uncertain findings, whatever their severity", () => {
    const r = route(
      draft([
        finding({ severity: "critical", verification: { verdict: "rejected", evidence: [], reason: "guarded" } }),
        finding({ id: "c-2", title: "b", verification: { verdict: "uncertain", evidence: [], reason: "?" } }),
      ]),
      files,
    );
    expect(r.inline).toEqual([]);
    expect(r.summary).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual(["verifier: rejected", "verifier: uncertain"]);
  });

  it("drops everything when the verifier failed", () => {
    const r = route(draft([finding()], { verifier: { status: "failed", model: "claude-opus-5-5", error: "timeout" } }), files);
    expect(r.inline).toEqual([]);
    expect(r.dropped[0]!.reason).toMatch(/verifier failed/);
  });

  it("moves a high finding whose line is outside the diff to the summary, with the reason", () => {
    const r = route(draft([finding({ line: 25 })]), files);
    expect(r.inline).toEqual([]);
    expect(r.summary[0]!.body).toMatch(/not shown in the diff/);
  });

  it("skips findings already posted on the PR and duplicates within the run", () => {
    const f = finding();
    const r = route(draft([f, finding({ id: "dup", severity: "medium" })]), files, [fingerprint(f)]);
    expect(r.inline).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual(["already posted on this PR", "duplicate of a higher-ranked finding"]);
  });
});

describe("anchorProblem", () => {
  const byPath = new Map(files.map((f) => [f.path, f]));
  it("accepts a deleted line on the LEFT side", () => {
    expect(anchorProblem(finding({ line: 11, side: "LEFT" }), byPath)).toBeNull();
  });
  it("rejects a range that spans two hunks", () => {
    expect(anchorProblem(finding({ startLine: 12, line: 43 }), byPath)).toMatch(/more than one hunk/);
  });
  it("rejects a file outside the diff", () => {
    expect(anchorProblem(finding({ path: "src/elsewhere.ts" }), byPath)).toMatch(/not part of the reviewed diff/);
  });
});

describe("fingerprints", () => {
  it("ignore line numbers and title formatting, so a re-run recognises its own comments", () => {
    const a = fingerprint(finding({ line: 12, title: "Toggle reads a `stale` open value" }));
    const b = fingerprint(finding({ line: 40, title: "toggle reads a stale  open value" }));
    expect(a).toBe(b);
  });
  it("round-trip through the HTML marker", () => {
    expect(fingerprintsIn([`text ${marker(["abc123abc123", "def456def456"])}`, "no marker"])).toEqual(["abc123abc123", "def456def456"]);
  });
});

describe("demoteInline", () => {
  it("keeps every finding, moving inline ones into the summary", () => {
    const r = demoteInline(route(draft([finding()]), files), "GitHub rejected the line anchor");
    expect(r.inline).toEqual([]);
    expect(r.summary).toHaveLength(1);
    expect(r.summary[0]!.body).toMatch(/GitHub rejected the line anchor/);
  });
});
