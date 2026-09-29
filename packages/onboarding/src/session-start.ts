import { mapStatus } from "./build.js";
import { findRepoRoot } from "./git.js";
import { formatReport, isFresh } from "./staleness.js";

/**
 * The SessionStart hook's answer for a working directory: map staleness as
 * `additionalContext` (Claude reads it), plus a `systemMessage` for the user when
 * something is stale. Undefined when there is no repository or no map, so the hook
 * stays silent in projects that never built one.
 */
export function sessionStartOutput(cwd: string): object | undefined {
  const root = findRepoRoot(cwd);
  if (root === undefined) return undefined;
  const report = mapStatus(root);
  if (report === undefined) return undefined;
  const message = formatReport(report);
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: message },
    ...(isFresh(report) ? {} : { systemMessage: message }),
  };
}
