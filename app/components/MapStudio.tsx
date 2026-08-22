"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, type MapSettings, type Season } from "../lib/map/types";
import { ForestScene, type SceneStats } from "../lib/map/ForestScene";
import { getCityRoadWidthRange } from "../lib/map/city";
import {
  COPY,
  DEFAULT_LOCALE,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from "../lib/i18n";
import { DriveGauge } from "./DriveGauge";
import { createModelPackOwner } from "../lib/map/modelPackOwner.ts";
import { CityEditorPanel, type CityEditorTool } from "./CityEditorPanel.tsx";
import { CityEditorSession, CityDirtyLayer } from "../lib/map/cityEditor.ts";
import {
  cloneCityDocument,
  emptyCityDocument,
  parseCityMapDocument,
  serializeMapFileV3,
  type CityMapDocumentSnapshot,
  type GridPlacement,
} from "../lib/map/cityDocument.ts";
import {
  importRainHarborDocument,
  RAIN_HARBOR_IMPORT_KNOWN_CATALOG_IDS,
} from "../lib/map/cityImporter.ts";
import { createCedarCrossingDocument } from "../lib/map/cedarCrossing.ts";
import {
  createCityPerformanceStressFixture,
  isCityPerformanceStressMultiplier,
  type CityPerformanceCameraRoute,
  type CityPerformanceStressFixture,
} from "../lib/map/cityPerformanceStress.ts";
import {
  createAddGridPlacementDelta,
  createAddRoadDelta,
  createDeletePlacementsDelta,
  createMoveGridPlacementDelta,
  createReplaceGridPlacementCatalogDelta,
  createRotateGridPlacementDelta,
  duplicateGridPlacements,
} from "../lib/map/cityEditorCommands.ts";
import {
  getCatalogEntry,
  standardCommunityCatalogId,
  type StandardCommunityRowOption,
} from "../lib/map/cityCatalog.ts";
import { cityFootprintCornerAtCell } from "../lib/map/cityEditorViewport.ts";
import type { RoadPresetId, SidewalkWidthTier } from "../lib/map/cityRoadGraph.ts";
import {
  assertGridPlacementsAllowed,
  CityEditorConflictError,
} from "../lib/map/cityEditorOccupancy.ts";
import type { MapEntryMode, MapLibraryRecord, MapSaveStatus } from "../lib/map/mapLibrary.ts";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    reset_city_performance_samples?: () => void;
    apply_city_performance_stress?: (multiplier: number) => Readonly<{
      multiplier: number;
      placements: number;
      roads: number;
      replicas: number;
      renderApplyMs: number;
      worldBounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
      cameraFit: Readonly<{ cameraX: number; cameraY: number; cameraZ: number; near: number; far: number }>;
      cameraRoute: readonly CityPerformanceCameraRoute[];
    }>;
    set_city_performance_route?: (routeId: CityPerformanceCameraRoute["id"]) => CityPerformanceCameraRoute;
    capture_city_render_call_attribution?: () => ReturnType<ForestScene["captureCityRenderCallAttribution"]>;
    get_city_placement_collision_bounds?: (placementId: string) => ReturnType<ForestScene["getCityPlacementCollisionBoundsForTest"]>;
    set_city_rider_pose?: (x: number, z: number, heading: number) => ReturnType<ForestScene["setCityRiderPoseForTest"]>;
  }
}

type DriveHud = {
  speedKmh: number;
  horsepower: number;
  powerNorm: number;
  reverse: boolean;
  drifting: boolean;
};

type PendingCityPlacement = Readonly<{
  mode: "add" | "move";
  placementId?: string;
  catalogId: string;
  i: number;
  j: number;
  yaw: GridPlacement["yaw"];
  valid: boolean;
  error: unknown | null;
}>;

type CityPlacementDrag = {
  placementId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  started: boolean;
};

type CityCameraGesture = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
};

const CITY_EDITOR_GRID_PREFERENCE_KEY = "forest-courier-city-editor-grid-visible";

function readCityEditorGridPreference() {
  try {
    const stored = window.localStorage.getItem(CITY_EDITOR_GRID_PREFERENCE_KEY);
    return stored === null ? true : stored !== "0";
  } catch {
    return true;
  }
}

function writeCityEditorGridPreference(visible: boolean) {
  try {
    window.localStorage.setItem(CITY_EDITOR_GRID_PREFERENCE_KEY, visible ? "1" : "0");
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory toggle still works.
  }
}

function cityMutationStatus(error: unknown, locale: Locale, fallback: Readonly<{ en: string; zh: string }>) {
  if (!(error instanceof CityEditorConflictError)) {
    return error instanceof Error ? error.message : fallback[locale];
  }
  const copy: Record<CityEditorConflictError["code"], Readonly<{ en: string; zh: string }>> = {
    "placement-out-of-bounds": { en: "That object would be outside the city bounds.", zh: "该物件会超出城市边界。" },
    "placement-overlap": { en: "That space is already occupied.", zh: "该位置已被其他物件占用。" },
    "placement-road-overlap": { en: "That object cannot overlap this road corridor.", zh: "该物件不能与道路走廊重叠。" },
    "road-out-of-bounds": { en: "That road would extend outside the city bounds.", zh: "该道路会超出城市边界。" },
    "road-placement-overlap": { en: "That road would overlap an existing object or site.", zh: "该道路会与现有物件或场地重叠。" },
  };
  return copy[error.code][locale];
}

function playStatus(locale: Locale, entryMode: MapEntryMode) {
  if (entryMode === "edit") return COPY[locale].statusPlay;
  return locale === "zh"
    ? "游玩模式 · W 加速 · Esc 返回地图列表"
    : "Play mode · W accelerate · Esc map library";
}

function driveHint(locale: Locale, entryMode: MapEntryMode) {
  if (entryMode === "edit") return COPY[locale].driveHint;
  return locale === "zh"
    ? "W 加速 · Shift 加力 · S 刹车/倒车 · Space 急刹/漂移 · A/D 转向 · 按住鼠标环视 · Esc 返回地图列表"
    : "W accelerate · Shift boost · S brake/reverse · Space brake/drift · A/D steer · hold mouse to look · Esc map library";
}

type MapStudioProps = Readonly<{
  map: MapLibraryRecord;
  entryMode: MapEntryMode;
  saveStatus: MapSaveStatus;
  onSave: (update: Readonly<{
    settings: MapSettings;
    cityDocument?: CityMapDocumentSnapshot;
  }>) => void;
  onExit: () => void;
}>;

