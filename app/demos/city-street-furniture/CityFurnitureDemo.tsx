"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  buildLowPolyFoodTruck,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
  type TrafficPhase,
} from "../../lib/map/cityFurniture";
import styles from "./CityFurnitureDemo.module.css";

const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";
const MODEL_FOCUS = {
  all: { target: new THREE.Vector3(0, 4.1, 0), camera: new THREE.Vector3(31, 15, 41) },
  tree: { target: new THREE.Vector3(-12, 5.7, 0), camera: new THREE.Vector3(-3, 10, 21) },
  lamp: { target: new THREE.Vector3(-3.5, 3.2, 0), camera: new THREE.Vector3(4, 7, 16) },
  signal: { target: new THREE.Vector3(5.5, 3, 0), camera: new THREE.Vector3(13, 7, 16) },
  truck: { target: new THREE.Vector3(12, 2.2, 0), camera: new THREE.Vector3(20, 6.7, 17) },
} as const;

type Focus = keyof typeof MODEL_FOCUS;

type DemoApi = {
  setNight: (night: boolean) => void;
  setPhase: (phase: TrafficPhase) => void;
  setServingOpen: (open: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  focus: (focus: Focus) => void;
};

function addPedestal(scene: THREE.Scene, x: number, accent: number) {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.58, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8d4c9, roughness: 0.92 }),
  );
  base.position.set(x, 0.21, 0);
  base.receiveShadow = true;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.055, 5, 32),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.62, metalness: 0.2 }),
  );
  ring.position.set(x, 0.45, 0);
  ring.rotation.x = Math.PI * 0.5;
  scene.add(base, ring);
}

