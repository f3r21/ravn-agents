/** The model judge: "is this finding the same defect as the ground truth?", run only on pairs the line-overlap pre-filter passed. */

import { readFileSync } from "node:fs";
import type { Judge, JudgeRecord } from "./grade.ts";
import { judgeKey } from "./grade.ts";
import { parseClaudeResult, spawnProc, type Proc } from "./run.ts";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reasoning", "match"],
  properties: { reasoning: { type: "string" }, match: { type: "boolean" } },
};

export function judgePrompt(rubric: string, defect: string, location: string, finding: string): string {
  return `${rubric}\n\n<ground_truth location="${location}">\n${defect}\n</ground_truth>\n\n<finding>\n${finding}\n</finding>`;
}

/**
 * Judge backed by `claude -p` with structured output. Decisions are cached by key so a re-grade
 * does not pay twice and a human label always refers to one stored decision.
 */
export function claudeJudge(opts: { model: string; rubricPath: string; cache: Map<string, JudgeRecord>; proc?: Proc }): Judge {
  const proc = opts.proc ?? spawnProc;
  const rubric = readFileSync(opts.rubricPath, "utf8");
  return async (item, defect, f) => {
    const key = judgeKey(item.id, item.defects.indexOf(defect), f.fingerprint);
    const hit = opts.cache.get(key);
    if (hit) return { match: hit.match, reason: hit.reason };
    const prompt = judgePrompt(rubric, defect.description, `${defect.path}:${defect.startLine}-${defect.endLine}`, `${f.path}:${f.line} [${f.severity}] ${f.title}\n${f.body}`);
    const res = await proc("claude", ["-p", "--model", opts.model, "--tools", "", "--json-schema", JSON.stringify(SCHEMA), "--output-format", "json", "--no-session-persistence", "--setting-sources", "local", "--strict-mcp-config"], {
      input: prompt,
      timeoutMs: 180_000,
    });
    const parsed = parseClaudeResult(res.stdout);
    const out = (parsed?.structured_output ?? (parsed?.result ? JSON.parse(parsed.result) : null)) as { match?: boolean; reasoning?: string } | null;
    if (res.code !== 0 || typeof out?.match !== "boolean") {
      throw new Error(`judge failed for ${key}: ${res.stderr.slice(-300)}`);
    }
    return { match: out.match, reason: out.reasoning ?? "" };
  };
}
