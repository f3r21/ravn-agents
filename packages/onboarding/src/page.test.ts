import { describe, expect, it } from "vitest";
import { type AreaPageMeta, parseFrontmatter, proseOf, readAreaMeta, renderAreaPage, renderIndex } from "./page.js";

const meta: AreaPageMeta = {
  area: "src-app",
  title: "src/app",
  paths: ["src/app/"],
  tree_hash: "a".repeat(40),
  built_at_sha: "b".repeat(40),
  built_at: "2026-09-26T12:00:00.000Z",
  status: "ok",
  summary: 'Routes and "providers".',
  generator: "test",
};

describe("frontmatter", () => {
  it("round-trips through render and parse, including quotes and arrays", () => {
    const page = renderAreaPage(meta, "## Summary\nx `a.ts:1`\n", "## Generated facts\n\n- f\n");
    expect(readAreaMeta(page)).toEqual(meta);
    expect(parseFrontmatter(page).body.trimStart().startsWith("# src/app")).toBe(true);
  });

  it("explains what is wrong with an incomplete page", () => {
    expect(readAreaMeta("---\narea: \"x\"\n---\n")).toMatch(/missing one of/);
    expect(readAreaMeta("no frontmatter")).toMatch(/missing one of/);
  });
});

describe("renderAreaPage", () => {
  it("puts the prose before the generated facts, and proseOf separates them", () => {
    const page = renderAreaPage(meta, "## Summary\nx `a.ts:1`\n", "## Generated facts\n\n- f\n");
    const body = parseFrontmatter(page).body;
    expect(body.indexOf("## Summary")).toBeLessThan(body.indexOf("## Generated facts"));
    expect(proseOf(body)).not.toContain("Generated facts");
  });

  it("omits prose and states the reason when the area is not covered", () => {
    const page = renderAreaPage({ ...meta, status: "missing", reason: "draft rejected" }, "## Summary\nx\n", "## Generated facts\n");
    expect(page).toContain("**Not covered by the map:** draft rejected");
    expect(page).not.toContain("## Summary");
  });
});

describe("renderIndex", () => {
  const indexMeta = { built_at_sha: "c".repeat(40), built_at: "2026-09-26T12:00:00.000Z", areas: 1, generator: "test" };
  const area = { slug: "src-app", title: "src/app", paths: ["src/app/"], status: "ok" as const, summary: "a | b", builtAtSha: "d".repeat(40) };

  it("lists each area with its page link, escapes table pipes and marks older per-area stamps", () => {
    const text = renderIndex(indexMeta, [area], { scripts: [{ name: "test", command: "vitest", where: "package.json:5" }], entryPoints: [] });
    expect(text).toContain("| src/app | `src/app/` | a \\| b | [src-app](areas/src-app.md) (built at `ddddddd`) |");
    expect(text).toContain("- `test`: `vitest` `package.json:5`");
  });

  it("fails the build rather than truncating when the index would pass 200 lines", () => {
    const areas = Array.from({ length: 200 }, (_, i) => ({ ...area, slug: `a${i}` }));
    expect(() => renderIndex(indexMeta, areas, { scripts: [], entryPoints: [] })).toThrow(/budget is 200/);
  });
});
