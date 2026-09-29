import { readFileSync } from "node:fs";
import { CONFIDENCE_FIELDS, CONFIDENCE_LEVELS, type Confidence, type ConfidenceField, type FieldConfidence } from "./types.ts";

/** Lowest confidence a field may carry and still be created without review. "never" routes every ticket. */
export type MinConfidence = Confidence | "never";

export interface FieldThreshold {
  min: MinConfidence;
  /** Calibration evidence: tickets accepted at `min` on the calibration split and how many were correct. */
  accepted?: number;
  correct?: number;
}

export interface Thresholds {
  version: 1;
  calibrated: boolean;
  target_precision: number;
  fields: Record<ConfidenceField, FieldThreshold>;
  notes?: string;
}

export const REVIEW_LABEL = "needs-review";

/** Used until a calibration run replaces it: only "high" on every field is created without review. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  version: 1,
  calibrated: false,
  target_precision: 0.9,
  fields: Object.fromEntries(CONFIDENCE_FIELDS.map((f) => [f, { min: "high" }])) as Record<ConfidenceField, FieldThreshold>,
  notes: "Uncalibrated default. Self-reported confidence is overconfident until mapped to observed accuracy.",
};

const rank = (level: Confidence) => CONFIDENCE_LEVELS.indexOf(level);

export function meets(level: Confidence, min: MinConfidence): boolean {
  return min !== "never" && rank(level) >= rank(min);
}

export interface Routing {
  needsReview: boolean;
  reasons: string[];
}

/** The review decision, made in code from per-field confidence and any validation findings. */
export function route(confidence: FieldConfidence, thresholds: Thresholds, validationReasons: readonly string[] = []): Routing {
  const reasons = [...validationReasons];
  for (const field of CONFIDENCE_FIELDS) {
    const min = thresholds.fields[field].min;
    if (!meets(confidence[field], min)) {
      reasons.push(
        min === "never"
          ? `${field}: always reviewed (no confidence level met the target precision in calibration)`
          : `${field}: confidence ${confidence[field]} is below the threshold ${min}`,
      );
    }
  }
  return { needsReview: reasons.length > 0, reasons };
}

/** Reads a thresholds file; a missing file means the uncalibrated default. */
export function loadThresholds(file: string | undefined): Thresholds {
  if (!file) return DEFAULT_THRESHOLDS;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_THRESHOLDS;
    throw error;
  }
  const t = raw as Partial<Thresholds>;
  const levels = new Set<string>([...CONFIDENCE_LEVELS, "never"]);
  const fieldsOk = CONFIDENCE_FIELDS.every((f) => levels.has(String(t.fields?.[f]?.min)));
  if (t.version !== 1 || typeof t.calibrated !== "boolean" || !fieldsOk) {
    throw new Error(`${file} is not a thresholds file (version 1 with a min level for ${CONFIDENCE_FIELDS.join(", ")}).`);
  }
  return t as Thresholds;
}
