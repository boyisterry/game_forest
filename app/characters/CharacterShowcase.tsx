"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import {
  FOREST_COURIER_CHARACTER_ACTION_CLIPS,
  type ForestCourierActionId,
} from "../lib/animation/forestCourierRig";
import styles from "./CharacterShowcase.module.css";

type CharacterId = "rabbit" | "fox" | "tiger";
type ActionId = ForestCourierActionId;
type CompositeActionId = "walk_jump" | "run_jump";
type ViewMode = "character" | "skeleton";

type CharacterRecord = {
  id: CharacterId;
  number: string;
  name: string;
  englishName: string;
  role: string;
  description: string;
  modelUrl: string;
  previewUrl: string;
  rotationY: number;
  rigged: boolean;
  boneCount: number;
  defaultAction: ActionId;
  actions: ActionId[];
  actionClips: Partial<Record<ActionId, string>>;
  details: Array<{ label: string; value: string }>;
};

const CHARACTERS: CharacterRecord[] = [
  {
    id: "rabbit",
    number: "CHARACTER 01",
    name: "兔子信使",
    englishName: "RABBIT COURIER",
    role: "主角 / 已绑定",
    description: "森林与雨港路线的主角。完整保留 Tripo 双足绑定，并提供待机、行走、奔跑、跳跃及两种助跑跳跃动作。",
    modelUrl: "/models/characters/rabbit/rabbit-courier-rigged-runtime.glb",
    previewUrl: "/models/characters/rabbit/rabbit-courier-rigged-preview.webp",
    rotationY: -Math.PI / 2,
    rigged: true,
    boneCount: 41,
    defaultAction: "idle",
    actions: ["idle", "walk", "run", "jump", "walk_jump", "run_jump"],
    actionClips: FOREST_COURIER_CHARACTER_ACTION_CLIPS.rabbit,
    details: [
      { label: "运行时面数", value: "179,560 三角面" },
      { label: "骨骼结构", value: "41 节 / Tripo Biped" },
      { label: "动作片段", value: "Idle · Walk · Run · Jump · Walk Jump · Run Jump" },
      { label: "资源状态", value: "已绑定 / PBR / Meshopt" },
    ],
  },
  {
    id: "fox",
    number: "CHARACTER 02",
    name: "狐狸信使",
    englishName: "FOX COURIER",
    role: "候选角色 / 已绑定",
    description: "背包与风衣造型的狐狸信使。保留 29 节自定义骨骼，并提供待机、行走、奔跑、跳跃及两种助跑跳跃动作。",
    modelUrl: "/models/characters/fox-tpose/fox-courier-rigged-runtime.glb",
    previewUrl: "/models/characters/fox-tpose/fox-courier-tpose-preview.webp",
    rotationY: -Math.PI / 2,
    rigged: true,
    boneCount: 29,
    defaultAction: "idle",
    actions: ["idle", "walk", "run", "jump", "walk_jump", "run_jump"],
    actionClips: FOREST_COURIER_CHARACTER_ACTION_CLIPS.fox,
    details: [
      { label: "运行时面数", value: "94,016 三角面" },
      { label: "骨骼结构", value: "29 节 / 自定义 Biped" },
      { label: "动作片段", value: "Idle · Walk · Run · Jump · Walk Jump · Run Jump" },
      { label: "资源状态", value: "已绑定 / PBR / Meshopt" },
    ],
  },
  {
    id: "tiger",
    number: "CHARACTER 03",
    name: "虎子信使",
    englishName: "TIGER COURIER",
    role: "候选角色 / 已绑定",
    description: "穿着工装与邮差包的虎子信使。保留 25 节双足骨骼，并提供待机、行走、奔跑、跳跃及两种助跑跳跃动作。",
    modelUrl: "/models/characters/tiger-tpose/tiger-courier-rigged-runtime.glb",
    previewUrl: "/models/characters/tiger-tpose/tiger-courier-tpose-preview.webp",
    rotationY: 0,
    rigged: true,
    boneCount: 25,
    defaultAction: "idle",
    actions: ["idle", "walk", "run", "jump", "walk_jump", "run_jump"],
    actionClips: FOREST_COURIER_CHARACTER_ACTION_CLIPS.tiger,
    details: [
      { label: "运行时面数", value: "91,090 三角面" },
      { label: "骨骼结构", value: "25 节 / 自定义 Biped" },
      { label: "动作片段", value: "Idle · Walk · Run · Jump · Walk Jump · Run Jump" },
      { label: "资源状态", value: "已绑定 / PBR / Meshopt" },
    ],
  },
];

