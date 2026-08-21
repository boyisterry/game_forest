"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Locale } from "../lib/i18n.ts";
import {
  CEDAR_CROSSING_MAP_ID,
  FOREST_DEFAULT_MAP_ID,
  MAP_LIBRARY_NAME_MAX_LENGTH,
  type MapLibraryRecord,
} from "../lib/map/mapLibrary.ts";

type MapLibraryScreenProps = Readonly<{
  maps: readonly MapLibraryRecord[];
  locale: Locale;
  loading?: boolean;
  error?: string | null;
  creating?: boolean;
  onLocaleChange: (locale: Locale) => void;
  onEdit: (mapId: string) => void;
  onPlay: (mapId: string) => void;
  onCreateCity: (name: string) => Promise<void>;
  onRetry: () => void;
}>;

const LIBRARY_COPY = {
  en: {
    eyebrow: "FOREST COURIER / MAP LIBRARY",
    title: "Choose your world",
    intro: "Open a map in the workshop, or jump straight onto the rabbit scooter.",
    newCity: "New city map",
    showcase: "City models",
    showcaseLabel: "Open the city model showcase",
    edit: "Edit",
    play: "Play",
    forest: "Forest",
    city: "City",
    forestName: "Deep Forest",
    builtinCityName: "Cedar Crossing",
    forestNote: "Procedural trails, rivers and ridges",
    cityNote: "Residential, commercial, civic and industrial blocks",
    empty: "No maps yet. Create a city to begin.",
    loading: "Loading your maps…",
    loadError: "The map library could not be loaded.",
    retry: "Retry",
    dialogTitle: "Create a city map",
    dialogIntro: "Start with an empty city frame. You can draw roads, place buildings and test the ride at any time.",
    name: "Map name",
    namePlaceholder: "Untitled City",
    cancel: "Cancel",
    create: "Create and edit",
    creating: "Creating…",
    language: "Language",
    mapCount: (count: number) => `${count} ${count === 1 ? "map" : "maps"}`,
  },
  zh: {
    eyebrow: "FOREST COURIER / 地图库",
    title: "选择要进入的世界",
    intro: "进入工坊继续创作，或直接骑上小兔子摩托开始游玩。",
    newCity: "新建城市地图",
    showcase: "城市模型展示",
    showcaseLabel: "进入城市模型展示区",
    edit: "编辑",
    play: "游玩",
    forest: "森林",
    city: "城市",
    forestName: "深林地图",
    builtinCityName: "雪松新城",
    forestNote: "程序生成的小径、河流与山脊",
    cityNote: "住宅、商业、公共服务与工业街区相连的完整城市",
    empty: "还没有地图，新建一座城市开始创作吧。",
    loading: "正在载入地图库…",
    loadError: "地图库载入失败。",
    retry: "重试",
    dialogTitle: "新建城市地图",
    dialogIntro: "从空白城市镜框开始。你可以自由铺设道路、放置建筑，并随时试玩。",
    name: "地图名称",
    namePlaceholder: "未命名城市",
    cancel: "取消",
    create: "创建并编辑",
    creating: "正在创建…",
    language: "语言",
    mapCount: (count: number) => `${count} 张地图`,
  },
} as const;

