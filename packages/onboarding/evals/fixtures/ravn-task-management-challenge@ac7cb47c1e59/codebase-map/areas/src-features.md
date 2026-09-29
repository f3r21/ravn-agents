---
area: "src-features"
title: "src/features"
paths: ["src/features/"]
tree_hash: "a28738be0b5fc39e2425bff3be8702b3cac831a3"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-26T21:58:14.483Z"
status: "ok"
summary: "`src/features` holds the app's three domain areas — `board`, `navigation`, `profile` — each a self-contained slice of hooks, mappers and components with no c..."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/features

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/features` holds the app's three domain areas — `board`, `navigation`, `profile` — each a
self-contained slice of hooks, mappers and components with no cross-feature imports allowed
(enforced by a lint rule per `src/features/board/task-types.ts:10`). `board` is by far the
largest: it owns the task list, its filters, and the create/edit/delete flow, consumed both by
`BoardPage` and by `MyTaskPage` in `src/app/`. `src/features/board/board-page.tsx:44`

## Key files
- `src/features/board/board-page.tsx:44` — the dashboard route: wires `useTasks`,
  `useUsers`, `useBoardFilters` and `useBoardDialogs` into the toolbar, filter bar, three
  dialogs and the async board/list/empty states.
- `src/features/board/board.tsx:93` — groups tasks by status (`groupByStatus`,
  `src/features/board/board.tsx:22`) and switches between the grid columns and
  `BoardListTable` based on `view`.
- `src/features/board/use-tasks.ts:13` — `taskKeys`, the single query-key namespace every
  mutation invalidates, and `useTasks` (`src/features/board/use-tasks.ts:44`), which keeps
  previous results on screen via `placeholderData: keepPreviousData`.
- `src/features/board/use-board-actions.ts:40` — the three mutations' UI contract: create/edit
  reject (so `TaskFormDialog` can show an inline error and stay open) while `remove` returns a
  `ConfirmOutcome` instead.
- `src/features/board/use-delete-task.ts:44` — the one optimistic mutation; it removes the task
  from every cached filter permutation in `onMutate` and rolls back per-query snapshots in
  `onError`.
- `src/features/board/use-board-filters.ts:151` — reads/writes all board filters as URL search
  params (`FILTER_PARAMS`, `src/features/board/use-board-filters.ts:43`), so the header search
  box and the filter bar share state through the URL rather than each other.
- `src/features/board/use-board-dialogs.ts:71` — one discriminated union (`BoardDialog`,
  `src/features/board/use-board-dialogs.ts:25`) is the source of truth for which of
  create/edit/delete is open, driving three derived `OverlayTriggerState`s for the kit's `Modal`.
- `src/features/board/task-mapping.ts:117` — `toCreateInput`/`toUpdateInput`/`toFormFields`
  convert between the form's fields and the GraphQL input types; `toUpdateInput` sends only the
  fields that changed from `toFormFields(task)`.
- `src/features/board/task-card/to-kit-props.ts:64` — `taskPresentation` computes the seven
  fields both the card and the list-row kit components need, then `toKitCardProps`
  (`src/features/board/task-card/to-kit-props.ts:102`) and `toKitTableRowProps`
  (`src/features/board/task-card/to-kit-props.ts:152`) just rename them per component.
- `src/features/navigation/app-header.tsx:52` — the top bar; wires the URL-backed search to
  `useBoardFilters` when on the board route and navigates to `/` with a `?name=` otherwise.
- `src/features/profile/use-profile.ts:18` — `useProfile`, shared under `profileKeys.current`
  by both `AppHeader`'s avatar and the settings page so they can't disagree about who is signed in.

## How it works
- `BoardPage` treats a `pending` and an `error` `useUsers()` status differently from a plain
  `data === undefined` check, because both leave `data` undefined but only the failed case
  should permanently disable owner filtering. `src/features/board/board-page.tsx:56-63`
  `src/features/board/use-board-filters.ts:109-118`
- Deleting a task is the only optimistic mutation; create and update instead seed the cache
  from the server response, because the server decides the id/position/creator on create and
  the resolved patch on update. `src/features/board/use-delete-task.ts:25-42`
- `useBoardActions.remove` never rejects — it reports failure through a toast and returns
  `'keep-open'` — because `DeleteTaskDialog` has no place for an inline error, unlike
  `create`/`edit` which rethrow so the form dialog can render one.
  `src/features/board/use-board-actions.ts:80-92` `src/features/board/delete-task-dialog.tsx:66-80`
- `MyTaskPage` (outside this area, in `src/app/`) filters by `assigneeId`, not `ownerId`,
  reusing `useTasks`, `useBoardDialogs`, `useBoardActions` and `Board` directly rather than
  routing through `BoardPage`. `src/app/my-task-page.tsx:37-47`
- `Board`'s grid wrapper class `GRID_WRAPPER` is exported specifically so `board-skeleton.tsx`
  can reuse the identical string, keeping the loading layout from drifting from the loaded one.
  `src/features/board/board.tsx:82-91`

## Gotchas
- The `toApiDateTime` calendar-day-to-`DateTime` rule is not centralized: `use-board-filters.ts`
  assembles the same `T00:00:00.000Z` suffix inline rather than importing the helper, so a
  change to how a calendar day is sent has to be made in both places.
  `src/features/board/task-mapping.ts:27-32` `src/features/board/use-board-filters.ts:219`
- `toUpdateInput` diffs against `toFormFields(task)`, not against `task` itself, so "unchanged"
  is defined in the form's own vocabulary (e.g. trimmed strings, sorted tags) — comparing
  against the raw task previously caused stale-snapshot overwrites when a colleague's edit
  landed while the dialog was open. `src/features/board/task-mapping.ts:117-131`
- A second concurrent delete is unsafe: `useDeleteTask`'s `onMutate` takes one cache snapshot
  per call, and two overlapping deletes would let the later rollback resurrect a task the
  earlier delete legitimately removed — currently prevented only by the modal confirmation
  dialog and a disabled Delete button. `src/features/board/use-delete-task.ts:63-69`

## Generated facts

Produced by code from the git tree at the stamped SHA; not written by a model.

### Files (47 total, 17 tests)

- `src/features/board/board-column.tsx`
- `src/features/board/board-filters.tsx`
- `src/features/board/board-list-table.tsx`
- `src/features/board/board-page.tsx`
- `src/features/board/board-skeleton.tsx`
- `src/features/board/board-toolbar.tsx`
- `src/features/board/board.tsx`
- `src/features/board/delete-task-dialog.tsx`
- `src/features/board/icon-field.tsx`
- `src/features/board/option-select.tsx`
- `src/features/board/select-option.tsx`
- `src/features/board/task-card/task-actions-menu.tsx`
- `src/features/board/task-card/to-kit-props.ts`
- `src/features/board/task-display.ts`
- `src/features/board/task-form-dialog.tsx`
- `src/features/board/task-form-state.ts`
- `src/features/board/task-mapping.ts`
- `src/features/board/task-types.ts`
- `src/features/board/use-board-actions.ts`
- `src/features/board/use-board-dialogs.ts`
- `src/features/board/use-board-filters.ts`
- `src/features/board/use-create-task.ts`
- `src/features/board/use-delete-task.ts`
- `src/features/board/use-tasks.ts`
- `src/features/board/use-update-task.ts`
- `src/features/board/use-users.ts`
- `src/features/navigation/app-header.tsx`
- `src/features/navigation/app-sidebar.tsx`
- `src/features/profile/profile-page.tsx`
- `src/features/profile/use-profile.ts`

### Exports (66)

- `columnTitle` (function) `src/features/board/board-column.tsx:25`
- `BoardColumn` (const) `src/features/board/board-column.tsx:96`
- `BoardFiltersBar` (function) `src/features/board/board-filters.tsx:57`
- `BoardListTable` (const) `src/features/board/board-list-table.tsx:112`
- `BoardPage` (function) `src/features/board/board-page.tsx:44`
- `BoardSkeleton` (function) `src/features/board/board-skeleton.tsx:39`
- `BoardView` (type) `src/features/board/board-toolbar.tsx:3`
- `BoardToolbar` (function) `src/features/board/board-toolbar.tsx:46`
- `GRID_WRAPPER` (const) `src/features/board/board.tsx:89`
- `GRID_COLUMN` (const) `src/features/board/board.tsx:91`
- `Board` (function) `src/features/board/board.tsx:93`
- `ConfirmOutcome` (type) `src/features/board/delete-task-dialog.tsx:19`
- `DeleteTaskDialog` (function) `src/features/board/delete-task-dialog.tsx:66`
- `IconField` (function) `src/features/board/icon-field.tsx:34`
- `OptionalSelect` (function) `src/features/board/option-select.tsx:57`
- `RequiredSelect` (function) `src/features/board/option-select.tsx:119`
- `TagMultiSelect` (function) `src/features/board/option-select.tsx:168`
- `SelectOption` (interface) `src/features/board/select-option.tsx:10`
- `renderSelectOption` (function) `src/features/board/select-option.tsx:37`
- `findOption` (function) `src/features/board/select-option.tsx:52`
- `TaskActionsMenu` (function) `src/features/board/task-card/task-actions-menu.tsx:19`
- `KIT_FIELD_NAMES` (const) `src/features/board/task-card/to-kit-props.ts:47`
- `toKitCardProps` (function) `src/features/board/task-card/to-kit-props.ts:102`
- `toKitTableRowProps` (function) `src/features/board/task-card/to-kit-props.ts:152`
- `statusLabel` (function) `src/features/board/task-display.ts:27`
- `tagLabel` (function) `src/features/board/task-display.ts:44`
- `tagAccent` (function) `src/features/board/task-display.ts:116`
- `pointValue` (function) `src/features/board/task-display.ts:134`
- `pointsLabel` (function) `src/features/board/task-display.ts:157`
- `TaskFormDialog` (function) `src/features/board/task-form-dialog.tsx:85`
- `TaskFormFields` (interface) `src/features/board/task-form-state.ts:13`
- `TaskFormAction` (type) `src/features/board/task-form-state.ts:36`
- `taskFormReducer` (function) `src/features/board/task-form-state.ts:51`
- `TaskFormField` (type) `src/features/board/task-form-state.ts:79`
- `TaskFormProblem` (interface) `src/features/board/task-form-state.ts:81`
- `validateTaskForm` (function) `src/features/board/task-form-state.ts:95`
- `toApiDateTime` (function) `src/features/board/task-mapping.ts:34`
- `toCreateInput` (function) `src/features/board/task-mapping.ts:46`
- `toFormFields` (function) `src/features/board/task-mapping.ts:87`
- `toUpdateInput` (function) `src/features/board/task-mapping.ts:117`
- `BOARD_STATUSES` (const) `src/features/board/task-types.ts:35`
- `ALL_TAGS` (const) `src/features/board/task-types.ts:44`
- `ALL_POINT_ESTIMATES` (const) `src/features/board/task-types.ts:47`
- `BoardActions` (interface) `src/features/board/use-board-actions.ts:10`
- `useBoardActions` (function) `src/features/board/use-board-actions.ts:40`
- `BoardDialog` (type) `src/features/board/use-board-dialogs.ts:25`
- `BoardDialogs` (interface) `src/features/board/use-board-dialogs.ts:31`
- `useBoardDialogs` (function) `src/features/board/use-board-dialogs.ts:71`
- `BoardFilters` (interface) `src/features/board/use-board-filters.ts:24`
- `FILTER_PARAMS` (const) `src/features/board/use-board-filters.ts:43`
- `DirectoryStatus` (type) `src/features/board/use-board-filters.ts:58`
- `SEARCH_DEBOUNCE_MS` (const) `src/features/board/use-board-filters.ts:120`
- `useBoardFilters` (function) `src/features/board/use-board-filters.ts:151`
- `useCreateTask` (function) `src/features/board/use-create-task.ts:20`
- `useDeleteTask` (function) `src/features/board/use-delete-task.ts:44`
- `taskKeys` (const) `src/features/board/use-tasks.ts:13`
- `useTasks` (function) `src/features/board/use-tasks.ts:44`
- `useUpdateTask` (function) `src/features/board/use-update-task.ts:14`
- `userKeys` (const) `src/features/board/use-users.ts:6`
- `useUsers` (function) `src/features/board/use-users.ts:18`
- (+6 more, not listed)
