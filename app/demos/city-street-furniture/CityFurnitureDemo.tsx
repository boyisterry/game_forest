"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  buildLowPolyFoodTruck,
  buildLowPolyHotDogKiosk,
  buildLowPolyNewsstand,
  buildLowPolyOfficeCampus,
  buildLowPolyPhoneBooth,
  buildLowPolyRoadsidePlanter,
  buildLowPolyHighRiseResidential,
  buildLowPolyResidentialBuilding,
  buildLowPolySmallVilla,
  buildLowPolyStreetLight,
  buildLowPolyTrafficLight,
  type TrafficPhase,
} from "../../lib/map/cityFurniture";
import {
  createFurnitureShatterPair,
  measureModelGeometry,
  type FurnitureShatterPair,
  type ModelGeometryMetrics,
} from "../../lib/map/cityFurnitureShatter";
import { ShatterMorphController } from "../../lib/map/shatterMorph";
import { prepareRabbitRiderReference, RABBIT_RIDER_URL } from "../../lib/map/rabbitRiderReference";
import styles from "./CityFurnitureDemo.module.css";

const TREE_URL = "/models/forest/tree_normal_medium_redwood_a.glb";
const SHATTER_TREE_URL = "/models/forest/tree_medium_redwood_a.glb";
const APARTMENT_SHOWCASE_SCALE = 1.5;
const VILLA_SHOWCASE_SCALE = 1.3;
const HIGH_RISE_SHOWCASE_SCALE = 1.05;
export type ShowcaseCategory = "street" | "residential";
const MODEL_FOCUS = {
  all: { target: new THREE.Vector3(5, 11, 17), camera: new THREE.Vector3(75, 46, 105) },
  tree: { target: new THREE.Vector3(-12, 5.7, -6), camera: new THREE.Vector3(-3, 10, 15) },
  lamp: { target: new THREE.Vector3(-3.5, 3.2, -6), camera: new THREE.Vector3(4, 7, 10) },
  signal: { target: new THREE.Vector3(5.5, 3, -6), camera: new THREE.Vector3(13, 7, 10) },
  phone: { target: new THREE.Vector3(12, 2.2, -6), camera: new THREE.Vector3(19, 6.5, 9) },
  truck: { target: new THREE.Vector3(-12, 2.2, 6), camera: new THREE.Vector3(-4, 6.7, 22) },
  hotdog: { target: new THREE.Vector3(-4, 2.25, 6), camera: new THREE.Vector3(3, 6.5, 20) },
  newsstand: { target: new THREE.Vector3(4, 2.2, 6), camera: new THREE.Vector3(11, 6.5, 20) },
  planter: { target: new THREE.Vector3(12, 0.9, 6), camera: new THREE.Vector3(19, 5.2, 19) },
  apartment: { target: new THREE.Vector3(-7, 7.5, 18), camera: new THREE.Vector3(-24, 17, 43) },
  villa: { target: new THREE.Vector3(7, 4.7, 18), camera: new THREE.Vector3(23, 12.5, 42) },
  highrise: { target: new THREE.Vector3(24, 17.5, 20), camera: new THREE.Vector3(43, 31, 76) },
  office: { target: new THREE.Vector3(0, 7.2, 44), camera: new THREE.Vector3(31, 22, 73) },
} as const;

const CATEGORY_OVERVIEW: Record<ShowcaseCategory, { target: THREE.Vector3; camera: THREE.Vector3 }> = {
  street: { target: new THREE.Vector3(0, 3.6, 0), camera: new THREE.Vector3(35, 22, 42) },
  residential: { target: new THREE.Vector3(5, 11, 28), camera: new THREE.Vector3(58, 35, 78) },
};

const CATEGORY_RIDER_FOREGROUND: Record<ShowcaseCategory, THREE.Vector3> = {
  street: new THREE.Vector3(0, 0.46, 14),
  residential: new THREE.Vector3(0, 0.46, 52),
};

type Focus = keyof typeof MODEL_FOCUS;
type ModelFocus = Exclude<Focus, "all">;
type ModelCardMetrics = ModelGeometryMetrics & { shatteredFaceCount: number };

const STREET_MODELS = new Set<ModelFocus>(["tree", "lamp", "signal", "phone", "truck", "hotdog", "newsstand", "planter"]);
const RESIDENTIAL_MODELS = new Set<ModelFocus>(["apartment", "villa", "highrise", "office"]);

