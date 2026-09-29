import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReport } from "@ravn-agents/eval-core";
import { countLines } from "../citations.js";
import { gradeByCode, hitsEvidence, judgePrompt, parseVerdict } from "./grade.js";
import { type EvalItem, type ItemSet, checkItemSet } from "./items.js";
import { type Condition, type ReportMeta, type TrialResult, buildReport } from "./report.js";
import { type RunMetrics, parseTranscript } from "./transcript.js";

/**
 * Onboarding eval harness. Paired: every question runs once with the map (ask-codebase
 * skill, plugin loaded) and once as plain Claude Code in a clone without the map.
 *
 *   npm run eval -w packages/onboarding -- check  --target <clone of the target repo>
 *   npm run eval -w packages/onboarding -- run    --target <clone> [--items Q01,Q13] [--trials 1] [--dry-run]
 *   npm run eval -w packages/onboarding -- report --results <dir> [--human evals/human-grades.json] [--rejudge]
 *
 * `run` spends money. The full set is the maintainer's call; smoke runs pass --items.
 */

const ANSWER_MODEL = "claude-opus-5-5";
const JUDGE_MODEL = "claude-opus-5-5";
const MAPPER_MODEL = "claude-opus-5-5";
const MAP_DIR = "docs/codebase-map";

const here = dirname(fileURLToPath(import.meta.url));
// The bundle runs from evals/.bin/, so the package root is two levels up.
const packageRoot = resolve(here, "..", "..");
const labsRoot = resolve(packageRoot, "..", "..");
const evalsDir = join(packageRoot, "evals");

interface Options {
  command: string;
  target?: string;
  items?: string[];
  trials: number;
  dryRun: boolean;
  results?: string;
  human?: string;
  rejudge?: boolean;
  pluginDir: string;
  budgetUsd: number;
  buildBudgetUsd: number;
}

function parseOptions(argv: string[]): Options {
  const options: Options = { command: argv[0] ?? "", trials: 1, dryRun: false, pluginDir: labsRoot, budgetUsd: 3, buildBudgetUsd: 20 };
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--target") options.target = resolve(value());
    else if (flag === "--items") options.items = value().split(",");
    else if (flag === "--trials") options.trials = Number(value());
    else if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--rejudge") options.rejudge = true;
    else if (flag === "--results") options.results = resolve(value());
    else if (flag === "--human") options.human = resolve(value());
    else if (flag === "--plugin-dir") options.pluginDir = resolve(value());
    else if (flag === "--budget-usd") options.budgetUsd = Number(value());
    else if (flag === "--build-budget-usd") options.buildBudgetUsd = Number(value());
    else throw new Error(`unknown flag ${flag}`);
  }
  return options;
}

function loadItems(): ItemSet {
  return JSON.parse(readFileSync(join(evalsDir, "items.json"), "utf8")) as ItemSet;
}

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Every item is well formed and every evidence line exists at askRef in the target. */
function check(set: ItemSet, target: string | undefined): string[] {
  const problems = checkItemSet(set);
  if (target === undefined) return [...problems, "pass --target <clone> to check evidence lines against askRef"];
  for (const item of set.items) {
    for (const evidence of item.reference.evidence) {
      const colon = evidence.lastIndexOf(":");
      const path = evidence.slice(0, colon);
      const end = Number(evidence.slice(colon + 1).split("-").at(-1));
      try {
        const lines = countLines(git(target, "show", `${set.askRef}:${path}`));
        if (end > lines) problems.push(`${item.id}: ${evidence} is past the end (${lines} lines)`);
      } catch {
        problems.push(`${item.id}: ${path} does not exist at askRef`);
      }
    }
  }
  return problems;
}

interface ClaudeRun {
  metrics: RunMetrics;
  transcriptPath: string;
}

function runClaude(args: string[], cwd: string, transcriptPath: string, dryRun: boolean): ClaudeRun {
  mkdirSync(dirname(transcriptPath), { recursive: true });
  if (dryRun) {
    process.stdout.write(`[dry-run] (cd ${cwd} && claude ${args.map((a) => JSON.stringify(a)).join(" ")})\n`);
    return { metrics: parseTranscript(""), transcriptPath };
  }
  const started = Date.now();
  const child = spawnSync("claude", args, { cwd, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, timeout: 20 * 60 * 1000 });
  writeFileSync(transcriptPath, child.stdout ?? "");
  const metrics = parseTranscript(child.stdout ?? "");
  metrics.wallSeconds = (Date.now() - started) / 1000;
  if (child.status !== 0 && !metrics.isError) {
    metrics.isError = true;
    metrics.errorDetail = `exit ${String(child.status)}: ${(child.stderr ?? "").slice(0, 300)}`;
  }
  return { metrics, transcriptPath };
}

