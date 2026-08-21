"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildDetailedElectricCityBus, type CityBusModel } from "../../lib/map/cityBus";
import { buildDetailedSchoolBus, type SchoolBusModel } from "../../lib/map/citySchoolBus";
import {
  buildDetailedElectricTaxi,
  buildDetailedPrivateSedan,
  buildDetailedPrivateSuv,
  type DetailedRoadVehicle,
} from "../../lib/map/cityRoadVehicles";
import { createFurnitureShatterPair, measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import { disposeSceneResources } from "../../lib/map/cityResourceCache";
import { createShowcaseRenderBudget, hasContinuousShowcaseActivity } from "../../lib/map/showcaseRenderBudget";
import styles from "./TransportationDemo.module.css";

type VehicleId = "bus" | "schoolBus" | "taxi" | "sedan" | "suv";
type Focus = "all" | VehicleId;
type InteractiveVehicle = CityBusModel | SchoolBusModel | DetailedRoadVehicle;
type VehicleMetrics = ModelGeometryMetrics & { shatteredFaceCount: number };

const VEHICLE_POSITIONS: Record<VehicleId, THREE.Vector3> = {
  bus: new THREE.Vector3(-1.1, 0.16, -5.4),
  schoolBus: new THREE.Vector3(0.2, 0.16, 8.35),
  taxi: new THREE.Vector3(-5.4, 0.16, 2.35),
  sedan: new THREE.Vector3(0, 0.16, 2.35),
  suv: new THREE.Vector3(5.5, 0.16, 2.35),
};

const FOCUS = {
  all: { target: new THREE.Vector3(0, 1.25, 0.4), camera: new THREE.Vector3(21, 13.6, 26) },
  bus: { target: new THREE.Vector3(-1.1, 1.75, -5.4), camera: new THREE.Vector3(14.4, 7.5, 8.2) },
  schoolBus: { target: new THREE.Vector3(0.2, 1.55, 8.35), camera: new THREE.Vector3(13.8, 7.1, 17.4) },
  taxi: { target: new THREE.Vector3(-5.4, 1.05, 2.35), camera: new THREE.Vector3(0.1, 4.1, 8.0) },
  sedan: { target: new THREE.Vector3(0, 1.0, 2.35), camera: new THREE.Vector3(5.7, 3.9, 8.0) },
  suv: { target: new THREE.Vector3(5.5, 1.1, 2.35), camera: new THREE.Vector3(11.4, 4.5, 8.3) },
} as const;

const RIDER_FOREGROUND = new THREE.Vector3(-8.4, 0.2, 11.6);

const VEHICLE_CARDS: Array<{ id: Focus; number: string; title: string; summary: string; details: string[] }> = [
  { id: "all", number: "MOBILITY 00", title: "城市交通工具总览", summary: "公交 · 校车 · 出租车 · 小轿车 · SUV", details: ["五种不同尺度与用途的精细城市载具", "全部包含正常 / 破碎双版本"] },
  { id: "bus", number: "VEHICLE 01", title: "纯电城市公交", summary: "11.8 m · 24 座 · 双门低地板", details: ["完整驾驶区、乘客舱与轮椅位", "车门、坡板、灯光和透明风挡交互"] },
  { id: "schoolBus", number: "VEHICLE 02", title: "专用校车", summary: "9.6 m · 20 座 · 长头国标校车", details: ["高靠背座椅、安全带与八灯警示", "乘客门、后应急门和停车警示臂"] },
  { id: "taxi", number: "VEHICLE 03", title: "精细电动出租车", summary: "4.76 m · 5 座 · 城市营运配置", details: ["顶灯、计价器、司机证件与后排服务屏", "四门、后备厢和完整乘客座舱"] },
  { id: "sedan", number: "VEHICLE 04", title: "私家小轿车", summary: "4.68 m · 5 座 · 低重心流线车身", details: ["全景天窗、数字仪表与中央触控屏", "独立刹车盘、卡钳、轮毂与后备厢"] },
  { id: "suv", number: "VEHICLE 05", title: "私家 SUV", summary: "4.86 m · 5 座 · 高离地间隙", details: ["车顶行李架、前后护板与宽体轮拱", "大尺寸尾门、行李区和全景天窗"] },
];

type DemoApi = {
  setNight: (night: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setDoorsOpen: (open: boolean) => void;
  setCargoOpen: (open: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  focus: (focus: Focus) => void;
};

export function TransportationDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [night, setNight] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [cargoOpen, setCargoOpen] = useState(false);
  const [shattered, setShattered] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [focus, setFocus] = useState<Focus>("all");
  const [operationsCollapsed, setOperationsCollapsed] = useState(false);
  const [metrics, setMetrics] = useState<Record<Focus, VehicleMetrics> | null>(null);
  const [referenceReady, setReferenceReady] = useState(false);

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
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-label", "公交车、校车、出租车、私家小轿车和SUV精细模型展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdce8e5);
    scene.fog = new THREE.Fog(0xdce8e5, 36, 72);
    const camera = new THREE.PerspectiveCamera(39, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 90);
    camera.position.copy(FOCUS.all.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.all.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 3.4;
    controls.maxDistance = 54;
    controls.maxPolarAngle = Math.PI * 0.49;
    const renderBudget = createShowcaseRenderBudget({ renderer, host, controls });

    const ground = new THREE.Mesh(new THREE.CircleGeometry(26, 64), new THREE.MeshStandardMaterial({ color: 0xbcc8c4, roughness: 0.96 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    const displayPad = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.9, 0.18, 64), new THREE.MeshStandardMaterial({ color: 0xd7d9d1, roughness: 0.9 }));
    displayPad.position.y = 0.05;
    displayPad.receiveShadow = true;
    scene.add(ground, displayPad);

    const hemi = new THREE.HemisphereLight(0xf7fbff, 0x52625d, 1.8);
    const sun = new THREE.DirectionalLight(0xfff0cf, 4.5);
    sun.position.set(-13, 20, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -10;
    const fill = new THREE.DirectionalLight(0x8dc4d0, 0.72);
    fill.position.set(15, 8, -10);
    scene.add(hemi, sun, fill);

    const riderAnchor = new THREE.Group();
    riderAnchor.name = "game-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(RIDER_FOREGROUND);
    riderAnchor.rotation.y = Math.atan2(FOCUS.all.camera.x - riderAnchor.position.x, FOCUS.all.camera.z - riderAnchor.position.z);
    scene.add(riderAnchor);
    let disposed = false;
    new GLTFLoader().loadAsync(RABBIT_RIDER_URL)
      .then((gltf) => {
        if (disposed) return;
        riderAnchor.add(prepareRabbitRiderReference(gltf.scene));
        setReferenceReady(true);
      })
      .catch(() => setReferenceReady(false));

    const vehicles = {
      bus: buildDetailedElectricCityBus(),
      schoolBus: buildDetailedSchoolBus(),
      taxi: buildDetailedElectricTaxi(),
      sedan: buildDetailedPrivateSedan(),
      suv: buildDetailedPrivateSuv(),
    } satisfies Record<VehicleId, InteractiveVehicle>;
    const seeds: Record<VehicleId, number> = { bus: 719, schoolBus: 787, taxi: 733, sedan: 751, suv: 769 };
    const pairs = {} as Record<VehicleId, ReturnType<typeof createFurnitureShatterPair>>;
    const morphs = {} as Record<VehicleId, ShatterMorphController>;
    const measured = {} as Record<VehicleId, VehicleMetrics>;
    const overallBounds = new THREE.Box3();
    let totalNormalFaces = 0;
    let totalShatteredFaces = 0;

    (Object.keys(vehicles) as VehicleId[]).forEach((id) => {
      const normalMetrics = measureModelGeometry(vehicles[id]);
      const pair = createFurnitureShatterPair(vehicles[id], { seed: seeds[id], trianglesPerShard: id === "bus" || id === "schoolBus" ? 9 : 7, spread: id === "bus" || id === "schoolBus" ? 1.28 : 0.72 });
      pair.root.position.copy(VEHICLE_POSITIONS[id]);
      scene.add(pair.root);
      pairs[id] = pair;
      morphs[id] = new ShatterMorphController(0);
      const shatteredMetrics = measureModelGeometry(pair.shattered);
      measured[id] = { ...normalMetrics, shatteredFaceCount: shatteredMetrics.faceCount };
      totalNormalFaces += normalMetrics.faceCount;
      totalShatteredFaces += shatteredMetrics.faceCount;
      pair.normal.updateWorldMatrix(true, true);
      overallBounds.union(new THREE.Box3().setFromObject(pair.normal));
    });
    setMetrics({
      all: { size: overallBounds.getSize(new THREE.Vector3()), faceCount: totalNormalFaces, shatteredFaceCount: totalShatteredFaces },
      ...measured,
    });

    const desiredTarget = FOCUS.all.target.clone();
    const desiredCamera = FOCUS.all.camera.clone();
    let activeFocus: Focus = "all";
    let rotating = false;
    let interacting = false;
    let focusBlend = 0;
    controls.addEventListener("start", () => { interacting = true; focusBlend = 0; });
    controls.addEventListener("end", () => { interacting = false; });

    const resetVehicleInteractions = () => {
      vehicles.bus.userData.setDoorsOpen(false);
      vehicles.bus.userData.setRampDeployed(false);
      vehicles.bus.userData.setInteriorCutaway(false);
      vehicles.schoolBus.userData.setDoorsOpen(false);
      vehicles.schoolBus.userData.setStopArmExtended(false);
      vehicles.schoolBus.userData.setInteriorCutaway(false);
      for (const id of ["taxi", "sedan", "suv"] as const) {
        const model = vehicles[id] as DetailedRoadVehicle;
        model.userData.setDoorsOpen(false);
        model.userData.setTrunkOpen(false);
        model.userData.setInteriorCutaway(false);
      }
    };
    const activeVehicle = () => activeFocus === "all" ? null : vehicles[activeFocus];
    const setNightMode = (on: boolean) => {
      scene.background = new THREE.Color(on ? 0x10242d : 0xdce8e5);
      scene.fog = new THREE.Fog(on ? 0x10242d : 0xdce8e5, on ? 30 : 36, on ? 62 : 72);
      hemi.intensity = on ? 0.42 : 1.8;
      sun.intensity = on ? 0.32 : 4.5;
      fill.intensity = on ? 0.22 : 0.72;
      renderer.toneMappingExposure = on ? 0.92 : 1.08;
      (Object.keys(vehicles) as VehicleId[]).forEach((id) => vehicles[id].userData.setPowered(on));
    };
    const focusVehicle = (next: Focus) => {
      activeFocus = next;
      resetVehicleInteractions();
      desiredTarget.copy(FOCUS[next].target);
      desiredCamera.copy(FOCUS[next].camera);
      focusBlend = 1;
    };
    apiRef.current = {
      setNight: setNightMode,
      setCutaway: (on) => activeVehicle()?.userData.setInteriorCutaway(on),
      setDoorsOpen: (open) => activeVehicle()?.userData.setDoorsOpen(open),
      setCargoOpen: (open) => {
        if (activeFocus === "bus") vehicles.bus.userData.setRampDeployed(open);
        else if (activeFocus === "schoolBus") vehicles.schoolBus.userData.setStopArmExtended(open);
        else if (activeFocus !== "all") (vehicles[activeFocus] as DetailedRoadVehicle).userData.setTrunkOpen(open);
      },
      setShattered: (on) => (Object.keys(morphs) as VehicleId[]).forEach((id) => morphs[id].animateTo(on)),
      setAutoRotate: (enabled) => {
        rotating = enabled;
        controls.autoRotate = enabled;
        controls.autoRotateSpeed = 0.62;
      },
      focus: focusVehicle,
    };
    setNightMode(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      let morphChanged = false;
      (Object.keys(morphs) as VehicleId[]).forEach((id) => {
        if (!morphs[id].update(dt)) return;
        pairs[id].setAmount(morphs[id].getAmount());
        morphChanged = true;
      });
      if (!interacting && focusBlend > 0.001) {
        controls.target.lerp(desiredTarget, 0.1);
        if (!rotating) camera.position.lerp(desiredCamera, 0.075);
        focusBlend *= 0.9;
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
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const chooseFocus = (next: Focus) => {
    setFocus(next);
    setCutaway(false);
    setDoorsOpen(false);
    setCargoOpen(false);
    apiRef.current?.focus(next);
  };
  const toggleNight = () => { const next = !night; setNight(next); apiRef.current?.setNight(next); };
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleDoors = () => { const next = !doorsOpen; setDoorsOpen(next); apiRef.current?.setDoorsOpen(next); };
  const toggleCargo = () => { const next = !cargoOpen; setCargoOpen(next); apiRef.current?.setCargoOpen(next); };
  const toggleShattered = () => { const next = !shattered; setShattered(next); apiRef.current?.setShattered(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };
  const canOperate = focus !== "all";
  const currentMetrics = metrics?.[focus];
  const cargoLabel = focus === "bus"
    ? (cargoOpen ? "收回无障碍坡板" : "展开无障碍坡板")
    : focus === "schoolBus"
      ? (cargoOpen ? "收回停车警示臂" : "展开停车警示臂")
      : (cargoOpen ? "关闭后备厢" : "打开后备厢");

  return (
    <main className={styles.shell}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${operationsCollapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>URBAN MOBILITY / DETAILED VEHICLE STUDY</p><h1>交通工具 · 精细城市载具</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!operationsCollapsed} aria-controls="transportation-demo-operations" onClick={() => setOperationsCollapsed((current) => !current)}>{operationsCollapsed ? "展开操作 ↓" : "收起操作 ↑"}</button>
        </div>
        <div id="transportation-demo-operations" hidden={operationsCollapsed}>
          <p className={styles.intro}>五种独立城市载具均包含完整外观、透明玻璃、乘客舱、驾驶区及可操作部件。先选择下方车型，再检查车门、内饰与警示装置。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.danger : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复全部载具" : "破碎全部载具"}</button>
            <button type="button" disabled={!canOperate} className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整车身" : "查看精细内饰"}</button>
            <button type="button" disabled={!canOperate} className={doorsOpen ? styles.active : ""} aria-pressed={doorsOpen} onClick={toggleDoors}>{doorsOpen ? "关闭全部车门" : "打开全部车门"}</button>
            <button type="button" disabled={!canOperate} className={cargoOpen ? styles.active : ""} aria-pressed={cargoOpen} onClick={toggleCargo}>{cargoLabel}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换晴天" : "查看夜间灯光"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止旋转" : "自动旋转"}</button>
            <button type="button" onClick={() => chooseFocus("all")}>全部车型</button>
          </div>
        </div>
      </header>

      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}>5 组正常 / 破碎模型 · {shattered ? "破碎态" : cutaway ? "内饰剖面" : "完整外观"} · {referenceReady ? "现有骑车兔子整体外廓约 2.40 m" : "骑车兔子加载中"}</div>
      <nav className={styles.detailCards} aria-label="选择交通工具模型">
        {VEHICLE_CARDS.map((card) => (
          <button key={card.id} type="button" className={`${styles.detailCard} ${focus === card.id ? styles.selected : ""}`} onClick={() => chooseFocus(card.id)}>
            <span>{card.number}</span><strong>{card.title}</strong><small>{card.summary}</small><ul>{card.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          </button>
        ))}
      </nav>
      <aside className={styles.metrics} aria-label="当前交通工具模型参数">
        <span>{focus === "all" ? "SHOWCASE SIZE" : "MODEL SIZE"}</span>
        <strong>{currentMetrics ? `${currentMetrics.size.x.toFixed(2)} × ${currentMetrics.size.y.toFixed(2)} × ${currentMetrics.size.z.toFixed(2)} m` : "计算中…"}</strong>
        <small>{currentMetrics ? `正常 ${currentMetrics.faceCount.toLocaleString("zh-CN")} / 破碎 ${currentMetrics.shatteredFaceCount.toLocaleString("zh-CN")} 三角面` : "正在统计模型面数"}</small>
      </aside>
    </main>
  );
}
