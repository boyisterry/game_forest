"use client";

import { useEffect, useState } from "react";
import {
  BUILTIN_SURFACE_PROFILES,
  BUILTIN_SURFACE_TRANSITIONS,
  NO_SURFACE_KEY,
  PackedCollisionRoleCode,
  SURFACE_PROFILE_INDEX_NONE,
} from "../lib/map/cityCollisionTypes.ts";
import { CityCollisionPayloadStore } from "../lib/map/cityCollisionStorage.ts";
import { CityCollisionWorkerClient } from "../lib/map/cityCollisionWorkerClient.ts";
import type { PackedCollisionCompileSource } from "../lib/map/cityCollisionWire.ts";

type Result = Readonly<{
  state: "running" | "passed" | "failed";
  sourceDetached: boolean;
  renderSourceIntact: boolean;
  indexedDbHit: boolean;
  staleRejected: boolean;
  animationFrames: number;
  message: string;
}>;

const INITIAL: Result = Object.freeze({
  state: "running",
  sourceDetached: false,
  renderSourceIntact: false,
  indexedDbHit: false,
  staleRejected: false,
  animationFrames: 0,
  message: "Compiling in a module worker…",
});

function makeSource(): { source: PackedCollisionCompileSource; renderPositions: Float32Array } {
  // A two-triangle vertical wall. Collision owns a copy; the render source must
  // remain attached when the collision copy is transferred to the Worker.
  const renderPositions = new Float32Array([
    -4, 0, 0,
    4, 0, 0,
    4, 4, 0,
    -4, 4, 0,
  ]);
  const positions = new Float32Array(renderPositions);
  return {
    renderPositions,
    source: {
      kind: "template",
      sourceId: "browser-fixture-wall",
      generation: 1,
      triangles: {
        positions,
        indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
        triangleRoles: new Uint8Array([
          PackedCollisionRoleCode.Solid,
          PackedCollisionRoleCode.Solid,
        ]),
        triangleProfileIndices: new Uint16Array([
          SURFACE_PROFILE_INDEX_NONE,
          SURFACE_PROFILE_INDEX_NONE,
        ]),
        triangleSurfaceKeys: new Uint32Array([NO_SURFACE_KEY, NO_SURFACE_KEY]),
        sourceTriangleIds: new Uint32Array([101, 102]),
      },
      surfaceProfiles: BUILTIN_SURFACE_PROFILES,
      surfaceTransitionProfiles: BUILTIN_SURFACE_TRANSITIONS,
    },
  };
}

export function CollisionFixture() {
  const [result, setResult] = useState<Result>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const client = new CityCollisionWorkerClient();
    const store = new CityCollisionPayloadStore(`forest-courier-collision-e2e-${Date.now()}`);
    let frameCount = 0;
    let frame = 0;
    const heartbeat = () => {
      frameCount += 1;
      frame = requestAnimationFrame(heartbeat);
    };
    frame = requestAnimationFrame(heartbeat);

    void (async () => {
      try {
        const { source, renderPositions } = makeSource();
        const sourceBuffer = source.triangles.positions.buffer;
        const registered = await client.register(source);
        const sourceDetached = sourceBuffer.byteLength === 0;
        const renderSourceIntact = renderPositions.byteLength > 0 && renderPositions[0] === -4;
        const compiled = await client.compile(
          registered.sourceId,
          registered.generation,
          registered.registrationToken,
        );
        if (compiled.type !== "compiled") throw new Error("worker compile unexpectedly became stale");
        await store.put(compiled.payload);
        const cached = await store.get(compiled.payload.header.cacheKey);
        const indexedDbHit = cached?.header.sourceHash === compiled.payload.header.sourceHash
          && cached.buffers.length === compiled.payload.buffers.length;
        await client.release(registered.sourceId, registered.generation, registered.registrationToken);
        const stale = await client.compile(
          registered.sourceId,
          registered.generation,
          registered.registrationToken,
        );
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (!cancelled) {
          const passed = sourceDetached && renderSourceIntact && indexedDbHit && stale.type === "stale" && frameCount >= 2;
          setResult(Object.freeze({
            state: passed ? "passed" : "failed",
            sourceDetached,
            renderSourceIntact,
            indexedDbHit,
            staleRejected: stale.type === "stale",
            animationFrames: frameCount,
            message: passed ? "Worker, transfer, IndexedDB and stale-generation checks passed." : "One or more browser checks failed.",
          }));
        }
      } catch (error) {
        if (!cancelled) setResult(Object.freeze({
          ...INITIAL,
          state: "failed",
          animationFrames: frameCount,
          message: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        cancelAnimationFrame(frame);
        client.terminate();
        store.close();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      client.terminate();
      store.close();
    };
  }, []);

  return (
    <main style={{ padding: 32, fontFamily: "ui-monospace, monospace" }}>
      <h1>City collision browser fixture</h1>
      <output data-testid="collision-result" data-state={result.state}>{result.message}</output>
      <dl>
        <dt>sourceDetached</dt><dd data-testid="source-detached">{String(result.sourceDetached)}</dd>
        <dt>renderSourceIntact</dt><dd data-testid="render-intact">{String(result.renderSourceIntact)}</dd>
        <dt>indexedDbHit</dt><dd data-testid="idb-hit">{String(result.indexedDbHit)}</dd>
        <dt>staleRejected</dt><dd data-testid="stale-rejected">{String(result.staleRejected)}</dd>
        <dt>animationFrames</dt><dd data-testid="animation-frames">{result.animationFrames}</dd>
      </dl>
    </main>
  );
}
