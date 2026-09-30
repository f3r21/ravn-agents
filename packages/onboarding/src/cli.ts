import { MapError, assemble, mapStatus, plan, validateMap } from "./build.js";
import { findRepoRoot } from "./git.js";
import { formatReport } from "./staleness.js";

const USAGE = `usage: map-cli <command> [--repo <dir>]

commands:
  plan [--refresh]   choose the areas to map and write their generated facts
  assemble           validate the mappers' drafts, write the pages and INDEX.md
  status [--json]    report which areas are stale against HEAD
  validate           re-check every page's citations against its stamped commit`;

interface Args {
  command: string | undefined;
  repo: string;
  flags: Set<string>;
}

function parseArgs(argv: string[]): Args {
  const flags = new Set<string>();
  let repo = process.cwd();
  let command: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repo") {
      const value = argv[++i];
      if (!value) throw new MapError("--repo needs a directory");
      repo = value;
    } else if (arg?.startsWith("--")) {
      flags.add(arg);
    } else if (command === undefined) {
      command = arg;
    } else {
      throw new MapError(`unexpected argument: ${arg}`);
    }
  }
  return { command, repo, flags };
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function run(argv: string[]): number {
  const args = parseArgs(argv);
  if (args.command === undefined || args.flags.has("--help")) {
    process.stdout.write(`${USAGE}\n`);
    return args.command === undefined ? 2 : 0;
  }
  const root = findRepoRoot(args.repo);
  if (root === undefined) throw new MapError(`${args.repo} is not inside a git repository`);

  switch (args.command) {
    case "plan": {
      const result = plan(root, { refresh: args.flags.has("--refresh") });
      print({
        repo: root,
        head: result.head,
        mode: result.mode,
        upToDate: result.toMap.length === 0 && result.remove.length === 0,
        toMap: result.toMap.map((a) => ({
          slug: a.slug,
          title: a.title,
          paths: a.paths,
          fileCount: a.fileCount,
          factsPath: a.factsPath,
          draftPath: a.draftPath,
          ...(a.oldPage ? { oldPage: a.oldPage } : {}),
          ...(a.changedFiles ? { changedFiles: a.changedFiles.slice(0, 40) } : {}),
        })),
        keep: result.keep,
        remove: result.remove,
      });
      return 0;
    }
    case "assemble": {
      const result = assemble(root);
      print(result);
      return result.areas.some((a) => a.status !== "ok") ? 1 : 0;
    }
    case "status": {
      const report = mapStatus(root);
      if (args.flags.has("--json")) {
        print(report ?? { map: "none" });
      } else if (report === undefined) {
        process.stdout.write("codebase-map: this repository has no docs/codebase-map/INDEX.md. Build one with /ravn-agents:onboard.\n");
      } else {
        process.stdout.write(`${formatReport(report)}\n`);
      }
      // Stale is a report, not a failure. The ask-codebase skill injects this output, and Claude
      // Code refuses to load a skill whose injected command exits non-zero.
      return 0;
    }
    case "validate": {
      const problems = validateMap(root);
      print({ ok: problems.length === 0, problems });
      return problems.length === 0 ? 0 : 1;
    }
    default:
      throw new MapError(`unknown command "${args.command}"\n${USAGE}`);
  }
}
