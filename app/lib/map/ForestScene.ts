import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapSettings, Season } from "./types";
import { createRandom, range } from "./random";
import { createRoadTextures, enableRoadAntiTiling } from "./textures";
import { ChunkManager } from "./ChunkManager";
import { Minimap } from "./Minimap";
import { deriveCityMinimapWorld, type MinimapRoadLine } from "./cityMinimap.ts";
import {
  createSharedForestAssets,
  disposeSharedForestAssets,
  type SharedForestAssets,
} from "./forestAssets";
import {
  buildRoadIndex,
  clampToWorld,
  createWorldRoad,
  eastBoundaryX,
  FAILSAFE_INSET,
  isInsideWorld,
  makeRibbon,
  northBoundaryZ,
  southBoundaryZ,
  westBoundaryX,
} from "./world";
import { sampleBoundary } from "./boundaryTerrain";
import { createWorldBoundaries } from "./boundaries";
import { FarFieldLayer } from "./farField";
import { ProceduralSky } from "./sky";
import type { ForestModelPack } from "./treeModels";
import { createModelPackOwner, type ModelPackOwner } from "./modelPackOwner.ts";
import type { ResourceLease } from "./resourceLease.ts";
import { InputController } from "./input";
import { computeBrowsePanDelta, NO_BROWSE_MOVE, type BrowseMove } from "./browsePan";
import { MotorcycleController, PEAK_HORSEPOWER, type MotoPose } from "./motorcycle";
import { ChaseCamera } from "./chaseCamera";
import { CollisionWorld } from "./collision";
import { SkidMarks } from "./skidMarks";
import { AudioEngine } from "./audioEngine";
import { ShatterMorphController } from "./shatterMorph";
import { buildCityWorld, clampToCity, sampleCitySurface } from "./city";
import type { CityMapDocumentSnapshot } from "./cityDocument.ts";
import { CityDirtyLayer, type LayerMask } from "./cityEditor.ts";
import { createCatalogSourceRegistry, type CatalogSourceRegistry } from "./cityCatalogSources.ts";
import { createCityVisualLayerManager, type CityVisualLayerManager } from "./cityVisualLayerManager.ts";
import {
  CatalogVisualSourceMissingError,
  createCityTemplateCache,
  type CityTemplateCache,
} from "./cityTemplateCache.ts";
import { createCityDocumentRenderer, type CityDocumentRenderer } from "./cityDocumentRenderer.ts";
import { projectCityPointerToGround, setCityCameraTopDown, type CityViewportPoint } from "./cityEditorViewport.ts";
import { findNearestUnoccupiedCityPoint } from "./cityEditorOccupancy.ts";
import { getCatalogEntry } from "./cityCatalog.ts";
import { CityMotorcycleAdapter } from "./cityMotorcycleAdapter.ts";
import { CityMotorcycleFixedStepBridge } from "./cityMotorcycleFixedStep.ts";
import { CompiledCityCollisionRuntime } from "./cityCompiledCollisionRuntime.ts";
import { CityDocumentCollisionPipeline } from "./cityDocumentCollisionPipeline.ts";
import { createImplicitGroundSurfaceSample } from "./cityCollision.ts";
import { disposeRiderResources } from "./riderResources.ts";
import { resolvePendingDriveGate, shouldResumeDriveAfterRebuild } from "./driveModeGate.ts";
import {
  createCityEditorGrid,
  shouldShowCityEditorGrid,
  type CityEditorGrid,
} from "./cityEditorGrid.ts";
import {
  createCityPlacementPreview,
  type CityPlacementPreviewInput,
} from "./cityPlacementPreview.ts";
import {
  shouldRefreshCityShadow,
  updateCityShadowRigSnapshot,
} from "./cityShadowRefresh.ts";
import {
  createRiderContactShadow,
  type RiderContactShadowInput,
} from "./riderContactShadow.ts";
import {
  disposeSceneResources,
  retireResourceCacheGeneration,
} from "./cityResourceCache.ts";
import {
  inspectCityRenderCapabilities,
  summarizeCityFrameTimes,
} from "./cityPerformanceProbe.ts";
import {
  chooseCameraDepthBudget,
  chooseDynamicPixelRatio,
  CITY_RIDE_DETAILED_PLACEMENT_RADIUS_METERS,
  shouldSkipIdleCityRender,
} from "./renderPerformanceBudget.ts";
import {
  computeCityPerformanceCameraFit,
  type CityPerformanceBounds,
} from "./cityPerformanceStress.ts";

export type SceneStats = {
  trees: number;
  grass: number;
  stones: number;
  buildings: number;
  streetLights: number;
  deliveryStops: number;
  drawCalls: number;
  chunks: number;
};

type StatsListener = (stats: SceneStats) => void;

const SEASONS: Record<Season, { ground: number; leaves: number[]; tip: number; fog: number }> = {
  spring: { ground: 0x789663, leaves: [0x50782d, 0x6b9235, 0x84a746, 0x9cba60], tip: 0xb7cf77, fog: 0xe7ece2 },
  summer: { ground: 0x5f7f50, leaves: [0x315b2d, 0x47742f, 0x608b3c, 0x7a9f4b], tip: 0x9fb761, fog: 0xdde7da },
  autumn: { ground: 0x887b56, leaves: [0x874723, 0xad642b, 0xc98b37, 0xe0ad50], tip: 0xefc978, fog: 0xeee3d2 },
};

type DisjointTimerQueryExtension = Readonly<{
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}>;

type PendingGpuTimerQuery = Readonly<{
  query: WebGLQuery;
  shadowFrame: boolean;
}>;

type CityRenderCallPass = "color" | "transmission" | "shadow";

type MutableCityRenderCallRecord = {
  pass: CityRenderCallPass;
  category: string;
  objectName: string;
  materialName: string;
  calls: number;
  triangles: number;
};

function cityRenderCallCategory(object: THREE.Object3D) {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    const name = current.name;
    if (name.startsWith("city-batch-pool-") || name === "city-batch-world") return "batched-pool";
    if (name.startsWith("city-template-batches-") || name.startsWith("city-template-placement-")) {
      return "special-fallback";
    }
    if (name.startsWith("city-road-") || name === "city-document-road-tops") return "road";
    if (name === "city-document-legacy-massing" || name.startsWith("city-legacy-")) return "legacy-massing";
    if (name === "city-document-environment") return "environment";
    if (name === "rider-contact-shadow") return "rider-contact-shadow";
    if (name.includes("rider") || name.includes("motorcycle")) return "rider";
    if (name.includes("skid")) return "skid";
    if (name === "city-editor-grid") return "editor-grid";
    if (name.includes("sky")) return "sky";
  }
  return "other";
}

function createCityRenderPassProbe(onColorPass: () => void) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "city-render-pass-probe";
  mesh.renderOrder = Number.NEGATIVE_INFINITY;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.onBeforeRender = onColorPass;
  return Object.freeze({ mesh, geometry, material });
}

function pushBoundedSample(samples: number[], value: number) {
  samples.push(value);
  if (samples.length > 1_800) samples.shift();
}

