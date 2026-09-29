import { parseCitations } from "../citations.js";
import type { EvalItem } from "./items.js";

export interface Grade {
  pass: boolean;
  detail: string;
}

/** Deterministic grade: every `mustMatch` pattern matches and no `mustNotMatch` does (case-insensitive). */
export function gradeByCode(item: EvalItem, answer: string): Grade {
  if (item.grading.kind !== "code") throw new Error(`${item.id} is not code-graded`);
  const missing = item.grading.mustMatch.filter((p) => !new RegExp(p, "i").test(answer));
  const forbidden = (item.grading.mustNotMatch ?? []).filter((p) => new RegExp(p, "i").test(answer));
  const problems = [...missing.map((p) => `missing /${p}/`), ...forbidden.map((p) => `forbidden /${p}/`)];
  return { pass: problems.length === 0, detail: problems.length === 0 ? "all patterns matched" : problems.join("; ") };
}

/** Files named in an answer, from `path:line` citations and from bare `path.ext` mentions. */
export function citedFiles(answer: string): Set<string> {
  const files = new Set(parseCitations(answer).map((c) => c.path));
  for (const match of answer.matchAll(/(?:^|[\s`(])((?:[\w.-]+\/)*[\w.-]+\.[a-z]{1,5})(?::\d+(?:-\d+)?)?/gi)) {
    if (match[1]) files.add(match[1].replace(/^\.\//, ""));
  }
  return files;
}

/** True when the answer names at least one file from the reference evidence. Reported, not graded. */
export function hitsEvidence(item: EvalItem, answer: string): boolean {
  const cited = citedFiles(answer);
  return item.reference.evidence.some((e) => cited.has(e.slice(0, e.lastIndexOf(":"))));
}

/**
 * Reads the judge's verdict from its last `VERDICT:` line. Anything else is an error,
 * never a silent pass or fail.
 */
export function parseVerdict(judgeText: string): Grade | { error: string } {
  const matches = [...judgeText.matchAll(/^\s*VERDICT:\s*(PASS|FAIL)\s*$/gim)];
  const last = matches.at(-1);
  if (!last?.[1]) return { error: "judge output has no VERDICT: PASS|FAIL line" };
  const reasoning = judgeText.slice(0, last.index).trim().split("\n").slice(-3).join(" ").slice(0, 300);
  return { pass: last[1].toUpperCase() === "PASS", detail: reasoning };
}

export function judgePrompt(item: EvalItem, answer: string, rubric: string): string {
  return [
    "You grade one answer about a code repository against a reference. Follow the rubric exactly.",
    "",
    "<rubric>",
    rubric.trim(),
    "</rubric>",
    "",
    `<question>${item.question}</question>`,
    `<reference_answer>${item.reference.answer}</reference_answer>`,
    `<reference_evidence>${item.reference.evidence.join(", ")}</reference_evidence>`,
    `<category>${item.category}</category>`,
    "",
    "<candidate_answer>",
    answer.trim(),
    "</candidate_answer>",
    "",
    "Reason briefly about each rubric condition, then end with exactly one line: VERDICT: PASS or VERDICT: FAIL",
  ].join("\n");
}
