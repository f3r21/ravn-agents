/** The frozen question set (`evals/items.json`) and its structural checks. */

export const CATEGORIES = ["where", "what", "how", "why", "config", "stale", "unanswerable"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Grading = { kind: "code"; mustMatch: string[]; mustNotMatch?: string[] } | { kind: "judge" };

export interface EvalItem {
  id: string;
  category: Category;
  question: string;
  /** "ask": the map is built at askRef (fresh). "stale": built at staleMapRef, asked at askRef. */
  mapRef: "ask" | "stale";
  reference: { answer: string; evidence: string[] };
  grading: Grading;
}

export interface ItemSet {
  version: number;
  frozenAt: string;
  repo: string;
  askRef: string;
  staleMapRef: string;
  selection: string;
  items: EvalItem[];
}

const EVIDENCE = /^[^\s:]+:\d+(?:-\d+)?$/;

/** Returns every structural problem in the item set; empty means usable. */
export function checkItemSet(set: ItemSet): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  if (!/^[0-9a-f]{40}$/.test(set.askRef)) problems.push("askRef must be a full 40-character SHA");
  if (!/^[0-9a-f]{40}$/.test(set.staleMapRef)) problems.push("staleMapRef must be a full 40-character SHA");
  for (const item of set.items) {
    const where = `item ${item.id}`;
    if (ids.has(item.id)) problems.push(`${where}: duplicate id`);
    ids.add(item.id);
    if (!(CATEGORIES as readonly string[]).includes(item.category)) problems.push(`${where}: unknown category ${item.category}`);
    if (item.mapRef !== "ask" && item.mapRef !== "stale") problems.push(`${where}: mapRef must be "ask" or "stale"`);
    if ((item.category === "stale") !== (item.mapRef === "stale")) problems.push(`${where}: stale items and only stale items use mapRef "stale"`);
    if (item.question.trim().length < 10) problems.push(`${where}: question too short`);
    if (item.reference.answer.trim() === "") problems.push(`${where}: empty reference answer`);
    if (item.reference.evidence.length === 0) problems.push(`${where}: no evidence`);
    for (const e of item.reference.evidence) if (!EVIDENCE.test(e)) problems.push(`${where}: evidence "${e}" is not path:line`);
    if (item.grading.kind === "code") {
      if (item.grading.mustMatch.length === 0) problems.push(`${where}: code grading needs at least one mustMatch`);
      for (const pattern of [...item.grading.mustMatch, ...(item.grading.mustNotMatch ?? [])]) {
        try {
          new RegExp(pattern, "i");
        } catch (error) {
          problems.push(`${where}: invalid regex ${pattern}: ${String(error)}`);
        }
      }
    } else if (item.grading.kind !== "judge") {
      problems.push(`${where}: unknown grading kind`);
    }
  }
  return problems;
}
