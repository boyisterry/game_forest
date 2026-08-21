import {
  MapLibraryRepository,
  cloneMapLibraryRecord,
  type MapLibraryCompareAndPutResult,
  type MapLibraryRecord,
  type MapLibraryRepositoryOptions,
  type MapLibraryStore,
} from "./mapLibrary.ts";

export const MAP_LIBRARY_DATABASE_NAME = "forest-courier-map-library";
export const MAP_LIBRARY_DATABASE_VERSION = 1;
const RECORD_STORE = "records";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed")), {
      once: true,
    });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction aborted")), {
      once: true,
    });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed")), {
      once: true,
    });
  });
}

/** Deterministic Node/SSR fallback and a fast repository test adapter. */
export class MemoryMapLibraryStore implements MapLibraryStore {
  private readonly records = new Map<string, MapLibraryRecord>();
  private writeTail: Promise<void> = Promise.resolve();

  async list(): Promise<readonly unknown[]> {
    await this.writeTail;
    return [...this.records.values()].map(cloneMapLibraryRecord);
  }

  async get(id: string): Promise<unknown | null> {
    await this.writeTail;
    const record = this.records.get(id);
    return record ? cloneMapLibraryRecord(record) : null;
  }

  put(record: MapLibraryRecord): Promise<void> {
    return this.enqueueWrite(() => {
      this.records.set(record.id, cloneMapLibraryRecord(record));
    });
  }

  compareAndPut(
    record: MapLibraryRecord,
    expectedRevision: number,
    options: Readonly<{ allowMissing?: boolean }> = {},
  ): Promise<MapLibraryCompareAndPutResult> {
    let outcome: MapLibraryCompareAndPutResult = { stored: false, current: null };
    return this.enqueueWrite(() => {
      const current = this.records.get(record.id);
      if ((!current && options.allowMissing) || current?.revision === expectedRevision) {
        this.records.set(record.id, cloneMapLibraryRecord(record));
        outcome = { stored: true };
      } else {
        outcome = { stored: false, current: current ? cloneMapLibraryRecord(current) : null };
      }
    }).then(() => outcome);
  }

  delete(id: string): Promise<boolean> {
    let deleted = false;
    return this.enqueueWrite(() => {
      deleted = this.records.delete(id);
    }).then(() => deleted);
  }

  async flush(): Promise<void> {
    await this.writeTail;
  }

  close(): void {}

  private enqueueWrite(operation: () => void): Promise<void> {
    const result = this.writeTail.then(operation, operation);
    this.writeTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export type IndexedDbMapLibraryStoreOptions = Readonly<{
  databaseName?: string;
  indexedDBFactory?: IDBFactory;
}>;

/** Browser persistence isolated from the disposable city-collision cache DB. */
export class IndexedDbMapLibraryStore implements MapLibraryStore {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private writeTail: Promise<void> = Promise.resolve();
  private readonly databaseName: string;
  private readonly factory: IDBFactory;

  constructor(options: IndexedDbMapLibraryStoreOptions = {}) {
    const factory = options.indexedDBFactory ?? globalThis.indexedDB;
    if (!factory) throw new Error("IndexedDB is unavailable in this runtime");
    this.factory = factory;
    this.databaseName = options.databaseName ?? MAP_LIBRARY_DATABASE_NAME;
  }

  async list(): Promise<readonly unknown[]> {
    await this.writeTail;
    const database = await this.open();
    const transaction = database.transaction(RECORD_STORE, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(RECORD_STORE).getAll());
    await done;
    return records as unknown[];
  }

  async get(id: string): Promise<unknown | null> {
    await this.writeTail;
    const database = await this.open();
    const transaction = database.transaction(RECORD_STORE, "readonly");
    const done = transactionDone(transaction);
    const record = await requestResult(transaction.objectStore(RECORD_STORE).get(id));
    await done;
    return record ?? null;
  }

  put(record: MapLibraryRecord): Promise<void> {
    return this.enqueueWrite(async () => {
      const database = await this.open();
      const transaction = database.transaction(RECORD_STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(RECORD_STORE).put(record);
      await done;
    });
  }

  compareAndPut(
    record: MapLibraryRecord,
    expectedRevision: number,
    options: Readonly<{ allowMissing?: boolean }> = {},
  ): Promise<MapLibraryCompareAndPutResult> {
    return this.enqueueWrite(async () => {
      const database = await this.open();
      const transaction = database.transaction(RECORD_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(RECORD_STORE);
      const decision = new Promise<MapLibraryCompareAndPutResult>((resolve, reject) => {
        const request = store.get(record.id);
        request.addEventListener("success", () => {
          const current = request.result as unknown | undefined;
          const currentRevision = typeof current === "object" && current !== null
            ? (current as { revision?: unknown }).revision
            : undefined;
          if ((current === undefined && options.allowMissing) || currentRevision === expectedRevision) {
            // Queue the put synchronously in the read callback while this same
            // readwrite transaction is active. No other tab can interleave a
            // revision-changing write between the comparison and this put.
            try {
              store.put(record);
              resolve({ stored: true });
            } catch (error) {
              reject(error);
            }
          } else {
            resolve({ stored: false, current: current ?? null });
          }
        }, { once: true });
        request.addEventListener("error", () => {
          reject(request.error ?? new Error("IndexedDB compare-and-put read failed"));
        }, { once: true });
      });
      const outcome = await decision;
      await done;
      return outcome;
    });
  }

  delete(id: string): Promise<boolean> {
    let deleted = false;
    return this.enqueueWrite(async () => {
      const database = await this.open();
      const transaction = database.transaction(RECORD_STORE, "readwrite");
      const done = transactionDone(transaction);
      const store = transaction.objectStore(RECORD_STORE);
      const existing = await requestResult(store.getKey(id));
      if (existing !== undefined) {
        store.delete(id);
        deleted = true;
      }
      await done;
    }).then(() => deleted);
  }

  async flush(): Promise<void> {
    await this.writeTail;
  }

  close(): void {
    const pending = this.databasePromise;
    this.databasePromise = null;
    void pending?.then((database) => database.close());
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeTail.then(operation, operation);
    this.writeTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.databaseName, MAP_LIBRARY_DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(RECORD_STORE)) {
          request.result.createObjectStore(RECORD_STORE, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => {
        const database = request.result;
        database.addEventListener("versionchange", () => {
          database.close();
          if (this.databasePromise === opening) this.databasePromise = null;
        });
        resolve(database);
      }, { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB open failed")), {
        once: true,
      });
      request.addEventListener("blocked", () => reject(new Error("IndexedDB upgrade is blocked")), { once: true });
    });
    this.databasePromise = opening;
    void opening.catch(() => {
      if (this.databasePromise === opening) this.databasePromise = null;
    });
    return opening;
  }
}

export type CreateMapLibraryRepositoryOptions = MapLibraryRepositoryOptions & IndexedDbMapLibraryStoreOptions;

/** Uses durable IndexedDB in browsers and an in-memory repository during SSR/Node. */
export function createMapLibraryRepository(
  options: CreateMapLibraryRepositoryOptions = {},
): MapLibraryRepository {
  const factory = options.indexedDBFactory ?? globalThis.indexedDB;
  const store: MapLibraryStore = factory
    ? new IndexedDbMapLibraryStore({ databaseName: options.databaseName, indexedDBFactory: factory })
    : new MemoryMapLibraryStore();
  return new MapLibraryRepository(store, { now: options.now, createId: options.createId });
}
