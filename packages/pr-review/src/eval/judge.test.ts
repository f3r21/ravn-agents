import { describe, expect, it } from "vitest";
import type { Item } from "./items.ts";
import { claudeJudge } from "./judge.ts";
import type { Proc } from "./run.ts";

describe("claudeJudge", () => {
  it("runs claude -p isolated from user settings and MCP config", async () => {
    const calls: string[][] = [];
    const proc: Proc = async (_cmd, args) => (calls.push(args), { code: 0, stdout: JSON.stringify({ structured_output: { reasoning: "same", match: true } }), stderr: "" });
    const judge = claudeJudge({ model: "claude-opus-5-5", rubricPath: new URL("../../evals/rubric.md", import.meta.url).pathname, cache: new Map(), proc });
    const defect = { path: "a.ts", startLine: 1, endLine: 2, side: "RIGHT" as const, description: "d", fixPr: 2 };
    const item = { id: "x#1", defects: [defect] } as unknown as Item;
    const f = { path: "a.ts", line: 1, severity: "high", title: "t", body: "b", fingerprint: "fp" } as never;
    expect(await judge(item, defect, f)).toEqual({ match: true, reason: "same" });
    expect(calls[0]).toEqual([
      "-p", "--model", "claude-opus-5-5", "--tools", "", "--json-schema", expect.any(String),
      "--output-format", "json", "--no-session-persistence", "--setting-sources", "local", "--strict-mcp-config",
    ]);
  });
});
