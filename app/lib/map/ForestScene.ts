import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapSettings, Season } from "./types";
import { createRandom, range } from "./random";

type SceneStats = { trees: number; deliveryStops: number; drawCalls: number };
type StatsListener = (stats: SceneStats) => void;

const SEASONS: Record<Season, { ground: number; leaves: number[]; tip: number; fog: number }> = {
  spring: { ground: 0xa8b99a, leaves: [0x406a27, 0x5f8730, 0x7da344, 0x91b85a], tip: 0xb3cf70, fog: 0xe7ece2 },
  summer: { ground: 0x8fa77d, leaves: [0x244d26, 0x32672e, 0x4f7d35, 0x739447], tip: 0x95ad59, fog: 0xdde7da },
  autumn: { ground: 0xa69b78, leaves: [0x7a3f20, 0xa85d27, 0xc48332, 0xdfa64b], tip: 0xedc56d, fog: 0xeee3d2 },
};

function createCanvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createBarkTexture() {
  const texture = createCanvasTexture((ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, "#4c3e31");
    gradient.addColorStop(0.48, "#806d54");
    gradient.addColorStop(1, "#40352a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 90; i += 1) {
      const x = (i / 90) * size;
      ctx.strokeStyle = `rgba(35,27,20,${0.16 + (i % 5) * 0.045})`;
      ctx.lineWidth = 0.8 + (i % 4) * 0.45;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= size; y += 16) ctx.lineTo(x + Math.sin(y * 0.06 + i) * 3.5, y);
      ctx.stroke();
    }
  });
  texture.repeat.set(2, 5);
  return texture;
}

function createGroundTexture() {
  const texture = createCanvasTexture((ctx, size) => {
    ctx.fillStyle = "#a8b394";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1800; i += 1) {
      const tone = 105 + (i % 6) * 8;
      ctx.fillStyle = `rgba(${tone - 25},${tone},${tone - 34},${0.06 + (i % 5) * 0.02})`;
      ctx.fillRect((i * 47) % size, (i * 83) % size, 1 + (i % 3), 1 + ((i * 3) % 4));
    }
  });
  texture.repeat.set(28, 28);
  return texture;
}

