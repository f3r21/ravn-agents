import type { FieldConfidence, Requirement, Ticket } from "./types.ts";

export const REQUIREMENTS: Requirement[] = [
  { id: "toolbar.1", section: "Toolbar", text: "Add the export icon.", kind: "checkbox", optional: false },
  { id: "toolbar.2", section: "Toolbar", text: "Add the print icon.", kind: "checkbox", optional: false },
  { id: "approvals.1", section: "Approvals", text: "Use the approveRequest mutation to approve a request.", kind: "checkbox", optional: false },
  { id: "extras.1", section: "Extras", text: "Dark mode toggle (optional).", kind: "checkbox", optional: true },
];

export const HIGH: FieldConfidence = { source_refs: "high", type: "high", priority: "high", acceptance_criteria: "high" };

export function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    title: "Add export and print icons to the toolbar",
    description: "The toolbar shows the export and print icons.",
    acceptance_criteria: ["The toolbar shows the export icon.", "The toolbar shows the print icon."],
    source_refs: ["toolbar.1", "toolbar.2"],
    type: "feature",
    type_detail: null,
    priority: "required",
    labels: [],
    confidence: HIGH,
    ...overrides,
  };
}

export const APPROVAL = ticket({
  title: "Approve a request with approveRequest",
  description: "Managers approve requests.",
  acceptance_criteria: ["Approving calls the approveRequest mutation."],
  source_refs: ["approvals.1"],
});

export const DARK_MODE = ticket({
  title: "Add a dark mode toggle",
  description: "Optional dark mode.",
  acceptance_criteria: ["A dark mode toggle is shown."],
  source_refs: ["extras.1"],
  priority: "optional",
});
