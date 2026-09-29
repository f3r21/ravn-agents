---
name: onboard
description: Builds or refreshes the codebase map in docs/codebase-map/ of the current git repository - a generated layer (tree, packages, entry points, scripts, exports) plus one validated prose page per area, written by area-mapper subagents in parallel. Use when the user asks to map or onboard onto a repository, or to refresh a stale map (pass --refresh to re-map only stale areas).
argument-hint: "[--refresh]"
disable-model-invocation: true
allowed-tools: Bash(node *), Agent, Read
model: claude-opus-5-5
---

# Build or refresh the codebase map

Arguments: `$ARGUMENTS`. With `--refresh`, only stale, new or uncovered areas are re-mapped.

The CLI below does every deterministic step (area split, facts, hashes, validation, INDEX.md).
You coordinate: run it, spawn one `area-mapper` per area, then let it validate. Do not write
map pages yourself and do not edit the drafts.

CLI: `node "${CLAUDE_PLUGIN_ROOT}/packages/onboarding/dist/map-cli.js"`. Run each command exactly
as written, with no `;`, `&&`, `echo` or redirection added: the Bash tool already reports the exit
code, and a compound command needs a permission prompt that headless runs cannot answer.

## Steps

1. **Plan.** Run `node "${CLAUDE_PLUGIN_ROOT}/packages/onboarding/dist/map-cli.js" plan`
   (append `--refresh` if it is in the arguments) from the repository root.
   - Exit code 2 means a precondition failed (for example uncommitted changes). Show the
     message to the user and stop; do not work around it.
   - If the output has `"upToDate": true`, tell the user the map is fresh and stop.
2. **Map in parallel.** For every entry in `toMap`, spawn the `area-mapper` subagent. Send all
   the Agent calls in a single message so they run in parallel. Each task prompt contains
   only that area's data, as structured text:

   ```
   Repository root: <repo>
   Area: <slug> (<title>)
   Paths: <paths>
   factsPath: <repo>/<factsPath>
   draftPath: <repo>/<draftPath>
   oldPage: <repo>/<oldPage>            (refresh only, when present)
   changedFiles: <changedFiles>         (refresh only, when present)
   ```

   Subagents inherit nothing from this conversation; everything they need is above.
3. **Assemble.** Run `node "${CLAUDE_PLUGIN_ROOT}/packages/onboarding/dist/map-cli.js" assemble`.
   It validates each draft (format, a citation on every claim, every cited path and line
   exists at HEAD) and writes `docs/codebase-map/INDEX.md` and `areas/<slug>.md`.
4. **Retry once.** For each area whose status is `missing`, spawn `area-mapper` again with the
   same prompt plus `Previous attempt rejected:` and the listed errors, all in one message.
   Then run `assemble` again. Do not retry a second time: an area that still fails stays
   marked "not covered" with its reason, which is the honest outcome.
5. **Report** to the user, briefly: the SHA the map was built at, areas mapped and areas not
   covered (with the reason), INDEX.md line count, and these reminders:
   - Review and commit `docs/codebase-map/` yourself; `.build/` is ignored by its own `.gitignore`.
   - The map is reached through `/ravn-agents:ask-codebase`. Do not add an `@docs/codebase-map`
     import to CLAUDE.md: imports load at every launch. At most, add a one-line pointer.
   - A `SessionStart` hook reports stale areas; refresh with `/ravn-agents:onboard --refresh`.

## Failure handling

- A subagent that returns `failed` or times out needs no special action: `assemble` marks its
  area `missing` because no draft exists, and step 4 retries it once.
- `assemble` exiting 2 with "HEAD moved" means the user committed during the build. Run
  `plan` again (with `--refresh` if a map exists) and continue.
- Never write, fix or "complete" a rejected draft yourself: unvalidated prose is what the
  validator exists to keep out of the map.
