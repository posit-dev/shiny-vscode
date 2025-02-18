export function inferFileType(filename: string): "python" | "r" | "text" {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".py":
      return "python";
    case ".r":
      return "r";
    default:
      return "text";
  }
}

/**
 * Capitalizes the first letter of a string while preserving the rest of the string.
 * @param str The input string to capitalize
 * @returns The input string with its first letter capitalized
 */
export function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Extends the standard Promise interface with additional status tracking capabilities.
 * This interface allows monitoring of a promise's state (resolved, rejected, or pending)
 * and provides direct access to resolve/reject methods.
 *
 * @template T The type of value that the promise resolves to
 */
export interface PromiseWithStatus<T> extends Promise<T> {
  promise: Promise<T>;
  resolve(x: T | PromiseLike<T>): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject(reason?: any): void;
  resolved(): boolean;
  rejected(): boolean;
  completed(): boolean;
}

export function createPromiseWithStatus<T>(): PromiseWithStatus<T> {
  const {
    promise,
    resolve: _resolve,
    reject: _reject,
  } = promiseWithResolvers<T>();
  let _resolved = false;
  let _rejected = false;

  return {
    promise,
    resolve(x: T | PromiseLike<T>) {
      _resolved = true;
      _resolve(x);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reject(reason?: any) {
      _rejected = true;
      _reject(reason);
    },
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    [Symbol.toStringTag]: "InitStatus",
    resolved() {
      return _resolved;
    },
    rejected() {
      return _rejected;
    },
    completed() {
      return _resolved || _rejected;
    },
  };
}

// A shim for Promise.withResolvers. When we can use ES2024, we can replace
// this with the native method.
function promiseWithResolvers<T>(): {
  promise: Promise<T>;
  resolve: (value: PromiseLike<T> | T) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reject: (reason?: any) => void;
} {
  let resolve: (value: PromiseLike<T> | T) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reject: (reason?: any) => void;
  const promise = new Promise(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res: (value: PromiseLike<T> | T) => void, rej: (reason?: any) => void) => {
      resolve = res;
      reject = rej;
    }
  );

  return { promise, resolve: resolve!, reject: reject! };
}
