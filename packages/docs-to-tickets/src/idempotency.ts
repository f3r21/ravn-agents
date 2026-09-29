import { createHash } from "node:crypto";

const MARKER = /<!--\s*ravn-agents:key=([0-9a-f]{16})\s*-->/;

export function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * GitHub's create-issue call has no idempotency key, so we derive one from what makes a ticket
 * the same ticket: the target repo, the requirements it covers and its normalised title.
 */
export function idempotencyKey(repo: string, sourceRefs: readonly string[], title: string): string {
  const material = [repo.toLowerCase(), [...sourceRefs].sort().join(","), normaliseTitle(title)].join("\n");
  return createHash("sha256").update(material).digest("hex").slice(0, 16);
}

export function marker(key: string): string {
  return `<!-- ravn-agents:key=${key} -->`;
}

export function readMarker(body: string | null | undefined): string | null {
  return body ? (MARKER.exec(body)?.[1] ?? null) : null;
}
