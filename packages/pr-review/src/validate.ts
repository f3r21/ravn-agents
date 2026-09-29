/**
 * Structural validation of the coordinator's `draft.json`. The agents are told the schema; this is
 * where it is enforced. Semantic checks that depend on the diff (is the line commentable?) live in
 * policy.ts, because a bad anchor demotes a finding rather than rejecting the draft.
 */

import { CATEGORIES, CONFIDENCES, SEVERITIES, VERDICTS, type Draft } from "./types.ts";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isPosInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return isStr(v) && (allowed as readonly string[]).includes(v);
}

export interface DraftValidation {
  ok: boolean;
  errors: string[];
  draft: Draft | null;
}

function checkFinding(f: unknown, i: number, errors: string[]): void {
  const at = `findings[${i}]`;
  if (!isObj(f)) {
    errors.push(`${at} is not an object`);
    return;
  }
  if (!isStr(f.id) || !f.id) errors.push(`${at}.id must be a non-empty string`);
  if (!oneOf(f.category, CATEGORIES)) errors.push(`${at}.category must be one of ${CATEGORIES.join(", ")}`);
  if (!isStr(f.path) || !f.path) errors.push(`${at}.path must be a repo-relative path`);
  if (!isPosInt(f.line)) errors.push(`${at}.line must be a positive integer`);
  if (f.startLine !== undefined && (!isPosInt(f.startLine) || (isPosInt(f.line) && f.startLine >= f.line))) {
    errors.push(`${at}.startLine must be a positive integer below line`);
  }
  if (f.side !== "LEFT" && f.side !== "RIGHT") errors.push(`${at}.side must be LEFT or RIGHT`);
  if (!oneOf(f.severity, SEVERITIES)) errors.push(`${at}.severity must be one of ${SEVERITIES.join(", ")}`);
  if (!oneOf(f.confidence, CONFIDENCES)) errors.push(`${at}.confidence must be one of ${CONFIDENCES.join(", ")}`);
  if (!isStr(f.title) || !f.title.trim()) errors.push(`${at}.title must be a non-empty string`);
  if (!isStr(f.body) || !f.body.trim()) errors.push(`${at}.body must be a non-empty string`);
  if (f.suggestion !== undefined && !isStr(f.suggestion)) errors.push(`${at}.suggestion must be a string when present`);
  const v = f.verification;
  if (!isObj(v)) {
    errors.push(`${at}.verification is required (verdict, evidence, reason)`);
  } else {
    if (!oneOf(v.verdict, VERDICTS)) errors.push(`${at}.verification.verdict must be one of ${VERDICTS.join(", ")}`);
    if (!Array.isArray(v.evidence) || !v.evidence.every(isStr)) errors.push(`${at}.verification.evidence must be an array of "path:line" strings`);
    else if (v.verdict === "confirmed" && v.evidence.length === 0) errors.push(`${at}.verification.evidence must cite at least one path:line when confirmed`);
    if (!isStr(v.reason)) errors.push(`${at}.verification.reason must be a string`);
  }
}

export function validateDraft(input: unknown): DraftValidation {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ["draft is not a JSON object"], draft: null };
  const d = input;
  if (d.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!oneOf(d.mode, ["routed", "all-finders", "self"] as const)) errors.push("mode must be routed, all-finders or self");

  if (!isObj(d.selection)) errors.push("selection is required");
  else {
    const s = d.selection;
    if (!Array.isArray(s.ran) || !s.ran.every((c) => oneOf(c, CATEGORIES))) errors.push("selection.ran must list finder categories");
    if (!Array.isArray(s.skipped)) errors.push("selection.skipped must be an array");
    else
      s.skipped.forEach((k, i) => {
        if (!isObj(k) || !oneOf(k.category, CATEGORIES) || !isStr(k.reason)) errors.push(`selection.skipped[${i}] needs category and reason`);
      });
    if (!isStr(s.rationale) || !s.rationale.trim()) errors.push("selection.rationale must explain the choice");
  }

  if (!Array.isArray(d.finders)) errors.push("finders must be an array");
  else
    d.finders.forEach((f, i) => {
      if (!isObj(f) || !oneOf(f.category, CATEGORIES) || !oneOf(f.status, ["ok", "failed", "partial"] as const) || !Array.isArray(f.files)) {
        errors.push(`finders[${i}] needs category, status (ok|failed|partial) and files`);
      } else if (f.status !== "ok" && !isStr(f.error)) errors.push(`finders[${i}].error must say what failed`);
    });

  if (!isObj(d.verifier) || !oneOf(d.verifier.status, ["ok", "failed", "partial"] as const) || !isStr(d.verifier.model)) {
    errors.push("verifier needs status (ok|failed|partial) and model");
  }

  if (!Array.isArray(d.findings)) errors.push("findings must be an array");
  else {
    d.findings.forEach((f, i) => checkFinding(f, i, errors));
    const ids = d.findings.filter(isObj).map((f) => f.id);
    const dup = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dup !== undefined) errors.push(`duplicate finding id: ${String(dup)}`);
  }

  if (!Array.isArray(d.notReviewed) || !d.notReviewed.every((n) => isObj(n) && isStr(n.path) && isStr(n.reason))) {
    errors.push("notReviewed must be an array of {path, reason}");
  }
  if (!isStr(d.summary)) errors.push("summary must be a string");

  return errors.length ? { ok: false, errors, draft: null } : { ok: true, errors: [], draft: input as unknown as Draft };
}

