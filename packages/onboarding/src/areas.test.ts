import { describe, expect, it } from "vitest";
import { areaHash, detectAreas, filesInArea, matchesPattern } from "./areas.js";
import type { TreeEntry } from "./git.js";

const many = (dir: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${dir}/f${i}.ts`);

describe("matchesPattern", () => {
  it("distinguishes a directory, its direct children and an exact file", () => {
    expect(matchesPattern("src/a/b.ts", "src/")).toBe(true);
    expect(matchesPattern("src/a/b.ts", "src/*")).toBe(false);
    expect(matchesPattern("src/main.ts", "src/*")).toBe(true);
    expect(matchesPattern("package.json", "*")).toBe(true);
    expect(matchesPattern("src/main.ts", "*")).toBe(false);
    expect(matchesPattern("srcx/main.ts", "src/")).toBe(false);
    expect(matchesPattern("vite.config.ts", "vite.config.ts")).toBe(true);
  });
});

describe("detectAreas", () => {
  it("gives each top-level directory an area and folds root files and tiny directories into root", () => {
    const areas = detectAreas(["package.json", "README.md", "public/icon.svg", ...many("api", 3), ...many("docs", 4)]);
    expect(areas).toEqual([
      { slug: "api", title: "api", paths: ["api/"] },
      { slug: "docs", title: "docs", paths: ["docs/"] },
      { slug: "root", title: "Repository root", paths: ["*", "public/"] },
    ]);
  });

  it("splits a directory above maxFiles into its subdirectories plus a remainder", () => {
    const files = [...many("src/app", 30), ...many("src/features", 30), "src/main.tsx", "src/lib/one.ts"];
    const areas = detectAreas(files, { maxFiles: 50 });
    expect(areas.map((a) => [a.slug, a.paths])).toEqual([
      ["src", ["src/*", "src/lib/"]],
      ["src-app", ["src/app/"]],
      ["src-features", ["src/features/"]],
    ]);
  });

  it("stops splitting at maxDepth", () => {
    const files = [...many("a/b/c", 100)];
    const areas = detectAreas(files, { maxFiles: 10, maxDepth: 2 });
    expect(areas.map((a) => a.slug)).toEqual(["a-b"]);
  });

  it("leaves excluded prefixes out, so the map never maps itself", () => {
    const areas = detectAreas([...many("docs", 4), "docs/codebase-map/INDEX.md"], { exclude: ["docs/codebase-map"] });
    const docs = areas.find((a) => a.slug === "docs");
    expect(docs).toBeDefined();
    expect(filesInArea(["docs/codebase-map/INDEX.md", "docs/f0.ts"], docs?.paths ?? [], ["docs/codebase-map"])).toEqual(["docs/f0.ts"]);
  });

  it("is deterministic regardless of input order", () => {
    const files = [...many("x", 5), ...many("y", 5), "z.md"];
    expect(detectAreas([...files].reverse())).toEqual(detectAreas(files));
  });

  it("gives colliding slugs a numeric suffix", () => {
    const areas = detectAreas([...many(".github", 3), ...many("github", 3)]);
    expect(areas.map((a) => a.slug).sort()).toEqual(["github", "github-2"]);
  });
});

describe("areaHash", () => {
  const entry = (path: string, hash: string): TreeEntry => ({ mode: "100644", type: "blob", hash, path });
  const base = [entry("src/a.ts", "1"), entry("src/b.ts", "2"), entry("docs/x.md", "3")];

  it("changes when a file in the area changes and not when one outside does", () => {
    const before = areaHash(base, ["src/"]);
    expect(areaHash([entry("src/a.ts", "1"), entry("src/b.ts", "2"), entry("docs/x.md", "9")], ["src/"])).toBe(before);
    expect(areaHash([entry("src/a.ts", "1"), entry("src/b.ts", "7"), entry("docs/x.md", "3")], ["src/"])).not.toBe(before);
  });

  it("changes when a file is added or renamed", () => {
    const before = areaHash(base, ["src/"]);
    expect(areaHash([...base, entry("src/c.ts", "4")], ["src/"])).not.toBe(before);
    expect(areaHash([entry("src/z.ts", "1"), entry("src/b.ts", "2")], ["src/"])).not.toBe(before);
  });

  it("ignores excluded files, so committing the map does not make docs stale", () => {
    const before = areaHash(base, ["docs/"], ["docs/codebase-map"]);
    expect(areaHash([...base, entry("docs/codebase-map/INDEX.md", "5")], ["docs/"], ["docs/codebase-map"])).toBe(before);
  });
});
