"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import styles from "./CharacterShowcase.module.css";

type CharacterId = "rabbit" | "fox" | "tiger";
type ActionId = "idle" | "walk" | "run" | "jump";
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
  rigged: boolean;
  boneCount: number;
  defaultAction: ActionId;
  actions: ActionId[];
  details: Array<{ label: string; value: string }>;
};

const CHARACTERS: CharacterRecord[] = [
  {
    id: "rabbit",
    number: "CHARACTER 01",
    name: "兔子信使",
    englishName: "RABBIT COURIER",
    role: "主角 / 已绑定",
    description: "森林与雨港路线的主角。完整保留 Tripo 双足绑定，并提供待机、行走、奔跑与跳跃四段原地动作。",
    modelUrl: "/models/characters/rabbit/rabbit-courier-rigged-runtime.glb",
    previewUrl: "/models/characters/rabbit/rabbit-courier-rigged-preview.webp",
    rigged: true,
    boneCount: 41,
    defaultAction: "idle",
    actions: ["idle", "walk", "run", "jump"],
    details: [
      { label: "运行时面数", value: "179,560 三角面" },
      { label: "骨骼结构", value: "41 节 / Tripo Biped" },
      { label: "动作片段", value: "Idle · Walk · Run · Jump" },
      { label: "资源状态", value: "已绑定 / PBR / Meshopt" },
    ],
  },
  {
    id: "fox",
    number: "CHARACTER 02",
    name: "狐狸信使",
    englishName: "FOX COURIER",
    role: "候选角色 / 已绑定",
    description: "背包与风衣造型的狐狸信使。已接入 29 节自定义骨骼，可预览待机、行走、奔跑与跑跳动作。",
    modelUrl: "/models/characters/fox-tpose/fox-courier-rigged-runtime.glb",
    previewUrl: "/models/characters/fox-tpose/fox-courier-tpose-preview.webp",
    rigged: true,
    boneCount: 29,
    defaultAction: "idle",
    actions: ["idle", "walk", "run", "jump"],
    details: [
      { label: "运行时面数", value: "94,016 三角面" },
      { label: "骨骼结构", value: "29 节 / 自定义 Biped" },
      { label: "动作片段", value: "Idle · Walk · Run · Run Jump" },
      { label: "资源状态", value: "已绑定 / PBR / Meshopt" },
    ],
  },
  {
    id: "tiger",
    number: "CHARACTER 03",
    name: "虎子信使",
    englishName: "TIGER COURIER",
    role: "候选角色 / 已绑定",
    description: "穿着工装与邮差包的虎子信使。已接入 25 节双足骨骼与行走、奔跑、跳跃动作。",
    modelUrl: "/models/characters/tiger-tpose/tiger-courier-rigged-runtime.glb",
    previewUrl: "/models/characters/tiger-tpose/tiger-courier-tpose-preview.webp",
    rigged: true,
    boneCount: 25,
    defaultAction: "walk",
    actions: ["walk", "run", "jump"],
    details: [
      { label: "运行时面数", value: "91,090 三角面" },
      { label: "骨骼结构", value: "25 节 / 自定义 Biped" },
      { label: "动作片段", value: "Walk · Run · Jump" },
      { label: "资源状态", value: "已绑定 / PBR / Meshopt" },
    ],
  },
];

const ACTIONS: Array<{ id: ActionId; label: string; code: string }> = [
  { id: "idle", label: "待机", code: "IDLE" },
  { id: "walk", label: "行走", code: "WALK" },
  { id: "run", label: "奔跑", code: "RUN" },
  { id: "jump", label: "跳跃", code: "JUMP" },
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
  helper: THREE.SkeletonHelper | null;
  meshes: THREE.Object3D[];
  frame: number;
  requestId: number;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

function actionKey(name: string): ActionId | null {
  const normalized = name.toLowerCase();
  if (normalized.includes("idle")) return "idle";
  if (normalized.includes("walk")) return "walk";
  if (normalized.includes("jump")) return "jump";
  if (normalized.includes("run")) return "run";
  return null;
}

function clearStage(runtime: Runtime) {
  runtime.mixer?.stopAllAction();
  runtime.mixer = null;
  runtime.actions = {};
  runtime.currentAction = null;
  runtime.helper?.geometry.dispose();
  runtime.helper = null;
  runtime.meshes = [];
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
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 0.55;

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
    const runtime: Runtime = { renderer, scene, camera, controls, stage, mixer: null, actions: {}, currentAction: null, helper: null, meshes: [], frame: 0, requestId: 0 };
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
      model.rotation.y = selected.id === "rabbit" ? -Math.PI / 2 : Math.PI;
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
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        runtime.meshes.push(mesh);
      });
      runtime.stage.add(model);

      if (selected.rigged) {
        const helper = new THREE.SkeletonHelper(model);
        helper.visible = false;
        const helperMaterial = helper.material as THREE.LineBasicMaterial;
        helperMaterial.vertexColors = false;
        helperMaterial.color.set(0xff6a35);
        helperMaterial.transparent = true;
        helperMaterial.opacity = 0.95;
        helperMaterial.depthTest = false;
        helperMaterial.needsUpdate = true;
        runtime.helper = helper;
        runtime.stage.add(helper);
        runtime.mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          const key = actionKey(clip.name);
          if (!key) continue;
          const action = runtime.mixer.clipAction(clip);
          if (key === "jump") {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          } else {
            action.setLoop(THREE.LoopRepeat, Infinity);
          }
          runtime.actions[key] = action;
        }
      }
      setIsLoading(false);
      setStatus(selected.rigged ? "角色与骨骼已就绪" : "静态角色模型已就绪");
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
    const previous = runtime.currentAction ? runtime.actions[runtime.currentAction] : null;
    if (previous && previous !== next) previous.fadeOut(0.2);
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.fadeIn(0.2).play();
    runtime.currentAction = activeAction;
    setStatus(`正在播放 · ${ACTIONS.find((item) => item.id === activeAction)?.label ?? activeAction}`);
  }, [activeAction, actionRevision, modelVersion, selected.rigged]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    for (const mesh of runtime.meshes) mesh.visible = viewMode !== "skeleton";
    if (runtime.helper) runtime.helper.visible = viewMode === "skeleton" || showSkeleton;
  }, [showSkeleton, viewMode, modelVersion]);

  const chooseAction = (id: ActionId) => {
    setActiveAction(id);
    setActionRevision((value) => value + 1);
  };
  const resetView = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.camera.position.set(5.6, 3.5, 7.4);
    runtime.controls.target.set(0, 1.75, 0);
    runtime.controls.update();
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
