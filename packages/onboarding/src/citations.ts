/**
 * Citations are written as inline code: `path/to/file.ts:12` or `path/to/file.ts:12-30`.
 * The validator checks each one against the git tree at the stamped SHA, so a page can
 * only cite files and lines that exist there.
 */

export interface Citation {
  raw: string;
  path: string;
  start: number;
  end: number;
}

const CITATION = /`([^`\s]+?):(\d+)(?:-(\d+))?`/g;

export function parseCitations(text: string): Citation[] {
  const citations: Citation[] = [];
  for (const match of text.matchAll(CITATION)) {
    const [raw, path, start, end] = match;
    // A URL with a port (`http://localhost:5173`) is not a file citation.
    if (!path || !start || path.includes("://")) continue;
    const startLine = Number(start);
    citations.push({ raw, path: path.replace(/^\.\//, ""), start: startLine, end: end ? Number(end) : startLine });
  }
  return citations;
}

export function hasCitation(text: string): boolean {
  return parseCitations(text).length > 0;
}

/** Answers "how many lines does this file have at the stamped SHA", or undefined when it is absent. */
export type LineCounter = (path: string) => number | undefined;

export function countLines(content: string): number {
  if (content === "") return 0;
  const lines = content.split("\n");
  return content.endsWith("\n") ? lines.length - 1 : lines.length;
}

export function checkCitation(citation: Citation, lineCount: LineCounter): string | undefined {
  const lines = lineCount(citation.path);
  if (lines === undefined) return `${citation.raw}: file does not exist at the stamped SHA`;
  if (citation.start < 1) return `${citation.raw}: line numbers start at 1`;
  if (citation.end < citation.start) return `${citation.raw}: range ends before it starts`;
  if (citation.end > lines) return `${citation.raw}: file has only ${lines} lines`;
  return undefined;
}

export function checkCitations(citations: readonly Citation[], lineCount: LineCounter): string[] {
  return citations.map((c) => checkCitation(c, lineCount)).filter((e): e is string => e !== undefined);
}
