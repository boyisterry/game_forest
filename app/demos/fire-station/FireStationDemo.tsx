"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { buildLowPolyFireStation, type FireStationZone } from "../../lib/map/fireStation";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | FireStationZone;
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 8, 0), camera: new THREE.Vector3(135, 95, 150), rider: new THREE.Vector3(0, 0.58, 50) },
  response: { target: new THREE.Vector3(-26, 5, 20), camera: new THREE.Vector3(70, 32, 82), rider: new THREE.Vector3(-20, 0.58, 44) },
  command: { target: new THREE.Vector3(43, 8, 8), camera: new THREE.Vector3(101, 39, 65), rider: new THREE.Vector3(53, 0.58, 41) },
  living: { target: new THREE.Vector3(-42, 5, -18), camera: new THREE.Vector3(-105, 35, 35), rider: new THREE.Vector3(-20, 0.58, 1) },
  training: { target: new THREE.Vector3(43, 9, -34), camera: new THREE.Vector3(110, 45, 15), rider: new THREE.Vector3(25, 0.58, -12) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "STATION 00", title: "赤焰消防站总览", summary: "155 × 110 m · 执勤 / 指挥 / 生活 / 训练", detail: "消防车出警、访客和后勤三套流线相互分离，完整院区通过受控入口连接城市主路。" },
  { id: "response", number: "RESPONSE 01", title: "消防车库与出警区", summary: "6 个车库 · 6 辆消防车 · 独立出警车道", detail: "泵浦车、云梯车、救援车、危化车和水罐车从各自车库沿无遮挡车道直接驶入城市道路。" },
  { id: "command", number: "COMMAND 02", title: "应急指挥中心", summary: "4 层指挥楼 · 12 个调度席位", detail: "接警、通信、视频调度和访客入口集中在独立指挥翼，不干扰消防车辆的快速出动。" },
  { id: "living", number: "CREW 03", title: "执勤生活与器材区", summary: "16 张值班床 · 24 个装备柜 · 12 组器材架", detail: "宿舍、厨房餐厅、换装区和呼吸器材仓库紧邻车库，保证接警后快速换装与登车。" },
  { id: "training", number: "TRAINING 04", title: "消防训练区", summary: "8 层训练塔 · 烟热训练 · 水池与障碍场", detail: "训练塔设置逐层窗口、操作阳台与绳索下降点，地面配有烟道迷宫、障碍墙和消防水源。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setDoorsOpen: (open: boolean) => void;
  setAccessOpen: (open: boolean) => void;
  setAlert: (active: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function FireStationDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [alert, setAlert] = useState(false);
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
    renderer.domElement.setAttribute("aria-label", "完整城市消防局独立院区三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc9dade);
    scene.fog = new THREE.Fog(0xc9dade, 165, 335);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 410);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 12;
    controls.maxDistance = 285;
    controls.maxPolarAngle = Math.PI * 0.49;

    const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 64), new THREE.MeshStandardMaterial({ color: 0xaab8a8, roughness: 0.98 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf6fbff, 0x526454, 2.08);
    const sun = new THREE.DirectionalLight(0xffead0, 4.7);
    sun.position.set(-62, 86, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -110;
    sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -92;
    sun.shadow.camera.far = 285;
    const fill = new THREE.DirectionalLight(0x93bbce, 0.72);
    fill.position.set(62, 28, -52);
    scene.add(hemi, sun, fill);

    const station = buildLowPolyFireStation();
    scene.add(station);
    setMetrics(measureModelGeometry(station));
    const riderAnchor = new THREE.Group();
    riderAnchor.name = "fire-station-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(TREE_URL).then((gltf) => {
      if (disposed) return;
      const template = gltf.scene;
      template.name = "fire-station-reused-city-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let bounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(5.6 / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(template);
      const center = bounds.getCenter(new THREE.Vector3());
      template.position.set(-center.x, -bounds.min.y, -center.z);
      station.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "fire-station-reused-tree-anchor") object.add(template.clone(true));
      });
      setMetrics(measureModelGeometry(station));
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
      const color = on ? 0x0e1b28 : 0xc9dade;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 140 : 165, on ? 290 : 335);
      hemi.intensity = on ? 0.42 : 2.08;
      sun.intensity = on ? 0.24 : 4.7;
      fill.intensity = on ? 0.22 : 0.72;
      renderer.toneMappingExposure = on ? 0.88 : 1.04;
      station.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => { desiredTarget.copy(FOCUS[next].target); desiredCamera.copy(FOCUS[next].camera); riderAnchor.position.copy(FOCUS[next].rider); focusBlend = 1; },
      setNight: setNightMode,
      setCutaway: (on) => station.userData.setInteriorCutaway(on),
      setDoorsOpen: (open) => station.userData.setApparatusDoorsOpen(open),
      setAccessOpen: (open) => {
        station.userData.setVisitorGateOpen(open);
        station.userData.setServiceGateOpen(open);
      },
      setAlert: (active) => station.userData.setAlertActive(active),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.46; },
    };
    setNightMode(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      station.userData.update(clock.getElapsedTime());
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
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleDoors = () => { const next = !doorsOpen; setDoorsOpen(next); apiRef.current?.setDoorsOpen(next); };
  const toggleAccess = () => { const next = !accessOpen; setAccessOpen(next); apiRef.current?.setAccessOpen(next); };
  const toggleAlert = () => {
    const next = !alert;
    setAlert(next);
    setDoorsOpen(next);
    apiRef.current?.setAlert(next);
  };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>FIRE &amp; RESCUE / RAPID RESPONSE CAMPUS</p><h1>赤焰消防站 · 独立消防局场景</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考现实城市一级消防站，将接警指挥、消防车辆、执勤生活、装备后勤和专业训练组织为独立完整院区。六条出警车道直接连接城市道路，访客和后勤流线与消防车分离；树木、花坛与路灯复用已有饰品模型，小兔子骑车主角作为统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮消防站夜景"}</button>
            <button type="button" className={doorsOpen ? styles.active : ""} aria-pressed={doorsOpen} onClick={toggleDoors}>{doorsOpen ? "关闭车库门" : "打开全部车库门"}</button>
            <button type="button" className={accessOpen ? styles.active : ""} aria-pressed={accessOpen} onClick={toggleAccess}>{accessOpen ? "关闭访客与后勤门禁" : "打开访客与后勤门禁"}</button>
            <button type="button" className={alert ? styles.active : ""} aria-pressed={alert} onClick={toggleAlert}>{alert ? "解除出警警报" : "启动出警警报"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整外观" : "查看建筑剖面"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回消防站总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}><span /> {alert ? "EMERGENCY RESPONSE" : night ? "NIGHT WATCH" : "STATION READY"} · {doorsOpen ? "车库已开启" : "待命状态"}</div>
      <aside className={styles.metrics} aria-label="消防局模型参数">
        <span>FIRE STATION CAMPUS MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 6 个车库 / 6 辆消防车 / 8 层训练塔 · ${referenceReady ? "兔子骑车主角整体外廓约 2.40 m" : "主角参考加载中"}` : "正在计算消防站规模"}</small>
      </aside>
      <nav className={styles.zoneRail} style={{ justifyContent: "flex-start" }} aria-label="选择消防局功能分区">
        {ZONES.map((zone) => (
          <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}>
            <span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
