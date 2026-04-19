/**
 * Warm-up and cooldown helpers for bench cells.
 *
 * Warm-up runs the target function N times without measuring, so that JIT,
 * buffer allocation, and OS page faults settle before we start timing.
 *
 * Cooldown sleeps between cells so a hot CPU core doesn't bias the next cell.
 */

/**
 * Invoke `fn` exactly `iterations` times in sequence, awaiting each call.
 * Results are discarded. Throws if any call throws.
 */
export async function warmup(
  fn: () => Promise<unknown> | unknown,
  iterations: number,
): Promise<void> {
  if (!Number.isInteger(iterations) || iterations < 0) {
    throw new Error(`warmup: iterations must be a non-negative integer, got ${iterations}`);
  }
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
}

/**
 * Wait at least `ms` milliseconds. Zero or negative resolves immediately.
 */
export function cooldown(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