export function CityFurnitureDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [night, setNight] = useState(false);
  const [phase, setPhase] = useState<TrafficPhase>("red");
  const [autoRotate, setAutoRotate] = useState(false);
  const [servingOpen, setServingOpen] = useState(true);
  const [focus, setFocus] = useState<Focus>("all");
  const [treeLoaded, setTreeLoaded] = useState(false);

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
    renderer.domElement.setAttribute("aria-label", "城市树木、路灯和红绿灯低模展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd9edf5);
    scene.fog = new THREE.Fog(0xd9edf5, 45, 86);
    const camera = new THREE.PerspectiveCamera(39, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 130);
    camera.position.copy(MODEL_FOCUS.all.camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(MODEL_FOCUS.all.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 7;
    controls.maxDistance = 58;
    controls.maxPolarAngle = Math.PI * 0.49;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(38, 48),
      new THREE.MeshStandardMaterial({ color: 0xbfc6bd, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    addPedestal(scene, -12, 0x648456);
    addPedestal(scene, -4, 0xb66a3d);
    addPedestal(scene, 4, 0xd0a93e);
    addPedestal(scene, 12, 0x3f8c88);

    const hemi = new THREE.HemisphereLight(0xf4fbff, 0x59665a, 1.9);
    const sun = new THREE.DirectionalLight(0xfff0cf, 4.2);
    sun.position.set(-12, 20, 13);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -12;
    const fill = new THREE.DirectionalLight(0x9ac9de, 0.7);
    fill.position.set(16, 10, -12);
    scene.add(hemi, sun, fill);

    const streetLight = buildLowPolyStreetLight();
    streetLight.position.set(-4.8, 0.42, 0);
    streetLight.rotation.y = -0.2;
    scene.add(streetLight);
    const trafficLight = buildLowPolyTrafficLight();
    trafficLight.position.set(3, 0.42, 0);
    trafficLight.rotation.y = -0.12;
    scene.add(trafficLight);
    const foodTruck = buildLowPolyFoodTruck();
    foodTruck.position.set(12, 0.42, 0);
    foodTruck.rotation.y = -0.12;
    scene.add(foodTruck);

    const treeRoot = new THREE.Group();
    treeRoot.name = "forest-normal-tree-showcase";
    treeRoot.position.set(-12, 0.42, 0);
    scene.add(treeRoot);
    const loader = new GLTFLoader();
    loader.load(
      TREE_URL,
      (gltf) => {
        const tree = gltf.scene;
        tree.name = "forest-normal-tree-medium-redwood";
        tree.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        const box = new THREE.Box3().setFromObject(tree);
        const size = box.getSize(new THREE.Vector3());
        const scale = 11.2 / Math.max(size.y, 0.001);
        tree.scale.setScalar(scale);
        box.setFromObject(tree);
        const center = box.getCenter(new THREE.Vector3());
        tree.position.x -= center.x;
        tree.position.z -= center.z;
        tree.position.y -= box.min.y;
        treeRoot.add(tree);
        setTreeLoaded(true);
      },
      undefined,
      () => setTreeLoaded(false),
    );

    const desiredTarget = MODEL_FOCUS.all.target.clone();
    const desiredCamera = MODEL_FOCUS.all.camera.clone();
    let rotating = false;
    let interacting = false;
    let focusBlend = 0;
    controls.addEventListener("start", () => { interacting = true; focusBlend = 0; });
    controls.addEventListener("end", () => { interacting = false; });
    const setNightMode = (on: boolean) => {
      scene.background = new THREE.Color(on ? 0x102737 : 0xd9edf5);
      scene.fog = new THREE.Fog(on ? 0x102737 : 0xd9edf5, on ? 35 : 45, on ? 72 : 86);
      hemi.intensity = on ? 0.48 : 1.9;
      sun.intensity = on ? 0.42 : 4.2;
      fill.intensity = on ? 0.28 : 0.7;
      renderer.toneMappingExposure = on ? 0.88 : 1.08;
      streetLight.userData.setPowered(on);
      foodTruck.userData.setLights(on);
    };
    const focusModel = (next: Focus) => {
      desiredTarget.copy(MODEL_FOCUS[next].target);
      desiredCamera.copy(MODEL_FOCUS[next].camera);
      focusBlend = 1;
    };
    apiRef.current = {
      setNight: setNightMode,
      setPhase: (next) => trafficLight.userData.setPhase(next),
      setServingOpen: (open) => foodTruck.userData.setServingOpen(open),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.75; },
      focus: focusModel,
    };
    setNightMode(false);
    trafficLight.userData.setPhase("red");
    foodTruck.userData.setServingOpen(true);

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

  const toggleNight = () => {
    const next = !night;
    setNight(next);
    apiRef.current?.setNight(next);
  };
  const cyclePhase = () => {
    const next = phase === "red" ? "green" : phase === "green" ? "yellow" : "red";
    setPhase(next);
    apiRef.current?.setPhase(next);
  };
  const toggleRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    apiRef.current?.setAutoRotate(next);
  };
  const toggleServing = () => {
    const next = !servingOpen;
    setServingOpen(next);
    apiRef.current?.setServingOpen(next);
  };
  const chooseFocus = (next: Focus) => {
    setFocus(next);
    apiRef.current?.focus(next);
  };

  return (
    <main className={styles.shell}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={styles.header}>
        <p className={styles.eyebrow}>CITY FURNITURE / LOW-POLY STUDY</p>
        <h1>城市街道设施 · 独立模型展厅</h1>
        <p className={styles.intro}>森林同款正常树使用项目内生成资产；路灯、红绿灯与流动餐车由基础几何独立建模。场景不连接任何第三方 API 或模型服务。</p>
        <div className={styles.actions}>
          <button type="button" className={night ? styles.active : ""} onClick={toggleNight}>{night ? "切换晴天" : "查看夜间灯光"}</button>
          <button type="button" onClick={cyclePhase}>信号灯：{phase === "red" ? "红灯" : phase === "green" ? "绿灯" : "黄灯"}</button>
          <button type="button" className={servingOpen ? styles.active : ""} onClick={toggleServing}>{servingOpen ? "收起餐车窗口" : "打开餐车窗口"}</button>
          <button type="button" className={autoRotate ? styles.active : ""} onClick={toggleRotate}>{autoRotate ? "停止旋转" : "自动旋转"}</button>
          <button type="button" onClick={() => chooseFocus("all")}>全景</button>
        </div>
      </header>
      <div className={styles.status}>{treeLoaded ? "4 / 4 模型已就绪" : "正在载入森林同款树模型…"}</div>
      <nav className={styles.modelCards} aria-label="选择展示模型">
        <button type="button" className={`${styles.modelCard} ${focus === "tree" ? styles.active : ""}`} onClick={() => chooseFocus("tree")}>
          <span>MODEL 01</span><strong>城市行道树</strong><small>森林地图正常树 · 中型红杉</small>
        </button>
        <button type="button" className={`${styles.modelCard} ${focus === "lamp" ? styles.active : ""}`} onClick={() => chooseFocus("lamp")}>
          <span>MODEL 02</span><strong>悬臂式路灯</strong><small>8 边形灯杆 · 暖光灯头</small>
        </button>
        <button type="button" className={`${styles.modelCard} ${focus === "signal" ? styles.active : ""}`} onClick={() => chooseFocus("signal")}>
          <span>MODEL 03</span><strong>城市红绿灯</strong><small>机动车信号 · 行人灯 · 按钮</small>
        </button>
        <button type="button" className={`${styles.modelCard} ${focus === "truck" ? styles.active : ""}`} onClick={() => chooseFocus("truck")}>
          <span>MODEL 04</span><strong>路边流动餐车</strong><small>售卖窗口 · 遮棚 · 菜单与车灯</small>
        </button>
      </nav>
      <div className={styles.legend}>拖拽旋转 · 滚轮缩放 · 点击卡片聚焦</div>
    </main>
  );
}
