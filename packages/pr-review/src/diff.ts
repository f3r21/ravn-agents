/** Unified diff parsing: which lines exist on which side, so a finding can be checked before posting. */

import type { Side } from "./types.ts";

export interface DiffLine {
  kind: "add" | "del" | "ctx";
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface DiffFile {
  /** Path at the head (new path); for a deletion, the old path. */
  path: string;
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  hunks: DiffHunk[];
}

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(p: string): string | null {
  if (p === "/dev/null") return null;
  return p.replace(/^[ab]\//, "");
}

/** Parses `git diff` / `gh pr diff` output. Unknown lines are ignored rather than fatal. */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const raw of text.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      const m = /^diff --git a\/(.+) b\/(.+)$/.exec(raw);
      file = {
        path: m?.[2] ?? "",
        oldPath: m?.[1] ?? null,
        status: "modified",
        binary: false,
        hunks: [],
      };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;
    if (!hunk) {
      if (raw.startsWith("new file mode")) file.status = "added";
      else if (raw.startsWith("deleted file mode")) file.status = "deleted";
      else if (raw.startsWith("rename from ")) file.status = "renamed";
      else if (raw.startsWith("Binary files ") || raw.startsWith("GIT binary patch")) file.binary = true;
      else if (raw.startsWith("--- ")) {
        file.oldPath = stripPrefix(raw.slice(4).trim());
        continue;
      } else if (raw.startsWith("+++ ")) {
        const p = stripPrefix(raw.slice(4).trim());
        if (p) file.path = p;
        else if (file.oldPath) file.path = file.oldPath;
        continue;
      }
    }
    const h = HUNK_RE.exec(raw);
    if (h) {
      oldNo = Number(h[1]);
      newNo = Number(h[3]);
      hunk = { header: raw, oldStart: oldNo, newStart: newNo, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    const tag = raw[0];
    const body = raw.slice(1);
    if (tag === "+") {
      hunk.lines.push({ kind: "add", oldLine: null, newLine: newNo++, text: body });
    } else if (tag === "-") {
      hunk.lines.push({ kind: "del", oldLine: oldNo++, newLine: null, text: body });
    } else if (tag === " ") {
      hunk.lines.push({ kind: "ctx", oldLine: oldNo++, newLine: newNo++, text: body });
    }
    // "\ No newline at end of file" and trailing empty strings carry no line.
  }
  return files;
}

/** Lines a review comment may target, per side, as GitHub accepts them: any line shown in a hunk. */
export function commentableLines(file: DiffFile): Record<Side, Set<number>> {
  const right = new Set<number>();
  const left = new Set<number>();
  for (const h of file.hunks) {
    for (const l of h.lines) {
      if (l.newLine !== null) right.add(l.newLine);
      if (l.kind === "del" && l.oldLine !== null) left.add(l.oldLine);
      if (l.kind === "ctx" && l.oldLine !== null) left.add(l.oldLine);
    }
  }
  return { RIGHT: right, LEFT: left };
}

/** Lines the PR changed on the head side: the lines a finding should normally anchor to. */
export function addedLines(file: DiffFile): Set<number> {
  const out = new Set<number>();
  for (const h of file.hunks) for (const l of h.lines) if (l.kind === "add" && l.newLine !== null) out.add(l.newLine);
  return out;
}

const GENERATED: { re: RegExp; reason: string }[] = [
  { re: /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?)$/, reason: "lockfile" },
  { re: /(^|\/)dist\//, reason: "build output in dist/" },
  { re: /(^|\/)(build|coverage|storybook-static)\//, reason: "build output" },
  { re: /\.min\.(js|css)$/, reason: "minified" },
  { re: /\.map$/, reason: "source map" },
  { re: /(^|\/)__snapshots__\//, reason: "test snapshot" },
  { re: /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf)$/i, reason: "binary asset" },
];

/** Why a path is left out of review, or null when it is reviewed. */
export function exclusionReason(file: DiffFile): string | null {
  if (file.binary) return "binary file";
  if (file.status === "deleted") return "file deleted";
  for (const g of GENERATED) if (g.re.test(file.path)) return g.reason;
  return null;
}

/**
 * Renders a file's hunks with explicit line numbers, so finders cite lines without counting hunk
 * offsets. Columns: base line, head line, marker, text.
 */
export function annotate(file: DiffFile): string {
  const out = [`### ${file.path} (${file.status}${file.oldPath && file.oldPath !== file.path ? ` from ${file.oldPath}` : ""})`];
  for (const h of file.hunks) {
    out.push(h.header);
    for (const l of h.lines) {
      const o = l.oldLine === null ? "" : String(l.oldLine);
      const n = l.newLine === null ? "" : String(l.newLine);
      const mark = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
      out.push(`${o.padStart(6)} ${n.padStart(6)} ${mark}${l.text}`);
    }
  }
  return out.join("\n");
}
