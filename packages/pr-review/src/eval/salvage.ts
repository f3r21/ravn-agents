/**
 * Recovers coordinator runs whose draft.json Write was denied by the harness. The denied Write's
 * content survives in the transcript's permission_denials, so the draft is written where the
 * coordinator meant to write it and finalized offline. Never calls claude or the network.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ReviewError } from "../errors.ts";
import { finalize } from "../pipeline.ts";
import type { Draft } from "../types.ts";
import type { VariantResult } from "./items.ts";

interface Denial {
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string };
}

/** The content of the last denied Write to a draft.json, or null when the transcript holds none. */
export function deniedDraft(transcript: string): string | null {
  let parsed: { permission_denials?: Denial[] };
  try {
    parsed = JSON.parse(transcript);
  } catch {
    return null;
  }
  const writes = (parsed.permission_denials ?? []).filter(
    (d) => d.tool_name === "Write" && d.tool_input?.file_path?.endsWith("draft.json") && typeof d.tool_input.content === "string",
  );
  return writes.at(-1)?.tool_input?.content ?? null;
}

export type SalvageOutcome = "skipped-ok" | "no-draft" | "salvaged" | "invalid-draft" | "error";

export function salvageItem(itemDir: string): { outcome: SalvageOutcome; detail: string } {
  const resultPath = join(itemDir, "coordinator.json");
  const res = JSON.parse(readFileSync(resultPath, "utf8")) as VariantResult;
  if (res.ok) return { outcome: "skipped-ok", detail: "already ok" };
  if (!res.transcript || !existsSync(res.transcript)) return { outcome: "no-draft", detail: "no transcript" };
  const content = deniedDraft(readFileSync(res.transcript, "utf8"));
  if (content === null) return { outcome: "no-draft", detail: "no denied draft.json Write in the transcript" };

  const runDir = join(itemDir, "coordinator-run");
  writeFileSync(join(runDir, "draft.json"), content);
  const failed = (error: string) => {
    writeFileSync(resultPath, JSON.stringify({ ...res, failure: "invalid-draft", error }, null, 2));
    return { outcome: "invalid-draft" as const, detail: error };
  };
  let out: ReturnType<typeof finalize>;
  try {
    out = finalize(runDir);
  } catch (err) {
    if (err instanceof ReviewError && err.kind === "invalid_draft") return failed(err.message);
    return { outcome: "error", detail: (err as Error).message };
  }
  if (!out.ok || !out.routing) return failed(out.errors.join("; "));

  const draft = JSON.parse(content) as Draft;
  const fixed: VariantResult = {
    itemId: res.itemId, variant: res.variant, ok: true,
    routing: out.routing,
    selection: { ran: draft.selection.ran, mode: draft.mode },
    costUsd: res.costUsd, inputTokens: res.inputTokens, outputTokens: res.outputTokens,
    wallSeconds: res.wallSeconds, transcript: res.transcript,
    salvaged: true,
  };
  writeFileSync(resultPath, JSON.stringify(fixed, null, 2));
  return { outcome: "salvaged", detail: `${out.routing.inline.length} inline, ${out.routing.summary.length} in summary` };
}

/** Salvages every coordinator result under a run directory; returns one line per item. */
export function salvageRun(runDir: string): { item: string; outcome: SalvageOutcome; detail: string }[] {
  const out = [];
  for (const d of readdirSync(runDir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === "checkouts" || !existsSync(join(runDir, d.name, "coordinator.json"))) continue;
    out.push({ item: d.name, ...salvageItem(join(runDir, d.name)) });
  }
  return out;
}
