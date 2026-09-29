import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBrief, parseRequirements } from "./brief.ts";
import { configFromEnv } from "./config.ts";
import { idempotencyKey, marker, readMarker } from "./idempotency.ts";
import { buildPlan, retryFeedback } from "./plan.ts";
import { DEFAULT_THRESHOLDS, loadThresholds, route, type Thresholds } from "./routing.ts";
import { HIGH, REQUIREMENTS, ticket } from "./test-fixtures.ts";

const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("idempotency", () => {
  it("ignores ref order and title punctuation, but not the repo", () => {
    const a = idempotencyKey("o/r", ["b.1", "a.1"], "Add the icons!");
    expect(idempotencyKey("o/r", ["a.1", "b.1"], "add the icons")).toBe(a);
    expect(idempotencyKey("o/other", ["a.1", "b.1"], "Add the icons!")).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("round-trips the body marker", () => {
    expect(readMarker(`text\n${marker("0123456789abcdef")}\n`)).toBe("0123456789abcdef");
    expect(readMarker("no marker")).toBeNull();
  });
});

describe("route", () => {
  it("routes any field below its threshold, and any validation finding", () => {
    expect(route(HIGH, DEFAULT_THRESHOLDS)).toEqual({ needsReview: false, reasons: [] });
    expect(route({ ...HIGH, type: "medium" }, DEFAULT_THRESHOLDS).reasons).toEqual(["type: confidence medium is below the threshold high"]);
    expect(route(HIGH, DEFAULT_THRESHOLDS, ["unknown-ref: x"]).needsReview).toBe(true);
  });

  it("honours calibrated thresholds, including never", () => {
    const t: Thresholds = {
      ...DEFAULT_THRESHOLDS,
      fields: { ...DEFAULT_THRESHOLDS.fields, type: { min: "low" }, priority: { min: "never" } },
    };
    const r = route({ ...HIGH, type: "low" }, t);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toMatch(/^priority: always reviewed/);
  });

  it("falls back to the default when no thresholds file exists and rejects malformed ones", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dt-thresholds-"));
    expect(loadThresholds(path.join(dir, "missing.json"))).toBe(DEFAULT_THRESHOLDS);
    writeFileSync(path.join(dir, "bad.json"), JSON.stringify({ version: 1, calibrated: true, fields: {} }));
    expect(() => loadThresholds(path.join(dir, "bad.json"))).toThrow(/not a thresholds file/);
    expect(loadThresholds(path.join(pkg, "thresholds.json")).calibrated).toBe(false);
  });
});

describe("configFromEnv", () => {
  it("is dry-run unless RAVN_TICKETS_LIVE is exactly 1", () => {
    expect(configFromEnv({}, "/p/dist").live).toBe(false);
    expect(configFromEnv({ RAVN_TICKETS_LIVE: "true" }, "/p/dist").live).toBe(false);
    expect(configFromEnv({ RAVN_TICKETS_LIVE: "1" }, "/p/dist").live).toBe(true);
  });

  it("treats an unexpanded plugin option as no token", () => {
    expect(configFromEnv({ GITHUB_TOKEN: "${user_config.github_token}" }, "/p/dist").token).toBeNull();
    expect(configFromEnv({ GITHUB_TOKEN: "" }, "/p/dist").token).toBeNull();
    expect(configFromEnv({ GITHUB_TOKEN: "ghp_x" }, "/p/dist").token).toBe("ghp_x");
  });

  it("keeps state under CLAUDE_PLUGIN_DATA/tickets and never falls back to the working directory", () => {
    expect(configFromEnv({ CLAUDE_PLUGIN_DATA: "/data/ravn" }, "/p/dist").stateBase).toBe(path.join("/data/ravn", "tickets"));
    expect(configFromEnv({}, "/p/dist").stateBase).toBeNull();
    expect(configFromEnv({ CLAUDE_PLUGIN_DATA: "${CLAUDE_PLUGIN_DATA}" }, "/p/dist").stateBase).toBeNull();
  });

  it("defaults thresholds to the package", () => {
    expect(configFromEnv({}, "/p/dist").thresholdsFile).toBe(path.join("/p", "thresholds.json"));
  });
});

describe("buildPlan", () => {
  it("returns shape errors without planning", () => {
    const plan = buildPlan({ repo: "o/r", requirements: REQUIREMENTS, extraction: { tickets: "nope" }, thresholds: DEFAULT_THRESHOLDS });
    expect(plan.ok).toBe(false);
  });

  it("plans the challenge brief end to end from the fixture extraction", () => {
    const requirements = parseRequirements(loadBrief(path.join(pkg, "evals", "brief")));
    const extraction = JSON.parse(readFileSync(path.join(pkg, "evals", "fixtures", "challenge-extraction.json"), "utf8"));
    const plan = buildPlan({ repo: "f3r21/sandbox", requirements, extraction, thresholds: DEFAULT_THRESHOLDS });
    if (!plan.ok) throw new Error(plan.shapeErrors.join());
    expect(plan.violations).toEqual([]);
    expect(plan.uncovered).toEqual([]);
    expect(plan.createArgs).toHaveLength(14);
    const review = plan.tickets.filter((t) => t.needsReview).map((t) => t.index + 1);
    expect(review).toEqual([2, 9, 12, 14]);
    expect(plan.preview).toMatch(/14 tickets: 10 auto, 4 routed to `needs-review`/);
    const args = plan.createArgs[2]!;
    expect(args.idempotency_key).toBe(idempotencyKey("f3r21/sandbox", args.source_refs, args.title));
    expect(args.body).toMatch(/## Acceptance criteria\n\n- \[ \] The header shows the profile image/);
    expect(args.body).toMatch(/`header.2` \(Project Requirements\/2. Create the dashboard page\/Header\): Add the notification icon./);
  });

  it("carries validation findings into routing and the retry feedback", () => {
    const extraction = { tickets: [ticket({ source_refs: ["toolbar.1", "toolbar.9"] })], out_of_scope: [] };
    const plan = buildPlan({ repo: "o/r", requirements: REQUIREMENTS, extraction, thresholds: DEFAULT_THRESHOLDS });
    if (!plan.ok) throw new Error("shape");
    expect(plan.tickets[0]!.needsReview).toBe(true);
    expect(plan.createArgs[0]!.review_reasons).toEqual([expect.stringMatching(/^unknown-ref:/)]);
    expect(plan.preview).toMatch(/## Not covered by any ticket/);
    expect(retryFeedback(plan.violations)).toMatch(/- Ticket 1 .* cites "toolbar.9"/);
  });
});