const MODEL_CARDS: Array<{
  id: ModelFocus;
  number: string;
  title: string;
  summary: string;
  stats: Array<{ label: string; value: string }>;
}> = [
  {
    id: "tree",
    number: "MODEL 01",
    title: "城市行道树",
    summary: "森林地图正常树 · 中型红杉",
    stats: [
      { label: "模型来源", value: "项目内正常树 GLB" },
      { label: "主要材质", value: "树皮 PBR / 叶片" },
      { label: "适用位置", value: "人行道树池" },
    ],
  },
  {
    id: "lamp",
    number: "MODEL 02",
    title: "悬臂式路灯",
    summary: "8 边形灯杆 · 暖光灯头",
    stats: [
      { label: "灯杆结构", value: "8 边锥形金属杆" },
      { label: "照明类型", value: "暖色点光源" },
      { label: "可用交互", value: "昼夜照明切换" },
    ],
  },
  {
    id: "signal",
    number: "MODEL 03",
    title: "城市红绿灯",
    summary: "机动车信号 · 行人灯 · 按钮",
    stats: [
      { label: "信号相位", value: "红 / 黄 / 绿" },
      { label: "附属构件", value: "行人灯与过街按钮" },
      { label: "可用交互", value: "信号相位循环" },
    ],
  },
  {
    id: "truck",
    number: "MODEL 04",
    title: "路边流动餐车",
    summary: "售卖窗口 · 遮棚 · 菜单与车灯",
    stats: [
      { label: "行走机构", value: "4 车轮 / 双轴" },
      { label: "营业构件", value: "窗口、柜台、菜单板" },
      { label: "内部空间", value: "空心车厢 / 预留角色站位" },
      { label: "可用交互", value: "开窗与夜间灯光" },
    ],
  },
  {
    id: "hotdog",
    number: "MODEL 05",
    title: "街角热狗亭",
    summary: "条纹檐篷 · 烤台 · 热狗招牌",
    stats: [
      { label: "营业构件", value: "烤台与售卖柜台" },
      { label: "识别元素", value: "条纹檐篷 / 热狗招牌" },
      { label: "内部空间", value: "空心亭体 / 预留角色站位" },
      { label: "可用交互", value: "售卖窗开合与夜间内灯" },
    ],
  },
  {
    id: "newsstand",
    number: "MODEL 06",
    title: "社区卖报亭",
    summary: "展示架 · 报刊杂志 · 卷帘",
    stats: [
      { label: "展示层数", value: "3 层报刊架" },
      { label: "陈列数量", value: "15 份报刊杂志" },
      { label: "可用交互", value: "卷帘开合与夜间展示灯" },
    ],
  },
  {
    id: "phone",
    number: "MODEL 07",
    title: "城市电话亭",
    summary: "玻璃格门 · 电话机 · 夜间灯光",
    stats: [
      { label: "亭体结构", value: "金属框 / 透明玻璃" },
      { label: "内部设备", value: "电话机与听筒" },
      { label: "可用交互", value: "开门与夜间内灯" },
    ],
  },
  {
    id: "planter",
    number: "MODEL 08",
    title: "路边长条花坛",
    summary: "石质围边 · 矮灌木 · 彩色花朵",
    stats: [
      { label: "花坛结构", value: "长条砌石围边 / 可见土层" },
      { label: "种植内容", value: "4 组矮灌木 / 8 组花朵" },
      { label: "适用位置", value: "人行道边缘与建筑退界" },
    ],
  },
  {
    id: "apartment",
    number: "MODEL 09",
    title: "社区居民楼",
    summary: "五层住宅 · 阳台 · 屋顶设施",
    stats: [
      { label: "建筑结构", value: "5 层板式住宅 / 20 户" },
      { label: "立面构件", value: "可开合入口门、雨棚、阳台、窗台、空调外机" },
      { label: "内部空间", value: "空心楼梯井 / 折返楼梯贯通 5 层" },
      { label: "可用交互", value: "入口门打开与关闭" },
      { label: "屋顶构件", value: "楼梯间、水箱与女儿墙式平屋顶" },
    ],
  },
  {
    id: "villa",
    number: "MODEL 10",
    title: "坡顶小别墅",
    summary: "两层住宅 · 门廊 · 烟囱与露台",
    stats: [
      { label: "建筑结构", value: "2 层空心住宅 / 红色坡屋顶" },
      { label: "一层空间", value: "客厅、电视、沙发、餐厅与完整厨房" },
      { label: "二层空间", value: "实体楼梯、卧室、衣柜与独立卫生间" },
      { label: "可用交互", value: "入口门开合 / 两层剖面查看" },
      { label: "附属构件", value: "后露台、带泛水圈烟囱与正面花池" },
    ],
  },
  {
    id: "highrise",
    number: "MODEL 11",
    title: "18 层高层居民住宅",
    summary: "双电梯 · 独立应急楼梯 · 屋顶机房",
    stats: [
      { label: "建筑结构", value: "18 层塔式住宅 / 72 户" },
      { label: "垂直交通", value: "2 部透明观光电梯 / 轿厢与厅门朝向楼内" },
      { label: "消防疏散", value: "独立封闭式应急楼梯 / 每层防火门" },
      { label: "动态交互", value: "错峰自动升降、随机式停层 / 可暂停" },
      { label: "屋顶构件", value: "电梯机房、水箱、天线和平屋顶" },
    ],
  },
  {
    id: "office",
    number: "MODEL 12",
    title: "宽体总部办公园区",
    summary: "双楼翼 · 共享中庭 · 连桥与屋顶露台",
    stats: [
      { label: "建筑结构", value: "6 层主楼 + 5 层副楼 / 宽体园区式布局" },
      { label: "共享空间", value: "通高中庭、2 座玻璃连桥、落客广场与屋顶露台" },
      { label: "办公内饰", value: "24 组工位、6 间会议室、协作区、电话间与咖啡餐厅" },
      { label: "垂直交通", value: "2 部电梯 / 2 组独立应急楼梯" },
      { label: "后勤与节能", value: "装卸后场、机电房、暖通设备与 6 组光伏板" },
      { label: "可用交互", value: "办公内饰剖面 / 夜间办公灯光" },
    ],
  },
];

