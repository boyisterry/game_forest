import assert from "node:assert/strict";
import test from "node:test";

import {
  CEDAR_CROSSING_MAP_ID,
  DEFAULT_CITY_MAP_SETTINGS,
  FOREST_DEFAULT_MAP_ID,
  MAP_LIBRARY_RECORD_VERSION,
  MapLibraryConflictError,
  MapLibraryRepository,
  RAIN_HARBOR_MAP_ID,
  createCityMapRecord,
  createDefaultMapLibraryRecords,
  normalizeMapLibraryName,
  parseMapLibraryRecord,
} from "../app/lib/map/mapLibrary.ts";
import {
  MemoryMapLibraryStore,
  createMapLibraryRepository,
} from "../app/lib/map/mapLibraryStorage.ts";

test("library defaults are fixed forest and editor-native Cedar Crossing records", () => {
  const records = createDefaultMapLibraryRecords();
  assert.deepEqual(records.map((record) => record.id), [FOREST_DEFAULT_MAP_ID, CEDAR_CROSSING_MAP_ID]);
  assert.equal(records[0].kind, "forest");
  assert.equal(records[0].settings.mapType, "forest");
  assert.equal(records[0].cityDocument, undefined);
  assert.equal(records[1].kind, "city");
  assert.equal(records[1].name, "Cedar Crossing");
  assert.deepEqual(records[1].settings, DEFAULT_CITY_MAP_SETTINGS);
  assert.equal(records[1].cityDocument.placements.length, 126);
  assert.equal(records[1].cityDocument.graph.edges.length, 56);
  assert.ok(Object.isFrozen(records[1].cityDocument.placements));
});

test("custom city records start from independent blank documents", () => {
  const first = createCityMapRecord("  我的   新城  ", { id: "city-first", now: 20 });
  const second = createCityMapRecord({ name: "Second", id: "city-second", now: 21 });
  assert.equal(first.name, "我的 新城");
  assert.equal(first.recordVersion, MAP_LIBRARY_RECORD_VERSION);
  assert.equal(first.kind, "city");
  assert.equal(first.builtin, false);
  assert.equal(first.settings.mapType, "city");
  assert.deepEqual(first.cityDocument.placements, []);
  assert.notEqual(first.cityDocument, second.cityDocument);
  assert.throws(() => createCityMapRecord("Reserved", { id: FOREST_DEFAULT_MAP_ID }), /reserved/);
});

test("names and record envelopes are validated strictly", () => {
  assert.equal(normalizeMapLibraryName(" A\n B "), "A B");
  assert.throws(() => normalizeMapLibraryName(" \t "), /empty/);
  assert.throws(() => normalizeMapLibraryName("x".repeat(49)), /at most 48/);

  const city = createCityMapRecord("Strict", { id: "city-strict", now: 30 });
  assert.throws(() => parseMapLibraryRecord({ ...city, extra: true }), /unknown field extra/);
  assert.throws(() => parseMapLibraryRecord({ ...city, kind: "forest" }), /kind must match/);
  assert.throws(() => parseMapLibraryRecord({ ...city, cityDocument: undefined }), /require cityDocument/);
  assert.throws(() => parseMapLibraryRecord({
    ...createDefaultMapLibraryRecords()[0],
    cityDocument: city.cityDocument,
  }), /must not contain cityDocument/);
  assert.throws(() => parseMapLibraryRecord({
    ...city,
    settings: { ...city.settings, deliveryStops: 2.5 },
  }), /deliveryStops must be an integer/);
});

test("repository merges fixed entries, persists custom maps, and protects fixed deletion", async () => {
  let now = 100;
  let id = 0;
  const store = new MemoryMapLibraryStore();
  const repository = new MapLibraryRepository(store, {
    now: () => now++,
    createId: () => `city-${++id}`,
  });
  assert.deepEqual((await repository.list()).map((record) => record.id), [FOREST_DEFAULT_MAP_ID, CEDAR_CROSSING_MAP_ID]);

  const created = await repository.createCity("Blank city");
  assert.equal(created.id, "city-1");
  assert.deepEqual(created.cityDocument.placements, []);
  assert.deepEqual((await repository.list()).map((record) => record.id), [FOREST_DEFAULT_MAP_ID, CEDAR_CROSSING_MAP_ID, "city-1"]);
  assert.equal((await repository.get("city-1")).name, "Blank city");
  assert.equal(await repository.delete(FOREST_DEFAULT_MAP_ID), false);
  assert.equal(await repository.delete(CEDAR_CROSSING_MAP_ID), false);
  assert.equal(await repository.delete(RAIN_HARBOR_MAP_ID), false);
  assert.equal(await repository.delete("city-1"), true);
  assert.equal(await repository.get("city-1"), null);
  await repository.flush();
});

test("legacy Rain Harbor overrides stay archived and cannot replace the editor-native city", async () => {
  const store = new MemoryMapLibraryStore();
  const legacy = parseMapLibraryRecord({
    ...createDefaultMapLibraryRecords()[1],
    id: RAIN_HARBOR_MAP_ID,
    name: "Old Rain Harbor",
  });
  await store.put(legacy);
  const repository = new MapLibraryRepository(store);
  const records = await repository.list();
  assert.equal(records.some((record) => record.id === RAIN_HARBOR_MAP_ID), false);
  assert.equal(records.filter((record) => record.id === CEDAR_CROSSING_MAP_ID).length, 1);
  assert.equal((await repository.get(CEDAR_CROSSING_MAP_ID)).cityDocument.placements.length, 126);
  assert.equal(await repository.get(RAIN_HARBOR_MAP_ID), null);
});

