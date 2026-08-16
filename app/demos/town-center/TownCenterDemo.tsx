"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSceneShatterPair, measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import { buildLowPolyTownCenter, type TownCenterZone } from "../../lib/map/townCenter";
import styles from "../residential-community/ResidentialCommunityDemo.module.css";

type Focus = "overview" | TownCenterZone;
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 9, 0), camera: new THREE.Vector3(148, 101, 157), rider: new THREE.Vector3(0, 0.62, 63) },
  civic: { target: new THREE.Vector3(0, 15, -38), camera: new THREE.Vector3(78, 51, 29), rider: new THREE.Vector3(0, 0.62, -18) },
  culture: { target: new THREE.Vector3(0, 6, -20), camera: new THREE.Vector3(114, 43, 70), rider: new THREE.Vector3(0, 0.62, -8) },
  market: { target: new THREE.Vector3(-54, 5, 34), camera: new THREE.Vector3(18, 35, 92), rider: new THREE.Vector3(-29, 0.62, 39) },
  commerce: { target: new THREE.Vector3(55, 5, 31), camera: new THREE.Vector3(120, 32, 80), rider: new THREE.Vector3(29, 0.62, 30) },
  service: { target: new THREE.Vector3(0, 4, 49), camera: new THREE.Vector3(65, 28, 98), rider: new THREE.Vector3(0, 0.62, 63) },
  transport: { target: new THREE.Vector3(0, 2, 58), camera: new THREE.Vector3(114, 31, 105), rider: new THREE.Vector3(18, 0.62, 63) },
  square: { target: new THREE.Vector3(0, 4, 8), camera: new THREE.Vector3(70, 38, 74), rider: new THREE.Vector3(0, 0.62, 29) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "TOWN 00", title: "溪桥市镇中心总览", summary: "175 × 135 m · 低层公共街区 / 步行优先", detail: "以钟楼广场为中心组织市政、文化、集市、商业和便民服务，外圈慢行机动车道路不穿越核心步行区。" },
  { id: "civic", number: "CIVIC 01", title: "市政厅与钟楼", summary: "3 层市政厅 · 38 m 钟楼 · 完整室内", detail: "一层公共服务大厅、二层议事厅、三层行政办公由双楼梯和无障碍电梯贯通；钟楼内设螺旋检修梯、维护平台、钟表机芯与钟铃，可通过剖面模式查看。" },
  { id: "culture", number: "CULTURE 02", title: "图书馆与文化礼堂", summary: "48 座阅读区 · 180 座公共礼堂", detail: "图书馆配置书架和阅读桌，文化礼堂包含舞台与阶梯座席，两者均可通过剖面模式查看内部。" },
  { id: "market", number: "MARKET 03", title: "传统集市", summary: "16 个室内摊位 · 12 个周末露天摊位", detail: "固定市场大厅承担日常生鲜零售，周末集市模式会开启室外遮棚和广场餐饮服务。" },
  { id: "commerce", number: "STREET 04", title: "镇中心商业街", summary: "6 家独立商铺 · 连续临街店面", detail: "烘焙、咖啡、杂货、药房、手作与餐厅形成面向步行街的活跃首层界面。" },
  { id: "service", number: "SERVICE 05", title: "便民服务与邮政", summary: "6 个服务窗口 · 4 个邮政窗口 · 12 组快递柜", detail: "便民大厅和邮局靠近日常到达区，提供无障碍服务、信件包裹办理与自助取件。" },
  { id: "transport", number: "ARRIVAL 06", title: "慢行交通与公共到达", summary: "2 个公交停靠点 · 32 个车位 · 10 个自行车架", detail: "小型公交站、分散停车和自行车架满足镇区日常规模，车辆仅沿外围道路行驶。" },
  { id: "square", number: "SQUARE 07", title: "中心公共广场", summary: "景观喷泉 · 树阵座椅 · 复用城市饰品", detail: "喷泉、纪念柱、花坛、长椅、新闻亭和餐饮设施共同构成全天候公共生活中心。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setMarketDay: (active: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function TownCenterDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [marketDay, setMarketDay] = useState(false);
  const [cutaway, setCutaway] = useState(false);
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
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.setAttribute("aria-label", "包含市政厅、钟楼广场、图书馆、文化礼堂、传统集市和商业街的市镇中心三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xccdce0);
    scene.fog = new THREE.Fog(0xccdce0, 185, 370);
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 470);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 11;
    controls.maxDistance = 310;
    controls.maxPolarAngle = Math.PI * 0.49;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(172, 64), new THREE.MeshStandardMaterial({ color: 0xa9b8a5, roughness: 0.98 }));
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf8fbff, 0x596754, 2.08);
    const sun = new THREE.DirectionalLight(0xffe9cb, 4.7);
    sun.position.set(-72, 102, 58);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -125;
    sun.shadow.camera.right = 125;
    sun.shadow.camera.top = 110;
    sun.shadow.camera.bottom = -105;
    sun.shadow.camera.far = 310;
    const fill = new THREE.DirectionalLight(0x94bdc9, 0.72);
    fill.position.set(76, 35, -65);
    scene.add(hemi, sun, fill);

    const townCenter = buildLowPolyTownCenter();
    const pair = createSceneShatterPair(townCenter, { seed: 409, spread: 4.8 });
    const shatterMorph = new ShatterMorphController(0);
    scene.add(pair.root);
    setMetrics(measureModelGeometry(townCenter));
    const riderAnchor = new THREE.Group();
    riderAnchor.name = "town-center-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(TREE_URL).then((gltf) => {
      if (disposed) return;
      const template = gltf.scene;
      template.name = "town-center-reused-city-tree";
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      let bounds = new THREE.Box3().setFromObject(template);
      template.scale.setScalar(5.6 / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
      template.updateMatrixWorld(true);
      bounds = new THREE.Box3().setFromObject(template);
      const modelCenter = bounds.getCenter(new THREE.Vector3());
      template.position.set(-modelCenter.x, -bounds.min.y, -modelCenter.z);
      townCenter.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "town-center-reused-tree-anchor") object.add(template.clone(true));
      });
      setMetrics(measureModelGeometry(townCenter));
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
      const color = on ? 0x10202c : 0xccdce0;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 165 : 185, on ? 335 : 370);
      hemi.intensity = on ? 0.44 : 2.08;
      sun.intensity = on ? 0.25 : 4.7;
      fill.intensity = on ? 0.2 : 0.72;
      renderer.toneMappingExposure = on ? 0.9 : 1.04;
      townCenter.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => { desiredTarget.copy(FOCUS[next].target); desiredCamera.copy(FOCUS[next].camera); riderAnchor.position.copy(FOCUS[next].rider); focusBlend = 1; },
      setNight: setNightMode,
      setMarketDay: (active) => townCenter.userData.setMarketDay(active),
      setCutaway: (on) => townCenter.userData.setInteriorCutaway(on),
      setShattered: (on) => shatterMorph.animateTo(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.4; },
    };
    setNightMode(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      townCenter.userData.update(clock.elapsedTime);
      if (shatterMorph.update(delta)) pair.setAmount(shatterMorph.getAmount());
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
  const toggleMarketDay = () => { const next = !marketDay; setMarketDay(next); apiRef.current?.setMarketDay(next); };
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleShattered = () => { const next = !shattered; setShattered(next); apiRef.current?.setShattered(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>WALKABLE TOWN CORE / CIVIC &amp; MARKET SQUARE</p><h1>溪桥市镇中心 · 独立市镇场景</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考现实小城市与卫星镇中心，以低层市政、文化和商业建筑围合钟楼广场。市政厅、图书馆、文化礼堂、集市、商业街、便民服务和公共到达各自完整，中心无车、外围慢行；树木、花坛、路灯、餐车、新闻亭与电话亭复用已有模型，小兔子骑车主角作为统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.active : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复市镇中心" : "破碎市镇中心"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮市镇夜景"}</button>
            <button type="button" className={marketDay ? styles.active : ""} aria-pressed={marketDay} onClick={toggleMarketDay}>{marketDay ? "结束周末集市" : "开启周末集市"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整建筑" : "查看建筑剖面"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回市镇中心总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status} aria-live="polite"><span /> {shattered ? "SHATTERED TOWN CENTRE" : marketDay ? "WEEKEND MARKET OPEN" : night ? "TOWN CENTRE NIGHT" : "TOWN CENTRE OPEN"} · {shattered ? "破碎态" : cutaway ? "剖面观察中" : "完整街区"}</div>
      <aside className={styles.metrics} aria-label="市镇中心模型参数">
        <span>WALKABLE TOWN CENTER MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 13 栋建筑 / 28 个集市摊位 / 32 个车位 · ${referenceReady ? "兔子骑车主角整体外廓约 2.40 m" : "主角参考加载中"}` : "正在计算市镇中心规模"}</small>
      </aside>
      <nav className={styles.zoneRail} style={{ justifyContent: "flex-start" }} aria-label="选择市镇中心功能分区">
        {ZONES.map((zone) => (
          <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}>
            <span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
