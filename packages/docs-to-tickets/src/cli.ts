import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadBrief, parseRequirements, renderBrief } from "./brief.ts";
import { ToolError } from "./errors.ts";
import { extractTickets, loadSystemPrompt } from "./extract.ts";
import { ManifestStore, repoDirName } from "./manifest.ts";
import { buildPlan, retryFeedback } from "./plan.ts";
import { loadThresholds } from "./routing.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(here, "..");

const USAGE = `ravn-tickets <command>

  requirements <brief>                  List requirement ids parsed from a brief file or directory.
  plan --brief <p> --tickets <json> --repo <owner/name> --state-dir <dir> [--labels a,b] [--thresholds <file>] [--out <file>]
                                        Validate an extraction, route tickets, print the batch preview.
                                        --state-dir is the repo's state directory, the one the MCP server uses:
                                        "\${CLAUDE_PLUGIN_DATA}/tickets/<owner>__<name>". Its last segment must match --repo.
                                        Exit 0: clean. Exit 2: violations (feedback on stderr). Exit 3: schema invalid.
  extract --brief <p> --out <json>      Extract tickets with the Messages API (needs ANTHROPIC_API_KEY).`;

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      brief: { type: "string" },
      tickets: { type: "string" },
      repo: { type: "string" },
      labels: { type: "string" },
      thresholds: { type: "string" },
      "state-dir": { type: "string" },
      out: { type: "string" },
    },
  });

  if (command === "requirements") {
    const briefPath = positionals[0] ?? values.brief;
    if (!briefPath) return usage();
    for (const r of parseRequirements(loadBrief(briefPath))) {
      console.log(`- ${r.id} [${r.section}]${r.optional ? " (optional)" : ""}: ${r.text}`);
    }
    return 0;
  }

  if (command === "plan") {
    if (!values.brief || !values.tickets || !values.repo || !values["state-dir"]) return usage();
    const stateDir = values["state-dir"];
    if (path.basename(path.resolve(stateDir)) !== repoDirName(values.repo)) {
      console.error(`--state-dir must end in ${repoDirName(values.repo)} so the plan and the MCP server share one manifest; got ${stateDir}`);
      return 64;
    }
    const requirements = parseRequirements(loadBrief(values.brief));
    const plan = buildPlan({
      repo: values.repo,
      requirements,
      extraction: JSON.parse(readFileSync(values.tickets, "utf8")),
      thresholds: loadThresholds(values.thresholds ?? path.join(packageRoot, "thresholds.json")),
      repoLabels: values.labels === undefined ? undefined : values.labels.split(",").map((l) => l.trim()).filter(Boolean),
    });
    if (!plan.ok) {
      console.error(retryFeedback(plan.shapeErrors.map((e) => `Schema: ${e}`)));
      return 3;
    }
    const out = values.out ?? values.tickets.replace(/(\.json)?$/, ".plan.json");
    writeFileSync(out, `${JSON.stringify({ repo: plan.repo, create: plan.createArgs, uncovered: plan.uncovered }, null, 2)}\n`);
    const manifests = ManifestStore.inRepoDir(stateDir);
    for (const p of plan.tickets) {
      if (manifests.get(plan.repo, p.key)) continue;
      manifests.upsert(plan.repo, {
        key: p.key,
        title: p.ticket.title,
        source_refs: p.ticket.source_refs,
        needs_review: p.needsReview,
        review_reasons: p.reasons,
        status: "planned",
      });
    }
    console.log(plan.preview);
    console.log(`\nPlan written to ${out}. Manifest: ${manifests.pathFor(plan.repo)}`);
    if (plan.violations.length > 0) {
      console.error(retryFeedback(plan.violations));
      return 2;
    }
    return 0;
  }

  if (command === "extract") {
    if (!values.brief || !values.out) return usage();
    const { AnthropicExtractionModel } = await import("./extract-api.ts");
    const brief = loadBrief(values.brief);
    const run = await extractTickets({
      model: new AnthropicExtractionModel(),
      system: loadSystemPrompt(path.join(packageRoot, "agents", "ticket-extractor.md")),
      briefText: renderBrief(brief),
      requirements: parseRequirements(brief),
      retryOnViolations: true,
    });
    writeFileSync(values.out, `${JSON.stringify(run.extraction, null, 2)}\n`);
    console.log(
      `${run.extraction.tickets.length} tickets in ${run.attempts} attempt(s), ${run.finalViolations.length} remaining violations; wrote ${values.out}`,
    );
    return 0;
  }

  return usage();
}

function usage(): number {
  console.error(USAGE);
  return 64;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof ToolError) console.error(JSON.stringify({ error: error.body }, null, 2));
    else console.error(error);
    process.exit(1);
  },
);
