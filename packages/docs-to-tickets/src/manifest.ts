import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type EntryStatus = "planned" | "dry_run" | "created" | "skipped_duplicate" | "failed";

export interface ManifestEntry {
  key: string;
  title: string;
  source_refs: string[];
  needs_review: boolean;
  review_reasons: string[];
  status: EntryStatus;
  issue_number?: number;
  url?: string;
  /** Set when the issue exists but its review label did not stick. */
  label_missing?: boolean;
  error?: { category: string; failure_mode: string; what_failed: string };
  updated_at: string;
}

export interface Manifest {
  version: 1;
  repo: string;
  entries: ManifestEntry[];
}

export const MANIFEST_FILE = "manifest.json";

/** `<owner>__<repo>`: the per-repo state directory name, shared by the CLI and the server. */
export function repoDirName(repo: string): string {
  return repo.replace("/", "__");
}

/** Where the server keeps a repo's state: `<base>/<owner>__<repo>/`, with base `${CLAUDE_PLUGIN_DATA}/tickets`. */
export function repoStateDir(base: string, repo: string): string {
  return path.join(base, repoDirName(repo));
}

/**
 * The batch manifest: written before the first create and after every call, so an interrupted
 * batch can be resumed and reconciled against GitHub by idempotency key. `fileFor` maps a repo to
 * its manifest file, so the server (one base, many repos) and the CLI (one repo dir) share files.
 */
export class ManifestStore {
  private readonly fileFor: (repo: string) => string;
  private readonly now: () => Date;

  constructor(fileFor: (repo: string) => string, now: () => Date = () => new Date()) {
    this.fileFor = fileFor;
    this.now = now;
  }

  /** A store over `<base>/<owner>__<repo>/manifest.json`, for any repo. */
  static underBase(base: string, now?: () => Date): ManifestStore {
    return new ManifestStore((repo) => path.join(repoStateDir(base, repo), MANIFEST_FILE), now);
  }

  /** A store over one repo's state directory, `<stateDir>/manifest.json`. */
  static inRepoDir(stateDir: string, now?: () => Date): ManifestStore {
    return new ManifestStore(() => path.join(stateDir, MANIFEST_FILE), now);
  }

  pathFor(repo: string): string {
    return this.fileFor(repo);
  }

  load(repo: string): Manifest {
    try {
      const m = JSON.parse(readFileSync(this.pathFor(repo), "utf8")) as Manifest;
      if (m.version !== 1 || !Array.isArray(m.entries)) throw new Error(`${this.pathFor(repo)} is not a version 1 manifest`);
      return m;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, repo, entries: [] };
      throw error;
    }
  }

  private save(manifest: Manifest): void {
    const file = this.pathFor(manifest.repo);
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(tmp, file);
  }

  /** Inserts or updates one entry by key, keeping plan order, and writes the file. */
  upsert(repo: string, entry: Omit<ManifestEntry, "updated_at">): ManifestEntry {
    const manifest = this.load(repo);
    const stamped: ManifestEntry = { ...entry, updated_at: this.now().toISOString() };
    const at = manifest.entries.findIndex((e) => e.key === entry.key);
    if (at === -1) manifest.entries.push(stamped);
    else manifest.entries[at] = stamped;
    this.save(manifest);
    return stamped;
  }

  get(repo: string, key: string): ManifestEntry | undefined {
    return this.load(repo).entries.find((e) => e.key === key);
  }
}

export interface BatchSummary {
  created: ManifestEntry[];
  skipped_duplicate: ManifestEntry[];
  failed: ManifestEntry[];
  not_attempted: ManifestEntry[];
}

export function summarise(manifest: Manifest): BatchSummary {
  const pick = (...s: EntryStatus[]) => manifest.entries.filter((e) => s.includes(e.status));
  return {
    created: pick("created"),
    skipped_duplicate: pick("skipped_duplicate"),
    failed: pick("failed"),
    not_attempted: pick("planned", "dry_run"),
  };
}
