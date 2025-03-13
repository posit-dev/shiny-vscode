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
 * A container for a value that may not be immediately available.
 *
 * This class provides a way to handle values that will be set at some point in
 * the future.
 *
 * It allows consumers to:
 * - Check if the value has been set
 * - Safely access the value once it's available
 * - Wait for the value to be set via a promise
 *
 * The value can also later be changed by calling `set` again. However, this
 * will not update the promise; the promise will only resolve once.
 *
 * @template T The type of the value being contained
 */
export class PromisedValueContainer<T> {
  // Use this union so that we can rely on TypeScript to enforce safety.
  private state: { isSet: false } | { isSet: true; value: T } = {
    isSet: false,
  };

  /**
   * A promise that resolves when the value has been set.
   *
   * Note: This promise resolves with void, not the value itself. This design
   * prevents consumers from using `await x.promise` to get the value, which
   * would return stale data if the value is later changed.
   */
  promise: PromiseWithStatus<void> = createPromiseWithStatus<void>();

  /**
   * Sets the contained value and resolves the promise.
   *
   * @param value - The value to store in the container
   */
  set(value: T) {
    this.state = { isSet: true, value };
    this.promise.resolve();
  }

  /**
   * Checks if the value has been set.
   *
   * @returns True if the value has been set, false otherwise
   */
  isSet(): boolean {
    return this.state.isSet;
  }

  /**
   * Retrieves the contained value.
   *
   * @returns The contained value
   * @throws Error if the value has not been set yet
   */
  value(): T {
    if (!this.state.isSet) {
      throw new Error("Promised value has not been set.");
    }
    return this.state.value;
  }
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
  isResolved(): boolean;
  isRejected(): boolean;
  isCompleted(): boolean;
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
    isResolved() {
      return _resolved;
    },
    isRejected() {
      return _rejected;
    },
    isCompleted() {
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

/**
 * Finds the relative path from one absolute path to another.
 * 
 * This function calculates the relative path needed to navigate from one
 * absolute path to another. It handles both file and directory paths.
 * 
 * @param from The source absolute path
 * @param to The target absolute path
 * @returns The relative path from the source to the target
 */
export function findRelativePath(from: string, to: string): string {
  // Normalize paths to use forward slashes and remove trailing slashes
  const normalizePathForComparison = (path: string): string => {
    return path.replace(/\\/g, '/').replace(/\/$/, '');
  };

  const normalizedFrom = normalizePathForComparison(from);
  const normalizedTo = normalizePathForComparison(to);

  // If paths are identical, return current directory marker
  if (normalizedFrom === normalizedTo) {
    return '.';
  }

  // Split paths into segments
  const fromSegments = normalizedFrom.split('/');
  const toSegments = normalizedTo.split('/');

  // Find the common prefix length
  let commonPrefixLength = 0;
  const minLength = Math.min(fromSegments.length, toSegments.length);
  
  for (let i = 0; i < minLength; i++) {
    if (fromSegments[i] === toSegments[i]) {
      commonPrefixLength++;
    } else {
      break;
    }
  }

  // Build the relative path
  const upCount = fromSegments.length - commonPrefixLength;
  const remainingToSegments = toSegments.slice(commonPrefixLength);
  
  // Create path segments
  const pathSegments: string[] = [];
  
  // Add "../" for each level we need to go up
  for (let i = 0; i < upCount; i++) {
    pathSegments.push('..');
  }
  
  // Add the remaining segments from the target path
  pathSegments.push(...remainingToSegments);
  
  // Join the segments to form the relative path
  return pathSegments.join('/') || '.';
}