const ACTIONS: Array<{ id: ActionId; label: string; code: string }> = [
  { id: "idle", label: "待机", code: "IDLE" },
  { id: "walk", label: "行走", code: "WALK" },
  { id: "run", label: "奔跑", code: "RUN" },
  { id: "jump", label: "跳跃", code: "JUMP" },
  { id: "walk_jump", label: "行走 + 跳跃", code: "WALK JUMP" },
  { id: "run_jump", label: "奔跑 + 跳跃", code: "RUN JUMP" },
];

type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  stage: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<ActionId, THREE.AnimationAction>>;
  currentAction: ActionId | null;
  composite: {
    id: CompositeActionId;
    locomotion: "walk" | "run";
    elapsed: number;
    leadInDuration: number;
    jumpStarted: boolean;
  } | null;
  helper: THREE.SkeletonHelper | null;
  meshes: THREE.Object3D[];
  model: THREE.Group | null;
  modelBaseY: number;
  characterId: CharacterId | null;
  rabbitRig: {
    hip: THREE.Object3D | null;
    hipBindPosition: THREE.Vector3;
    feet: THREE.Object3D[];
    groundReferenceY: number | null;
  } | null;
  frame: number;
  requestId: number;
};

const RABBIT_HEAD_LIFT: Record<ActionId, number> = {
  idle: 18,
  walk: 18,
  run: 42,
  jump: 10,
  walk_jump: 10,
  run_jump: 10,
};

const CHARACTER_JUMP_LIFT: Record<CharacterId, number> = {
  rabbit: 0.82,
  fox: 0,
  tiger: 0,
};

function prepareRabbitClip(source: THREE.AnimationClip, actionId: ActionId) {
  const clip = source.clone();
  clip.name = `rabbit:corrected-${actionId}`;
  const correction = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    THREE.MathUtils.degToRad(RABBIT_HEAD_LIFT[actionId]),
  );
  const value = new THREE.Quaternion();

  for (const track of clip.tracks) {
    if (!(track instanceof THREE.QuaternionKeyframeTrack)) continue;
    if (!track.name.endsWith("NeckTwist01.quaternion") || track.getValueSize() !== 4) continue;
    for (let offset = 0; offset < track.values.length; offset += 4) {
      value.fromArray(track.values, offset).normalize().multiply(correction).normalize();
      track.values[offset] = value.x;
      track.values[offset + 1] = value.y;
      track.values[offset + 2] = value.z;
      track.values[offset + 3] = value.w;
    }
  }
  return clip;
}

function prepareTigerIdleClip(source: THREE.AnimationClip) {
  const clip = source.clone();
  const duration = 4;
  const animated = new THREE.Quaternion();
  const correction = new THREE.Quaternion();
  clip.tracks = clip.tracks.map((track) => {
    const valueSize = track.getValueSize();
    const values = new Float32Array(valueSize * 3);
    for (let key = 0; key < 3; key += 1) {
      for (let component = 0; component < valueSize; component += 1) {
        values[key * valueSize + component] = track.values[component];
      }
    }
    if (track instanceof THREE.QuaternionKeyframeTrack && valueSize === 4) {
      const breathingDegrees = track.name.endsWith("chest.quaternion")
        ? 1.4
        : track.name.endsWith("head.quaternion")
          ? -0.7
          : 0;
      if (breathingDegrees !== 0) {
        animated.fromArray(track.values, 0).normalize();
        correction.setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(breathingDegrees));
        animated.multiply(correction).normalize().toArray(values, valueSize);
      }
    }
    const prepared = track.clone();
    prepared.times = new Float32Array([0, duration / 2, duration]);
    prepared.values = values;
    return prepared;
  });
  clip.name = "tiger:derived-idle";
  clip.duration = duration;
  return clip;
}

