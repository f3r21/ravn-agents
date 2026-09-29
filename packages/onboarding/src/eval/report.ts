import { type ConfidenceInterval, wilson } from "@ravn-agents/eval-core";
import type { EvalItem } from "./items.js";
import type { RunMetrics } from "./transcript.js";

export type Condition = "map" | "baseline";

export interface TrialResult {
  itemId: string;
  condition: Condition;
  trial: number;
  answer: string;
  metrics: RunMetrics;
  pass: boolean;
  grader: "code" | "judge" | "error";
  detail: string;
  evidenceHit: boolean;
  transcript: string;
}

export interface ReportMeta {
  commit: string;
  date: string;
  datasetRef: string;
  repo: string;
  itemsPath: string;
  selection: string;
  rubricPath: string;
  judgeModel: string;
  answerModel: string;
  subagentModels: Record<string, string>;
  trialsPerItem: number;
  partial: boolean;
  pluginVersion?: string;
  claudeCodeVersion?: string;
  notes?: string;
  buildCost?: { usd?: number; wallSeconds?: number; inputTokens?: number; outputTokens?: number };
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return result;
}

/** Two-sided exact McNemar test on the discordant pairs (a binomial test at p = 0.5). */
export function mcnemarExact(mapOnly: number, baselineOnly: number): number {
  const n = mapOnly + baselineOnly;
  if (n === 0) return 1;
  const k = Math.min(mapOnly, baselineOnly);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += choose(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}

/** Failure-mode id (FAILURE-MODES.md) for a failed with-map trial. */
export function failureCategory(item: EvalItem, trial: TrialResult): string {
  if (trial.metrics.isError) return "F12";
  if (trial.grader === "error") return "F15";
  if (item.category === "stale") return "F1";
  if (item.category === "unanswerable") return "F11";
  return "F10";
}

/** pass^k: an item passes a condition only when every trial of it passed. */
export function itemPasses(trials: readonly TrialResult[]): boolean {
  return trials.length > 0 && trials.every((t) => t.pass);
}

function ci(successes: number, n: number): ConfidenceInterval {
  return wilson(successes, n);
}

function round(value: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Builds the shared eval report. Only items run under both conditions count, so the
 * comparison is paired; anything else is listed in the notes and marks the run partial.
 */
export function buildReport(items: readonly EvalItem[], results: readonly TrialResult[], meta: ReportMeta, humanGrades?: Record<string, boolean>): object {
  const byItem = new Map<string, { map: TrialResult[]; baseline: TrialResult[] }>();
  for (const r of results) {
    const entry = byItem.get(r.itemId) ?? { map: [], baseline: [] };
    entry[r.condition].push(r);
    byItem.set(r.itemId, entry);
  }
  const paired = items.filter((i) => {
    const e = byItem.get(i.id);
    return e !== undefined && e.map.length > 0 && e.baseline.length > 0;
  });
  if (paired.length === 0) throw new Error("no item has results for both conditions; nothing to report");
  const unpaired = items.filter((i) => !paired.includes(i)).map((i) => i.id);

  let mapPass = 0;
  let basePass = 0;
  let mapOnly = 0;
  let baseOnly = 0;
  const failures: object[] = [];
  const perCategory = new Map<string, { n: number; map: number; baseline: number }>();
  for (const item of paired) {
    const { map, baseline } = byItem.get(item.id) ?? { map: [], baseline: [] };
    const m = itemPasses(map);
    const b = itemPasses(baseline);
    if (m) mapPass++;
    if (b) basePass++;
    if (m && !b) mapOnly++;
    if (b && !m) baseOnly++;
    const cat = perCategory.get(item.category) ?? { n: 0, map: 0, baseline: 0 };
    cat.n++;
    if (m) cat.map++;
    if (b) cat.baseline++;
    perCategory.set(item.category, cat);
    const failed = map.find((t) => !t.pass);
    if (failed) {
      failures.push({
        itemId: item.id,
        category: failureCategory(item, failed),
        categoryDetail: `${item.category}; ${failed.grader}: ${failed.detail}`.slice(0, 500),
        expected: item.reference.answer,
        actual: failed.answer.slice(0, 1000) || "(no answer)",
        transcript: failed.transcript,
      });
    }
  }

  const n = paired.length;
  const mapTrials = results.filter((r) => r.condition === "map" && paired.some((i) => i.id === r.itemId));
  const baseTrials = results.filter((r) => r.condition === "baseline" && paired.some((i) => i.id === r.itemId));
  const secondary: object[] = [];
  const addMedian = (name: string, unit: string, pick: (m: RunMetrics) => number | undefined): void => {
    const mapValues = mapTrials.map((t) => pick(t.metrics)).filter((v): v is number => v !== undefined);
    const baseValues = baseTrials.map((t) => pick(t.metrics)).filter((v): v is number => v !== undefined);
    const value = median(mapValues);
    const baselineValue = median(baseValues);
    if (value === undefined) return;
    secondary.push({ name, value: round(value), unit, n: mapValues.length, ...(baselineValue === undefined ? {} : { baselineValue: round(baselineValue) }) });
  };
  addMedian("median_input_tokens_per_answer", "tokens", (m) => m.inputTokens);
  addMedian("median_output_tokens_per_answer", "tokens", (m) => m.outputTokens);
  addMedian("median_wall_seconds_per_answer", "seconds", (m) => m.wallSeconds);
  addMedian("median_tool_calls_per_answer", "calls", (m) => m.toolCalls);
  addMedian("median_cost_usd_per_answer", "usd", (m) => m.costUsd);
  const hits = mapTrials.filter((t) => t.evidenceHit).length;
  if (mapTrials.length > 0) {
    secondary.push({
      name: "evidence_file_hit_rate",
      value: round(hits / mapTrials.length),
      unit: "proportion",
      n: mapTrials.length,
      ci: ci(hits, mapTrials.length),
      baselineValue: round(baseTrials.filter((t) => t.evidenceHit).length / Math.max(1, baseTrials.length)),
    });
  }
  for (const [category, c] of [...perCategory].sort()) {
    secondary.push({ name: `accuracy_${category}`, value: round(c.map / c.n), unit: "proportion", n: c.n, baselineValue: round(c.baseline / c.n) });
  }
  if (meta.buildCost?.usd !== undefined) secondary.push({ name: "map_build_cost_usd", value: round(meta.buildCost.usd, 2), unit: "usd" });
  if (meta.buildCost?.wallSeconds !== undefined) secondary.push({ name: "map_build_wall_seconds", value: round(meta.buildCost.wallSeconds, 1), unit: "seconds" });

  const judged = mapTrials.filter((t) => t.grader === "judge" && t.trial === 1 && humanGrades?.[t.itemId] !== undefined);
  const humanAgreement =
    judged.length > 0 ? { n: judged.length, agreement: round(judged.filter((t) => humanGrades?.[t.itemId] === t.pass).length / judged.length) } : undefined;

  const allTrials = [...mapTrials, ...baseTrials];
  const sum = (pick: (m: RunMetrics) => number | undefined): number => allTrials.reduce((acc, t) => acc + (pick(t.metrics) ?? 0), 0);
  const pValue = mcnemarExact(mapOnly, baseOnly);
  const notes = [
    `Paired on ${n} items. Discordant pairs: map-only passes ${mapOnly}, baseline-only passes ${baseOnly}; exact McNemar p = ${round(pValue, 3)}.`,
    `Per-item pass is pass^${meta.trialsPerItem} (every trial must pass).`,
    unpaired.length > 0 ? `Not run under both conditions, excluded: ${unpaired.join(", ")}.` : "",
    judged.length === 0 ? "No human grades supplied yet; judge agreement not measured." : "",
    meta.notes ?? "",
  ]
    .filter((s) => s !== "")
    .join(" ");

  return {
    schemaVersion: "1.0",
    tool: "onboarding",
    metric: {
      name: "answer_accuracy_with_map",
      kind: "proportion",
      definition:
        "Share of frozen questions about ravn-task-management-challenge answered correctly (code grader for short values, calibrated judge for free text) by Claude Code using the ask-codebase skill and the codebase map, every trial passing.",
      higherIsBetter: true,
    },
    value: round(mapPass / n),
    n,
    successes: mapPass,
    trialsPerItem: meta.trialsPerItem,
    ci: ci(mapPass, n),
    baseline: {
      label: "plain Claude Code, same model and prompt, no map and no plugin",
      value: round(basePass / n),
      n,
      successes: basePass,
      ci: ci(basePass, n),
      paired: true,
      delta: round((mapPass - basePass) / n),
    },
    secondaryMetrics: secondary,
    failures,
    grader: {
      type: "mixed",
      judgeModel: meta.judgeModel,
      rubric: meta.rubricPath,
      ...(humanAgreement ? { humanAgreement } : {}),
    },
    model: { main: meta.answerModel, subagents: meta.subagentModels },
    commit: meta.commit,
    ...(meta.pluginVersion ? { pluginVersion: meta.pluginVersion } : {}),
    ...(meta.claudeCodeVersion ? { claudeCodeVersion: meta.claudeCodeVersion } : {}),
    date: meta.date,
    dataset: { repo: meta.repo, ref: meta.datasetRef, items: meta.itemsPath, selection: meta.selection },
    cost: {
      usd: round(sum((m) => m.costUsd) + (meta.buildCost?.usd ?? 0), 2),
      inputTokens: sum((m) => m.inputTokens) + (meta.buildCost?.inputTokens ?? 0),
      outputTokens: sum((m) => m.outputTokens) + (meta.buildCost?.outputTokens ?? 0),
      wallSeconds: round(sum((m) => m.wallSeconds) + (meta.buildCost?.wallSeconds ?? 0), 1),
    },
    partial: meta.partial || unpaired.length > 0,
    notes,
  };
}