export function MapStudio({ map, entryMode, saveStatus, onSave, onExit }: MapStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ForestScene | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<MapSettings>(() => structuredClone(map.settings));
  const [draft, setDraft] = useState<MapSettings>(() => structuredClone(map.settings));
  const [stats, setStats] = useState<SceneStats>({ trees: 0, grass: 0, stones: 0, buildings: 0, streetLights: 0, deliveryStops: 0, drawCalls: 0, chunks: 0 });
  const [panelOpen, setPanelOpen] = useState(entryMode === "edit");
  const [riderVisible, setRiderVisible] = useState(true);
  const [playMode, setPlayMode] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [shatterMode, setShatterMode] = useState(map.settings.shatterMode);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [status, setStatus] = useState(COPY[DEFAULT_LOCALE].statusWaking);
  const [citySession] = useState(() => new CityEditorSession(map.cityDocument ?? emptyCityDocument()));
  const citySnapshot = useSyncExternalStore(citySession.subscribe, citySession.getSnapshot, citySession.getSnapshot);
  const [cityTool, setCityTool] = useState<CityEditorTool>("select");
  const [activeCatalogId, setActiveCatalogId] = useState<string | null>("street-light");
  const [activeRoadPreset, setActiveRoadPreset] = useState<RoadPresetId>("two-way-1");
  const [activeSidewalkWidth, setActiveSidewalkWidth] = useState<SidewalkWidthTier>("medium");
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [pendingPlacement, setPendingPlacement] = useState<PendingCityPlacement | null>(null);
  const [cityTopDown, setCityTopDown] = useState(false);
  const [cityGridVisible, setCityGridVisible] = useState(true);
  const citySceneRevisionRef = useRef<number | null>(null);
  const roadStrokeStartRef = useRef<Readonly<{ x: number; z: number }> | null>(null);
  const pendingPlacementRef = useRef<PendingCityPlacement | null>(null);
  const placementDragRef = useRef<CityPlacementDrag | null>(null);
  const cameraGestureRef = useRef<CityCameraGesture | null>(null);
  const suppressNextCanvasClickRef = useRef(false);
  const lastCityPointerClientRef = useRef<Readonly<{ x: number; y: number }> | null>(null);
  const [driveHud, setDriveHud] = useState<DriveHud>({
    speedKmh: 0,
    horsepower: 0,
    powerNorm: 0,
    reverse: false,
    drifting: false,
  });
  const [initialSettingsJson] = useState(() => JSON.stringify(map.settings));
  const localeRef = useRef(locale);
  const playModeRef = useRef(playMode);
  const entryModeRef = useRef(entryMode);
  const onSaveRef = useRef(onSave);
  const onExitRef = useRef(onExit);
  const mapTypeRef = useRef(settings.mapType);
  const canEdit = entryMode === "edit";
  const immersive = entryMode === "play" || playMode;
  const hasMapChanges = citySnapshot.revision > 0
    || JSON.stringify(settings) !== initialSettingsJson;
  const t = COPY[locale];
  const selectedPlacement = citySnapshot.document.placements.find((placement) => placement.id === selectedPlacementId);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = readStoredLocale();
      setLocale(stored);
      setStatus(COPY[stored].statusWaking);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCityGridVisible(readCityEditorGridPreference());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  useEffect(() => {
    playModeRef.current = playMode;
  }, [playMode]);

  useEffect(() => {
    entryModeRef.current = entryMode;
  }, [entryMode]);

  useEffect(() => {
    onSaveRef.current = onSave;
    onExitRef.current = onExit;
  }, [onExit, onSave]);

  useEffect(() => {
    mapTypeRef.current = settings.mapType;
  }, [settings.mapType]);

  useEffect(() => {
    writeStoredLocale(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
    setStatus((current) => {
      // Refresh mode-bound status lines when language flips.
      if (playModeRef.current) return playStatus(locale, entryModeRef.current);
      if (entryModeRef.current === "play") {
        return mapTypeRef.current === "city"
          ? (locale === "zh" ? "正在准备城市与碰撞…" : "Preparing city and collision…")
          : (locale === "zh" ? "正在准备森林骑行…" : "Preparing forest ride…");
      }
      if (
        current === COPY.en.statusWaking ||
        current === COPY.zh.statusWaking ||
        current === COPY.en.statusWorkshop ||
        current === COPY.zh.statusWorkshop ||
        current === COPY.en.statusPlay ||
        current === COPY.zh.statusPlay ||
        current === COPY.en.statusCityReady ||
        current === COPY.zh.statusCityReady ||
        current.startsWith("Streaming") ||
        current.startsWith("流式加载")
      ) {
        if (playModeRef.current) return playStatus(locale, entryModeRef.current);
        return mapTypeRef.current === "city" ? COPY[locale].statusCityReady : COPY[locale].statusWorkshop;
      }
      return current;
    });
  }, [locale]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const modelPackOwner = createModelPackOwner();
    const scene = new ForestScene(canvasRef.current, settings, (next) => {
      setStats(next);
      setStatus((current) => {
        const copy = COPY[localeRef.current];
        if (current === copy.statusPlay || current === copy.statusEnterPlay || current === copy.statusRiderLoading) {
          return current;
        }
        if (entryModeRef.current === "play" && !playModeRef.current) return current;
        if (playModeRef.current) return playStatus(localeRef.current, entryModeRef.current);
        return mapTypeRef.current === "city" ? copy.statusCityReady : copy.statusStreaming(next.chunks);
      });
    }, modelPackOwner);
    scene.setCityEditorGridVisible(canEdit && settings.mapType === "city" && cityGridVisible);
    if (map.kind === "city") {
      scene.applyCityDocument(citySession.document, CityDirtyLayer.All);
    }
    sceneRef.current = scene;
    scene.setDriveModeListener((on) => {
      setPlayMode(on);
      const copy = COPY[localeRef.current];
      if (on) {
        pendingPlacementRef.current = null;
        placementDragRef.current = null;
        cameraGestureRef.current = null;
        setPendingPlacement(null);
        scene.setCityPlacementDragging(false);
        scene.setCityPlacementPreview(null);
        setRiderVisible(true);
        setPanelOpen(false);
        setStatus(playStatus(localeRef.current, entryModeRef.current));
      } else if (entryModeRef.current === "edit") {
        setPanelOpen(true);
        setStatus(copy.statusWorkshop);
      } else {
        setPanelOpen(false);
      }
      requestAnimationFrame(() => scene.resize());
    });
    scene.setDriveExitIntentListener(() => {
      if (entryModeRef.current === "play") onExitRef.current();
    });
    scene.setCityEditorCameraModeListener(setCityTopDown);
    const renderHook = () => JSON.stringify({
      ...scene.getTextState(),
      app: {
        screen: "workspace",
        mapId: map.id,
        mapName: map.name,
        entryMode: entryModeRef.current,
        canEdit: entryModeRef.current === "edit" && !playModeRef.current,
      },
    });
    const advanceHook = (ms: number) => scene.advanceForTest(ms);
    const resetPerformanceHook = () => scene.resetCityPerformanceSamples();
    let performanceStressFixture: CityPerformanceStressFixture | null = null;
    const applyPerformanceStressHook = (multiplier: number) => {
      if (settings.mapType !== "city") throw new Error("city performance stress requires a city map");
      if (!isCityPerformanceStressMultiplier(multiplier)) {
        throw new TypeError(`unsupported city performance stress multiplier: ${multiplier}`);
      }
      const fixture = createCityPerformanceStressFixture(createCedarCrossingDocument(), multiplier);
      performanceStressFixture = fixture;
      const startedAt = performance.now();
      scene.applyCityDocument(fixture.document, CityDirtyLayer.All);
      const cameraFit = scene.fitCityPerformanceBounds(fixture.worldBounds);
      return Object.freeze({
        multiplier,
        placements: fixture.document.placements.length,
        roads: fixture.document.graph.edges.length,
        replicas: fixture.replicas.length,
        renderApplyMs: performance.now() - startedAt,
        worldBounds: fixture.worldBounds,
        cameraFit,
        cameraRoute: fixture.cameraRoute,
      });
    };
    const setPerformanceRouteHook = (routeId: CityPerformanceCameraRoute["id"]) => {
      const fixture = performanceStressFixture;
      if (!fixture) throw new Error("apply city performance stress before selecting a route");
      const route = fixture.cameraRoute.find((candidate) => candidate.id === routeId);
      if (!route) throw new TypeError(`unknown city performance route: ${routeId}`);
      if (route.id === "editor-fit") scene.fitCityPerformanceBounds(fixture.worldBounds);
      else scene.jumpTo(route.targetX, route.targetZ);
      scene.requestCityShadowRefresh();
      return route;
    };
    window.render_game_to_text = renderHook;
    window.advanceTime = advanceHook;
    window.reset_city_performance_samples = resetPerformanceHook;
    window.apply_city_performance_stress = applyPerformanceStressHook;
    window.set_city_performance_route = setPerformanceRouteHook;
    const captureCityCallAttributionHook = () => scene.captureCityRenderCallAttribution();
    window.capture_city_render_call_attribution = captureCityCallAttributionHook;
    const getCityPlacementCollisionBoundsHook = (placementId: string) => (
      scene.getCityPlacementCollisionBoundsForTest(placementId)
    );
    const setCityRiderPoseHook = (x: number, z: number, heading: number) => (
      scene.setCityRiderPoseForTest(x, z, heading)
    );
    window.get_city_placement_collision_bounds = getCityPlacementCollisionBoundsHook;
    window.set_city_rider_pose = setCityRiderPoseHook;
    if (minimapRef.current) scene.attachMinimap(minimapRef.current);
    const resize = () => scene.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      scene.dispose();
      void modelPackOwner.retire();
      sceneRef.current = null;
      if (window.render_game_to_text === renderHook) delete window.render_game_to_text;
      if (window.advanceTime === advanceHook) delete window.advanceTime;
      if (window.reset_city_performance_samples === resetPerformanceHook) {
        delete window.reset_city_performance_samples;
      }
      if (window.apply_city_performance_stress === applyPerformanceStressHook) {
        delete window.apply_city_performance_stress;
      }
      if (window.set_city_performance_route === setPerformanceRouteHook) {
        delete window.set_city_performance_route;
      }
      if (window.capture_city_render_call_attribution === captureCityCallAttributionHook) {
        delete window.capture_city_render_call_attribution;
      }
      if (window.get_city_placement_collision_bounds === getCityPlacementCollisionBoundsHook) {
        delete window.get_city_placement_collision_bounds;
      }
      if (window.set_city_rider_pose === setCityRiderPoseHook) {
        delete window.set_city_rider_pose;
      }
    };
  // The scene owns updates after creation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const visible = canEdit && settings.mapType === "city" && !playMode && cityGridVisible;
    sceneRef.current?.setCityEditorGridVisible(visible);
    if (!visible) sceneRef.current?.setCityEditorGridHover(null);
  }, [canEdit, cityGridVisible, playMode, settings.mapType]);

  useEffect(() => {
    if (entryMode !== "play") return;
    sceneRef.current?.setDriveMode(true);
  }, [entryMode]);

  useEffect(() => {
    if (!canEdit || !hasMapChanges) return;
    onSaveRef.current({
      settings,
      ...(map.kind === "city" ? { cityDocument: citySnapshot.document } : {}),
    });
  }, [canEdit, citySnapshot.document, citySnapshot.revision, hasMapChanges, map.kind, settings]);

  useEffect(() => {
    if (settings.mapType !== "city") return;
    const update = citySession.getRenderUpdate(citySceneRevisionRef.current);
    try {
      sceneRef.current?.applyCityDocument(update.document, update.dirty);
      citySceneRevisionRef.current = update.revision;
    } catch (error) {
      console.error("Failed to apply city document revision", error);
      queueMicrotask(() => {
        setStatus(locale === "zh" ? "城市文档渲染失败" : "City document render failed");
      });
    }
  }, [citySession, citySnapshot.revision, locale, settings.mapType]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canEdit || settings.mapType !== "city" || playModeRef.current) return;
      const target = event.target;
      if (target instanceof HTMLElement
        && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.code === "KeyZ") {
        event.preventDefault();
        pendingPlacementRef.current = null;
        setPendingPlacement(null);
        sceneRef.current?.setCityPlacementPreview(null);
        if (event.shiftKey) citySession.redo();
        else citySession.undo();
        return;
      }
      if (command && event.code === "KeyD" && selectedPlacementId) {
        event.preventDefault();
        pendingPlacementRef.current = null;
        setPendingPlacement(null);
        sceneRef.current?.setCityPlacementPreview(null);
        try {
          citySession.apply(duplicateGridPlacements(citySession.document, [selectedPlacementId]));
          setSelectedPlacementId(citySession.document.placements.at(-1)?.id ?? selectedPlacementId);
        } catch (error) {
          setStatus(cityMutationStatus(error, locale, { en: "Object could not be duplicated.", zh: "无法复制该物件。" }));
        }
        return;
      }
      if (event.code === "KeyR" && selectedPlacementId) {
        const placement = citySession.document.placements.find((candidate) => candidate.id === selectedPlacementId);
        if (placement?.poseKind === "grid") {
          event.preventDefault();
          pendingPlacementRef.current = null;
          setPendingPlacement(null);
          sceneRef.current?.setCityPlacementPreview(null);
          try {
            citySession.apply(createRotateGridPlacementDelta(citySession.document, selectedPlacementId));
          } catch (error) {
            setStatus(cityMutationStatus(error, locale, { en: "Object could not be rotated.", zh: "无法旋转该物件。" }));
          }
        }
        return;
      }
      if ((event.code === "Delete" || event.code === "Backspace") && selectedPlacementId) {
        event.preventDefault();
        pendingPlacementRef.current = null;
        setPendingPlacement(null);
        sceneRef.current?.setCityPlacementPreview(null);
        citySession.apply(createDeletePlacementsDelta(citySession.document, [selectedPlacementId]));
        setSelectedPlacementId(null);
        return;
      }
      if (event.code === "Escape") {
        roadStrokeStartRef.current = null;
        placementDragRef.current = null;
        cameraGestureRef.current = null;
        pendingPlacementRef.current = null;
        setPendingPlacement(null);
        sceneRef.current?.setCityPlacementDragging(false);
        sceneRef.current?.setCityPlacementPreview(null);
        setSelectedPlacementId(null);
        setCityTool("select");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canEdit, citySession, locale, selectedPlacementId, settings.mapType]);

  useEffect(() => {
    if (minimapRef.current && sceneRef.current) {
      sceneRef.current.attachMinimap(minimapRef.current);
    }
  }, []);

  useEffect(() => {
    const roadOwnsPrimary = canEdit && settings.mapType === "city" && !playMode && cityTool === "road";
    sceneRef.current?.setCityRoadEditingEnabled(roadOwnsPrimary);
    return () => sceneRef.current?.setCityRoadEditingEnabled(false);
  }, [canEdit, cityTool, playMode, settings.mapType]);

  useEffect(() => {
    if (canEdit && settings.mapType === "city" && !playMode) return;
    pendingPlacementRef.current = null;
    placementDragRef.current = null;
    cameraGestureRef.current = null;
    sceneRef.current?.setCityPlacementDragging(false);
    sceneRef.current?.setCityPlacementPreview(null);
  }, [canEdit, playMode, settings.mapType]);

  useEffect(() => {
    if (!playMode) return;
    let frame = 0;
    const tick = () => {
      const hud = sceneRef.current?.getDriveHud();
      if (hud) setDriveHud(hud);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playMode]);

  const update = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const generate = (next = draft) => {
    setStatus(next.mapType === "city" ? t.statusBuildingCity : t.statusLaying);
    setSettings(next);
    setDraft(next);
    setShatterMode(next.shatterMode);
    requestAnimationFrame(() => sceneRef.current?.build(next));
  };

  const randomize = () => {
    const next = { ...draft, seed: Math.floor(10000 + Math.random() * 89999) };
    generate(next);
  };

  const toggleShatterMode = () => {
    const next = !shatterMode;
    setShatterMode(next);
    setDraft((current) => ({ ...current, shatterMode: next }));
    setSettings((current) => ({ ...current, shatterMode: next }));
    sceneRef.current?.setShatterMode(next);
  };

  const publishPendingPlacement = (next: PendingCityPlacement | null) => {
    pendingPlacementRef.current = next;
    setPendingPlacement(next);
    sceneRef.current?.setCityPlacementPreview(next ? {
      catalogId: next.catalogId,
      i: next.i,
      j: next.j,
      yaw: next.yaw,
      valid: next.valid,
    } : null);
  };

  const cancelPendingPlacement = () => {
    placementDragRef.current = null;
    cameraGestureRef.current = null;
    suppressNextCanvasClickRef.current = false;
    sceneRef.current?.setCityPlacementDragging(false);
    publishPendingPlacement(null);
  };

  const placementAtPointer = (
    catalogId: string,
    clientX: number,
    clientY: number,
    options: Readonly<{ mode: "add" | "move"; placementId?: string; yaw: GridPlacement["yaw"] }>,
  ): PendingCityPlacement | null => {
    const entry = getCatalogEntry(catalogId);
    const point = sceneRef.current?.projectCityPointer(clientX, clientY);
    if (!entry || !point) return null;
    const baseFootprint = entry.footprintOverride ?? {
      w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
      d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
    };
    const rotated = options.yaw === 90 || options.yaw === 270;
    const footprint = rotated
      ? { w: baseFootprint.d, d: baseFootprint.w }
      : baseFootprint;
    const corner = cityFootprintCornerAtCell(point.i, point.j, footprint.w, footprint.d);
    const candidate: GridPlacement = {
      id: options.placementId ?? "city-placement-preview",
      catalogId,
      poseKind: "grid",
      i: corner.i,
      j: corner.j,
      yaw: options.yaw,
    };
    let error: unknown | null = null;
    try {
      assertGridPlacementsAllowed(
        citySession.document,
        [candidate],
        options.placementId ? new Set([options.placementId]) : new Set(),
      );
    } catch (nextError) {
      error = nextError;
    }
    return Object.freeze({
      ...options,
      catalogId,
      i: corner.i,
      j: corner.j,
      valid: error === null,
      error,
    });
  };

  const previewCatalogAtPointer = (catalogId: string, clientX: number, clientY: number) => {
    const next = placementAtPointer(catalogId, clientX, clientY, { mode: "add", yaw: 0 });
    if (!next) return;
    const current = pendingPlacementRef.current;
    if (current
      && current.mode === "add"
      && current.catalogId === next.catalogId
      && current.i === next.i
      && current.j === next.j
      && current.valid === next.valid) return;
    publishPendingPlacement(next);
  };

  const updatePendingPlacementAtPointer = (clientX: number, clientY: number) => {
    const pending = pendingPlacementRef.current;
    if (!pending) return;
    const next = placementAtPointer(pending.catalogId, clientX, clientY, {
      mode: pending.mode,
      placementId: pending.placementId,
      yaw: pending.yaw,
    });
    if (!next) return;
    if (next.i === pending.i && next.j === pending.j && next.valid === pending.valid) return;
    publishPendingPlacement(next);
  };

  const confirmPendingPlacement = (candidate: PendingCityPlacement) => {
    if (!candidate.valid) {
      setStatus(cityMutationStatus(candidate.error, locale, {
        en: "That location is not available.",
        zh: "该位置不能放置物件。",
      }));
      return;
    }
    try {
      if (candidate.mode === "move" && candidate.placementId) {
        citySession.apply(createMoveGridPlacementDelta(
          citySession.document,
          candidate.placementId,
          candidate.i,
          candidate.j,
        ));
        setSelectedPlacementId(candidate.placementId);
        setStatus(locale === "zh" ? "已移动物件" : "Object moved");
      } else {
        citySession.apply(createAddGridPlacementDelta(
          candidate.catalogId,
          candidate.i,
          candidate.j,
          candidate.yaw,
        ));
        setSelectedPlacementId(citySession.document.placements.at(-1)?.id ?? null);
        setStatus(locale === "zh" ? "已放置物件" : "Object placed");
      }
      publishPendingPlacement(null);
    } catch (error) {
      setStatus(cityMutationStatus(error, locale, { en: "Object could not be placed.", zh: "无法放置该物件。" }));
    }
  };

  const onCityCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canEdit || playMode || settings.mapType !== "city" || cityTool === "road") return;
    if (suppressNextCanvasClickRef.current) {
      suppressNextCanvasClickRef.current = false;
      return;
    }
    const pending = pendingPlacementRef.current;
    if (pending) {
      updatePendingPlacementAtPointer(event.clientX, event.clientY);
      const updated = placementAtPointer(pending.catalogId, event.clientX, event.clientY, {
        mode: pending.mode,
        placementId: pending.placementId,
        yaw: pending.yaw,
      });
      if (updated) {
        publishPendingPlacement(updated);
        confirmPendingPlacement(updated);
      }
      return;
    }
    if (cityTool === "place" && activeCatalogId) {
      const next = placementAtPointer(activeCatalogId, event.clientX, event.clientY, { mode: "add", yaw: 0 });
      if (next) {
        publishPendingPlacement(next);
        confirmPendingPlacement(next);
      }
      return;
    }
    setSelectedPlacementId(sceneRef.current?.pickCityPlacement(event.clientX, event.clientY) ?? null);
  };

  const onCityCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit || playMode || settings.mapType !== "city") return;
    if (cityTool === "road") {
      const point = sceneRef.current?.projectCityPointer(event.clientX, event.clientY);
      if (!point) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      roadStrokeStartRef.current = point;
      return;
    }
    if (cityTool !== "select" || pendingPlacementRef.current) {
      cameraGestureRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      };
      return;
    }
    const placementId = sceneRef.current?.pickCityPlacement(event.clientX, event.clientY) ?? null;
    if (!placementId) {
      cameraGestureRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      };
      return;
    }
    const placement = citySession.document.placements.find((candidate) => candidate.id === placementId);
    setSelectedPlacementId(placementId);
    if (placement?.poseKind !== "grid") {
      cameraGestureRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
      };
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sceneRef.current?.setCityPlacementDragging(true);
    placementDragRef.current = {
      placementId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      started: false,
    };
  };

  const onCityCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = placementDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      placementDragRef.current = null;
      sceneRef.current?.setCityPlacementDragging(false);
      if (drag.started) suppressNextCanvasClickRef.current = true;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const cameraGesture = cameraGestureRef.current;
    if (cameraGesture?.pointerId === event.pointerId) {
      cameraGestureRef.current = null;
      if (cameraGesture.moved) suppressNextCanvasClickRef.current = true;
      return;
    }
    const start = roadStrokeStartRef.current;
    roadStrokeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!start || !canEdit || playMode || settings.mapType !== "city" || cityTool !== "road") return;
    const end = sceneRef.current?.projectCityPointer(event.clientX, event.clientY);
    if (!end) return;
    try {
      citySession.apply(createAddRoadDelta(
        citySession.document,
        start.x,
        start.z,
        end.x,
        end.z,
        activeRoadPreset,
        { sidewalkWidthTier: activeSidewalkWidth },
      ));
    } catch (error) {
      setStatus(cityMutationStatus(error, locale, { en: "Road could not be created.", zh: "道路无法创建。" }));
    }
  };

  const onCityCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit || settings.mapType !== "city" || playMode) {
      sceneRef.current?.setCityEditorGridHover(null);
      return;
    }
    lastCityPointerClientRef.current = { x: event.clientX, y: event.clientY };
    const point = sceneRef.current?.projectCityPointer(event.clientX, event.clientY);
    sceneRef.current?.setCityEditorGridHover(cityGridVisible && point ? { i: point.i, j: point.j } : null);

    const cameraGesture = cameraGestureRef.current;
    if (cameraGesture?.pointerId === event.pointerId && !cameraGesture.moved) {
      cameraGesture.moved = Math.hypot(
        event.clientX - cameraGesture.startClientX,
        event.clientY - cameraGesture.startClientY,
      ) >= 4;
    }

    const drag = placementDragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const distance = Math.hypot(
        event.clientX - drag.startClientX,
        event.clientY - drag.startClientY,
      );
      if (!drag.started && distance >= 4) {
        drag.started = true;
        const placement = citySession.document.placements.find((candidate) => candidate.id === drag.placementId);
        if (placement?.poseKind === "grid") {
          const next = placementAtPointer(placement.catalogId, event.clientX, event.clientY, {
            mode: "move",
            placementId: placement.id,
            yaw: placement.yaw,
          });
          if (next) publishPendingPlacement(next);
        }
      } else if (drag.started) {
        updatePendingPlacementAtPointer(event.clientX, event.clientY);
      }
      return;
    }

    if (pendingPlacementRef.current) {
      updatePendingPlacementAtPointer(event.clientX, event.clientY);
    } else if (cityTool === "place" && activeCatalogId) {
      previewCatalogAtPointer(activeCatalogId, event.clientX, event.clientY);
    }
  };

  const moveSelected = () => {
    if (!selectedPlacementId) return;
    const placement = citySession.document.placements.find((candidate) => candidate.id === selectedPlacementId);
    if (placement?.poseKind !== "grid") return;
    publishPendingPlacement(Object.freeze({
      mode: "move",
      placementId: placement.id,
      catalogId: placement.catalogId,
      i: placement.i,
      j: placement.j,
      yaw: placement.yaw,
      valid: true,
      error: null,
    }));
    setCityTool("select");
    setStatus(locale === "zh" ? "移动鼠标预览位置，单击确认；Esc 取消" : "Move the pointer to preview, then click to confirm; Esc cancels");
  };

  const rotateSelected = () => {
    if (!selectedPlacementId) return;
    cancelPendingPlacement();
    const placement = citySession.document.placements.find((candidate) => candidate.id === selectedPlacementId);
    if (placement?.poseKind !== "grid") return;
    try {
      citySession.apply(createRotateGridPlacementDelta(citySession.document, selectedPlacementId));
    } catch (error) {
      setStatus(cityMutationStatus(error, locale, { en: "Object could not be rotated.", zh: "无法旋转该物件。" }));
    }
  };

  const deleteSelected = () => {
    if (!selectedPlacementId) return;
    cancelPendingPlacement();
    citySession.apply(createDeletePlacementsDelta(citySession.document, [selectedPlacementId]));
    setSelectedPlacementId(null);
  };

  const duplicateSelected = () => {
    if (!selectedPlacementId) return;
    cancelPendingPlacement();
    try {
      citySession.apply(duplicateGridPlacements(citySession.document, [selectedPlacementId]));
      setSelectedPlacementId(citySession.document.placements.at(-1)?.id ?? null);
    } catch (error) {
      setStatus(cityMutationStatus(error, locale, { en: "Object could not be duplicated.", zh: "无法复制该物件。" }));
    }
  };

  const resizeSelectedStandardCommunity = (rowsPerSide: StandardCommunityRowOption) => {
    if (!selectedPlacementId) return;
    cancelPendingPlacement();
    try {
      citySession.apply(createReplaceGridPlacementCatalogDelta(
        citySession.document,
        selectedPlacementId,
        standardCommunityCatalogId(rowsPerSide),
      ));
      setActiveCatalogId(standardCommunityCatalogId(rowsPerSide));
      setStatus(locale === "zh"
        ? `普通小区已调整为左右各${rowsPerSide}排`
        : `Standard community resized to ${rowsPerSide} rows per side`);
    } catch (error) {
      setStatus(cityMutationStatus(error, locale, {
        en: "The community cannot expand into occupied map cells.",
        zh: "小区扩展范围与现有物件或道路冲突。",
      }));
    }
  };

  const importDefaultCity = () => {
    if (!window.confirm(locale === "zh" ? "用默认雪松新城替换当前城市？可用撤销恢复。" : "Replace the current city with Cedar Crossing? You can undo this.")) return;
    cancelPendingPlacement();
    citySession.replace(cloneCityDocument(createCedarCrossingDocument()), "import");
    setSelectedPlacementId(null);
    setStatus(locale === "zh" ? "已导入默认雪松新城" : "Cedar Crossing imported");
  };

  const clearCity = () => {
    if (!window.confirm(locale === "zh" ? "清空当前城市并回到空白镜框？可用撤销恢复。" : "Clear the city back to the empty frame? You can undo this.")) return;
    cancelPendingPlacement();
    citySession.replace(cloneCityDocument(emptyCityDocument()), "clear");
    setSelectedPlacementId(null);
  };

  const exportMap = () => {
    const payload = JSON.stringify(serializeMapFileV3(
      settings,
      settings.mapType === "city" ? citySession.document : undefined,
    ), null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeName = map.name.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || settings.mapType;
    link.download = `${safeName}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importMap = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        format?: string;
        version?: number;
        settings?: MapSettings;
        cityDocument?: unknown;
      };
      if (parsed.format !== "forest-courier-map"
        || (parsed.version !== 2 && parsed.version !== 3)
        || !parsed.settings
        || typeof parsed.settings.seed !== "number") {
        throw new Error("invalid map");
      }
      const next = { ...DEFAULT_SETTINGS, ...parsed.settings };
      if (next.mapType !== map.kind) {
        throw new Error("map type does not match the selected library entry");
      }
      if (next.mapType === "city") {
        const document = parsed.version === 3 && parsed.cityDocument !== undefined
          ? parseCityMapDocument(parsed.cityDocument, {
              knownCatalogIds: new Set(RAIN_HARBOR_IMPORT_KNOWN_CATALOG_IDS),
            }).document
          : parsed.version === 2
            ? importRainHarborDocument(next)
            : emptyCityDocument();
        citySession.replace(cloneCityDocument(document), "import");
        citySceneRevisionRef.current = null;
      }
      generate(next);
    } catch {
      setStatus(t.statusImportFail);
    }
  };

  const enterPlay = () => {
    if (!canEdit) return;
    if (settings.mapType === "city" && !sceneRef.current?.isCityDocumentCollisionReady()) {
      setStatus(locale === "zh" ? "正在编译城市碰撞，请稍候…" : "Compiling city collision…");
      return;
    }
    cancelPendingPlacement();
    setStatus(sceneRef.current?.isRiderReady() ? t.statusEnterPlay : t.statusRiderLoading);
    setPanelOpen(false);
    sceneRef.current?.setDriveMode(true);
  };

  const enterWorkshop = () => {
    if (!canEdit) return;
    sceneRef.current?.setDriveMode(false);
  };

  const exitToLibrary = () => {
    if (canEdit && hasMapChanges) {
      onSaveRef.current({
        settings,
        ...(map.kind === "city" ? { cityDocument: citySession.document } : {}),
      });
    }
    sceneRef.current?.setDriveMode(false);
    onExitRef.current();
  };

  const toggleAudio = () => {
    setAudioMuted((current) => {
      const next = !current;
      sceneRef.current?.setAudioMuted(next);
      return next;
    });
  };

  const toggleCityGrid = () => {
    setCityGridVisible((current) => {
      const next = !current;
      writeCityEditorGridPreference(next);
      return next;
    });
  };

  const setLang = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
  };

  const seasonLabel = (season: Season) =>
    season === "spring" ? t.seasonSpring : season === "summer" ? t.seasonSummer : t.seasonAutumn;

  return (
    <main className={`studio-shell ${settings.mapType}-map ${immersive ? "play-mode" : "workshop-mode"}`}>
      {canEdit && <a className="skip-link" href="#map-controls">{t.skipLink}</a>}
      <section className="viewport" aria-label={settings.mapType === "city" ? (locale === "zh" ? `${map.name} 三维预览` : `${map.name} 3D preview`) : immersive ? t.viewportPlay : t.viewportWorkshop}>
        <canvas
          ref={canvasRef}
          className={`scene-canvas ${canEdit && settings.mapType === "city" && !playMode ? `city-${cityTool}-tool` : ""}`}
          tabIndex={0}
          onClick={onCityCanvasClick}
          onPointerMove={onCityCanvasPointerMove}
          onPointerLeave={() => sceneRef.current?.setCityEditorGridHover(null)}
          onPointerDown={onCityCanvasPointerDown}
          onPointerUp={onCityCanvasPointerUp}
          onPointerCancel={(event) => {
            roadStrokeStartRef.current = null;
            placementDragRef.current = null;
            cameraGestureRef.current = null;
            sceneRef.current?.setCityPlacementDragging(false);
            sceneRef.current?.setCityEditorGridHover(null);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onDragOver={(event) => {
            if (!canEdit || settings.mapType !== "city" || playMode) return;
            if (event.dataTransfer.types.includes("application/x-forest-city-catalog")) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              const catalogId = event.dataTransfer.getData("application/x-forest-city-catalog") || activeCatalogId;
              if (catalogId) previewCatalogAtPointer(catalogId, event.clientX, event.clientY);
            }
          }}
          onDrop={(event) => {
            if (!canEdit || settings.mapType !== "city" || playMode) return;
            const catalogId = event.dataTransfer.getData("application/x-forest-city-catalog");
            if (!catalogId) return;
            event.preventDefault();
            setActiveCatalogId(catalogId);
            setCityTool("place");
            previewCatalogAtPointer(catalogId, event.clientX, event.clientY);
            setStatus(locale === "zh" ? "移动鼠标预览位置，单击确认；Esc 取消" : "Move the pointer to preview, then click to confirm; Esc cancels");
          }}
        />
        <div className="atmosphere" aria-hidden="true" />

        {canEdit && settings.mapType === "city" && !playMode && pendingPlacement && (
          <div
            className={`city-placement-confirm ${pendingPlacement.valid ? "valid" : "invalid"}`}
            role="status"
            data-testid="city-placement-preview-status"
            data-valid={pendingPlacement.valid}
          >
            <strong>{pendingPlacement.mode === "move"
              ? (locale === "zh" ? "移动预览" : "Move preview")
              : (locale === "zh" ? "放置预览" : "Placement preview")}</strong>
            <span>{pendingPlacement.valid
              ? (locale === "zh" ? "绿色格可用 · 单击确认 · Esc 取消" : "Green cells are available · click to confirm · Esc to cancel")
              : (locale === "zh" ? "红色格有冲突 · 请移动到可用位置" : "Red cells conflict · move to an available location")}</span>
            <button type="button" onClick={cancelPendingPlacement}>{locale === "zh" ? "取消" : "Cancel"}</button>
          </div>
        )}

        {canEdit && settings.mapType === "city" && !playMode && selectedPlacement && !pendingPlacement && (
          <div className="city-selection-toolbar" role="toolbar" aria-label={locale === "zh" ? "所选物件操作" : "Selected object actions"} data-testid="city-selection-toolbar">
            <button type="button" onClick={moveSelected} disabled={selectedPlacement.poseKind !== "grid"}>{locale === "zh" ? "移动" : "Move"}</button>
            <button type="button" onClick={rotateSelected} disabled={selectedPlacement.poseKind !== "grid"}>{locale === "zh" ? "旋转" : "Rotate"}</button>
            <button type="button" className="danger" onClick={deleteSelected}>{locale === "zh" ? "删除" : "Delete"}</button>
          </div>
        )}

        <header className="brand-lockup" aria-label="Rabbit">
          <div className="brand-mark">兔</div>
          <p className="brand-version">{t.brandVersion}</p>
        </header>

        {canEdit && <div className="mode-switch" role="tablist" aria-label={t.modeSwitch}>
          <button
            type="button"
            role="tab"
            aria-selected={!playMode}
            className={!playMode ? "active" : ""}
            onClick={enterWorkshop}
          >
            {t.workshop}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={playMode}
            className={playMode ? "active" : ""}
            onClick={enterPlay}
          >
            {t.play}
          </button>
        </div>}

        <div className="lang-switch" role="group" aria-label={t.langSwitch}>
          <button
            type="button"
            className={locale === "en" ? "active" : ""}
            aria-pressed={locale === "en"}
            onClick={() => setLang("en")}
          >
            {t.langEn}
          </button>
          <button
            type="button"
            className={locale === "zh" ? "active" : ""}
            aria-pressed={locale === "zh"}
            onClick={() => setLang("zh")}
          >
            {t.langZh}
          </button>
        </div>

        {canEdit && !playMode && (
          <a className="showcase-switch" href="/demos" aria-label={locale === "zh" ? "切换到城市模型展示区" : "Switch to the city model showcase"}>
            <span>{locale === "zh" ? "城市模型展示区" : "City model showcase"}</span>
            <i aria-hidden="true">↗</i>
          </a>
        )}

        {canEdit && !playMode && (
          <div className="scene-stats" aria-live="polite">
            {settings.mapType === "city" ? (
              <>
                <span><b>{stats.buildings}</b> {t.buildings}</span>
                <span><b>{stats.streetLights}</b> {t.streetLights}</span>
                <span><b>{stats.trees}</b> {t.trees}</span>
                <span><b>{stats.deliveryStops}</b> {t.deliveryStops}</span>
              </>
            ) : (
              <>
                <span><b>{stats.trees}</b> {t.trees}</span>
                <span><b>{stats.grass}</b> {t.grass}</span>
                <span><b>{stats.stones}</b> {t.stones}</span>
                <span><b>{stats.chunks}</b> {t.chunks}</span>
              </>
            )}
          </div>
        )}

        <div className="view-actions">
          {entryMode === "play" ? (
            <>
              <button type="button" className="active" onClick={exitToLibrary}>
                {locale === "zh" ? "返回地图列表" : "Back to maps"}
              </button>
              <button
                type="button"
                className={audioMuted ? "" : "active"}
                aria-pressed={!audioMuted}
                onClick={toggleAudio}
              >
                {audioMuted ? t.unmute : t.mute}
              </button>
            </>
          ) : playMode ? (
            <>
              <button type="button" className="active" onClick={enterWorkshop}>
                {t.backToWorkshop}
              </button>
              {settings.mapType === "forest" && (
                <button
                  type="button"
                  className={shatterMode ? "active" : ""}
                  aria-pressed={shatterMode}
                  onClick={toggleShatterMode}
                >
                  {shatterMode ? t.shatterModeOff : t.shatterModeOn}
                </button>
              )}
              <button
                type="button"
                className={audioMuted ? "" : "active"}
                aria-pressed={!audioMuted}
                onClick={toggleAudio}
              >
                {audioMuted ? t.unmute : t.mute}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={exitToLibrary}>
                {locale === "zh" ? "地图列表" : "Map library"}
              </button>
              <button type="button" className="play-cta" onClick={enterPlay}>
                {t.play}
              </button>
              {settings.mapType === "forest" && (
                <button
                  type="button"
                  className={shatterMode ? "active" : ""}
                  aria-pressed={shatterMode}
                  onClick={toggleShatterMode}
                >
                  {shatterMode ? t.shatterModeOff : t.shatterModeOn}
                </button>
              )}
              <button type="button" onClick={() => { const next = !riderVisible; setRiderVisible(next); sceneRef.current?.toggleRider(next); }}>
                {riderVisible ? t.hideRider : t.showRider}
              </button>
              <button type="button" onClick={() => sceneRef.current?.resetCamera()}>{t.overviewCam}</button>
              <button type="button" onClick={() => sceneRef.current?.setUnderstoryCamera()}>{settings.mapType === "city" ? (locale === "zh" ? "街道视角" : "Street level") : t.understoryCam}</button>
              <button className="mobile-panel-button" type="button" onClick={() => setPanelOpen((value) => !value)}>
                {panelOpen ? t.collapseParams : t.mapParams}
              </button>
            </>
          )}
        </div>

        <aside className="minimap-panel" aria-label="Minimap">
          <canvas ref={minimapRef} className="minimap-canvas" width={188} height={188} />
          <p>{immersive ? t.minimapPlay : settings.mapType === "city" ? t.minimapCityWorkshop : t.minimapWorkshop}</p>
        </aside>

        <div className="status-pill"><i />{status}</div>
        {playMode && (
          <div className="drive-hint" role="status">
            {driveHint(locale, entryMode)}
          </div>
        )}
        {playMode && (
          <DriveGauge
            speedKmh={driveHud.speedKmh}
            horsepower={driveHud.horsepower}
            powerNorm={driveHud.powerNorm}
            reverse={driveHud.reverse}
            labelSpeed={t.gaugeSpeed}
            labelHp={t.gaugeHp}
            labelReverse={t.gaugeReverse}
          />
        )}
        {canEdit && !playMode && (
          <div className="route-note">
            <span>{settings.mapType === "city" ? "ROUTE 02" : t.routeLabel}</span>
            <p>{settings.mapType === "city" ? (locale === "zh" ? "穿过住宅、商业、公共服务与工业街区，把城市连接起来。" : "Connect the residential, commercial, public-service and industrial blocks.") : t.routeNote}</p>
          </div>
        )}
      </section>

      {settings.mapType === "city" ? (canEdit && !playMode && panelOpen ? (
        <CityEditorPanel
          document={citySnapshot.document}
          locale={locale}
          tool={cityTool}
          activeCatalogId={activeCatalogId}
          activeRoadPreset={activeRoadPreset}
          activeSidewalkWidth={activeSidewalkWidth}
          selectedPlacementId={selectedPlacementId}
          topDown={cityTopDown}
          gridVisible={cityGridVisible}
          saveStatus={saveStatus}
          onExit={exitToLibrary}
          onClose={() => setPanelOpen(false)}
          onToolChange={(tool) => {
            cancelPendingPlacement();
            setCityTool(tool);
          }}
          onCatalogChange={(catalogId) => {
            cancelPendingPlacement();
            setActiveCatalogId(catalogId);
            setCityTool("place");
            const pointer = lastCityPointerClientRef.current;
            if (pointer) previewCatalogAtPointer(catalogId, pointer.x, pointer.y);
          }}
          onRoadPresetChange={(preset) => {
            cancelPendingPlacement();
            setActiveRoadPreset(preset);
            setCityTool("road");
          }}
          onSidewalkWidthChange={(width) => {
            cancelPendingPlacement();
            setActiveSidewalkWidth(width);
            setCityTool("road");
          }}
          onMoveSelection={moveSelected}
          onRotateSelection={rotateSelected}
          onDeleteSelection={deleteSelected}
          onDuplicateSelection={duplicateSelected}
          onStandardCommunityRowsChange={resizeSelectedStandardCommunity}
          onUndo={() => {
            cancelPendingPlacement();
            citySession.undo();
          }}
          onRedo={() => {
            cancelPendingPlacement();
            citySession.redo();
          }}
          onToggleCamera={() => {
            const next = !cityTopDown;
            setCityTopDown(next);
            sceneRef.current?.setCityEditorTopDown(next);
          }}
          onToggleGrid={toggleCityGrid}
          onImportDefault={importDefaultCity}
          onClear={clearCity}
          onExport={exportMap}
          onImportFile={() => importRef.current?.click()}
        />
      ) : null) : (canEdit ? (
      <aside id="map-controls" className={`control-panel ${panelOpen && !playMode ? "open" : ""}`} hidden={playMode}>
        <div className="workspace-panel-nav">
          <button type="button" className="workspace-back-button" data-testid="editor-back-to-maps" onClick={exitToLibrary}>
            <span aria-hidden="true">←</span>{locale === "zh" ? "返回地图列表" : "Back to map list"}
          </button>
          <span className={`map-autosave-status ${saveStatus}`} role="status" aria-live="polite" data-testid="map-autosave-status" data-state={saveStatus}>
            <i aria-hidden="true" />
            {saveStatus === "saving"
              ? (locale === "zh" ? "正在自动保存" : "Autosaving")
              : saveStatus === "error"
                ? (locale === "zh" ? "保存失败" : "Save failed")
                : (locale === "zh" ? "已自动保存" : "Autosaved")}
          </span>
        </div>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t.panelEyebrow}</p>
            <h2>{t.panelTitle}</h2>
          </div>
          <button className="close-panel" type="button" aria-label={t.closePanel} onClick={() => setPanelOpen(false)}>×</button>
        </div>
        <p className="panel-intro">
          {draft.mapType === "city"
            ? (locale === "zh" ? "编辑雪松新城的道路、建筑与多种场景，然后随时骑上小兔子摩托试玩。" : "Edit Cedar Crossing's roads, buildings and districts, then test the ride at any time.")
            : t.panelIntro}
        </p>

        <section className="control-group">
          <div className="section-label"><span>{t.worldParams}</span><b>01</b></div>
          {draft.mapType === "forest" ? (
            <>
              <Range label={t.forestDensity} value={draft.forestDensity} min={0.36} max={2.3} step={0.01} display={`${Math.round(draft.forestDensity * 100)}%`} onChange={(v) => update("forestDensity", v)} />
              <Range label={t.roadWidth} value={draft.roadWidth} min={3} max={14} step={0.2} display={`${draft.roadWidth.toFixed(1)}m`} onChange={(v) => update("roadWidth", v)} />
              <Range label={t.roadCurves} value={draft.roadCurves} min={0.12} max={1} step={0.01} display={`${Math.round(draft.roadCurves * 100)}%`} onChange={(v) => update("roadCurves", v)} />
            </>
          ) : (
            <>
              <Range label={t.cityDensity} value={draft.cityDensity} min={0.55} max={1.25} step={0.01} display={`${Math.round(draft.cityDensity * 100)}%`} onChange={(v) => update("cityDensity", v)} />
              <Range label={t.roadWidth} value={draft.roadWidth} min={6.7} max={11.5} step={0.1} display={`${getCityRoadWidthRange(draft.roadWidth, draft.seed).min.toFixed(0)}–${getCityRoadWidthRange(draft.roadWidth, draft.seed).max.toFixed(0)}m`} onChange={(v) => update("roadWidth", v)} />
            </>
          )}
          {draft.mapType === "forest" && (
            <Range label={t.fogDensity} value={draft.fogDensity} min={0.001} max={0.01} step={0.0005} display={draft.fogDensity.toFixed(4)} onChange={(v) => update("fogDensity", v)} />
          )}
          <Range label={t.deliveryStops} value={draft.deliveryStops} min={2} max={draft.mapType === "city" ? 12 : 8} step={1} display={t.stopsUnit(draft.deliveryStops)} onChange={(v) => update("deliveryStops", v)} />
        </section>

        {draft.mapType === "forest" && <section className="control-group">
          <div className="section-label"><span>{t.seasonPalette}</span><b>02</b></div>
          <div className="season-grid">
            {(["spring", "summer", "autumn"] as Season[]).map((season) => (
              <button key={season} className={draft.season === season ? "active" : ""} type="button" onClick={() => update("season", season)}>
                <i className={`swatch ${season}`} />{seasonLabel(season)}
              </button>
            ))}
          </div>
        </section>}

        {draft.mapType === "forest" && <section className="control-group">
          <div className="section-label"><span>{t.treeTune}</span><b>03</b></div>
          <div className="season-grid">
            <button
              type="button"
              className={draft.shatterMode ? "active" : ""}
              aria-pressed={draft.shatterMode}
              onClick={() => {
                const next = !draft.shatterMode;
                update("shatterMode", next);
                setShatterMode(next);
                setSettings((current) => ({ ...current, shatterMode: next }));
                sceneRef.current?.setShatterMode(next);
              }}
            >
              {draft.shatterMode ? t.shatterModeOff : t.shatterModeOn}
            </button>
          </div>
          <Range label={t.leafDensity} value={draft.treeLeafDensity} min={0.5} max={1.35} step={0.01} display={`${Math.round(draft.treeLeafDensity * 100)}%`} onChange={(v) => update("treeLeafDensity", v)} />
          <Range label={t.canopyWidth} value={draft.treeCanopyWidth} min={0.75} max={1.3} step={0.01} display={`${draft.treeCanopyWidth.toFixed(2)}×`} onChange={(v) => update("treeCanopyWidth", v)} />
          <Range label={t.treeHeight} value={draft.treeHeightScale} min={0.8} max={2.8} step={0.05} display={`${draft.treeHeightScale.toFixed(2)}×`} onChange={(v) => update("treeHeightScale", v)} />
        </section>}

        <section className="seed-row">
          <label htmlFor="seed">{t.mapSeed}</label>
          <div><span>#</span><input id="seed" value={draft.seed} inputMode="numeric" onChange={(event) => update("seed", Number(event.target.value) || 1)} /></div>
        </section>

        <div className="primary-actions">
          <button className="generate-button" type="button" onClick={() => generate()}>{draft.mapType === "city" ? t.generateCity : t.generate} <span>↗</span></button>
          <button className="dice-button" type="button" aria-label={t.randomMap} onClick={randomize}>✦</button>
        </div>

        <button className="play-entry-button" type="button" onClick={enterPlay}>
          {t.playEntry} <span>→</span>
        </button>

        <a className="model-showcase-entry" href="/demos">
          <span>
            <b>{locale === "zh" ? "模型展示区" : "Model showcase"}</b>
            <small>{locale === "zh" ? "街道装饰 · 交通工具 · 居民建筑 · 医院 · 游乐园 · 学校 · 商业中心 · 完整社区 · 消防局 · 城市公园 · 体育中心 · 城市中心 · 市镇中心" : "Street · Transportation · Residential · Hospital · Amusement park · School · Shopping mall · Community · Fire station · City park · Sports center · City center · Town center"}</small>
          </span>
          <i>↗</i>
        </a>

        <a className="model-showcase-entry" href="/characters">
          <span>
            <b>{locale === "zh" ? "角色档案馆" : "Character archive"}</b>
            <small>{locale === "zh" ? "兔子 · 狐狸 · 虎子 · 动作切换 · 骨骼检查" : "Rabbit · Fox · Tiger · Animation clips · Skeleton inspection"}</small>
          </span>
          <i>↗</i>
        </a>

        <div className="file-actions">
          <button type="button" onClick={exportMap}>{t.exportJson}</button>
          <button type="button" onClick={() => importRef.current?.click()}>{t.importMap}</button>
        </div>

        <footer className="panel-footer"><span>{map.name}</span><span>v0.7</span></footer>
      </aside>
      ) : null)}
      <input
        ref={importRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(event) => {
          void importMap(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </main>
  );
}

function Range({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <label className="range-control">
      <span><b>{label}</b><em>{display}</em></span>
      <input type="range" value={value} min={min} max={max} step={step} style={{ "--progress": `${progress}%` } as React.CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
