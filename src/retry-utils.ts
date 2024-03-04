/**
 * Repeatedly calls callback until it executes without throwing an error, or
 * until timeoutMs has passed.
 * @param timeoutMs Number of milliseconds to wait before giving up.
 * @param callback The function to call repeatedly.
 * @returns The return value of the first successful call to the callback
 * (doesn't have to be truthy, just not erroring); or undefined if the timeout
 * was reached.
 */
export async function retryUntilTimeout<T>(
  timeoutMs: number,
  callback: () => Promise<T>
): Promise<T | undefined> {
  const { result, cancel: cancelResult } = retryUntilCancel(20, callback);

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), timeoutMs);
  });

  try {
    return await Promise.race([result, timeoutPromise]);
  } finally {
    cancelResult();
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Repeatedly calls callback until it executes without throwing an error, or
 * until the operation is cancelled.
 * @param intervalMs Number of milliseconds to wait between retries.
 * @param callback The function to call repeatedly.
 * @returns An object with two properties: `result`, a promise that resolves to
 * the return value of the first successful call to the callback (doesn't have
 * to be truthy, just not erroring) or rejects with Error("Cancelled") if
 * cancelled; and `cancel`, a function you can call to stop the retries.
 */
export function retryUntilCancel<T>(
  intervalMs: number,
  callback: () => Promise<T>
): { result: Promise<T>; cancel: () => void } {
  let cancelled = false;
  async function retry(): Promise<T> {
    while (!cancelled) {
      try {
        return await callback();
      } catch {
        // Sleep for a bit
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    throw new Error("Cancelled");
  }
  return {
    result: retry(),
    cancel: () => {
      cancelled = true;
    },
  };
}
