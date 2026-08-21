import assert from "node:assert/strict";
import test from "node:test";

import { cloneCityDocument, emptyCityDocument, parseCityMapDocument } from "../app/lib/map/cityDocument.ts";
import { CityRoadChunkCompileCache } from "../app/lib/map/cityDocumentCollisionPipeline.ts";
import { deriveCityEntranceRoadRuntime } from "../app/lib/map/cityEntrances.ts";
import { createRoadProfile } from "../app/lib/map/cityRoadGraph.ts";
import { packRoadCollisionChunks } from "../app/lib/map/cityRoadCollisionSource.ts";

function roadDocument(endX = 40) {
  const document = cloneCityDocument(emptyCityDocument());
  document.graph.nodes.push(
    { id: "a", x: -40, z: 0 },
    { id: "b", x: endX, z: 0 },
  );
  document.graph.edges.push({
    id: "road",
    a: "a",
    b: "b",
    profile: createRoadProfile("two-way-1"),
  });
  return parseCityMapDocument(document).document;
}

function chunks(document, generation) {
  return packRoadCollisionChunks(
    deriveCityEntranceRoadRuntime(document).collisionSources,
    generation,
  );
}

test("road chunk compilation is reused by content across document generations", async () => {
  const cache = new CityRoadChunkCompileCache();
  const first = chunks(roadDocument(), 1);
  const second = chunks(roadDocument(), 2);
  assert.equal(first.length, second.length);
  let compileCalls = 0;
  const compile = async (source) => {
    compileCalls += 1;
    return { sourceId: source.sourceId, generation: source.generation };
  };

  const firstResults = await Promise.all(first.map((chunk) => cache.getOrCompile(chunk.source, compile)));
  const secondResults = await Promise.all(second.map((chunk) => cache.getOrCompile(chunk.source, compile)));

  assert.ok(firstResults.every((result) => result.cacheHit === false));
  assert.ok(secondResults.every((result) => result.cacheHit === true));
  assert.equal(compileCalls, first.length);
  assert.deepEqual(cache.stats(), {
    entries: first.length,
    hits: second.length,
    misses: first.length,
  });
});

test("road dependency changes invalidate only changed 64m chunk content", async () => {
  const cache = new CityRoadChunkCompileCache();
  const before = chunks(roadDocument(40), 1);
  const after = chunks(roadDocument(48), 2);
  let compileCalls = 0;
  const compile = async (source) => {
    compileCalls += 1;
    return { sourceId: source.sourceId, generation: source.generation };
  };
  await Promise.all(before.map((chunk) => cache.getOrCompile(chunk.source, compile)));
  const results = await Promise.all(after.map((chunk) => cache.getOrCompile(chunk.source, compile)));

  assert.ok(results.some((result) => result.cacheHit), "unchanged neighbouring chunks should be reused");
  assert.ok(results.some((result) => !result.cacheHit), "the edited road chunk must be recompiled");
  assert.equal(compileCalls, before.length + results.filter((result) => !result.cacheHit).length);
});
