"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSceneShatterPair, measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { buildLowPolyResidentialCommunity, type ResidentialCommunityZone } from "../../lib/map/residentialCommunity";
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
import styles from "./ResidentialCommunityDemo.module.css";

type Focus = "overview" | ResidentialCommunityZone;
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 11, 0), camera: new THREE.Vector3(166, 124, 184), rider: new THREE.Vector3(0, 0.58, 68) },
  residential: { target: new THREE.Vector3(-43, 9, -4), camera: new THREE.Vector3(-135, 62, 82), rider: new THREE.Vector3(-43, 0.67, 29.4) },
  commercial: { target: new THREE.Vector3(0, 4.5, 53), camera: new THREE.Vector3(128, 48, 132), rider: new THREE.Vector3(15, 0.58, 68) },
  kindergarten: { target: new THREE.Vector3(55, 5, -19), camera: new THREE.Vector3(132, 52, 66), rider: new THREE.Vector3(72, 0.67, 33.4) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "COMMUNITY 00", title: "林庭社区总览", summary: "190 × 145 m · 住宅 / 商业 / 幼儿园", detail: "消防环路保持完整净空，住宅主门经 13 m 开放门廊、连续车道和双侧步道直达城市道路，住宅与幼儿园仍分别受控管理。" },
  { id: "residential", number: "HOME 01", title: "完整住宅组团", summary: "8 栋住宅 · 328 户 · 全龄花园", detail: "楼间步道重新避开建筑主体；中央水景配置有支撑的花园座椅，并细化复合儿童游具、攀爬架、秋千、摇摇马、适老健身设施和双车库入口。" },
  { id: "commercial", number: "STREET 02", title: "社区商业街", summary: "14 个可进入店铺 · 18 个停车位", detail: "14 家店铺补齐独立玻璃门、柜台与室内陈设；两段连续停车港湾和专用灯岛避开社区门廊及幼儿园双向出入口。" },
  { id: "kindergarten", number: "KIDS 03", title: "独立幼儿园", summary: "3 栋建筑 · 8 间教室 · 160 人", detail: "教学、多功能与后勤空间补齐内部设施；复合游具避开跑步环道，受保护等候广场与机动车接送车道分离，并由入口、出口两条单向道路形成环流。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setGatesOpen: (open: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function ResidentialCommunityDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [gatesOpen, setGatesOpen] = useState(false);
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
    renderer.domElement.setAttribute("aria-label", "完整住宅社区、社区商业与幼儿园三分区三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcbdede);
    scene.fog = new THREE.Fog(0xcbdede, 190, 375);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 460);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 14;
    controls.maxDistance = 320;
    controls.maxPolarAngle = Math.PI * 0.49;
    const renderBudget = createShowcaseRenderBudget({ renderer, host, controls });

    const ground = new THREE.Mesh(new THREE.CircleGeometry(172, 64), new THREE.MeshStandardMaterial({ color: 0xa9b9a8, roughness: 0.98 }));
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
    sun.shadow.camera.far = 310;
    const fill = new THREE.DirectionalLight(0x91bdcf, 0.72);
    fill.position.set(74, 32, -66);
    scene.add(hemi, sun, fill);

    const cachedScene = createCachedPrimitiveScene(buildLowPolyResidentialCommunity);
    const community = cachedScene.root;
    const pointLightPool = createScenePointLightPool({
      name: "residential-community-showcase-light-pool",
      root: community,
    });
    applySceneShadowPolicy(community);
    const pair = createSceneShatterPair(community, { seed: 404, spread: 5.5 });
    const shatterMorph = new ShatterMorphController(0);
    scene.add(pair.root);
    setMetrics(measureModelGeometry(community));

    const riderAnchor = new THREE.Group();
    riderAnchor.name = "residential-community-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(TREE_URL).then((gltf) => {
      if (disposed) return;
      const template = gltf.scene;
      template.name = "residential-community-reused-city-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let bounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(5.5 / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(template);
      const center = bounds.getCenter(new THREE.Vector3());
      template.position.set(-center.x, -bounds.min.y, -center.z);
      const treePrototype = new THREE.Group();
      treePrototype.name = "residential-community-small-tree-prototype";
      treePrototype.add(template);
      const treeAnchors: THREE.Object3D[] = [];
      community.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "residential-community-reused-tree-anchor") treeAnchors.push(object);
      });
      const treeBatch = createInstancedPrototypeBatch({
        name: "residential-community-tree-render-batch",
        parent: community,
        prototype: treePrototype,
        placements: treeAnchors,
        hidePlacementMeshes: false,
      });
      community.userData.treeRenderBatchCount = treeBatch.userData.batchCount;
      setMetrics(measureModelGeometry(community));
    }).catch(() => undefined);
    loader.loadAsync(RABBIT_RIDER_URL).then((gltf) => {
      if (disposed) return;
      riderAnchor.add(prepareRabbitRiderReference(gltf.scene));
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
      scene.fog = new THREE.Fog(color, on ? 165 : 190, on ? 335 : 375);
      hemi.intensity = on ? 0.4 : 2.1;
      sun.intensity = on ? 0.24 : 4.7;
      fill.intensity = on ? 0.22 : 0.72;
      renderer.toneMappingExposure = on ? 0.88 : 1.03;
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
      setCutaway: (on) => community.userData.setInteriorCutaway(on),
      setGatesOpen: (on) => community.userData.setAccessGatesOpen(on),
      setShattered: (on) => shatterMorph.animateTo(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.45; },
    };
    setNightMode(false);
    community.userData.setInteriorCutaway(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      community.userData.update(delta);
      const morphChanged = shatterMorph.update(delta);
      if (morphChanged) pair.setAmount(shatterMorph.getAmount());
      if (!interacting && focusBlend > 0.001) {
        controls.target.lerp(desiredTarget, 0.085);
        if (!rotating) camera.position.lerp(desiredCamera, 0.065);
        focusBlend *= 0.91;
      }
      const controlsChanged = controls.update();
      renderBudget.render(scene, camera, hasContinuousShowcaseActivity({
        autoRotate: rotating, focusBlend, morphChanged, internalAnimation: true, controlsChanged,
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
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleGates = () => { const next = !gatesOpen; setGatesOpen(next); apiRef.current?.setGatesOpen(next); };
  const toggleShattered = () => { const next = !shattered; setShattered(next); apiRef.current?.setShattered(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>COMPLETE NEIGHBOURHOOD / HOME &amp; CHILDCARE</p><h1>林庭社区 · 独立住宅场景</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>按照现实完整社区规划，将住宅组团、沿街社区商业和独立幼儿园组织在同一城市街区。此次逐项校正建筑、步道、消防车道和家具的支撑与避让关系，住宅与幼儿园分别设置围栏和受控入口，商业街通过开放门廊保持对外开放；树木、花坛与路灯继续复用已有饰品模型，小兔子骑车主角作为统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.active : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复住宅社区" : "破碎住宅社区"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮社区夜景"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整外观" : "查看建筑剖面"}</button>
            <button type="button" className={gatesOpen ? styles.active : ""} aria-pressed={gatesOpen} onClick={toggleGates}>{gatesOpen ? "关闭社区门禁" : "打开社区门禁"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回社区总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status} aria-live="polite"><span /> {shattered ? "SHATTERED COMMUNITY" : night ? "COMMUNITY NIGHT" : "NEIGHBOURHOOD OPEN"} · {shattered ? "破碎态" : cutaway ? "剖面观察中" : "完整建筑外观"}</div>
      <aside className={styles.metrics} aria-label="住宅社区模型参数">
        <span>RESIDENTIAL COMMUNITY MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 8 栋住宅 / 14 个商铺 / 3 栋幼儿园建筑 · ${referenceReady ? "兔子骑车主角整体外廓约 2.40 m" : "主角参考加载中"}` : "正在计算社区规模"}</small>
      </aside>
      <nav className={styles.zoneRail} aria-label="选择住宅社区功能分区">
        {ZONES.map((zone) => (
          <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}>
            <span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
