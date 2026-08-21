"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LOCALE,
  readStoredLocale,
  writeStoredLocale,
  type Locale,
} from "../lib/i18n.ts";
import {
  createDefaultMapLibraryRecords,
  MapLibraryConflictError,
  type MapEntryMode,
  type MapLibraryRecord,
  type MapSaveStatus,
} from "../lib/map/mapLibrary.ts";
import { createMapLibraryRepository } from "../lib/map/mapLibraryStorage.ts";
import type { CityMapDocumentSnapshot } from "../lib/map/cityDocument.ts";
import type { MapSettings } from "../lib/map/types.ts";
import { MapStudio } from "./MapStudio.tsx";
import { MapLibraryScreen } from "./MapLibraryScreen.tsx";

type Workspace = Readonly<{
  map: MapLibraryRecord;
  entryMode: MapEntryMode;
}>;

type MapContentUpdate = Readonly<{
  settings: MapSettings;
  cityDocument?: CityMapDocumentSnapshot;
}>;

const INITIAL_MAPS = createDefaultMapLibraryRecords();

function sortMaps(records: readonly MapLibraryRecord[]) {
  return [...records].sort((left, right) => {
    if (left.builtin !== right.builtin) return left.builtin ? -1 : 1;
    if (left.kind !== right.kind) return left.kind === "forest" ? -1 : 1;
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function mergeMapContent(
  record: MapLibraryRecord,
  update: MapContentUpdate,
): MapLibraryRecord {
  if (update.settings.mapType !== record.kind) {
    throw new TypeError(`Map ${record.id} cannot change kind from ${record.kind} to ${update.settings.mapType}`);
  }
  if (record.kind === "city" && !update.cityDocument) {
    throw new TypeError(`City map ${record.id} must include a city document`);
  }
  return {
    ...record,
    settings: structuredClone(update.settings),
    ...(record.kind === "city"
      ? { cityDocument: structuredClone(update.cityDocument) }
      : { cityDocument: undefined }),
    updatedAt: Date.now(),
  };
}

export function MapLibraryApp() {
  const [repository] = useState(() => createMapLibraryRepository());
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [maps, setMaps] = useState<readonly MapLibraryRecord[]>(INITIAL_MAPS);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const [retryingSave, setRetryingSave] = useState(false);
  const [saveStatus, setSaveStatus] = useState<MapSaveStatus>("saved");
  const workspaceRef = useRef<Workspace | null>(null);
  const latestMapUpdateRef = useRef<MapContentUpdate | null>(null);
  const persistedRecordsRef = useRef(new Map(INITIAL_MAPS.map((record) => [record.id, record])));
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const exitingRef = useRef(false);
  const saveGenerationRef = useRef(0);

  const publishRecords = useCallback((records: readonly MapLibraryRecord[]) => {
    const next = sortMaps(records);
    persistedRecordsRef.current = new Map(next.map((record) => [record.id, record]));
    setMaps(next);
  }, []);

  const loadMaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      publishRecords(await repository.list());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [publishRecords, repository]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = readStoredLocale();
      setLocale(stored);
      void loadMaps();
    });
    return () => cancelAnimationFrame(frame);
  }, [loadMaps]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    writeStoredLocale(locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  useEffect(() => () => {
    void saveQueueRef.current.then(
      () => repository.close(),
      () => repository.close(),
    );
  }, [repository]);

  const openMap = useCallback((mapId: string, entryMode: MapEntryMode) => {
    const map = persistedRecordsRef.current.get(mapId);
    if (!map) {
      setError(`Map ${mapId} is no longer available`);
      return;
    }
    setError(null);
    setSaveConflict(false);
    latestMapUpdateRef.current = null;
    exitingRef.current = false;
    saveGenerationRef.current += 1;
    setSaveStatus("saved");
    setWorkspace({ map, entryMode });
  }, []);

  const enqueueActiveMapSave = useCallback((update: MapContentUpdate) => {
    const active = workspaceRef.current;
    if (!active || active.entryMode !== "edit") return Promise.resolve();
    const mapId = active.map.id;
    const captured: MapContentUpdate = {
      settings: structuredClone(update.settings),
      ...(update.cityDocument ? { cityDocument: structuredClone(update.cityDocument) } : {}),
    };
    latestMapUpdateRef.current = captured;
    const saveGeneration = ++saveGenerationRef.current;
    setSaveStatus("saving");
    const save = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const base = persistedRecordsRef.current.get(mapId);
        if (!base) throw new Error(`Map ${mapId} is no longer available`);
        const saved = await repository.save(mergeMapContent(base, captured), base.revision);
        persistedRecordsRef.current.set(saved.id, saved);
        setMaps((current) => sortMaps(current.map((record) => record.id === saved.id ? saved : record)));
        setError(null);
        setSaveConflict(false);
        if (saveGeneration === saveGenerationRef.current) setSaveStatus("saved");
      });
    saveQueueRef.current = save;
    void save.catch((saveError) => {
      console.error("Failed to save map", saveError);
      setSaveConflict(saveError instanceof MapLibraryConflictError);
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      if (saveGeneration === saveGenerationRef.current) setSaveStatus("error");
    });
    return save;
  }, [repository]);

  const saveActiveMap = useCallback((update: MapContentUpdate) => {
    void enqueueActiveMapSave(update);
  }, [enqueueActiveMapSave]);

  const retryLatestSave = useCallback(() => {
    if (!latestMapUpdateRef.current || retryingSave) return;
    setRetryingSave(true);
    const retry = async () => {
      if (saveConflict) {
        const mapId = workspaceRef.current?.map.id;
        if (!mapId) throw new Error("No active map is available to save");
        const current = await repository.get(mapId);
        if (!current) throw new Error(`Map ${mapId} is no longer available`);
        // The user explicitly chose to keep this editor's complete snapshot.
        // Refresh only the CAS base; the mounted session remains untouched.
        persistedRecordsRef.current.set(current.id, current);
        setMaps((records) => sortMaps(records.map((record) => record.id === current.id ? current : record)));
      }
      const latest = latestMapUpdateRef.current;
      if (!latest) throw new Error("No unsaved map snapshot is available");
      await enqueueActiveMapSave(latest);
    };
    void retry().then(
      () => setRetryingSave(false),
      (retryError) => {
        console.error("Failed to retry map save", retryError);
        setError(retryError instanceof Error ? retryError.message : String(retryError));
        setRetryingSave(false);
      },
    );
  }, [enqueueActiveMapSave, repository, retryingSave, saveConflict]);

  const exitWorkspace = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    void (async () => {
      // An editor effect may enqueue one last snapshot during the exit event.
      // Observe the tail until it stays stable, then flush the repository's
      // own write queue before unmounting the keyed studio.
      let observedTail: Promise<void>;
      do {
        observedTail = saveQueueRef.current;
        await observedTail;
      } while (observedTail !== saveQueueRef.current);
      await repository.flush();
    })()
      .then(() => {
        const activeId = workspaceRef.current?.map.id;
        if (activeId) {
          const persisted = persistedRecordsRef.current.get(activeId);
          if (persisted) {
            setMaps((current) => sortMaps(current.map((record) => record.id === persisted.id ? persisted : record)));
          }
        }
        workspaceRef.current = null;
        latestMapUpdateRef.current = null;
        setWorkspace(null);
        exitingRef.current = false;
      })
      .catch((saveError) => {
        // Keep the keyed editor mounted when persistence fails so the user's
        // in-memory document is not discarded. A second exit retries because
        // MapStudio submits its complete latest snapshot before onExit.
        console.error("Failed to flush map changes", saveError);
        setError(saveError instanceof Error ? saveError.message : String(saveError));
        setSaveStatus("error");
        exitingRef.current = false;
      });
  }, [repository]);

  const createCity = useCallback(async (name: string) => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      await saveQueueRef.current;
      const created = await repository.createCity(name);
      persistedRecordsRef.current.set(created.id, created);
      setMaps((current) => sortMaps([...current, created]));
      const next: Workspace = { map: created, entryMode: "edit" };
      workspaceRef.current = next;
      saveGenerationRef.current += 1;
      setSaveStatus("saved");
      setWorkspace(next);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : String(createError);
      setError(message);
      throw createError;
    } finally {
      setCreating(false);
    }
  }, [creating, repository]);

  if (workspace) {
    return (
      <>
        <MapStudio
          key={`${workspace.map.id}:${workspace.entryMode}`}
          map={workspace.map}
          entryMode={workspace.entryMode}
          saveStatus={saveStatus}
          onSave={saveActiveMap}
          onExit={exitWorkspace}
        />
        {error && workspace.entryMode === "edit" && (
          <aside className="map-save-alert" role="alert" data-testid="map-save-alert">
            <div>
              <b>{locale === "zh" ? "地图尚未保存" : "Map changes are not saved"}</b>
              <span>{saveConflict
                ? (locale === "zh" ? "这张地图已在另一个标签页更新。当前编辑仍保留；确认后可用当前版本覆盖。" : "This map changed in another tab. Your edits remain here; confirm to overwrite it with this version.")
                : (locale === "zh" ? "编辑内容仍保留在当前页面，请重试后再刷新或关闭。" : "Your edits remain in this page. Retry before refreshing or closing it.")}</span>
              <small>{error}</small>
            </div>
            <button type="button" disabled={retryingSave} onClick={retryLatestSave}>
              {retryingSave
                ? (locale === "zh" ? "正在重试…" : "Retrying…")
                : saveConflict
                  ? (locale === "zh" ? "用当前版本覆盖" : "Overwrite with mine")
                  : (locale === "zh" ? "重试保存" : "Retry save")}
            </button>
          </aside>
        )}
      </>
    );
  }

  return (
    <MapLibraryScreen
      maps={maps}
      locale={locale}
      loading={loading}
      error={error}
      creating={creating}
      onLocaleChange={setLocale}
      onEdit={(mapId) => openMap(mapId, "edit")}
      onPlay={(mapId) => openMap(mapId, "play")}
      onCreateCity={createCity}
      onRetry={() => void loadMaps()}
    />
  );
}
