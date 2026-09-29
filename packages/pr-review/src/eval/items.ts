/** The frozen eval item list (evals/items.json) and the per-run result records. */

import { readFileSync } from "node:fs";
import type { Routing } from "../types.ts";

export interface Defect {
  path: string;
  /** Line range at the inducing PR's head commit. */
  startLine: number;
  endLine: number;
  side: "RIGHT" | "LEFT";
  description: string;
  fixPr: number;
}

export interface Item {
  id: string;
  repo: string;
  pr: number;
  kind: "bug" | "clean";
  headSha: string;
  mergedAt: string;
  title: string;
  changedLines: number;
  defects: Defect[];
  labelConfidence: "high" | "medium" | "low";
  evidence: string;
  confirmed: boolean;
  confirmedBy: string | null;
}

export interface ItemFile {
  schemaVersion: 1;
  frozenAt: string;
  selection: string;
  items: Item[];
}

export function loadItems(path: string): ItemFile {
  const file = JSON.parse(readFileSync(path, "utf8")) as ItemFile;
  if (file.schemaVersion !== 1 || !Array.isArray(file.items)) throw new Error(`${path} is not an items file`);
  for (const it of file.items) {
    if (it.kind === "bug" && it.defects.length === 0) throw new Error(`${it.id}: a bug item needs at least one defect`);
    if (it.kind === "clean" && it.defects.length > 0) throw new Error(`${it.id}: a clean item has no defects`);
  }
  return file;
}

/** Items a run uses: confirmed ones, unless unconfirmed are requested (smoke runs only). */
export function selectItems(file: ItemFile, opts: { includeUnconfirmed?: boolean; only?: string[]; limit?: number }): Item[] {
  let items = file.items.filter((i) => opts.includeUnconfirmed || i.confirmed);
  if (opts.only?.length) items = items.filter((i) => opts.only!.includes(i.id));
  return opts.limit ? items.slice(0, opts.limit) : items;
}

export const VARIANTS = ["coordinator", "all-finders", "single-prompt", "coordinator-sonnet-subagents"] as const;
export type Variant = (typeof VARIANTS)[number];

/** One variant's output on one item, as stored under results/<run>/<item>/<variant>.json. */
export interface VariantResult {
  itemId: string;
  variant: Variant;
  ok: boolean;
  /** Failure-mode id from FAILURE-MODES.md when ok is false. */
  failure?: string;
  error?: string;
  routing: Routing | null;
  selection?: { ran: string[]; mode: string };
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  wallSeconds: number;
  transcript: string | null;
}
