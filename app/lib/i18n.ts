export type Locale = "en" | "zh";

export const LOCALE_STORAGE_KEY = "forest-courier-locale";
export const DEFAULT_LOCALE: Locale = "en";

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === "en" || raw === "zh") return raw;
  } catch {
    // private mode / blocked storage
  }
  return DEFAULT_LOCALE;
}

export function writeStoredLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

type Copy = {
  skipLink: string;
  viewportPlay: string;
  viewportWorkshop: string;
  modeSwitch: string;
  workshop: string;
  play: string;
  backToWorkshop: string;
  hideRider: string;
  showRider: string;
  overviewCam: string;
  understoryCam: string;
  collapseParams: string;
  mapParams: string;
  trees: string;
  grass: string;
  stones: string;
  chunks: string;
  minimapPlay: string;
  minimapWorkshop: string;
  driveHint: string;
  mute: string;
  unmute: string;
  routeLabel: string;
  routeNote: string;
  panelEyebrow: string;
  panelTitle: string;
  panelIntro: string;
  closePanel: string;
  worldParams: string;
  forestDensity: string;
  roadWidth: string;
  roadCurves: string;
  fogDensity: string;
  deliveryStops: string;
  seasonPalette: string;
  seasonSpring: string;
  seasonSummer: string;
  seasonAutumn: string;
  treeTune: string;
  leafDensity: string;
  canopyWidth: string;
  treeHeight: string;
  mapSeed: string;
  generate: string;
  randomMap: string;
  playEntry: string;
  exportJson: string;
  importMap: string;
  statusWaking: string;
  statusStreaming: (chunks: number) => string;
  statusPlay: string;
  statusWorkshop: string;
  statusLaying: string;
  statusEnterPlay: string;
  statusRiderLoading: string;
  statusImportFail: string;
  stopsUnit: (n: number) => string;
  langSwitch: string;
  langEn: string;
  langZh: string;
  gaugeSpeed: string;
  gaugeHp: string;
  gaugeReverse: string;
  brandVersion: string;
};