type DemoApi = {
  setNight: (night: boolean) => void;
  setPhase: (phase: TrafficPhase) => void;
  setServingOpen: (open: boolean) => void;
  setKiosksOpen: (open: boolean) => void;
  setApartmentDoorOpen: (open: boolean) => void;
  setVillaDoorOpen: (open: boolean) => void;
  setVillaInteriorCutaway: (cutaway: boolean) => void;
  setHighRiseInteriorCutaway: (cutaway: boolean) => void;
  setHighRiseElevatorAuto: (enabled: boolean) => void;
  setOfficeInteriorCutaway: (cutaway: boolean) => void;
  setShattered: (shattered: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  focus: (focus: Focus) => void;
};

function addPedestal(scene: THREE.Scene, x: number, z: number, accent: number, radius = 3.4) {
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius + 0.18, 0.42, 12),
    new THREE.MeshStandardMaterial({ color: 0xd8d4c9, roughness: 0.92 }),
  );
  base.position.set(x, 0.21, z);
  base.receiveShadow = true;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius - 0.2, 0.055, 5, 32),
    new THREE.MeshStandardMaterial({ color: accent, roughness: 0.62, metalness: 0.2 }),
  );
  ring.position.set(x, 0.45, z);
  ring.rotation.x = Math.PI * 0.5;
  scene.add(base, ring);
}

