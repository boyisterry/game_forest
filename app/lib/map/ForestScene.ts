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
import { createCityTemplateCache, type CityTemplateCache } from "./cityTemplateCache.ts";
import { createCityDocumentRenderer, type CityDocumentRenderer } from "./cityDocumentRenderer.ts";
import { projectCityPointerToGround, setCityCameraTopDown, type CityViewportPoint } from "./cityEditorViewport.ts";
import { findNearestUnoccupiedCityPoint } from "./cityEditorOccupancy.ts";
import { getCatalogEntry } from "./cityCatalog.ts";
import { CityMotorcycleAdapter } from "./cityMotorcycleAdapter.ts";
import { CityMotorcycleFixedStepBridge } from "./cityMotorcycleFixedStep.ts";
import { CompiledCityCollisionRuntime } from "./cityCompiledCollisionRuntime.ts";
import { CityDocumentCollisionPipeline } from "./cityDocumentCollisionPipeline.ts";
import { disposeRiderResources } from "./riderResources.ts";

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
  private cityStats = { buildings: 0, streetTrees: 0, streetLights: 0, trafficLights: 0, drawCalls: 0 };
  private cityDocument: CityMapDocumentSnapshot | null = null;
  private readonly cityCatalogSources: CatalogSourceRegistry = createCatalogSourceRegistry();
  private readonly cityVisualLayers: CityVisualLayerManager = createCityVisualLayerManager();
  private readonly cityTemplateCache: CityTemplateCache = createCityTemplateCache({
    sources: this.cityCatalogSources,
    layers: this.cityVisualLayers,
  });
  private cityDocumentRenderer: CityDocumentRenderer | null = null;
  private readonly cityEditRaycaster = new THREE.Raycaster();
  private cityEditorTopDown = false;
  private readonly cityCollisionPipeline = new CityDocumentCollisionPipeline(this.cityTemplateCache);
  private cityDocumentCollision: CompiledCityCollisionRuntime | null = null;
  private cityDocumentBike: CityMotorcycleFixedStepBridge | null = null;
  private cityCollisionGeneration = 0;
  private cityCollisionBuildAbort: AbortController | null = null;
  private cityCollisionReady = false;

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.sky = new ProceduralSky(settings.season);
    this.scene.add(this.sky.mesh);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 420;
    this.controls.target.set(0, 0, -8);
    this.resetCamera();
    this.setupLights();
    this.world.add(this.staticLayer, this.chunkLayer, this.skids.group);
    this.scene.add(this.world);
    this.loadRider();
    this.input = new InputController(() => this.setDriveMode(false));
    // Arrow keys pan the workshop camera around the map (browse mode only).
    window.addEventListener("keydown", this.onBrowseKeyDown);
    window.addEventListener("keyup", this.onBrowseKeyUp);
    window.addEventListener("blur", this.onBrowseBlur);
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
    if (this.driveMode) this.setDriveMode(false);
    this.settings = settings;
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
    environment.add(water, ground);
    this.staticLayer.add(environment);

    this.cityDocumentRenderer = createCityDocumentRenderer({
      cache: this.cityTemplateCache,
      layers: this.cityVisualLayers,
      parentOwnedLayer: this.staticLayer,
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
  ) {
    const minimapWorld = deriveCityMinimapWorld(document.graph, this.settings.deliveryStops);
    this.cityMinimapRoadLines = [...minimapWorld.roadLines];
    this.roadPoints = minimapWorld.roadLines.flatMap((line) => line.map(
      (point) => new THREE.Vector3(point.x, 0, point.z),
    ));
    this.stopPoints = minimapWorld.stops.map((stop) => ({ x: stop.x, z: stop.z }));
    this.deliveryStopCount = this.stopPoints.length;
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
  }

  private rebuildCityDocumentCollision(document: CityMapDocumentSnapshot) {
    this.cityCollisionGeneration += 1;
    const generation = this.cityCollisionGeneration;
    this.cityCollisionBuildAbort?.abort();
    const abort = new AbortController();
    this.cityCollisionBuildAbort = abort;
    this.cityCollisionReady = false;
    if (this.driveMode) this.setDriveMode(false);
    this.cityDocumentBike?.reset();
    void this.cityCollisionPipeline.build(document, generation, abort.signal).then((report) => {
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
      this.recoverCityRiderPose(document);
      this.publishStats();
    }).catch((error) => {
      if (abort.signal.aborted || generation !== this.cityCollisionGeneration || this.disposed) return;
      this.cityCollisionReady = false;
      console.error("Failed to compile city document collision", error);
    });
  }

  isCityDocumentCollisionReady() {
    return this.settings.mapType !== "city" || this.cityCollisionReady;
  }

  /** Apply an immutable city revision without transferring document ownership. */
  applyCityDocument(document: CityMapDocumentSnapshot, dirty?: LayerMask) {
    const previous = this.cityDocument;
    this.cityDocument = document;
    if (this.settings.mapType !== "city") return;
    if (!this.cityDocumentRenderer) {
      this.build(this.settings);
      return;
    }
    const report = this.cityDocumentRenderer.applyCityDocument(document, dirty);
    this.syncCityDocumentState(document, report);
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
    this.syncMinimapWorld();
  }

  getCityDocument(): CityMapDocumentSnapshot | null {
    return this.cityDocument;
  }

  /** Reserve primary drag for the road brush while retaining wheel/right-pan. */
  setCityRoadEditingEnabled(enabled: boolean) {
    this.controls.mouseButtons.LEFT = enabled ? null : THREE.MOUSE.ROTATE;
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
    return this.cityDocumentRenderer.raycast(this.cityEditRaycaster)[0]?.placementId ?? null;
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
          child.castShadow = true;
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
      if (this.pendingDrive) {
        this.pendingDrive = false;
        this.setDriveMode(true);
      }
    });
  }

  isRiderReady() {
    return Boolean(this.rider);
  }

  toggleRider(visible: boolean) {
    this.riderVisible = visible;
    if (this.rider) this.rider.visible = visible;
    if (!visible && this.driveMode) this.setDriveMode(false);
  }

  setDriveMode(on: boolean) {
    if (on && this.settings.mapType === "city" && this.cityDocument && !this.cityCollisionReady) {
      this.pendingDrive = false;
      return;
    }
    if (on === this.driveMode) {
      if (!on) this.pendingDrive = false;
      return;
    }
    if (on && !this.rider) {
      // Enter play as soon as the GLB finishes loading.
      this.pendingDrive = true;
      return;
    }
    if (on && this.settings.mapType === "city" && this.cityDocument) {
      this.recoverCityRiderPose(this.cityDocument);
    }
    this.pendingDrive = false;
    this.driveMode = on;
    if (on) {
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
    } else {
      this.cityDocumentBike?.reset();
      this.input?.detach();
      this.chase.detach();
      this.audio.stop();
      this.controls.enabled = true;
      if (this.rider) {
        this.controls.target.set(this.rider.position.x, 0, this.rider.position.z);
        this.controls.update();
      }
    }
    this.driveModeListener?.(on);
  }

  setDriveModeListener(listener: (on: boolean) => void) {
    this.driveModeListener = listener;
  }

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
    if (this.setBrowseKey(event.code, true)) event.preventDefault();
  };

  private onBrowseKeyUp = (event: KeyboardEvent) => {
    this.setBrowseKey(event.code, false);
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
  }

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
    this.renderer.render(this.scene, this.camera);
  }

  private syncShadowRig(focusX: number, focusZ: number) {
    if (!this.sun) return;
    this.sun.position.set(focusX - 28, 48, focusZ + 22);
    this.sun.target.position.set(focusX, 0, focusZ);
    this.sun.target.updateMatrixWorld();
    const shadow = this.sun.shadow.camera;
    shadow.left = -70;
    shadow.right = 70;
    shadow.top = 70;
    shadow.bottom = -70;
    shadow.updateProjectionMatrix();
  }

  private animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
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
        ? clampToCity(this.controls.target.x, this.controls.target.z, 28)
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
    this.sky.follow(this.camera);
    this.renderer.render(this.scene, this.camera);

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
      child.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          const withMap = material as THREE.Material & {
            map?: THREE.Texture;
            normalMap?: THREE.Texture;
            roughnessMap?: THREE.Texture;
          };
          withMap.map?.dispose();
          withMap.normalMap?.dispose();
          withMap.roughnessMap?.dispose();
          material.dispose();
        });
      });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("keydown", this.onBrowseKeyDown);
    window.removeEventListener("keyup", this.onBrowseKeyUp);
    window.removeEventListener("blur", this.onBrowseBlur);
    this.input?.detach();
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
    this.modelPackLease?.release();
    this.modelPackLease = null;
    this.modelPack = null;
    this.cityCollisionPipeline.dispose();
    void this.cityTemplateCache.retire().then(() => this.cityCatalogSources.retire());
    if (this.ownsModelPackOwner) void this.modelPackOwner.retire();
    this.scene.remove(this.sky.mesh);
    this.sky.dispose();
    this.renderer.dispose();
  }
}