function prepareCharacterClip(
  source: THREE.AnimationClip,
  characterId: CharacterId,
  actionId: ActionId,
) {
  const clip = characterId === "rabbit"
    ? prepareRabbitClip(source, actionId)
    : characterId === "tiger" && actionId === "idle"
      ? prepareTigerIdleClip(source)
      : source.clone();
  clip.name = `${characterId}:custom-${actionId}`;
  return clip;
}

function isCompositeAction(actionId: ActionId): actionId is CompositeActionId {
  return actionId === "walk_jump" || actionId === "run_jump";
}

function advanceCompositeAction(runtime: Runtime, delta: number) {
  const composite = runtime.composite;
  if (!composite || composite.jumpStarted) return;
  composite.elapsed += delta;
  if (composite.elapsed < composite.leadInDuration) return;
  const locomotion = runtime.actions[composite.locomotion];
  const jump = runtime.actions[composite.id];
  if (!jump) return;
  locomotion?.fadeOut(0.14);
  jump.reset();
  jump.enabled = true;
  jump.setEffectiveTimeScale(1);
  jump.setEffectiveWeight(1);
  jump.fadeIn(0.14).play();
  composite.jumpStarted = true;
}

function applyCharacterMotionCorrection(runtime: Runtime) {
  if (!runtime.characterId || !runtime.model || !runtime.currentAction) return;
  const airborneAction = runtime.currentAction === "jump"
    ? runtime.actions.jump
    : runtime.composite?.jumpStarted
      ? runtime.actions[runtime.composite.id]
      : null;
  let lift = 0;
  if (airborneAction) {
    const jump = airborneAction;
    const duration = jump?.getClip().duration ?? 0;
    if (jump && duration > 0) {
      const progress = THREE.MathUtils.clamp(jump.time / duration, 0, 1);
      lift = Math.sin(progress * Math.PI) * CHARACTER_JUMP_LIFT[runtime.characterId];
    }
  }
  runtime.model.position.y = runtime.modelBaseY + lift;

  if (runtime.characterId !== "rabbit" || !runtime.rabbitRig) return;
  const { hip, hipBindPosition, feet, groundReferenceY } = runtime.rabbitRig;
  if (hip) {
    const animatedHipX = hip.position.x;
    hip.position.copy(hipBindPosition);
    hip.position.z += animatedHipX;
  }

  if (!airborneAction && groundReferenceY !== null && feet.length > 0) {
    runtime.model.updateMatrixWorld(true);
    const sample = new THREE.Vector3();
    let currentGroundY = Infinity;
    for (const foot of feet) currentGroundY = Math.min(currentGroundY, foot.getWorldPosition(sample).y);
    if (Number.isFinite(currentGroundY)) runtime.model.position.y += groundReferenceY - currentGroundY;
  }
}

