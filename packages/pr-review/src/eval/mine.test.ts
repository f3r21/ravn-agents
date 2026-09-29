import { describe, expect, it } from "vitest";
import { fixCandidates, isFixTitle, isSourcePath, mentionedPrs, parseBlame, type MergedPr } from "./mine.ts";

describe("candidate filters", () => {
  it("recognises fix titles and ignores feature titles", () => {
    expect(isFixTitle("fix(task-table): wire up the chevron")).toBe(true);
    expect(isFixTitle("fix!: repaint the form surface")).toBe(true);
    expect(isFixTitle("feat(card): sub-components")).toBe(false);
  });

  it("keeps source files and drops docs, tests, lockfiles and tool config", () => {
    expect(isSourcePath("src/components/card/task-table.tsx")).toBe(true);
    expect(isSourcePath("scripts/figure-audit.mjs")).toBe(true);
    expect(isSourcePath(".github/workflows/ci.yml")).toBe(true);
    for (const p of ["CHANGELOG.md", "src/a.test.tsx", "scripts/x.test.mjs", "package-lock.json", "vitest.config.ts", "docs/x.ts"]) {
      expect(isSourcePath(p)).toBe(false);
    }
  });

  it("skips promotion and dependabot PRs unless named by hand", () => {
    const pr = (number: number, title: string, headRefName: string): MergedPr => ({ number, title, body: "", headRefName, baseRefName: "main", mergedAt: "", mergeCommit: null });
    const merged = [pr(1, "fix: a", "fix/a"), pr(2, "fix: promote", "dev"), pr(3, "feat: restore x removed by accident", "feat/x")];
    expect(fixCandidates(merged).map((p) => p.number)).toEqual([1]);
    expect(fixCandidates(merged, [3]).map((p) => p.number)).toEqual([1, 3]);
  });
});

describe("parseBlame", () => {
  it("reads commit, original line and text from --line-porcelain output", () => {
    const sha = "9cba7465511cdf2a169c3d5a762d034ecc855455";
    const out = `${sha} 88 91 1\nauthor f3r\nsummary x\nfilename scripts/figure-audit.mjs\n\tif (cmd.includes('|')) return true;\n`;
    expect(parseBlame(out)).toEqual([{ commit: sha, origLine: 88, text: "if (cmd.includes('|')) return true;" }]);
  });
});

describe("mentionedPrs", () => {
  it("collects #N references once, in order", () => {
    expect(mentionedPrs("restore the mode #19 removed (#93), see #19 and kit#141")).toEqual([19, 93]);
  });
});
