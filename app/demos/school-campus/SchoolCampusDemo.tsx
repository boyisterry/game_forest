"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import { buildLowPolySchoolCampus, type SchoolZone } from "../../lib/map/schoolCampus";
import styles from "./SchoolCampusDemo.module.css";

type Focus = "overview" | SchoolZone;
const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3; rider: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 7, -2), camera: new THREE.Vector3(142, 104, 154), rider: new THREE.Vector3(0, 0.48, 56) },
  teaching: { target: new THREE.Vector3(-52, 7, 8), camera: new THREE.Vector3(-105, 42, 68), rider: new THREE.Vector3(-37, 0.48, 28) },
  laboratory: { target: new THREE.Vector3(-16, 9, 6), camera: new THREE.Vector3(29, 32, 48), rider: new THREE.Vector3(-3, 0.48, 22) },
  administration: { target: new THREE.Vector3(0, 6, 39), camera: new THREE.Vector3(48, 25, 74), rider: new THREE.Vector3(0, 0.48, 55) },
  dormitory: { target: new THREE.Vector3(-44, 9, -41), camera: new THREE.Vector3(-98, 39, -12), rider: new THREE.Vector3(-37, 0.48, -28) },
  sports: { target: new THREE.Vector3(38, 2, -20), camera: new THREE.Vector3(102, 47, 27), rider: new THREE.Vector3(11, 0.48, -7) },
  natatorium: { target: new THREE.Vector3(52, 4, 47), camera: new THREE.Vector3(104, 29, 78), rider: new THREE.Vector3(29, 0.48, 55) },
};

const ZONES: Array<{ id: Focus; number: string; title: string; summary: string; detail: string }> = [
  { id: "overview", number: "CAMPUS 00", title: "红砖学府总览", summary: "170 × 130 m · 学习 / 生活 / 运动三区", detail: "以南门行政轴线为序，教学庭院居西、完整运动区居东，宿舍与教学区保持安静缓冲。" },
  { id: "administration", number: "ZONE 01", title: "教务处与主入口", summary: "3 层行政楼 · 校钟 · 仪式广场", detail: "教务、教师发展与会议空间面向主入口布置，形成现实校园常见的识别中轴。" },
  { id: "teaching", number: "ZONE 02", title: "教学楼组团", summary: "2 栋 4 层教学楼 · 24 间教室", detail: "平行教学楼围合中央庭院；教室按真实课桌、黑板与层高尺度构建，可切换剖面查看。" },
  { id: "laboratory", number: "ZONE 03", title: "综合实验楼", summary: "5 层 · 12 间理化生实验室", detail: "实验台、器材与通风尺度独立表达，紧邻教学区并与生活区分隔。" },
  { id: "dormitory", number: "ZONE 04", title: "学生宿舍区", summary: "2 栋 6 层宿舍 · 48 间寝室", detail: "宿舍布置在校园西北安静区，寝室包含双床与学习桌，并拥有独立生活庭院。" },
  { id: "sports", number: "ZONE 05", title: "综合运动区", summary: "6 道跑道 · 足球场 · 看台", detail: "东侧运动区另含 2 个篮球场和 2 个网球场，设施尺度均以现实竞赛场地为基准。" },
  { id: "natatorium", number: "ZONE 06", title: "室内游泳馆", summary: "8 泳道 · 全封闭场馆 · 采光幕墙", detail: "独立泳池大厅包含起跳台、泳道绳和屋架；开启剖面可查看馆内完整水池布局。" },
];

