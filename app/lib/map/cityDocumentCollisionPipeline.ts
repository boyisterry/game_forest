import {
  BUILTIN_SURFACE_PROFILES,
  BUILTIN_SURFACE_TRANSITIONS,
  canonicalTupleKey,
} from "./cityCollisionTypes.ts";
import type { CompiledCollisionSource } from "./cityCollisionCompileCore.ts";
import { deserializeCompiledCollision, hashCollisionCompileSource } from "./cityCollisionCompileCore.ts";
import {
  CompiledCityCollisionRuntime,
  type CompiledCollisionRuntimeOwner,
} from "./cityCompiledCollisionRuntime.ts";
import { CityCollisionPayloadStore } from "./cityCollisionStorage.ts";
import { CityCollisionWorkerClient } from "./cityCollisionWorkerClient.ts";
import type { PackedCollisionCompileSource } from "./cityCollisionWire.ts";
import type {
  CityMapDocumentSnapshot,
  GridPlacement,
  LegacyMassingPlacement,
  WorldPlacement,
} from "./cityDocument.ts";
import { buildLegacyMassingWalls } from "./cityDocumentCollision.ts";
import { deriveCityEntranceRoadRuntime } from "./cityEntrances.ts";
import { packRoadCollisionChunks } from "./cityRoadCollisionSource.ts";
import { deriveTrafficSignalPlacements } from "./citySignals.ts";
import { getCatalogEntry } from "./cityCatalog.ts";
import type {
  CityTemplateCache,
  VisualTemplateSourceRef,
} from "./cityTemplateCache.ts";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  TILE_SIZE_METERS,
} from "./cityTiles.ts";

export type TemplatePlacementPlan = Readonly<{
  ownerId: string;
  source: VisualTemplateSourceRef;
  resolvedHeightScale: number;
  transform: Readonly<{
    x: number;
    y: number;
    z: number;
    yawRadians: number;
    uniformScale: number;
  }>;
}>;

export type CityCollisionBuildReport = Readonly<{
  runtime: CompiledCityCollisionRuntime;
  catalogOwnerCount: number;
  trafficSignalOwnerCount: number;
  compiledTemplateCount: number;
  templateSurfaceOwnerCount: number;
  roadOwnerCount: number;
  roadChunkCompileHits: number;
  roadChunkCompileMisses: number;
  ownerIndexFullRebuild: boolean;
  ownerIndexReusedOwnerCount: number;
  ownerIndexAddedOwnerCount: number;
  ownerIndexUpdatedOwnerCount: number;
  ownerIndexRemovedOwnerCount: number;
  ownerIndexAffectedCellCount: number;
  releasedCanonicalSourceTreeCount: number;
  legacyOwnerCount: number;
}>;

export type CityRoadChunkCompileCacheStats = Readonly<{
  entries: number;
  hits: number;
  misses: number;
}>;

/** Content-addressed road compilation survives document-generation changes. */
export class CityRoadChunkCompileCache {
  private readonly compiledByHash = new Map<string, Promise<CompiledCollisionSource>>();
  private hits = 0;
  private misses = 0;

  async getOrCompile(
    source: PackedCollisionCompileSource,
    compile: (source: PackedCollisionCompileSource) => Promise<CompiledCollisionSource>,
  ) {
    const hash = await hashCollisionCompileSource(source);
    const existing = this.compiledByHash.get(hash);
    if (existing) {
      this.hits += 1;
      return Object.freeze({ compiled: await existing, cacheHit: true });
    }
    this.misses += 1;
    const promise = compile(source);
    this.compiledByHash.set(hash, promise);
    void promise.catch(() => {
      if (this.compiledByHash.get(hash) === promise) this.compiledByHash.delete(hash);
    });
    return Object.freeze({ compiled: await promise, cacheHit: false });
  }

  stats(): CityRoadChunkCompileCacheStats {
    return Object.freeze({ entries: this.compiledByHash.size, hits: this.hits, misses: this.misses });
  }

