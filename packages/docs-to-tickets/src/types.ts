/** One requirement unit of a brief: a checkbox, or a list item in a section without checkboxes. */
export interface Requirement {
  /** Stable id, `<section-slug>.<n>`, e.g. `header.2`. Tickets cite these in `source_refs`. */
  id: string;
  /** Section path inside the brief, e.g. `Project Requirements/2. Create the dashboard page/Header`. */
  section: string;
  text: string;
  kind: "checkbox" | "item";
  optional: boolean;
}

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const TICKET_TYPES = ["feature", "chore", "docs", "bug", "other"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const CONFIDENCE_FIELDS = ["source_refs", "type", "priority", "acceptance_criteria"] as const;
export type ConfidenceField = (typeof CONFIDENCE_FIELDS)[number];

export type FieldConfidence = Record<ConfidenceField, Confidence>;

/** A ticket as the extraction step emits it (see ticket-schema.ts). */
export interface Ticket {
  title: string;
  description: string;
  acceptance_criteria: string[];
  source_refs: string[];
  type: TicketType;
  type_detail: string | null;
  priority: "required" | "optional";
  labels: string[];
  confidence: FieldConfidence;
}

export interface OutOfScope {
  ref: string;
  reason: string;
}

export interface Extraction {
  tickets: Ticket[];
  out_of_scope: OutOfScope[];
}