/** Flags shared by every answering session: pinned model, no user settings or MCP servers. */
function sessionFlags(budgetUsd: number): string[] {
  return [
    "--model",
    ANSWER_MODEL,
    "--output-format",
    "stream-json",
    "--verbose",
    "--setting-sources",
    "local",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-budget-usd",
    String(budgetUsd),
  ];
}

const ANSWER_SUFFIX = "Answer concisely. Cite file:line evidence for each claim. Do not modify any files.";

function freshClone(target: string, ref: string, into: string): string {
  execFileSync("git", ["clone", "--quiet", target, into]);
  git(into, "checkout", "--quiet", "--detach", ref);
  return into;
}

function fixtureDir(set: ItemSet, sha: string): string {
  return join(evalsDir, "fixtures", `${basename(set.repo)}@${sha.slice(0, 12)}`);
}

/**
 * The map built at `sha`: reused from evals/fixtures when present (so the build is paid
 * once and reviewable), otherwise built with the onboard skill and saved there.
 */
function ensureMap(set: ItemSet, sha: string, options: Options, work: string): { dir: string; build?: RunMetrics } {
  const fixture = fixtureDir(set, sha);
  if (existsSync(join(fixture, "codebase-map", "INDEX.md"))) return { dir: join(fixture, "codebase-map") };
  const clone = freshClone(options.target ?? "", sha, join(work, `build-${sha.slice(0, 7)}`));
  const run = runClaude(
    [
      "-p",
      "/ravn-agents:onboard",
      "--plugin-dir",
      options.pluginDir,
      ...sessionFlags(options.buildBudgetUsd),
      "--allowedTools",
      "Bash(node *)",
      "Agent",
      "Read",
      "Grep",
      "Glob",
      "Write",
    ],
    clone,
    join(evalsDir, "results", "builds", `${sha.slice(0, 12)}-${Date.now()}.jsonl`),
    options.dryRun,
  );
  if (!options.dryRun) {
    if (!existsSync(join(clone, MAP_DIR, "INDEX.md"))) throw new Error(`map build at ${sha} produced no INDEX.md; see ${run.transcriptPath}`);
    cpSync(join(clone, MAP_DIR), join(fixture, "codebase-map"), { recursive: true, filter: (src) => !src.includes(`${MAP_DIR}/.build`) });
    writeFileSync(join(fixture, "build-metrics.json"), JSON.stringify(run.metrics, null, 2) + "\n");
  }
  return { dir: join(fixture, "codebase-map"), build: run.metrics };
}