  clear() {
    this.compiledByHash.clear();
  }
}

let nextDocumentCollisionWorldId = 10_000;

function gridFootprint(placement: Readonly<GridPlacement>) {
  const entry = getCatalogEntry(placement.catalogId);
  if (!entry) return null;
  const base = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  return placement.yaw === 90 || placement.yaw === 270
    ? { w: base.d, d: base.w }
    : base;
}

function catalogPlacementPlan(
  placement: Readonly<GridPlacement | WorldPlacement>,
): TemplatePlacementPlan | null {
  const entry = getCatalogEntry(placement.catalogId);
  if (!entry) return null;
  const heightScale = placement.poseKind === "world"
    ? (placement.heightScale ?? entry.defaultHeightScale)
    : entry.defaultHeightScale;
  if (placement.poseKind === "world") {
    return Object.freeze({
      ownerId: canonicalTupleKey(["placement", placement.id]),
      source: Object.freeze({ kind: "catalog", catalogId: placement.catalogId }),
      resolvedHeightScale: heightScale,
      transform: Object.freeze({
        x: placement.x,
        y: 0,
        z: placement.z,
        yawRadians: placement.yawRadians,
        uniformScale: placement.scale,
      }),
    });
  }
  const footprint = gridFootprint(placement);
  if (!footprint) return null;
  return Object.freeze({
    ownerId: canonicalTupleKey(["placement", placement.id]),
    source: Object.freeze({ kind: "catalog", catalogId: placement.catalogId }),
    resolvedHeightScale: heightScale,
    transform: Object.freeze({
      x: CITY_TILE_ORIGIN_X + (placement.i + footprint.w * 0.5) * TILE_SIZE_METERS,
      y: 0,
      z: CITY_TILE_ORIGIN_Z + (placement.j + footprint.d * 0.5) * TILE_SIZE_METERS,
      yawRadians: placement.yaw * Math.PI / 180,
      uniformScale: 1,
    }),
  });
}

export function collectCityCollisionTemplatePlacements(
  document: CityMapDocumentSnapshot,
): readonly TemplatePlacementPlan[] {
  const placements: TemplatePlacementPlan[] = [];
  for (const placement of document.placements) {
    if (placement.poseKind === "legacy-massing") continue;
    const plan = catalogPlacementPlan(placement);
    if (plan) placements.push(plan);
  }
  for (const signal of deriveTrafficSignalPlacements(document).placements) {
    placements.push(Object.freeze({
      ownerId: signal.ownerId,
      source: Object.freeze({ kind: "derived", templateId: "traffic-light" }),
      resolvedHeightScale: signal.resolvedHeightScale,
      transform: Object.freeze({
        x: signal.x,
        y: signal.y,
        z: signal.z,
        yawRadians: signal.yawRadians,
        uniformScale: signal.uniformScale,
      }),
    }));
  }
  placements.sort((left, right) => left.ownerId.localeCompare(right.ownerId));
  return Object.freeze(placements);
}

function createLegacyCompiledSource(
  placement: Readonly<LegacyMassingPlacement>,
  documentGeneration: number,
): CompiledCollisionSource | null {
  const sourceWalls = buildLegacyMassingWalls([placement], documentGeneration);
  if (sourceWalls.length === 0) return null;
  const featureCount = sourceWalls.length * 2;
  const segmentXZ = new Float32Array(featureCount * 4);
  const normalsXZ = new Float32Array(featureCount * 2);
  const triangleTY = new Float32Array(featureCount * 6);
  const sourceTriangleIds = new Uint32Array(featureCount);
  const componentIds = new Uint32Array(featureCount);
  let feature = 0;
  sourceWalls.forEach((wall, wallIndex) => {
    const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az);
    const write = (triangle: readonly [number, number, number, number, number, number]) => {
      segmentXZ.set([wall.ax, wall.az, wall.bx, wall.bz], feature * 4);
      normalsXZ.set([wall.nx, wall.nz], feature * 2);
      triangleTY.set(triangle, feature * 6);
      sourceTriangleIds[feature] = feature;
      componentIds[feature] = Math.floor(wallIndex / 4);
      feature += 1;
    };
    write([0, wall.minY, length, wall.minY, length, wall.maxY]);
    write([0, wall.minY, length, wall.maxY, 0, wall.maxY]);
  });
  const identity = canonicalTupleKey(["legacy-massing-placement", placement.id, documentGeneration]);
  return Object.freeze({
    sourceId: identity,
    generation: documentGeneration,
    sourceHash: identity,
    cacheKey: identity,
    walls: Object.freeze({ segmentXZ, normalsXZ, triangleTY, sourceTriangleIds, componentIds }),
    surfaceChunk: null,
    fallback: null,
    surfaceProfiles: BUILTIN_SURFACE_PROFILES,
    surfaceTransitionProfiles: BUILTIN_SURFACE_TRANSITIONS,
  });
}