export class ForestScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2200);
  private controls: OrbitControls;
  private world = new THREE.Group();
  private staticLayer = new THREE.Group();
  private chunkLayer = new THREE.Group();
  private clock = new THREE.Clock();
  private animationFrame = 0;
  private pageVisible = document.visibilityState !== "hidden";
  private forceRenderFrames = 2;
  private lastRenderInteractionMs = performance.now();
  private adaptivePixelRatio = 1;
  private lastResolutionTuneMs = 0;
  private rider: THREE.Group | null = null;
  private riderVisible = true;
  private settings: MapSettings;
  private onStats: StatsListener;
  private chunks = new ChunkManager(this.chunkLayer);
  private shared: SharedForestAssets | null = null;
  private sun: THREE.DirectionalLight | null = null;
  private roadPoints: THREE.Vector3[] = [];
  private cityMinimapRoadLines: MinimapRoadLine[] = [];
  private stopPoints: Array<{ x: number; z: number }> = [];
  private minimap: Minimap | null = null;
  private farField: FarFieldLayer | null = null;
  private sky: ProceduralSky;
  private modelPack: ForestModelPack | null = null;
  private modelPackLease: ResourceLease<ForestModelPack> | null = null;
  private readonly modelPackOwner: ModelPackOwner;
  private readonly ownsModelPackOwner: boolean;
  private disposed = false;
  private lastChunkFocus = "";
  private deliveryStopCount = 0;
  private driveMode = false;
  private pendingDrive = false;
  private roadDistanceFn: ((point: THREE.Vector3) => number) | null = null;
  private readonly shatterMorph = new ShatterMorphController(0);
  private input: InputController | null = null;
  private readonly moto = new MotorcycleController();
  private readonly riderContactShadow = createRiderContactShadow();
  private readonly riderContactSurface = createImplicitGroundSurfaceSample();
  private readonly chase = new ChaseCamera();
  private readonly collision = new CollisionWorld();
  private readonly skids = new SkidMarks();
  private readonly audio = new AudioEngine();
  private readonly dummy = new THREE.Object3D();
  private readonly streamForward = new THREE.Vector3();
  private driveModeListener: ((on: boolean) => void) | null = null;
  private cityEditorCameraModeListener: ((topDown: boolean) => void) | null = null;
  private readonly browseMove: BrowseMove = { ...NO_BROWSE_MOVE };
  private readonly browsePanDelta = new THREE.Vector3();
  private driveExitIntentListener: (() => void) | null = null;
  private cityStats = { buildings: 0, streetTrees: 0, streetLights: 0, trafficLights: 0, drawCalls: 0 };
  private cityDocument: CityMapDocumentSnapshot | null = null;
  private readonly cityCatalogSources: CatalogSourceRegistry = createCatalogSourceRegistry();
  private readonly cityVisualLayers: CityVisualLayerManager = createCityVisualLayerManager();
  private readonly cityTemplateCache: CityTemplateCache = createCityTemplateCache({
    sources: this.cityCatalogSources,
    layers: this.cityVisualLayers,
  });
  private readonly cityPlacementPreview = createCityPlacementPreview(this.cityTemplateCache);
  private cityDocumentRenderer: CityDocumentRenderer | null = null;
  private cityEditorGrid: CityEditorGrid | null = null;
  private cityEditorGridEnabled = false;
  private readonly cityEditRaycaster = new THREE.Raycaster();
  private cityEditorTopDown = false;
  private readonly cityCollisionPipeline = new CityDocumentCollisionPipeline(this.cityTemplateCache);
  private cityDocumentCollision: CompiledCityCollisionRuntime | null = null;
  private cityDocumentBike: CityMotorcycleFixedStepBridge | null = null;
  private cityCollisionGeneration = 0;
  private cityCollisionBuildAbort: AbortController | null = null;
  private cityCollisionReady = false;
  private lastShadowFocusX = Number.POSITIVE_INFINITY;
  private lastShadowFocusZ = Number.POSITIVE_INFINITY;
  private lastShadowUpdateMs = Number.NEGATIVE_INFINITY;
  private readonly cityShadowFrustum = new THREE.Frustum();
  private cityShadowFrustumValid = false;
  private cityPerformanceBounds: CityPerformanceBounds | null = null;
  private lastCityStatsPublishMs = 0;
  private lastCityFrameSampleMs = Number.NaN;
  private readonly cityFrameTimeSamples: number[] = [];
  private readonly cityCpuRenderSamples: number[] = [];
  private readonly cityNormalCpuRenderSamples: number[] = [];
  private readonly cityShadowCpuRenderSamples: number[] = [];
  private readonly cityGpuRenderSamples: number[] = [];
  private readonly cityNormalGpuRenderSamples: number[] = [];
  private readonly cityShadowGpuRenderSamples: number[] = [];
  private readonly cityColorCallSamples: number[] = [];
  private readonly cityNormalColorCallSamples: number[] = [];
  private readonly cityShadowFrameColorCallSamples: number[] = [];
  private readonly cityShadowCallSamples: number[] = [];
  private cityPassProbeArmed = false;
  private cityPassProbeShadowCalls = 0;
  private cityPassProbeShadowTriangles = 0;
  private readonly cityRenderPassProbe = createCityRenderPassProbe(() => {
    if (!this.cityPassProbeArmed) return;
    this.cityPassProbeArmed = false;
    this.cityPassProbeShadowCalls = this.renderer.info.render.calls;
    this.cityPassProbeShadowTriangles = this.renderer.info.render.triangles;
  });
  private gpuTimerGl: WebGL2RenderingContext | null = null;
  private gpuTimerExtension: DisjointTimerQueryExtension | null = null;
  private readonly pendingGpuTimerQueries: PendingGpuTimerQuery[] = [];
  private cityBatchVisibilityDurationTotalMs = 0;
  private cityBatchVisibilityDurationMaxMs = 0;
  private cityBatchVisibilityDurationSamples = 0;
  private cityPerformance = {
    renderCalls: 0,
    shadowRenderCalls: 0,
    triangles: 0,
    shadowTriangles: 0,
    frameSamples: 0,
    frameTimeP50Ms: 0,
    frameTimeP95Ms: 0,
    framesOver25MsRatio: 0,
    cpuRenderSamples: 0,
    cpuRenderP50Ms: 0,
    cpuRenderP95Ms: 0,
    normalCpuRenderSamples: 0,
    normalCpuRenderP50Ms: 0,
    normalCpuRenderP95Ms: 0,
    shadowCpuRenderSamples: 0,
    shadowCpuRenderP50Ms: 0,
    shadowCpuRenderP95Ms: 0,
    gpuTimerSupported: false,
    gpuRenderSamples: 0,
    gpuRenderP50Ms: 0,
    gpuRenderP95Ms: 0,
    normalGpuRenderSamples: 0,
    normalGpuRenderP50Ms: 0,
    normalGpuRenderP95Ms: 0,
    shadowGpuRenderSamples: 0,
    shadowGpuRenderP50Ms: 0,
    shadowGpuRenderP95Ms: 0,
    colorCallsAverage: 0,
    colorCallsMax: 0,
    colorCallsP50: 0,
    colorCallsP95: 0,
    normalColorCallsAverage: 0,
    normalColorCallsMax: 0,
    normalColorCallsP50: 0,
    normalColorCallsP95: 0,
    shadowFrameColorCallsAverage: 0,
    shadowFrameColorCallsMax: 0,
    shadowFrameColorCallsP50: 0,
    shadowFrameColorCallsP95: 0,
    shadowCallsAverage: 0,
    shadowCallsMax: 0,
    shadowCallsP50: 0,
    shadowCallsP95: 0,
    renderPassProbeMisses: 0,
    webglVersion: 1 as 1 | 2,
    webglRenderer: "unknown",
    multiDraw: false,
    batchBackend: "instanced-mesh" as "batched-mesh" | "instanced-mesh",
    batchPools: 0,
    batchInstances: 0,
    batchInstanceCapacity: 0,
    batchVertexCapacity: 0,
    batchIndexCapacity: 0,
    batchEstimatedBufferBytes: 0,
    batchVisiblePlacements: 0,
    batchVisibleInstances: 0,
    batchNearPlacements: 0,
    batchFarPlacements: 0,
    batchVisibilityUpdateMs: 0,
    batchVisibilityUpdateAverageMs: 0,
    batchVisibilityUpdateMaxMs: 0,
    fixedSteps: 0,
    collisionMicrosteps: 0,
    candidateOwners: 0,
    maxCandidateOwners: 0,
    bucketEntryVisits: 0,
    maxBucketEntryVisits: 0,
    staticShadowRefreshes: 0,
    riderContactShadowVisible: false,
    riderContactShadowOpacity: 0,
    riderStaticShadowCasters: 0,
    pickDurationMs: 0,
    pickTestedPlacements: 0,
    pickCandidatePlacements: 0,
    pickTestedSlots: 0,
    placementFullRebuilds: 0,
    placementIncrementalCommits: 0,
    placementLastAdded: 0,
    placementLastUpdated: 0,
    placementLastRemoved: 0,
    placementLastAffectedCatalogs: 0,
    placementLastAffectedCells: 0,
    collisionRoadChunkCompileHits: 0,
    collisionRoadChunkCompileMisses: 0,
    collisionStagedOverActiveRuntime: false,
    collisionOwnerIndexFullRebuild: true,
    collisionOwnerIndexReusedOwners: 0,
    collisionOwnerIndexAddedOwners: 0,
    collisionOwnerIndexUpdatedOwners: 0,
    collisionOwnerIndexRemovedOwners: 0,
    collisionOwnerIndexAffectedCells: 0,
    collisionReleasedCanonicalSourceTrees: 0,
  };

  constructor(
    canvas: HTMLCanvasElement,
    settings: MapSettings,
    onStats: StatsListener,
    modelPackOwner?: ModelPackOwner,
  ) {
    this.settings = settings;
    this.onStats = onStats;
    this.modelPackOwner = modelPackOwner ?? createModelPackOwner();
    this.ownsModelPackOwner = modelPackOwner === undefined;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    const cityRenderCapabilities = inspectCityRenderCapabilities(this.renderer);
    this.cityPerformance.webglVersion = cityRenderCapabilities.webglVersion;
    this.cityPerformance.webglRenderer = cityRenderCapabilities.renderer;
    this.cityPerformance.multiDraw = cityRenderCapabilities.multiDraw;
    this.cityPerformance.batchBackend = cityRenderCapabilities.batchBackend;
    if (cityRenderCapabilities.webglVersion === 2) {
      this.gpuTimerGl = this.renderer.getContext() as WebGL2RenderingContext;
      this.gpuTimerExtension = this.gpuTimerGl.getExtension(
        "EXT_disjoint_timer_query_webgl2",
      ) as DisjointTimerQueryExtension | null;
    }
    this.cityPerformance.gpuTimerSupported = this.gpuTimerExtension !== null;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.adaptivePixelRatio = Math.min(window.devicePixelRatio, 1.5);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.sky = new ProceduralSky(settings.season);
    this.cityRenderPassProbe.mesh.visible = settings.mapType === "city";
    this.scene.add(this.cityRenderPassProbe.mesh, this.sky.mesh, this.cityPlacementPreview.root);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 420;
    this.controls.target.set(0, 0, -8);
    this.resetCamera();
    this.setupLights();
    this.world.add(this.staticLayer, this.chunkLayer, this.skids.group, this.riderContactShadow.mesh);
    this.scene.add(this.world);
    this.loadRider();
    this.input = new InputController(this.onDriveExitIntent);
    // Arrow keys pan the workshop camera around the map (browse mode only).
    window.addEventListener("keydown", this.onBrowseKeyDown);
    window.addEventListener("keyup", this.onBrowseKeyUp);
    window.addEventListener("blur", this.onBrowseBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.controls.addEventListener("change", this.onControlsChange);
    // Stone kicks and tree rams feed short impact bursts into the ride audio.
    this.collision.onKick = (intensity) => this.audio.triggerImpact(intensity);
    this.collision.onTreeHit = (intensity) => this.audio.triggerImpact(intensity);
    this.resize();
    this.animate();
    void this.bootstrap();
  }

  private async bootstrap() {
    try {
      const lease = await this.modelPackOwner.borrow();
      if (this.disposed) {
        lease.release();
        return;
      }
      this.modelPackLease?.release();
      this.modelPackLease = lease;
      this.modelPack = lease.value;
      this.cityCatalogSources.replaceModelPack(this.modelPack);
    } catch (error) {
      if (this.disposed) return;
      console.warn("Forest model pack unavailable, falling back to procedural trees.", error);
      this.modelPack = null;
    }
    // Use the newest settings. A workshop rebuild may have occurred while the
    // model pack was loading, so the constructor snapshot is stale here.
    this.build(this.settings);
  }

  attachMinimap(canvas: HTMLCanvasElement) {
    this.minimap?.dispose();
    this.minimap = new Minimap(canvas);
    this.syncMinimapWorld();
    this.minimap.setJumpHandler((x, z) => this.jumpTo(x, z));
  }

  private syncMinimapWorld() {
    if (!this.minimap) return;
    if (this.settings.mapType === "city" && this.cityDocument) {
      this.minimap.setCityWorld(this.cityMinimapRoadLines, this.stopPoints, this.settings.seed);
      return;
    }
    this.minimap.setWorld(
      this.roadPoints.map((point) => ({ x: point.x, z: point.z })),
      this.stopPoints,
      this.settings.seed,
      this.settings.mapType,
    );
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xf7fff1, 0x526148, 1.55));
    const sun = new THREE.DirectionalLight(0xfff0c8, 3.15);
    sun.position.set(-28, 48, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 4;
    sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.04;
    this.sun = sun;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xa8cda2, 0.78);
    rim.position.set(30, 16, -34);
    this.scene.add(rim);
  }

  build(settings: MapSettings) {
    this.invalidateRender(true);
    const resumeDrive = shouldResumeDriveAfterRebuild({
      driveMode: this.driveMode,
      pendingDrive: this.pendingDrive,
    });
    if (this.driveMode) this.setDriveMode(false);
    this.pendingDrive = resumeDrive;
    this.settings = settings;
    this.configureShadowBudget(settings.mapType);
    this.syncRiderShadowPolicy();
    this.syncRenderResolutionBudget();
    this.shatterMorph.snap(settings.shatterMode ? 1 : 0);
    this.disposeWorld();
    this.skids.clear();
    const random = createRandom(settings.seed);
    const palette = SEASONS[settings.season];
    this.scene.background = new THREE.Color(palette.fog);
    this.sky.setSeason(settings.season);
    this.sky.setClear(false);
    if (this.sun) {
      this.sun.color.set(0xfff0c8);
      this.sun.intensity = 3.15;
    }
    // Larger world needs thinner fog so distant canopy still reads.
    this.scene.fog = new THREE.FogExp2(palette.fog, Math.min(settings.fogDensity, 0.0035));

    if (settings.mapType === "city") {
      if (this.cityDocument) this.buildCityDocument(this.cityDocument);
      else this.buildCity(settings);
      this.tryStartPendingDrive();
      return;
    }

    this.staticLayer.add(createWorldBoundaries(settings.seed, palette.ground));

    this.roadPoints = createWorldRoad(settings.seed, settings.roadCurves);
    const roadIndex = buildRoadIndex(this.roadPoints);
    const roadTextures = createRoadTextures(settings.seed, this.renderer.capabilities.getMaxAnisotropy());
    const road = new THREE.Mesh(
      makeRibbon(this.roadPoints, settings.roadWidth, 0.012),
      enableRoadAntiTiling(new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: roadTextures.map,
        normalMap: roadTextures.normalMap,
        normalScale: new THREE.Vector2(1.35, 1.35),
        roughnessMap: roadTextures.roughnessMap,
        roughness: 0.96,
      })),
    );
    road.receiveShadow = true;
    this.staticLayer.add(road);

    this.deliveryStopCount = settings.deliveryStops;
    this.stopPoints = this.addStops(this.roadPoints, settings.deliveryStops, random);

    this.shared = createSharedForestAssets(
      this.renderer,
      palette.tip,
      palette.ground,
      palette.leaves,
      {
        leafDensity: settings.treeLeafDensity,
        canopyWidth: settings.treeCanopyWidth,
      },
      settings.seed,
      this.modelPack,
    );

    const roadDistance = (point: THREE.Vector3) => roadIndex.minDistance(point, settings.roadWidth);
    this.roadDistanceFn = roadDistance;

    // Grass plate + procedural geometry LOD outside the streamed ring.
    const groundMap = this.shared.groundMaterial.map;
    if (groundMap) {
      this.farField = new FarFieldLayer({
        groundMap,
        normalMap: this.shared.groundMaterial.normalMap ?? null,
        roughnessMap: this.shared.groundMaterial.roughnessMap ?? null,
        barkMap: this.shared.trunkMaterial.map,
        barkNormalMap: this.shared.trunkMaterial.normalMap,
        barkRoughnessMap: this.shared.trunkMaterial.roughnessMap,
        seed: settings.seed,
        canopyColors: palette.leaves,
        canopyWidth: settings.treeCanopyWidth,
        treeHeightScale: settings.treeHeightScale,
        roadDistance,
        roadWidth: settings.roadWidth,
      });
      this.staticLayer.add(this.farField.group);
    }

    this.chunks.configure({
      assets: this.shared,
      worldSeed: settings.seed,
      forestDensity: settings.forestDensity,
      treeHeightScale: settings.treeHeightScale,
      shatterMode: settings.shatterMode,
      roadWidth: settings.roadWidth,
      roadDistance,
      insideWorld: (x, z, inset = 0) => isInsideWorld(x, z, settings.seed, inset),
    });

    // Seed the neighborhood around the rider / route middle before first frame.
    const start = this.roadPoints[Math.floor(this.roadPoints.length * 0.46)];
    this.controls.target.set(start.x, 0, start.z);
    this.camera.position.set(start.x + 48, 36, start.z + 62);
    this.controls.update();
    this.queueCameraFacingChunks(start.x, start.z);
    // Warm the nearest chunk immediately so the first frame isn't empty.
    this.chunks.pump();
    this.lastChunkFocus = "";
    this.publishStats();

    if (this.rider) {
      this.staticLayer.add(this.rider);
      const next = this.roadPoints[Math.floor(this.roadPoints.length * 0.48)];
      // Rider wheels are grounded to local y=0 in loadRider; rest them on the
      // road surface (makeRibbon elevation), which is now ~flush with the grass
      // carpet (y=0) so the rider no longer reads as floating above the ground.
      this.rider.position.set(start.x, 0.012, start.z);
      this.rider.rotation.y = Math.atan2(next.x - start.x, next.z - start.z);
      this.rider.visible = this.riderVisible;
    }

    this.syncMinimapWorld();
    this.tryStartPendingDrive();
  }

  private buildCity(settings: MapSettings) {
    this.scene.background = new THREE.Color(0xc5e5f5);
    this.scene.fog = new THREE.FogExp2(0xd9edf5, 0.00055);
    this.sky.setSeason("summer");
    this.sky.setClear(true);
    if (this.sun) {
      this.sun.color.set(0xfff3d3);
      this.sun.intensity = 4.15;
    }
    const built = buildCityWorld(settings, this.collision, this.modelPack);
    this.staticLayer.add(built.group);
    this.roadPoints = built.roadPoints;
    this.stopPoints = built.stops;
    this.deliveryStopCount = settings.deliveryStops;
    this.cityStats = {
      buildings: built.buildings,
      streetTrees: built.streetTrees,
      streetLights: built.streetLights,
      trafficLights: built.trafficLights,
      drawCalls: built.drawCalls,
    };

    const start = this.roadPoints[Math.floor(this.roadPoints.length * 0.08)];
    const next = this.roadPoints[Math.floor(this.roadPoints.length * 0.08) + 1] ?? start;
    this.controls.target.set(start.x, 0, start.z);
    this.camera.position.set(start.x + 76, 58, start.z + 92);
    this.controls.update();
    if (this.rider) {
      this.staticLayer.add(this.rider);
      this.rider.position.set(start.x, 0.012, start.z);
      this.rider.rotation.y = Math.atan2(next.x - start.x, next.z - start.z);
      this.rider.visible = this.riderVisible;
    }
    this.lastChunkFocus = "";
    this.publishStats();
    this.syncMinimapWorld();
  }

  private buildCityDocument(document: CityMapDocumentSnapshot) {
    this.scene.background = new THREE.Color(0xc5e5f5);
    this.scene.fog = new THREE.FogExp2(0xd9edf5, 0.00055);
    this.sky.setSeason("summer");
    this.sky.setClear(true);
    if (this.sun) {
      this.sun.color.set(0xfff3d3);
      this.sun.intensity = 4.15;
    }

    // The empty document is still an intentional, bounded editing frame.
    const environment = new THREE.Group();
    environment.name = "city-document-environment";
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(2520, 2260),
      new THREE.MeshStandardMaterial({ color: 0x8fc1d2, roughness: 0.7, metalness: 0.02 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.11, -110);
    water.receiveShadow = true;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 1940),
      new THREE.MeshStandardMaterial({ color: 0x9eaa9a, roughness: 0.97, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.025, -110);
    ground.receiveShadow = true;
    this.cityEditorGrid = createCityEditorGrid();
    environment.add(water, ground, this.cityEditorGrid.mesh);
    this.staticLayer.add(environment);
    this.syncCityEditorGridVisibility();

    this.cityDocumentRenderer = createCityDocumentRenderer({
      cache: this.cityTemplateCache,
      layers: this.cityVisualLayers,
      parentOwnedLayer: this.staticLayer,
      batchBackend: this.cityPerformance.batchBackend,
    });
    const report = this.cityDocumentRenderer.applyCityDocument(document);
    this.syncCityDocumentState(document, report);
    this.rebuildCityDocumentCollision(document);

    const start = document.spawn;
    this.controls.target.set(start.x, 0, start.z);
    this.camera.position.set(start.x + 76, 58, start.z + 92);
    this.camera.up.set(0, 1, 0);
    this.controls.update();
    if (this.rider) {
      this.staticLayer.add(this.rider);
      this.rider.position.set(start.x, 0.012, start.z);
      this.rider.rotation.y = start.heading;
      this.rider.visible = this.riderVisible;
    }
    this.lastChunkFocus = "";
    this.publishStats();
    this.syncMinimapWorld();
  }

  private syncCityDocumentState(
    document: CityMapDocumentSnapshot,
    report: ReturnType<CityDocumentRenderer["getStats"]>,
    updateRoadState = true,
  ) {
    if (updateRoadState) {
      const minimapWorld = deriveCityMinimapWorld(document.graph, this.settings.deliveryStops);
      this.cityMinimapRoadLines = [...minimapWorld.roadLines];
      this.roadPoints = minimapWorld.roadLines.flatMap((line) => line.map(
        (point) => new THREE.Vector3(point.x, 0, point.z),
      ));
      this.stopPoints = minimapWorld.stops.map((stop) => ({ x: stop.x, z: stop.z }));
      this.deliveryStopCount = this.stopPoints.length;
    }
    let buildings = 0;
    let streetTrees = 0;
    let streetLights = 0;
    for (const placement of document.placements) {
      if (placement.catalogId === "street-tree") streetTrees += 1;
      if (placement.catalogId === "street-light" || placement.catalogId === "park-street-light") streetLights += 1;
      const entry = getCatalogEntry(placement.catalogId);
      if (placement.poseKind === "legacy-massing" || entry?.category !== "decoration") buildings += 1;
    }
    this.cityStats = {
      buildings,
      streetTrees,
      streetLights,
      trafficLights: report.signalPlacementCount,
      drawCalls: report.roadMeshCount + report.legacyLayerCount
        + report.catalogAttachmentCount + report.signalAttachmentCount + 2,
    };
    this.cityPerformance.batchPools = report.catalogBatchPoolCount + report.signalBatchPoolCount;
    this.cityPerformance.batchInstances = report.catalogBatchInstanceCount + report.signalBatchInstanceCount;
    this.cityPerformance.batchInstanceCapacity = report.catalogBatchInstanceCapacity
      + report.signalBatchInstanceCapacity;
    this.cityPerformance.batchVertexCapacity = report.catalogBatchVertexCapacity
      + report.signalBatchVertexCapacity;
    this.cityPerformance.batchIndexCapacity = report.catalogBatchIndexCapacity
      + report.signalBatchIndexCapacity;
    this.cityPerformance.batchEstimatedBufferBytes = report.catalogBatchEstimatedBufferBytes
      + report.signalBatchEstimatedBufferBytes;
    this.cityPerformance.placementFullRebuilds = report.placementFullRebuildCount;
    this.cityPerformance.placementIncrementalCommits = report.placementIncrementalCommitCount;
    this.cityPerformance.placementLastAdded = report.placementLastAddedCount;
    this.cityPerformance.placementLastUpdated = report.placementLastUpdatedCount;
    this.cityPerformance.placementLastRemoved = report.placementLastRemovedCount;
    this.cityPerformance.placementLastAffectedCatalogs = report.placementLastAffectedCatalogCount;
    this.cityPerformance.placementLastAffectedCells = report.placementLastAffectedCellCount;
  }

  private rebuildCityDocumentCollision(document: CityMapDocumentSnapshot) {
    const resumeDrive = shouldResumeDriveAfterRebuild({
      driveMode: this.driveMode,
      pendingDrive: this.pendingDrive,
    });
    this.cityCollisionGeneration += 1;
    const generation = this.cityCollisionGeneration;
    this.cityCollisionBuildAbort?.abort();
    const abort = new AbortController();
    this.cityCollisionBuildAbort = abort;
    const preserveActiveRuntime = this.cityDocumentCollision !== null && this.cityDocumentBike !== null;
    this.cityPerformance.collisionStagedOverActiveRuntime = preserveActiveRuntime;
    if (!preserveActiveRuntime) {
      this.cityCollisionReady = false;
      if (this.driveMode) this.setDriveMode(false);
      this.pendingDrive = resumeDrive;
      this.syncCityEditorGridVisibility();
      this.cityDocumentBike?.reset();
    }
    void this.cityCollisionPipeline.build(
      document,
      generation,
      abort.signal,
      this.cityDocumentCollision,
    ).then((report) => {
      if (this.disposed || abort.signal.aborted || generation !== this.cityCollisionGeneration) {
        report.runtime.dispose();
        return;
      }
      this.cityDocumentCollision?.dispose();
      this.cityDocumentCollision = report.runtime;
      const adapter = new CityMotorcycleAdapter(report.runtime, {
        onImpact: ({ normalImpactSpeed }) => this.audio.triggerImpact(Math.min(1, normalImpactSpeed / 12)),
      });
      this.cityDocumentBike = new CityMotorcycleFixedStepBridge(adapter);
      this.cityCollisionReady = true;
      this.cityPerformance.collisionRoadChunkCompileHits = report.roadChunkCompileHits;
      this.cityPerformance.collisionRoadChunkCompileMisses = report.roadChunkCompileMisses;
      this.cityPerformance.collisionOwnerIndexFullRebuild = report.ownerIndexFullRebuild;
      this.cityPerformance.collisionOwnerIndexReusedOwners = report.ownerIndexReusedOwnerCount;
      this.cityPerformance.collisionOwnerIndexAddedOwners = report.ownerIndexAddedOwnerCount;
      this.cityPerformance.collisionOwnerIndexUpdatedOwners = report.ownerIndexUpdatedOwnerCount;
      this.cityPerformance.collisionOwnerIndexRemovedOwners = report.ownerIndexRemovedOwnerCount;
      this.cityPerformance.collisionOwnerIndexAffectedCells = report.ownerIndexAffectedCellCount;
      this.cityPerformance.collisionReleasedCanonicalSourceTrees += report.releasedCanonicalSourceTreeCount;
      this.recoverCityRiderPose(document);
      this.publishStats();
      this.tryStartPendingDrive();
    }).catch((error) => {
      if (abort.signal.aborted || generation !== this.cityCollisionGeneration || this.disposed) return;
      if (!preserveActiveRuntime) this.cityCollisionReady = false;
      for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
        // The constructor starts before the shared tree pack is ready. Bootstrap
        // replaces the registry and performs a full rebuild, so this first miss
        // is an expected pending state rather than a failed city document.
        if (cause instanceof CatalogVisualSourceMissingError) return;
      }
      console.error("Failed to compile city document collision", error);
    });
  }

  isCityDocumentCollisionReady() {
    return this.settings.mapType !== "city" || this.cityCollisionReady;
  }

  /** Apply an immutable city revision without transferring document ownership. */
  applyCityDocument(document: CityMapDocumentSnapshot, dirty?: LayerMask) {
    this.invalidateRender(true);
    const previous = this.cityDocument;
    this.cityDocument = document;
    if (this.settings.mapType !== "city") return;
    if (!this.cityDocumentRenderer) {
      this.build(this.settings);
      return;
    }
    const report = this.cityDocumentRenderer.applyCityDocument(document, dirty);
    const roadStateDirty = dirty === undefined
      || (dirty & (CityDirtyLayer.Roads | CityDirtyLayer.Minimap)) !== 0;
    this.syncCityDocumentState(document, report, roadStateDirty);
    const collisionDirty = dirty === undefined
      || (dirty & (CityDirtyLayer.Roads | CityDirtyLayer.Placements | CityDirtyLayer.Collision | CityDirtyLayer.Surface)) !== 0;
    if (collisionDirty) this.rebuildCityDocumentCollision(document);
    const spawnChanged = !previous
      || previous.spawn.x !== document.spawn.x
      || previous.spawn.z !== document.spawn.z
      || previous.spawn.heading !== document.spawn.heading;
    const fullDocumentReplacement = dirty === undefined
      || (dirty & CityDirtyLayer.Spawn) !== 0;
    if (spawnChanged || fullDocumentReplacement) this.resetCityRiderToSpawn(document);
    this.publishStats();
    if (roadStateDirty) this.syncMinimapWorld();
  }

  getCityDocument(): CityMapDocumentSnapshot | null {
    return this.cityDocument;
  }

  /** Reserve primary drag for editor tools while retaining wheel/right-pan. */
  setCityRoadEditingEnabled(enabled: boolean) {
    this.controls.mouseButtons.LEFT = enabled ? null : THREE.MOUSE.ROTATE;
  }

  /** Freeze OrbitControls only while the editor owns a concrete object drag. */
  setCityPlacementDragging(dragging: boolean) {
    if (this.driveMode) return;
    this.controls.enabled = !dragging;
  }

  setCityPlacementPreview(input: CityPlacementPreviewInput | null) {
    this.cityPlacementPreview.set(
      this.settings.mapType === "city" && !this.driveMode && !this.pendingDrive ? input : null,
    );
    this.invalidateRender(false);
  }

  /** Editor chrome requests the grid; scene mode gates decide actual visibility. */
  setCityEditorGridVisible(enabled: boolean) {
    this.cityEditorGridEnabled = enabled;
    this.syncCityEditorGridVisibility();
  }

  setCityEditorGridHover(cell: Readonly<{ i: number; j: number }> | null) {
    this.cityEditorGrid?.setHoveredCell(cell);
  }

  private syncCityEditorGridVisibility() {
    if (!this.cityEditorGrid) return;
    this.cityEditorGrid.mesh.visible = shouldShowCityEditorGrid({
      enabled: this.cityEditorGridEnabled,
      mapType: this.settings.mapType,
      driveMode: this.driveMode,
      pendingDrive: this.pendingDrive,
      hasDocument: this.cityDocument !== null,
    });
    if (!this.cityEditorGrid.mesh.visible) this.cityEditorGrid.setHoveredCell(null);
  }

  private resetCityRiderToSpawn(document: CityMapDocumentSnapshot) {
    const rider = this.rider;
    if (!rider) return;
    rider.position.set(document.spawn.x, 0.012, document.spawn.z);
    rider.rotation.set(0, document.spawn.heading, 0);
    this.moto.reset(document.spawn.x, document.spawn.z, document.spawn.heading);
    this.cityDocumentBike?.reset();
    if (!this.driveMode) {
      this.controls.target.set(document.spawn.x, 0, document.spawn.z);
      this.controls.update();
    }
  }

  private recoverCityRiderPose(document: CityMapDocumentSnapshot) {
    const rider = this.rider;
    if (!rider) return;
    const recovered = findNearestUnoccupiedCityPoint(document, rider.position.x, rider.position.z);
    if (!recovered.relocated) return;
    rider.position.set(recovered.x, 0.012, recovered.z);
    this.moto.reset(recovered.x, recovered.z, rider.rotation.y);
    this.cityDocumentBike?.reset();
    this.chase.reset();
    if (!this.driveMode) {
      this.controls.target.set(recovered.x, 0, recovered.z);
      this.controls.update();
    }
  }

  projectCityPointer(clientX: number, clientY: number): CityViewportPoint | null {
    if (this.settings.mapType !== "city") return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    return projectCityPointerToGround(this.camera, rect, clientX, clientY, this.cityEditRaycaster);
  }

  pickCityPlacement(clientX: number, clientY: number): string | null {
    if (!this.cityDocumentRenderer || this.settings.mapType !== "city") return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.cityEditRaycaster.setFromCamera(new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    ), this.camera);
    const placementId = this.cityDocumentRenderer.raycast(this.cityEditRaycaster)[0]?.placementId ?? null;
    const pick = this.cityDocumentRenderer.getRaycastStats();
    this.cityPerformance.pickDurationMs = pick.durationMs;
    this.cityPerformance.pickTestedPlacements = pick.testedPlacements;
    this.cityPerformance.pickCandidatePlacements = pick.candidatePlacements;
    this.cityPerformance.pickTestedSlots = pick.testedSlots;
    return placementId;
  }

  setCityEditorTopDown(topDown: boolean) {
    if (this.settings.mapType !== "city") return;
    this.cityEditorTopDown = topDown;
    setCityCameraTopDown(this.camera, this.controls.target, topDown);
    this.controls.update();
    this.cityEditorCameraModeListener?.(topDown);
  }

  isCityEditorTopDown() {
    return this.cityEditorTopDown;
  }

  setCityEditorCameraModeListener(listener: ((topDown: boolean) => void) | null) {
    this.cityEditorCameraModeListener = listener;
  }

  private addStops(road: THREE.Vector3[], count: number, random: () => number) {
    const points: Array<{ x: number; z: number }> = [];
    const group = new THREE.Group();
    for (let i = 0; i < count; i += 1) {
      const index = Math.floor(((i + 1) / (count + 1)) * (road.length - 1));
      const p = road[index];
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 1.6, 7),
        new THREE.MeshStandardMaterial({ color: 0x5c4935, roughness: 1 }),
      );
      post.position.set(p.x + (i % 2 ? 2.4 : -2.4), 0.8, p.z);
      post.castShadow = true;
      const lantern = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.48, 0.48),
        new THREE.MeshStandardMaterial({ color: 0xf2ba54, emissive: 0xf1a933, emissiveIntensity: 1.6, roughness: 0.7 }),
      );
      lantern.position.copy(post.position).add(new THREE.Vector3(0, 0.78, 0));
      lantern.rotation.y = range(random, -0.2, 0.2);
      lantern.castShadow = true;
      group.add(post, lantern);
      points.push({ x: post.position.x, z: post.position.z });
      this.collision.registerStatic({ x: post.position.x, z: post.position.z, r: 0.4 });
    }
    this.staticLayer.add(group);
    return points;
  }

  private loadRider() {
    const loader = new GLTFLoader();
    loader.load("/models/rabbit-rider.glb", (gltf) => {
      const model = gltf.scene;
      if (this.disposed) {
        disposeRiderResources(model);
        return;
      }
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = this.settings.mapType !== "city";
          child.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = 2.4 / Math.max(size.y, size.x, size.z, 0.001);
      model.scale.setScalar(scale);
      // GLB length is along +X; arcade dynamics treat heading 0 as +Z forward.
      model.rotation.y = -Math.PI / 2;
      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.position.y += box.getSize(new THREE.Vector3()).y * 0.5;
      const rider = new THREE.Group();
      rider.add(model);
      this.rider = rider;
      this.build(this.settings);
      this.tryStartPendingDrive();
    });
  }

  isRiderReady() {
    return Boolean(this.rider);
  }

  toggleRider(visible: boolean) {
    this.riderVisible = visible;
    if (this.rider) this.rider.visible = visible;
    if (!visible) this.riderContactShadow.mesh.visible = false;
    if (!visible && this.driveMode) this.setDriveMode(false);
  }

  private syncRiderShadowPolicy() {
    const castShadow = this.settings.mapType !== "city";
    let staticShadowCasters = 0;
    this.rider?.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = castShadow;
      if (child.castShadow) staticShadowCasters += 1;
    });
    this.cityPerformance.riderStaticShadowCasters = staticShadowCasters;
    if (castShadow) this.riderContactShadow.mesh.visible = false;
  }

  private syncRiderContactShadow() {
    const rider = this.rider;
    const enabled = this.settings.mapType === "city" && rider !== null;
    let surfaceHeight = 0;
    let surfaceNormalX = 0;
    let surfaceNormalY = 1;
    let surfaceNormalZ = 0;
    if (enabled && this.cityDocumentBike) {
      const surface = this.cityDocumentBike.adapter.writeSurfaceSample(this.riderContactSurface);
      surfaceHeight = surface.height;
      surfaceNormalX = surface.normalX;
      surfaceNormalY = surface.normalY;
      surfaceNormalZ = surface.normalZ;
    } else if (enabled && rider) {
      const surface = sampleCitySurface(
        rider.position.x,
        rider.position.z,
        this.settings.roadWidth,
        this.settings.seed,
      );
      const inverseLength = 1 / Math.hypot(surface.gx, 1, surface.gz);
      surfaceHeight = surface.height;
      surfaceNormalX = -surface.gx * inverseLength;
      surfaceNormalY = inverseLength;
      surfaceNormalZ = -surface.gz * inverseLength;
    }
    const input: RiderContactShadowInput = {
      enabled,
      riderVisible: this.riderVisible && (rider?.visible ?? false),
      riderX: rider?.position.x ?? 0,
      // The renderer adds 0.012m as a ground-clearance bias; it is not flight.
      riderY: (rider?.position.y ?? 0) - 0.012,
      riderZ: rider?.position.z ?? 0,
      surfaceHeight,
      surfaceNormalX,
      surfaceNormalY,
      surfaceNormalZ,
    };
    const pose = this.riderContactShadow.update(input);
    this.cityPerformance.riderContactShadowVisible = pose.visible;
    this.cityPerformance.riderContactShadowOpacity = pose.opacity;
  }

  setDriveMode(on: boolean) {
    if (on) {
      if (this.driveMode) {
        this.pendingDrive = false;
        return;
      }
      this.pendingDrive = true;
      this.syncCityEditorGridVisibility();
      this.tryStartPendingDrive();
      return;
    }

    this.pendingDrive = false;
    if (!this.driveMode) {
      this.syncCityEditorGridVisibility();
      return;
    }
    this.driveMode = false;
    this.syncCameraDepthBudget();
    this.syncRenderResolutionBudget();
    this.cityPerformance.fixedSteps = 0;
    this.cityPerformance.collisionMicrosteps = 0;
    this.syncCityEditorGridVisibility();
    this.cityDocumentBike?.reset();
    this.input?.detach();
    this.chase.detach();
    this.audio.stop();
    this.controls.enabled = true;
    if (this.rider) {
      this.controls.target.set(this.rider.position.x, 0, this.rider.position.z);
      this.controls.update();
    }
    this.driveModeListener?.(false);
  }

  private tryStartPendingDrive() {
    if (this.disposed || this.driveMode) return;
    const gate = resolvePendingDriveGate({
      requested: this.pendingDrive,
      riderReady: this.rider !== null,
      cityCollisionRequired: this.settings.mapType === "city" && this.cityDocument !== null,
      cityCollisionReady: this.cityCollisionReady,
    });
    if (gate !== "ready") return;

    this.pendingDrive = false;
    if (this.settings.mapType === "city" && this.cityDocument) {
      this.recoverCityRiderPose(this.cityDocument);
    }
    this.driveMode = true;
    this.syncCameraDepthBudget();
    this.syncRenderResolutionBudget();
    this.syncCityEditorGridVisibility();
    this.clearBrowseMove();
    this.toggleRider(true);
    this.controls.enabled = false;
    if (this.rider) {
      this.moto.reset(this.rider.position.x, this.rider.position.z, this.rider.rotation.y);
    }
    this.cityDocumentBike?.reset();
    this.input?.attach();
    this.input?.clearVirtual();
    this.chase.reset();
    this.chase.attach(this.renderer.domElement);
    // Entering ride mode is a user gesture, so this is where audio may start.
    this.audio.init();
    this.audio.start();
    // Flush accumulated time so the first ride frame doesn't jump.
    this.clock.getDelta();
    this.renderer.domElement.focus?.();
    this.driveModeListener?.(true);
  }

  setDriveModeListener(listener: (on: boolean) => void) {
    this.driveModeListener = listener;
  }

  isDriveModePending() {
    return this.pendingDrive;
  }

  /** Notify the UI after Escape has stopped a ride; ordinary rebuilds do not emit this intent. */
  setDriveExitIntentListener(listener: (() => void) | null) {
    this.driveExitIntentListener = listener;
  }

  private onDriveExitIntent = () => {
    this.setDriveMode(false);
    this.driveExitIntentListener?.();
  };

  private clearBrowseMove() {
    this.browseMove.forward = false;
    this.browseMove.back = false;
    this.browseMove.left = false;
    this.browseMove.right = false;
  }

  private setBrowseKey(code: string, pressed: boolean): boolean {
    switch (code) {
      case "ArrowUp":
        this.browseMove.forward = pressed;
        return true;
      case "ArrowDown":
        this.browseMove.back = pressed;
        return true;
      case "ArrowLeft":
        this.browseMove.left = pressed;
        return true;
      case "ArrowRight":
        this.browseMove.right = pressed;
        return true;
      default:
        return false;
    }
  }

  private onBrowseKeyDown = (event: KeyboardEvent) => {
    // Ride mode owns the arrow keys (throttle/steer); only pan while browsing.
    if (this.driveMode) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
    }
    if (this.setBrowseKey(event.code, true)) {
      this.invalidateRender(false);
      event.preventDefault();
    }
  };

  private onBrowseKeyUp = (event: KeyboardEvent) => {
    this.setBrowseKey(event.code, false);
    this.invalidateRender(false);
  };

  private onBrowseBlur = () => {
    this.clearBrowseMove();
  };

  /** Inject drive input for browser QA / tests. */
  setDriveInput(partial: Parameters<InputController["setVirtual"]>[0]) {
    this.input?.setVirtual(partial);
  }

  isDriveMode() {
    return this.driveMode;
  }

  setAudioMuted(muted: boolean) {
    this.audio.setMuted(muted);
  }

  getShatterMode() {
    return this.settings.shatterMode;
  }

  /**
   * Toggle shattered forest with the approved blast / gather morph.
   * Does not rebuild chunks — dual-pose matrix lerp in place.
   */
  setShatterMode(on: boolean) {
    this.settings = { ...this.settings, shatterMode: on };
    if (this.settings.mapType === "city") return;
    this.shatterMorph.animateTo(on);
    // Apply first frame immediately so the click feels responsive.
    this.chunks.setShatterVisual(this.shatterMorph.getAmount(), this.shatterMorph.isBlasting());
  }

  isAudioMuted() {
    return this.audio.isMuted();
  }

  /** Live telemetry for the corner speedometer (km/h + HP). */
  getDriveHud() {
    const pose = this.moto.getPose();
    const speedMs = Math.abs(pose.speed);
    return {
      speedKmh: speedMs * 3.6,
      horsepower: pose.power * PEAK_HORSEPOWER,
      powerNorm: pose.power,
      reverse: pose.speed < -0.15,
      drifting: pose.drifting,
    };
  }

  jumpTo(x: number, z: number) {
    if (this.driveMode) return; // minimap jump would teleport the rider mid-drive
    if (this.settings.mapType === "city") {
      this.cityEditorTopDown = false;
      this.cityEditorCameraModeListener?.(false);
      const clamped = clampToCity(x, z, 80);
      this.controls.target.set(clamped.x, 0, clamped.z);
      this.camera.position.set(clamped.x + 66, 52, clamped.z + 78);
      this.controls.update();
      return;
    }
    const clamped = clampToWorld(x, z, this.settings.seed, 150);
    this.controls.target.set(clamped.x, 0, clamped.z);
    const distances = [
      { side: "west", value: clamped.x - westBoundaryX(clamped.z, this.settings.seed) },
      { side: "east", value: eastBoundaryX(clamped.z, this.settings.seed) - clamped.x },
      { side: "north", value: clamped.z - northBoundaryZ(clamped.x, this.settings.seed) },
      { side: "south", value: southBoundaryZ(clamped.x, this.settings.seed) - clamped.z },
    ].sort((a, b) => a.value - b.value);
    const nearest = distances[0];
    if (nearest.value < 260 && nearest.side === "east") this.camera.position.set(clamped.x - 84, 46, clamped.z + 12);
    else if (nearest.value < 260 && nearest.side === "west") this.camera.position.set(clamped.x + 84, 46, clamped.z + 12);
    else if (nearest.value < 260 && nearest.side === "north") this.camera.position.set(clamped.x + 12, 46, clamped.z + 88);
    else if (nearest.value < 260 && nearest.side === "south") this.camera.position.set(clamped.x + 12, 46, clamped.z - 88);
    else this.camera.position.set(clamped.x + 52, 40, clamped.z + 68);
    this.controls.update();
    this.queueCameraFacingChunks(clamped.x, clamped.z);
    this.chunks.pump();
    this.publishStats();
  }

  fitCityPerformanceBounds(bounds: CityPerformanceBounds) {
    const fit = computeCityPerformanceCameraFit(bounds, this.camera.fov, this.camera.aspect);
    this.cityPerformanceBounds = bounds;
    this.cityEditorTopDown = false;
    this.cityEditorCameraModeListener?.(false);
    this.controls.target.set(fit.targetX, fit.targetY, fit.targetZ);
    this.camera.position.set(fit.cameraX, fit.cameraY, fit.cameraZ);
    this.camera.near = fit.near;
    this.camera.far = fit.far;
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = Math.max(420, fit.distance * 1.5);
    this.controls.update();
    this.invalidateRender(true);
    return fit;
  }

  private clampCityBrowseFocus(x: number, z: number, inset: number) {
    const bounds = this.cityPerformanceBounds;
    if (!bounds) return clampToCity(x, z, inset);
    const minX = bounds.minX + Math.min(inset, bounds.width * 0.5);
    const maxX = bounds.maxX - Math.min(inset, bounds.width * 0.5);
    const minZ = bounds.minZ + Math.min(inset, bounds.depth * 0.5);
    const maxZ = bounds.maxZ - Math.min(inset, bounds.depth * 0.5);
    return {
      x: THREE.MathUtils.clamp(x, minX, maxX),
      z: THREE.MathUtils.clamp(z, minZ, maxZ),
    };
  }

  /** Queue the focus disc plus one camera-facing forward cap. */
  private queueCameraFacingChunks(focusX: number, focusZ: number) {
    if (this.settings.mapType === "city") return;
    this.camera.getWorldDirection(this.streamForward);
    this.chunks.update(focusX, focusZ, this.streamForward.x, this.streamForward.z);
  }

  resetCamera() {
    if (this.roadPoints.length) {
      const start = this.roadPoints[Math.floor(this.roadPoints.length * 0.46)];
      this.jumpTo(start.x, start.z);
      return;
    }
    this.camera.position.set(52, 40, 68);
    this.controls.target.set(0, 0, -8);
    this.controls.update();
    if (this.settings.mapType === "city") {
      this.cityEditorTopDown = false;
      this.cityEditorCameraModeListener?.(false);
    }
  }

  setUnderstoryCamera() {
    const focus = this.controls.target.clone();
    this.controls.target.set(focus.x, 2.8, focus.z);
    this.camera.position.set(focus.x + 12, 4.6, focus.z + 18);
    this.controls.update();
    if (this.settings.mapType === "city") {
      this.cityEditorTopDown = false;
      this.cityEditorCameraModeListener?.(false);
    }
  }

  resize() {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.invalidateRender(true);
  }

  private invalidateRender(shadow: boolean) {
    this.forceRenderFrames = Math.max(this.forceRenderFrames, 2);
    this.lastRenderInteractionMs = performance.now();
    if (shadow && this.settings.mapType === "city") this.renderer.shadowMap.needsUpdate = true;
  }

  private onControlsChange = () => {
    this.invalidateRender(false);
  };

  private onVisibilityChange = () => {
    this.pageVisible = document.visibilityState !== "hidden";
    if (!this.pageVisible) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.lastCityFrameSampleMs = Number.NaN;
      return;
    }
    this.clock.getDelta();
    this.invalidateRender(true);
    if (!this.animationFrame && !this.disposed) this.animate();
  };

  private publishStats() {
    if (this.settings.mapType === "city") {
      this.onStats({
        trees: this.cityStats.streetTrees,
        grass: 0,
        stones: 0,
        buildings: this.cityStats.buildings,
        streetLights: this.cityStats.streetLights,
        deliveryStops: this.deliveryStopCount,
        drawCalls: this.cityStats.drawCalls,
        chunks: 1,
      });
      return;
    }
    const stats = this.chunks.getStats();
    this.onStats({
      trees: stats.trees,
      grass: stats.grass,
      stones: stats.stones,
      buildings: 0,
      streetLights: 0,
      deliveryStops: this.deliveryStopCount,
      drawCalls: stats.drawCalls + 9,
      chunks: stats.chunks,
    });
  }

  getTextState() {
    const stats = this.chunks.getStats();
    const pose = this.moto.getPose();
    return {
      mode: this.driveMode ? "ride" : "map-editor",
      mapType: this.settings.mapType,
      coordinateSystem: "world origin at map center; +x east/right, +z south/down",
      cameraFocus: this.driveMode
        ? { x: Number(pose.x.toFixed(1)), z: Number(pose.z.toFixed(1)) }
        : {
            x: Number(this.controls.target.x.toFixed(1)),
            z: Number(this.controls.target.z.toFixed(1)),
          },
      cameraPosition: {
        x: Number(this.camera.position.x.toFixed(1)),
        y: Number(this.camera.position.y.toFixed(1)),
        z: Number(this.camera.position.z.toFixed(1)),
      },
      cameraProjection: {
        near: this.camera.near,
        far: this.camera.far,
      },
      drive: this.driveMode
        ? {
            speed: Number(pose.speed.toFixed(2)),
            rider: { x: Number(pose.x.toFixed(1)), z: Number(pose.z.toFixed(1)) },
            rollingStones: this.collision.activeStoneCount(),
          }
        : null,
      streamedForest: {
        focusChunk: stats.focus,
        loadedChunks: stats.loadedKeys,
        pendingChunks: stats.pending,
        trees: stats.trees,
        grassTufts: stats.grass,
        stones: stats.stones,
      },
      settings: {
        mapType: this.settings.mapType,
        seed: this.settings.seed,
        forestDensity: this.settings.forestDensity,
        treeHeightScale: this.settings.treeHeightScale,
        shatterMode: this.settings.shatterMode,
        season: this.settings.season,
      },
      cityFacilities: this.settings.mapType === "city"
        ? {
            showroomTree: "tree_normal_medium_redwood_a.glb",
            trees: this.cityStats.streetTrees,
            showroomStreetLights: this.cityStats.streetLights,
            showroomTrafficLights: this.cityStats.trafficLights,
          }
        : null,
      cityDocument: this.settings.mapType === "city" && this.cityDocument
        ? {
            collisionReady: this.cityCollisionReady,
            spawn: { ...this.cityDocument.spawn },
            placements: this.cityDocument.placements.length,
            roads: this.cityDocument.graph.edges.length,
          }
        : null,
      cityPerformance: this.settings.mapType === "city"
        ? {
            ...this.cityPerformance,
            ...(() => {
              const memory = (performance as Performance & { memory?: Readonly<{
                usedJSHeapSize: number;
                totalJSHeapSize: number;
                jsHeapSizeLimit: number;
              }> }).memory;
              return {
                jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
                jsHeapTotalBytes: memory?.totalJSHeapSize ?? null,
                jsHeapLimitBytes: memory?.jsHeapSizeLimit ?? null,
              };
            })(),
          }
        : null,
      cityEditorGrid: {
        requested: this.cityEditorGridEnabled,
        visible: this.cityEditorGrid?.mesh.visible ?? false,
      },
      cityPlacementPreview: this.cityPlacementPreview.getState(),
    };
  }

  advanceForTest(ms: number) {
    const frames = Math.max(1, Math.ceil(ms / (1000 / 60)));
    const dt = 1 / 60;
    let changed = false;
    for (let i = 0; i < frames; i += 1) {
      if (this.shatterMorph.update(dt)) {
        this.chunks.setShatterVisual(this.shatterMorph.getAmount(), this.shatterMorph.isBlasting());
      }
      if (this.driveMode) {
        const input = this.input
          ? this.input.poll()
          : { throttle: 0, brake: 0, steer: 0, boost: false, hardBrake: false, hardBrakeEdge: false };
        const seed = this.settings.seed;
        const clampFn = this.settings.mapType === "city"
          ? (x: number, z: number) => clampToCity(x, z, 3)
          : (x: number, z: number) => clampToWorld(x, z, seed, FAILSAFE_INSET);
        let pose: MotoPose;
        let presentationPose: MotoPose;
        if (this.settings.mapType === "city" && this.cityDocumentBike) {
          const fixedFrame = this.cityDocumentBike.advance(dt, input, this.moto, clampFn);
          pose = fixedFrame.pose;
          presentationPose = fixedFrame.presentationPose;
        } else {
          const boundaryFn = this.settings.mapType === "city"
            ? (x: number, z: number) => sampleCitySurface(x, z, this.settings.roadWidth, this.settings.seed)
            : (x: number, z: number) => sampleBoundary(x, z, seed);
          pose = this.moto.update(dt, input, this.collision, clampFn, boundaryFn);
          presentationPose = pose;
          this.collision.stepStones(dt, clampFn, boundaryFn);
          this.collision.writeMatrices(this.dummy);
        }
        if (this.rider) {
          this.rider.position.set(presentationPose.x, 0.012 + presentationPose.y, presentationPose.z);
          this.rider.rotation.set(presentationPose.pitch, presentationPose.heading, -presentationPose.lean, "YXZ");
        }
        this.skids.update(pose, input.brake > 0 || input.hardBrake, pose.drifting);
        this.chase.update(dt, this.camera, presentationPose, input.boost);
        if (this.settings.mapType === "forest") changed = this.chunks.pump() || changed;
      } else {
        // Mirror the live animate loop so browse panning is deterministic here.
        const pan = computeBrowsePanDelta(this.camera.position, this.controls.target, this.browseMove, dt, this.browsePanDelta);
        if (pan.lengthSq() > 0) {
          this.camera.position.add(pan);
          this.controls.target.add(pan);
        }
        if (this.settings.mapType === "forest") changed = this.chunks.pump() || changed;
      }
    }
    if (changed) this.publishStats();
    if (!this.driveMode) this.controls.update();
    this.sky.follow(this.camera);
    this.syncRiderContactShadow();
    this.renderSceneFrame();
  }

  private clearPendingGpuTimerQueries() {
    if (this.gpuTimerGl) {
      for (const pending of this.pendingGpuTimerQueries) {
        this.gpuTimerGl.deleteQuery(pending.query);
      }
    }
    this.pendingGpuTimerQueries.length = 0;
  }

  private pollGpuTimerQueries() {
    const gl = this.gpuTimerGl;
    const extension = this.gpuTimerExtension;
    if (!gl || !extension) return;
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
      this.clearPendingGpuTimerQueries();
      return;
    }
    while (this.pendingGpuTimerQueries.length > 0) {
      const pending = this.pendingGpuTimerQueries[0];
      if (!gl.getQueryParameter(pending.query, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pendingGpuTimerQueries.shift();
      const nanoseconds = Number(gl.getQueryParameter(pending.query, gl.QUERY_RESULT));
      gl.deleteQuery(pending.query);
      if (!Number.isFinite(nanoseconds) || nanoseconds < 0) continue;
      const milliseconds = nanoseconds / 1_000_000;
      pushBoundedSample(this.cityGpuRenderSamples, milliseconds);
      pushBoundedSample(
        pending.shadowFrame ? this.cityShadowGpuRenderSamples : this.cityNormalGpuRenderSamples,
        milliseconds,
      );
    }
  }

  private renderSceneFrame() {
    if (this.settings.mapType !== "city") {
      this.renderer.info.autoReset = true;
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.cityRenderPassProbe.mesh.visible = true;
    this.cityPassProbeArmed = true;
    this.cityPassProbeShadowCalls = 0;
    this.cityPassProbeShadowTriangles = 0;
    const shadowFrame = this.renderer.shadowMap.autoUpdate || this.renderer.shadowMap.needsUpdate;
    this.pollGpuTimerQueries();
    const gl = this.gpuTimerGl;
    const extension = this.gpuTimerExtension;
    let gpuQuery: WebGLQuery | null = null;
    if (gl && extension && this.pendingGpuTimerQueries.length < 64) {
      gpuQuery = gl.createQuery();
      if (gpuQuery) gl.beginQuery(extension.TIME_ELAPSED_EXT, gpuQuery);
    }
    const startedAt = performance.now();
    try {
      this.renderer.render(this.scene, this.camera);
    } finally {
      if (gpuQuery && gl && extension) {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        this.pendingGpuTimerQueries.push(Object.freeze({ query: gpuQuery, shadowFrame }));
      }
    }
    const cpuDurationMs = performance.now() - startedAt;
    if (this.cityPassProbeArmed) {
      this.cityPassProbeArmed = false;
      this.cityPerformance.renderPassProbeMisses += 1;
    }
    const totalCalls = this.renderer.info.render.calls;
    const totalTriangles = this.renderer.info.render.triangles;
    const colorCalls = Math.max(0, totalCalls - this.cityPassProbeShadowCalls);
    const colorTriangles = Math.max(0, totalTriangles - this.cityPassProbeShadowTriangles);
    this.cityPerformance.renderCalls = colorCalls;
    this.cityPerformance.shadowRenderCalls = this.cityPassProbeShadowCalls;
    this.cityPerformance.triangles = colorTriangles;
    this.cityPerformance.shadowTriangles = this.cityPassProbeShadowTriangles;
    pushBoundedSample(this.cityCpuRenderSamples, cpuDurationMs);
    pushBoundedSample(
      shadowFrame ? this.cityShadowCpuRenderSamples : this.cityNormalCpuRenderSamples,
      cpuDurationMs,
    );
    pushBoundedSample(this.cityColorCallSamples, colorCalls);
    pushBoundedSample(
      shadowFrame ? this.cityShadowFrameColorCallSamples : this.cityNormalColorCallSamples,
      colorCalls,
    );
    if (shadowFrame) pushBoundedSample(this.cityShadowCallSamples, this.cityPassProbeShadowCalls);
  }

  private updateCityRenderPerformanceSummaries() {
    const copySummary = (
      samples: readonly number[],
      assign: (count: number, p50: number, p95: number) => void,
    ) => {
      const summary = summarizeCityFrameTimes(samples);
      assign(summary.samples, summary.p50Ms, summary.p95Ms);
    };
    copySummary(this.cityCpuRenderSamples, (samples, p50, p95) => {
      this.cityPerformance.cpuRenderSamples = samples;
      this.cityPerformance.cpuRenderP50Ms = p50;
      this.cityPerformance.cpuRenderP95Ms = p95;
    });
    copySummary(this.cityNormalCpuRenderSamples, (samples, p50, p95) => {
      this.cityPerformance.normalCpuRenderSamples = samples;
      this.cityPerformance.normalCpuRenderP50Ms = p50;
      this.cityPerformance.normalCpuRenderP95Ms = p95;
    });
    copySummary(this.cityShadowCpuRenderSamples, (samples, p50, p95) => {
      this.cityPerformance.shadowCpuRenderSamples = samples;
      this.cityPerformance.shadowCpuRenderP50Ms = p50;
      this.cityPerformance.shadowCpuRenderP95Ms = p95;
    });
    copySummary(this.cityGpuRenderSamples, (samples, p50, p95) => {
      this.cityPerformance.gpuRenderSamples = samples;
      this.cityPerformance.gpuRenderP50Ms = p50;
      this.cityPerformance.gpuRenderP95Ms = p95;
    });
    copySummary(this.cityNormalGpuRenderSamples, (samples, p50, p95) => {
      this.cityPerformance.normalGpuRenderSamples = samples;
      this.cityPerformance.normalGpuRenderP50Ms = p50;
      this.cityPerformance.normalGpuRenderP95Ms = p95;
    });
    copySummary(this.cityShadowGpuRenderSamples, (samples, p50, p95) => {
      this.cityPerformance.shadowGpuRenderSamples = samples;
      this.cityPerformance.shadowGpuRenderP50Ms = p50;
      this.cityPerformance.shadowGpuRenderP95Ms = p95;
    });
    const summarizeCalls = (samples: readonly number[]) => {
      const percentiles = summarizeCityFrameTimes(samples);
      return Object.freeze({
        average: samples.length === 0 ? 0 : samples.reduce((sum, value) => sum + value, 0) / samples.length,
        max: samples.length === 0 ? 0 : Math.max(...samples),
        p50: percentiles.p50Ms,
        p95: percentiles.p95Ms,
      });
    };
    const colorCalls = summarizeCalls(this.cityColorCallSamples);
    const normalColorCalls = summarizeCalls(this.cityNormalColorCallSamples);
    const shadowFrameColorCalls = summarizeCalls(this.cityShadowFrameColorCallSamples);
    const shadowCalls = summarizeCalls(this.cityShadowCallSamples);
    this.cityPerformance.colorCallsAverage = colorCalls.average;
    this.cityPerformance.colorCallsMax = colorCalls.max;
    this.cityPerformance.colorCallsP50 = colorCalls.p50;
    this.cityPerformance.colorCallsP95 = colorCalls.p95;
    this.cityPerformance.normalColorCallsAverage = normalColorCalls.average;
    this.cityPerformance.normalColorCallsMax = normalColorCalls.max;
    this.cityPerformance.normalColorCallsP50 = normalColorCalls.p50;
    this.cityPerformance.normalColorCallsP95 = normalColorCalls.p95;
    this.cityPerformance.shadowFrameColorCallsAverage = shadowFrameColorCalls.average;
    this.cityPerformance.shadowFrameColorCallsMax = shadowFrameColorCalls.max;
    this.cityPerformance.shadowFrameColorCallsP50 = shadowFrameColorCalls.p50;
    this.cityPerformance.shadowFrameColorCallsP95 = shadowFrameColorCalls.p95;
    this.cityPerformance.shadowCallsAverage = shadowCalls.average;
    this.cityPerformance.shadowCallsMax = shadowCalls.max;
    this.cityPerformance.shadowCallsP50 = shadowCalls.p50;
    this.cityPerformance.shadowCallsP95 = shadowCalls.p95;
  }

  resetCityPerformanceSamples() {
    this.lastCityFrameSampleMs = Number.NaN;
    this.cityFrameTimeSamples.length = 0;
    this.cityCpuRenderSamples.length = 0;
    this.cityNormalCpuRenderSamples.length = 0;
    this.cityShadowCpuRenderSamples.length = 0;
    this.cityGpuRenderSamples.length = 0;
    this.cityNormalGpuRenderSamples.length = 0;
    this.cityShadowGpuRenderSamples.length = 0;
    this.cityColorCallSamples.length = 0;
    this.cityNormalColorCallSamples.length = 0;
    this.cityShadowFrameColorCallSamples.length = 0;
    this.cityShadowCallSamples.length = 0;
    this.clearPendingGpuTimerQueries();
    this.lastCityStatsPublishMs = Number.NEGATIVE_INFINITY;
    this.cityPerformance.frameSamples = 0;
    this.cityPerformance.frameTimeP50Ms = 0;
    this.cityPerformance.frameTimeP95Ms = 0;
    this.cityPerformance.framesOver25MsRatio = 0;
    this.cityPerformance.cpuRenderSamples = 0;
    this.cityPerformance.cpuRenderP50Ms = 0;
    this.cityPerformance.cpuRenderP95Ms = 0;
    this.cityPerformance.normalCpuRenderSamples = 0;
    this.cityPerformance.normalCpuRenderP50Ms = 0;
    this.cityPerformance.normalCpuRenderP95Ms = 0;
    this.cityPerformance.shadowCpuRenderSamples = 0;
    this.cityPerformance.shadowCpuRenderP50Ms = 0;
    this.cityPerformance.shadowCpuRenderP95Ms = 0;
    this.cityPerformance.gpuRenderSamples = 0;
    this.cityPerformance.gpuRenderP50Ms = 0;
    this.cityPerformance.gpuRenderP95Ms = 0;
    this.cityPerformance.normalGpuRenderSamples = 0;
    this.cityPerformance.normalGpuRenderP50Ms = 0;
    this.cityPerformance.normalGpuRenderP95Ms = 0;
    this.cityPerformance.shadowGpuRenderSamples = 0;
    this.cityPerformance.shadowGpuRenderP50Ms = 0;
    this.cityPerformance.shadowGpuRenderP95Ms = 0;
    this.cityPerformance.colorCallsAverage = 0;
    this.cityPerformance.colorCallsMax = 0;
    this.cityPerformance.colorCallsP50 = 0;
    this.cityPerformance.colorCallsP95 = 0;
    this.cityPerformance.normalColorCallsAverage = 0;
    this.cityPerformance.normalColorCallsMax = 0;
    this.cityPerformance.normalColorCallsP50 = 0;
    this.cityPerformance.normalColorCallsP95 = 0;
    this.cityPerformance.shadowFrameColorCallsAverage = 0;
    this.cityPerformance.shadowFrameColorCallsMax = 0;
    this.cityPerformance.shadowFrameColorCallsP50 = 0;
    this.cityPerformance.shadowFrameColorCallsP95 = 0;
    this.cityPerformance.shadowCallsAverage = 0;
    this.cityPerformance.shadowCallsMax = 0;
    this.cityPerformance.shadowCallsP50 = 0;
    this.cityPerformance.shadowCallsP95 = 0;
    this.cityPerformance.renderPassProbeMisses = 0;
    this.cityBatchVisibilityDurationTotalMs = 0;
    this.cityBatchVisibilityDurationMaxMs = 0;
    this.cityBatchVisibilityDurationSamples = 0;
    this.cityPerformance.batchVisibilityUpdateAverageMs = 0;
    this.cityPerformance.batchVisibilityUpdateMaxMs = 0;
    this.cityPerformance.staticShadowRefreshes = 0;
  }

  captureCityRenderCallAttribution() {
    if (this.settings.mapType !== "city") throw new Error("city render attribution requires a city map");
    const renderer = this.renderer;
    const originalRenderBufferDirect = renderer.renderBufferDirect;
    const records = new Map<string, MutableCityRenderCallRecord>();
    renderer.renderBufferDirect = (...args: Parameters<THREE.WebGLRenderer["renderBufferDirect"]>) => {
      const pass: CityRenderCallPass = this.cityPassProbeArmed
        ? "shadow"
        : renderer.getRenderTarget() === null ? "color" : "transmission";
      const beforeCalls = renderer.info.render.calls;
      const beforeTriangles = renderer.info.render.triangles;
      originalRenderBufferDirect.apply(renderer, args);
      const calls = renderer.info.render.calls - beforeCalls;
      const triangles = renderer.info.render.triangles - beforeTriangles;
      if (calls <= 0 && triangles <= 0) return;
      const material = args[3];
      const object = args[4];
      const category = cityRenderCallCategory(object);
      const objectName = object.name || object.type;
      const materialName = material.name || material.type;
      const key = `${pass}\u0000${category}\u0000${objectName}\u0000${materialName}`;
      const record = records.get(key) ?? {
        pass,
        category,
        objectName,
        materialName,
        calls: 0,
        triangles: 0,
      };
      record.calls += calls;
      record.triangles += triangles;
      records.set(key, record);
    };
    try {
      this.renderSceneFrame();
    } finally {
      renderer.renderBufferDirect = originalRenderBufferDirect;
    }
    const entries = [...records.values()]
      .sort((left, right) => right.calls - left.calls
        || right.triangles - left.triangles
        || left.category.localeCompare(right.category)
        || left.objectName.localeCompare(right.objectName))
      .map((record) => Object.freeze({ ...record }));
    const byCategory = new Map<string, MutableCityRenderCallRecord>();
    for (const entry of entries) {
      const key = `${entry.pass}\u0000${entry.category}`;
      const record = byCategory.get(key) ?? {
        pass: entry.pass,
        category: entry.category,
        objectName: "*",
        materialName: "*",
        calls: 0,
        triangles: 0,
      };
      record.calls += entry.calls;
      record.triangles += entry.triangles;
      byCategory.set(key, record);
    }
    return Object.freeze({
      colorCalls: entries.reduce((sum, entry) => sum + (entry.pass !== "shadow" ? entry.calls : 0), 0),
      transmissionCalls: entries.reduce(
        (sum, entry) => sum + (entry.pass === "transmission" ? entry.calls : 0),
        0,
      ),
      shadowCalls: entries.reduce((sum, entry) => sum + (entry.pass === "shadow" ? entry.calls : 0), 0),
      byCategory: Object.freeze([...byCategory.values()]
        .sort((left, right) => left.pass.localeCompare(right.pass) || right.calls - left.calls)
        .map((record) => Object.freeze({
          pass: record.pass,
          category: record.category,
          calls: record.calls,
          triangles: record.triangles,
        }))),
      topObjects: Object.freeze(entries.slice(0, 80)),
    });
  }

  requestCityShadowRefresh() {
    if (this.settings.mapType !== "city") return;
    this.lastShadowFocusX = Number.POSITIVE_INFINITY;
    this.lastShadowFocusZ = Number.POSITIVE_INFINITY;
    this.lastShadowUpdateMs = Number.NEGATIVE_INFINITY;
    this.invalidateRender(true);
  }

  private syncShadowRig(focusX: number, focusZ: number) {
    if (!this.sun) return;
    if (this.settings.mapType === "city") {
      const now = performance.now();
      const movedSquared = (focusX - this.lastShadowFocusX) ** 2
        + (focusZ - this.lastShadowFocusZ) ** 2;
      if (!shouldRefreshCityShadow({
        driveMode: this.driveMode,
        riderPoseChanged: false,
        focusDistanceSquared: movedSquared,
        elapsedMs: now - this.lastShadowUpdateMs,
      })) return;
      this.lastShadowFocusX = focusX;
      this.lastShadowFocusZ = focusZ;
      this.lastShadowUpdateMs = now;
      updateCityShadowRigSnapshot(this.sun, focusX, focusZ, this.cityShadowFrustum);
      this.cityShadowFrustumValid = true;
      this.renderer.shadowMap.needsUpdate = true;
      this.cityPerformance.staticShadowRefreshes += 1;
      return;
    }
    updateCityShadowRigSnapshot(this.sun, focusX, focusZ, this.cityShadowFrustum);
  }

  private configureShadowBudget(mapType: MapSettings["mapType"]) {
    const city = mapType === "city";
    const size = city ? 1024 : 2048;
    this.renderer.shadowMap.autoUpdate = !city;
    this.renderer.shadowMap.type = city ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
    this.lastShadowFocusX = Number.POSITIVE_INFINITY;
    this.lastShadowFocusZ = Number.POSITIVE_INFINITY;
    this.lastShadowUpdateMs = Number.NEGATIVE_INFINITY;
    this.cityShadowFrustumValid = false;
    if (!this.sun || this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  private syncCameraDepthBudget() {
    const { near, far } = chooseCameraDepthBudget({
      city: this.settings.mapType === "city",
      driveMode: this.driveMode,
      currentNear: this.camera.near,
      currentFar: this.camera.far,
    });
    if (this.camera.far === far && this.camera.near === near) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  private syncRenderResolutionBudget() {
    const maximumPixelRatio = this.settings.mapType === "city"
      ? (this.driveMode ? 1 : 1.25)
      : 1.5;
    this.adaptivePixelRatio = Math.min(
      window.devicePixelRatio,
      maximumPixelRatio,
      Math.max(0.7, this.adaptivePixelRatio),
    );
    this.renderer.setPixelRatio(this.adaptivePixelRatio);
  }

  private tuneDynamicPixelRatio(now: number) {
    if (this.settings.mapType !== "city" || now - this.lastResolutionTuneMs < 1_500) return;
    this.lastResolutionTuneMs = now;
    const summary = summarizeCityFrameTimes(this.cityFrameTimeSamples.slice(-120));
    const maximum = Math.min(window.devicePixelRatio, this.driveMode ? 1 : 1.25);
    const next = chooseDynamicPixelRatio({
      current: this.adaptivePixelRatio,
      maximum,
      samples: summary.samples,
      frameTimeP95Ms: summary.p95Ms,
      framesOver25MsRatio: summary.over25MsRatio,
    });
    if (Math.abs(next - this.adaptivePixelRatio) < 0.01) return;
    this.adaptivePixelRatio = next;
    this.renderer.setPixelRatio(next);
    this.invalidateRender(false);
  }

  private animate = () => {
    this.animationFrame = 0;
    if (this.disposed || !this.pageVisible) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const frameSampleMs = performance.now();
    const browseMoving = this.browseMove.forward
      || this.browseMove.back
      || this.browseMove.left
      || this.browseMove.right;
    if (shouldSkipIdleCityRender({
      city: this.settings.mapType === "city",
      driveMode: this.driveMode,
      pendingDrive: this.pendingDrive,
      browseMoving,
      forceRenderFrames: this.forceRenderFrames,
      elapsedSinceInteractionMs: frameSampleMs - this.lastRenderInteractionMs,
    })) {
      this.lastCityFrameSampleMs = Number.NaN;
      return;
    }
    if (this.forceRenderFrames > 0) this.forceRenderFrames -= 1;
    if (this.settings.mapType === "city") {
      if (Number.isFinite(this.lastCityFrameSampleMs)) {
        this.cityFrameTimeSamples.push(frameSampleMs - this.lastCityFrameSampleMs);
        if (this.cityFrameTimeSamples.length > 1_800) this.cityFrameTimeSamples.shift();
      }
      this.lastCityFrameSampleMs = frameSampleMs;
    } else {
      this.lastCityFrameSampleMs = Number.NaN;
      this.cityFrameTimeSamples.length = 0;
    }
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.shatterMorph.update(dt)) {
      this.chunks.setShatterVisual(this.shatterMorph.getAmount(), this.shatterMorph.isBlasting());
    }
    let focusX: number;
    let focusZ: number;
    let travelHeading: number | null = null;

    if (this.driveMode) {
      const input = this.input!.poll();
      const seed = this.settings.seed;
      const clampFn = this.settings.mapType === "city"
        ? (x: number, z: number) => clampToCity(x, z, 3)
        : (x: number, z: number) => clampToWorld(x, z, seed, FAILSAFE_INSET);
      let pose: MotoPose;
      let presentationPose: MotoPose;
      if (this.settings.mapType === "city" && this.cityDocumentBike) {
        const fixedFrame = this.cityDocumentBike.advance(dt, input, this.moto, clampFn);
        this.cityPerformance.fixedSteps = fixedFrame.fixedSteps;
        this.cityPerformance.collisionMicrosteps = fixedFrame.collisionMicrosteps;
        pose = fixedFrame.pose;
        presentationPose = fixedFrame.presentationPose;
      } else {
        const boundaryFn = this.settings.mapType === "city"
          ? (x: number, z: number) => sampleCitySurface(x, z, this.settings.roadWidth, this.settings.seed)
          : (x: number, z: number) => sampleBoundary(x, z, seed);
        pose = this.moto.update(dt, input, this.collision, clampFn, boundaryFn);
        presentationPose = pose;
        this.collision.stepStones(dt, clampFn, boundaryFn);
        this.collision.writeMatrices(this.dummy);
      }
      if (this.rider) {
        this.rider.position.set(presentationPose.x, 0.012 + presentationPose.y, presentationPose.z);
        this.rider.rotation.set(presentationPose.pitch, presentationPose.heading, -presentationPose.lean, "YXZ");
      }
      this.skids.update(pose, input.brake > 0 || input.hardBrake, pose.drifting);
      this.chase.update(dt, this.camera, presentationPose, input.boost);
      this.audio.update({
        speed: pose.speed,
        throttle: input.throttle,
        brake: input.brake,
        boost: input.boost,
        hardBrake: input.hardBrake,
        slip: pose.slip,
        drifting: pose.drifting,
      });
      focusX = pose.x;
      focusZ = pose.z;
      travelHeading = pose.speed < -0.05 ? pose.heading + Math.PI : pose.velHeading;
    } else {
      const pan = computeBrowsePanDelta(this.camera.position, this.controls.target, this.browseMove, dt, this.browsePanDelta);
      if (pan.lengthSq() > 0) {
        // Shift camera and focus together so the orbit angle/zoom is preserved.
        this.camera.position.add(pan);
        this.controls.target.add(pan);
      }
      this.controls.update();
      const boundedFocus = this.settings.mapType === "city"
        ? this.clampCityBrowseFocus(this.controls.target.x, this.controls.target.z, 28)
        : clampToWorld(this.controls.target.x, this.controls.target.z, this.settings.seed, 28);
      const correctionX = boundedFocus.x - this.controls.target.x;
      const correctionZ = boundedFocus.z - this.controls.target.z;
      if (Math.abs(correctionX) > 0.01 || Math.abs(correctionZ) > 0.01) {
        this.controls.target.x = boundedFocus.x;
        this.controls.target.z = boundedFocus.z;
        this.camera.position.x += correctionX;
        this.camera.position.z += correctionZ;
      }
      focusX = boundedFocus.x;
      focusZ = boundedFocus.z;
    }

    if (this.settings.mapType === "forest") {
      this.camera.getWorldDirection(this.streamForward);
      const stepX = Math.abs(this.streamForward.x) < 0.38 ? 0 : Math.sign(this.streamForward.x);
      const stepZ = Math.abs(this.streamForward.z) < 0.38 ? 0 : Math.sign(this.streamForward.z);
      const focusKey = `${Math.round(focusX / 24)},${Math.round(focusZ / 24)},${stepX},${stepZ}`;
      if (focusKey !== this.lastChunkFocus) {
        this.lastChunkFocus = focusKey;
        this.queueCameraFacingChunks(focusX, focusZ);
      }
      this.collision.syncChunks(this.chunks.loadedEntries());
      if (this.chunks.pump()) this.publishStats();
    }
    // Far field latches after the first complete near-field load; keep the
    // readiness gate strict so horizon cards do not appear over empty ground.
    const pending = this.chunks.getStats().pending;
    const farReady = pending === 0;
    this.farField?.update(focusX, focusZ, this.camera, farReady);
    this.syncShadowRig(focusX, focusZ);
    this.syncRiderContactShadow();
    this.sky.follow(this.camera);
    if (this.settings.mapType === "city" && this.cityDocumentRenderer) {
      const visibilityStartedAt = performance.now();
      const visibility = this.cityDocumentRenderer.updateBatchVisibility(
        this.camera,
        this.cityShadowFrustumValid ? this.cityShadowFrustum : undefined,
        this.driveMode
          ? { maximumNearDistanceMeters: CITY_RIDE_DETAILED_PLACEMENT_RADIUS_METERS }
          : undefined,
      );
      this.cityPerformance.batchVisiblePlacements = visibility.placements;
      this.cityPerformance.batchVisibleInstances = visibility.instances;
      this.cityPerformance.batchNearPlacements = visibility.nearPlacements;
      this.cityPerformance.batchFarPlacements = visibility.farPlacements;
      this.cityPerformance.batchVisibilityUpdateMs = performance.now() - visibilityStartedAt;
      this.cityBatchVisibilityDurationTotalMs += this.cityPerformance.batchVisibilityUpdateMs;
      this.cityBatchVisibilityDurationMaxMs = Math.max(
        this.cityBatchVisibilityDurationMaxMs,
        this.cityPerformance.batchVisibilityUpdateMs,
      );
      this.cityBatchVisibilityDurationSamples += 1;
    }
    this.renderSceneFrame();
    this.tuneDynamicPixelRatio(frameSampleMs);
    if (this.settings.mapType === "city") {
      const collisionStats = this.cityDocumentCollision?.getPerformanceStats();
      this.cityPerformance.candidateOwners = collisionStats?.lastCandidateOwnerCount ?? 0;
      this.cityPerformance.maxCandidateOwners = collisionStats?.maxCandidateOwnerCount ?? 0;
      this.cityPerformance.bucketEntryVisits = collisionStats?.lastBucketEntryVisitCount ?? 0;
      this.cityPerformance.maxBucketEntryVisits = collisionStats?.maxBucketEntryVisitCount ?? 0;
      const now = performance.now();
      if (now - this.lastCityStatsPublishMs >= 500) {
        this.lastCityStatsPublishMs = now;
        if (this.cityBatchVisibilityDurationSamples > 0) {
          this.cityPerformance.batchVisibilityUpdateAverageMs = this.cityBatchVisibilityDurationTotalMs
            / this.cityBatchVisibilityDurationSamples;
          this.cityPerformance.batchVisibilityUpdateMaxMs = this.cityBatchVisibilityDurationMaxMs;
          this.cityBatchVisibilityDurationTotalMs = 0;
          this.cityBatchVisibilityDurationMaxMs = 0;
          this.cityBatchVisibilityDurationSamples = 0;
        }
        const frameTimes = summarizeCityFrameTimes(this.cityFrameTimeSamples);
        this.cityPerformance.frameSamples = frameTimes.samples;
        this.cityPerformance.frameTimeP50Ms = frameTimes.p50Ms;
        this.cityPerformance.frameTimeP95Ms = frameTimes.p95Ms;
        this.cityPerformance.framesOver25MsRatio = frameTimes.over25MsRatio;
        this.updateCityRenderPerformanceSummaries();
        this.cityStats.drawCalls = this.cityPerformance.renderCalls;
        this.publishStats();
      }
    }

    if (this.minimap) {
      const stats = this.chunks.getStats();
      this.minimap.draw({
        road: this.roadPoints.map((p) => ({ x: p.x, z: p.z })),
        stops: this.stopPoints,
        focusX,
        focusZ,
        cameraX: this.camera.position.x,
        cameraZ: this.camera.position.z,
        travelHeading,
        loadedKeys: this.settings.mapType === "forest" ? stats.loadedKeys : [],
      });
    }
  };

  private disposeWorld() {
    this.cityPlacementPreview.set(null);
    this.cityEditorGrid?.dispose();
    this.cityEditorGrid = null;
    // The document renderer owns private mounted layers and must detach them
    // before the legacy deep-dispose traversal touches the public static layer.
    this.cityDocumentRenderer?.dispose();
    this.cityDocumentRenderer = null;
    this.cityCollisionBuildAbort?.abort();
    this.cityCollisionBuildAbort = null;
    this.cityCollisionGeneration += 1;
    this.cityCollisionReady = false;
    this.cityDocumentBike?.reset();
    this.cityDocumentBike = null;
    this.cityDocumentCollision?.dispose();
    this.cityDocumentCollision = null;
    this.chunks.clear();
    this.collision.clear();
    this.cityStats = { buildings: 0, streetTrees: 0, streetLights: 0, trafficLights: 0, drawCalls: 0 };
    this.roadDistanceFn = null;
    if (this.farField) {
      this.staticLayer.remove(this.farField.group);
      this.farField.dispose();
      this.farField = null;
    }
    if (this.shared) {
      disposeSharedForestAssets(this.shared);
      this.shared = null;
    }
    const rider = this.rider;
    if (rider?.parent) rider.parent.remove(rider);
    while (this.staticLayer.children.length) {
      const child = this.staticLayer.children.pop()!;
      disposeSceneResources(child);
      child.clear();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("keydown", this.onBrowseKeyDown);
    window.removeEventListener("keyup", this.onBrowseKeyUp);
    window.removeEventListener("blur", this.onBrowseBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.controls.removeEventListener("change", this.onControlsChange);
    this.input?.detach();
    this.pendingDrive = false;
    this.driveExitIntentListener = null;
    this.driveModeListener = null;
    this.cityEditorCameraModeListener = null;
    this.chase.detach();
    this.audio.dispose();
    this.skids.dispose();
    this.minimap?.dispose();
    this.minimap = null;
    this.controls.dispose();
    this.disposeWorld();
    if (this.rider) {
      disposeRiderResources(this.rider);
      this.rider = null;
    }
    this.riderContactShadow.dispose();
    this.modelPackLease?.release();
    this.modelPackLease = null;
    this.modelPack = null;
    this.cityCollisionPipeline.dispose();
    this.cityPlacementPreview.dispose();
    this.clearPendingGpuTimerQueries();
    this.scene.remove(this.cityRenderPassProbe.mesh);
    this.cityRenderPassProbe.geometry.dispose();
    this.cityRenderPassProbe.material.dispose();
    void this.cityTemplateCache.retire()
      .then(() => this.cityCatalogSources.retire())
      .then(() => retireResourceCacheGeneration());
    if (this.ownsModelPackOwner) void this.modelPackOwner.retire();
    this.scene.remove(this.sky.mesh);
    this.sky.dispose();
    this.renderer.dispose();
  }
}