type DemoApi = {
  focus: (focus: Focus) => void;
  setNight: (night: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
};

export function SchoolCampusDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
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
    renderer.domElement.setAttribute("aria-label", "现代学校教学、生活和运动分区三维展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcbdde0);
    scene.fog = new THREE.Fog(0xcbdde0, 170, 340);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 420);
    camera.position.copy(FOCUS.overview.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 15;
    controls.maxDistance = 280;
    controls.maxPolarAngle = Math.PI * 0.49;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(155, 64),
      new THREE.MeshStandardMaterial({ color: 0xaebdaf, roughness: 0.98 }),
    );
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    const hemi = new THREE.HemisphereLight(0xf5fbff, 0x516454, 2.1);
    const sun = new THREE.DirectionalLight(0xffedcf, 4.8);
    sun.position.set(-64, 88, 48);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -110;
    sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 96;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.far = 280;
    const fill = new THREE.DirectionalLight(0x91bed0, 0.7);
    fill.position.set(70, 30, -60);
    scene.add(hemi, sun, fill);

    const campus = buildLowPolySchoolCampus();
    scene.add(campus);
    setMetrics(measureModelGeometry(campus));

    const riderAnchor = new THREE.Group();
    riderAnchor.name = "school-campus-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(FOCUS.overview.rider);
    riderAnchor.rotation.y = -0.7;
    scene.add(riderAnchor);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(TREE_URL).then((gltf) => {
      if (disposed) return;
      const template = gltf.scene;
      template.name = "school-campus-reused-city-tree";
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
      campus.traverse((object) => {
        if (object instanceof THREE.Group && object.name === "school-campus-reused-tree-anchor") object.add(template.clone(true));
      });
      setMetrics(measureModelGeometry(campus));
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
      const color = on ? 0x0d1d2b : 0xcbdde0;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 145 : 170, on ? 300 : 340);
      hemi.intensity = on ? 0.42 : 2.1;
      sun.intensity = on ? 0.25 : 4.8;
      fill.intensity = on ? 0.22 : 0.7;
      renderer.toneMappingExposure = on ? 0.87 : 1.04;
      campus.userData.setPowered(on);
    };
    apiRef.current = {
      focus: (next) => {
        desiredTarget.copy(FOCUS[next].target);
        desiredCamera.copy(FOCUS[next].camera);
        riderAnchor.position.copy(FOCUS[next].rider);
        focusBlend = 1;
      },
      setNight: setNightMode,
      setCutaway: (on) => campus.userData.setInteriorCutaway(on),
      setAutoRotate: (enabled) => {
        rotating = enabled;
        controls.autoRotate = enabled;
        controls.autoRotateSpeed = 0.48;
      },
    };
    setNightMode(false);
    campus.userData.setInteriorCutaway(false);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
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
  const toggleRotate = () => { const next = !autoRotate; setAutoRotate(next); apiRef.current?.setAutoRotate(next); };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div>
            <p className={styles.eyebrow}>ACADEMIC CAMPUS / BRICK &amp; GARDEN</p>
            <h1>红砖学府 · 独立学校场景</h1>
          </div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "展开导览 ↓" : "收起导览 ↑"}
          </button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>参考现实高中与大学进修校园规划，将教学、实验、行政、住宿和运动功能组织成独立完整院区；主体建筑统一朝向校园主轴，周界以围栏和受控校门保护。树木、花坛与路灯复用已有饰品模型，小兔子骑车主角作为统一比例参考。</p>
          <div className={styles.actions}>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮校园夜景"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复完整外观" : "查看建筑剖面"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回校园总览</button>
          </div>
        </div>
      </header>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}><span /> {night ? "EVENING STUDY" : "CAMPUS OPEN"} · {cutaway ? "剖面观察中" : "完整建筑外观"}</div>
      <aside className={styles.metrics} aria-label="学校模型参数">
        <span>SCHOOL CAMPUS MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 7 栋主体建筑 · ${referenceReady ? "兔子骑车主角约 2.40 m 参考" : "主角参考加载中"}` : "正在计算校园规模"}</small>
      </aside>
      <nav className={styles.zoneRail} aria-label="选择学校功能分区">
        {ZONES.map((zone) => (
          <button key={zone.id} type="button" className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`} onClick={() => chooseFocus(zone.id)}>
            <span>{zone.number}</span><strong>{zone.title}</strong><small>{zone.summary}</small><em>{zone.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
