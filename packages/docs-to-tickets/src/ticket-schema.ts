import { Ajv2020 } from "ajv/dist/2020.js";
import { CONFIDENCE_FIELDS, CONFIDENCE_LEVELS, TICKET_TYPES, type Extraction } from "./types.ts";

const confidence = { type: "string", enum: [...CONFIDENCE_LEVELS] } as const;

/**
 * The extraction contract. Kept inside the structured-outputs subset (no numeric or length
 * bounds, every object closed), so the same schema constrains decoding on the API path and is
 * checked by ajv on every path. Shape only: meaning is checked in validate.ts.
 */
export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tickets", "out_of_scope"],
  properties: {
    tickets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "acceptance_criteria",
          "source_refs",
          "type",
          "type_detail",
          "priority",
          "labels",
          "confidence",
        ],
        properties: {
          title: { type: "string", description: "Imperative, under 80 characters, no ticket number." },
          description: { type: "string", description: "What to build and why, grounded in the cited requirements." },
          acceptance_criteria: {
            type: "array",
            items: { type: "string" },
            description: "Testable statements, each traceable to text under a cited requirement.",
          },
          source_refs: {
            type: "array",
            items: { type: "string" },
            description: "Requirement ids from the provided list, e.g. header.2. Never invented.",
          },
          type: { type: "string", enum: [...TICKET_TYPES] },
          type_detail: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description: "Required when type is other; null otherwise.",
          },
          priority: { type: "string", enum: ["required", "optional"] },
          labels: { type: "array", items: { type: "string" } },
          confidence: {
            type: "object",
            additionalProperties: false,
            required: [...CONFIDENCE_FIELDS],
            properties: Object.fromEntries(CONFIDENCE_FIELDS.map((f) => [f, confidence])),
          },
        },
      },
    },
    out_of_scope: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "reason"],
        properties: { ref: { type: "string" }, reason: { type: "string" } },
      },
    },
  },
} as const;

const validateShape = new Ajv2020({ allErrors: true, strict: false }).compile(EXTRACTION_SCHEMA);

export type ShapeResult = { ok: true; value: Extraction } | { ok: false; errors: string[] };

export function checkShape(value: unknown): ShapeResult {
  if (validateShape(value)) return { ok: true, value: value as Extraction };
  const errors = (validateShape.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "is invalid"}`);
  return { ok: false, errors };
}
