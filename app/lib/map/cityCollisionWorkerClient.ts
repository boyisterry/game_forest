import type {
  CollisionWorkerCommand,
  CollisionWorkerResult,
  PackedCollisionCompileSource,
} from "./cityCollisionWire.ts";

type RegisteredResult = Extract<CollisionWorkerResult, { type: "registered" }>;
type CompileResult = Extract<CollisionWorkerResult, { type: "compiled" | "stale" }>;
type ReleaseResult = Extract<CollisionWorkerResult, { type: "released" | "stale" }>;

function addTransferBuffer(target: Set<ArrayBuffer>, array: ArrayBufferView) {
  if (array.buffer instanceof ArrayBuffer) target.add(array.buffer);
}

/** The caller must hand this function an owned source because postMessage detaches these buffers. */
export function collisionSourceTransferList(source: PackedCollisionCompileSource): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const triangles = source.triangles;
  addTransferBuffer(buffers, triangles.positions);
  addTransferBuffer(buffers, triangles.indices);
  addTransferBuffer(buffers, triangles.triangleRoles);
  addTransferBuffer(buffers, triangles.triangleProfileIndices);
  addTransferBuffer(buffers, triangles.triangleSurfaceKeys);
  addTransferBuffer(buffers, triangles.sourceTriangleIds);
  if (source.explicitBoundaries) {
    addTransferBuffer(buffers, source.explicitBoundaries.boundaryXZ);
    addTransferBuffer(buffers, source.explicitBoundaries.boundaryTransitionProfileIndices);
    addTransferBuffer(buffers, source.explicitBoundaries.boundaryGroupKeys);
    addTransferBuffer(buffers, source.explicitBoundaries.boundarySurfaceKeyPairs);
  }
  return [...buffers];
}

/** Thin Worker envelope. Constructing this class is the only point that creates a browser Worker. */
export class CityCollisionWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Readonly<{
    resolve: (result: CollisionWorkerResult) => void;
    reject: (error: Error) => void;
  }>>();
  private nextRequestId = 1;
  private terminated = false;

  constructor(worker?: Worker) {
    this.worker = worker ?? new Worker(new URL("./cityCollision.worker.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleWorkerError);
  }

  async register(source: PackedCollisionCompileSource): Promise<RegisteredResult> {
    const requestId = this.allocateRequestId();
    const command: CollisionWorkerCommand = {
      type: "register",
      requestId,
      sourceId: source.sourceId,
      generation: source.generation,
      source,
    };
    const result = await this.dispatch(command, collisionSourceTransferList(source));
    if (result.type !== "registered") throw new Error(`unexpected register result: ${result.type}`);
    return result;
  }

  async compile(
    sourceId: string,
    generation: number,
    registrationToken: number,
  ): Promise<CompileResult> {
    const result = await this.dispatch({
      type: "compile",
      requestId: this.allocateRequestId(),
      sourceId,
      generation,
      registrationToken,
    });
    if (result.type !== "compiled" && result.type !== "stale") {
      throw new Error(`unexpected compile result: ${result.type}`);
    }
    return result;
  }

  async release(
    sourceId: string,
    generation: number,
    registrationToken: number,
  ): Promise<ReleaseResult> {
    const result = await this.dispatch({
      type: "release",
      requestId: this.allocateRequestId(),
      sourceId,
      generation,
      registrationToken,
    });
    if (result.type !== "released" && result.type !== "stale") {
      throw new Error(`unexpected release result: ${result.type}`);
    }
    return result;
  }

  terminate() {
    this.shutdown(new Error("city collision worker terminated"));
  }

  private shutdown(error: Error) {
    if (this.terminated) return;
    this.terminated = true;
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleWorkerError);
    this.worker.terminate();
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }

  private allocateRequestId(): number {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return requestId;
  }

  private dispatch(command: CollisionWorkerCommand, transfer: Transferable[] = []): Promise<CollisionWorkerResult> {
    if (this.terminated) return Promise.reject(new Error("city collision worker is terminated"));
    return new Promise<CollisionWorkerResult>((resolve, reject) => {
      this.pending.set(command.requestId, { resolve, reject });
      try {
        this.worker.postMessage(command, transfer);
      } catch (error) {
        this.pending.delete(command.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).then((result) => {
      if (result.type === "error") throw new Error(result.message);
      return result;
    });
  }

  private readonly handleMessage = (event: MessageEvent<CollisionWorkerResult>) => {
    const request = this.pending.get(event.data.requestId);
    if (!request) return;
    this.pending.delete(event.data.requestId);
    request.resolve(event.data);
  };

  private readonly handleWorkerError = (event: ErrorEvent) => {
    const error = new Error(event.message || "city collision worker failed");
    this.shutdown(error);
  };
}