function makeRibbon(points: THREE.Vector3[], width: number, y: number) {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(width * 0.5);
    vertices.push(points[i].x + side.x, y, points[i].z + side.z);
    vertices.push(points[i].x - side.x, y, points[i].z - side.z);
    const v = i / Math.max(points.length - 1, 1);
    uvs.push(0, v * 14, 1, v * 14);
    if (i < points.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function distanceToRoad(point: THREE.Vector3, road: THREE.Vector3[]) {
  let minimum = Infinity;
  for (let i = 0; i < road.length; i += 4) minimum = Math.min(minimum, point.distanceTo(road[i]));
  return minimum;
}

export class ForestScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  private controls: OrbitControls;
  private world = new THREE.Group();
  private clock = new THREE.Clock();
  private animationFrame = 0;
  private windMeshes: THREE.InstancedMesh[] = [];
  private rider: THREE.Group | null = null;
  private riderVisible = true;
  private settings: MapSettings;
  private onStats: StatsListener;

  constructor(canvas: HTMLCanvasElement, settings: MapSettings, onStats: StatsListener) {
    this.settings = settings;
    this.onStats = onStats;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 9;
    this.controls.maxDistance = 88;
    this.controls.target.set(0, 0, -3);
    this.resetCamera();
    this.setupLights();
    this.scene.add(this.world);
    this.build(settings);
    this.loadRider();
    this.resize();
    this.animate();
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xf7fff1, 0x526148, 2.35));
    const sun = new THREE.DirectionalLight(0xfff4d4, 3.5);
    sun.position.set(-18, 32, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -46;
    sun.shadow.camera.right = 46;
    sun.shadow.camera.top = 46;
    sun.shadow.camera.bottom = -46;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xbad7ad, 1.1);
    rim.position.set(22, 13, -26);
    this.scene.add(rim);
  }

  private createRoad(random: () => number, curves: number) {
    const controlPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i += 1) {
      const z = -44 + i * 13;
      const wave = Math.sin(i * 1.34 + 0.6) * 12 * curves;
      controlPoints.push(new THREE.Vector3(wave + range(random, -4, 4) * curves, 0, z));
    }
    const curve = new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.45);
    return curve.getPoints(190);
  }

  build(settings: MapSettings) {
    this.settings = settings;
    this.disposeWorld();
    const random = createRandom(settings.seed);
    const palette = SEASONS[settings.season];
    this.scene.background = new THREE.Color(palette.fog);
    this.scene.fog = new THREE.FogExp2(palette.fog, settings.fogDensity);

    const terrain = new THREE.Mesh(
      new THREE.CircleGeometry(67, 96),
      new THREE.MeshStandardMaterial({ color: palette.ground, map: createGroundTexture(), roughness: 1 }),
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.04;
    terrain.receiveShadow = true;
    this.world.add(terrain);

    const roadPoints = this.createRoad(random, settings.roadCurves);
    const roadTexture = createCanvasTexture((ctx, size) => {
      ctx.fillStyle = "#c7b48e";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 480; i += 1) {
        ctx.fillStyle = i % 3 ? "rgba(86,67,43,.10)" : "rgba(255,244,206,.13)";
        const x = (i * 31) % size;
        const y = (i * 73) % size;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + (i % 4) * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    roadTexture.repeat.set(1, 18);
    const road = new THREE.Mesh(
      makeRibbon(roadPoints, settings.roadWidth, 0.035),
      new THREE.MeshStandardMaterial({ color: 0xd6c49d, map: roadTexture, roughness: 1 }),
    );
    road.receiveShadow = true;
    this.world.add(road);

    const maxTrees = 720;
    const treePositions: Array<{ p: THREE.Vector3; scale: number; color: number }> = [];
    for (let attempt = 0; attempt < maxTrees * 3 && treePositions.length < maxTrees * settings.forestDensity; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 63;
      const point = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      if (distanceToRoad(point, roadPoints) < settings.roadWidth * 1.55 + range(random, 0.7, 2.9)) continue;
      treePositions.push({
        p: point,
        scale: range(random, 0.72, 1.48),
        color: palette.leaves[Math.floor(random() * palette.leaves.length)],
      });
    }
    this.addForest(treePositions, random, palette.tip);
    this.addStops(roadPoints, settings.deliveryStops, random);

    if (this.rider) {
      this.world.add(this.rider);
      const start = roadPoints[Math.floor(roadPoints.length * 0.46)];
      const next = roadPoints[Math.floor(roadPoints.length * 0.48)];
      this.rider.position.set(start.x, 0.08, start.z);
      this.rider.rotation.y = Math.atan2(next.x - start.x, next.z - start.z);
      this.rider.visible = this.riderVisible;
    }
    this.onStats({ trees: treePositions.length, deliveryStops: settings.deliveryStops, drawCalls: 8 });
  }

  private addForest(trees: Array<{ p: THREE.Vector3; scale: number; color: number }>, random: () => number, tipColor: number) {
    const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.42, 5.5, 7, 3);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x78664e, map: createBarkTexture(), roughness: 0.98 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
    trunks.castShadow = true;
    trunks.receiveShadow = true;

    const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
    const crownMaterial = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 9, specular: 0x8dab65 });
    const clustersPerTree = 7;
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, trees.length * clustersPerTree);
    crowns.castShadow = false;
    crowns.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let crownIndex = 0;

    trees.forEach((tree, index) => {
      dummy.position.set(tree.p.x, 2.72 * tree.scale, tree.p.z);
      dummy.rotation.y = random() * Math.PI;
      dummy.scale.set(tree.scale, tree.scale, tree.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);

      for (let cluster = 0; cluster < clustersPerTree; cluster += 1) {
        const a = (cluster / clustersPerTree) * Math.PI * 2 + random() * 0.7;
        const ring = cluster < 5 ? range(random, 0.35, 1.25) : range(random, 0.05, 0.55);
        dummy.position.set(
          tree.p.x + Math.cos(a) * ring * tree.scale,
          (5.2 + (cluster >= 5 ? 1.35 : range(random, -0.3, 0.75))) * tree.scale,
          tree.p.z + Math.sin(a) * ring * tree.scale,
        );
        dummy.rotation.set(random(), random() * Math.PI, random() * 0.35);
        const sx = range(random, 1.25, 1.75) * tree.scale;
        const sy = range(random, 1.0, 1.55) * tree.scale;
        dummy.scale.set(sx, sy, sx * range(random, 0.84, 1.12));
        dummy.updateMatrix();
        crowns.setMatrixAt(crownIndex, dummy.matrix);
        color.set(cluster === 6 && random() > 0.45 ? tipColor : tree.color);
        color.offsetHSL(range(random, -0.018, 0.018), range(random, -0.04, 0.04), range(random, -0.06, 0.06));
        crowns.setColorAt(crownIndex, color);
        crownIndex += 1;
      }
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    crowns.instanceColor!.needsUpdate = true;
    this.windMeshes = [crowns];
    this.world.add(trunks, crowns);

    const stones = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.34, 0),
      new THREE.MeshStandardMaterial({ color: 0x879083, roughness: 1 }),
      Math.floor(trees.length * 0.22),
    );
    for (let i = 0; i < stones.count; i += 1) {
      const source = trees[(i * 7) % trees.length];
      dummy.position.set(source.p.x + range(random, -2, 2), 0.18, source.p.z + range(random, -2, 2));
      dummy.rotation.set(random(), random(), random());
      dummy.scale.setScalar(range(random, 0.55, 1.35));
      dummy.updateMatrix();
      stones.setMatrixAt(i, dummy.matrix);
    }
    stones.castShadow = true;
    stones.receiveShadow = true;
    this.world.add(stones);
  }

  private addStops(road: THREE.Vector3[], count: number, random: () => number) {
    const group = new THREE.Group();
    for (let i = 0; i < count; i += 1) {
      const index = Math.floor(((i + 1) / (count + 1)) * (road.length - 1));
      const p = road[index];
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.08, 1.6, 7),
        new THREE.MeshStandardMaterial({ color: 0x5c4935, roughness: 1 }),
      );
      post.position.set(p.x + (i % 2 ? 2.2 : -2.2), 0.8, p.z);
      post.castShadow = true;
      const lantern = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.48, 0.48),
        new THREE.MeshStandardMaterial({ color: 0xf2ba54, emissive: 0xf1a933, emissiveIntensity: 1.6, roughness: 0.7 }),
      );
      lantern.position.copy(post.position).add(new THREE.Vector3(0, 0.78, 0));
      lantern.rotation.y = range(random, -0.2, 0.2);
      lantern.castShadow = true;
      group.add(post, lantern);
    }
    this.world.add(group);
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
      const scale = 2.2 / Math.max(size.y, size.x, size.z, 0.001);
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

  resetCamera() {
    this.camera.position.set(33, 34, 43);
    this.controls.target.set(0, 0, -5);
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

  private animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
    const elapsed = this.clock.getElapsedTime();
    this.windMeshes.forEach((mesh, index) => {
      mesh.rotation.z = Math.sin(elapsed * 0.42 + index) * 0.0022;
      mesh.rotation.x = Math.sin(elapsed * 0.31 + index * 0.7) * 0.0015;
    });
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private disposeWorld() {
    const rider = this.rider;
    if (rider?.parent) rider.parent.remove(rider);
    while (this.world.children.length) {
      const child = this.world.children.pop()!;
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
    this.windMeshes = [];
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.controls.dispose();
    this.disposeWorld();
    this.renderer.dispose();
  }
}
