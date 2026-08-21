"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSceneShatterPair, measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { buildLowPolyShoppingMall, type MallZone } from "../../lib/map/shoppingMall";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import { createShowcaseRenderBudget, hasContinuousShowcaseActivity } from "../../lib/map/showcaseRenderBudget";
import { createCachedPrimitiveScene, disposeSceneResources, retireResourceCacheGeneration } from "../../lib/map/cityResourceCache";
import styles from "./ShoppingMallDemo.module.css";

type Focus = MallZone;
const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 8, 0), camera: new THREE.Vector3(142, 102, 160), rider: new THREE.Vector3(0, 0.5, 57) },
  exterior: { target: new THREE.Vector3(0, 5, 46), camera: new THREE.Vector3(86, 31, 91), rider: new THREE.Vector3(0, 0.5, 57) },
  courtyard: { target: new THREE.Vector3(0, 5, 3), camera: new THREE.Vector3(66, 33, 69), rider: new THREE.Vector3(10, 0.5, 25) },
  "food-street": { target: new THREE.Vector3(-32, 4, 12), camera: new THREE.Vector3(8, 22, 49), rider: new THREE.Vector3(-15, 0.5, 26) },
  lifestyle: { target: new THREE.Vector3(60, 8, -3), camera: new THREE.Vector3(111, 35, 44), rider: new THREE.Vector3(48, 0.5, 26) },
  "upper-arcade": { target: new THREE.Vector3(0, 8, 0), camera: new THREE.Vector3(76, 37, 46), rider: new THREE.Vector3(21, 0.5, 24) },
  interior: { target: new THREE.Vector3(-24, 2.8, -32), camera: new THREE.Vector3(4, 11, -7), rider: new THREE.Vector3(-8, 0.5, -18) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "CENTRE 00", title: "都会里商业中心", summary: "5 栋商业建筑 · 62 个首层商铺", detail: "约 184 × 138 米开放街区，由五栋建筑围合中央露天步行广场。" },
  { id: "exterior", number: "STREET 01", title: "外向临街商业", summary: "34 个首层临街店面 · 落客区", detail: "面向周边城市道路连续开店，拥有独立入口、橱窗、招牌、雨棚和停车带。" },
  { id: "courtyard", number: "COURT 02", title: "中央露天中庭", summary: "10 米通行主轴 · 双水景 · 局部雨棚", detail: "无障碍露天步行轴从开放入口贯通北侧主力店，双侧水景和餐饮座位不再阻断通行。" },
  { id: "food-street", number: "TASTE 03", title: "半露天餐饮街", summary: "快餐 · 咖啡 · 汉堡 · 奶茶", detail: "首层内街集中了餐饮柜台、户外餐桌、遮阳伞、烘焙与正餐商家。" },
  { id: "lifestyle", number: "RETAIL 04", title: "生活方式商业翼", summary: "时尚零售 · 便利店 · 主力店", detail: "东西翼楼承载生活零售，北侧四层主力店形成商业中心的视觉锚点。" },
  { id: "upper-arcade", number: "LINK 05", title: "露天过道系统", summary: "4 座转角短桥 · 2 组扶梯 · 沿楼露台", detail: "有柱支撑的二层过道贴合内立面，仅以短桥连接建筑转角，不再横跨或遮挡整个中庭。" },
  { id: "interior", number: "INTERIOR 06", title: "主题店铺精装内部", summary: "62 个主题店铺 · 后厨与陈列", detail: "剖开北翼观察收银柜台、餐饮后厨、零售陈列、店内座席与灯光，并串联楼梯、电梯、卫生间和导视等公共服务。" },
];

type DemoApi = { focus: (focus: Focus) => void; setNight: (night: boolean) => void; setCutaway: (cutaway: boolean) => void; setShattered: (shattered: boolean) => void; setAutoRotate: (enabled: boolean) => void };

