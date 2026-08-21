"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  createSceneShatterPair,
  measureModelGeometry,
  type ModelGeometryMetrics,
} from "../../lib/map/cityFurnitureShatter";
import {
  buildLowPolyFoodProcessingPlant,
  buildLowPolyMechanizedFactory,
  buildLowPolyTechnologyPark,
  type ModernIndustrialDistrictModel,
  type ModernIndustrialVariant,
} from "../../lib/map/modernIndustrialDistricts";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import { createCachedPrimitiveScene, disposeSceneResources, retireResourceCacheGeneration } from "../../lib/map/cityResourceCache";
import { createShowcaseRenderBudget, hasContinuousShowcaseActivity } from "../../lib/map/showcaseRenderBudget";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | "production" | "warehouse" | "solar" | "logistics" | "energy";

type VariantPresentation = Readonly<{
  title: string;
  eyebrow: string;
  intro: string;
  status: string;
  modelLabel: string;
  build: () => ModernIndustrialDistrictModel;
  focus: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }>;
  zones: ReadonlyArray<{ id: Focus; number: string; title: string; summary: string; detail: string }>;
}>;

const sharedZones = {
  warehouse: { id: "warehouse" as const, number: "WAREHOUSE 03", title: "自动化立体仓库", summary: "96货格 · 2台堆垛机 · WMS", detail: "高位货架、双巷道堆垛机、智能库存系统和自动出入库缓冲区组成完整物流核心。" },
  solar: { id: "solar" as const, number: "ENERGY 04", title: "屋顶光伏微电网", summary: "多栋厂房屋顶 · 短支架 · 储能", detail: "全部光伏组件安装在生产厂房与研发厂房屋顶，通过短支架形成统一倾角，不再独立占用厂区地面；系统接入园区微电网、储能与热回收设施。" },
  logistics: { id: "logistics" as const, number: "LOGISTICS 05", title: "无人物流系统", summary: "6台AGV · 8个快充位", detail: "无人搬运车沿内部物流主轴循环，智能门禁、车牌识别与独立人行入口共同保证人车分流。" },
  energy: { id: "energy" as const, number: "UTILITY 06", title: "智慧能源中心", summary: "4MWh储能 · 热回收", detail: "模块化电池柜、能源管理系统和热回收装置集中布置在独立设备区，并退出主要生产与运输流线。" },
};

