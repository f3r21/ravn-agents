import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAP_DIR, MapError, assemble, mapStatus, plan, validateMap } from "./build.js";
import { readAreaMeta } from "./page.js";
import { sessionStartOutput } from "./session-start.js";
import { isFresh } from "./staleness.js";

let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", ["-C", repo, "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { encoding: "utf8" });
}

function put(path: string, content: string): void {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function commit(message: string): void {
  git("add", "-A");
  git("commit", "-q", "-m", message);
}

const lines = (n: number, prefix: string): string => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join("\n") + "\n";

function draftFor(slug: string, cite: string): string {
  return `## Summary\nThe ${slug} area. ${cite}\n\n## Key files\n- ${cite} — main file.\n\n## How it works\n- It works. ${cite}\n`;
}

function writeDrafts(drafts: Record<string, string>): void {
  for (const [slug, text] of Object.entries(drafts)) put(`${MAP_DIR}/.build/drafts/${slug}.md`, text);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "onboarding-test-"));
  git("init", "-q", "-b", "main");
  put("package.json", JSON.stringify({ name: "demo", scripts: { test: "vitest run" } }, null, 2) + "\n");
  put("api/handler.ts", "export function handler() {}\n" + lines(9, "//"));
  put("api/util.ts", lines(5, "//"));
  put("api/types.ts", lines(5, "//"));
  put("web/app.ts", "export const app = 1\n" + lines(19, "//"));
  put("web/view.ts", lines(5, "//"));
  put("web/style.ts", lines(5, "//"));
  commit("initial");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

function buildMap(): void {
  const planned = plan(repo, { refresh: false });
  writeDrafts({
    api: draftFor("api", "`api/handler.ts:1`"),
    web: draftFor("web", "`web/app.ts:1-20`"),
    root: draftFor("root", "`package.json:2`"),
  });
  expect(planned.toMap.map((a) => a.slug)).toEqual(["api", "root", "web"]);
  const result = assemble(repo);
  expect(result.areas.every((a) => a.status === "ok")).toBe(true);
}

describe("plan and assemble", () => {
  it("builds INDEX.md and one page per area, stamped with HEAD and a tree hash", () => {
    buildMap();
    const head = git("rev-parse", "HEAD").trim();
    const index = readFileSync(join(repo, MAP_DIR, "INDEX.md"), "utf8");
    expect(index).toContain(`built_at_sha: "${head}"`);
    expect(index).toContain("[api](areas/api.md)");
    expect(index.split("\n").length).toBeLessThan(200);
    const meta = readAreaMeta(readFileSync(join(repo, MAP_DIR, "areas/api.md"), "utf8"));
    expect(typeof meta).toBe("object");
    if (typeof meta === "object") {
      expect(meta.built_at_sha).toBe(head);
      expect(meta.tree_hash).toMatch(/^[0-9a-f]{40}$/);
      expect(meta.status).toBe("ok");
      expect(meta.summary).toBe("The api area.");
    }
    expect(readFileSync(join(repo, MAP_DIR, ".gitignore"), "utf8")).toBe(".build/\n");
    expect(validateMap(repo)).toEqual([]);
  });

  it("marks an area whose draft cites a line that does not exist as not covered, keeping only generated facts", () => {
    plan(repo, { refresh: false });
    writeDrafts({
      api: draftFor("api", "`api/handler.ts:99`"),
      web: draftFor("web", "`web/app.ts:1`"),
      root: draftFor("root", "`package.json:2`"),
    });
    const result = assemble(repo);
    const api = result.areas.find((a) => a.slug === "api");
    expect(api?.status).toBe("missing");
    expect(api?.errors[0]).toContain("`api/handler.ts:99`: file has only 10 lines");
    const page = readFileSync(join(repo, MAP_DIR, "areas/api.md"), "utf8");
    expect(page).toContain("Not covered by the map");
    expect(page).not.toContain("## How it works");
    expect(page).toContain("## Generated facts");
  });

  it("marks an area with no draft as not covered", () => {
    plan(repo, { refresh: false });
    writeDrafts({ web: draftFor("web", "`web/app.ts:1`"), root: draftFor("root", "`package.json:2`") });
    expect(assemble(repo).areas.find((a) => a.slug === "api")?.errors[0]).toMatch(/no draft was written/);
  });

  it("refuses to plan on a dirty tree, but ignores changes inside the map directory", () => {
    put("web/app.ts", "changed\n");
    expect(() => plan(repo, { refresh: false })).toThrow(MapError);
    git("checkout", "--", "web/app.ts");
    put(`${MAP_DIR}/scratch.md`, "x");
    expect(() => plan(repo, { refresh: false })).not.toThrow();
  });

  it("refuses to assemble when HEAD moved after the plan", () => {
    plan(repo, { refresh: false });
    put("web/new.ts", "x\n");
    commit("moved");
    expect(() => assemble(repo)).toThrow(/HEAD moved/);
  });
});

