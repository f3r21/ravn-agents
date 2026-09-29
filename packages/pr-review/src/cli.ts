#!/usr/bin/env node
/**
 * ravn-pr-review: the deterministic half of the review-pr skill.
 *
 *   prepare <pr> [--repo owner/name] [--out dir]   fetch the PR and write the run directory
 *   finalize <runDir>                              validate draft.json, route findings, print the review
 *   post <runDir>                                  post review.json as one COMMENT review
 *
 * Exit codes: 0 ok, 2 terminal error, 3 invalid draft (fix and re-run finalize), 4 retryable error.
 * Errors go to stderr as one JSON line: {error, retryable, retryAfter, message}.
 */

import { EXIT, ReviewError, exitCodeFor } from "./errors.ts";
import { finalize, post, prepare } from "./pipeline.ts";

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith("--")) i++;
    else out.push(args[i]!);
  }
  return out;
}

const USAGE = "usage: ravn-pr-review prepare <pr> [--repo owner/name] [--out dir] | finalize <runDir> | post <runDir>";

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const [target] = positional(rest);
  if (!cmd || !target) {
    process.stderr.write(`${USAGE}\n`);
    return EXIT.terminal;
  }
  switch (cmd) {
    case "prepare": {
      const { runDir, context } = await prepare({ pr: target, repo: flag(rest, "--repo"), out: flag(rest, "--out") });
      const lines = context.files.reduce((n, f) => n + f.additions + f.deletions, 0);
      process.stdout.write(
        JSON.stringify(
          {
            runDir,
            pr: `${context.repo}#${context.number}`,
            headSha: context.headSha,
            reviewedFiles: context.files.length,
            changedLines: lines,
            excluded: context.excluded.length,
            priorFindings: context.priorFingerprints.length,
            hasClaudeMd: context.claudeMd !== null,
            localCheckout: context.localCheckout,
          },
          null,
          2,
        ) + "\n",
      );
      return EXIT.ok;
    }
    case "finalize": {
      const res = finalize(target);
      if (!res.ok) {
        process.stderr.write(JSON.stringify({ error: "invalid_draft", retryable: true, errors: res.errors }) + "\n");
        return EXIT.invalidDraft;
      }
      process.stdout.write(res.text + "\n");
      return EXIT.ok;
    }
    case "post": {
      const res = await post(target);
      process.stdout.write(
        `Posted one review: ${res.url}${res.demoted ? "\nGitHub refused an inline anchor, so every finding went into the summary." : ""}\n`,
      );
      return EXIT.ok;
    }
    default:
      process.stderr.write(`${USAGE}\n`);
      return EXIT.terminal;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    if (err instanceof ReviewError) {
      process.stderr.write(JSON.stringify(err.toJSON()) + "\n");
      process.exit(exitCodeFor(err));
    }
    process.stderr.write(JSON.stringify({ error: "unknown", retryable: false, message: String((err as Error)?.stack ?? err) }) + "\n");
    process.exit(EXIT.terminal);
  },
);
