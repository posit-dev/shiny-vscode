export async function retryUntilTimeout<T>(
  timeoutMs: number,
  callback: () => Promise<T>
): Promise<T | undefined> {
  let { result, cancel: cancelResult } = retryUntilCancel(20, callback);

  let timer: NodeJS.Timer | undefined;
  let timeoutPromise = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve, timeoutMs);
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