export function ShoppingMallDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
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
    renderer.domElement.setAttribute("aria-label", "都会里大型商业中心三维展示场景，包含六十二个主题店铺、精装室内、中庭、公共服务设施与持续营业的商业夜景照明");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc8dadd);
    scene.fog = new THREE.Fog(0xc8dadd, 175, 345);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 400);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 12;
    controls.maxDistance = 290;
    controls.maxPolarAngle = Math.PI * 0.49;
    const renderBudget = createShowcaseRenderBudget({ renderer, host, controls });

    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xa7b5a5, roughness: 0.98 });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 64), groundMaterial);
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);
    const hemi = new THREE.HemisphereLight(0xf8fbff, 0x566657, 2.08);
    const sun = new THREE.DirectionalLight(0xffead0, 4.7);
    sun.position.set(-56, 78, 48);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -118;
    sun.shadow.camera.right = 118;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -94;
    sun.shadow.camera.far = 280;
    const fill = new THREE.DirectionalLight(0x93bbce, 0.72);
    fill.position.set(58, 26, -48);
    const moon = new THREE.DirectionalLight(0x8fb6df, 0);
    moon.position.set(46, 64, -72);
    scene.add(hemi, sun, fill, moon);

    const cachedScene = createCachedPrimitiveScene(buildLowPolyShoppingMall);
    const mall = cachedScene.root;
    const pair = createSceneShatterPair(mall, { seed: 403, spread: 6 });
    const shatterMorph = new ShatterMorphController(0);
    scene.add(pair.root);
    setMetrics(measureModelGeometry(mall));
    const riderAnchor = new THREE.Group();
    riderAnchor.name = "shopping-mall-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);
    let disposed = false;
    new GLTFLoader().loadAsync(RABBIT_RIDER_URL).then((gltf) => {
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
      const skyColor = on ? 0x07131f : 0xc8dadd;
      scene.background = new THREE.Color(skyColor);
      scene.fog = new THREE.Fog(on ? 0x0a1825 : skyColor, on ? 180 : 175, on ? 345 : 345);
      hemi.color.setHex(on ? 0x6f8bab : 0xf8fbff);
      hemi.groundColor.setHex(on ? 0x16222a : 0x566657);
      hemi.intensity = on ? 0.68 : 2.08;
      sun.color.setHex(on ? 0x9cb9d5 : 0xffead0);
      sun.intensity = on ? 0.12 : 4.7;
      sun.castShadow = !on;
      fill.intensity = on ? 0.28 : 0.72;
      moon.intensity = on ? 1.2 : 0;
      groundMaterial.color.setHex(on ? 0x405159 : 0xa7b5a5);
      groundMaterial.emissive.setHex(on ? 0x101b21 : 0x000000);
      groundMaterial.emissiveIntensity = on ? 0.2 : 0;
      renderer.toneMappingExposure = on ? 1.22 : 1.04;
      mall.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => { desiredTarget.copy(FOCUS[next].target); desiredCamera.copy(FOCUS[next].camera); riderAnchor.position.copy(FOCUS[next].rider); focusBlend = 1; },
      setNight: setNightMode,
      setCutaway: (on) => mall.userData.setInteriorCutaway(on),
      setShattered: (on) => shatterMorph.animateTo(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.48; },
    };
    setNightMode(false);

    const clock = new THREE.Clock();
    let frame = 0;
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
    const resize = () => { const width = host.clientWidth; const height = host.clientHeight; camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); renderer.setSize(width, height, false); };
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

  const chooseFocus = (next: Focus) => {
    if (autoRotate) {
      setAutoRotate(false);
      apiRef.current?.setAutoRotate(false);
    }
    setFocus(next);
    if (next === "interior") {
      setCutaway(true);
      apiRef.current?.setCutaway(true);
    }
    apiRef.current?.focus(next);
  };
  const toggleNight = () => {
    const api = apiRef.current;
    if (!api) return;
    const next = !night;
    setNight(next);
    api.setNight(next);
  };
  const toggleCutaway = () => { const next = !cutaway; setCutaway(next); apiRef.current?.setCutaway(next); };
  const toggleShattered = () => { const next = !shattered; setShattered(next); apiRef.current?.setShattered(next); };
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div><p className={styles.eyebrow}>METROPOLITAN RETAIL / OPEN-AIR CENTRE</p><h1>都会里 · 大型商业中心</h1></div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "展开导览 ↓" : "收起导览 ↑"}</button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>五栋玻璃幕墙商业建筑围合部分露天的中央商场，62 个主题店铺具有独立收银、餐饮后厨、商品陈列、店内座席与灯光装修；夜间店铺、外立面、连廊、中庭、入口和导视持续点亮。约 21 米宽的无门开放入口直通中庭，楼梯、电梯、卫生间和导视服务连接餐饮街、露台与空中连桥。小兔子骑车主角作为统一尺度参考。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.active : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复商业中心" : "破碎商业中心"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "关闭商业夜景" : "点亮商业夜景"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整外观" : "查看精装内部"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回商场总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status} aria-live="polite"><span /> {shattered ? "SHATTERED CENTRE" : focus === "interior" ? "INTERIOR DETAIL" : night ? "NIGHT BUSINESS OPEN" : "CENTRE OPEN"} · {shattered ? "破碎态" : night ? "全场营业照明已开启" : cutaway ? "精装店铺与公共服务观察中" : "完整建筑群"}</div>
      <aside className={styles.metrics} aria-label="商业中心规模、主题店铺和室内公共服务参数">
        <span>62-TENANT INTERIOR RETAIL CENTRE</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 62 个主题店铺 · 收银 / 后厨 / 陈列 / 座席 · 楼梯电梯与公共服务 · ${referenceReady ? "兔子骑车主角整体外廓约 2.40 m" : "主角参考加载中"}` : "正在计算商业中心规模"}</small>
      </aside>
      <nav className={styles.zoneRail} aria-label="选择商业中心分区">
        {ZONES.map((zone) => <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}><span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em></button>)}
      </nav>
    </main>
  );
}
