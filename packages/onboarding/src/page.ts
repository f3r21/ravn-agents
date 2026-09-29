/**
 * Rendering and parsing of map pages. Frontmatter values are written as JSON, which is
 * also valid YAML, so a reader needs no YAML library: each line is `key: <json>`.
 */

export const GENERATOR = "ravn-agents/onboarding 0.1.0";
export const INDEX_MAX_LINES = 200;
export const FACTS_HEADING = "## Generated facts";

export type AreaStatus = "ok" | "missing";

export interface AreaPageMeta {
  area: string;
  title: string;
  paths: string[];
  tree_hash: string;
  built_at_sha: string;
  built_at: string;
  status: AreaStatus;
  summary: string;
  reason?: string;
  generator: string;
}

export interface IndexMeta {
  built_at_sha: string;
  built_at: string;
  areas: number;
  generator: string;
}

export function renderFrontmatter(meta: object): string {
  const lines = Object.entries(meta)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

export interface ParsedPage {
  meta: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(text: string): ParsedPage {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match?.[1]) return { meta: {}, body: text };
  const meta: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1).trim();
    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw;
    }
  }
  return { meta, body: text.slice(match[0].length) };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Reads an area page's frontmatter, or explains why it is not a valid map page. */
export function readAreaMeta(text: string): AreaPageMeta | string {
  const { meta } = parseFrontmatter(text);
  const str = (key: string): string | undefined => (typeof meta[key] === "string" ? (meta[key] as string) : undefined);
  const area = str("area");
  const title = str("title");
  const treeHash = str("tree_hash");
  const sha = str("built_at_sha");
  const builtAt = str("built_at");
  const status = str("status");
  if (!area || !title || !treeHash || !sha || !builtAt || !isStringArray(meta.paths)) {
    return "frontmatter is missing one of area, title, paths, tree_hash, built_at_sha, built_at";
  }
  if (status !== "ok" && status !== "missing") return `unknown status "${String(meta.status)}"`;
  const reason = str("reason");
  return {
    area,
    title,
    paths: meta.paths,
    tree_hash: treeHash,
    built_at_sha: sha,
    built_at: builtAt,
    status,
    summary: str("summary") ?? "",
    ...(reason ? { reason } : {}),
    generator: str("generator") ?? "",
  };
}

/** The model-written part of a page: everything between the banner and the generated facts. */
export function proseOf(pageBody: string): string {
  const cut = pageBody.indexOf(`\n${FACTS_HEADING}`);
  return cut >= 0 ? pageBody.slice(0, cut) : pageBody;
}

export function renderAreaPage(meta: AreaPageMeta, prose: string, facts: string): string {
  const short = meta.built_at_sha.slice(0, 12);
  const banner =
    meta.status === "ok"
      ? `> Codebase map page, built at \`${short}\`. It says where to look; confirm every claim against the cited code before relying on it.`
      : `> Codebase map page, built at \`${short}\`. **Not covered by the map:** ${meta.reason ?? "no validated prose"}. Only the generated facts below are available; search the code directly.`;
  const parts = [renderFrontmatter(meta), `# ${meta.title}`, "", banner, ""];
  if (meta.status === "ok") parts.push(prose.trim(), "");
  parts.push(facts.trim(), "");
  return parts.join("\n");
}

export interface IndexArea {
  slug: string;
  title: string;
  paths: string[];
  status: AreaStatus;
  summary: string;
  builtAtSha: string;
}

export interface RepoOverview {
  scripts: { name: string; command: string; where?: string }[];
  entryPoints: string[];
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderIndex(meta: IndexMeta, areas: readonly IndexArea[], overview: RepoOverview): string {
  const short = meta.built_at_sha.slice(0, 12);
  const lines: string[] = [
    renderFrontmatter(meta).trimEnd(),
    "# Codebase map",
    "",
    `Built at \`${short}\` on ${meta.built_at.slice(0, 10)} by ${meta.generator}.`,
    "This map is a router, not a source of truth: it tells you which files to read. Confirm any",
    "claim against the cited code, and prefer the code when the two disagree. It is never loaded",
    "automatically; reach it through the `ask-codebase` skill. Refresh with `/ravn-agents:onboard --refresh`.",
    "",
    "## Areas",
    "",
    "| Area | Paths | What lives there | Page |",
    "|---|---|---|---|",
  ];
  for (const area of areas) {
    const stamp = area.builtAtSha === meta.built_at_sha ? "" : ` (built at \`${area.builtAtSha.slice(0, 7)}\`)`;
    const what = area.status === "ok" ? area.summary : `**Not covered:** ${area.summary}`;
    lines.push(
      `| ${cell(area.title)} | ${area.paths.map((p) => `\`${p}\``).join(" ")} | ${cell(what)} | [${area.slug}](areas/${area.slug}.md)${stamp} |`,
    );
  }
  if (overview.entryPoints.length > 0) {
    lines.push("", "## Entry points", "", ...overview.entryPoints.slice(0, 15).map((e) => `- \`${e}\``));
  }
  if (overview.scripts.length > 0) {
    lines.push("", "## Commands (root package.json)", "");
    for (const s of overview.scripts.slice(0, 40)) {
      lines.push(`- \`${s.name}\`: \`${s.command.replace(/`/g, "'")}\`${s.where ? ` \`${s.where}\`` : ""}`);
    }
  }
  const text = lines.join("\n") + "\n";
  const count = text.split("\n").length - 1;
  if (count > INDEX_MAX_LINES) {
    throw new Error(`INDEX.md would have ${count} lines; the budget is ${INDEX_MAX_LINES}. Raise maxFiles so fewer areas are produced.`);
  }
  return text;
}
