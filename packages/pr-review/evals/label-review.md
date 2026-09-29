# Hand-label review of `items.json`

Prepared 2026-09-27 as input for confirming the frozen items. Recommendations only: `items.json`
is unchanged, and each item is confirmed by the maintainer. Method per item: the inducing PR's diff at
the labelled lines, the fix PR's title, body and diff, and for clean items a search of later PRs
and issues referencing the PR or its files.

## Tally

First pass (the 22 SZZ items):

| Group | Confirm | Do not confirm | Unsure |
|---|---|---|---|
| Bug items (11) | 3 (kit#112, kit#67 partial, app#4) | 8 | 0 (kit#67 has one unsure defect) |
| Clean items (11) | 8 | 2 (kit#38 and app#21 carry real defects) | 1 (kit#66) |

Second pass (issue-linked mining, 2026-09-27): 9 new or reclassified bug items, now in
`items.json` as `confirmed: false`. app#21 and kit#38 moved from clean to bug; kit#112 gained a
second defect. Totals after both passes: 20 bug items, 9 clean items. If the first-pass
recommendations are accepted, 12 bug items and 8 or 9 clean items remain.

Likely reviewer severity of the new items: high for app#21 (open proxy) and app#9 (safety hook
never blocks); medium for app#6, app#15, app#44 and kit#38; low for app#5, kit#35 and kit#65.
The headline metric counts only inline (high/critical) catches, so `caught_anywhere_recall` is
the fairer number for the medium and low items.

Suggested relabel, not applied: app#109's current label fails the first pass, but the item has two
better defects (a `useMemo` that freezes "today" in `BoardColumn`, fixed in #140; tag chips that
lost `uppercase`, fixed only by a kit bump in #116). See the app mining notes below.

## Bug items

### ravn-ui-kit#84 — fix(task-meta-badges): give the badges an accessible name that survives axe
- **Label:** decorative mode removed, `src/components/card/task-meta-badges.tsx:12-72`, fix #109
- **Inducing diff:** `label: string` was already required before #84; the badge was silent only
  because `aria-label` is prohibited on a role-less `<span>`. #84 replaces it with an `sr-only` span.
- **Fix PR:** "restore the decorative mode #19 removed by accident": adds `decorative: true` as an
  additive union member ("Additive… Minor").
- **Recommendation:** DO NOT CONFIRM. Announcing the badges was #84's intent; decorative mode is a
  new feature. Live dry-run on 2026-09-26 did not flag it, correctly.


### ravn-ui-kit#67: feat(figure-audit): refuse to credit a command that cannot detect a failing run (#53)
Three defects; verdict per defect.
- **(a) Label:** isBlindPipe flags a verification inside `$(...)` followed by a downstream pipe, `scripts/figure-audit.mjs:88-88`, fix #75
  - **Inducing diff:** L88 (new in #67) `if (cmd.includes('|') && VERIFICATION.test(cmd) && !STATUS_ECHO.test(cmd)) return true;`. That is co-occurrence, not the "pipe that discards a status" rule the L73-77 comment states. #75 replaces it with a segment split and substitution blanking.
  - **Recommendation:** UNSURE, leaning do not confirm. The code is new in #67 and #75 changes it deliberately. But the flagged spelling, `out=$(npm run gate); echo "$out" | grep`, with no `rc=$?`, still loses the gate's status: `$?` after the line is grep's. #67 already credited the `rc=$?` form. So #75 arguably loosens the rule and is not fixing a clear bug.
  - **Severity:** low-medium (false positive in a repo tooling metric script).
- **(b) Label:** STATUS_ECHO ignores `set -o pipefail`, `:83-83`, fix #81
  - **Inducing diff:** L83 (new in #67) `const STATUS_ECHO = /PIPESTATUS|pipestatus|\brc=\$\?/;`. #81 appends `|pipefail`.
  - **Recommendation:** CONFIRM (weak). This is a real false positive on a line #67 introduced: pipefail does preserve the failure. #75's reviewer flagged it in review as a follow-up. It is an omitted case, and at the time no corpus document used pipefail.
  - **Severity:** low.
- **(c) Label:** FENCE does not strip inline code, `:25-25`, fix #81
  - **Inducing diff:** L25 `const FENCE = ...` is **not** in #67's diff. #67's hunks start at L48. #81 adds INLINE_CODE and REDIRECT as new constants and does not change L25.
  - **Recommendation:** DO NOT CONFIRM. The defect predates #67 and sits outside its changed lines.
  - **Severity:** n/a
- **Item overall:** only (b) survives, at low severity, so this item cannot produce a high/critical hit. Consider dropping it or keeping (b) alone.

### ravn-ui-kit#112: ci: check that a branch's changelog entries land in [Unreleased] (#107)
- **Label:** misplacedEntries trims before testing ENTRY, so an added nested bullet is reported as unlocatable, `scripts/changelog-placement.mjs:90-91`, fix #119
- **Inducing diff:** new file in #112. L56 `const ENTRY = /^- \S/;`, L72 `entrySections` tests the raw `line`, and L90-91 `const entry = raw.trim(); if (!ENTRY.test(entry)) continue;`. The two halves disagree, so `  - nested` becomes `- nested`, is never found in `sections`, and goes to `unlocatable`.
- **Fix PR:** "fix(changelog-placement): stop reporting nested bullets as corruption (#107)". Moves the ENTRY test before the trim. It fired on the first PR to add a nested bullet, and 9 already existed in CHANGELOG.md.
- **Recommendation:** CONFIRM. A real, reproducible defect, entirely in lines #112 introduced. A careful reviewer comparing L72 with L90-91 could spot it.
- **Severity a reviewer would give:** medium, possibly high. CI fails on an ordinary changelog shape and blocks the merge, but only in repo tooling.

### ravn-ui-kit#83: fix(add-task-modal): switch chips in one click, not two (#82)
- **Label:** non-wrapping chip row overflows under a fallback font, `src/components/modal/add-task-modal.tsx:213-213`, fix #150
- **Inducing diff:** #83 changed `<div className="flex items-center gap-4 w-full">` to `<div ref={chipRowRef} className="flex items-center gap-4 w-full">`. It only added the ref, and the class list is unchanged.
- **Fix PR:** "fix(font-fallback): wrap AddTaskModal's chip row, add a reusable sweep tool (#20)". Adds `flex-wrap` after a DejaVu Sans sweep found a 9px overflow, tracked under the older kit#20.
- **Recommendation:** DO NOT CONFIRM. The overflow predates #83, and SZZ picked the line only because #83 touched it to add `ref`. The fix touches the line incidentally.
- **Severity:** n/a (would be low anyway)

### ravn-task-management-challenge#86: refactor: collapse the duplicated selects, filters and async states
- **Label:** AsyncSection renders children only on `status === 'success'`, so a failed background refetch replaces the cached board with the error state, `src/ui/async-section/async-section.tsx:74-91`, fix #140
- **Inducing diff:** new component. L79 `{status === 'error' ? (<div role="alert">…)}` and L91 `{status === 'success' ? children : null}`. #86 removed identical branching from `board-page.tsx` and `profile-page.tsx` (`-{status === 'error' ? (<BoardError …` / `-{status === 'success' ? (`).
- **Fix PR:** #140 "ten defects from a high-effort review". Adds `hasData` so content stays and the error appears beside it.
- **Recommendation:** DO NOT CONFIRM. The defect is real, but it predates #86: both pages already branched on `status` the same way. #86 is a behaviour-preserving extraction, and blame lands on it only because the code moved into a new file.
- **Severity a reviewer would give:** medium. It is real UX breakage under `refetchOnWindowFocus`, but it was not introduced here.

### ravn-task-management-challenge#83: refactor(board): one dialog state machine, and transport rules where they can be tested
- **Label:** toUpdateInput resends every field instead of only the edited ones, so a concurrent edit is overwritten, `src/features/board/task-mapping.ts:98-108`, fix #140
- **Inducing diff:** new file. L98-108 `toUpdateInput` returns `{id, name, status, tags, dueDate, pointEstimate, position?, assigneeId}`. #83 removed the same full-field `updateTask.mutateAsync({ name: fields.name.trim(), …, tags, pointEstimate, assigneeId })` from board-page/use-board-actions. The PR body says the transport rules "move out", and it pins a round trip.
- **Fix PR:** #140 (defect 3 of 10). Diffs against `toFormFields(task)`, so an unedited save sends `{ id }` only.
- **Recommendation:** DO NOT CONFIRM. The full-snapshot update predates #83, which moved it verbatim into a testable function. It is also closer to a design improvement (patch semantics never adopted) than a bug the PR introduced.
- **Severity:** low-medium, not attributable to #83.


### ravn-task-management-challenge#4 — Create tasks from a modal
- **Label:** focus always jumps to the name field on any validation error, e.g. "Pick a due date.", `src/features/board/task-form-dialog.tsx:80-90`, fix #140
- **Inducing diff:** new file. L88-91: `if (validationError) { setSubmitState(...); nameRef.current?.focus(); return }`. The same PR adds `validateTaskForm` in `task-form-state.ts`, which returns 'Give the task a name.', 'Pick a due date.' or 'Position has to be a number.'. So the PR itself introduced the mismatch.
- **Fix PR:** #140 "ten defects from a high-effort review". Validation now returns `{field, message}`, and the dialog focuses the name field only when `field === 'name'`.
- **Recommendation:** CONFIRM. The code is real, was introduced in this PR, and both halves are visible in the same diff. At 1,377 changed lines the PR is under the 6k cap and fair to review, but the defect is one line inside a large UI PR.
- **Severity a reviewer would give:** low, at most medium (an a11y/UX focus issue). It would not count as a high/critical hit.

### ravn-task-management-challenge#118 — migrate the header and view switcher onto @ravn/ui-kit
- **Label:** header search writes `?name=` through the board filters on every route, `src/features/navigation/app-header.tsx:55-66`, fix #140
- **Inducing diff:** L63-65 `onSearchChange={(name) => { setFilter('name', name) }}` replaces the removed `setFilter('name', event.target.value)` (diff line 108). `useBoardFilters()` and the unconditional write were both already there.
- **Fix PR:** #140. Adds a `useLocation` check: the board route still uses `setFilter`, and other routes navigate to `/?name=`.
- **Recommendation:** DO NOT CONFIRM. The bug predates #118, which only moved the existing write from a raw `<input>` onto the kit's `TopNav` prop. Blame lands on #118 only because it rewrote the line.
- **Severity a reviewer would give:** low.

### ravn-task-management-challenge#117 — migrate the list view onto @ravn/ui-kit's TaskTable
- **Label (a):** list view renders TaskTable without paint containment, so the page scrolls sideways, `src/features/board/board-list-table.tsx:65`, fix #146
- **Label (b):** board scroll container adds its width to the document, `src/features/board/board.tsx:62-63`, fix #142
- **Inducing diff:** (a) new file, L65 `return <TaskTable groups={groups} />`. (b) L62-63 only extracts the existing inline class string `'... xl:overflow-x-auto xl:pb-2'` into a `GRID_WRAPPER` const. The same string appears as a `-` line in the diff.
- **Fix PRs:** #142 adds `contain-paint` to the board wrapper. #146 adds `contain-paint` to the list table, removes the shell's max-width cap and fixes the skeleton.
- **Recommendation:** DO NOT CONFIRM. (b) predates #117; it is a pure move. (a) is a real bug introduced here, but it cannot be seen in the diff. The kit's TaskTable already scrolls correctly, and #142 itself says "why Chrome counted the columns at all is not established". It needs layout measurement, not review.
- **Severity a reviewer would give:** medium, if spotted at all.

### ravn-task-management-challenge#74 — Provision lane worktrees with scripts/new-lane.sh
- **Label:** closing message tells lanes to export .env into the shell before `claude`, `scripts/new-lane.sh:242-249`, fix #134
- **Inducing diff:** L240-251 heredoc: ".mcp.json expands ${VITE_API_TOKEN} from the environment of the shell that launches claude … `cd $TARGET && export $(grep -v '^#' .env | xargs) && claude`".
- **Fix PR:** #134 "stop telling every lane to export .env into its shell". Rewrites the message because "neither has been true since #123", which moved `.mcp.json` to `sh -c` sourcing `.env` itself.
- **Recommendation:** DO NOT CONFIRM. The instruction was correct when #74 merged. It went stale because of a later change (#123), so this is requirement drift, not a bug #74 introduced.
- **Severity a reviewer would give:** low. At most a nit about secrets in the shell env, which is not the labelled defect.

### ravn-task-management-challenge#109 — migrate the board onto @ravn/ui-kit (A3)
- **Label:** `toKitTableRowProps` never passes `indicatorColor`, so every list row shows the default green stripe, `src/features/board/task-card/to-kit-props.ts:137-160`, fix #153
- **Inducing diff:** new adapter L137-159 returns title/points/dueDate/tags/assignee/`...options`/`isSelectable: false`, with no `indicatorColor`. At #109 the list view still renders the app's own `task-row.tsx`, which draws no stripe at all (no indicator/colour code in it at headSha 1064e09).
- **Fix PR:** #153 "color the list view's indicator stripe by task status". Bumps the kit to v0.9.0 and passes `indicatorColor: statusToIndicatorColor(task.status)`, a helper kit#141 added later.
- **Recommendation:** DO NOT CONFIRM. At #109 there was no visible stripe; it only appeared once #117 rendered rows through the kit's TaskTable (kit v0.5.3/v0.7.0 default `'green'`). The status→colour mapping was not settled until kit#141, since the design showed inconsistent colours. It is a kit gap plus a later feature, not a defect in this diff.
- **Severity a reviewer would give:** low.

## Clean items


Method: `gh pr view`/`gh pr diff` for each item; dumped every PR and issue body of both repos and
grepped them for `#<n>` and the item's file/function names; diffed each item's added lines against
the removed lines of every later candidate PR (fix-titled or not); read `git log` per key file via
`gh api .../commits?path=`.

### ravn-ui-kit#42: feat(scripts): new-lane.sh, provision a worktree that cannot start broken
- **Content:** +255/-0. A 154-line bash script plus a 61-line vitest guard test; the rest is CHANGELOG/CONTRIBUTING. Real code, but it is repo tooling, not the shipped library.
- **Evidence of hidden defect:** none found. `scripts/new-lane.sh` has exactly one commit (this PR). The app's twin script was fixed in app#134 (a stale `export .env` hint), but the kit copy has no such line.
- **Recommendation:** CONFIRM. Real, non-trivial shell code with no later fix. It is tooling, so it tests the reviewer on shell and not React.

### ravn-ui-kit#38: feat: every figure carries the command that re-derives it
- **Content:** +243/-0. 125 lines are templates, CHANGELOG and CLAUDE.md. The only code is `scripts/figure-audit.mjs` (+118).
- **Evidence of hidden defect:** yes. This PR adds `FENCE = /```[\s\S]*?```/g` and `FIGURE = /\d[\d,]*.../g`. Issues kit#69 (inline code is not stripped, which contradicts the script's own comment) and kit#70 (`2>&1` is counted as the figures 2 and 1) describe defects in those exact lines. kit#53 (it scores a pipe-blind command as valid) is also a defect. They were fixed in kit#67 (feat-titled), kit#75 and kit#81. SZZ missed them because the fixes mostly *added* lines (`INLINE_CODE`, redirect stripping) rather than deleting #38's lines.
- **Recommendation:** DO NOT CONFIRM. It carries at least two real defects that a correct reviewer could flag, and the rest is mostly docs.

### ravn-ui-kit#106: test(release): catch the two changelog corruptions a union merge produces (#74)
- **Content:** +269/-1. `scripts/release-checks.mjs` +88 (`duplicateHeadings`, `duplicateEntries`, wired into `check()`), a test file +158, and CHANGELOG. Real tooling code.
- **Evidence of hidden defect:** none found. kit#112 deleted #106's "documents the gap: relocation alone leaves both checks silent" test, but only because it closed that documented limitation (#107). That was not a bug fix. kit#119's nested-bullet fix is in `changelog-placement.mjs`, which came from #112, not from this PR.
- **Recommendation:** CONFIRM. Real code and a clean history; the one later edit resolves a limitation the PR itself declared.

### ravn-ui-kit#66: fix(modal): describe an alertdialog, and let a consumer pin it open (#64)
- **Content:** +152/-21. `modal.tsx` +27/-4 (spreads `contentProps`, adds `isDismissable`), `modal.test.tsx` +83, plus dist/ and CHANGELOG. Real library code.
- **Evidence of hidden defect:** partial. No later fix touches its lines. Later edits to `modal.tsx` (#89, #148, #149) are feature and refactor work. But `isDismissable={false}` still leaves the header close button calling `onClose` unconditionally, and that is still true on `main` (`modal.tsx:154`). The app had to work around it with its own `onClose` gate (app#101: "the kit's close button calls onClose unconditionally"). This gap contradicts the prop's own doc ("a delete that is already running should not be dismissable").
- **Recommendation:** UNSURE. A reviewer that flags the unpinned close button would be right, yet it would be scored as noise. Confirm only if you judge that gap out of scope.

### ravn-ui-kit#131: chore(tooling): measure the prop surface, and split declared from inherited
- **Content:** +839/-0. `prop-surface.mjs` (199) and `consumer-prop-usage.mjs` (172) use the TypeScript checker API, plus a 373-line test and a 95-line CHANGELOG entry. Real tooling code; nothing user-facing.
- **Evidence of hidden defect:** none found. The only later touches are test expectations updated in kit#148/#149 because those PRs intentionally changed Tag's props, not because of a bug.
- **Recommendation:** CONFIRM. A substantial, realistic, non-trivial control with no defect signal.

### ravn-task-management-challenge#21: feat: deploy to Vercel, with a proxy so the live API works without shipping the token
- **Content:** +783/-57. `api/graphql.ts` +135 (serverless proxy), `src/lib/env.ts` +88, the client, tests, vercel.json and README. Real, security-relevant code.
- **Evidence of hidden defect:** yes, strong. Issue app#36 ("C3: the proxy is an open proxy to RAVN's shared API, and its timeout can never fire") names `api/graphql.ts:34` (`TIMEOUT_MS = 10_000`, which equals Vercel's 10 s limit) and `:99` (`body: await request.text()`, which forwards any operation). app#46 (titled "Foundation — app-code lane", commits `2ab4886 fix(proxy): serve six fixed operations…` and `c4db22d`) deletes that exact `body: await request.text()` line. SZZ missed it because #46's PR title is not fix-titled.
- **Recommendation:** DO NOT CONFIRM. This is a bug item in disguise: open proxy plus a dead timeout, fixed in #46.

### ravn-task-management-challenge#7: Show the signed-in user on a settings route
- **Content:** +421/-13. `profile-page.tsx` +119, `use-profile.ts`, an app-header avatar, a `due-date.ts` rewrite to `Intl` UTC parts, and tests (+216). Real code.
- **Evidence of hidden defect:** none attributable. app#46 changed #7's `<Avatar src={profile.avatar}>` lines, but the root cause (app#26) is API seed data pointing at a decommissioned dicebear host that answers 410 with a valid SVG, which nobody could see from the diff. app#155 re-scoped "My task" from profile to task list, and calls the original "a defensible literal reading": a product change, not a bug. app#86/#93/#108 are refactors.
- **Recommendation:** CONFIRM. Real code, and the later changes are external-data or product decisions, not reviewable defects.

### ravn-task-management-challenge#80: perf(board): stop every keystroke re-rendering the board, and delete optimistically
- **Content:** +533/-78 across 10 board files: `memo(TaskCard)`, `useMemo` grouping, shared `renderSelectOption`, optimistic delete with rollback, and a render-cost test. Real, subtle React code.
- **Evidence of hidden defect:** none direct. app#81 flags an unenforced invariant (labels freeze if the items are hoisted), which is a missing test, not a bug. app#140 fixed a frozen "today" via a `now` prop that production never passed. That predates #80, though `memo(TaskCard)` may have made it a little stickier. Later removals of #80's lines (#83, #86, #93, #109) are refactors and migrations.
- **Recommendation:** CONFIRM. A realistic, subtle control; the only nearby defect predates it.

### ravn-task-management-challenge#64: S1, the four graded items: update-failure toast, placeholder pages, green tier, mutation latency
- **Content:** +471/-46. About 20 lines of README and 5 binary screenshots. The rest is real code: `use-update-task`/`use-create-task` cache seeding, the error toast, the placeholder route, the badge tier, the sidebar, and about 250 lines of tests.
- **Evidence of hidden defect:** none attributable. app#140 rewrote this PR's race test (`namesSent` was `['Slack integration','Slack integration']`), because it replaced the pre-existing full-snapshot resend (from #5) with a diff. app#140 also added the missing *create* error toast, but that gap predates #64 and #64 did not introduce it. The in-PR commit `f30d1ca` fixes the PR's own earlier commit, so the head is clean.
- **Recommendation:** CONFIRM. Real mutation and cache code; the defects #140 found were not introduced here.

### ravn-task-management-challenge#73: Close two force-push evasions the guard's regex let through
- **Content:** +126/-19. `.claude/hooks/block-dangerous.sh` +31/-2 (new `GIT_GLOBAL_OPTION` and `FORCE_FLAG_END` regexes), `scripts/hooks.test.mjs` +78, CLAUDE.md. Real code (a bash ERE), but it is dev tooling.
- **Evidence of hidden defect:** none found. The hook has had no commit since this one, and no later issue reports a new evasion. app#136's "deny rule" claim concerns CLAUDE.md prose and settings deny globs, not this regex.
- **Recommendation:** CONFIRM. Small but dense regex logic a reviewer could plausibly nitpick, which makes it a fair noise probe.

### ravn-task-management-challenge#112: refactor(board): look the two remaining board values up instead of asserting them (#110)
- **Content:** +69/-9. About 15 lines of real logic (`readView` lookup, `readMember` via `allowed.find`); the rest is comments and a 26-line test.
- **Evidence of hidden defect:** none found. Later touches are app#118 (the toolbar migrated onto the kit) and app#114 (a CLAUDE.md count). Neither is a fix.
- **Recommendation:** CONFIRM. It is a clean control, but low-signal: tiny and type-level, so it says little beyond whether the reviewer invents findings on trivial refactors.

## Issue-linked mining: ravn-task-management-challenge


Method: I read all 52 issue bodies and the bodies of the fix PRs (#44, #46, #140, #23, #73, plus a
grep of every dev-based PR body for regression attributions). For each candidate I found the
inducing PR from `gh pr diff` and from `gh api commits?path=`, mapping commits to PRs with
`commits/<sha>/pulls`. I read line numbers from the file at the inducing PR's `headRefOid`.
Everything was read-only.

Six items, 11 defects. All are `confirmed: false`.

### Items

### app#21: deploy to Vercel with a proxy (currently a clean item; flip it to bug)
- **Defects:** `api/graphql.ts:94-101`, an open proxy: `body: await request.text()` is forwarded
  under RAVN's token with no allowlist, content-type check or size cap. `:99-103`: the inbound
  body read sits inside the try around `fetch`, so a client abort is reported as a 504 upstream
  timeout.
- **Trace:** the file is new in #21. #36 cites `:99`. Fix #46 (commit 2ab4886) deletes the line and
  says it moved the body read out of the try.
- **Not labelled:** the issue's timeout claim. #46 verified Hobby allows 300 s, so only the comment
  was wrong.
- **Severity:** open proxy **high**, arguably critical, since it can delete any task on a shared
  backend. Body-read misreport **low**.
- **Confidence:** high.

### app#6: Search and filter tasks
- **Defects:**
  - `use-board-filters.ts:67-72`: `readOwner` treats an empty directory as "loading". An errored
    Users query is also empty, so `?owner=` validation stays off for the whole session. Fix #46.
  - `:175`: `isFiltered` comes from the debounced `queryInput`, so Clear filters appears 300 ms
    late. Fix #46.
  - `app-header.tsx:40-55`: the header search writes `?name=` on any route, including
    `/settings`. Fix #140.
- **Trace:** all three blocks are new in #6. #34 cites the exact line numbers at #6's head. The
  status-less `useUsers()` line comes from #4, but #6 is the change that feeds it into validation.
- **Severity:** readOwner **medium** (the issue calls it security-adjacent; one reviewer might say
  high). isFiltered **low**. Header route **low**.
- **Confidence:** high overall. The header defect alone is medium: #140 names the symptom but not
  #6.

### app#9: AI toolkit config (hooks)
- **Defects:**
  - `block-dangerous.sh:4`: `COMMAND="$1"`, but PreToolUse sends JSON on stdin, so the hook never
    matches.
  - `:12-13`: `exit 1` is non-blocking, so the hook would not block even when it matched.
  - `settings.json:20-25`: `$FILE_PATH` does not exist, so the format hooks format nothing.
- **Trace:** both files are new in #9 (commit 7ff3376). #45 reports all three. Fix #44 (commits
  704d35a and a69fd6a). #44's body confirms the exit-code point and that the old script "returns
  exit 0 and empty output" on dangerous payloads.
- **Severity:** **high**. The safety control is completely inert. It is dev tooling, but its only
  purpose is safety. The formatter defect is **low**.
- **Confidence:** high. A reviewer needs to know the hook protocol, and it is documented.

### app#15: ci, bundle budget, Dependabot
- **Defect:** `.github/dependabot.yml:4-8` has no `target-branch: dev`. Dependabot PRs therefore
  target `main`.
- **Trace:** the file is new in #15. Four minutes after the merge, #17 (graphql 17) opened against
  `main` and merged unreviewed; #27 records the incident. Fix #23 (commit fa8b118) adds only that
  line.
- **Why a reviewer could catch it:** the "Branch layout" section in CLAUDE.md, at head, says
  nothing merges into `main` directly.
- **Severity:** **medium** (process and config: dev bypassed, branches diverged).
- **Confidence:** high.

### app#44: Foundation, app-config lane
- **Defect:** `block-dangerous.sh:70`. The FORCE_PUSH regex treats each git global option as one
  token, so `git -C <path> push --force` gets through. Its flag-end `([[:space:]]|$)` also misses
  `git push --force;` and `(git push --force)`.
- **Trace:** line 70 was written in #44 (commit 704d35a). #63 sections A and B describe it. Fix #73
  (commit 1b4a314) replaces exactly that line.
- **Severity:** **medium**. It is a bypass of a safety hook, and the server-side ruleset still
  protects `main` and `dev`.
- **Confidence:** medium. This is regex edge-case work inside a 2,048-line, mostly CI/docs PR.

### app#5: Edit and delete tasks
- **Defect:** `board-page.tsx:113-127`. `handleEdit` sends every field from the open-time
  snapshot. The same PR's `use-update-task.ts:10-12` says the input is a patch precisely to avoid
  clobbering a concurrent edit.
- **Trace:** #140 fixed it ("the patch semantics use-update-task.ts documents were never used").
  #83 later moved the code verbatim, which is why the label review rejected #83 as the source.
- **Severity:** **low-medium**. It is a lost-update race and needs concurrent editors.
- **Confidence:** medium. It could be read as unadopted patch semantics rather than a bug.

### Notes on existing items (not emitted, because they are already bug items)
- **app#109** has two better defects than its current label; consider relabelling.
  - `BoardColumn`'s `useMemo(() => now ?? new Date(), [now])` inside `memo(BoardColumn)`.
    Production never passes `now`, so "today" freezes at first render. Fixed in #140 via
    `useCurrentDay`.
  - Board tag chips lost `uppercase` when they moved onto the kit's `TaskCard`: "iOS app" instead
    of "IOS APP". #111 says "Introduced by app#31", i.e. PR #109. The fix was the kit bump in #116
    (kit#102), so the fix PR has no app-side line change.
- **app#7, #80, #64, #73, #112** (clean): no new defect found. #140's missing create-error toast
  and assignee-picker gap predate #64. #63's holes are in #44's regex, not #73's.

### Rejected issues
- **#26:** avatars. The cause is external seed data (a dicebear 410 response with a valid SVG), so
  it cannot be seen from any diff.
- **#27:** governance and branch protection are repo settings. Its Dependabot incident is used as
  evidence for app#15.
- **#28:** stale docs (drift).
- **#29, #30, #31, #32, #33:** migration and feature work.
- **#34 item 2:** two writers of the `name` key. This is maintainability, not wrong behaviour.
  Items 1 and 3 are used in app#6.
- **#35:** shipping graphql for one `print()` call is a performance issue. The per-file budget
  that can be gamed (from #15) is a weak check, not wrong behaviour.
- **#36 timeout half:** the premise was false. #46 measured the real limit at 300 s.
- **#37:** render cost and the awaited `invalidateQueries` are performance and latency, not
  incorrect behaviour.
- **#38, #39, #40, #110:** refactor requests.
- **#41:** test-integrity work (a tautological test and an act() warning), not a product defect.
- **#42, #43:** supply chain and e2e additions (new features).
- **#45 point 3:** `.claudeignore` being inert. Points 1 and 2 are used in app#9.
- **#51, #52, #53, #54, #57, #59, #62, #68, #70:** feature or process work.
- **#58:** the `URL.canParse` crash was caught in review on #46's own branch and never merged.
- **#61:** a missing CI check (new work).
- **#63 part C:** the inert deny globs live in the gitignored `settings.local.json`, not in any PR.
  Parts A and B are used in app#44.
- **#76, #84, #87, #90, #96, #98:** process and docs guidance, not code behaviour. #87 is a
  borderline doc defect in #67's `figures.md` exemplar.
- **#81:** a missing test for an invariant.
- **#94:** a new upstream advisory (drift).
- **#100:** a stale comment in a test file, plus a missing test. No behaviour change.
- **#105, #128, #131, #132, #135, #137:** docs claims and measurements.
- **#129:** drift caused by #123 (already rejected in the label review).
- **#144:** traces to #117, already a bug item. The label review found it is not visible in the
  diff.
- **#145:** a layout judgement (the issue itself calls it "a judgement"). The cap predates the
  candidate PRs.
- **#152:** a later feature plus a kit gap (label review).
- **#155:** a product re-scope.
- **#157:** a future regression from an unmerged kit PR.
- **#140's `main.tsx` `.then()` without `.catch()`:** it comes from #1, which is excluded.
- **#140's `toApiDateTime` comment and smoke-test list:** a comment and test drift.
- **#140's create toast and assignee-picker gaps:** they predate every eligible PR (#4 is already
  an item).

## Issue-linked mining: ravn-ui-kit


Method: I dumped every issue (69) and merged PR (72) body with comments, grepped for defect
reports and for later PRs saying "introduced in #N", and traced each candidate's lines to a PR
with `git blame` on a scratch clone. I mapped commits to PRs with
`gh api repos/.../commits/<sha>/pulls` and confirmed the lines with `gh pr diff` of the inducing
PR. Line numbers were checked through `gh api .../contents/<path>?ref=<headSha>`.

The main finding is structural. Almost every component defect reported in kit issues (#12, #19,
#33, #45, #46, #47, #64, #82, #92, #94, #102, #111, #130, #140, #141, #142) sits in code that was
pushed directly to `main` on 2026-08-03/04 with no PR, or that arrived in #17 (Foundation,
21,785 lines, excluded). The PR-attributable defects are nearly all in repo tooling and docs.

### Items

### ravn-ui-kit#38: feat: every figure carries the command that re-derives it (currently a clean item, now a bug item)
- **Defects:**
  - (a) `figure-audit.mjs:22-25`: FENCE skips inline code. Fixed by #81 (#69).
  - (b) `:38`: FIGURE counts `2>&1` as the figures 2 and 1. Fixed by #81 (#70).
  - (c) `:46-58`: SOURCED credits the blind-pipe exemplar at :51. Fixed by #67 (#53).
  - (d) `CLAUDE.md:125`: blind-pipe exemplar. Fixed by #65 (#61).
- **Trace:** `figure-audit.mjs` is a new file in #38. #69 says outright "this predates #67". CLAUDE.md:125 is a `+` line in #38.
- **Reviewability:**
  - (a) is visible inside the file: the comment at :22-24 promises what :25 does not do.
  - (b) needs one mental test of the regex against the file's own exemplar at :51.
  - (c) and (d) need shell knowledge: `$?` of a pipeline is the last command's.
- **Confidence:** high for (a) and (b). Medium for (c) and (d), which depend on the "provenance must detect a failing run" rule that #53 and #61 made explicit a day later.
- **Not labelled:** the same blind exemplar sits in `.github/pull_request_template.md:30` and `.github/ISSUE_TEMPLATE/lane-task.md:29`. It is still on `main`, so there is no fix PR.
- **Severity a reviewer would likely give:** medium for (a) and (b), since the tool's one output is a wrong metric. Low to medium for (c) and (d). This is repo tooling, not shipped code.

### ravn-ui-kit#35: fix(claude): make the copied hooks actually run, and fail the gate when they do not
- **Defect (a):** `src/styles/decisions.mdx:98-102`. A GFM pipe table was added to an MDX page, and Storybook here has no remark-gfm (open issue #21), so it publishes as literal pipes.
  - **Evidence:** #36's body says: "`c7e1186` is a fix for a bug I introduced in #35". The same file already uses `<table>` at :25, and #21 names this file as the one that avoids the trap. A careful reviewer who knows #21 flags this at once.
  - **Severity:** low (published docs rendering).
- **Defect (b), low confidence:** `scripts/hooks.test.mjs:149-188`. These Prettier-spawning cases run under the undeclared 5s default timeout and flake under load (#63, fixed by #124). Blame puts them in e51333b, which is in #35. It is real flakiness, but a reviewer is unlikely to call it out, and #124 kept 5s for everything else. Drop this defect if you want the item strict.
  - **Severity:** low.
- **Item confidence:** medium.

### ravn-ui-kit#65: docs: fix the provenance exemplar, which could not detect a failing gate (#61)
- **Defect:** `CLAUDE.md:113-126`. #65 rewrote the tagging section for the Release workflow ("Tagging is a command now" at :95, "Do not cut tags by hand" at :113). It left :124-125 saying the reviewer cuts the real `vX.Y.Z` by hand. The fix is #77 (#76), whose author writes "#61 rewrote the top of that file … and left the bottom".
- **Why it counts:** the contradiction was created by this PR and is not later drift, because the file was consistent before it.
- **Caveat:** :120-126 are unchanged lines just past the hunk (the hunk ends at :121). The reviewer needs the file at head, and the range deliberately spans both halves.
- **Severity:** low (docs contradiction in a rules file lanes follow).
- **Confidence:** medium.

### Addendum for an existing bug item (not in the JSON)

**ravn-ui-kit#112** carries a second defect, fixed by the same #119:
- **What:** the new "Check changelog entries land in [Unreleased]" step (`.github/workflows/ci.yml:132-150` at #112's head) is inserted between "Build library" and "Check committed dist/ is fresh". It even splits the dist guard's comment block from its step.
- **Effect:** a placement failure ends the job before the dist/ freshness, Storybook and axe checks run. It also breaks the dist check's documented premise that "the build ran immediately above".
- **Evidence:** #119's CHANGELOG entry: "The step also moved to last in the CI job … It sat between 'Build library' and the `dist/` freshness check".
- **Severity:** medium-low.
- Consider adding it to the existing #112 item.

### Current clean items re-checked
- **#42, #106, #131:** no defect found. Consistent with label-review.md.
- **#66:** the gap is real but still unfixed on `main`. `modal.tsx:154` is `onClick={onClose}` regardless of `isDismissable`, and there is no fix PR, so it cannot become a bug item. It stays "unsure" as a clean item.

### Rejected issues
- #5, #6, #7, #8, #9, #10, #11, #13, #14, #15, #16, #23, #24, #25, #34, #39, #40, #57, #59, #72, #86, #90, #91, #95, #97, #98, #107, #113, #122, #123, #129, #135, #137, #138, #147: planning, feature or requirement issues. None describes wrong behaviour of a specific PR's lines.
- #12: TaskTableRow keyboard gap and AddTaskModal stale state are in pre-PR code, fixed inside #17.
- #19 / #93: TaskMetaBadges silence is pre-PR code. #93 asks for a new decorative mode, which is a feature (label-review already rejects #84←#109).
- #20: font-fallback overflow is pre-PR. #83 only added a ref to the row (label-review rejects #83).
- #21: missing remark-gfm is a pre-PR config gap.
- #22: inert hooks were copied in 7514d38, which is part of #17 (excluded).
- #33: the dist guard's `--intent-to-add` came from aa11803, which is in #17 (excluded).
- #45, #46, #47: Skeleton, Button and Avatar defects are in pre-PR direct-push code.
- #49 / #50: citations of gitignored docs are pre-PR.
- #51: a test-coverage gap, not wrong behaviour.
- #53, #61, #69, #70: used, attributed to #38.
- #54: v0.5.0 was cut by hand with no bumped version. No PR's lines are involved (release metadata).
- #56: a missing check (feature).
- #63: used (low) under #35. The DatePickerMenu half is not a defect (#124 kept its timeout).
- #64: Modal dropping `contentProps` comes from a759ec2, pre-PR direct push.
- #71: class (3) is already in items.json under #67 (fix #75). Classes (1) and (2) are not defects or were never fixed.
- #74: a union-merge process gap, fixed by adding checks (feature).
- #76: used, attributed to #65.
- #78: already in items.json under #67 (fix #81).
- #79: the PR template's HTML comment under the review heading came from d6edf85, which is in #17 (excluded).
- #82: AddTaskModal's two-click chip switch is a pre-PR popover design, unchanged by any PR ≤6k lines before #83.
- #92, #94, #102, #111: pre-PR code (task-card/task-table from 2026-08-04 direct pushes). #111's missing cell predates #52, and #52 did not touch task-table.
- #100: release.yml and CLAUDE.md claims about v0.5.0 were true when #58/#65 merged. The tag was deleted later, so this is drift.
- #105: an unobserved guard, not a defect.
- #130: Datepicker's white field is pre-PR (f9aacde/28392ab). #1 touched the file but not the surface classes.
- #132: undeclared Node floor is a pre-existing config gap, surfaced by the #133 bump and not introduced by it.
- #139: docs-only request.
- #140, #141, #142: chevron, green default and header wrap all blame to pre-PR commits (bb39b9c, b0cfbe5, 28392ab).
- PR-body-only candidates:
  - #62 on #58: the `release-checks.mjs` entry guard exits 0 only if the file is renamed. That is latent hardening, not wrong behaviour.
  - #87 on #84: a missing CHANGELOG entry has no line to point at.
  - #125: the README install line and the forwardRef exemplar went stale through later changes (drift).
