import { describe, expect, it } from "vitest";
import { checkCitations, countLines, parseCitations } from "./citations.js";

describe("parseCitations", () => {
  it("reads single lines and ranges written as inline code", () => {
    expect(parseCitations("see `src/a.ts:12` and `./src/b.tsx:3-9`")).toEqual([
      { raw: "`src/a.ts:12`", path: "src/a.ts", start: 12, end: 12 },
      { raw: "`./src/b.tsx:3-9`", path: "src/b.tsx", start: 3, end: 9 },
    ]);
  });

  it("ignores plain paths, script names and URLs with ports", () => {
    expect(parseCitations("`src/a.ts` `format:check` `http://localhost:5173` src/a.ts:4")).toEqual([]);
  });
});

describe("countLines", () => {
  it("does not count the empty string after a trailing newline", () => {
    expect(countLines("a\nb\n")).toBe(2);
    expect(countLines("a\nb")).toBe(2);
    expect(countLines("")).toBe(0);
  });
});

describe("checkCitations", () => {
  const lines = (path: string): number | undefined => ({ "src/a.ts": 10 })[path];

  it("accepts citations inside the file", () => {
    expect(checkCitations(parseCitations("`src/a.ts:1` `src/a.ts:3-10`"), lines)).toEqual([]);
  });

  it("rejects a missing file, a line past the end, a reversed range and line zero", () => {
    const errors = checkCitations(parseCitations("`src/nope.ts:1` `src/a.ts:11` `src/a.ts:8-4` `src/a.ts:0`"), lines);
    expect(errors).toEqual([
      "`src/nope.ts:1`: file does not exist at the stamped SHA",
      "`src/a.ts:11`: file has only 10 lines",
      "`src/a.ts:8-4`: range ends before it starts",
      "`src/a.ts:0`: line numbers start at 1",
    ]);
  });
});
