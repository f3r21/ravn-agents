import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Requirement } from "./types.ts";

export interface BriefFile {
  /** Path relative to the brief root, `/`-separated, extension kept. */
  relPath: string;
  /** File content with any YAML frontmatter removed. */
  content: string;
}

export interface Brief {
  root: string;
  files: BriefFile[];
}

const byNaturalOrder = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/** Reads a brief from one Markdown file or a directory of them (recursively, in natural order). */
export function loadBrief(briefPath: string): Brief {
  const root = path.resolve(briefPath);
  if (statSync(root).isFile()) {
    return { root, files: [{ relPath: path.basename(root), content: stripFrontmatter(readFileSync(root, "utf8")) }] };
  }
  const relPaths = walkMarkdown(root).sort(byNaturalOrder);
  return {
    root,
    files: relPaths.map((relPath) => ({
      relPath,
      content: stripFrontmatter(readFileSync(path.join(root, relPath), "utf8")),
    })),
  };
}

function walkMarkdown(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkMarkdown(root, rel));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) out.push(rel);
  }
  return out;
}

export function stripFrontmatter(text: string): string {
  const normalised = text.replace(/\r\n/g, "\n");
  if (!normalised.startsWith("---\n")) return normalised;
  const end = normalised.indexOf("\n---", 4);
  if (end === -1) return normalised;
  const after = normalised.indexOf("\n", end + 4);
  return after === -1 ? "" : normalised.slice(after + 1);
}

/** The brief as one Markdown text for the model, each file under a heading naming its path. */
export function renderBrief(brief: Brief): string {
  return brief.files.map((f) => `## ${f.relPath}\n\n${f.content.trim()}\n`).join("\n");
}

interface Section {
  segments: string[];
  lines: string[];
}

function splitSections(files: BriefFile[]): Section[] {
  const sections: Section[] = [];
  for (const file of files) {
    const fileSegments = file.relPath.replace(/\.md$/i, "").split("/");
    const headings: string[] = [];
    let current: Section = { segments: fileSegments, lines: [] };
    sections.push(current);
    for (const line of file.content.split("\n")) {
      const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (heading) {
        const level = heading[1]!.length;
        headings.length = Math.min(headings.length, level - 1);
        headings[level - 1] = heading[2]!;
        current = { segments: [...fileSegments, ...headings.filter(Boolean)], lines: [] };
        sections.push(current);
      } else {
        current.lines.push(line);
      }
    }
  }
  return sections;
}

const CHECKBOX = /^(\s*)[-*+]\s+\[[ xX]\]\s+(.*)$/;
const LIST_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;

function indentOf(line: string): number {
  return (/^\s*/.exec(line.replace(/\t/g, "    "))?.[0] ?? "").length;
}

/** Top-level units of one section: checkboxes when there are any, otherwise top-level list items. */
function unitsOf(lines: string[]): { text: string; kind: Requirement["kind"] }[] {
  const hasCheckbox = lines.some((l) => CHECKBOX.test(l));
  const pattern = hasCheckbox ? CHECKBOX : LIST_ITEM;
  const kind: Requirement["kind"] = hasCheckbox ? "checkbox" : "item";
  const units: string[][] = [];
  let baseIndent = 0;
  let open = false;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, "    ");
    if (line.trim() === "") continue;
    const indent = indentOf(line);
    const match = pattern.exec(line);
    if (match && (units.length === 0 || indent <= baseIndent)) {
      baseIndent = indent;
      units.push([match[2]!.trim()]);
      open = true;
    } else if (open && indent > baseIndent) {
      units[units.length - 1]!.push(line.trim().replace(/^[-*+]\s+/, ""));
    } else {
      open = false;
    }
  }
  return units.map((parts) => ({ text: cleanText(joinUnit(parts)), kind }));
}

function joinUnit(parts: string[]): string {
  const [head, ...rest] = parts;
  return rest.length === 0 ? head! : `${head} ${rest.join("; ")}`;
}

function cleanText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\(\1\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(segment: string): string {
  return segment
    .replace(/^\d+(?:\.\d+)*[.)]?\s*/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Section slugs, lengthened with parent segments until they are unique across the brief. */
function sectionSlugs(sections: Section[]): string[] {
  const depth = sections.map(() => 1);
  const slugAt = (i: number) =>
    sections[i]!.segments
      .slice(-depth[i]!)
      .map(slugify)
      .filter(Boolean)
      .join("-") || "section";
  for (;;) {
    const slugs = sections.map((_, i) => slugAt(i));
    const clashing = new Set(slugs.filter((s, i) => slugs.indexOf(s) !== i));
    if (clashing.size === 0) return slugs;
    let grew = false;
    slugs.forEach((s, i) => {
      if (clashing.has(s) && depth[i]! < sections[i]!.segments.length) {
        depth[i]!++;
        grew = true;
      }
    });
    if (!grew) return slugs.map((s, i) => (clashing.has(s) ? `${s}-${i + 1}` : s));
  }
}

/** A unit is optional when its text says so, or when its section is a bonus / optional list. */
const OPTIONAL_TEXT = /\(optional\)/i;
const OPTIONAL_SECTION = /\b(bonus|optional|nice[ -]to[ -]have|stretch goals?)\b/i;

/** Deterministic requirement units with stable ids. Same brief, same ids. */
export function parseRequirements(brief: Brief | BriefFile[]): Requirement[] {
  const files = Array.isArray(brief) ? brief : brief.files;
  const sections = splitSections(files).filter((s) => unitsOf(s.lines).length > 0);
  const slugs = sectionSlugs(sections);
  return sections.flatMap((section, i) =>
    unitsOf(section.lines).map((unit, n) => ({
      id: `${slugs[i]}.${n + 1}`,
      section: section.segments.join("/"),
      text: unit.text,
      kind: unit.kind,
      optional: OPTIONAL_TEXT.test(unit.text) || OPTIONAL_SECTION.test(section.segments.join("/")),
    })),
  );
}