function mapUpdatedLabel(value: MapLibraryRecord["updatedAt"], locale: Locale) {
  if (value === 0) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function MapLibraryScreen(props: MapLibraryScreenProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const copy = LIBRARY_COPY[props.locale];

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || props.creating) return;
      setCreateOpen(false);
      setName("");
      setCreateError(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, props.creating]);

  const closeCreate = () => {
    if (props.creating) return;
    setCreateOpen(false);
    setName("");
    setCreateError(null);
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName || props.creating) return;
    setCreateError(null);
    try {
      await props.onCreateCity(normalizedName);
      setCreateOpen(false);
      setName("");
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : copy.loadError);
    }
  };

  return (
    <main className="map-library-shell" data-testid="map-library">
      <div className="map-library-atmosphere" aria-hidden="true" />
      <header className="map-library-header">
        <div className="map-library-brand" aria-label="Forest Courier">
          <span>兔</span>
          <div><b>FOREST COURIER</b><small>MAP WORKSHOP</small></div>
        </div>
        <div className="map-library-header-actions">
          <a
            className="map-library-showcase-link"
            data-testid="city-model-showcase-entry"
            href="/demos"
            aria-label={copy.showcaseLabel}
          >
            <span aria-hidden="true">模</span>
            <b>{copy.showcase}</b>
            <i aria-hidden="true">↗</i>
          </a>
          <div className="map-library-language" role="group" aria-label={copy.language}>
            <button type="button" className={props.locale === "en" ? "active" : ""} aria-pressed={props.locale === "en"} onClick={() => props.onLocaleChange("en")}>EN</button>
            <button type="button" className={props.locale === "zh" ? "active" : ""} aria-pressed={props.locale === "zh"} onClick={() => props.onLocaleChange("zh")}>中文</button>
          </div>
        </div>
      </header>

      <section className="map-library-hero" aria-labelledby="map-library-title">
        <p>{copy.eyebrow}</p>
        <div>
          <h1 id="map-library-title">{copy.title}</h1>
          <span>{copy.mapCount(props.maps.length)}</span>
        </div>
        <p>{copy.intro}</p>
      </section>

      <section className="map-library-content" aria-label={props.locale === "zh" ? "地图列表" : "Map list"}>
        <div className="map-library-toolbar">
          <span>{props.locale === "zh" ? "我的地图" : "MY MAPS"}</span>
          <button
            type="button"
            className="map-library-new"
            data-testid="new-city-button"
            disabled={props.loading}
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <i aria-hidden="true">＋</i>{copy.newCity}
          </button>
        </div>

        {props.loading && (
          <div className="map-library-hydrating" role="status" data-testid="map-library-loading">
            <i className="map-library-spinner" aria-hidden="true" />
            <p>{copy.loading}</p>
          </div>
        )}
        {!props.loading && props.error ? (
          <div className="map-library-state error" role="alert" data-testid="map-library-error">
            <b>!</b>
            <p>{copy.loadError}</p>
            <small>{props.error}</small>
            <button type="button" onClick={props.onRetry}>{copy.retry}</button>
          </div>
        ) : !props.loading && props.maps.length === 0 ? (
          <div className="map-library-state" data-testid="map-library-empty"><p>{copy.empty}</p></div>
        ) : (
          <div className="map-library-grid">
            {props.maps.map((map, index) => {
              const isForest = map.kind === "forest";
              const displayName = map.id === FOREST_DEFAULT_MAP_ID
                ? copy.forestName
                : map.id === CEDAR_CROSSING_MAP_ID
                  ? copy.builtinCityName
                  : map.name;
              const updated = mapUpdatedLabel(map.updatedAt, props.locale);
              return (
                <article
                  className={`map-library-card ${map.kind}${props.loading ? " loading" : ""}`}
                  aria-busy={props.loading}
                  data-testid="map-card"
                  data-map-id={map.id}
                  data-map-kind={map.kind}
                  key={map.id}
                >
                  <div className="map-library-card-art" aria-hidden="true">
                    <span>{isForest ? "林" : "市"}</span>
                    <i>{String(index + 1).padStart(2, "0")}</i>
                    <div className="map-library-card-lines" />
                  </div>
                  <div className="map-library-card-copy">
                    <div className="map-library-card-meta">
                      <span>{isForest ? copy.forest : copy.city}</span>
                      {updated && <time dateTime={new Date(map.updatedAt).toISOString()}>{updated}</time>}
                    </div>
                    <h2>{displayName}</h2>
                    <p>{isForest ? copy.forestNote : copy.cityNote}</p>
                  </div>
                  <div className="map-library-card-actions">
                    <button type="button" className="edit" disabled={props.loading} aria-label={`${copy.edit} ${displayName}`} onClick={() => props.onEdit(map.id)}>{copy.edit}</button>
                    <button type="button" className="play" disabled={props.loading} aria-label={`${copy.play} ${displayName}`} onClick={() => props.onPlay(map.id)}>{copy.play}<span aria-hidden="true">→</span></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {createOpen && (
        <div className="map-library-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeCreate();
        }}>
          <section className="map-library-dialog" role="dialog" aria-modal="true" aria-labelledby="new-city-title" data-testid="new-city-dialog">
            <button type="button" className="map-library-dialog-close" aria-label={copy.cancel} onClick={closeCreate}>×</button>
            <span className="map-library-dialog-icon" aria-hidden="true">市</span>
            <p>CITY DOCUMENT · NEW</p>
            <h2 id="new-city-title">{copy.dialogTitle}</h2>
            <p>{copy.dialogIntro}</p>
            <form onSubmit={submitCreate} aria-busy={props.creating}>
              <label htmlFor="new-city-name">{copy.name}</label>
              <input
                id="new-city-name"
                data-testid="new-city-name"
                value={name}
                placeholder={copy.namePlaceholder}
                maxLength={MAP_LIBRARY_NAME_MAX_LENGTH}
                autoFocus
                required
                disabled={props.creating}
                onChange={(event) => setName(event.target.value)}
              />
              {createError && <small className="map-library-create-error" role="alert">{createError}</small>}
              <div>
                <button type="button" onClick={closeCreate} disabled={props.creating}>{copy.cancel}</button>
                <button type="submit" className="primary" disabled={props.creating || name.trim().length === 0}>{props.creating ? copy.creating : copy.create}<span aria-hidden="true">→</span></button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
