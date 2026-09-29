import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { validateReport } from "@ravn-agents/eval-core";
import { loadBrief, parseRequirements, renderBrief } from "../src/brief.ts";
import { EXTRACTION_MODEL_ID, extractTickets, loadSystemPrompt, type ExtractionRun } from "../src/extract.ts";
import { DEFAULT_THRESHOLDS } from "../src/routing.ts";
import { checkShape } from "../src/ticket-schema.ts";
import { validateExtraction } from "../src/validate.ts";
import { calibrate, gradeTickets, type ItemsFile } from "./grade.ts";
import { buildReport } from "./report.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, "..");

const { values } = parseArgs({
  options: {
    extractor: { type: "string", default: "api" },
    fixture: { type: "string", default: path.join(here, "fixtures", "challenge-extraction.json") },
    limit: { type: "string" },
    "skip-baseline": { type: "boolean", default: false },
    out: { type: "string", default: path.join(here, "results") },
  },
});

const itemsFile = JSON.parse(readFileSync(path.join(here, "items.json"), "utf8")) as ItemsFile;
const brief = loadBrief(path.join(here, "brief"));
const briefText = renderBrief(brief);
const requirements = parseRequirements(brief);
if (createHash("sha256").update(briefText).digest("hex") !== itemsFile.briefSha256) {
  throw new Error("evals/brief no longer matches the frozen items (briefSha256). Re-freezing items is a deliberate, reviewed change.");
}

const limit = values.limit === undefined ? undefined : Number(values.limit);
let evalSeen = 0;
const items = itemsFile.items.filter((i) => i.split !== "eval" || limit === undefined || evalSeen++ < limit);

const started = Date.now();
let system: ExtractionRun;
let baseline: ExtractionRun | null = null;
let model = EXTRACTION_MODEL_ID;

if (values.extractor === "fixture") {
  const shape = checkShape(JSON.parse(readFileSync(values.fixture, "utf8")));
  if (!shape.ok) throw new Error(`fixture is not a valid extraction: ${shape.errors.join("; ")}`);
  const violations = validateExtraction(shape.value, requirements).violations.map((v) => v.message);
  system = { extraction: shape.value, attempts: 1, firstViolations: violations, finalViolations: violations, inputTokens: 0, outputTokens: 0 };
  model = "fixture";
} else if (values.extractor === "api") {
  const { AnthropicExtractionModel } = await import("../src/extract-api.ts");
  const extractor = new AnthropicExtractionModel();
  model = extractor.id;
  const agentFile = path.join(packageRoot, "agents", "ticket-extractor.md");
  system = await extractTickets({
    model: extractor,
    system: loadSystemPrompt(agentFile, true),
    briefText,
    requirements,
    retryOnViolations: true,
  });
  if (!values["skip-baseline"]) {
    baseline = await extractTickets({
      model: extractor,
      system: loadSystemPrompt(agentFile, false),
      briefText,
      requirements,
      retryOnViolations: false,
    });
  }
} else {
  throw new Error(`--extractor must be api or fixture, got ${values.extractor}`);
}

const thresholds = calibrate(gradeTickets(items, system.extraction), DEFAULT_THRESHOLDS);
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: here, encoding: "utf8" }).trim();
const date = new Date().toISOString();
const partial = limit !== undefined || values.extractor === "fixture";
const notes = [
  values.extractor === "fixture"
    ? "Smoke run: the extraction is the hand-written fixture evals/fixtures/challenge-extraction.json, not model output. It checks the harness, not the tool."
    : `Extraction by ${model}; baseline ${baseline ? "run on the same brief" : "skipped"}.`,
  limit !== undefined ? `Scored on the first ${limit} eval-split items only.` : "",
  "All items come from one brief and one extraction call, so they are not independent draws; the Wilson interval understates the uncertainty.",
  `Thresholds calibrated on the calibration split: ${JSON.stringify(Object.fromEntries(Object.entries(thresholds.fields).map(([f, t]) => [f, t.min])))}.`,
]
  .filter(Boolean)
  .join(" ");

const report = buildReport({
  items,
  requirements,
  system,
  baseline,
  thresholds,
  model,
  commit,
  date,
  wallSeconds: (Date.now() - started) / 1000,
  partial,
  notes,
});
const check = validateReport(report);
mkdirSync(values.out, { recursive: true });
const stem = path.join(values.out, `${date.slice(0, 10)}-${commit}${partial ? "-smoke" : ""}`);
writeFileSync(`${stem}.json`, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(`${stem}.thresholds.json`, `${JSON.stringify(thresholds, null, 2)}\n`);
writeFileSync(`${stem}.extraction.json`, `${JSON.stringify({ system: system.extraction, baseline: baseline?.extraction ?? null }, null, 2)}\n`);
console.log(`${report.metric.name}: ${report.successes}/${report.n} (Wilson 95% ${report.ci.lower.toFixed(2)}-${report.ci.upper.toFixed(2)})`);
if (report.baseline) console.log(`baseline: ${report.baseline.successes}/${report.baseline.n}, delta ${report.baseline.delta}`);
console.log(`report: ${stem}.json (${check.valid ? "valid" : "INVALID"})`);
if (!check.valid) {
  console.error(check.errors.join("\n"));
  process.exit(1);
}
