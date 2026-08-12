"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type MapSettings, type MapType, type Season } from "../lib/map/types";
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

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

type DriveHud = {
  speedKmh: number;
  horsepower: number;
  powerNorm: number;
  reverse: boolean;
  drifting: boolean;
};

export function MapStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ForestScene | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<MapSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<SceneStats>({ trees: 0, grass: 0, stones: 0, buildings: 0, streetLights: 0, deliveryStops: 0, drawCalls: 0, chunks: 0 });
  const [panelOpen, setPanelOpen] = useState(true);
  const [riderVisible, setRiderVisible] = useState(true);
  const [playMode, setPlayMode] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [shatterMode, setShatterMode] = useState(DEFAULT_SETTINGS.shatterMode);
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [status, setStatus] = useState(COPY[DEFAULT_LOCALE].statusWaking);
  const [driveHud, setDriveHud] = useState<DriveHud>({
    speedKmh: 0,
    horsepower: 0,
    powerNorm: 0,
    reverse: false,
    drifting: false,
  });
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const playModeRef = useRef(playMode);
  playModeRef.current = playMode;
  const mapTypeRef = useRef(settings.mapType);
  mapTypeRef.current = settings.mapType;
  const t = COPY[locale];

  useEffect(() => {
    const stored = readStoredLocale();
    setLocale(stored);
    setStatus(COPY[stored].statusWaking);
  }, []);

  useEffect(() => {
    writeStoredLocale(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    }
    setStatus((current) => {
      // Refresh mode-bound status lines when language flips.
      if (playModeRef.current) return COPY[locale].statusPlay;
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
        if (playModeRef.current) return COPY[locale].statusPlay;
        return mapTypeRef.current === "city" ? COPY[locale].statusCityReady : COPY[locale].statusWorkshop;
      }
      return current;
    });
  }, [locale]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new ForestScene(canvasRef.current, settings, (next) => {
      setStats(next);
      setStatus((current) => {
        const copy = COPY[localeRef.current];
        if (current === copy.statusPlay || current === copy.statusEnterPlay || current === copy.statusRiderLoading) {
          return current;
        }
        if (playModeRef.current) return copy.statusPlay;
        return mapTypeRef.current === "city" ? copy.statusCityReady : copy.statusStreaming(next.chunks);
      });
    });
    sceneRef.current = scene;
    scene.setDriveModeListener((on) => {
      setPlayMode(on);
      const copy = COPY[localeRef.current];
      if (on) {
        setRiderVisible(true);
        setPanelOpen(false);
        setStatus(copy.statusPlay);
      } else {
        setPanelOpen(true);
        setStatus(copy.statusWorkshop);
      }
      requestAnimationFrame(() => scene.resize());
    });
    const renderHook = () => JSON.stringify(scene.getTextState());
    const advanceHook = (ms: number) => scene.advanceForTest(ms);
    window.render_game_to_text = renderHook;
    window.advanceTime = advanceHook;
    if (minimapRef.current) scene.attachMinimap(minimapRef.current);
    const resize = () => scene.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      scene.dispose();
      sceneRef.current = null;
      if (window.render_game_to_text === renderHook) delete window.render_game_to_text;
      if (window.advanceTime === advanceHook) delete window.advanceTime;
    };
  // The scene owns updates after creation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (minimapRef.current && sceneRef.current) {
      sceneRef.current.attachMinimap(minimapRef.current);
    }
  }, []);

  useEffect(() => {
    if (!playMode) {
      setDriveHud({ speedKmh: 0, horsepower: 0, powerNorm: 0, reverse: false, drifting: false });
      return;
    }
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

  const selectMap = (mapType: MapType) => {
    if (mapType === draft.mapType) return;
    const next: MapSettings = mapType === "city"
      ? {
          ...draft,
          mapType,
          roadWidth: 8,
          deliveryStops: Math.max(6, draft.deliveryStops),
          fogDensity: Math.min(draft.fogDensity, 0.0024),
        }
      : {
          ...draft,
          mapType,
          roadWidth: DEFAULT_SETTINGS.roadWidth,
          deliveryStops: DEFAULT_SETTINGS.deliveryStops,
          fogDensity: DEFAULT_SETTINGS.fogDensity,
        };
    generate(next);
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

  const exportMap = () => {
    const payload = JSON.stringify({ format: "forest-courier-map", version: 2, settings }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${settings.mapType}-map-${settings.seed}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importMap = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { settings?: MapSettings };
      if (!parsed.settings || typeof parsed.settings.seed !== "number") throw new Error("invalid map");
      generate({ ...DEFAULT_SETTINGS, ...parsed.settings });
    } catch {
      setStatus(t.statusImportFail);
    }
  };

  const enterPlay = () => {
    setStatus(sceneRef.current?.isRiderReady() ? t.statusEnterPlay : t.statusRiderLoading);
    setPanelOpen(false);
    sceneRef.current?.setDriveMode(true);
  };

  const enterWorkshop = () => {
    sceneRef.current?.setDriveMode(false);
  };

  const toggleAudio = () => {
    setAudioMuted((current) => {
      const next = !current;
      sceneRef.current?.setAudioMuted(next);
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
    <main className={`studio-shell ${settings.mapType}-map ${playMode ? "play-mode" : "workshop-mode"}`}>
      <a className="skip-link" href="#map-controls">{t.skipLink}</a>
      <section className="viewport" aria-label={settings.mapType === "city" ? (locale === "zh" ? "雨港新城三维预览" : "Rain Harbor city 3D preview") : playMode ? t.viewportPlay : t.viewportWorkshop}>
        <canvas ref={canvasRef} className="scene-canvas" tabIndex={0} />
        <div className="atmosphere" aria-hidden="true" />

        <header className="brand-lockup" aria-label="Rabbit">
          <div className="brand-mark">兔</div>
          <p className="brand-version">{t.brandVersion}</p>
        </header>

        <div className="mode-switch" role="tablist" aria-label={t.modeSwitch}>
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
        </div>

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

        {!playMode && (
          <a className="showcase-switch" href="/demos" aria-label={locale === "zh" ? "切换到城市模型展示区" : "Switch to the city model showcase"}>
            <span>{locale === "zh" ? "城市模型展示区" : "City model showcase"}</span>
            <i aria-hidden="true">↗</i>
          </a>
        )}

        {!playMode && (
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
          {playMode ? (
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
          <p>{playMode ? t.minimapPlay : settings.mapType === "city" ? t.minimapCityWorkshop : t.minimapWorkshop}</p>
        </aside>

        <div className="status-pill"><i />{status}</div>
        {playMode && (
          <div className="drive-hint" role="status">
            {t.driveHint}
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
        {!playMode && (
          <div className="route-note">
            <span>{settings.mapType === "city" ? "ROUTE 02" : t.routeLabel}</span>
            <p>{settings.mapType === "city" ? (locale === "zh" ? "穿过五个城区，把灯火送到港湾。" : "Carry the city lights all the way to the harbor.") : t.routeNote}</p>
          </div>
        )}
      </section>

      <aside id="map-controls" className={`control-panel ${panelOpen && !playMode ? "open" : ""}`} hidden={playMode}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{t.panelEyebrow}</p>
            <h2>{t.panelTitle}</h2>
          </div>
          <button className="close-panel" type="button" aria-label={t.closePanel} onClick={() => setPanelOpen(false)}>×</button>
        </div>
        <p className="panel-intro">
          {draft.mapType === "city"
            ? (locale === "zh" ? "调节雨港的建筑与街道，然后骑上小兔子摩托穿过五个城区配送。" : "Tune Rain Harbor, then ride the rabbit scooter through all five city districts.")
            : t.panelIntro}
        </p>

        <section className="control-group map-choice-group">
          <div className="section-label"><span>{t.mapChoice}</span><b>00</b></div>
          <div className="map-choice-grid">
            <button type="button" className={draft.mapType === "forest" ? "active" : ""} onClick={() => selectMap("forest")}>
              <span className="map-choice-icon forest">林</span>
              <strong>{t.forestMap}</strong>
              <small>{t.forestMapDesc}</small>
            </button>
            <button type="button" className={draft.mapType === "city" ? "active" : ""} onClick={() => selectMap("city")}>
              <span className="map-choice-icon city">市</span>
              <strong>{t.cityMap}</strong>
              <small>{t.cityMapDesc}</small>
            </button>
          </div>
        </section>

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
            <small>{locale === "zh" ? "街道装饰 · 居民建筑 · 医院 · 游乐园 · 学校" : "Street · Residential · Hospital · Amusement park · School"}</small>
          </span>
          <i>↗</i>
        </a>

        <div className="file-actions">
          <button type="button" onClick={exportMap}>{t.exportJson}</button>
          <button type="button" onClick={() => importRef.current?.click()}>{t.importMap}</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => importMap(event.target.files?.[0])} />
        </div>

        <footer className="panel-footer"><span>{draft.mapType === "city" ? "RAIN HARBOR CITY" : "DEEP FOREST CANOPY"}</span><span>v0.6</span></footer>
      </aside>
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
