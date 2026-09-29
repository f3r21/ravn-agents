import { describe, expect, it } from "vitest";
import { checkDraft } from "./draft.js";

const valid = `## Summary
The router of the app. It maps paths to pages. \`src/app/routes.tsx:22\`

## Key files
- \`src/app/routes.tsx:22\` — the route table.
- \`src/app/app.tsx:15\` — mounts the router
  and the providers.

## How it works
- Routes are a plain array. \`src/app/routes.tsx:11-21\`

## Gotchas
- The shell wraps each element. \`src/app/routes.tsx:17\`
`;

describe("checkDraft", () => {
  it("accepts a draft in the fixed format and extracts the summary's first sentence", () => {
    const check = checkDraft(valid);
    expect(check.errors).toEqual([]);
    expect(check.summary).toBe("The router of the app.");
    expect(check.citations).toHaveLength(5);
  });

  it("treats indented text as the continuation of a bullet, so its citation covers both lines", () => {
    expect(checkDraft(valid).errors).toEqual([]);
  });

  it("rejects a bullet without a citation, and a nested bullet without one", () => {
    const draft = valid.replace("- Routes are a plain array. `src/app/routes.tsx:11-21`", "- Routes are a plain array.\n  - Nested claim. ");
    const errors = checkDraft(draft).errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/How it works\): claim has no `path:line` citation: "- Routes are a plain array\."/);
    expect(errors[1]).toMatch(/Nested claim/);
  });

  it("rejects unknown and missing sections and text before the first heading", () => {
    const errors = checkDraft("Intro text\n## Summary\nx `a.ts:1`\n## Overview\n- y `a.ts:2`\n").errors;
    expect(errors).toContain('text before the first "## " heading (line 1)');
    expect(errors.some((e) => e.includes('unknown section "Overview"'))).toBe(true);
    expect(errors).toContain('missing section "Key files"');
    expect(errors).toContain('missing section "How it works"');
  });

  it("rejects an empty required section", () => {
    expect(checkDraft(valid.replace("- Routes are a plain array. `src/app/routes.tsx:11-21`\n", "")).errors).toContain(
      'section "How it works" is empty',
    );
  });

  it("enforces the size budget instead of truncating", () => {
    const long = valid + Array.from({ length: 100 }, (_, i) => `- claim ${i} \`a.ts:${i + 1}\``).join("\n");
    expect(checkDraft(long).errors.some((e) => /lines; the limit is 90/.test(e))).toBe(true);
  });

  it("drops a leading H1 title the mapper may add", () => {
    expect(checkDraft(`# src/app\n\n${valid}`).errors).toEqual([]);
  });

  it("strips citations and cuts long summaries for the index", () => {
    const long = `## Summary\n${"word ".repeat(60)}end. \`a.ts:1\`\n## Key files\n- k \`a.ts:1\`\n## How it works\n- h \`a.ts:1\`\n`;
    const summary = checkDraft(long).summary;
    expect(summary.length).toBeLessThanOrEqual(160);
    expect(summary.endsWith("...")).toBe(true);
    expect(summary).not.toContain("`");
  });
});
