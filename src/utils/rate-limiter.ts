/** Safe pacing for AliExpress scraping — delays are wall time, not CPU. */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleepRandom(minMs: number, maxMs: number): Promise<void> {
  const span = Math.max(0, maxMs - minMs);
  const ms = minMs + Math.floor(Math.random() * (span + 1));
  await sleep(ms);
}

/** Pause between sequential keyword searches (legacy — prefer parallel batches). */
export async function delayBetweenKeywordSearches(): Promise<void> {
  await sleepRandom(350, 650);
}

/** Light jitter before outbound fetch when not running in parallel. */
export async function delayBeforeRequest(): Promise<void> {
  await sleepRandom(120, 350);
}

/**
 * Run items in parallel batches with a short pause between batches.
 * Much faster than sequential keyword loops (20×2.5s = 50s+).
 */
export async function runParallelBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
  delayBetweenBatchesMs = 300,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0 && delayBetweenBatchesMs > 0) {
      await sleep(delayBetweenBatchesMs);
    }
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item, j) => fn(item, i + j)),
    );
    out.push(...batchResults);
  }
  return out;
}
