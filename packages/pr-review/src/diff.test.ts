import { describe, expect, it } from "vitest";
import { addedLines, annotate, commentableLines, exclusionReason, parseDiff } from "./diff.ts";
import { DIFF } from "./test/fixtures.ts";

describe("parseDiff", () => {
  const files = parseDiff(DIFF);

  it("finds every file with its status", () => {
    expect(files.map((f) => [f.path, f.status])).toEqual([
      ["src/task-table.tsx", "modified"],
      ["package-lock.json", "modified"],
      ["src/new-file.ts", "added"],
      ["src/old.ts", "deleted"],
      ["assets/logo.png", "modified"],
    ]);
    expect(files[4]!.binary).toBe(true);
  });

  it("numbers lines on both sides across hunks", () => {
    const t = files[0]!;
    expect([...addedLines(t)]).toEqual([11, 12, 43]);
    const { RIGHT, LEFT } = commentableLines(t);
    expect(RIGHT.has(13)).toBe(true); // context line after the additions
    expect(RIGHT.has(20)).toBe(false); // between hunks
    expect(LEFT.has(11)).toBe(true); // the deleted line
    expect(LEFT.has(43)).toBe(false);
  });

  it("keeps the old path for a deleted file", () => {
    expect(files[3]!.path).toBe("src/old.ts");
    expect(commentableLines(files[3]!).LEFT.has(1)).toBe(true);
  });
});

describe("exclusionReason", () => {
  const files = parseDiff(DIFF);
  it("skips lockfiles, deleted files and binaries, and keeps source", () => {
    expect(files.map(exclusionReason)).toEqual([null, "lockfile", null, "file deleted", "binary file"]);
  });
});

describe("annotate", () => {
  it("prints base and head line numbers next to each line", () => {
    const text = annotate(parseDiff(DIFF)[0]!);
    expect(text).toContain("### src/task-table.tsx (modified)");
    expect(text).toMatch(/^\s+11\s+-\s+const open = true;$/m);
    expect(text).toMatch(/^\s+12 \+\s+const toggle/m);
    expect(text).toMatch(/^\s+12\s+13\s+return \($/m);
  });
});
