import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIFF, draft, finding } from "../test/fixtures.ts";
import type { PrContext } from "../types.ts";
import type { VariantResult } from "./items.ts";
import { deniedDraft, salvageRun } from "./salvage.ts";

const context: PrContext = {
  repo: "o/r", number: 7, title: "Collapsible table", body: "", author: "dev", url: "https://github.com/o/r/pull/7",
  baseSha: "b".repeat(40), headSha: "a".repeat(40), headRef: "feat/x", state: "OPEN",
  files: [{ path: "src/task-table.tsx", status: "modified", additions: 3, deletions: 1, patch: "files/1.patch" }],
  excluded: [], claudeMd: null, priorFingerprints: [], priorComments: [], diffSource: "diff", localCheckout: null,
};

const denial = (file_path: string, content: string) => ({ tool_name: "Write", tool_use_id: "t", tool_input: { file_path, content } });

/** One failed coordinator item: its run dir as prepare leaves it, plus the recorded result and transcript. */
function failedItem(runDir: string, name: string, denials: unknown[]): string {
  const itemDir = join(runDir, name);
  const rd = join(itemDir, "coordinator-run");
  mkdirSync(rd, { recursive: true });
  writeFileSync(join(rd, "context.json"), JSON.stringify(context));
  writeFileSync(join(rd, "diff.patch"), DIFF);
  const transcript = join(itemDir, "coordinator.transcript.json");
  writeFileSync(transcript, JSON.stringify({ type: "result", subtype: "success", total_cost_usd: 2.5, permission_denials: denials }));
  const res: VariantResult = {
    itemId: name, variant: "coordinator", ok: false, failure: "run-failed", error: "no routing", routing: null,
    costUsd: 2.5, inputTokens: 1000, outputTokens: 200, wallSeconds: 300, transcript,
  };
  writeFileSync(join(itemDir, "coordinator.json"), JSON.stringify(res));
  return itemDir;
}

const read = (itemDir: string) => JSON.parse(readFileSync(join(itemDir, "coordinator.json"), "utf8")) as VariantResult;

describe("deniedDraft", () => {
  it("takes the last denied Write to a draft.json and ignores other tools and files", () => {
    const t = JSON.stringify({
      permission_denials: [
        denial("/r/draft.json", "first"),
        denial("/r/notes.md", "other"),
        { tool_name: "Bash", tool_input: { command: "cat > draft.json" } },
        denial("/r/draft.json", "last"),
      ],
    });
    expect(deniedDraft(t)).toBe("last");
    expect(deniedDraft(JSON.stringify({ permission_denials: [] }))).toBeNull();
    expect(deniedDraft("not json")).toBeNull();
  });
});

describe("salvageRun", () => {
  it("finalizes a valid draft, records an invalid one, and leaves items without a denial untouched", () => {
    const runDir = mkdtempSync(join(tmpdir(), "pr-review-salvage-"));
    const valid = failedItem(runDir, "valid", [denial("/x/draft.json", "{}"), denial("/x/coordinator-run/draft.json", JSON.stringify(draft([finding()])))]);
    const invalid = failedItem(runDir, "invalid", [denial("/x/draft.json", JSON.stringify({ schemaVersion: 1 }))]);
    const none = failedItem(runDir, "none", []);
    const noneBefore = readFileSync(join(none, "coordinator.json"), "utf8");

    const lines = salvageRun(runDir);
    expect(Object.fromEntries(lines.map((l) => [l.item, l.outcome]))).toEqual({ valid: "salvaged", invalid: "invalid-draft", none: "no-draft" });

    const v = read(valid);
    expect(v).toMatchObject({
      ok: true, salvaged: true, selection: { ran: ["correctness"], mode: "routed" },
      costUsd: 2.5, inputTokens: 1000, outputTokens: 200, wallSeconds: 300, transcript: join(valid, "coordinator.transcript.json"),
    });
    expect(v.routing!.inline).toHaveLength(1);
    expect(v.failure).toBeUndefined();
    expect(readFileSync(join(valid, "coordinator-run", "routing.json"), "utf8")).toContain("src/task-table.tsx");

    const i = read(invalid);
    expect(i).toMatchObject({ ok: false, failure: "invalid-draft", costUsd: 2.5 });
    expect(i.error).toMatch(/\w/);
    expect(readFileSync(join(none, "coordinator.json"), "utf8")).toBe(noneBefore);

    // Idempotent: a second pass skips the salvaged item and changes nothing.
    const after = readFileSync(join(valid, "coordinator.json"), "utf8");
    expect(salvageRun(runDir).find((l) => l.item === "valid")!.outcome).toBe("skipped-ok");
    expect(readFileSync(join(valid, "coordinator.json"), "utf8")).toBe(after);
  });
});
