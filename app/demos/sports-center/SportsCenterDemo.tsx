"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { buildLowPolySportsCenter, type SportsCenterZone } from "../../lib/map/sportsCenter";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | SportsCenterZone;
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 10, 0), camera: new THREE.Vector3(235, 150, 250), rider: new THREE.Vector3(-30, 0.58, 84) },
  stadium: { target: new THREE.Vector3(-45, 8, -15), camera: new THREE.Vector3(94, 75, 116), rider: new THREE.Vector3(-30, 0.58, 64) },
  arena: { target: new THREE.Vector3(90, 10, -57), camera: new THREE.Vector3(166, 53, 4), rider: new THREE.Vector3(70, 0.58, -26) },
  aquatics: { target: new THREE.Vector3(94, 7, 0), camera: new THREE.Vector3(171, 43, 61), rider: new THREE.Vector3(80, 0.58, 29) },
  outdoor: { target: new THREE.Vector3(108, 4, 57), camera: new THREE.Vector3(174, 38, 104), rider: new THREE.Vector3(88, 0.58, 78) },
  fitness: { target: new THREE.Vector3(57, 5, 50), camera: new THREE.Vector3(113, 31, 93), rider: new THREE.Vector3(42, 0.58, 78) },
  service: { target: new THREE.Vector3(-15, 4, 69), camera: new THREE.Vector3(61, 27, 116), rider: new THREE.Vector3(-30, 0.58, 84) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "SPORTS 00", title: "凌峰体育中心总览", summary: "280 × 190 m · 体育场 / 体育馆 / 游泳馆", detail: "市级体育建筑群以赛事广场连接六个功能区，观众、运动员、车辆和后勤分别通过独立入口到达。" },
  { id: "stadium", number: "STADIUM 01", title: "田径足球主体育场", summary: "8 道田径场 · 标准足球场 · 12,000 座", detail: "南北双看台配置带后排承重柱的遮阳雨棚和 8 座赛事灯塔，可承办田径、足球和大型公共活动。" },
  { id: "arena", number: "ARENA 02", title: "综合体育馆", summary: "5,200 座 · 篮球 / 排球多功能场地", detail: "室内竞赛场地、环形看台和中央四面屏组成赛事核心，可通过剖面模式查看完整内部布局。" },
  { id: "aquatics", number: "AQUATICS 03", title: "公共游泳馆", summary: "50 m 标准池 · 10 泳道 · 观众看台", detail: "竞赛泳池配置 10 个起跳台、泳道绳和独立观众区，玻璃幕墙为公共开放时段提供自然采光。" },
  { id: "outdoor", number: "OUTDOOR 04", title: "室外全民运动区", summary: "2 篮球场 · 2 网球场 · 滑板公园", detail: "室外球场与滑板设施面向公众开放，并与专业赛事场馆的受控流线保持分离。" },
  { id: "fitness", number: "FITNESS 05", title: "全民健身中心", summary: "18 组训练设备 · 团操与体测空间", detail: "面向日常社区使用的健身建筑位于入口附近，可独立运营，不需要进入收费赛事场馆。" },
  { id: "service", number: "SERVICE 06", title: "赛事集散与服务区", summary: "40 个停车位 · 6 个票窗 · 3 辆餐车", detail: "主入口广场承担售票、安检、观众集散和餐饮服务，运动员及后勤车辆使用独立受控入口。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setEvent: (event: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function SportsCenterDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [event, setEvent] = useState(false);
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
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.setAttribute("aria-label", "主体育场、综合体育馆、游泳馆和全民运动区组成的体育中心三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc9dbdf);
    scene.fog = new THREE.Fog(0xc9dbdf, 215, 430);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 520);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 14;
    controls.maxDistance = 360;
    controls.maxPolarAngle = Math.PI * 0.49;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(195, 64), new THREE.MeshStandardMaterial({ color: 0xa8b7a7, roughness: 0.98 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf6fbff, 0x526454, 2.08);
    const sun = new THREE.DirectionalLight(0xffead0, 4.7);
    sun.position.set(-80, 110, 62);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -175;
    sun.shadow.camera.right = 175;
    sun.shadow.camera.top = 150;
    sun.shadow.camera.bottom = -140;
    sun.shadow.camera.far = 400;
    const fill = new THREE.DirectionalLight(0x93bbce, 0.72);
    fill.position.set(82, 34, -72);
    scene.add(hemi, sun, fill);

    const sportsCenter = buildLowPolySportsCenter();
    scene.add(sportsCenter);
    setMetrics(measureModelGeometry(sportsCenter));
    const riderAnchor = new THREE.Group();
    riderAnchor.name = "sports-center-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(TREE_URL).then((gltf) => {
      if (disposed) return;
      const template = gltf.scene;
      template.name = "sports-center-reused-city-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let bounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(5.8 / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(template);
      const center = bounds.getCenter(new THREE.Vector3());
      template.position.set(-center.x, -bounds.min.y, -center.z);
      sportsCenter.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "sports-center-reused-tree-anchor") object.add(template.clone(true));
      });
      setMetrics(measureModelGeometry(sportsCenter));
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
      const color = on ? 0x0d1c29 : 0xc9dbdf;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 185 : 215, on ? 380 : 430);
      hemi.intensity = on ? 0.42 : 2.08;
      sun.intensity = on ? 0.24 : 4.7;
      fill.intensity = on ? 0.22 : 0.72;
      renderer.toneMappingExposure = on ? 0.89 : 1.04;
      sportsCenter.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => { desiredTarget.copy(FOCUS[next].target); desiredCamera.copy(FOCUS[next].camera); riderAnchor.position.copy(FOCUS[next].rider); focusBlend = 1; },
      setNight: setNightMode,
      setEvent: (active) => sportsCenter.userData.setEventMode(active),
      setCutaway: (on) => sportsCenter.userData.setInteriorCutaway(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.42; },
    };
    setNightMode(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      sportsCenter.userData.update(clock.getElapsedTime());
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
  const toggleEvent = () => { const next = !event; setEvent(next); apiRef.current?.setEvent(next); };
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>METROPOLITAN SPORTS / STADIUM &amp; AQUATICS</p><h1>凌峰体育中心 · 独立体育场景</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考现实城市级体育中心，将专业赛事与全民健身组合在同一独立建筑群。主体育场、综合体育馆、公共游泳馆、室外运动区和赛事服务区拥有独立人流与车辆组织；树木、花坛、路灯和餐车复用已有模型，小兔子骑车主角作为统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮体育中心夜景"}</button>
            <button type="button" className={event ? styles.active : ""} aria-pressed={event} onClick={toggleEvent}>{event ? "结束赛事模式" : "启动大型赛事"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整场馆" : "查看场馆剖面"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回体育中心总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}><span /> {event ? "EVENT IN PROGRESS" : night ? "VENUE NIGHT" : "SPORTS CENTRE OPEN"} · {cutaway ? "剖面观察中" : "完整场馆"}</div>
      <aside className={styles.metrics} aria-label="体育中心模型参数">
        <span>METROPOLITAN SPORTS CENTER MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 12,000 座主场 / 5,200 座体育馆 / 10 泳道 · ${referenceReady ? "兔子骑车主角整体外廓约 2.40 m" : "主角参考加载中"}` : "正在计算体育中心规模"}</small>
      </aside>
      <nav className={styles.zoneRail} style={{ justifyContent: "flex-start" }} aria-label="选择体育中心功能分区">
        {ZONES.map((zone) => (
          <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}>
            <span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
