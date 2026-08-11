"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { buildLowPolyAmusementPark, type AmusementFacility } from "../../lib/map/amusementPark";
import { measureModelGeometry, type ModelGeometryMetrics } from "../../lib/map/cityFurnitureShatter";
import styles from "./AmusementParkDemo.module.css";

const PARK_TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";
const RABBIT_RIDER_URL = "/models/rabbit-rider.glb";

type Focus = AmusementFacility;

const FOCUS: Record<Focus, { target: THREE.Vector3; camera: THREE.Vector3 }> = {
  overview: { target: new THREE.Vector3(0, 6, -1), camera: new THREE.Vector3(84, 58, 100) },
  coaster: { target: new THREE.Vector3(-23, 8, -25), camera: new THREE.Vector3(-3, 26, 16) },
  carousel: { target: new THREE.Vector3(-25, 3.5, 17), camera: new THREE.Vector3(-9, 12, 37) },
  pirate: { target: new THREE.Vector3(-8, 4.5, 18), camera: new THREE.Vector3(9, 14, 37) },
  playground: { target: new THREE.Vector3(-11, 4, -5), camera: new THREE.Vector3(4, 12, 16) },
  circus: { target: new THREE.Vector3(-31, 5.5, -5), camera: new THREE.Vector3(-13, 17, 16) },
  shooting: { target: new THREE.Vector3(8.5, 3, -5), camera: new THREE.Vector3(21, 10, 15) },
  karting: { target: new THREE.Vector3(28, 2.5, -23), camera: new THREE.Vector3(48, 17, 6) },
  ferris: { target: new THREE.Vector3(24, 10, 16), camera: new THREE.Vector3(46, 24, 42) },
  "drop-tower": { target: new THREE.Vector3(25, 10, -5), camera: new THREE.Vector3(44, 25, 25) },
};

const FACILITY_CARDS: Array<{
  id: Focus;
  number: string;
  title: string;
  summary: string;
  detail: string;
}> = [
  { id: "overview", number: "PARK 00", title: "全园总览", summary: "12 项设施 · 都市天际线 · 环形游园动线", detail: "入口广场、中央喷泉、主题商街与四大游乐分区" },
  { id: "coaster", number: "THRILL 01", title: "云际过山车", summary: "双轨道 · 4 节列车 · 高低落差", detail: "沿城市天际线连续穿梭的主力刺激项目" },
  { id: "ferris", number: "ICON 02", title: "星环摩天轮", summary: "14 座彩色轿厢 · 持续运行", detail: "保持水平的观景轿厢与夜间轮廓灯" },
  { id: "carousel", number: "FAMILY 03", title: "皇家旋转木马", summary: "12 匹木马 · 双层灯带", detail: "上下起伏的木马与经典锥顶华盖" },
  { id: "pirate", number: "THRILL 04", title: "风暴海盗船", summary: "悬吊摆臂 · 船帆与桅杆", detail: "真实枢轴结构带来大角度往复摆动" },
  { id: "playground", number: "KIDS 05", title: "彩虹翻斗乐", summary: "玻璃馆 · 攀爬塔 · 连通滑筒", detail: "全天候室内儿童攀爬与探索空间" },
  { id: "circus", number: "SHOW 06", title: "大帐篷马戏团", summary: "16 边帐篷 · 演出入口 · 旗塔", detail: "乐园表演中心与家庭秀场" },
  { id: "shooting", number: "GAME 07", title: "西部射击游戏场", summary: "7 组升降靶 · 开放柜台", detail: "交错移动的目标组成轻竞技体验" },
  { id: "karting", number: "RACE 08", title: "极速卡丁车场", summary: "封闭赛道 · 6 台赛车 · 维修区", detail: "多弯城市赛道与持续巡回赛车" },
  { id: "drop-tower", number: "THRILL 09", title: "天空坠落塔", summary: "20 米塔柱 · 旋转座舱", detail: "高空停留与快速升降的地标设施" },
];

const RIDER_POSITIONS: Record<Focus, THREE.Vector3> = {
  overview: new THREE.Vector3(5, 0.46, 26),
  coaster: new THREE.Vector3(-14, 0.46, -19),
  carousel: new THREE.Vector3(-18, 0.46, 17),
  pirate: new THREE.Vector3(-1, 0.46, 18),
  playground: new THREE.Vector3(-3, 0.46, 1),
  circus: new THREE.Vector3(-22, 0.46, 1),
  shooting: new THREE.Vector3(16, 0.46, 0),
  karting: new THREE.Vector3(21, 0.46, -17),
  ferris: new THREE.Vector3(14, 0.46, 17),
  "drop-tower": new THREE.Vector3(18, 0.46, 1),
};

