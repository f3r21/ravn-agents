const Z_95 = 1.959963984540054;
/** Wilson score interval for a proportion (95%). Preferred over the normal interval at small n. */
export function wilson(successes, n) {
    if (!Number.isInteger(successes) || !Number.isInteger(n) || n < 1 || successes < 0 || successes > n) {
        throw new RangeError(`invalid counts: ${successes}/${n}`);
    }
    const p = successes / n;
    const z2 = Z_95 * Z_95;
    const denominator = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denominator;
    const half = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
    return {
        method: "wilson",
        level: 0.95,
        lower: Math.max(0, center - half),
        upper: Math.min(1, center + half),
    };
}