describe("staleness and refresh", () => {
  it("reports fresh right after a build, even once the map itself is committed", () => {
    buildMap();
    commit("add map");
    const report = mapStatus(repo);
    expect(report && isFresh(report)).toBe(true);
  });

  it("flags only the area whose files changed, and a page whose cited file in another area changed", () => {
    plan(repo, { refresh: false });
    writeDrafts({
      api: draftFor("api", "`api/handler.ts:1`"),
      web: draftFor("web", "`web/app.ts:1` `api/util.ts:2`"),
      root: draftFor("root", "`package.json:2`"),
    });
    assemble(repo);
    commit("add map");
    put("api/util.ts", lines(6, "#"));
    commit("change api");
    const report = mapStatus(repo);
    expect(report?.stale.map((s) => s.slug)).toEqual(["api", "web"]);
    expect(report?.stale[1]?.reasons[0]).toContain("cited files outside the area changed: api/util.ts");
  });

  it("refresh re-maps only stale and new areas and keeps the rest", () => {
    buildMap();
    commit("add map");
    put("web/app.ts", "export const app = 2\n" + lines(19, "//"));
    put("lib/a.ts", lines(3, "//"));
    put("lib/b.ts", lines(3, "//"));
    put("lib/c.ts", lines(3, "//"));
    commit("change web, add lib");
    const refresh = plan(repo, { refresh: true });
    expect(refresh.toMap.map((a) => a.slug)).toEqual(["lib", "web"]);
    expect(refresh.keep.sort()).toEqual(["api", "root"]);
    expect(refresh.toMap.find((a) => a.slug === "web")?.changedFiles).toEqual(["web/app.ts"]);
    writeDrafts({ lib: draftFor("lib", "`lib/a.ts:1`"), web: draftFor("web", "`web/app.ts:1`") });
    assemble(repo);
    commit("refresh map");
    const report = mapStatus(repo);
    expect(report && isFresh(report)).toBe(true);
    const index = readFileSync(join(repo, MAP_DIR, "INDEX.md"), "utf8");
    expect(index).toContain("[lib](areas/lib.md)");
  });

  it("refresh with nothing stale plans no work", () => {
    buildMap();
    commit("add map");
    const refresh = plan(repo, { refresh: true });
    expect(refresh.toMap).toEqual([]);
    expect(refresh.remove).toEqual([]);
  });
});

describe("sessionStartOutput", () => {
  it("is silent in a repository without a map", () => {
    expect(sessionStartOutput(repo)).toBeUndefined();
  });

  it("is silent outside a git repository", () => {
    const plain = mkdtempSync(join(tmpdir(), "onboarding-plain-"));
    try {
      expect(sessionStartOutput(plain)).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("adds context without a user message when fresh, and both when stale", () => {
    buildMap();
    commit("add map");
    expect(sessionStartOutput(repo)).toEqual({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: expect.stringContaining("is fresh") },
    });
    put("api/types.ts", "changed\n");
    commit("change api");
    const output = sessionStartOutput(repo) as { systemMessage?: string; hookSpecificOutput: { additionalContext: string } };
    expect(output.hookSpecificOutput.additionalContext).toContain("1 of 3 areas stale: api");
    expect(output.hookSpecificOutput.additionalContext).toContain("/ravn-agents:onboard --refresh");
    expect(output.systemMessage).toBe(output.hookSpecificOutput.additionalContext);
  });
});