export function CityFurnitureDemo({ category = "street" }: { category?: ShowcaseCategory }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<DemoApi | null>(null);
  const [night, setNight] = useState(false);
  const [phase, setPhase] = useState<TrafficPhase>("red");
  const [autoRotate, setAutoRotate] = useState(false);
  const [servingOpen, setServingOpen] = useState(true);
  const [kiosksOpen, setKiosksOpen] = useState(true);
  const [apartmentDoorOpen, setApartmentDoorOpen] = useState(true);
  const [villaDoorOpen, setVillaDoorOpen] = useState(true);
  const [villaInteriorCutaway, setVillaInteriorCutaway] = useState(false);
  const [highRiseInteriorCutaway, setHighRiseInteriorCutaway] = useState(false);
  const [highRiseElevatorAuto, setHighRiseElevatorAuto] = useState(true);
  const [officeInteriorCutaway, setOfficeInteriorCutaway] = useState(false);
  const [operationsCollapsed, setOperationsCollapsed] = useState(false);
  const [shattered, setShattered] = useState(false);
  const [focus, setFocus] = useState<Focus>("all");
  const [expandedCard, setExpandedCard] = useState<ModelFocus | null>(null);
  const [modelMetrics, setModelMetrics] = useState<Partial<Record<ModelFocus, ModelCardMetrics>>>({});
  const [treeLoaded, setTreeLoaded] = useState(false);
  const [referenceReady, setReferenceReady] = useState(false);
  const visibleCards = MODEL_CARDS.filter((model) => (category === "street" ? STREET_MODELS : RESIDENTIAL_MODELS).has(model.id));

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
    renderer.domElement.setAttribute("aria-label", category === "street" ? "城市街道装饰低模展示场景" : "居民建筑低模展示场景");
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd9edf5);
    scene.fog = new THREE.Fog(0xd9edf5, 70, 155);
    const camera = new THREE.PerspectiveCamera(39, host.clientWidth / Math.max(host.clientHeight, 1), 0.1, 210);
    camera.position.copy(CATEGORY_OVERVIEW[category].camera);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(CATEGORY_OVERVIEW[category].target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.minDistance = 7;
    controls.maxDistance = 120;
    controls.maxPolarAngle = Math.PI * 0.49;

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(72, 64),
      new THREE.MeshStandardMaterial({ color: 0xbfc6bd, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    if (category === "street") {
      addPedestal(scene, -12, -6, 0x648456);
      addPedestal(scene, -4, -6, 0xb66a3d);
      addPedestal(scene, 4, -6, 0xd0a93e);
      addPedestal(scene, 12, -6, 0xb83d34, 2.8);
      addPedestal(scene, -12, 6, 0x3f8c88);
      addPedestal(scene, -4, 6, 0xe5b83e, 2.8);
      addPedestal(scene, 4, 6, 0x3f6f61, 2.8);
      addPedestal(scene, 12, 6, 0x8b7558);
    } else {
      addPedestal(scene, -7, 18, 0x9f6550, 5.8);
      addPedestal(scene, 7, 18, 0x8f4437, 5.7);
      addPedestal(scene, 24, 20, 0x476a73, 7.2);
      addPedestal(scene, 0, 44, 0xa26945, 17);
    }

    const hemi = new THREE.HemisphereLight(0xf4fbff, 0x59665a, 1.9);
    const sun = new THREE.DirectionalLight(0xfff0cf, 4.2);
    sun.position.set(-25, 42, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -72;
    sun.shadow.camera.right = 72;
    sun.shadow.camera.top = 58;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.far = 160;
    const fill = new THREE.DirectionalLight(0x9ac9de, 0.7);
    fill.position.set(16, 10, -12);
    scene.add(hemi, sun, fill);

    const riderAnchor = new THREE.Group();
    riderAnchor.name = "game-rabbit-rider-reference-anchor";
    riderAnchor.position.copy(CATEGORY_RIDER_FOREGROUND[category]);
    riderAnchor.rotation.y = Math.atan2(
      CATEGORY_OVERVIEW[category].camera.x - riderAnchor.position.x,
      CATEGORY_OVERVIEW[category].camera.z - riderAnchor.position.z,
    );
    scene.add(riderAnchor);

    const shatterPairs: FurnitureShatterPair[] = [];
    const shatterMorph = new ShatterMorphController(0);
    const initialMetrics: Partial<Record<ModelFocus, ModelCardMetrics>> = {};
    const addPairedDecoration = (
      id: ModelFocus,
      normal: THREE.Group,
      position: THREE.Vector3,
      rotationY: number,
      seed: number,
      displayScale = 1,
      trianglesPerShard = 4,
    ) => {
      const normalMetrics = measureModelGeometry(normal);
      const pair = createFurnitureShatterPair(normal, { seed, trianglesPerShard, spread: 1 });
      const shatteredMetrics = measureModelGeometry(pair.shattered);
      initialMetrics[id] = {
        ...normalMetrics,
        size: normalMetrics.size.clone().multiplyScalar(displayScale),
        shatteredFaceCount: shatteredMetrics.faceCount,
      };
      pair.root.position.copy(position);
      pair.root.rotation.y = rotationY;
      pair.root.scale.setScalar(displayScale);
      scene.add(pair.root);
      shatterPairs.push(pair);
      return pair;
    };

    const streetLight = category === "street" ? buildLowPolyStreetLight() : null;
    if (streetLight) addPairedDecoration("lamp", streetLight, new THREE.Vector3(-4.8, 0.42, -6), -0.2, 31);
    const trafficLight = category === "street" ? buildLowPolyTrafficLight() : null;
    if (trafficLight) addPairedDecoration("signal", trafficLight, new THREE.Vector3(3, 0.42, -6), -0.12, 67);
    const foodTruck = category === "street" ? buildLowPolyFoodTruck() : null;
    if (foodTruck) addPairedDecoration("truck", foodTruck, new THREE.Vector3(-12, 0.42, 6), -0.12, 103);
    const hotDogKiosk = category === "street" ? buildLowPolyHotDogKiosk() : null;
    if (hotDogKiosk) addPairedDecoration("hotdog", hotDogKiosk, new THREE.Vector3(-4, 0.42, 6), -0.08, 149);
    const newsstand = category === "street" ? buildLowPolyNewsstand() : null;
    if (newsstand) addPairedDecoration("newsstand", newsstand, new THREE.Vector3(4, 0.42, 6), -0.08, 191);
    const phoneBooth = category === "street" ? buildLowPolyPhoneBooth() : null;
    if (phoneBooth) addPairedDecoration("phone", phoneBooth, new THREE.Vector3(12, 0.42, -6), -0.08, 233);
    const planter = category === "street" ? buildLowPolyRoadsidePlanter() : null;
    if (planter) addPairedDecoration("planter", planter, new THREE.Vector3(12, 0.42, 6), -0.08, 257);
    const apartment = category === "residential" ? buildLowPolyResidentialBuilding() : null;
    if (apartment) addPairedDecoration("apartment", apartment, new THREE.Vector3(-7, 0.42, 18), -0.06, 293, APARTMENT_SHOWCASE_SCALE);
    const villa = category === "residential" ? buildLowPolySmallVilla() : null;
    if (villa) addPairedDecoration("villa", villa, new THREE.Vector3(7, 0.42, 18), 0.08, 331, VILLA_SHOWCASE_SCALE);
    const highRise = category === "residential" ? buildLowPolyHighRiseResidential() : null;
    if (highRise) addPairedDecoration("highrise", highRise, new THREE.Vector3(24, 0.42, 20), -0.05, 367, HIGH_RISE_SHOWCASE_SCALE, 8);
    const office = category === "residential" ? buildLowPolyOfficeCampus() : null;
    if (office) addPairedDecoration("office", office, new THREE.Vector3(0, 0.42, 44), 0, 401, 1, 12);
    setModelMetrics(initialMetrics);

    let disposed = false;
    const loader = new GLTFLoader();
    loader.loadAsync(RABBIT_RIDER_URL)
      .then((gltf) => {
        if (disposed) return;
        riderAnchor.add(prepareRabbitRiderReference(gltf.scene));
        setReferenceReady(true);
      })
      .catch(() => setReferenceReady(false));
    const prepareTree = (tree: THREE.Group, name: string) => {
      const container = new THREE.Group();
      container.name = name;
      tree.name = `${name}-source`;
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
      container.add(tree);
      return container;
    };
    if (category === "street") Promise.all([loader.loadAsync(TREE_URL), loader.loadAsync(SHATTER_TREE_URL)])
      .then(([normalGltf, shatteredGltf]) => {
        if (disposed) return;
        const normalTree = prepareTree(normalGltf.scene, "forest-normal-tree-showcase");
        const shatteredTreeSource = prepareTree(shatteredGltf.scene, "forest-shattered-tree-source");
        const normalTreeMetrics = measureModelGeometry(normalTree);
        const shatteredTreeMetrics = measureModelGeometry(shatteredTreeSource);
        const pair = createFurnitureShatterPair(normalTree, {
          seed: 271,
          shardSource: shatteredTreeSource,
          trianglesPerShard: 40,
          spread: 2.35,
        });
        pair.root.position.set(-12, 0.42, -6);
        pair.setAmount(shatterMorph.getAmount());
        scene.add(pair.root);
        shatterPairs.push(pair);
        setModelMetrics((current) => ({
          ...current,
          tree: { ...normalTreeMetrics, shatteredFaceCount: shatteredTreeMetrics.faceCount },
        }));
        shatteredTreeSource.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
        setTreeLoaded(true);
      })
      .catch(() => {
        if (!disposed) setTreeLoaded(false);
      });
    else setTreeLoaded(true);

    const desiredTarget = CATEGORY_OVERVIEW[category].target.clone();
    const desiredCamera = CATEGORY_OVERVIEW[category].camera.clone();
    let rotating = false;
    let interacting = false;
    let focusBlend = 0;
    controls.addEventListener("start", () => { interacting = true; focusBlend = 0; });
    controls.addEventListener("end", () => { interacting = false; });
    const setNightMode = (on: boolean) => {
      scene.background = new THREE.Color(on ? 0x102737 : 0xd9edf5);
      scene.fog = new THREE.Fog(on ? 0x102737 : 0xd9edf5, on ? 58 : 70, on ? 132 : 155);
      hemi.intensity = on ? 0.48 : 1.9;
      sun.intensity = on ? 0.42 : 4.2;
      fill.intensity = on ? 0.28 : 0.7;
      renderer.toneMappingExposure = on ? 0.88 : 1.08;
      streetLight?.userData.setPowered(on);
      foodTruck?.userData.setLights(on);
      hotDogKiosk?.userData.setPowered(on);
      newsstand?.userData.setPowered(on);
      phoneBooth?.userData.setPowered(on);
      apartment?.userData.setPowered(on);
      villa?.userData.setPowered(on);
      highRise?.userData.setPowered(on);
      office?.userData.setPowered(on);
    };
    const focusModel = (next: Focus) => {
      desiredTarget.copy(next === "all" ? CATEGORY_OVERVIEW[category].target : MODEL_FOCUS[next].target);
      desiredCamera.copy(next === "all" ? CATEGORY_OVERVIEW[category].camera : MODEL_FOCUS[next].camera);
      focusBlend = 1;
    };
    apiRef.current = {
      setNight: setNightMode,
      setPhase: (next) => trafficLight?.userData.setPhase(next),
      setServingOpen: (open) => foodTruck?.userData.setServingOpen(open),
      setKiosksOpen: (open) => {
        hotDogKiosk?.userData.setServingOpen(open);
        newsstand?.userData.setOpen(open);
        phoneBooth?.userData.setDoorOpen(open);
      },
      setApartmentDoorOpen: (open) => apartment?.userData.setDoorOpen(open),
      setVillaDoorOpen: (open) => villa?.userData.setDoorOpen(open),
      setVillaInteriorCutaway: (cutaway) => villa?.userData.setInteriorCutaway(cutaway),
      setHighRiseInteriorCutaway: (cutaway) => highRise?.userData.setInteriorCutaway(cutaway),
      setHighRiseElevatorAuto: (enabled) => highRise?.userData.setElevatorAuto(enabled),
      setOfficeInteriorCutaway: (cutaway) => office?.userData.setInteriorCutaway(cutaway),
      setShattered: (on) => shatterMorph.animateTo(on),
      setAutoRotate: (enabled) => { rotating = enabled; controls.autoRotate = enabled; controls.autoRotateSpeed = 0.75; },
      focus: focusModel,
    };
    setNightMode(false);
    trafficLight?.userData.setPhase("red");
    foodTruck?.userData.setServingOpen(true);
    hotDogKiosk?.userData.setServingOpen(true);
    newsstand?.userData.setOpen(true);
    phoneBooth?.userData.setDoorOpen(true);
    apartment?.userData.setDoorOpen(true);
    villa?.userData.setDoorOpen(true);
    villa?.userData.setInteriorCutaway(false);
    highRise?.userData.setInteriorCutaway(false);
    highRise?.userData.setElevatorFloors([4, 13]);
    highRise?.userData.setElevatorAuto(true);
    office?.userData.setInteriorCutaway(false);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      highRise?.userData.updateElevators(dt);
      if (shatterMorph.update(dt)) {
        const amount = shatterMorph.getAmount();
        shatterPairs.forEach((pair) => pair.setAmount(amount));
      }
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
  }, [category]);

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
  const toggleKiosks = () => {
    const next = !kiosksOpen;
    setKiosksOpen(next);
    apiRef.current?.setKiosksOpen(next);
  };
  const toggleApartmentDoor = () => {
    const next = !apartmentDoorOpen;
    setApartmentDoorOpen(next);
    apiRef.current?.setApartmentDoorOpen(next);
  };
  const toggleVillaDoor = () => {
    const next = !villaDoorOpen;
    setVillaDoorOpen(next);
    apiRef.current?.setVillaDoorOpen(next);
  };
  const toggleVillaInterior = () => {
    const next = !villaInteriorCutaway;
    setVillaInteriorCutaway(next);
    apiRef.current?.setVillaInteriorCutaway(next);
    chooseFocus("villa");
  };
  const toggleHighRiseInterior = () => {
    const next = !highRiseInteriorCutaway;
    setHighRiseInteriorCutaway(next);
    apiRef.current?.setHighRiseInteriorCutaway(next);
    chooseFocus("highrise");
  };
  const toggleHighRiseElevatorAuto = () => {
    const next = !highRiseElevatorAuto;
    setHighRiseElevatorAuto(next);
    apiRef.current?.setHighRiseElevatorAuto(next);
    chooseFocus("highrise");
  };
  const toggleOfficeInterior = () => {
    const next = !officeInteriorCutaway;
    setOfficeInteriorCutaway(next);
    apiRef.current?.setOfficeInteriorCutaway(next);
    chooseFocus("office");
  };
  const toggleShattered = () => {
    const next = !shattered;
    setShattered(next);
    apiRef.current?.setShattered(next);
  };
  const chooseFocus = (next: Focus) => {
    setFocus(next);
    apiRef.current?.focus(next);
  };
  const toggleCardDetails = (model: ModelFocus) => {
    setExpandedCard((current) => current === model ? null : model);
  };

  return (
    <main className={styles.shell}>
      <div ref={hostRef} className={styles.canvasHost} />
      <header className={`${styles.header} ${operationsCollapsed ? styles.collapsed : ""}`}>
        <div className={styles.headerTop}>
          <div className={styles.headerTitle}>
            <p className={styles.eyebrow}>{category === "street" ? "CITY FURNITURE / LOW-POLY STUDY" : "RESIDENTIAL ARCHITECTURE / LOW-POLY STUDY"}</p>
            <h1>{category === "street" ? "城市街道装饰 · 独立模型展厅" : "居民建筑 · 独立模型展厅"}</h1>
          </div>
          <button
            type="button"
            className={styles.collapseButton}
            aria-expanded={!operationsCollapsed}
            aria-controls="city-demo-operations"
            onClick={() => setOperationsCollapsed((current) => !current)}
          >
            {operationsCollapsed ? "展开操作 ↓" : "收起操作 ↑"}
          </button>
        </div>
        <div id="city-demo-operations" className={styles.headerContent} hidden={operationsCollapsed}>
          <p className={styles.intro}>{category === "street"
            ? "本展厅仅展示行道树、路灯、信号灯、餐车、街边亭、电话亭与花坛；居民楼与其他建筑已移至居民建筑展厅。"
            : "本展厅集中展示社区居民楼、坡顶别墅、18 层高层住宅及宽体办公园区，并保留完整内饰与建筑交互。"}</p>
          <div className={styles.actions}>
            <button type="button" className={shattered ? styles.danger : ""} aria-pressed={shattered} onClick={toggleShattered}>{shattered ? "修复全部模型" : "破碎全部模型"}</button>
            <button type="button" className={night ? styles.active : ""} aria-pressed={night} onClick={toggleNight}>{night ? "切换晴天" : "查看夜间灯光"}</button>
            {category === "street" ? <>
              <button type="button" onClick={cyclePhase}>信号灯：{phase === "red" ? "红灯" : phase === "green" ? "绿灯" : "黄灯"}</button>
              <button type="button" className={servingOpen ? styles.active : ""} onClick={toggleServing}>{servingOpen ? "收起餐车窗口" : "打开餐车窗口"}</button>
              <button type="button" className={kiosksOpen ? styles.active : ""} onClick={toggleKiosks}>{kiosksOpen ? "关闭三个亭子" : "打开三个亭子"}</button>
            </> : <>
              <button type="button" className={apartmentDoorOpen ? styles.active : ""} aria-pressed={apartmentDoorOpen} onClick={toggleApartmentDoor}>{apartmentDoorOpen ? "关闭居民楼入口门" : "打开居民楼入口门"}</button>
              <button type="button" className={villaDoorOpen ? styles.active : ""} aria-pressed={villaDoorOpen} onClick={toggleVillaDoor}>{villaDoorOpen ? "关闭别墅入口门" : "打开别墅入口门"}</button>
              <button type="button" className={villaInteriorCutaway ? styles.active : ""} aria-pressed={villaInteriorCutaway} onClick={toggleVillaInterior}>{villaInteriorCutaway ? "恢复别墅外观" : "查看别墅内部"}</button>
              <button type="button" className={highRiseInteriorCutaway ? styles.active : ""} aria-pressed={highRiseInteriorCutaway} onClick={toggleHighRiseInterior}>{highRiseInteriorCutaway ? "恢复高层外观" : "查看高层内部"}</button>
              <button type="button" className={highRiseElevatorAuto ? styles.active : ""} aria-pressed={highRiseElevatorAuto} onClick={toggleHighRiseElevatorAuto}>{highRiseElevatorAuto ? "关闭电梯自动运行" : "开启电梯自动运行"}</button>
              <button type="button" className={officeInteriorCutaway ? styles.active : ""} aria-pressed={officeInteriorCutaway} onClick={toggleOfficeInterior}>{officeInteriorCutaway ? "恢复办公楼外观" : "查看办公楼内部"}</button>
            </>}
            <button type="button" className={autoRotate ? styles.active : ""} onClick={toggleRotate}>{autoRotate ? "停止旋转" : "自动旋转"}</button>
            <button type="button" onClick={() => chooseFocus("all")}>全景</button>
          </div>
        </div>
      </header>
      <div className={styles.status}>{treeLoaded
        ? `${visibleCards.length} / ${visibleCards.length} 双版本已就绪 · ${shattered ? "破碎态" : "正常态"} · ${referenceReady ? "现有骑车兔子约 2.40 m 参考" : "骑车兔子加载中"}`
        : "正在载入树木双版本…"}</div>
      <a className={styles.backLink} href="/demos">← 返回模型分类</a>
      <nav className={styles.modelCards} aria-label="选择展示模型">
        {visibleCards.map((model) => {
          const expanded = expandedCard === model.id;
          const metrics = modelMetrics[model.id];
          return (
            <article key={model.id} className={`${styles.modelCard} ${focus === model.id ? styles.active : ""} ${expanded ? styles.expanded : ""}`}>
              <button type="button" className={styles.modelFocusButton} onClick={() => chooseFocus(model.id)}>
                <span>{model.number}</span><strong>{model.title}</strong><small>{model.summary}</small>
              </button>
              <button
                type="button"
                className={styles.expandButton}
                aria-expanded={expanded}
                aria-controls={`model-data-${model.id}`}
                onClick={() => toggleCardDetails(model.id)}
              >
                {expanded ? "收起参数 −" : "查看参数 +"}
              </button>
              {expanded ? (
                <div id={`model-data-${model.id}`} className={styles.modelData}>
                  <dl>
                    <div><dt>模型版本</dt><dd>正常版本 / 独立破碎版本</dd></div>
                    <div>
                      <dt>模型大小（宽 × 高 × 深）</dt>
                      <dd>{metrics ? `${metrics.size.x.toFixed(2)} × ${metrics.size.y.toFixed(2)} × ${metrics.size.z.toFixed(2)} m` : "计算中…"}</dd>
                    </div>
                    <div>
                      <dt>模型面数</dt>
                      <dd>{metrics ? `正常 ${metrics.faceCount.toLocaleString("zh-CN")} / 破碎 ${metrics.shatteredFaceCount.toLocaleString("zh-CN")} 三角面` : "计算中…"}</dd>
                    </div>
                    {model.stats.map((stat) => (
                      <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>
                    ))}
                  </dl>
                </div>
              ) : null}
            </article>
          );
        })}
      </nav>
      <div className={styles.legend}>拖拽旋转 · 滚轮缩放 · 一键破碎或修复 · 展开查看参数</div>
    </main>
  );
}
