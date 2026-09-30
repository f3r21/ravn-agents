/**
 * Eval harness for the PR reviewer.
 *
 *   mine   --repo owner/name --clone <path> [--extra 109,110] [--out file]
 *          SZZ candidate mining; prints fix -> inducing PR candidates for hand confirmation.
 *   run    --clones owner/a=<path>,owner/b=<path> [--variants coordinator,single-prompt]
 *          [--limit N] [--only id,id] [--include-unconfirmed] [--budget-usd 5] [--out dir]
 *          Replays items headless. Costs money: a full run is a human decision.
 *   grade  --run <dir> [--judge-model claude-opus-5-5]
 *   salvage --run <dir>
 *          Recovers coordinator runs whose draft.json Write was denied: takes the draft from the
 *          transcript's permission_denials and finalizes it offline. Free and idempotent.
 *   report --run <dir> [--human-labels file]
 *          Writes <run>/report.json, validated against schemas/eval-report.schema.json.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execRunner } from "../github.ts";
import { gradeItem, humanAgreement, type ItemGrade, type JudgeRecord } from "./grade.ts";
import { VARIANTS, loadItems, selectItems, type Variant, type VariantResult } from "./items.ts";
import { claudeJudge } from "./judge.ts";
import { Miner, fixCandidates, listMerged } from "./mine.ts";
import { buildReport } from "./report.ts";
import { runVariant } from "./run.ts";
import { salvageRun } from "./salvage.ts";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LABS = resolve(PKG, "../..");
const ITEMS = join(PKG, "evals/items.json");
const RUBRIC = join(PKG, "evals/rubric.md");
const MAIN_MODEL = "claude-opus-5-5";
const FINDER_MODEL = "claude-opus-5-5";
const SONNET_MODEL = "claude-sonnet-5-5";
const DEFAULT_JUDGE = "claude-opus-5-5";

function flag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

function labsCommit(): string {
  try {
    return execFileSync("git", ["-C", LABS, "rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "0000000";
  }
}

async function mine(args: string[]): Promise<void> {
  const repo = flag(args, "--repo");
  const clone = flag(args, "--clone");
  if (!repo || !clone) throw new Error("mine needs --repo owner/name and --clone <path>");
  const extra = (flag(args, "--extra") ?? "").split(",").filter(Boolean).map(Number);
  const merged = await listMerged(execRunner, repo);
  const miner = new Miner(repo, clone, execRunner, merged);
  const out = [];
  for (const fix of fixCandidates(merged, extra)) {
    const c = await miner.analyse(fix);
    if (!c) continue;
    out.push(c);
    process.stderr.write(`#${c.fixPr} ${c.ghost ? "ghost" : c.inducing.map((i) => `<- #${i.pr} (${i.lines} lines)`).join(" ")}  mentions: ${c.mentions.join(",")}\n`);
  }
  const file = flag(args, "--out");
  if (file) writeFileSync(file, JSON.stringify(out, null, 2));
}

async function run(args: string[]): Promise<void> {
  const clones = Object.fromEntries(
    (flag(args, "--clones") ?? "").split(",").filter(Boolean).map((kv) => {
      const [k, v] = kv.split("=");
      return [k!, resolve(v!)];
    }),
  );
  const variants = (flag(args, "--variants", "coordinator,single-prompt") ?? "").split(",") as Variant[];
  for (const v of variants) if (!VARIANTS.includes(v)) throw new Error(`unknown variant ${v}; use ${VARIANTS.join(", ")}`);
  const file = loadItems(ITEMS);
  const items = selectItems(file, {
    includeUnconfirmed: args.includes("--include-unconfirmed"),
    only: flag(args, "--only")?.split(","),
    limit: flag(args, "--limit") ? Number(flag(args, "--limit")) : undefined,
  });
  if (!items.length) throw new Error("no items selected: confirm items in evals/items.json, or pass --include-unconfirmed for a smoke run");
  const outDir = resolve(flag(args, "--out", join(PKG, "evals/results", `${new Date().toISOString().slice(0, 10)}-${labsCommit()}`))!);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "run.json"), JSON.stringify({ items: items.map((i) => i.id), variants, commit: labsCommit(), started: new Date().toISOString() }, null, 2));

  for (const item of items) {
    for (const variant of variants) {
      const dest = join(outDir, item.id.replace(/[^\w.-]+/g, "_"), `${variant}.json`);
      if (existsSync(dest)) continue; // resumable
      process.stderr.write(`${item.id} ${variant} ... `);
      const res = await runVariant(item, variant, {
        pluginDir: LABS,
        clones,
        outDir,
        budgetUsdPerItem: Number(flag(args, "--budget-usd", "5")),
        timeoutMinutes: Number(flag(args, "--timeout-minutes", "30")),
        mainModel: MAIN_MODEL,
        sonnetSubagentModel: SONNET_MODEL,
      });
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, JSON.stringify(res, null, 2));
      process.stderr.write(res.ok ? `ok (${res.routing!.inline.length} inline, $${res.costUsd ?? "?"})\n` : `FAILED ${res.failure}: ${res.error}\n`);
    }
  }
  process.stderr.write(`results in ${outDir}\n`);
}

function readResults(runDir: string): VariantResult[] {
  const out: VariantResult[] = [];
  for (const d of readdirSync(runDir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === "checkouts") continue;
    for (const f of readdirSync(join(runDir, d.name))) {
      if (/^[a-z-]+\.json$/.test(f) && VARIANTS.includes(f.replace(".json", "") as Variant)) {
        out.push(JSON.parse(readFileSync(join(runDir, d.name, f), "utf8")) as VariantResult);
      }
    }
  }
  return out;
}

async function grade(args: string[]): Promise<void> {
  const runDir = resolve(flag(args, "--run") ?? "");
  const model = flag(args, "--judge-model", DEFAULT_JUDGE)!;
  const items = loadItems(ITEMS).items;
  const cachePath = join(runDir, "judgements.json");
  const cache = new Map<string, JudgeRecord>(existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, "utf8")) as JudgeRecord[]).map((r) => [r.key, r]) : []);
  const judge = claudeJudge({ model, rubricPath: RUBRIC, cache });
  const grades: ItemGrade[] = [];
  for (const res of readResults(runDir)) {
    const item = items.find((i) => i.id === res.itemId);
    if (!item) continue;
    const g = await gradeItem(item, res, judge);
    for (const j of g.judgements) cache.set(j.key, j);
    grades.push(g);
  }
  writeFileSync(cachePath, JSON.stringify([...cache.values()], null, 2));
  writeFileSync(join(runDir, "grades.json"), JSON.stringify({ judgeModel: model, grades }, null, 2));
  process.stderr.write(`graded ${grades.length} item-variant results; ${cache.size} judge decisions in ${cachePath}\n`);
}

function salvage(args: string[]): void {
  const runDir = resolve(flag(args, "--run") ?? "");
  const lines = salvageRun(runDir);
  for (const l of lines) process.stderr.write(`${l.item} ${l.outcome}: ${l.detail}\n`);
  process.stderr.write(`salvaged ${lines.filter((l) => l.outcome === "salvaged").length} of ${lines.length} items\n`);
}

function report(args: string[]): void {
  const runDir = resolve(flag(args, "--run") ?? "");
  const { judgeModel, grades } = JSON.parse(readFileSync(join(runDir, "grades.json"), "utf8")) as { judgeModel: string; grades: ItemGrade[] };
  const results = readResults(runDir);
  const byVariant: Partial<Record<Variant, ItemGrade[]>> = {};
  for (const g of grades) (byVariant[g.variant] ??= []).push(g);
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8")) as { items: string[]; commit: string };
  const all = loadItems(ITEMS).items;
  const items = all.filter((i) => run.items.includes(i.id));
  const labelsPath = flag(args, "--human-labels");
  const labels = labelsPath ? (JSON.parse(readFileSync(labelsPath, "utf8")) as Record<string, boolean>) : {};
  const judgements = existsSync(join(runDir, "judgements.json")) ? (JSON.parse(readFileSync(join(runDir, "judgements.json"), "utf8")) as JudgeRecord[]) : [];
  const main = results.filter((r) => r.variant === "coordinator");
  const pkg = JSON.parse(readFileSync(join(LABS, ".claude-plugin/plugin.json"), "utf8")) as { version: string };

  const out = buildReport({
    grades: byVariant,
    items,
    itemsPath: relative(LABS, ITEMS),
    rubricPath: relative(LABS, RUBRIC),
    commit: run.commit,
    date: new Date().toISOString(),
    judgeModel,
    humanAgreement: humanAgreement(judgements, labels),
    cost: {
      usd: main.reduce((n, r) => n + (r.costUsd ?? 0), 0),
      inputTokens: main.reduce((n, r) => n + (r.inputTokens ?? 0), 0),
      outputTokens: main.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
      wallSeconds: main.reduce((n, r) => n + r.wallSeconds, 0),
    },
    salvaged: new Set(results.filter((r) => r.salvaged).map((r) => r.itemId)).size,
    partial: items.length < all.filter((i) => i.confirmed).length || items.some((i) => !i.confirmed),
    pluginVersion: pkg.version,
    models: {
      main: MAIN_MODEL,
      subagents: {
        "pr-coordinator": MAIN_MODEL,
        "pr-finder-correctness": FINDER_MODEL,
        "pr-finder-security": FINDER_MODEL,
        "pr-finder-tests": FINDER_MODEL,
        "pr-finder-conventions": FINDER_MODEL,
        "pr-verifier": FINDER_MODEL,
      },
      effort: "coordinator high; finders and verifier default",
    },
  });
  const dest = join(runDir, "report.json");
  writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
  process.stdout.write(`${dest}\nhistorical_bug_recall ${out.successes}/${out.n} = ${out.value}\n`);
}

const [cmd, ...rest] = process.argv.slice(2);
const commands: Record<string, (a: string[]) => unknown> = { mine, run, grade, salvage, report };
const fn = cmd ? commands[cmd] : undefined;
if (!fn) {
  process.stderr.write("usage: eval <mine|run|grade|salvage|report> [flags]; see the header of src/eval/cli.ts\n");
  process.exit(2);
}
Promise.resolve(fn(rest)).catch((err: unknown) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
