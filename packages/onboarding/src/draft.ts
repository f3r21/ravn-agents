import { type Citation, parseCitations } from "./citations.js";

/**
 * The prose layer of an area page, as an area-mapper subagent writes it.
 *
 * The format is fixed so code can check it: known headings only, and every claim (a
 * Summary paragraph or a bullet, with its continuation lines) carries at least one
 * `path:line` citation.
 */

export const REQUIRED_SECTIONS = ["Summary", "Key files", "How it works"] as const;
export const OPTIONAL_SECTIONS = ["Gotchas"] as const;
const KNOWN_SECTIONS = new Set<string>([...REQUIRED_SECTIONS, ...OPTIONAL_SECTIONS]);

export interface DraftLimits {
  maxLines: number;
  maxChars: number;
}

export const DEFAULT_DRAFT_LIMITS: DraftLimits = { maxLines: 90, maxChars: 9000 };

export interface DraftCheck {
  errors: string[];
  summary: string;
  citations: Citation[];
  /** The draft normalised: trailing whitespace trimmed, one blank line between blocks. */
  body: string;
}

interface Claim {
  section: string;
  line: number;
  text: string;
}

function splitClaims(lines: string[]): { claims: Claim[]; headings: { name: string; line: number }[]; stray: number[] } {
  const claims: Claim[] = [];
  const headings: { name: string; line: number }[] = [];
  const stray: number[] = [];
  let section: string | undefined;
  let current: Claim | undefined;
  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const lineNo = index + 1;
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      section = heading[1].trim();
      headings.push({ name: section, line: lineNo });
      current = undefined;
      return;
    }
    if (line.trim() === "") {
      if (section === "Summary") current = undefined;
      return;
    }
    if (section === undefined) {
      stray.push(lineNo);
      return;
    }
    // Nested bullets are claims of their own; only plain indented text continues a claim.
    const startsBullet = /^\s*[-*]\s+/.test(line);
    const continuation = current !== undefined && !startsBullet && (/^\s{2,}\S/.test(line) || section === "Summary");
    if (continuation && current) {
      current.text += ` ${line.trim()}`;
      return;
    }
    current = { section, line: lineNo, text: line.trim() };
    claims.push(current);
  });
  return { claims, headings, stray };
}

function firstSentence(text: string): string {
  const plain = text
    .replace(/\s*\(?`[^`\s]+?:\d+(?:-\d+)?`\)?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const end = plain.search(/\.(\s|$)/);
  const sentence = end >= 0 ? plain.slice(0, end + 1) : plain;
  return sentence.length > 160 ? `${sentence.slice(0, 157).trimEnd()}...` : sentence;
}

export function checkDraft(draft: string, limits: DraftLimits = DEFAULT_DRAFT_LIMITS): DraftCheck {
  const errors: string[] = [];
  const body = draft.replace(/\r\n/g, "\n").replace(/^\s*#\s+[^\n]*\n/, "").trim();
  const lines = body.split("\n");
  if (lines.length > limits.maxLines) errors.push(`draft has ${lines.length} lines; the limit is ${limits.maxLines}`);
  if (body.length > limits.maxChars) errors.push(`draft has ${body.length} characters; the limit is ${limits.maxChars}`);

  const { claims, headings, stray } = splitClaims(lines);
  if (stray.length > 0) errors.push(`text before the first "## " heading (line ${stray[0]})`);
  const seen = new Set<string>();
  for (const heading of headings) {
    if (!KNOWN_SECTIONS.has(heading.name)) {
      errors.push(`line ${heading.line}: unknown section "${heading.name}"; allowed: ${[...KNOWN_SECTIONS].join(", ")}`);
    }
    if (seen.has(heading.name)) errors.push(`line ${heading.line}: section "${heading.name}" appears twice`);
    seen.add(heading.name);
  }
  for (const required of REQUIRED_SECTIONS) {
    if (!seen.has(required)) errors.push(`missing section "${required}"`);
    else if (!claims.some((c) => c.section === required)) errors.push(`section "${required}" is empty`);
  }
  for (const claim of claims) {
    if (parseCitations(claim.text).length === 0) {
      errors.push(`line ${claim.line} (${claim.section}): claim has no \`path:line\` citation: "${claim.text.slice(0, 80)}"`);
    }
  }
  const summaryClaim = claims.find((c) => c.section === "Summary");
  return {
    errors,
    summary: summaryClaim ? firstSentence(summaryClaim.text) : "",
    citations: parseCitations(body),
    body: body.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n") + "\n",
  };
}
