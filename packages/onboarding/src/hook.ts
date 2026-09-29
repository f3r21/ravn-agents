import { readFileSync } from "node:fs";
import { sessionStartOutput } from "./session-start.js";

/**
 * SessionStart hook entry point (bundled to dist/check-map-staleness.js).
 *
 * It only detects and reports. It never refreshes (that is a model task the user starts),
 * never blocks, and always exits 0: a broken check must not stop a session.
 */

function readInput(): { cwd?: string } {
  if (process.stdin.isTTY) return {};
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() === "" ? {} : (JSON.parse(raw) as { cwd?: string });
  } catch {
    return {};
  }
}

const input = readInput();
const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
try {
  const output = sessionStartOutput(cwd);
  if (output) process.stdout.write(JSON.stringify(output));
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    JSON.stringify({ systemMessage: `codebase-map: staleness check failed (${reason.slice(0, 200)}); treat the map as possibly stale.` }),
  );
}
process.exitCode = 0;
