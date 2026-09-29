import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBrief, parseRequirements, renderBrief, slugify, stripFrontmatter } from "./brief.ts";

const briefDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "evals", "brief");

describe("parseRequirements on the challenge brief", () => {
  const requirements = parseRequirements(loadBrief(briefDir));
  const byId = new Map(requirements.map((r) => [r.id, r]));

  it("finds the 39 checkboxes", () => {
    expect(requirements.filter((r) => r.kind === "checkbox")).toHaveLength(39);
  });

  it("gives readable ids from the section name", () => {
    expect(byId.get("header.2")?.text).toBe("Add the notification icon.");
    expect(byId.get("task-card.6")?.text).toMatch(/options icon/);
    expect(byId.get("show-the-user-information.1")).toBeDefined();
  });

  it("folds nested bullets into their checkbox", () => {
    expect(byId.get("update.2")?.text).toBe(
      "it should allow the user to edit the following information: DueDate; Name; Position; Status; Tags; EstimatedTime.",
    );
    expect(byId.has("update.6")).toBe(false);
  });

  it("marks optional requirements, by text or by a bonus section", () => {
    expect(requirements.filter((r) => r.optional && r.kind === "checkbox").map((r) => r.id)).toEqual([
      "initial-setup.4",
      "initial-setup.5",
      "initial-setup.6",
    ]);
    expect(byId.get("bonus-points.3")?.optional).toBe(true);
  });

  it("parses list items in sections without checkboxes", () => {
    expect(byId.get("repository-readme.1")?.kind).toBe("item");
  });

  it("is deterministic", () => {
    expect(parseRequirements(loadBrief(briefDir))).toEqual(requirements);
  });

  it("drops frontmatter before rendering", () => {
    expect(renderBrief(loadBrief(briefDir))).not.toMatch(/applies_to:/);
  });
});

describe("parseRequirements on a single file", () => {
  it("uses headings as sections and lengthens clashing slugs", () => {
    const content = [
      "# App",
      "## Web",
      "### Create",
      "- [ ] Web create form.",
      "## Mobile",
      "### Create",
      "- [ ] Mobile create screen.",
      "  - with validation",
    ].join("\n");
    const ids = parseRequirements([{ relPath: "brief.md", content }]).map((r) => [r.id, r.text]);
    expect(ids).toEqual([
      ["web-create.1", "Web create form."],
      ["mobile-create.1", "Mobile create screen. with validation"],
    ]);
  });
});

describe("helpers", () => {
  it("strips numeric prefixes when slugging", () => {
    expect(slugify("2. Create the dashboard page")).toBe("create-the-dashboard-page");
  });

  it("strips frontmatter only at the top", () => {
    expect(stripFrontmatter("---\na: 1\n---\n\nbody\n---\n")).toBe("\nbody\n---\n");
    expect(stripFrontmatter("no frontmatter")).toBe("no frontmatter");
  });
});
