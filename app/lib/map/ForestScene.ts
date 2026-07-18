import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapSettings, Season } from "./types";
import { createRandom, range } from "./random";
import { createRoadTexture } from "./textures";
import { ChunkManager } from "./ChunkManager";
import { Minimap } from "./Minimap";
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
  isInsideWorld,
  makeRibbon,
  northBoundaryZ,
  southBoundaryZ,
  westBoundaryX,
} from "./world";
import { createWorldBoundaries } from "./boundaries";

export type SceneStats = {
  trees: number;
  grass: number;
  stones: number;
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
  private stopPoints: Array<{ x: number; z: number }> = [];
  private minimap: Minimap | null = null;
  private lastChunkFocus = "";
  private deliveryStopCount = 0;

  constructor(canvas: HTMLCanvasElement, settings: MapSettings, onStats: StatsListener) {
    this.settings = settings;
    this.onStats = onStats;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 420;
    this.controls.target.set(0, 0, -8);
    this.resetCamera();
    this.setupLights();
    this.world.add(this.staticLayer, this.chunkLayer);
    this.scene.add(this.world);
    this.build(settings);
    this.loadRider();
    this.resize();
    this.animate();
  }

  attachMinimap(canvas: HTMLCanvasElement) {
    this.minimap?.dispose();
    this.minimap = new Minimap(canvas);
    this.minimap.setWorld(
      this.roadPoints.map((p) => ({ x: p.x, z: p.z })),
      this.stopPoints,
      this.settings.seed,
    );
    this.minimap.setJumpHandler((x, z) => this.jumpTo(x, z));
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
    this.sun = sun;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xa8cda2, 0.78);
    rim.position.set(30, 16, -34);
    this.scene.add(rim);
  }

  build(settings: MapSettings) {
    this.settings = settings;
    this.disposeWorld();
    const random = createRandom(settings.seed);
    const palette = SEASONS[settings.season];
    this.scene.background = new THREE.Color(palette.fog);
    // Larger world needs thinner fog so distant canopy still reads.
    this.scene.fog = new THREE.FogExp2(palette.fog, Math.min(settings.fogDensity, 0.0035));

    this.staticLayer.add(createWorldBoundaries(settings.seed));

    this.roadPoints = createWorldRoad(settings.seed, settings.roadCurves);
    const roadIndex = buildRoadIndex(this.roadPoints);
    const road = new THREE.Mesh(
      makeRibbon(this.roadPoints, settings.roadWidth, 0.035),
      new THREE.MeshStandardMaterial({ color: 0xd6c49d, map: createRoadTexture(), roughness: 1 }),
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
    );

    this.chunks.configure({
      assets: this.shared,
      worldSeed: settings.seed,
      forestDensity: settings.forestDensity,
      treeHeightScale: settings.treeHeightScale,
      roadWidth: settings.roadWidth,
      roadDistance: (point) => roadIndex.minDistance(point, settings.roadWidth),
      insideWorld: (x, z, inset = 0) => isInsideWorld(x, z, settings.seed, inset),
    });

    // Seed the neighborhood around the rider / route middle before first frame.
    const start = this.roadPoints[Math.floor(this.roadPoints.length * 0.46)];
    this.controls.target.set(start.x, 0, start.z);
    this.camera.position.set(start.x + 48, 36, start.z + 62);
    this.controls.update();
    this.chunks.update(start.x, start.z);
    // Warm the nearest chunk immediately so the first frame isn't empty.
    this.chunks.pump();
    this.lastChunkFocus = "";
    this.publishStats();

    if (this.rider) {
      this.staticLayer.add(this.rider);
      const next = this.roadPoints[Math.floor(this.roadPoints.length * 0.48)];
      this.rider.position.set(start.x, 0.08, start.z);
      this.rider.rotation.y = Math.atan2(next.x - start.x, next.z - start.z);
      this.rider.visible = this.riderVisible;
    }

    this.minimap?.setWorld(
      this.roadPoints.map((p) => ({ x: p.x, z: p.z })),
      this.stopPoints,
      settings.seed,
    );
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
    }
    this.staticLayer.add(group);
    return points;
  }

  private loadRider() {
    const loader = new GLTFLoader();
    loader.load("/models/rabbit-rider.glb", (gltf) => {
      const model = gltf.scene;
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
      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      model.position.y += box.getSize(new THREE.Vector3()).y * 0.5;
      const rider = new THREE.Group();
      rider.add(model);
      this.rider = rider;
      this.build(this.settings);
    });
  }

  toggleRider(visible: boolean) {
    this.riderVisible = visible;
    if (this.rider) this.rider.visible = visible;
  }

  jumpTo(x: number, z: number) {
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
    this.chunks.update(clamped.x, clamped.z);
    this.chunks.pump();
    this.publishStats();
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
  }

  setUnderstoryCamera() {
    const focus = this.controls.target.clone();
    this.controls.target.set(focus.x, 2.8, focus.z);
    this.camera.position.set(focus.x + 12, 4.6, focus.z + 18);
    this.controls.update();
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
    const stats = this.chunks.getStats();
    this.onStats({
      trees: stats.trees,
      grass: stats.grass,
      stones: stats.stones,
      deliveryStops: this.deliveryStopCount,
      drawCalls: stats.drawCalls + 8,
      chunks: stats.chunks,
    });
  }

  getTextState() {
    const stats = this.chunks.getStats();
    return {
      mode: "map-editor",
      coordinateSystem: "world origin at map center; +x east/right, +z south/down",
      cameraFocus: {
        x: Number(this.controls.target.x.toFixed(1)),
        z: Number(this.controls.target.z.toFixed(1)),
      },
      streamedForest: {
        focusChunk: stats.focus,
        loadedChunks: stats.loadedKeys,
        pendingChunks: stats.pending,
        trees: stats.trees,
        grassTufts: stats.grass,
        stones: stats.stones,
      },
      settings: {
        seed: this.settings.seed,
        forestDensity: this.settings.forestDensity,
        treeHeightScale: this.settings.treeHeightScale,
        season: this.settings.season,
      },
    };
  }

  advanceForTest(ms: number) {
    const frames = Math.max(1, Math.ceil(ms / (1000 / 60)));
    let changed = false;
    for (let i = 0; i < frames; i += 1) changed = this.chunks.pump() || changed;
    if (changed) this.publishStats();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private syncShadowRig() {
    if (!this.sun) return;
    const t = this.controls.target;
    this.sun.position.set(t.x - 28, 48, t.z + 22);
    this.sun.target.position.copy(t);
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
    this.controls.update();
    const boundedFocus = clampToWorld(this.controls.target.x, this.controls.target.z, this.settings.seed, 28);
    const correctionX = boundedFocus.x - this.controls.target.x;
    const correctionZ = boundedFocus.z - this.controls.target.z;
    if (Math.abs(correctionX) > 0.01 || Math.abs(correctionZ) > 0.01) {
      this.controls.target.x = boundedFocus.x;
      this.controls.target.z = boundedFocus.z;
      this.camera.position.x += correctionX;
      this.camera.position.z += correctionZ;
    }
    const focusX = boundedFocus.x;
    const focusZ = boundedFocus.z;
    const focusKey = `${Math.round(focusX / 24)},${Math.round(focusZ / 24)}`;
    if (focusKey !== this.lastChunkFocus) {
      this.lastChunkFocus = focusKey;
      this.chunks.update(focusX, focusZ);
    }
    if (this.chunks.pump()) this.publishStats();
    this.syncShadowRig();
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
        loadedKeys: stats.loadedKeys,
      });
    }
  };

  private disposeWorld() {
    this.chunks.clear();
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
          const withMap = material as THREE.Material & { map?: THREE.Texture };
          withMap.map?.dispose();
          material.dispose();
        });
      });
    }
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.minimap?.dispose();
    this.minimap = null;
    this.controls.dispose();
    this.disposeWorld();
    this.renderer.dispose();
  }
}
