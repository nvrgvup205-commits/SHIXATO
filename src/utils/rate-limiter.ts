/** Safe pacing for AliExpress scraping — delays are wall time, not CPU. */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleepRandom(minMs: number, maxMs: number): Promise<void> {
  const span = Math.max(0, maxMs - minMs);
  const ms = minMs + Math.floor(Math.random() * (span + 1));
  await sleep(ms);
}

/** Pause between keyword searches (spec: ~2.5s). */
export async function delayBetweenKeywordSearches(): Promise<void> {
  await sleepRandom(2200, 3200);
}

/** Extra jitter before each outbound fetch. */
export async function delayBeforeRequest(): Promise<void> {
  await sleepRandom(800, 1800);
}
