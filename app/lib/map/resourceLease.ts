export type ResourceLease<T> = Readonly<{
  value: T;
  /** Stable, this-free and idempotent. */
  release: () => void;
}>;

export type AsyncResourceOwner<T> = Readonly<{
  borrow(): Promise<ResourceLease<T>>;
  /** Rejects new borrows and resolves after the final lease releases. */
  retire(): Promise<void>;
  readonly borrowerCount: number;
  readonly retired: boolean;
}>;

/**
 * Owns one asynchronously-created resource. Disposal happens exactly once,
 * after retirement and the last borrower. A failed loader is never disposed.
 */
export function createAsyncResourceOwner<T>(
  load: () => Promise<T>,
  dispose: (value: T) => void,
): AsyncResourceOwner<T> {
  let resource: T | null = null;
  let loadError: unknown = null;
  let retired = false;
  let disposed = false;
  let borrowers = 0;
  let settleRetirement: (() => void) | null = null;
  const retirement = new Promise<void>((resolve) => { settleRetirement = resolve; });
  const loading = load().then((value) => {
    resource = value;
    maybeDispose();
    return value;
  }, (error) => {
    loadError = error;
    if (retired) settleRetirement?.();
    throw error;
  });
  // A caller may retire before anyone borrows. Prevent an unhandled rejected
  // loading promise while still preserving the error for borrow().
  void loading.catch(() => undefined);

  function maybeDispose() {
    if (!retired || borrowers !== 0 || disposed || resource === null) return;
    disposed = true;
    const value = resource;
    resource = null;
    dispose(value);
    settleRetirement?.();
  }

  return Object.freeze({
    async borrow(): Promise<ResourceLease<T>> {
      if (retired) throw new Error("resource owner is retired");
      const value = resource ?? await loading;
      if (retired) {
        maybeDispose();
        throw new Error("resource owner retired while loading");
      }
      if (loadError) throw loadError;
      borrowers += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        borrowers -= 1;
        maybeDispose();
      };
      return Object.freeze({ value, release });
    },
    retire(): Promise<void> {
      if (!retired) {
        retired = true;
        if (loadError !== null) settleRetirement?.();
        maybeDispose();
      }
      return retirement;
    },
    get borrowerCount() {
      return borrowers;
    },
    get retired() {
      return retired;
    },
  });
}