const PRESENTATIONS: Record<ModernIndustrialVariant, VariantPresentation> = {
  "technology-park": {
    title: "云岚智谷 · 超现代科技园区",
    eyebrow: "SMART TECHNOLOGY CAMPUS / 1M MODULAR SITE",
    intro: "260×180米独立科技园区以创新塔楼、洁净研发实验室、机器人原型车间和数据中心组成研发制造闭环。园区配置2条柔性自动化产线、自动化立体仓库、无人搬运车、光伏微电网、储能中心与无人机巡检坪；所有建筑和道路严格使用1×1米地图格组织，可直接作为大型地图模块放置。",
    status: "创新研发 · 数据中心 · 机器人原型制造",
    modelLabel: "SMART TECHNOLOGY PARK",
    build: buildLowPolyTechnologyPark,
    focus: {
      overview: { target: new THREE.Vector3(0, 8, 0), camera: new THREE.Vector3(205, 132, 212), rider: new THREE.Vector3(14, 0.7, 77) },
      production: { target: new THREE.Vector3(-76, 3.8, -35), camera: new THREE.Vector3(-39, 16, 4), rider: new THREE.Vector3(-40, 0.7, -14) },
      warehouse: { target: new THREE.Vector3(72, 6, -35), camera: new THREE.Vector3(139, 38, 12), rider: new THREE.Vector3(45, 0.7, -8) },
      solar: { target: new THREE.Vector3(-55, 13, -4), camera: new THREE.Vector3(30, 47, 55), rider: new THREE.Vector3(13, 0.7, -52) },
      logistics: { target: new THREE.Vector3(-104, 4, 65), camera: new THREE.Vector3(-154, 31, 112), rider: new THREE.Vector3(-86, 0.7, 66) },
      energy: { target: new THREE.Vector3(107, 4, -72), camera: new THREE.Vector3(152, 27, -25), rider: new THREE.Vector3(92, 0.7, -59) },
    },
    zones: [
      { id: "overview", number: "CAMPUS 00", title: "智慧科技园总览", summary: "260 × 180 m · 研发制造一体", detail: "研发、数据、机器人原型、智慧仓储、清洁能源和无人物流六套系统围绕十字物流主轴布置。" },
      { id: "production", number: "ROBOTICS 01", title: "机器人原型中心", summary: "2条柔性产线 · 6套机械臂", detail: "可视化玻璃厂房内设置传感器输送线、机器人工作站和动态载具，形成小批量柔性试制空间。" },
      { id: "warehouse", ...sharedZones.warehouse }, { id: "solar", ...sharedZones.solar }, { id: "logistics", ...sharedZones.logistics }, { id: "energy", ...sharedZones.energy },
    ],
  },
  "food-processing-plant": {
    title: "澄源智造 · 现代食品加工厂",
    eyebrow: "SMART FOOD FACTORY / CLEAN-CHAIN CAMPUS",
    intro: "280×200米现代食品加工厂按照原料接收、清洁加工、品质检测、自动包装、冷链存储与成品出货的单向流程设计。厂区配置3条自动化流水线、食品级CIP罐区、分温区自动冷库、水循环处理、光伏微电网及无人物流系统，并明确分离洁净生产、普通物流和人员入口。",
    status: "洁净加工 · 自动包装 · 全程冷链",
    modelLabel: "SMART FOOD PROCESSING PLANT",
    build: buildLowPolyFoodProcessingPlant,
    focus: {
      overview: { target: new THREE.Vector3(0, 7, 0), camera: new THREE.Vector3(220, 142, 225), rider: new THREE.Vector3(14, 0.7, 87) },
      production: { target: new THREE.Vector3(-83, 3.8, -28), camera: new THREE.Vector3(-45, 16, 16), rider: new THREE.Vector3(-47, 0.7, -4) },
      warehouse: { target: new THREE.Vector3(83, 6, 36), camera: new THREE.Vector3(153, 42, 94), rider: new THREE.Vector3(49, 0.7, 57) },
      solar: { target: new THREE.Vector3(-20, 13, 1), camera: new THREE.Vector3(83, 51, 84), rider: new THREE.Vector3(13, 0.7, -62) },
      logistics: { target: new THREE.Vector3(-114, 4, 75), camera: new THREE.Vector3(-169, 32, 126), rider: new THREE.Vector3(-96, 0.7, 77) },
      energy: { target: new THREE.Vector3(117, 4, -82), camera: new THREE.Vector3(165, 29, -31), rider: new THREE.Vector3(101, 0.7, -67) },
    },
    zones: [
      { id: "overview", number: "FACTORY 00", title: "食品工厂总览", summary: "280 × 200 m · 清洁单向流程", detail: "从原料接收至冷链出货的完整动线，避免原料、人员和成品流线交叉。" },
      { id: "production", number: "PROCESS 01", title: "洁净加工与包装", summary: "3条自动线 · CIP系统", detail: "食品级设备、自动灌装包装、质量实验室与清洗消毒系统形成可追溯的现代生产核心。" },
      { id: "warehouse", number: "COLD 03", title: "自动化冷链仓库", summary: "-24 / -2 / 4℃三区", detail: "96货格立体仓库叠加分温区制冷、自动月台门和双堆垛机，完成低温缓冲与成品发运。" },
      { id: "solar", ...sharedZones.solar }, { id: "logistics", ...sharedZones.logistics }, { id: "energy", ...sharedZones.energy },
    ],
  },
  "mechanized-factory": {
    title: "擎岳智造 · 机械化工厂",
    eyebrow: "ADVANCED MECHANIZED FACTORY / DIGITAL TWIN SITE",
    intro: "300×210米超现代机械化工厂将数控加工、机器人焊接、自动总装、封闭喷涂与智能仓储组成数字化生产链。厂区配置8台CNC加工中心、3条自动化流水线、20吨防摇摆龙门吊、AGV物流、多栋厂房屋顶光伏与4MWh储能中心，适合重型装备和大型构件制造。",
    status: "数控加工 · 机器人焊接 · 自动总装",
    modelLabel: "ADVANCED MECHANIZED FACTORY",
    build: buildLowPolyMechanizedFactory,
    focus: {
      overview: { target: new THREE.Vector3(0, 8, 0), camera: new THREE.Vector3(235, 148, 238), rider: new THREE.Vector3(14, 0.7, 92) },
      production: { target: new THREE.Vector3(-84, 4, 34), camera: new THREE.Vector3(-45, 18, 76), rider: new THREE.Vector3(-51, 0.7, 16) },
      warehouse: { target: new THREE.Vector3(86, 6, -48), camera: new THREE.Vector3(161, 42, 10), rider: new THREE.Vector3(50, 0.7, -20) },
      solar: { target: new THREE.Vector3(-9, 17, 2), camera: new THREE.Vector3(104, 58, 96), rider: new THREE.Vector3(13, 0.7, -67) },
      logistics: { target: new THREE.Vector3(-124, 4, 80), camera: new THREE.Vector3(-182, 34, 135), rider: new THREE.Vector3(-106, 0.7, 82) },
      energy: { target: new THREE.Vector3(127, 4, -87), camera: new THREE.Vector3(178, 30, -34), rider: new THREE.Vector3(110, 0.7, -72) },
    },
    zones: [
      { id: "overview", number: "WORKS 00", title: "机械工厂总览", summary: "300 × 210 m · 重型数字工厂", detail: "加工、焊接、总装、喷涂、智能仓储与能源设施形成占地广阔的现代制造园区。" },
      { id: "production", number: "MACHINING 01", title: "数控与机器人制造", summary: "8台CNC · 3条自动线", detail: "数字孪生CNC单元、机器人焊接线、总装输送线与20吨自动防摇摆龙门吊协同生产。" },
      { id: "warehouse", ...sharedZones.warehouse }, { id: "solar", ...sharedZones.solar }, { id: "logistics", ...sharedZones.logistics }, { id: "energy", ...sharedZones.energy },
    ],
  },
};

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setProduction: (running: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function IndustrialZoneDemo({ variant }: { variant: ModernIndustrialVariant }) {
  const presentation = useMemo(() => PRESENTATIONS[variant], [variant]);
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [production, setProduction] = useState(true);
  const [shattered, setShattered] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [referenceReady, setReferenceReady] = useState(false);
  const [metrics, setMetrics] = useState<ModelGeometryMetrics | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.setAttribute("aria-label", `${presentation.title}三维独立工业区域，包含光伏发电、自动化流水线、自动化仓库与小兔子骑车比例参考`);
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc3d6dc);
    scene.fog = new THREE.Fog(0xc3d6dc, 260, 520);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 650);
    camera.position.copy(presentation.focus.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(presentation.focus.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 16;
    controls.maxDistance = 470;
    controls.maxPolarAngle = Math.PI * 0.49;
    const renderBudget = createShowcaseRenderBudget({ renderer, host, controls });

    const ground = new THREE.Mesh(new THREE.CircleGeometry(350, 64), new THREE.MeshStandardMaterial({ color: 0x829184, roughness: 0.99 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf4fbff, 0x405044, 2.1);
    const sun = new THREE.DirectionalLight(0xffebc9, 4.7);
    sun.position.set(-110, 150, 95);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -190;
    sun.shadow.camera.right = 190;
    sun.shadow.camera.top = 155;
    sun.shadow.camera.bottom = -155;
    sun.shadow.camera.far = 420;
    const fill = new THREE.DirectionalLight(0x83b8c8, 0.7);
    fill.position.set(110, 48, -92);
    scene.add(hemi, sun, fill);

    const cachedScene = createCachedPrimitiveScene(presentation.build);
    const district = cachedScene.root;
    const pair = createSceneShatterPair(district, { seed: 812 + Object.keys(PRESENTATIONS).indexOf(variant), spread: 6 });
    const shatterMorph = new ShatterMorphController(0);
    scene.add(pair.root);
    queueMicrotask(() => setMetrics(measureModelGeometry(district)));

    const riderAnchor = new THREE.Group();
    riderAnchor.name = `${variant}-rabbit-rider-reference-anchor`;
    riderAnchor.position.copy(presentation.focus.overview.rider);
    riderAnchor.rotation.y = -0.72;
    scene.add(riderAnchor);
    let disposed = false;
    new GLTFLoader().loadAsync(RABBIT_RIDER_URL).then((gltf) => {
      if (disposed) return;
      riderAnchor.add(prepareRabbitRiderReference(gltf.scene));
      setReferenceReady(true);
    }).catch(() => setReferenceReady(false));

    const desiredTarget = presentation.focus.overview.target.clone();
    const desiredCamera = presentation.focus.overview.camera.clone();
    let focusBlend = 0;
    let interacting = false;
    let rotating = false;
    let productionRunning = true;
    controls.addEventListener("start", () => { interacting = true; focusBlend = 0; });
    controls.addEventListener("end", () => { interacting = false; });
    const setNightMode = (on: boolean) => {
      const color = on ? 0x101d27 : 0xc3d6dc;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 225 : 260, on ? 460 : 520);
      hemi.intensity = on ? 0.46 : 2.1;
      sun.intensity = on ? 0.16 : 4.7;
      sun.castShadow = !on;
      fill.intensity = on ? 0.32 : 0.7;
      renderer.toneMappingExposure = on ? 1.08 : 1.04;
      district.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => {
        desiredTarget.copy(presentation.focus[next].target);
        desiredCamera.copy(presentation.focus[next].camera);
        riderAnchor.position.copy(presentation.focus[next].rider);
        focusBlend = 1;
      },
      setNight: setNightMode,
      setProduction: (running) => {
        productionRunning = running;
        district.userData.setProductionRunning(running);
      },
      setShattered: (on) => shatterMorph.animateTo(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.38; },
    };
    setNightMode(false);
    district.userData.setProductionRunning(true);

    let frame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      district.userData.update(delta);
      const morphChanged = shatterMorph.update(delta);
      if (morphChanged) pair.setAmount(shatterMorph.getAmount());
      if (!interacting && focusBlend > 0.001) {
        controls.target.lerp(desiredTarget, 0.085);
        if (!rotating) camera.position.lerp(desiredCamera, 0.065);
        focusBlend *= 0.91;
      }
      const controlsChanged = controls.update();
      renderBudget.render(scene, camera, hasContinuousShowcaseActivity({
        autoRotate: rotating, focusBlend, morphChanged,
        internalAnimation: productionRunning, controlsChanged,
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
  }, [presentation, variant]);

  const chooseFocus = (next: Focus) => { setFocus(next); apiRef.current?.focus(next); };
  const toggleNight = () => { const next = !night; setNight(next); apiRef.current?.setNight(next); };
  const toggleProduction = () => { const next = !production; setProduction(next); apiRef.current?.setProduction(next); };
  const toggleShattered = () => { const next = !shattered; setShattered(next); apiRef.current?.setShattered(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>{presentation.eyebrow}</p><h1>{presentation.title}</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>{presentation.intro} 小兔子骑车模型作为2.40米整体比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.danger : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复完整工业区" : "破碎完整工业区"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白天" : "查看智慧夜景"}</button>
            <button type="button" className={!production ? styles.active : ""} aria-pressed={!production} onClick={toggleProduction}>{production ? "暂停自动化生产" : "启动自动化生产"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止旋转" : "自动旋转"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回总览</button>
          </div>
        </div>
      </header>
      <div className={styles.status}>{presentation.status} · {production ? "自动线运行中" : "自动线已暂停"} · {referenceReady ? "小兔子骑车 2.40 m" : "比例模型加载中"}</div>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      {metrics ? <div className={styles.metrics}><span>{presentation.modelLabel}</span><strong>{metrics.size.x.toFixed(0)} × {metrics.size.y.toFixed(0)} × {metrics.size.z.toFixed(0)} m</strong><small>{metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 正常 / 独立破碎双版本</small></div> : null}
      <nav className={styles.zoneRail} aria-label={`${presentation.title}分区导览`}>
        {presentation.zones.map((zone) => <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.active : ""}`} onClick={() => chooseFocus(zone.id)}><span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><p>{zone.detail}</p></button>)}
      </nav>
    </main>
  );
}
