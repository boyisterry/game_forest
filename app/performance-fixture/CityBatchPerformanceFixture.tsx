"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { disposeSceneResources } from "../lib/map/cityResourceCache";
import {
  inspectCityRenderCapabilities,
  type CityBatchBackend,
} from "../lib/map/cityPerformanceProbe.ts";

type SpikeResult = Readonly<{
  state: "running" | "passed" | "failed";
  webglVersion: 1 | 2;
  renderer: string;
  multiDraw: boolean;
  recommendedBackend: CityBatchBackend;
  colorCalls: number;
  shadowCalls: number;
  triangles: number;
  initialInstances: number;
  expandedCapacity: number;
  liveInstances: number;
  capacityExpansionPassed: boolean;
  geometryResizePassed: boolean;
  lodSwitchPassed: boolean;
  tintPassed: boolean;
  visibilityPassed: boolean;
  raycastPassed: boolean;
  drawCallCompressionPassed: boolean;
  message: string;
}>;

const INITIAL_RESULT: SpikeResult = Object.freeze({
  state: "running",
  webglVersion: 1,
  renderer: "pending",
  multiDraw: false,
  recommendedBackend: "instanced-mesh",
  colorCalls: 0,
  shadowCalls: 0,
  triangles: 0,
  initialInstances: 64,
  expandedCapacity: 128,
  liveInstances: 0,
  capacityExpansionPassed: false,
  geometryResizePassed: false,
  lodSwitchPassed: false,
  tintPassed: false,
  visibilityPassed: false,
  raycastPassed: false,
  drawCallCompressionPassed: false,
  message: "Running BatchedMesh capability checks…",
});

function geometryCapacity(geometries: readonly THREE.BufferGeometry[]) {
  return geometries.reduce((capacity, geometry) => ({
    vertices: capacity.vertices + geometry.getAttribute("position").count,
    indices: capacity.indices + (geometry.getIndex()?.count ?? 0),
  }), { vertices: 0, indices: 0 });
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  for (const item of Array.isArray(material) ? material : [material]) item.dispose();
}

