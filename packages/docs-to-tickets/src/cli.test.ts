import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ManifestStore } from "./manifest.ts";

const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const brief = path.join(pkg, "evals", "brief");

function plan(extra: string[]) {
  const work = mkdtempSync(path.join(tmpdir(), "dt-cli-"));
  const tickets = path.join(work, "tickets.json");
  copyFileSync(path.join(pkg, "evals", "fixtures", "challenge-extraction.json"), tickets);
  const result = spawnSync(
    process.execPath,
    [path.join(pkg, "src", "cli.ts"), "plan", "--brief", brief, "--tickets", tickets, "--repo", "o/r", ...extra],
    { encoding: "utf8" },
  );
  return { work, status: result.status, stderr: result.stderr };
}

describe("cli plan --state-dir", () => {
  it("is required", () => {
    const r = plan([]);
    expect(r.status).toBe(64);
    expect(r.stderr).toMatch(/--state-dir <dir>/);
  });

  it("must be the repo's own state directory", () => {
    const r = plan(["--state-dir", path.join(tmpdir(), "tickets", "other__repo")]);
    expect(r.status).toBe(64);
    expect(r.stderr).toMatch(/must end in o__r/);
  });

  it("writes the manifest the server reads for that repo", () => {
    const data = mkdtempSync(path.join(tmpdir(), "dt-plugin-data-"));
    const stateDir = path.join(data, "tickets", "o__r");
    const r = plan(["--state-dir", stateDir]);
    expect(r.status).toBe(0);
    expect(existsSync(path.join(stateDir, "manifest.json"))).toBe(true);
    // The server's store over ${CLAUDE_PLUGIN_DATA}/tickets sees the same planned entries.
    const server = ManifestStore.underBase(path.join(data, "tickets"));
    expect(server.load("o/r").entries).toHaveLength(14);
    expect(server.load("o/r").entries.every((e) => e.status === "planned")).toBe(true);
  });
});
