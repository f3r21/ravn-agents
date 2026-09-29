/** Shared test fixtures: a small real-shaped diff and draft builders. */

import type { Draft, Finding } from "../types.ts";

export const DIFF = `diff --git a/src/task-table.tsx b/src/task-table.tsx
index 1111111..2222222 100644
--- a/src/task-table.tsx
+++ b/src/task-table.tsx
@@ -10,6 +10,7 @@ export function TaskTable(props: Props) {
   const rows = props.rows;
-  const open = true;
+  const [open, setOpen] = useState(true);
+  const toggle = () => setOpen(!open);
   return (
     <table>
       <tbody>
@@ -40,3 +41,4 @@ export function TaskTable(props: Props) {
   );
 }
+export default TaskTable;
diff --git a/package-lock.json b/package-lock.json
index 3333333..4444444 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1,3 +1,3 @@
 {
-  "version": "1.0.0"
+  "version": "1.0.1"
 }
diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..5555555
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+export const a = 1;
+export const b = 2;
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 6666666..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const gone = true;
diff --git a/assets/logo.png b/assets/logo.png
index 7777777..8888888 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

export function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "correctness-1",
    category: "correctness",
    path: "src/task-table.tsx",
    line: 12,
    side: "RIGHT",
    severity: "high",
    confidence: "high",
    title: "Toggle reads a stale open value",
    body: "Two quick clicks flip twice from the same value.",
    verification: { verdict: "confirmed", evidence: ["src/task-table.tsx:12"], reason: "Read the closure." },
    ...over,
  };
}

export function draft(findings: Finding[], over: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    mode: "routed",
    selection: { ran: ["correctness"], skipped: [{ category: "security", reason: "No auth or env change." }], rationale: "Logic change only." },
    finders: [{ category: "correctness", status: "ok", files: ["src/task-table.tsx"] }],
    verifier: { status: "ok", model: "claude-opus-5-5" },
    findings,
    notReviewed: [],
    summary: "Makes the table collapsible.",
    ...over,
  };
}
