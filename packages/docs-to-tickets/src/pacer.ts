/**
 * Runs mutative GitHub requests one at a time, at least `minGapMs` apart. GitHub's secondary
 * rate limits punish bursts of content-creating requests; spacing prevents them.
 */
export class Pacer {
  private chain: Promise<unknown> = Promise.resolve();
  private last = Number.NEGATIVE_INFINITY;
  private readonly minGapMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(minGapMs: number, now: () => number, sleep: (ms: number) => Promise<void>) {
    this.minGapMs = minGapMs;
    this.now = now;
    this.sleep = sleep;
  }

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => {
      const wait = this.last + this.minGapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await fn();
      } finally {
        this.last = this.now();
      }
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}

export const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