function judge(item: EvalItem, answer: string, outPath: string, dryRun: boolean): { pass: boolean; grader: "judge" | "error"; detail: string } {
  const rubric = readFileSync(join(evalsDir, "rubric.md"), "utf8");
  if (dryRun) return { pass: false, grader: "error", detail: "dry run" };
  mkdirSync(dirname(outPath), { recursive: true });
  const empty = mkdtempSync(join(tmpdir(), "onboarding-judge-"));
  try {
    const child = spawnSync(
      "claude",
      [
        "-p",
        judgePrompt(item, answer, rubric),
        "--model",
        JUDGE_MODEL,
        "--output-format",
        "json",
        "--tools",
        "",
        "--setting-sources",
        "local",
        "--strict-mcp-config",
        "--no-session-persistence",
      ],
      { cwd: empty, encoding: "utf8", timeout: 5 * 60 * 1000 },
    );
    writeFileSync(outPath, child.stdout ?? "");
    const text = (JSON.parse(child.stdout || "{}") as { result?: string }).result ?? "";
    const verdict = parseVerdict(text);
    return "error" in verdict ? { pass: false, grader: "error", detail: verdict.error } : { ...verdict, grader: "judge" };
  } catch (error) {
    return { pass: false, grader: "error", detail: `judge call failed: ${String(error).slice(0, 200)}` };
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
}

function claudeVersion(): string | undefined {
  try {
    return execFileSync("claude", ["--version"], { encoding: "utf8" }).trim().split(" ")[0];
  } catch {
    return undefined;
  }
}

function writeReport(set: ItemSet, results: TrialResult[], meta: ReportMeta, resultsDir: string, human?: Record<string, boolean>): string {
  const selected = set.items.filter((i) => results.some((r) => r.itemId === i.id));
  const report = buildReport(selected, results, meta, human);
  const validation = validateReport(report);
  if (!validation.valid) throw new Error(`report does not match schemas/eval-report.schema.json:\n${validation.errors.join("\n")}`);
  const path = join(resultsDir, "report.json");
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  return path;
}

function run(options: Options): void {
  const set = loadItems();
  const problems = check(set, options.target);
  if (problems.length > 0) throw new Error(`items.json has problems:\n${problems.join("\n")}`);
  const items = options.items ? set.items.filter((i) => options.items?.includes(i.id)) : set.items;
  if (items.length === 0) throw new Error("no items selected");

  const commit = git(labsRoot, "rev-parse", "HEAD").trim();
  const date = new Date().toISOString();
  const resultsDir = join(evalsDir, "results", `${date.slice(0, 10)}-${commit.slice(0, 7)}-${Date.now()}`);
  const work = mkdtempSync(join(tmpdir(), "onboarding-eval-"));
  process.stdout.write(`work dir ${work}\nresults ${resultsDir}\n`);

  const needsStale = items.some((i) => i.mapRef === "stale");
  const freshMap = ensureMap(set, set.askRef, options, work);
  const staleMap = needsStale ? ensureMap(set, set.staleMapRef, options, work) : undefined;

  const baselineRepo = freshClone(options.target ?? "", set.askRef, join(work, "baseline"));
  const mapRepos: Record<"ask" | "stale", string | undefined> = {
    ask: freshClone(options.target ?? "", set.askRef, join(work, "with-map")),
    stale: needsStale ? freshClone(options.target ?? "", set.askRef, join(work, "with-stale-map")) : undefined,
  };
  if (!options.dryRun) {
    cpSync(freshMap.dir, join(mapRepos.ask ?? "", MAP_DIR), { recursive: true });
    if (staleMap && mapRepos.stale) cpSync(staleMap.dir, join(mapRepos.stale, MAP_DIR), { recursive: true });
  }

  const results: TrialResult[] = [];
  for (const item of items) {
    for (let trial = 1; trial <= options.trials; trial++) {
      for (const condition of ["map", "baseline"] as Condition[]) {
        const cwd = condition === "map" ? (mapRepos[item.mapRef] ?? "") : baselineRepo;
        const prompt = condition === "map" ? `/ravn-agents:ask-codebase ${item.question}\n\n${ANSWER_SUFFIX}` : `${item.question}\n\n${ANSWER_SUFFIX}`;
        const tools = condition === "map" ? ["Read", "Grep", "Glob", "Bash(node *)"] : ["Read", "Grep", "Glob"];
        const args = ["-p", prompt, ...sessionFlags(options.budgetUsd), "--allowedTools", ...tools];
        if (condition === "map") args.push("--plugin-dir", options.pluginDir);
        const transcript = join(resultsDir, "transcripts", `${item.id}-${condition}-${trial}.jsonl`);
        const { metrics } = runClaude(args, cwd, transcript, options.dryRun);
        const answer = metrics.finalText;
        let grade: { pass: boolean; grader: TrialResult["grader"]; detail: string };
        if (metrics.isError && answer === "") grade = { pass: false, grader: "error", detail: metrics.errorDetail ?? "run failed" };
        else if (item.grading.kind === "code") grade = { ...gradeByCode(item, answer), grader: "code" };
        else grade = judge(item, answer, join(resultsDir, "judge", `${item.id}-${condition}-${trial}.json`), options.dryRun);
        results.push({
          itemId: item.id,
          condition,
          trial,
          answer,
          metrics,
          ...grade,
          evidenceHit: hitsEvidence(item, answer),
          transcript: relative(labsRoot, transcript),
        });
        process.stdout.write(`${item.id} ${condition} #${trial}: ${grade.pass ? "PASS" : "FAIL"} (${grade.grader}) ${metrics.toolCalls} tools, ${Math.round(metrics.wallSeconds ?? 0)}s\n`);
      }
    }
  }
  if (options.dryRun) return;
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
  const buildMetrics = freshMap.build ?? readBuildMetrics(set, set.askRef);
  const meta = reportMeta(set, commit, date, options, items.length < set.items.length, buildMetrics);
  writeFileSync(join(resultsDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  process.stdout.write(`report ${writeReport(set, results, meta, resultsDir)}\n`);
  rmSync(work, { recursive: true, force: true });
}

function readBuildMetrics(set: ItemSet, sha: string): RunMetrics | undefined {
  const path = join(fixtureDir(set, sha), "build-metrics.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as RunMetrics) : undefined;
}

function reportMeta(set: ItemSet, commit: string, date: string, options: Options, subset: boolean, build: RunMetrics | undefined): ReportMeta {
  const version = claudeVersion();
  return {
    commit,
    date,
    datasetRef: set.askRef,
    repo: set.repo,
    itemsPath: "packages/onboarding/evals/items.json",
    selection: set.selection,
    rubricPath: "packages/onboarding/evals/rubric.md",
    judgeModel: JUDGE_MODEL,
    answerModel: ANSWER_MODEL,
    subagentModels: { "area-mapper": MAPPER_MODEL },
    trialsPerItem: options.trials,
    partial: subset,
    pluginVersion: "0.1.0",
    ...(version ? { claudeCodeVersion: version } : {}),
    ...(subset ? { notes: `Subset run: ${options.items?.join(", ") ?? ""}.` } : {}),
    ...(build
      ? { buildCost: { ...(build.costUsd === undefined ? {} : { usd: build.costUsd }), ...(build.wallSeconds === undefined ? {} : { wallSeconds: build.wallSeconds }), inputTokens: build.inputTokens, outputTokens: build.outputTokens } }
      : {}),
  };
}

/** Rebuilds report.json from a results directory, adding human grades when given. */
function report(options: Options): void {
  if (!options.results) throw new Error("report needs --results <dir>");
  const set = loadItems();
  const results = JSON.parse(readFileSync(join(options.results, "results.json"), "utf8")) as TrialResult[];
  const meta = JSON.parse(readFileSync(join(options.results, "meta.json"), "utf8")) as ReportMeta;
  if (options.rejudge) {
    // Re-runs only the judge for trials whose grading errored; the answers are not re-run.
    for (const trial of results) {
      const item = set.items.find((i) => i.id === trial.itemId);
      if (!item || item.grading.kind !== "judge" || trial.grader !== "error" || trial.answer === "") continue;
      Object.assign(trial, judge(item, trial.answer, join(options.results, "judge", `${trial.itemId}-${trial.condition}-${trial.trial}.json`), false));
      process.stdout.write(`${trial.itemId} ${trial.condition} #${trial.trial}: ${trial.pass ? "PASS" : "FAIL"} (${trial.grader})\n`);
    }
    writeFileSync(join(options.results, "results.json"), JSON.stringify(results, null, 2) + "\n");
  }
  const raw = options.human ? (JSON.parse(readFileSync(options.human, "utf8")) as { grades: Record<string, "pass" | "fail" | null> }) : undefined;
  const human = raw
    ? Object.fromEntries(Object.entries(raw.grades).filter((e): e is [string, "pass" | "fail"] => e[1] === "pass" || e[1] === "fail").map(([id, g]) => [id, g === "pass"]))
    : undefined;
  process.stdout.write(`report ${writeReport(set, results, meta, options.results, human)}\n`);
}

function main(): void {
  const options = parseOptions(process.argv.slice(2));
  if (options.command === "check") {
    const problems = check(loadItems(), options.target);
    process.stdout.write(problems.length === 0 ? `items.json OK (${loadItems().items.length} items)\n` : `${problems.join("\n")}\n`);
    process.exitCode = problems.length === 0 ? 0 : 1;
  } else if (options.command === "run") {
    if (!options.target) throw new Error("run needs --target <local clone of the target repository>");
    run(options);
  } else if (options.command === "report") {
    report(options);
  } else {
    process.stdout.write("usage: run.js check|run|report [flags]; see the header of src/eval/run.ts\n");
    process.exitCode = 2;
  }
}

main();
