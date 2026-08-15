"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { buildLowPolyCityCenter, type CityCenterZone } from "../../lib/map/cityCenter";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | CityCenterZone;
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 15, 0), camera: new THREE.Vector3(175, 126, 190), rider: new THREE.Vector3(0, 0.62, 78) },
  landmark: { target: new THREE.Vector3(5, 25, -16), camera: new THREE.Vector3(99, 71, 89), rider: new THREE.Vector3(1, 0.62, 35) },
  transit: { target: new THREE.Vector3(-64, 8, -39), camera: new THREE.Vector3(-142, 47, 12), rider: new THREE.Vector3(-57, 0.62, -10) },
  bus: { target: new THREE.Vector3(59, 6, -47), camera: new THREE.Vector3(137, 45, 10), rider: new THREE.Vector3(51, 0.62, -16) },
  taxi: { target: new THREE.Vector3(72, 4, 31), camera: new THREE.Vector3(138, 35, 82), rider: new THREE.Vector3(48, 0.62, 31) },
  map: { target: new THREE.Vector3(0, 7, 67), camera: new THREE.Vector3(62, 29, 118), rider: new THREE.Vector3(0, 0.62, 78) },
  plaza: { target: new THREE.Vector3(4, 5, 14), camera: new THREE.Vector3(87, 48, 86), rider: new THREE.Vector3(-4, 0.62, 31) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "CENTER 00", title: "云港城市中心总览", summary: "210 × 165 m · 城市地标 / 四类独立入口设施", detail: "高密度城市建筑围绕中央公共空间组织，轨道、公交、出租车与地图入口均占据独立地块，并通过无车步行轴连接。" },
  { id: "landmark", number: "LANDMARK 01", title: "城市地标建筑群", summary: "64 m 地标塔 · 3 栋混合办公商业塔楼", detail: "玻璃塔楼、公共裙房和下沉商业围合城市天际线核心，统一朝向中央市民广场。" },
  { id: "transit", number: "HUB 02", title: "综合交通枢纽", summary: "独立站厅 · 4 条轨道 · 4 个站台", detail: "轨道与地铁换乘枢纽拥有双入口、独立集散厅、实时出发屏和带雨棚站台，不与公交车道混用。" },
  { id: "bus", number: "BUS 03", title: "公共汽车总站", summary: "独立总站 · 8 个站台 · 6 辆公交车", detail: "锯齿式公交泊位、连续候车雨棚和独立进出站口形成完整总站，与出租车候客区物理分离。" },
  { id: "taxi", number: "TAXI 04", title: "出租车停车点", summary: "独立候客岛 · 12 个车位 · 8 辆出租车", detail: "双排出租车候客位、遮雨上客岛和排队空间位于公交总站外侧，车辆无需穿越步行广场。" },
  { id: "map", number: "MAP 05", title: "城市地图入口", summary: "独立门户 · 2 块地图屏 · 游客信息厅", detail: "南侧地图入口以 16 米净宽门户衔接城市道路，展示城区总图和交通网络，并配有无障碍游客信息厅。" },
  { id: "plaza", number: "PLAZA 06", title: "中央市民广场", summary: "动态喷泉 · 浅下沉商业庭院 · 步行集散轴", detail: "无车广场串联四类换乘设施和地标建筑，树阵、花坛、餐车与照明均复用城市饰品模型。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setRushHour: (active: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function CityCenterDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [rushHour, setRushHour] = useState(false);
  const [cutaway, setCutaway] = useState(false);
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
    renderer.domElement.setAttribute("aria-label", "包含城市地标、综合交通枢纽、公交总站、出租车候客点和地图入口的城市中心三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc8dbe0);
    scene.fog = new THREE.Fog(0xc8dbe0, 220, 440);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 560);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 13;
    controls.maxDistance = 370;
    controls.maxPolarAngle = Math.PI * 0.49;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(198, 64), new THREE.MeshStandardMaterial({ color: 0xa7b6a5, roughness: 0.98 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf8fbff, 0x526555, 2.05);
    const sun = new THREE.DirectionalLight(0xffead0, 4.65);
    sun.position.set(-85, 118, 65);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 150;
    sun.shadow.camera.top = 135;
    sun.shadow.camera.bottom = -125;
    sun.shadow.camera.far = 360;
    const fill = new THREE.DirectionalLight(0x91b9cb, 0.75);
    fill.position.set(85, 38, -76);
    scene.add(hemi, sun, fill);

    const cityCenter = buildLowPolyCityCenter();
    scene.add(cityCenter);
    setMetrics(measureModelGeometry(cityCenter));
    const riderAnchor = new THREE.Group();
    riderAnchor.name = "city-center-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(TREE_URL).then((gltf) => {
      if (disposed) return;
      const template = gltf.scene;
      template.name = "city-center-reused-city-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let bounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(5.8 / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(template);
      const modelCenter = bounds.getCenter(new THREE.Vector3());
      template.position.set(-modelCenter.x, -bounds.min.y, -modelCenter.z);
      cityCenter.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "city-center-reused-tree-anchor") object.add(template.clone(true));
      });
      setMetrics(measureModelGeometry(cityCenter));
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
      const color = on ? 0x0c1c2b : 0xc8dbe0;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 190 : 220, on ? 390 : 440);
      hemi.intensity = on ? 0.4 : 2.05;
      sun.intensity = on ? 0.22 : 4.65;
      fill.intensity = on ? 0.22 : 0.75;
      renderer.toneMappingExposure = on ? 0.88 : 1.03;
      cityCenter.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => { desiredTarget.copy(FOCUS[next].target); desiredCamera.copy(FOCUS[next].camera); riderAnchor.position.copy(FOCUS[next].rider); focusBlend = 1; },
      setNight: setNightMode,
      setRushHour: (active) => cityCenter.userData.setRushHour(active),
      setCutaway: (on) => cityCenter.userData.setInteriorCutaway(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.4; },
    };
    setNightMode(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      cityCenter.userData.update(clock.getElapsedTime());
      if (!interacting && focusBlend > 0.001) {
        controls.target.lerp(desiredTarget, 0.085);
        if (!rotating) camera.position.lerp(desiredCamera, 0.065);
        focusBlend *= 0.91;
      }
      controls.update();
      renderer.render(scene, camera);
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
      controls.dispose();
      apiRef.current = null;
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const chooseFocus = (next: Focus) => { setFocus(next); apiRef.current?.focus(next); };
  const toggleNight = () => { const next = !night; setNight(next); apiRef.current?.setNight(next); };
  const toggleRushHour = () => { const next = !rushHour; setRushHour(next); apiRef.current?.setRushHour(next); };
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>METROPOLITAN CORE / INTERMODAL EXCHANGE</p><h1>云港城市中心 · 独立城市核心区</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考现实城市 CBD 与站城一体化街区，将地标办公商业、公共广场和四类交通服务设施整合为独立城市中心。综合交通枢纽、公交总站、出租车停车点和地图入口均有自己的场地、入口与候客空间；树木、花坛、路灯、信号灯和餐车复用已有模型，小兔子骑车主角作为统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮城市中心夜景"}</button>
            <button type="button" className={rushHour ? styles.active : ""} aria-pressed={rushHour} onClick={toggleRushHour}>{rushHour ? "结束高峰运营" : "启动交通高峰"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整建筑" : "查看建筑剖面"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回城市中心总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}><span /> {rushHour ? "RUSH HOUR ACTIVE" : night ? "CITY CENTRE NIGHT" : "CITY CENTRE OPEN"} · {cutaway ? "剖面观察中" : "完整建筑群"}</div>
      <aside className={styles.metrics} aria-label="城市中心模型参数">
        <span>METROPOLITAN CITY CENTER MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 4 轨道站台 / 8 公交泊位 / 12 出租车位 · ${referenceReady ? "兔子骑车主角整体外廓约 2.40 m" : "主角参考加载中"}` : "正在计算城市中心规模"}</small>
      </aside>
      <nav className={styles.zoneRail} style={{ justifyContent: "flex-start" }} aria-label="选择城市中心功能分区">
        {ZONES.map((zone) => (
          <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}>
            <span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
