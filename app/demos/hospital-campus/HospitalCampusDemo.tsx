"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildLowPolyHospitalCampus, type HospitalZone } from "../../lib/map/hospitalCampus";
import { createFurnitureShatterPair, measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import { buildLowPolyRabbitScaleReference } from "../../lib/map/rabbitScaleReference";
import styles from "./HospitalCampusDemo.module.css";

type Focus = "all" | HospitalZone;
type HospitalMetrics = ModelGeometryMetrics & { shatteredFaceCount: number };

const FOCUS = {
  all: { target: new THREE.Vector3(0, 5.8, -1.5), camera: new THREE.Vector3(62, 39, 64) },
  outpatient: { target: new THREE.Vector3(-16, 3.3, 3.5), camera: new THREE.Vector3(-35, 15, 29) },
  emergency: { target: new THREE.Vector3(16, 2.7, 4.5), camera: new THREE.Vector3(35, 14, 29) },
  inpatient: { target: new THREE.Vector3(0, 7.3, -11.5), camera: new THREE.Vector3(28, 22, 23.5) },
} as const;

const RABBIT_REFERENCE_POSITION: Record<Focus, THREE.Vector3> = {
  all: new THREE.Vector3(6, 0.44, 2.5),
  outpatient: new THREE.Vector3(-9, 0.44, 8.8),
  emergency: new THREE.Vector3(21.5, 0.44, 9.2),
  inpatient: new THREE.Vector3(6, 0.44, -4.2),
};

const ZONE_CARDS: Array<{
  id: Focus;
  number: string;
  title: string;
  summary: string;
  details: string[];
}> = [
  {
    id: "all",
    number: "CAMPUS 00",
    title: "综合医院总览",
    summary: "三栋独立建筑 · 院内道路 · 步行连廊",
    details: ["门诊、急诊与病房区各自独立成楼", "车行道路、救护车道与步行系统分开"],
  },
  {
    id: "outpatient",
    number: "ZONE 01",
    title: "门诊区域",
    summary: "3 层 · 挂号候诊 · 诊室与药房",
    details: ["12 个候诊座位 / 6 间诊室", "检查床、医生桌、药房柜台与公共入口"],
  },
  {
    id: "emergency",
    number: "ZONE 02",
    title: "急诊区域",
    summary: "2 层 · 分诊抢救 · 独立救护车入口",
    details: ["3 个处置位 + 1 个抢救位", "影像设备、监护设备、救护车与雨棚"],
  },
  {
    id: "inpatient",
    number: "ZONE 03",
    title: "住院病房区域",
    summary: "6 层 · 12 间病房 · 护理站与停机坪",
    details: ["每层护理站 / 共 12 张病床", "双电梯、疏散楼梯与屋顶直升机坪"],
  },
];

type DemoApi = {
  setNight: (night: boolean) => void;
  setCutaway: (cutaway: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  focus: (focus: Focus) => void;
};

export function HospitalCampusDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [night, setNight] = useState(false);
  const [cutaway, setCutaway] = useState(false);
  const [shattered, setShattered] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [focus, setFocus] = useState<Focus>("all");
  const [operationsCollapsed, setOperationsCollapsed] = useState(false);
  const [metrics, setMetrics] = useState<HospitalMetrics | null>(null);

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
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-label", "综合医院门诊、急诊和住院病房低模展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdcecf0);
    scene.fog = new THREE.Fog(0xdcecf0, 84, 160);
    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 180);
    camera.position.copy(FOCUS.all.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.all.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 12;
    controls.maxDistance = 125;
    controls.maxPolarAngle = Math.PI * 0.49;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(66, 64),
      new THREE.MeshStandardMaterial({ color: 0xbfc8c3, roughness: 0.96 }),
    );
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    scene.add(ground);

    const hemi = new THREE.HemisphereLight(0xf6fbff, 0x56655d, 1.85);
    const sun = new THREE.DirectionalLight(0xfff1d2, 4.3);
    sun.position.set(-26, 38, 31);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 54;
    sun.shadow.camera.bottom = -42;
    sun.shadow.camera.far = 160;
    const fill = new THREE.DirectionalLight(0x9bc8d7, 0.72);
    fill.position.set(28, 15, -20);
    scene.add(hemi, sun, fill);

    const rabbitReference = buildLowPolyRabbitScaleReference();
    rabbitReference.position.copy(RABBIT_REFERENCE_POSITION.all);
    rabbitReference.rotation.y = -0.5;
    scene.add(rabbitReference);

    const hospital = buildLowPolyHospitalCampus();
    const normalMetrics = measureModelGeometry(hospital);
    const pair = createFurnitureShatterPair(hospital, { seed: 503, trianglesPerShard: 10, spread: 1.5 });
    const shatteredMetrics = measureModelGeometry(pair.shattered);
    pair.root.position.y = 0.16;
    scene.add(pair.root);
    setMetrics({ ...normalMetrics, shatteredFaceCount: shatteredMetrics.faceCount });

    const shatterMorph = new ShatterMorphController(0);
    const desiredTarget = FOCUS.all.target.clone();
    const desiredCamera = FOCUS.all.camera.clone();
    let rotating = false;
    let interacting = false;
    let focusBlend = 0;
    controls.addEventListener("start", () => { interacting = true; focusBlend = 0; });
    controls.addEventListener("end", () => { interacting = false; });

    const setNightMode = (on: boolean) => {
      scene.background = new THREE.Color(on ? 0x102a38 : 0xdcecf0);
      scene.fog = new THREE.Fog(on ? 0x102a38 : 0xdcecf0, on ? 70 : 84, on ? 140 : 160);
      hemi.intensity = on ? 0.48 : 1.85;
      sun.intensity = on ? 0.38 : 4.3;
      fill.intensity = on ? 0.25 : 0.72;
      renderer.toneMappingExposure = on ? 0.9 : 1.05;
      hospital.userData.setPowered(on);
    };
    const focusZone = (next: Focus) => {
      desiredTarget.copy(FOCUS[next].target);
      desiredCamera.copy(FOCUS[next].camera);
      rabbitReference.position.copy(RABBIT_REFERENCE_POSITION[next]);
      focusBlend = 1;
    };
    apiRef.current = {
      setNight: setNightMode,
      setCutaway: (on) => hospital.userData.setInteriorCutaway(on),
      setShattered: (on) => shatterMorph.animateTo(on),
      setAutoRotate: (enabled) => {
        rotating = enabled;
        controls.autoRotate = enabled;
        controls.autoRotateSpeed = 0.62;
      },
      focus: focusZone,
    };
    setNightMode(false);
    hospital.userData.setInteriorCutaway(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (shatterMorph.update(dt)) pair.setAmount(shatterMorph.getAmount());
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

  const chooseFocus = (next: Focus) => {
    setFocus(next);
    apiRef.current?.focus(next);
  };
  const toggleNight = () => {
    const next = !night;
    setNight(next);
    apiRef.current?.setNight(next);
  };
  const toggleCutaway = () => {
    const next = !cutaway;
    setCutaway(next);
    apiRef.current?.setCutaway(next);
  };
  const toggleShattered = () => {
    const next = !shattered;
    setShattered(next);
    apiRef.current?.setShattered(next);
  };
  const toggleRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    apiRef.current?.setAutoRotate(next);
  };

  return (
    <main className={styles.shell}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${operationsCollapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div>
            <p className={styles.eyebrow}>HEALTHCARE CAMPUS / LOW-POLY STUDY</p>
            <h1>综合医院 · 独立模型展示区</h1>
          </div>
          <button
            type="button"
            className={styles.collapseButton}
            aria-expanded={!operationsCollapsed}
            aria-controls="hospital-demo-operations"
            onClick={() => setOperationsCollapsed((current) => !current)}
          >
            {operationsCollapsed ? "展开操作 ↓" : "收起操作 ↑"}
          </button>
        </div>
        <div id="hospital-demo-operations" hidden={operationsCollapsed}>
          <p className={styles.intro}>医院是一个完整院区；门诊楼、急诊楼和住院病房楼是三栋互不相连的独立建筑，由院内车道、步行道与室外有顶连廊组织通行。</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.danger : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复医院模型" : "破碎医院模型"}</button>
            <button type="button" className={cutaway ? styles.active : ""} aria-pressed={cutaway} onClick={toggleCutaway}>{cutaway ? "恢复医院外观" : "查看医院内饰"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换晴天" : "查看夜间灯光"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleRotate}>{autoRotate ? "停止旋转" : "自动旋转"}</button>
            <button type="button" onClick={() => chooseFocus("all")}>医院全景</button>
          </div>
        </div>
      </header>

      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}>正常 / 破碎双版本 · {shattered ? "破碎态" : cutaway ? "内饰剖面" : "完整外观"} · 兔子 1.70 m 比例参考</div>

      <nav className={styles.zoneCards} aria-label="选择医院功能分区">
        {ZONE_CARDS.map((zone) => (
          <button
            key={zone.id}
            type="button"
            className={`${styles.zoneCard} ${focus === zone.id ? styles.selected : ""}`}
            onClick={() => chooseFocus(zone.id)}
          >
            <span>{zone.number}</span>
            <strong>{zone.title}</strong>
            <small>{zone.summary}</small>
            <ul>{zone.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          </button>
        ))}
      </nav>

      <aside className={styles.metrics} aria-label="医院模型参数">
        <span>MODEL SIZE</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(2)} × ${metrics.size.y.toFixed(2)} × ${metrics.size.z.toFixed(2)} m` : "计算中…"}</strong>
        <small>{metrics ? `正常 ${metrics.faceCount.toLocaleString("zh-CN")} / 破碎 ${metrics.shatteredFaceCount.toLocaleString("zh-CN")} 三角面` : "正在统计模型面数"}</small>
      </aside>
    </main>
  );
}