test("an obsolete persisted Cedar builtin resolves to the current sidewalk-aligned layout", async () => {
  const store = new MemoryMapLibraryStore();
  const shipped = createDefaultMapLibraryRecords()[1];
  const blankDocument = createCityMapRecord("Legacy shell", { id: "city-legacy-shell", now: 1 }).cityDocument;
  await store.put(parseMapLibraryRecord({
    ...shipped,
    builtinContentVersion: 0,
    revision: 7,
    cityDocument: blankDocument,
  }));

  const repository = new MapLibraryRepository(store, { now: () => 100 });
  const upgraded = await repository.get(CEDAR_CROSSING_MAP_ID);
  assert.equal(upgraded.builtinContentVersion, shipped.builtinContentVersion);
  assert.equal(upgraded.revision, 7, "migration must preserve the persisted CAS identity");
  assert.equal(upgraded.cityDocument.placements.length, 126);
  assert.equal(upgraded.cityDocument.graph.edges.length, 56);

  const saved = await repository.save(parseMapLibraryRecord({ ...upgraded, name: "Cedar Crossing" }));
  assert.equal(saved.revision, 8);
  assert.equal((await store.get(CEDAR_CROSSING_MAP_ID)).builtinContentVersion, shipped.builtinContentVersion);
});

test("save increments revisions and stale concurrent saves cannot overwrite newer data", async () => {
  let now = 500;
  const repository = new MapLibraryRepository(new MemoryMapLibraryStore(), {
    now: () => now++,
    createId: () => "city-race",
  });
  const created = await repository.createCity("Original");
  const firstDraft = parseMapLibraryRecord({ ...created, name: "First save" });
  const staleDraft = parseMapLibraryRecord({ ...created, name: "Stale save" });
  const firstWrite = repository.save(firstDraft);
  const staleWrite = repository.save(staleDraft);
  const saved = await firstWrite;
  assert.equal(saved.revision, 1);
  assert.equal(saved.name, "First save");
  await assert.rejects(staleWrite, (error) => {
    assert.ok(error instanceof MapLibraryConflictError);
    assert.equal(error.expectedRevision, 0);
    assert.equal(error.actualRevision, 1);
    return true;
  });
  assert.equal((await repository.get(created.id)).name, "First save");
});

test("two repositories sharing one store atomically reject a cross-instance stale save", async () => {
  let now = 1_000;
  const store = new MemoryMapLibraryStore();
  const firstRepository = new MapLibraryRepository(store, {
    now: () => now++,
    createId: () => "city-shared-race",
  });
  const secondRepository = new MapLibraryRepository(store, { now: () => now++ });
  const created = await firstRepository.createCity("Shared original");
  const firstSnapshot = await firstRepository.get(created.id);
  const secondSnapshot = await secondRepository.get(created.id);

  const outcomes = await Promise.allSettled([
    firstRepository.save(parseMapLibraryRecord({ ...firstSnapshot, name: "First tab" })),
    secondRepository.save(parseMapLibraryRecord({ ...secondSnapshot, name: "Second tab" })),
  ]);
  const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
  const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof MapLibraryConflictError);
  assert.equal(rejected[0].reason.actualRevision, 1);
  const persisted = await firstRepository.get(created.id);
  assert.equal(persisted.revision, 1);
  assert.equal(persisted.name, fulfilled[0].value.name);
});

test("the first durable save of a virtual builtin also uses atomic compare-and-put", async () => {
  let now = 2_000;
  const store = new MemoryMapLibraryStore();
  const firstRepository = new MapLibraryRepository(store, { now: () => now++ });
  const secondRepository = new MapLibraryRepository(store, { now: () => now++ });
  const firstForest = await firstRepository.get(FOREST_DEFAULT_MAP_ID);
  const secondForest = await secondRepository.get(FOREST_DEFAULT_MAP_ID);

  const outcomes = await Promise.allSettled([
    firstRepository.save(parseMapLibraryRecord({
      ...firstForest,
      settings: { ...firstForest.settings, seed: 111 },
    })),
    secondRepository.save(parseMapLibraryRecord({
      ...secondForest,
      settings: { ...secondForest.settings, seed: 222 },
    })),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  assert.ok(rejected.reason instanceof MapLibraryConflictError);
  assert.equal(rejected.reason.actualRevision, 1);
  assert.equal((await firstRepository.get(FOREST_DEFAULT_MAP_ID)).revision, 1);
});

test("reads and flush wait for serialized repository writes", async () => {
  class DelayedStore extends MemoryMapLibraryStore {
    async put(record) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      await super.put(record);
    }
  }
  const repository = new MapLibraryRepository(new DelayedStore(), {
    now: () => 700,
    createId: () => "city-delayed",
  });
  const pending = repository.createCity("Delayed");
  const listed = repository.list();
  await repository.flush();
  assert.equal((await pending).id, "city-delayed");
  assert.ok((await listed).some((record) => record.id === "city-delayed"));
});

test("Node and SSR factory gracefully uses memory when IndexedDB is absent", async () => {
  assert.equal(typeof indexedDB, "undefined");
  const repository = createMapLibraryRepository({
    now: () => 900,
    createId: () => "city-node",
  });
  assert.equal((await repository.list()).length, 2);
  await repository.createCity("Node city");
  assert.equal((await repository.get("city-node")).name, "Node city");
  await repository.flush();
  repository.close();
});
