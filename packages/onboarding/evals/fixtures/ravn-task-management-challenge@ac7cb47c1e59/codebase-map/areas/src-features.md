---
area: "src-features"
title: "src/features"
paths: ["src/features/"]
tree_hash: "a28738be0b5fc39e2425bff3be8702b3cac831a3"
built_at_sha: "ac7cb47c1e590616da040840cb26cb4e203d99f8"
built_at: "2026-09-30T05:28:33.367Z"
status: "ok"
summary: "`src/features` holds the app's three feature slices."
generator: "ravn-agents/onboarding 0.1.0"
---

# src/features

> Codebase map page, built at `ac7cb47c1e59`. It says where to look; confirm every claim against the cited code before relying on it.

## Summary
`src/features` holds the app's three feature slices. `board/` is the task board: GraphQL queries and mutations through React Query, URL-backed filters, create/edit/delete dialogs, and the grid and list views. `navigation/` is the app shell's header and sidebar. `profile/` is the settings page. Routes and pages in `src/app` consume them (`src/app/routes.tsx:2-4`, `src/app/my-task-page.tsx:1-10`). Features must not import each other; `eslint.config.js` allows only two edges out of `navigation/` (`eslint.config.js:364-376`).

## Key files
- `src/features/board/board-page.tsx:44` — `BoardPage`, the dashboard route. Start here: it wires users, filters, tasks, dialogs and actions together and holds no logic of its own.
- `src/features/board/use-tasks.ts:13-53` — `taskKeys` and `useTasks`, the filtered task query. Every mutation invalidates this key prefix.
- `src/features/board/use-board-filters.ts:151` — `useBoardFilters`: filters stored in URL search params, validation of hand-edited values, and the debounced `queryInput`.
- `src/features/board/use-board-actions.ts:40` — `create`/`edit`/`remove`: which mutation runs and which toast is shown.
- `src/features/board/task-mapping.ts:46-148` — form fields to `CreateTaskInput`/`UpdateTaskInput` (the update is a patch), plus `toFormFields`.
- `src/features/board/use-board-dialogs.ts:25-29` — the `BoardDialog` union (`none|create|edit|delete`) that controls every dialog.
- `src/features/board/task-form-dialog.tsx:85` — the create/edit modal. Its reducer and validation are in `task-form-state.ts`.
- `src/features/board/task-card/to-kit-props.ts:47` — `KIT_FIELD_NAMES`, `toKitCardProps` and `toKitTableRowProps`, which map a `Task` to `@ravn/ui-kit` card and row props.
- `src/features/board/task-types.ts:35-53` — display orders `BOARD_STATUSES`, `ALL_TAGS` and `ALL_POINT_ESTIMATES`. The domain types themselves live in `@/graphql/domain`.
- `src/features/navigation/app-header.tsx:52` / `src/features/navigation/app-sidebar.tsx:38` — `AppHeader` (search box and avatar link) and `NAV_ITEMS`. `routes.tsx` builds routes from `NAV_ITEMS`.

## How it works
- Data path: `useUsers` supplies the owner ids and a directory status to `useBoardFilters`. That hook builds `queryInput`, which goes to `useTasks`. `Board` then groups the tasks by status and sorts each column by `position`. `src/features/board/board-page.tsx:56-64` `src/features/board/board.tsx:22-43`
- Filters live in the URL under the `FILTER_PARAMS` keys (the points filter is stored as `points`, the owner as `owner`, the due date as `due`). Every write uses `replace: true`. Only the name is debounced, by 300 ms, and empty values are left out of `queryInput` so that `{}` and `{name:''}` share one cache key. `src/features/board/use-board-filters.ts:43-50` `src/features/board/use-board-filters.ts:172-229`
- `useTasks` uses `placeholderData: keepPreviousData`, so the previous results stay on screen while a filter change loads. Only the first load shows the skeleton. `src/features/board/use-tasks.ts:44-53`
- Create and update write the server's response into every `taskKeys.all` list, then start an invalidation without awaiting it. Delete is the only optimistic mutation: it cancels queries, snapshots every list, removes the task, and rolls back in `onError`. `src/features/board/use-create-task.ts:43-58` `src/features/board/use-delete-task.ts:52-107`
- The actions report failure in two different ways. `create` and `edit` show an error toast and rethrow, so `TaskFormDialog` stays open and shows the message inline. `remove` returns `'keep-open'` or `'close'` instead of throwing. `src/features/board/use-board-actions.ts:46-92` `src/features/board/task-form-dialog.tsx:135-144`
- Dialogs are mounted only while their `dialog.kind` is active, so every open starts with a fresh form. The edit form is seeded from `toFormFields(dialog.task)`. `src/features/board/board-page.tsx:112-142`
- The header search writes `?name=` through the board's own `setFilter`. Off the board route it navigates to `/?name=` instead. `src/features/navigation/app-header.tsx:56-86`

## Gotchas
- `toUpdateInput` sends only the fields that changed. `assigneeId: null` must be sent to unassign a task. A blank `position` must be left out, because `null` would unset it. Do not resend the whole form. `src/features/board/task-mapping.ts:117-148`
- The midnight-UTC date suffix is built in two places: `toApiDateTime` and the inline filter code in `use-board-filters.ts`. Change both together. `src/features/board/task-mapping.ts:27-36` `src/features/board/use-board-filters.ts:219`
- Referential stability matters. `openEdit` and `openDelete` must keep their identity because `BoardColumn` is wrapped in `memo`, and `NO_USERS`/`NO_TASKS` are module constants for the same reason. `board-render-cost.test.tsx` guards this. `src/features/board/use-board-dialogs.ts:97-107` `src/features/board/board-column.tsx:96` `src/features/board/board-page.tsx:33-42`
- A failed Users query must be treated differently from one still loading. `readOwner` accepts any owner id only while the status is `'pending'`, and `directoryUnavailable` makes the filter bar and assignee picker explain that the user list failed to load. `src/features/board/use-board-filters.ts:109-118` `src/features/board/board-page.tsx:102`
- The delete rollback takes one snapshot per mutation. That is safe only while deletes cannot overlap (one modal confirmation at a time), so bulk delete would need a redesign. `src/features/board/use-delete-task.ts:63-70`
- Code outside `features/board` must import `Task`/`User` from `@/graphql/domain`, not from `task-types.ts`. `src/features/board/task-types.ts:18-22`
- If you add a field to `TaskPresentation` without adding it to `KIT_FIELD_NAMES`, the build fails. This keeps the card and table-row views showing the same data. `src/features/board/task-card/to-kit-props.ts:35-58`

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