type DemoApi = {
  setNight: (night: boolean) => void;
  setMotion: (running: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  focus: (focus: Focus) => void;
};

export function AmusementParkDemo() {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [focus, setFocus] = useState<Focus>("overview");
  const [night, setNight] = useState(false);
  const [motion, setMotion] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [metrics, setMetrics] = useState<ModelGeometryMetrics | null>(null);
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
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute("aria-label", "奇境都会大型游乐园三维模型，可拖拽旋转并缩放查看");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfdce5);
    scene.fog = new THREE.Fog(0xbfdce5, 105, 195);
    const camera = new THREE.PerspectiveCamera(37, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 240);
    camera.position.copy(FOCUS.overview.camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(FOCUS.overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 11;
    controls.maxDistance = 175;
    controls.maxPolarAngle = Math.PI * 0.49;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(105, 64),
      new THREE.MeshStandardMaterial({ color: 0x87a985, roughness: 0.98 }),
    );
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.04;
    ground.receiveShadow = true;
    scene.add(ground);

    const hemi = new THREE.HemisphereLight(0xf8fcff, 0x415849, 2.15);
    const sun = new THREE.DirectionalLight(0xffefc8, 4.8);
    sun.position.set(-42, 58, 36);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -72;
    sun.shadow.camera.right = 72;
    sun.shadow.camera.top = 62;
    sun.shadow.camera.bottom = -55;
    sun.shadow.camera.far = 180;
    const fill = new THREE.DirectionalLight(0x88b9d2, 0.72);
    fill.position.set(45, 22, -36);
    scene.add(hemi, sun, fill);

    const park = buildLowPolyAmusementPark();
    scene.add(park);
    setMetrics(measureModelGeometry(park));

    const riderReference = new THREE.Group();
    riderReference.name = "game-rabbit-rider-scale-reference";
    riderReference.userData = {
      modelType: "game-rabbit-rider-scale-reference",
      sourceModel: RABBIT_RIDER_URL,
      referenceLengthMeters: 2.4,
    };
    riderReference.position.copy(RIDER_POSITIONS.overview);
    riderReference.rotation.y = -0.65;
    scene.add(riderReference);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(PARK_TREE_URL)
      .then((gltf) => {
        if (disposed) return;
        const template = gltf.scene;
        template.name = "amusement-park-reused-city-tree";
        template.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
        });
        let bounds = new THREE.Box3().setFromObject(template);
        const targetHeight = 5.3;
        template.scale.setScalar(targetHeight / Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001));
        template.updateMatrixWorld(true);
        bounds = new THREE.Box3().setFromObject(template);
        const center = bounds.getCenter(new THREE.Vector3());
        template.position.set(-center.x, -bounds.min.y, -center.z);
        template.updateMatrixWorld(true);

        const anchors: THREE.Group[] = [];
        park.traverse((object) => {
          if (object instanceof THREE.Group && object.name === "amusement-park-reused-tree-anchor") anchors.push(object);
        });
        anchors.forEach((anchor) => {
          const tree = template.clone(true);
          tree.scale.multiplyScalar(anchor.userData.scaleMultiplier ?? 1);
          anchor.add(tree);
        });
        setMetrics(measureModelGeometry(park));
      })
      .catch(() => undefined);

    loader.loadAsync(RABBIT_RIDER_URL)
      .then((gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        model.name = "game-rabbit-rider-model";
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
        });
        let bounds = new THREE.Box3().setFromObject(model);
        const size = bounds.getSize(new THREE.Vector3());
        model.scale.setScalar(2.4 / Math.max(size.y, size.x, size.z, 0.001));
        model.rotation.y = -Math.PI * 0.5;
        model.updateMatrixWorld(true);
        bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        model.position.sub(center);
        model.position.y += bounds.getSize(new THREE.Vector3()).y * 0.5;
        riderReference.add(model);
        setReferenceReady(true);
      })
      .catch(() => setReferenceReady(false));

    const desiredTarget = FOCUS.overview.target.clone();
    const desiredCamera = FOCUS.overview.camera.clone();
    let focusBlend = 0;
    let interacting = false;
    let rotating = false;
    controls.addEventListener("start", () => { interacting = true; focusBlend = 0; });
    controls.addEventListener("end", () => { interacting = false; });

    const setNightMode = (on: boolean) => {
      const color = on ? 0x101b36 : 0xbfdce5;
      scene.background = new THREE.Color(color);
      scene.fog = new THREE.Fog(color, on ? 88 : 105, on ? 170 : 195);
      hemi.intensity = on ? 0.46 : 2.15;
      sun.intensity = on ? 0.28 : 4.8;
      fill.intensity = on ? 0.25 : 0.72;
      renderer.toneMappingExposure = on ? 0.88 : 1.05;
      park.userData.setPowered(on);
    };

    apiRef.current = {
      setNight: setNightMode,
      setMotion: (running) => park.userData.setMotionEnabled(running),
      setAutoRotate: (enabled) => {
        rotating = enabled;
        controls.autoRotate = enabled;
        controls.autoRotateSpeed = 0.5;
      },
      focus: (next) => {
        desiredTarget.copy(FOCUS[next].target);
        desiredCamera.copy(FOCUS[next].camera);
        riderReference.position.copy(RIDER_POSITIONS[next]);
        focusBlend = 1;
      },
    };

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;
      park.userData.update(delta, elapsed);
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

  const chooseFocus = (next: Focus) => {
    setFocus(next);
    apiRef.current?.focus(next);
  };
  const toggleNight = () => {
    const next = !night;
    setNight(next);
    apiRef.current?.setNight(next);
  };
  const toggleMotion = () => {
    const next = !motion;
    setMotion(next);
    apiRef.current?.setMotion(next);
  };
  const toggleAutoRotate = () => {
    const next = !autoRotate;
    setAutoRotate(next);
    apiRef.current?.setAutoRotate(next);
  };

  return (
    <main className={`${styles.shell} ${night ? styles.night : ""}`}>
      <div ref={hostRef} className={styles.canvasHost} />

      <header className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div>
            <p className={styles.eyebrow}>WONDER CITY / AMUSEMENT DISTRICT 01</p>
            <h1>奇境都会游乐园</h1>
          </div>
          <button type="button" className={styles.collapseButton} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "展开导览 ↓" : "收起导览 ↑"}
          </button>
        </div>
        <div hidden={collapsed}>
          <p className={styles.intro}>独立城市模型展示区，以中央大道串联四个游乐片区；园林树木、花坛、餐车和路灯均复用项目现有饰品模型，并放置游戏主角兔子骑车作为统一尺度参考。</p>
          <div className={styles.actions}>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换白昼" : "点亮夜景"}</button>
            <button type="button" className={!motion ? styles.paused : ""} aria-pressed={!motion} onClick={toggleMotion}>{motion ? "暂停所有设施" : "启动所有设施"}</button>
            <button type="button" className={autoRotate ? styles.active : ""} aria-pressed={autoRotate} onClick={toggleAutoRotate}>{autoRotate ? "停止环游" : "自动环游"}</button>
            <button type="button" onClick={() => chooseFocus("overview")}>返回全园视角</button>
          </div>
        </div>
      </header>

      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <div className={styles.status}><span /> {night ? "NIGHT PARADE" : "PARK OPEN"} · {motion ? "设施运行中" : "设施已暂停"}</div>

      <aside className={styles.metrics} aria-label="游乐园模型参数">
        <span>WONDER CITY MODEL</span>
        <strong>{metrics ? `${metrics.size.x.toFixed(0)} × ${metrics.size.y.toFixed(0)} × ${metrics.size.z.toFixed(0)} m` : "统计中…"}</strong>
        <small>{metrics ? `${metrics.faceCount.toLocaleString("zh-CN")} 三角面 · 复用 4 类既有饰品 · ${referenceReady ? "兔子骑车主角约 2.40 m 参考" : "主角参考加载中"}` : "正在计算场景规模"}</small>
      </aside>

      <nav className={styles.facilityRail} aria-label="选择游乐设施">
        {FACILITY_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`${styles.facilityCard} ${focus === card.id ? styles.selected : ""}`}
            onClick={() => chooseFocus(card.id)}
          >
            <span>{card.number}</span>
            <strong>{card.title}</strong>
            <small>{card.summary}</small>
            <em>{card.detail}</em>
          </button>
        ))}
      </nav>
    </main>
  );
}
