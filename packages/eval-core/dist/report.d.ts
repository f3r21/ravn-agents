export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/** Checks a report against schemas/eval-report.schema.json, the contract every tool's eval writes. */
export declare function validateReport(report: unknown): ValidationResult;
