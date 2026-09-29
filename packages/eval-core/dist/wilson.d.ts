export interface ConfidenceInterval {
    method: "wilson";
    level: number;
    lower: number;
    upper: number;
}
/** Wilson score interval for a proportion (95%). Preferred over the normal interval at small n. */
export declare function wilson(successes: number, n: number): ConfidenceInterval;
