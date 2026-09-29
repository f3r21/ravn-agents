---
name: ask-codebase
description: Answers a question about the current repository by using docs/codebase-map/ as a router (index, then one or two area pages), then confirming the answer against the cited code before replying, with file:line evidence. Use when the user asks where something lives, what a module does, how a flow works or why code is built a certain way, and the repository has a docs/codebase-map/INDEX.md.
argument-hint: "<question about this repository>"
allowed-tools: Read, Grep, Glob, Bash(node *)
---

# Answer from the codebase map, confirmed against the code

Question: $ARGUMENTS

Map status right now:
!`node "${CLAUDE_PLUGIN_ROOT}/packages/onboarding/dist/map-cli.js" status`

The map is a router, not a source of truth. It tells you which files to read; the code decides
the answer.

## Steps

1. **No map?** If the status says there is no map, answer by searching the code directly
   (Grep, Glob, Read) and say `Map: none` in the provenance line. Suggest `/ravn-agents:onboard`.
2. **Route.** Read `docs/codebase-map/INDEX.md`. Pick the one or two areas most likely to hold
   the answer and read only those pages under `docs/codebase-map/areas/`. Do not read every page.
3. **Confirm.** Open the files and lines the pages cite for the claims you will use, with Read
   (use an offset near the cited line). Follow imports with Grep when the answer crosses areas.
   Every claim in your answer must rest on code you read in this step, not on the page text.
4. **Handle what the map gets wrong.**
   - Area listed as stale in the status above: its page may be out of date. Treat it as a hint,
     verify everything against the code, and say the area was stale.
   - Map and code disagree: the code wins. State what the code does, and note that the map
     page (with its SHA) says otherwise.
   - Question not covered by any page, or an area marked "Not covered": say `not covered by the
     map`, then search the code directly. If the code does not contain the answer either, say
     so plainly instead of guessing.
5. **Answer.** Keep it short:
   - the answer first, in one to five sentences or a short list;
   - `Evidence:` bullets of `path:line` (or `path:start-end`) that you read;
   - one provenance line: `Map: built at <sha> · pages: <slugs> · stale: <none | slugs, verified against code>`.
