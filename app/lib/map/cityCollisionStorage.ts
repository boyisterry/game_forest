import type { SerializedCollisionPayload } from "./cityCollisionWire.ts";

const DATABASE_NAME = "forest-courier-city-collision";
const DATABASE_VERSION = 1;
const PAYLOAD_STORE = "payloads";

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

/** Binary payload cache. IndexedDB is intentional; BVH buffers must never use localStorage. */
export class CityCollisionPayloadStore {
  private databasePromise: Promise<IDBDatabase> | null = null;
  private readonly databaseName: string;

  constructor(databaseName = DATABASE_NAME) {
    this.databaseName = databaseName;
  }

  async get(cacheKey: string): Promise<SerializedCollisionPayload | null> {
    const database = await this.open();
    const transaction = database.transaction(PAYLOAD_STORE, "readonly");
    const result = await requestResult(transaction.objectStore(PAYLOAD_STORE).get(cacheKey));
    await transactionDone(transaction);
    return (result as SerializedCollisionPayload | undefined) ?? null;
  }

  async put(payload: SerializedCollisionPayload): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PAYLOAD_STORE, "readwrite");
    transaction.objectStore(PAYLOAD_STORE).put(payload, payload.header.cacheKey);
    await transactionDone(transaction);
  }

  async delete(cacheKey: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PAYLOAD_STORE, "readwrite");
    transaction.objectStore(PAYLOAD_STORE).delete(cacheKey);
    await transactionDone(transaction);
  }

  async clear(): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PAYLOAD_STORE, "readwrite");
    transaction.objectStore(PAYLOAD_STORE).clear();
    await transactionDone(transaction);
  }

  close() {
    const pending = this.databasePromise;
    this.databasePromise = null;
    void pending?.then((database) => database.close());
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is unavailable in this runtime"));
    }
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(PAYLOAD_STORE)) {
          request.result.createObjectStore(PAYLOAD_STORE);
        }
      });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB open failed")), {
        once: true,
      });
      request.addEventListener("blocked", () => reject(new Error("IndexedDB upgrade is blocked")), { once: true });
    });
    return this.databasePromise;
  }
}