export const COPY: Record<Locale, Copy> = {
  en: {
    skipLink: "Skip to map controls",
    viewportPlay: "Forest Courier play view",
    viewportWorkshop: "Forest map 3D preview",
    modeSwitch: "App mode",
    workshop: "Workshop",
    play: "Play",
    backToWorkshop: "Back to workshop",
    hideRider: "Hide rider",
    showRider: "Show rider",
    overviewCam: "Overview",
    understoryCam: "Understory",
    collapseParams: "Hide params",
    mapParams: "Map params",
    trees: "trees",
    grass: "tufts",
    stones: "stones",
    chunks: "chunks",
    minimapPlay: "Riding · minimap reference only",
    minimapWorkshop: "Click to jump · rivers SW / ridges NE",
    driveHint: "W accelerate · Shift boost · S brake/reverse · Space brake/drift · A/D steer · hold mouse to look · Esc workshop",
    mute: "Mute",
    unmute: "Unmute",
    routeLabel: "ROUTE 01",
    routeNote: "Every bend leads to a warm parcel.",
    panelEyebrow: "MAP GENERATOR / 01",
    panelTitle: "Map Workshop",
    panelIntro: "Tune the forest, then hit Play to hop on the rabbit scooter and deliver.",
    closePanel: "Close params",
    worldParams: "WORLD",
    forestDensity: "Forest density",
    roadWidth: "Road width",
    roadCurves: "Road curves",
    fogDensity: "Morning fog",
    deliveryStops: "Delivery stops",
    seasonPalette: "SEASON",
    seasonSpring: "Spring",
    seasonSummer: "Summer",
    seasonAutumn: "Autumn",
    treeTune: "TREES",
    leafDensity: "Shattered leaf density",
    canopyWidth: "Shattered canopy width",
    treeHeight: "Shattered tree height",
    mapSeed: "Map seed",
    generate: "Generate forest",
    randomMap: "Random map",
    playEntry: "Play · ride the scooter",
    exportJson: "Export JSON",
    importMap: "Import map",
    statusWaking: "Waking the forest…",
    statusStreaming: (chunks) => `Streaming · ${chunks} chunks loaded · drag to look, click minimap to jump`,
    statusPlay: "Play mode · W accelerate · Esc workshop",
    statusWorkshop: "Workshop · drag to look, click minimap to jump",
    statusLaying: "Laying forest paths…",
    statusEnterPlay: "Entering play…",
    statusRiderLoading: "Rider loading, play starts soon…",
    statusImportFail: "Could not read map — use a JSON file exported by this tool",
    stopsUnit: (n) => `${n} stops`,
    langSwitch: "Language",
    langEn: "EN",
    langZh: "中文",
    gaugeSpeed: "km/h",
    gaugeHp: "HP",
    gaugeReverse: "R",
    brandVersion: "Test Build 1.1",
  },
  zh: {
    skipLink: "跳到地图参数",
    viewportPlay: "林间速递游玩画面",
    viewportWorkshop: "森林地图三维预览",
    modeSwitch: "应用模式",
    workshop: "地图工坊",
    play: "开始游玩",
    backToWorkshop: "返回工坊",
    hideRider: "隐藏骑手",
    showRider: "显示骑手",
    overviewCam: "俯瞰视角",
    understoryCam: "林下视角",
    collapseParams: "收起参数",
    mapParams: "地图参数",
    trees: "棵树",
    grass: "簇草",
    stones: "块石",
    chunks: "区块",
    minimapPlay: "骑行中 · 小地图仅供参考",
    minimapWorkshop: "点击跳跃 · 西南河流 / 东北山脉",
    driveHint: "W 加速 · Shift 加力 · S 刹车/倒车 · Space 急刹/漂移 · A/D 转向 · 按住鼠标环视 · Esc 返回工坊",
    mute: "静音",
    unmute: "取消静音",
    routeLabel: "ROUTE 01",
    routeNote: "让每一条弯路，都通向一份温热的包裹。",
    panelEyebrow: "MAP GENERATOR / 01",
    panelTitle: "地图工坊",
    panelIntro: "调好这片森林后，点「开始游玩」骑上小兔子摩托出发配送。",
    closePanel: "收起参数",
    worldParams: "世界参数",
    forestDensity: "森林密度",
    roadWidth: "道路宽度",
    roadCurves: "道路弯曲",
    fogDensity: "晨雾浓度",
    deliveryStops: "配送站点",
    seasonPalette: "季节色谱",
    seasonSpring: "新绿",
    seasonSummer: "盛夏",
    seasonAutumn: "金秋",
    treeTune: "树木微调",
    leafDensity: "破碎的叶片密度",
    canopyWidth: "破碎的树冠宽度",
    treeHeight: "破碎的树木高度",
    mapSeed: "地图种子",
    generate: "生成这片森林",
    randomMap: "随机地图",
    playEntry: "开始游玩 · 骑上摩托",
    exportJson: "导出 JSON",
    importMap: "导入地图",
    statusWaking: "正在唤醒森林…",
    statusStreaming: (chunks) => `流式加载 · ${chunks} 区块在场 · 拖拽巡视，点击小地图跳跃`,
    statusPlay: "游玩模式 · W 加速 · Esc 返回工坊",
    statusWorkshop: "地图工坊 · 拖拽巡视，点击小地图跳跃",
    statusLaying: "正在铺设林间小路…",
    statusEnterPlay: "进入游玩模式…",
    statusRiderLoading: "骑手加载中，即将进入游玩…",
    statusImportFail: "无法读取地图，请选择由本工具导出的 JSON 文件",
    stopsUnit: (n) => `${n} 站`,
    langSwitch: "语言",
    langEn: "EN",
    langZh: "中文",
    gaugeSpeed: "km/h",
    gaugeHp: "马力",
    gaugeReverse: "倒",
    brandVersion: "测试版本1.1",
  },
};
