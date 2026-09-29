import { execFileSync } from "node:child_process";

/** One file of a commit's tree, as `git ls-tree -r` lists it. */
export interface TreeEntry {
  mode: string;
  type: string;
  hash: string;
  path: string;
}

/** Thin, synchronous access to one repository. Every call is read-only. */
export interface Git {
  readonly root: string;
  run(args: string[]): string;
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly args: string[],
  ) {
    super(message);
    this.name = "GitError";
  }
}

export function gitAt(root: string): Git {
  return {
    root,
    run(args) {
      try {
        return execFileSync("git", ["-C", root, ...args], {
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        const stderr = (error as { stderr?: string }).stderr ?? "";
        throw new GitError(`git ${args.join(" ")} failed: ${stderr.trim() || String(error)}`, args);
      }
    },
  };
}

/** The repository root containing `cwd`, or undefined when `cwd` is not inside a work tree. */
export function findRepoRoot(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

export function headSha(git: Git): string {
  return git.run(["rev-parse", "HEAD"]).trim();
}

/** True when `sha` names a commit this clone has (it may be gone after a rebase or in a shallow clone). */
export function commitExists(git: Git, sha: string): boolean {
  try {
    git.run(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export function parseLsTree(output: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of output.split("\0")) {
    if (record === "") continue;
    const tab = record.indexOf("\t");
    const [mode, type, hash] = record.slice(0, tab).split(" ");
    if (tab < 0 || mode === undefined || type === undefined || hash === undefined) {
      throw new Error(`unexpected ls-tree record: ${record}`);
    }
    entries.push({ mode, type, hash, path: record.slice(tab + 1) });
  }
  return entries;
}

/** Every file in the tree of `rev`, recursively. One git call, no model involved. */
export function listTree(git: Git, rev: string): TreeEntry[] {
  return parseLsTree(git.run(["ls-tree", "-r", "-z", rev]));
}

export function showFile(git: Git, rev: string, path: string): string {
  return git.run(["show", `${rev}:${path}`]);
}

/** Paths with uncommitted changes (staged, unstaged or untracked). */
export function dirtyPaths(git: Git): string[] {
  const output = git.run(["status", "--porcelain", "-z", "--untracked-files=all"]);
  const paths: string[] = [];
  const records = output.split("\0");
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    paths.push(record.slice(3));
    // A rename or copy is followed by its source path as a separate record.
    if (record[0] === "R" || record[0] === "C") i++;
  }
  return paths;
}

export function changedFiles(git: Git, from: string, to: string): string[] {
  return git
    .run(["diff", "--name-only", "-z", from, to])
    .split("\0")
    .filter((p) => p !== "");
}
