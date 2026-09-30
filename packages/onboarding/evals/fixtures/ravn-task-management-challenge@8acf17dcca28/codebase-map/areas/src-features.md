---
area: "src-features"
title: "src/features"
paths: ["src/features/"]
tree_hash: "5e4a62e91603015eeaacadaa382e8df41ddad3cb"
built_at_sha: "8acf17dcca28036fa99cf09408e3646901d6add1"
built_at: "2026-09-30T05:30:09.780Z"
status: "ok"
summary: "`src/features` holds the app's three product features."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/features

> Codebase map page, built at `8acf17dcca28`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/features` holds the app's three product features. `board/` is the task board: React Query hooks over the GraphQL client, URL-backed filters, create/edit/delete dialogs and adapters to `@ravn/ui-kit` components. `navigation/` holds the header and sidebar shell, and `profile/` holds the signed-in user page and its query. `src/app/routes.tsx` and `src/app/app-layout.tsx` mount them. `src/features/board/board-page.tsx:44` `src/features/navigation/app-header.tsx:52`

## Key files
- `src/features/board/board-page.tsx:44` — `BoardPage`, the route component. It only composes the pieces: users, filters, tasks, the dialog state machine and actions, then markup. Start here.
- `src/features/board/use-board-filters.ts:151` — `useBoardFilters`. Filters live in URL search params (`FILTER_PARAMS`), untrusted values are validated, and the name is debounced into `queryInput`.
- `src/features/board/use-tasks.ts:13` — `taskKeys` and `useTasks`. The query key includes the filter object, and `keepPreviousData` is set.
- `src/features/board/use-create-task.ts:20`, `src/features/board/use-update-task.ts:14`, `src/features/board/use-delete-task.ts:44` — the mutations and their cache-writing strategies.
- `src/features/board/use-board-actions.ts:40` — `create`/`edit`/`remove`: which mutation runs, which toast is shown, and how failure reaches the dialog.
- `src/features/board/task-mapping.ts:46` — pure form-to-API mappers (`toCreateInput`, `toUpdateInput`, `toFormFields`). Open this when a field is serialised wrongly.
- `src/features/board/task-card/to-kit-props.ts:41` — `KIT_FIELD_NAMES` and `toKitCardProps`/`toKitTableRowProps`, which map a `Task` to the kit's card and table-row props.
- `src/features/board/use-board-dialogs.ts:25` — the `BoardDialog` union (`none|create|edit|delete`) and the derived `OverlayTriggerState`s.
- `src/features/board/task-types.ts:35` — display order of statuses, tags and points, built with `exhaustiveList`.
- `src/features/navigation/app-sidebar.tsx:38` — `NAV_ITEMS`, which `routes.tsx` also uses to build the placeholder routes.

## How it works
- Data path: `useUsers` provides the owner ids, `useBoardFilters(ownerIds, status)` builds `queryInput`, `useTasks(queryInput)` fetches, and `Board` renders grid or list. `src/features/board/board-page.tsx:56-64` `src/features/board/board.tsx:116-141`
- Filters are read from `useSearchParams`. Every write uses `{ replace: true }`, and empty values delete the parameter. `queryInput` leaves empty fields out so `{}` and `{name:''}` share one cache key. `src/features/board/use-board-filters.ts:172-229`
- The header search box writes `?name=` through the same `setFilter`. Off the board route it navigates to `/?name=` instead. `src/features/navigation/app-header.tsx:80-86`
- Only one dialog can be open at a time: `BoardPage` switches on `dialog.kind`, and each dialog is mounted only while it is open, so every form starts fresh. `src/features/board/board-page.tsx:112-142`
- Create and update write the server response into every cached list (`setQueriesData` on `taskKeys.all`), then start an invalidation without awaiting it. Delete is the only optimistic mutation: it cancels in-flight queries, snapshots every list and rolls them all back on error. `src/features/board/use-create-task.ts:43-58` `src/features/board/use-delete-task.ts:52-107`
- `create` and `edit` rethrow so `TaskFormDialog` stays open with an inline error. `remove` never throws; it returns `'close'` or `'keep-open'`. `src/features/board/use-board-actions.ts:46-92` `src/features/board/task-form-dialog.tsx:135-140`
- `toUpdateInput` sends only the fields that changed, compared against `toFormFields(task)`, so saving does not overwrite a colleague's concurrent edit. `src/features/board/task-mapping.ts:117-148`

## Gotchas
- The two nullable fields in an update follow opposite rules. `assigneeId` is always sent, `null` included, because `null` is the only way to unassign. `position` is omitted when blank because it is a `Float!`, and `'0'` is a valid position. On create, `assigneeId` is omitted when empty. `src/features/board/task-mapping.ts:53` `src/features/board/task-mapping.ts:140-145`
- The `T00:00:00.000Z` date suffix is built in two places: `toApiDateTime` and inline in the filters. If you change one, change both. `src/features/board/task-mapping.ts:27-36` `src/features/board/use-board-filters.ts:219`
- `readOwner` needs the directory status, not just the ids. A failed `Users` query leaves the id list empty, like loading does, but must not pass unchecked `?owner=` values through. `src/features/board/use-board-filters.ts:109-118`
- Keep array defaults stable: use the module constants `NO_USERS`, `NO_TASKS` and `NO_KNOWN_OWNERS` rather than inline `[]`. The dialog openers are empty-dependency `useCallback`s because `BoardColumn` is `memo()`ed; `board-render-cost.test.tsx` fails if these stop being stable. `src/features/board/board-page.tsx:33-42` `src/features/board/use-board-dialogs.ts:97-107` `src/features/board/board-column.tsx:96`
- A comment in `board.tsx` still says `BoardColumn` is unmemoised, which is out of date: it is wrapped in `memo`. `src/features/board/board.tsx:98-100`
- The delete rollback keeps one snapshot per mutation, which is only safe while two deletes cannot overlap (modal confirm). A bulk delete would break it. `src/features/board/use-delete-task.ts:63-70`
- `metaBadges` is never passed to kit cards because the schema has no data behind them, and rows set `isSelectable: false`. `src/features/board/task-card/to-kit-props.ts:108-128` `src/features/board/task-card/to-kit-props.ts:162`
- Code outside `features/board` must import `Task` and `User` from `@/graphql/domain`, not from `task-types.ts`; lint enforces this. `src/features/board/task-types.ts:7-22`

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
- `DeleteTaskDialog` (function) `src/features/board/delete-task-dialog.tsx:65`
- `IconField` (function) `src/features/board/icon-field.tsx:34`
- `OptionalSelect` (function) `src/features/board/option-select.tsx:57`
- `RequiredSelect` (function) `src/features/board/option-select.tsx:119`
- `TagMultiSelect` (function) `src/features/board/option-select.tsx:168`
- `SelectOption` (interface) `src/features/board/select-option.tsx:10`
- `renderSelectOption` (function) `src/features/board/select-option.tsx:37`
- `findOption` (function) `src/features/board/select-option.tsx:52`
- `TaskActionsMenu` (function) `src/features/board/task-card/task-actions-menu.tsx:19`
- `KIT_FIELD_NAMES` (const) `src/features/board/task-card/to-kit-props.ts:41`
- `toKitCardProps` (function) `src/features/board/task-card/to-kit-props.ts:96`
- `toKitTableRowProps` (function) `src/features/board/task-card/to-kit-props.ts:146`
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