function applyCameraPreset(runtime: Runtime, mode: ViewMode) {
  if (mode === "skeleton") {
    runtime.camera.position.set(3.6, 2.2, 4.7);
    runtime.controls.target.set(0, 1.08, 0);
  } else {
    runtime.camera.position.set(5.6, 3.5, 7.4);
    runtime.controls.target.set(0, 1.75, 0);
  }
  runtime.controls.update();
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const renderable = child as THREE.Mesh | THREE.Line | THREE.Points;
    if (!renderable.isMesh && !renderable.isLine && !renderable.isPoints) return;
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

function clearStage(runtime: Runtime) {
  runtime.mixer?.stopAllAction();
  runtime.mixer = null;
  runtime.actions = {};
  runtime.currentAction = null;
  runtime.composite = null;
  runtime.helper = null;
  runtime.meshes = [];
  runtime.model = null;
  runtime.modelBaseY = 0;
  runtime.characterId = null;
  runtime.rabbitRig = null;
  for (const child of [...runtime.stage.children]) {
    runtime.stage.remove(child);
    disposeObject(child);
  }
}

export function CharacterShowcase() {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const [selectedId, setSelectedId] = useState<CharacterId>("rabbit");
  const [activeAction, setActiveAction] = useState<ActionId>("idle");
  const [actionRevision, setActionRevision] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("character");
  const [modelVersion, setModelVersion] = useState(0);
  const [status, setStatus] = useState("正在准备兔子信使…");
  const [isLoading, setIsLoading] = useState(true);
  const selected = useMemo(() => CHARACTERS.find((item) => item.id === selectedId) ?? CHARACTERS[0], [selectedId]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd7e5df);
    scene.fog = new THREE.Fog(0xd7e5df, 11, 24);
    const camera = new THREE.PerspectiveCamera(39, 1, 0.05, 50);
    camera.position.set(5.6, 3.5, 7.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.75, 0);
    controls.enableDamping = true;
    controls.minDistance = 3.8;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotate = false;

    scene.add(new THREE.HemisphereLight(0xf6fbff, 0x586e59, 1.65));
    const key = new THREE.DirectionalLight(0xffe2b8, 3.1);
    key.position.set(5, 8, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7faec0, 1.5);
    rim.position.set(-5, 4, -5);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.25, 72), new THREE.MeshStandardMaterial({ color: 0xa9bdb0, roughness: 0.88, metalness: 0.02 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.55, 3.6, 96), new THREE.MeshBasicMaterial({ color: 0xf4ae76, side: THREE.DoubleSide, transparent: true, opacity: 0.82 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    scene.add(ring);
    const grid = new THREE.GridHelper(18, 36, 0x779089, 0xb7c9c1);
    grid.position.y = 0.006;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    scene.add(grid);

    const stage = new THREE.Group();
    scene.add(stage);
    const runtime: Runtime = {
      renderer,
      scene,
      camera,
      controls,
      stage,
      mixer: null,
      actions: {},
      currentAction: null,
      composite: null,
      helper: null,
      meshes: [],
      model: null,
      modelBaseY: 0,
      characterId: null,
      rabbitRig: null,
      frame: 0,
      requestId: 0,
    };
    runtimeRef.current = runtime;
    const clock = new THREE.Clock();
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const render = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      runtime.mixer?.update(delta);
      advanceCompositeAction(runtime, delta);
      applyCharacterMotionCorrection(runtime);
      controls.update(delta);
      renderer.render(scene, camera);
      runtime.frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      runtime.requestId += 1;
      cancelAnimationFrame(runtime.frame);
      observer.disconnect();
      clearStage(runtime);
      controls.dispose();
      disposeObject(floor);
      disposeObject(ring);
      disposeObject(grid);
      renderer.dispose();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const requestId = runtime.requestId + 1;
    runtime.requestId = requestId;
    clearStage(runtime);
    setIsLoading(true);
    setStatus(`正在载入${selected.name}…`);
    setActiveAction(selected.defaultAction);
    setViewMode("character");
    setShowSkeleton(false);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(selected.modelUrl, (gltf) => {
      if (!runtimeRef.current || runtime.requestId !== requestId) {
        disposeObject(gltf.scene);
        return;
      }
      const model = gltf.scene;
      model.rotation.y = selected.rotationY;
      model.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(model);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      model.scale.setScalar(3.7 / Math.max(rawSize.y, 0.001));
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;
      model.updateMatrixWorld(true);
      runtime.model = model;
      runtime.modelBaseY = model.position.y;
      runtime.characterId = selected.id;
      if (selected.id === "rabbit") {
        const hip = model.getObjectByName("Hip");
        const feet = ["L_ToeBase", "R_ToeBase", "L_Foot", "R_Foot"]
          .map((name) => model.getObjectByName(name))
          .filter((bone): bone is THREE.Object3D => Boolean(bone));
        const sample = new THREE.Vector3();
        const groundReferenceY = feet.length > 0
          ? Math.min(...feet.map((foot) => foot.getWorldPosition(sample).y))
          : null;
        runtime.rabbitRig = {
          hip,
          hipBindPosition: hip?.position.clone() ?? new THREE.Vector3(),
          feet,
          groundReferenceY,
        };
      } else {
        runtime.rabbitRig = null;
      }
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        runtime.meshes.push(mesh);
      });
      runtime.stage.add(model);

      const helper = new THREE.SkeletonHelper(model);
      helper.visible = false;
      const helperMaterial = helper.material as THREE.LineBasicMaterial;
      helperMaterial.vertexColors = false;
      helperMaterial.color.set(0xff6a35);
      helperMaterial.transparent = true;
      helperMaterial.opacity = 0.95;
      helperMaterial.depthTest = false;
      helperMaterial.needsUpdate = true;
      const joints = new THREE.Points(helper.geometry, new THREE.PointsMaterial({
        color: 0xff6a35,
        size: 0.045,
        sizeAttenuation: true,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }));
      joints.frustumCulled = false;
      helper.add(joints);
      runtime.helper = helper;
      runtime.stage.add(helper);
      runtime.mixer = new THREE.AnimationMixer(model);
      for (const key of selected.actions) {
        const clipName = selected.actionClips[key];
        const clip = gltf.animations.find((candidate) => candidate.name === clipName);
        if (!clip) continue;
        const preparedClip = prepareCharacterClip(clip, selected.id, key);
        const action = runtime.mixer.clipAction(preparedClip);
        if (key === "jump" || isCompositeAction(key)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        } else {
          action.setLoop(THREE.LoopRepeat, Infinity);
        }
        runtime.actions[key] = action;
      }
      runtime.mixer.addEventListener("finished", (event) => {
        const current = runtime.currentAction;
        if (
          runtime.requestId !== requestId
          || !current
          || (current !== "jump" && !isCompositeAction(current))
          || event.action !== runtime.actions[current]
        ) return;
        runtime.composite = null;
        setActiveAction(selected.defaultAction);
        setActionRevision((value) => value + 1);
      });
      setIsLoading(false);
      setStatus("角色定制动作与骨骼已就绪");
      setModelVersion((value) => value + 1);
    }, undefined, () => {
      if (runtime.requestId !== requestId) return;
      setIsLoading(false);
      setStatus("模型载入失败，请稍后重试");
    });
  }, [selected]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !selected.rigged) return;
    const next = runtime.actions[activeAction];
    if (!next) return;
    const previousId = runtime.currentAction;
    const previousComposite = runtime.composite;
    const previous = previousComposite
      ? previousComposite.jumpStarted
        ? runtime.actions[previousComposite.id]
        : runtime.actions[previousComposite.locomotion]
      : previousId
        ? runtime.actions[previousId]
        : null;
    runtime.composite = null;

    if (isCompositeAction(activeAction)) {
      const locomotionId = activeAction === "walk_jump" ? "walk" : "run";
      const locomotion = runtime.actions[locomotionId];
      if (!locomotion) return;
      if (previous && previous !== locomotion) previous.fadeOut(0.16);
      next.stop();
      locomotion.reset();
      locomotion.enabled = true;
      locomotion.setEffectiveTimeScale(1);
      locomotion.setEffectiveWeight(1);
      locomotion.fadeIn(0.16).play();
      runtime.composite = {
        id: activeAction,
        locomotion: locomotionId,
        elapsed: 0,
        leadInDuration: locomotionId === "walk" ? 0.72 : 0.46,
        jumpStarted: false,
      };
      runtime.currentAction = activeAction;
      if (runtime.model) runtime.model.position.y = runtime.modelBaseY;
      setStatus(`正在播放 · ${ACTIONS.find((item) => item.id === activeAction)?.label ?? activeAction}`);
      return;
    }

    const preserveLocomotionPhase = previousId !== null
      && previousId !== activeAction
      && (previousId === "walk" || previousId === "run")
      && (activeAction === "walk" || activeAction === "run");
    const previousPhase = preserveLocomotionPhase && previous
      ? (previous.time / previous.getClip().duration) % 1
      : 0;
    if (previous && previous !== next) previous.fadeOut(0.2);
    next.reset();
    if (preserveLocomotionPhase) next.time = previousPhase * next.getClip().duration;
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.fadeIn(0.2).play();
    runtime.currentAction = activeAction;
    if (runtime.model) runtime.model.position.y = runtime.modelBaseY;
    setStatus(`正在播放 · ${ACTIONS.find((item) => item.id === activeAction)?.label ?? activeAction}`);
  }, [activeAction, actionRevision, modelVersion, selected.rigged]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    for (const mesh of runtime.meshes) mesh.visible = viewMode !== "skeleton";
    if (runtime.helper) runtime.helper.visible = viewMode === "skeleton" || showSkeleton;
  }, [showSkeleton, viewMode, modelVersion]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applyCameraPreset(runtime, viewMode);
  }, [viewMode, modelVersion]);

  const chooseAction = (id: ActionId) => {
    setActiveAction(id);
    setActionRevision((value) => value + 1);
  };
  const resetView = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applyCameraPreset(runtime, viewMode);
  };

  return (
    <main className={styles.shell}>
      <section className={styles.stage} aria-label={`${selected.name}三维预览`}>
        <div ref={canvasHostRef} className={styles.canvasHost} />
        <div className={styles.stageWash} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.brandMark}>角</div>
          <div><p>FOREST COURIER / CHARACTER ARCHIVE</p><h1>角色档案馆</h1></div>
        </header>
        <a className={styles.backLink} href="/demos">← 返回模型展示区</a>
        <div className={styles.stageStatus} aria-live="polite"><i className={isLoading ? styles.loadingDot : ""} />{status}</div>
        <button className={styles.resetButton} type="button" onClick={resetView}>重置视角</button>
        <div className={styles.axisNote} aria-hidden="true"><span>RIG VIEWPORT</span><b>拖动旋转 · 滚轮缩放</b></div>

        <section className={styles.cards} aria-label="角色列表">
          {CHARACTERS.map((character) => (
            <button key={character.id} type="button" className={`${styles.card} ${selectedId === character.id ? styles.activeCard : ""}`} onClick={() => setSelectedId(character.id)} aria-pressed={selectedId === character.id}>
              <span className={styles.cardImage}><img src={character.previewUrl} alt="" /></span>
              <span className={styles.cardCopy}><small>{character.number}</small><strong>{character.name}</strong><em>{character.role}</em></span>
              <span className={styles.cardArrow}>↗</span>
            </button>
          ))}
        </section>
      </section>

      <aside className={styles.detailPanel} aria-label="角色详情">
        <div className={styles.detailHeading}>
          <p>{selected.number}</p><span>{selected.englishName}</span><h2>{selected.name}</h2><small>{selected.role}</small>
        </div>
        <p className={styles.description}>{selected.description}</p>

        <section className={styles.controlSection}>
          <div className={styles.sectionTitle}><span>动作预览</span><b>01</b></div>
          {selected.rigged ? (
            <div className={styles.actionGrid}>
              {ACTIONS.filter((action) => selected.actions.includes(action.id)).map((action) => (
                <button key={action.id} type="button" className={activeAction === action.id ? styles.activeAction : ""} onClick={() => chooseAction(action.id)} aria-pressed={activeAction === action.id}>
                  <span>{action.label}</span><small>{action.code}</small>
                </button>
              ))}
            </div>
          ) : <div className={styles.emptyState}><span>静态 T-Pose</span><small>该资源尚未包含动画片段</small></div>}
        </section>

        <section className={styles.controlSection}>
          <div className={styles.sectionTitle}><span>骨骼检查</span><b>02</b></div>
          <label className={`${styles.toggleRow} ${!selected.rigged ? styles.disabled : ""}`}>
            <span><strong>可视化绑定骨架</strong><small>{selected.rigged ? `在角色表面叠加 ${selected.boneCount} 节骨骼` : "当前角色未绑定骨骼"}</small></span>
            <input type="checkbox" checked={showSkeleton} disabled={!selected.rigged || viewMode === "skeleton"} onChange={(event) => setShowSkeleton(event.target.checked)} />
            <i aria-hidden="true" />
          </label>
          <div className={styles.viewMode} role="group" aria-label="展示模式">
            <button type="button" className={viewMode === "character" ? styles.activeMode : ""} onClick={() => setViewMode("character")}>角色展示</button>
            <button type="button" className={viewMode === "skeleton" ? styles.activeMode : ""} disabled={!selected.rigged} onClick={() => setViewMode("skeleton")}>纯骨架动作</button>
          </div>
          {viewMode === "skeleton" && <p className={styles.skeletonNote}>网格已隐藏。当前只显示由所选动画驱动的骨骼结构。</p>}
        </section>

        <section className={styles.controlSection}>
          <div className={styles.sectionTitle}><span>资源信息</span><b>03</b></div>
          <dl className={styles.facts}>{selected.details.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
        </section>
        <footer className={styles.footer}><span>FOREST COURIER STUDIO</span><span>CHAR / 01</span></footer>
      </aside>
    </main>
  );
}
