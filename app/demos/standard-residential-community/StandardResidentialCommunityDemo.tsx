"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSceneShatterPair, measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { buildLowPolyStandardResidentialCommunity } from "../../lib/map/standardResidentialCommunity";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import {
  applySceneShadowPolicy,
  createInstancedPrototypeBatch,
  createScenePointLightPool,
} from "../../lib/map/sceneInstanceBatch";
import { createShowcaseRenderBudget, hasContinuousShowcaseActivity } from "../../lib/map/showcaseRenderBudget";
import {
  createCachedPrimitiveScene,
  disposeSceneResources,
  retireResourceCacheGeneration,
} from "../../lib/map/cityResourceCache";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | "housing" | "parking" | "fitness" | "landscape";
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 9, 0), camera: new THREE.Vector3(148, 104, 158), rider: new THREE.Vector3(8, 0.64, 64) },
  housing: { target: new THREE.Vector3(0, 8, -4), camera: new THREE.Vector3(100, 58, 92), rider: new THREE.Vector3(8, 0.64, 47) },
  parking: { target: new THREE.Vector3(18, 2.2, 14), camera: new THREE.Vector3(92, 34, 78), rider: new THREE.Vector3(8, 0.64, 52) },
  fitness: { target: new THREE.Vector3(-32, 1.8, -13), camera: new THREE.Vector3(-7, 29, 8), rider: new THREE.Vector3(-20, 0.64, -13) },
  landscape: { target: new THREE.Vector3(0, 1.8, -15), camera: new THREE.Vector3(54, 62, 22), rider: new THREE.Vector3(8, 0.64, 8) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "COMMUNITY 00", title: "普通小区总览", summary: "160 × 140 m · 18 栋 · 360 户", detail: "参考常见多层住宅小区的紧凑平行组团，中央南北生活道路把三排住宅明确分成左右两区，并连接南侧小区门与各排消防支路。" },
  { id: "housing", number: "HOUSING 01", title: "紧凑住宅组团", summary: "3 排 × 6 栋 · 约7.3m横向净距", detail: "18栋住宅全部复用同一社区居民楼模型，每栋20户；缩短左右楼距，同时保持入户步道、采光面与消防通行互不穿插。" },
  { id: "parking", number: "PARKING 02", title: "路边地面停车", summary: "3 排双侧停车港湾 · 60 个车位", detail: "每排住宅前的停车港湾按左右分段设置，在中央道路处留出完整交叉口，并用少量私家轿车和SUV校验车位比例。" },
  { id: "fitness", number: "FITNESS 03", title: "独立健身院落", summary: "7 组器械 · 左侧住宅内部", detail: "健身区设置在左侧住宅内部的独立口袋花园，具有围合绿篱、专用入口和标识；单杠、太空漫步机、腰背转盘与拉伸架均有实体基础和安全缓冲。" },
  { id: "landscape", number: "GREEN 04", title: "30% 社区绿化", summary: "6,720㎡ · 44 个小树点位", detail: "中央道路两侧绿化缓冲、左右宅间花园、周界绿带与入口花园共同覆盖小区30%；道路树和健身院落树形成清晰绿化层次。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setGateOpen: (open: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function StandardResidentialCommunityDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [shattered, setShattered] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [referenceReady, setReferenceReady] = useState(false);
  const [metrics, setMetrics] = useState<ModelGeometryMetrics | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.03;
    renderer.domElement.setAttribute("aria-label", "普通小区左右住宅分区、中央生活道路、独立健身院落、三排双侧停车与百分之三十绿化三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcbdede);
    scene.fog = new THREE.Fog(0xcbdede, 195, 390);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 480);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 14;
    controls.maxDistance = 340;
    controls.maxPolarAngle = Math.PI * 0.49;
    const renderBudget = createShowcaseRenderBudget({ renderer, host, controls });

    const ground = new THREE.Mesh(new THREE.CircleGeometry(178, 64), new THREE.MeshStandardMaterial({ color: 0xaab9a7, roughness: 0.98 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf5fbff, 0x526653, 2.1);
    const sun = new THREE.DirectionalLight(0xffedcf, 4.7);
    sun.position.set(-72, 98, 56);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -125;
    sun.shadow.camera.right = 125;
    sun.shadow.camera.top = 110;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.far = 320;
    const fill = new THREE.DirectionalLight(0x91bdcf, 0.72);
    fill.position.set(74, 32, -66);
    scene.add(hemi, sun, fill);

    const cachedScene = createCachedPrimitiveScene(buildLowPolyStandardResidentialCommunity);
    const community = cachedScene.root;
    const pointLightPool = createScenePointLightPool({
      name: "standard-community-showcase-light-pool",
      root: community,
    });
    applySceneShadowPolicy(community);
    const pair = createSceneShatterPair(community, { seed: 611, spread: 5.5 });
    const shatterMorph = new ShatterMorphController(0);
    scene.add(pair.root);
    queueMicrotask(() => setMetrics(measureModelGeometry(community)));

    const riderAnchor = new THREE.Group();
    riderAnchor.name = "standard-community-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    Promise.all([loader.loadAsync(TREE_URL), loader.loadAsync(RABBIT_RIDER_URL)]).then(([treeGltf, riderGltf]) => {
      if (disposed) return;
      const template = treeGltf.scene;
      template.name = "standard-community-reused-small-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let treeBounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(4.3 / Math.max(treeBounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      treeBounds = new THREE.Box3().setFromObject(template);
      const center = treeBounds.getCenter(new THREE.Vector3());
      template.position.set(-center.x, -treeBounds.min.y, -center.z);
      const treePrototype = new THREE.Group();
      treePrototype.name = "standard-community-small-tree-prototype";
      treePrototype.add(template);
      const treeAnchors: THREE.Object3D[] = [];
      community.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "standard-community-reused-tree-anchor") treeAnchors.push(object);
      });
      const treeBatch = createInstancedPrototypeBatch({
        name: "standard-community-tree-render-batch",
        parent: community,
        prototype: treePrototype,
        placements: treeAnchors,
        hidePlacementMeshes: false,
      });
      community.userData.treeRenderBatchCount = treeBatch.userData.batchCount;
      riderAnchor.add(prepareRabbitRiderReference(riderGltf.scene));
      setMetrics(measureModelGeometry(community));
      setReferenceReady(true);
    }).catch(() => setReferenceReady(false));

    const desiredTarget = FOCUS.overview.target.clone();
    const desiredCamera = FOCUS.overview.camera.clone();
    let focusBlend = 0;
    let interacting = false;
    let rotating = false;
    controls.addEventListener("start", () => { interacting = true; focusBlend = 0; });
    controls.addEventListener("end", () => { interacting = false; });
    const setNightMode = (on: boolean) => {
      const color = on ? 0x101e2b : 0xcbdede;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 170 : 195, on ? 350 : 390);
      hemi.intensity = on ? 0.4 : 2.1;
      sun.intensity = on ? 0.24 : 4.7;
      fill.intensity = on ? 0.22 : 0.72;
      renderer.toneMappingExposure = on ? 0.9 : 1.03;
      community.userData.setPowered(on);
      pointLightPool.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => {
        desiredTarget.copy(FOCUS[next].target);
        desiredCamera.copy(FOCUS[next].camera);
        riderAnchor.position.copy(FOCUS[next].rider);
        focusBlend = 1;
      },
      setNight: setNightMode,
      setGateOpen: (open) => community.userData.setAccessGateOpen(open),
      setShattered: (on) => shatterMorph.animateTo(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.45; },
    };
    setNightMode(false);
    community.userData.setAccessGateOpen(false);

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const morphChanged = shatterMorph.update(delta);
      if (morphChanged) pair.setAmount(shatterMorph.getAmount());
      if (!interacting && focusBlend > 0.001) {
        controls.target.lerp(desiredTarget, 0.085);
        if (!rotating) camera.position.lerp(desiredCamera, 0.065);
        focusBlend *= 0.91;
      }
      const controlsChanged = controls.update();
      renderBudget.render(scene, camera, hasContinuousShowcaseActivity({
        autoRotate: rotating, focusBlend, morphChanged, controlsChanged,
      }));
    };
    animate();
    const resize = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderBudget.dispose();
      controls.dispose();
      apiRef.current = null;
      disposeSceneResources(scene);
      cachedScene.lease.release();
      void retireResourceCacheGeneration();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const chooseFocus = (next: Focus) => { setFocus(next); apiRef.current?.focus(next); };
  const toggleNight = () => { const next = !night; setNight(next); apiRef.current?.setNight(next); };
  const toggleGate = () => { const next = !gateOpen; setGateOpen(next); apiRef.current?.setGateOpen(next); };
  const toggleShattered = () => { const next = !shattered; setShattered(next); apiRef.current?.setShattered(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>STANDARD NEIGHBOURHOOD / 1M MODULAR PLAN</p><h1>清禾家园 · 普通小区独立场景</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考常见多层住宅小区的紧凑平行布局，使用18栋同款社区居民楼组成左三排、右三排住宅组团；中央南北生活道路作为两区分界，每排支路与双侧地面停车带在中央路口断开。绿化缓冲、宅间花园和周界绿带共同精确占场地30%，健身器材集中在左侧住宅内部的独立围合院落。树木、花箱、路灯与车辆继续复用现有模型，小兔子骑车主角提供2.40米统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.danger : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复完整小区" : "破碎完整小区"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白天" : "查看小区夜景"}</button>
            <button type="button" className={gateOpen ? styles.active : ""} aria-pressed={gateOpen} onClick={toggleGate}>{gateOpen ? "关闭小区大门" : "打开小区大门"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止旋转" : "自动旋转"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回总览</button>
          </div>
        </div>
      </header>
      <div className={styles.status}>18 栋住宅 · 60 个地面车位 · 30% 绿化 · {referenceReady ? "骑车兔子 2.40 m" : "比例模型加载中"}</div>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      {metrics ? <div className={styles.metrics}><span>STANDARD COMMUNITY</span><strong>{metrics.size.x.toFixed(0)} × {metrics.size.y.toFixed(0)} × {metrics.size.z.toFixed(0)} m</strong><small>{metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 正常 / 独立破碎双版本</small></div> : null}
      <nav className={styles.zoneRail} aria-label="普通小区分区导览">
        {ZONES.map((zone) => <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.active : ""}`} onClick={() => chooseFocus(zone.id)}><span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><p>{zone.detail}</p></button>)}
      </nav>
    </main>
  );
}