export function CityBatchPerformanceFixture() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<SpikeResult>(INITIAL_RESULT);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let batch: THREE.BatchedMesh | null = null;
    let ground: THREE.Mesh | null = null;
    const sourceGeometries: THREE.BufferGeometry[] = [];
    const ownedMaterials: THREE.Material[] = [];

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
      renderer.setSize(640, 360, false);
      renderer.setPixelRatio(1);
      renderer.info.autoReset = false;
      const capabilities = inspectCityRenderCapabilities(renderer);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1d2830);
      const camera = new THREE.PerspectiveCamera(48, 640 / 360, 0.1, 100);
      camera.position.set(0, 9, 22);
      camera.lookAt(0, 1, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(-8, 15, 9);
      sun.castShadow = true;
      sun.shadow.mapSize.set(256, 256);
      sun.shadow.camera.left = -18;
      sun.shadow.camera.right = 18;
      sun.shadow.camera.top = 18;
      sun.shadow.camera.bottom = -18;
      scene.add(sun);

      const box = new THREE.BoxGeometry(1.4, 1.4, 1.4);
      const sphere = new THREE.SphereGeometry(0.82, 12, 8);
      const cone = new THREE.ConeGeometry(0.82, 1.8, 12);
      sourceGeometries.push(box, sphere, cone);
      const initialCapacity = geometryCapacity([box, sphere]);
      const fullCapacity = geometryCapacity(sourceGeometries);
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
      ownedMaterials.push(material);
      batch = new THREE.BatchedMesh(64, initialCapacity.vertices, initialCapacity.indices, material);
      batch.name = "city-batch-performance-spike";
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.perObjectFrustumCulled = false;
      batch.sortObjects = false;
      const boxId = batch.addGeometry(box);
      const sphereId = batch.addGeometry(sphere);

      const matrix = new THREE.Matrix4();
      const color = new THREE.Color();
      const instanceIds: number[] = [];
      for (let index = 0; index < 64; index += 1) {
        const geometryId = index % 2 === 0 ? boxId : sphereId;
        const instanceId = batch.addInstance(geometryId);
        const column = index % 8;
        const row = Math.floor(index / 8);
        matrix.makeTranslation((column - 3.5) * 1.7, 1, (row - 3.5) * 1.7);
        batch.setMatrixAt(instanceId, matrix);
        color.setHSL(index / 64, 0.58, 0.55);
        batch.setColorAt(instanceId, color);
        instanceIds.push(instanceId);
      }
      scene.add(batch);

      const tintProbe = new THREE.Color();
      batch.getColorAt(instanceIds[7], tintProbe);
      color.setHSL(7 / 64, 0.58, 0.55);
      const tintPassed = Math.abs(tintProbe.r - color.r) < 1e-5
        && Math.abs(tintProbe.g - color.g) < 1e-5
        && Math.abs(tintProbe.b - color.b) < 1e-5;
      batch.setGeometryIdAt(instanceIds[0], sphereId);
      const lodSwitchPassed = batch.getGeometryIdAt(instanceIds[0]) === sphereId;
      batch.setVisibleAt(instanceIds[63], false);
      const visibilityPassed = batch.getVisibleAt(instanceIds[63]) === false;

      batch.setInstanceCount(128);
      const capacityExpansionPassed = batch.maxInstanceCount === 128;
      batch.setGeometrySize(fullCapacity.vertices, fullCapacity.indices);
      const coneId = batch.addGeometry(cone);
      const geometryResizePassed = batch.getGeometryRangeAt(coneId, {
        vertexStart: 0,
        vertexCount: 0,
        reservedVertexCount: 0,
        indexStart: 0,
        indexCount: 0,
        reservedIndexCount: 0,
        start: 0,
        count: 0,
      }).vertexCount === cone.getAttribute("position").count;
      for (let index = 64; index < 96; index += 1) {
        const instanceId = batch.addInstance(coneId);
        const column = index % 8;
        const row = Math.floor((index - 64) / 8);
        matrix.makeTranslation((column - 3.5) * 1.7, 2.6, (row - 1.5) * 1.7);
        batch.setMatrixAt(instanceId, matrix);
        instanceIds.push(instanceId);
      }

      const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x819073, roughness: 1 });
      ownedMaterials.push(groundMaterial);
      ground = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), groundMaterial);
      ground.rotation.x = -Math.PI * 0.5;
      ground.receiveShadow = true;
      scene.add(ground);

      renderer.shadowMap.enabled = false;
      renderer.info.reset();
      renderer.render(scene, camera);
      const colorCalls = renderer.info.render.calls;

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      renderer.info.reset();
      renderer.render(scene, camera);
      const totalCallsWithShadow = renderer.info.render.calls;
      const shadowCalls = Math.max(0, totalCallsWithShadow - colorCalls);
      const triangles = renderer.info.render.triangles;

      batch.updateMatrixWorld(true);
      const raycaster = new THREE.Raycaster();
      const pickNdc = new THREE.Vector3(-3.5 * 1.7, 1, -3.5 * 1.7).project(camera);
      raycaster.setFromCamera(new THREE.Vector2(pickNdc.x, pickNdc.y), camera);
      const intersections = raycaster.intersectObject(batch, false);
      const raycastPassed = intersections.some((intersection) => typeof intersection.batchId === "number");
      const drawCallCompressionPassed = !capabilities.multiDraw || colorCalls <= 4;
      const recommendedBackend: CityBatchBackend = capabilities.multiDraw && drawCallCompressionPassed
        ? "batched-mesh"
        : "instanced-mesh";
      const passed = capacityExpansionPassed
        && geometryResizePassed
        && lodSwitchPassed
        && tintPassed
        && visibilityPassed
        && raycastPassed
        && drawCallCompressionPassed;
      if (!cancelled) {
        setResult(Object.freeze({
          state: passed ? "passed" : "failed",
          webglVersion: capabilities.webglVersion,
          renderer: capabilities.renderer,
          multiDraw: capabilities.multiDraw,
          recommendedBackend,
          colorCalls,
          shadowCalls,
          triangles,
          initialInstances: 64,
          expandedCapacity: 128,
          liveInstances: instanceIds.length,
          capacityExpansionPassed,
          geometryResizePassed,
          lodSwitchPassed,
          tintPassed,
          visibilityPassed,
          raycastPassed,
          drawCallCompressionPassed,
          message: passed
            ? `Spike passed; recommended backend: ${recommendedBackend}.`
            : "One or more BatchedMesh checks failed.",
        }));
      }
    } catch (error) {
      if (!cancelled) {
        setResult(Object.freeze({
          ...INITIAL_RESULT,
          state: "failed",
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    }

    return () => {
      cancelled = true;
      if (batch) {
        batch.removeFromParent();
        batch.dispose();
        disposeMaterial(batch.material);
      }
      if (ground) {
        ground.removeFromParent();
        disposeSceneResources(ground);
      }
      for (const geometry of sourceGeometries) geometry.dispose();
      for (const material of ownedMaterials) {
        if (batch?.material !== material) material.dispose();
      }
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, []);

  return (
    <main style={{ padding: 24, color: "#ecf1ed", background: "#142028", minHeight: "100vh", fontFamily: "ui-monospace, monospace" }}>
      <h1>City BatchedMesh performance fixture</h1>
      <canvas ref={canvasRef} width={640} height={360} style={{ width: 640, maxWidth: "100%", border: "1px solid #48606b" }} />
      <output data-testid="batch-spike-result" data-state={result.state}>{result.message}</output>
      <pre data-testid="batch-spike-json">{JSON.stringify(result, null, 2)}</pre>
    </main>
  );
}
