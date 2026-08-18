/// <reference lib="webworker" />

import { collisionPayloadTransferList } from "./cityCollisionCompileCore.ts";
import { CityCollisionCompilerProtocol } from "./cityCollisionWorkerProtocol.ts";
import type { CollisionWorkerCommand } from "./cityCollisionWire.ts";

const protocol = new CityCollisionCompilerProtocol();
const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener("message", async (event: MessageEvent<CollisionWorkerCommand>) => {
  const result = await protocol.handle(event.data);
  const transfer = result.type === "compiled"
    ? collisionPayloadTransferList(result.payload)
    : [];
  workerScope.postMessage(result, transfer);
});
