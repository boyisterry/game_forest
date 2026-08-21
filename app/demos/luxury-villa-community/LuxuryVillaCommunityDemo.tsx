"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSceneShatterPair, measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { buildLowPolyLuxuryVillaCommunity } from "../../lib/map/luxuryVillaCommunity";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import {
  applySceneShadowPolicy,
  createInstancedPrototypeBatch,
  createScenePointLightPool,
} from "../../lib/map/sceneInstanceBatch";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import { createShowcaseRenderBudget, hasContinuousShowcaseActivity } from "../../lib/map/showcaseRenderBudget";
import {
  createCachedPrimitiveScene,
  disposeSceneResources,
  retireResourceCacheGeneration,
} from "../../lib/map/cityResourceCache";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | "villas" | "water" | "rockery" | "tennis" | "recreation" | "entrance";
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 7, 0), camera: new THREE.Vector3(212, 142, 216), rider: new THREE.Vector3(12, 0.64, 91) },
  villas: { target: new THREE.Vector3(-71, 5, 4), camera: new THREE.Vector3(-164, 55, 91), rider: new THREE.Vector3(-52, 0.64, 18) },
  water: { target: new THREE.Vector3(8, 2, -5), camera: new THREE.Vector3(70, 46, 75), rider: new THREE.Vector3(21, 0.665, 18) },
  rockery: { target: new THREE.Vector3(-23, 3, 79), camera: new THREE.Vector3(28, 28, 121), rider: new THREE.Vector3(-11, 0.64, 88) },
  tennis: { target: new THREE.Vector3(-58, 2, -5), camera: new THREE.Vector3(-19, 31, 35), rider: new THREE.Vector3(-37, 0.665, -5) },
  recreation: { target: new THREE.Vector3(59, 2, -7), camera: new THREE.Vector3(105, 31, 35), rider: new THREE.Vector3(37, 0.665, -7) },
  entrance: { target: new THREE.Vector3(0, 4, 94), camera: new THREE.Vector3(67, 32, 145), rider: new THREE.Vector3(11, 0.64, 92) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "ESTATE 00", title: "澜谷御苑总览", summary: "260 × 200 m · 15 栋独立别墅", detail: "15栋低密度别墅分成五个林谷组团，沿一条连续曲线景观环路舒展布置；中央生态园、私家庭院和外围林带共同形成可核算的80%环境风景覆盖。" },
  { id: "villas", number: "VILLA 01", title: "私家庭院别墅", summary: "五组团 · 15户一户一院", detail: "全部住宅均复用带完整室内的坡顶独立别墅，每户配置10×6米围合前院、门柱花池、宅旁花园和独立透水车道，住宅保守退出道路边缘不少于4米。" },
  { id: "water", number: "WATER 02", title: "小桥流水水谷", summary: "曲流 / 生态湖 / 3座景观桥", detail: "蜿蜒浅溪串联中央湖面，三座缓拱小桥设置连续实体桥面、桥墩和1.1米防护栏，两岸以湿生植物和林下步行空间收边。" },
  { id: "rockery", number: "ROCK 03", title: "入口艺术假山", summary: "8组景石 · 三股循环跌水", detail: "小型叠石假山布置在礼宾入口后的林下景观岛，以不同尺度与角度的低多边形景石形成层次，三股动态跌水构成归家第一景。" },
  { id: "tennis", number: "SPORT 04", title: "生态园网球花园", summary: "中央生态园 · 1片完整球场", detail: "网球场设置完整边线、中线、球网、网柱与四侧防护围网，嵌入中央生态园西侧林地，避开全部别墅私家庭院与机动车环路。" },
  { id: "recreation", number: "LEISURE 05", title: "生态园户外娱乐", summary: "中央草坪 / 有顶活动台 / 休憩座椅", detail: "中央生态园东侧包含全龄活动草坪、实体支撑顶棚、户外小舞台、草坪游戏架和有支腿座椅，与网球花园由独立生态步道串联。" },
  { id: "entrance", number: "GATE 06", title: "礼宾入口", summary: "别墅门楼 · 门卫室 · 人车分流", detail: "复用精细别墅小区入口大门，以门卫室、石砌门柱、铁艺车门和独立人行门连接礼仪前场，再汇入连续曲线景观环路。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setGateOpen: (open: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function LuxuryVillaCommunityDemo() {
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.setAttribute("aria-label", "15栋豪华庭院别墅、连续曲线景观环路、80%生态风景、中央网球和户外娱乐场三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc7dcdf);
    scene.fog = new THREE.Fog(0xc7dcdf, 225, 455);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 560);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 14;
    controls.maxDistance = 410;
    controls.maxPolarAngle = Math.PI * 0.49;
    const renderBudget = createShowcaseRenderBudget({ renderer, host, controls });

    const ground = new THREE.Mesh(new THREE.CircleGeometry(260, 64), new THREE.MeshStandardMaterial({ color: 0xa5b59f, roughness: 0.99 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf5fbff, 0x4e6553, 2.15);
    const sun = new THREE.DirectionalLight(0xffebc9, 4.8);
    sun.position.set(-92, 126, 72);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -170;
    sun.shadow.camera.right = 170;
    sun.shadow.camera.top = 145;
    sun.shadow.camera.bottom = -135;
    sun.shadow.camera.far = 370;
    const fill = new THREE.DirectionalLight(0x8db7c3, 0.76);
    fill.position.set(88, 38, -72);
    scene.add(hemi, sun, fill);

    const cachedScene = createCachedPrimitiveScene(buildLowPolyLuxuryVillaCommunity);
    const community = cachedScene.root;
    const pointLightPool = createScenePointLightPool({
      name: "luxury-villa-showcase-light-pool",
      root: community,
    });
    applySceneShadowPolicy(community);
    const pair = createSceneShatterPair(community, { seed: 731, spread: 6.2 });
    const shatterMorph = new ShatterMorphController(0);
    scene.add(pair.root);
    queueMicrotask(() => setMetrics(measureModelGeometry(community)));

    const riderAnchor = new THREE.Group();
    riderAnchor.name = "luxury-villa-community-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.72;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    Promise.all([loader.loadAsync(TREE_URL), loader.loadAsync(RABBIT_RIDER_URL)]).then(([treeGltf, riderGltf]) => {
      if (disposed) return;
      const template = treeGltf.scene;
      template.name = "luxury-villa-community-reused-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let treeBounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(5.2 / Math.max(treeBounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      treeBounds = new THREE.Box3().setFromObject(template);
      const center = treeBounds.getCenter(new THREE.Vector3());
      template.position.set(-center.x, -treeBounds.min.y, -center.z);
      const prototype = new THREE.Group();
      prototype.name = "luxury-villa-community-tree-prototype";
      prototype.add(template);
      const anchors: THREE.Object3D[] = [];
      community.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "luxury-villa-community-reused-tree-anchor") anchors.push(object);
      });
      createInstancedPrototypeBatch({
        name: "luxury-villa-community-tree-render-batch",
        parent: community,
        prototype,
        placements: anchors,
        hidePlacementMeshes: false,
      });
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
      const color = on ? 0x101f2d : 0xc7dcdf;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 190 : 225, on ? 390 : 455);
      hemi.intensity = on ? 0.42 : 2.15;
      sun.intensity = on ? 0.2 : 4.8;
      sun.castShadow = !on;
      fill.intensity = on ? 0.28 : 0.76;
      renderer.toneMappingExposure = on ? 1.02 : 1.04;
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
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.42; },
    };
    setNightMode(false);
    community.userData.setAccessGateOpen(false);

    let frame = 0;
    const clock = new THREE.Clock();
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
  const toggleGate = () => { const next = !gateOpen; setGateOpen(next); apiRef.current?.setGateOpen(next); };
  const toggleShattered = () => { const next = !shattered; setShattered(next); apiRef.current?.setShattered(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>LANDSCAPE-LED VILLA ESTATE / 1M MODULAR PLAN</p><h1>澜谷御苑 · 豪华别墅小区</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考真实低密度别墅住区的“景观先行”组织方式，15栋一户一院别墅分成五个林谷组团，顺应连续曲线景观环路展开；68%种植绿地与12%水体、生态岸带共同形成可核算的80%绿化和环境风景覆盖。网球场与户外娱乐区共同嵌入中央生态园，小桥流水、入口假山和林下生态步道贯穿全区。每栋别墅均避让道路并设置10×6米围合前院，树木、花箱、路灯和别墅入口门复用已有模型，小兔子骑车作为2.40米整体比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.danger : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复完整别墅小区" : "破碎完整别墅小区"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白天" : "查看园林夜景"}</button>
            <button type="button" className={gateOpen ? styles.active : ""} aria-pressed={gateOpen} onClick={toggleGate}>{gateOpen ? "关闭礼宾大门" : "打开礼宾大门"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止旋转" : "自动旋转"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回总览</button>
          </div>
        </div>
      </header>
      <div className={styles.status}>15 栋独立别墅 · 五个林谷组团 · 80%生态景观 · 3座小桥 · {referenceReady ? "小兔子骑车 2.40 m" : "比例模型加载中"}</div>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      {metrics ? <div className={styles.metrics}><span>LUXURY VILLA ESTATE</span><strong>{metrics.size.x.toFixed(0)} × {metrics.size.y.toFixed(0)} × {metrics.size.z.toFixed(0)} m</strong><small>{metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 正常 / 独立破碎双版本</small></div> : null}
      <nav className={styles.zoneRail} aria-label="豪华别墅小区分区导览">
        {ZONES.map((zone) => <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.active : ""}`} onClick={() => chooseFocus(zone.id)}><span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><p>{zone.detail}</p></button>)}
      </nav>
    </main>
  );
}
