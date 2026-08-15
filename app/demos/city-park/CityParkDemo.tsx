"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { buildLowPolyCityPark, type CityParkZone } from "../../lib/map/cityPark";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | CityParkZone;
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 5, 0), camera: new THREE.Vector3(150, 110, 170), rider: new THREE.Vector3(0, 0.58, 68) },
  entrance: { target: new THREE.Vector3(0, 4, 55), camera: new THREE.Vector3(70, 28, 104), rider: new THREE.Vector3(0, 0.58, 68) },
  lake: { target: new THREE.Vector3(0, 4, -8), camera: new THREE.Vector3(90, 38, 55), rider: new THREE.Vector3(10, 0.58, 26) },
  recreation: { target: new THREE.Vector3(-55, 3, 19), camera: new THREE.Vector3(-120, 36, 70), rider: new THREE.Vector3(-35, 0.58, 38) },
  garden: { target: new THREE.Vector3(-58, 4, -43), camera: new THREE.Vector3(-120, 38, 0), rider: new THREE.Vector3(-35, 0.58, -25) },
  amphitheatre: { target: new THREE.Vector3(56, 4, -38), camera: new THREE.Vector3(120, 38, 5), rider: new THREE.Vector3(37, 0.58, -18) },
  service: { target: new THREE.Vector3(54, 3, 52), camera: new THREE.Vector3(110, 25, 96), rider: new THREE.Vector3(36, 0.58, 64) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "PARK 00", title: "云水城市公园总览", summary: "185 × 140 m · 湖区 / 活动 / 花园 / 剧场", detail: "四个常开入口连接连续无障碍步行环路和骑行环线，以中央生态湖组织全园公共空间。" },
  { id: "entrance", number: "GATE 01", title: "入口广场与环形步道", summary: "4 个开放入口 · 344 m 步行环 · 398 m 骑行环", detail: "南侧主入口设置自行车停车和迎宾广场，东西北三个次入口保证社区各方向均可自由进入。" },
  { id: "lake", number: "LAKE 02", title: "中央生态湖区", summary: "生态驳岸 · 78 m 景观桥 · 双组喷泉", detail: "东西无障碍景观桥连接湖岸并穿过中央亭，湿地岛和循环喷泉兼顾生态净化与景观体验。" },
  { id: "recreation", number: "PLAY 03", title: "儿童与运动活动区", summary: "儿童乐园 · 社区球场 · 10 组健身设施", detail: "儿童软质活动场与成人球场保持安全距离，外围健身区面向步行环路开放。" },
  { id: "garden", number: "GARDEN 04", title: "植物花园与温室", summary: "15 组主题花床 · 全玻璃温室", detail: "西北安静区通过规则花床、温室和林下步道展示季节植物，并保持完整无障碍游览路线。" },
  { id: "amphitheatre", number: "STAGE 05", title: "露天剧场", summary: "6 排阶梯坐席 · 有顶舞台", detail: "东北草坡剧场适合社区演出、露天电影和公共活动，首排保留无障碍观演空间。" },
  { id: "service", number: "SERVICE 06", title: "游客服务区", summary: "游客中心 · 咖啡 · 公厕 · 急救 · 2 辆餐车", detail: "服务建筑集中在主入口东侧，方便管理维护，同时避免服务车辆进入中央游园区域。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setWater: (enabled: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function CityParkDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [waterEnabled, setWaterEnabled] = useState(true);
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
    renderer.domElement.setAttribute("aria-label", "中央湖区、活动场、花园和露天剧场组成的城市公园三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc8dcdf);
    scene.fog = new THREE.Fog(0xc8dcdf, 185, 370);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 450);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 12;
    controls.maxDistance = 315;
    controls.maxPolarAngle = Math.PI * 0.49;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(170, 64), new THREE.MeshStandardMaterial({ color: 0xa7b8a6, roughness: 0.98 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf7fbff, 0x526853, 2.12);
    const sun = new THREE.DirectionalLight(0xffedcf, 4.75);
    sun.position.set(-70, 92, 55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -125;
    sun.shadow.camera.right = 125;
    sun.shadow.camera.top = 105;
    sun.shadow.camera.bottom = -98;
    sun.shadow.camera.far = 300;
    const fill = new THREE.DirectionalLight(0x91bfd0, 0.72);
    fill.position.set(70, 30, -62);
    scene.add(hemi, sun, fill);

    const park = buildLowPolyCityPark();
    scene.add(park);
    setMetrics(measureModelGeometry(park));
    const riderAnchor = new THREE.Group();
    riderAnchor.name = "city-park-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(TREE_URL).then((gltf) => {
      if (disposed) return;
      const template = gltf.scene;
      template.name = "city-park-reused-city-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let bounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(6.2 / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(template);
      const center = bounds.getCenter(new THREE.Vector3());
      template.position.set(-center.x, -bounds.min.y, -center.z);
      park.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "city-park-reused-tree-anchor") object.add(template.clone(true));
      });
      setMetrics(measureModelGeometry(park));
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
      const color = on ? 0x0e1d29 : 0xc8dcdf;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 158 : 185, on ? 325 : 370);
      hemi.intensity = on ? 0.42 : 2.12;
      sun.intensity = on ? 0.24 : 4.75;
      fill.intensity = on ? 0.22 : 0.72;
      renderer.toneMappingExposure = on ? 0.89 : 1.04;
      park.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => { desiredTarget.copy(FOCUS[next].target); desiredCamera.copy(FOCUS[next].camera); riderAnchor.position.copy(FOCUS[next].rider); focusBlend = 1; },
      setNight: setNightMode,
      setWater: (enabled) => park.userData.setWaterMotionEnabled(enabled),
      setCutaway: (on) => park.userData.setServiceCutaway(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.44; },
    };
    setNightMode(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      park.userData.update(clock.getElapsedTime());
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
  const toggleWater = () => { const next = !waterEnabled; setWaterEnabled(next); apiRef.current?.setWater(next); };
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>URBAN PARK / WATER &amp; MEADOW</p><h1>云水公园 · 独立城市公园场景</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考现实综合性城市公园规划，以中央生态湖为核心，串联步行、骑行、儿童活动、社区运动、植物展示、文化演出与游客服务。四个入口保持开放，低围栏仅用于边界引导；树木、花坛、路灯和餐车复用已有模型，小兔子骑车主角作为统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮公园夜景"}</button>
            <button type="button" className={waterEnabled ? styles.active : ""} aria-pressed={waterEnabled} onClick={toggleWater}>{waterEnabled ? "暂停湖面喷泉" : "启动湖面喷泉"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复服务建筑" : "查看游客中心内部"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回公园总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}><span /> {night ? "PARK NIGHT" : "PARK OPEN"} · {waterEnabled ? "生态水景运行中" : "水景已暂停"}</div>
      <aside className={styles.metrics} aria-label="城市公园模型参数">
        <span>URBAN PARK MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 4 个入口 / 49 棵树 / 6 个功能区 · ${referenceReady ? "兔子骑车主角整体外廓约 2.40 m" : "主角参考加载中"}` : "正在计算公园规模"}</small>
      </aside>
      <nav className={styles.zoneRail} style={{ justifyContent: "flex-start" }} aria-label="选择城市公园功能分区">
        {ZONES.map((zone) => (
          <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}>
            <span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