export function cityCollisionTemplateVariantKey(plan: TemplatePlacementPlan) {
  const id = plan.source.kind === "catalog" ? plan.source.catalogId : plan.source.templateId;
  return canonicalTupleKey([
    "template-variant",
    plan.source.kind,
    id,
  ]);
}

/**
 * Owns the production Worker + IndexedDB path and publishes only complete
 * immutable runtimes. A caller can keep its previous runtime active while a
 * new document generation compiles.
 */
export class CityDocumentCollisionPipeline {
  private readonly cache: CityTemplateCache;
  private readonly store: CityCollisionPayloadStore;
  private worker: CityCollisionWorkerClient | null = null;
  private readonly compiledByVariant = new Map<string, Promise<CompiledCollisionSource>>();
  private readonly roadChunkCompileCache = new CityRoadChunkCompileCache();
  private disposed = false;

  constructor(cache: CityTemplateCache, databaseName?: string) {
    this.cache = cache;
    this.store = new CityCollisionPayloadStore(databaseName);
  }

  async build(
    document: CityMapDocumentSnapshot,
    documentGeneration: number,
    signal?: AbortSignal,
    previousRuntime?: CompiledCityCollisionRuntime | null,
  ): Promise<CityCollisionBuildReport> {
    this.assertActive(signal);
    if (!Number.isSafeInteger(documentGeneration) || documentGeneration < 0) {
      throw new TypeError("documentGeneration must be a non-negative safe integer");
    }
    const plans = collectCityCollisionTemplatePlacements(document);
    const variants = new Map<string, TemplatePlacementPlan>();
    for (const plan of plans) variants.set(cityCollisionTemplateVariantKey(plan), plan);
    const compiledVariants = new Map<string, CompiledCollisionSource>();
    const compiledSurfaceVariants = new Map<string, readonly CompiledCollisionSource[]>();
    let releasedCanonicalSourceTreeCount = 0;
    await Promise.all([...variants].map(async ([key, plan]) => {
      const sourceLabel = plan.source.kind === "catalog"
        ? plan.source.catalogId
        : plan.source.templateId;
      try {
        this.assertActive(signal);
        const [packed, packedSurfaceChunks] = await Promise.all([
          this.cache.createCollisionCompileSource(
            plan.source,
            signal,
          ),
          this.cache.createSurfaceCollisionCompileSources(
            plan.source,
            signal,
          ),
        ]);
        this.assertActive(signal);
        const [compiled, compiledSurfaceChunks] = await Promise.all([
          this.compilePacked(packed),
          Promise.all(packedSurfaceChunks.map((chunk) => this.compilePacked(chunk))),
        ]);
        this.assertActive(signal);
        compiledVariants.set(key, compiled);
        compiledSurfaceVariants.set(key, Object.freeze(compiledSurfaceChunks));
        if (this.cache.releaseCanonicalSourceTree(plan.source)) {
          releasedCanonicalSourceTreeCount += 1;
        }
      } catch (error) {
        if (signal?.aborted || this.disposed) throw error;
        throw new Error(`failed to compile collision template ${sourceLabel}`, { cause: error });
      }
    }));
    this.assertActive(signal);

    const worldId = nextDocumentCollisionWorldId;
    nextDocumentCollisionWorldId += 1;
    const roadSources = deriveCityEntranceRoadRuntime(document).collisionSources;
    const packedRoadChunks = packRoadCollisionChunks(roadSources, documentGeneration);
    const compiledRoadChunks = await Promise.all(packedRoadChunks.map(async (chunk) => {
      const result = await this.roadChunkCompileCache.getOrCompile(
        chunk.source,
        (source) => this.compilePacked(source),
      );
      return Object.freeze({ chunk, ...result });
    }));
    this.assertActive(signal);
    const owners: CompiledCollisionRuntimeOwner[] = [];
    const legacy = document.placements.filter(
      (placement): placement is Readonly<LegacyMassingPlacement> => placement.poseKind === "legacy-massing",
    );
    for (const placement of legacy) {
      const legacySource = createLegacyCompiledSource(placement, documentGeneration);
      if (!legacySource) continue;
      owners.push(Object.freeze({
        ownerId: canonicalTupleKey(["legacy-massing", placement.id]),
        ownerGeneration: documentGeneration,
        source: legacySource,
        transform: Object.freeze({ heightScale: 1 }),
      }));
    }
    for (const plan of plans) {
      const key = cityCollisionTemplateVariantKey(plan);
      const source = compiledVariants.get(key);
      if (!source) throw new Error("compiled template variant disappeared during assembly");
      owners.push(Object.freeze({
        ownerId: plan.ownerId,
        ownerGeneration: documentGeneration,
        source,
        transform: Object.freeze({ ...plan.transform, heightScale: plan.resolvedHeightScale }),
      }));
      for (const surfaceSource of compiledSurfaceVariants.get(key) ?? []) {
        const chunk = surfaceSource.surfaceChunk;
        if (!chunk) throw new Error("compiled template surface chunk lost its surface payload");
        owners.push(Object.freeze({
          ownerId: canonicalTupleKey([
            "template-surface-chunk",
            plan.ownerId,
            chunk.chunkX,
            chunk.chunkZ,
          ]),
          ownerGeneration: documentGeneration,
          source: surfaceSource,
          transform: Object.freeze({ ...plan.transform, heightScale: plan.resolvedHeightScale }),
          surfaceHandleOwner: Object.freeze({
            ownerId: plan.ownerId,
            ownerGeneration: documentGeneration,
          }),
        }));
      }
    }
    for (const { chunk, compiled } of compiledRoadChunks) {
      const chunkX = chunk.source.chunkX;
      const chunkZ = chunk.source.chunkZ;
      if (chunkX === undefined || chunkZ === undefined) throw new Error("compiled road chunk lost its coordinates");
      owners.push(Object.freeze({
        ownerId: canonicalTupleKey(["road-chunk", chunkX, chunkZ]),
        ownerGeneration: documentGeneration,
        source: compiled,
        transform: Object.freeze({ heightScale: 1 }),
        roadSurfaceHandles: chunk.surfaceHandles,
        roadBoundaryHandles: chunk.boundaryHandles,
      }));
    }
    const runtime = new CompiledCityCollisionRuntime(owners, {
      worldId,
      documentGeneration,
      reuseOwnerIndexFrom: previousRuntime,
    });
    this.assertActive(signal);
    const trafficSignalOwnerCount = plans.filter((plan) => plan.source.kind === "derived").length;
    const templateSurfaceOwnerCount = plans.reduce(
      (count, plan) => count + (compiledSurfaceVariants.get(cityCollisionTemplateVariantKey(plan))?.length ?? 0),
      0,
    );
    const ownerIndex = runtime.getBuildStats();
    return Object.freeze({
      runtime,
      catalogOwnerCount: plans.length - trafficSignalOwnerCount,
      trafficSignalOwnerCount,
      compiledTemplateCount: compiledVariants.size,
      templateSurfaceOwnerCount,
      roadOwnerCount: compiledRoadChunks.length,
      roadChunkCompileHits: compiledRoadChunks.filter((chunk) => chunk.cacheHit).length,
      roadChunkCompileMisses: compiledRoadChunks.filter((chunk) => !chunk.cacheHit).length,
      ownerIndexFullRebuild: ownerIndex.fullOwnerIndexRebuild,
      ownerIndexReusedOwnerCount: ownerIndex.reusedOwnerCount,
      ownerIndexAddedOwnerCount: ownerIndex.addedOwnerCount,
      ownerIndexUpdatedOwnerCount: ownerIndex.updatedOwnerCount,
      ownerIndexRemovedOwnerCount: ownerIndex.removedOwnerCount,
      ownerIndexAffectedCellCount: ownerIndex.affectedSpatialCellCount,
      releasedCanonicalSourceTreeCount,
      legacyOwnerCount: legacy.length,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.store.close();
    for (const promise of this.compiledByVariant.values()) {
      void promise.then((compiled) => compiled.fallback?.geometry.dispose()).catch(() => undefined);
    }
    this.compiledByVariant.clear();
    this.roadChunkCompileCache.clear();
  }

  private compilePacked(source: PackedCollisionCompileSource): Promise<CompiledCollisionSource> {
    if (this.disposed) return Promise.reject(new Error("city document collision pipeline is disposed"));
    const variant = canonicalTupleKey([source.sourceId, source.generation]);
    const existing = this.compiledByVariant.get(variant);
    if (existing) return existing;
    const promise = this.compilePackedUncached(source);
    this.compiledByVariant.set(variant, promise);
    void promise.catch(() => {
      if (this.compiledByVariant.get(variant) === promise) {
        this.compiledByVariant.delete(variant);
      }
    });
    return promise;
  }

  private async compilePackedUncached(source: PackedCollisionCompileSource) {
    if (this.disposed) throw new Error("city document collision pipeline is disposed");
    const worker = this.worker ??= new CityCollisionWorkerClient();
    try {
      const registered = await worker.register(source);
      try {
        if (this.disposed) throw new Error("city document collision pipeline is disposed");
        let cached = null;
        try {
          cached = await this.store.get(registered.cacheKey);
        } catch {
          // IndexedDB can be unavailable in privacy modes; compilation still works.
        }
        if (cached?.header.sourceHash === registered.sourceHash
          && cached.header.sourceId === registered.sourceId) {
          try {
            const compiled = deserializeCompiledCollision(cached);
            return compiled.generation === source.generation
              ? compiled
              : Object.freeze({ ...compiled, generation: source.generation });
          } catch {
            try { await this.store.delete(registered.cacheKey); } catch { /* best effort */ }
          }
        }
        if (this.disposed) throw new Error("city document collision pipeline is disposed");
        const result = await worker.compile(
          registered.sourceId,
          registered.generation,
          registered.registrationToken,
        );
        if (result.type !== "compiled") throw new Error("collision source became stale during compilation");
        try { await this.store.put(result.payload); } catch { /* best effort */ }
        return deserializeCompiledCollision(result.payload);
      } finally {
        // dispose() terminates the Worker and rejects its pending requests. Do
        // not dispatch a release to that dead Worker: postMessage can succeed
        // without ever producing a response, which would strand this build.
        if (!this.disposed && this.worker === worker) {
          await worker.release(
            registered.sourceId,
            registered.generation,
            registered.registrationToken,
          ).catch(() => undefined);
        }
      }
    } catch (error) {
      // A Worker protocol/runtime failure is fatal for that Worker instance,
      // but not for the pipeline. The next build gets a fresh Worker.
      if (!this.disposed && this.worker === worker) {
        worker.terminate();
        this.worker = null;
      }
      throw error;
    }
  }

  private assertActive(signal?: AbortSignal) {
    if (this.disposed) throw new Error("city document collision pipeline is disposed");
    if (!signal?.aborted) return;
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("city collision build aborted", "AbortError");
  }
}
