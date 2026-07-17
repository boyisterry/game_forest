"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type MapSettings, type Season } from "../lib/map/types";
import { ForestScene } from "../lib/map/ForestScene";

const SEASON_LABELS: Record<Season, string> = { spring: "新绿", summer: "盛夏", autumn: "金秋" };

type Stats = { trees: number; deliveryStops: number; drawCalls: number };

export function MapStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ForestScene | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<MapSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<MapSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<Stats>({ trees: 0, deliveryStops: 0, drawCalls: 0 });
  const [panelOpen, setPanelOpen] = useState(true);
  const [riderVisible, setRiderVisible] = useState(true);
  const [status, setStatus] = useState("正在唤醒森林…");

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new ForestScene(canvasRef.current, settings, (next) => {
      setStats(next);
      setStatus("地图已生成 · 拖拽旋转，滚轮缩放");
    });
    sceneRef.current = scene;
    const resize = () => scene.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      scene.dispose();
      sceneRef.current = null;
    };
  // The scene owns updates after creation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = <K extends keyof MapSettings>(key: K, value: MapSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const generate = (next = draft) => {
    setStatus("正在铺设林间小路…");
    setSettings(next);
    setDraft(next);
    requestAnimationFrame(() => sceneRef.current?.build(next));
  };

  const randomize = () => {
    const next = { ...draft, seed: Math.floor(10000 + Math.random() * 89999) };
    generate(next);
  };

  const exportMap = () => {
    const payload = JSON.stringify({ format: "forest-courier-map", version: 1, settings }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `forest-map-${settings.seed}.json`;
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
      setStatus("无法读取地图，请选择由本工具导出的 JSON 文件");
    }
  };

  return (
    <main className="studio-shell">
      <a className="skip-link" href="#map-controls">跳到地图参数</a>
      <section className="viewport" aria-label="森林地图三维预览">
        <canvas ref={canvasRef} className="scene-canvas" tabIndex={0} />
        <div className="atmosphere" aria-hidden="true" />

        <header className="brand-lockup">
          <div className="brand-mark">兔</div>
          <div>
            <p>FOREST COURIER · WORLD LAB</p>
            <h1>林间速递</h1>
          </div>
        </header>

        <div className="scene-stats" aria-live="polite">
          <span><b>{stats.trees}</b> 棵树</span>
          <span><b>{stats.deliveryStops}</b> 个配送点</span>
          <span><b>{stats.drawCalls}</b> 组实例</span>
        </div>

        <div className="view-actions">
          <button type="button" onClick={() => { const next = !riderVisible; setRiderVisible(next); sceneRef.current?.toggleRider(next); }}>
            {riderVisible ? "隐藏骑手" : "显示骑手"}
          </button>
          <button type="button" onClick={() => sceneRef.current?.resetCamera()}>俯瞰视角</button>
          <button className="mobile-panel-button" type="button" onClick={() => setPanelOpen((value) => !value)}>
            {panelOpen ? "收起参数" : "地图参数"}
          </button>
        </div>

        <div className="status-pill"><i />{status}</div>
        <div className="route-note">
          <span>ROUTE 01</span>
          <p>让每一条弯路，都通向一份温热的包裹。</p>
        </div>
      </section>

      <aside id="map-controls" className={`control-panel ${panelOpen ? "open" : ""}`}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">MAP GENERATOR / 01</p>
            <h2>地图工坊</h2>
          </div>
          <button className="close-panel" type="button" aria-label="收起参数" onClick={() => setPanelOpen(false)}>×</button>
        </div>
        <p className="panel-intro">调整世界的骨架，再生成一条适合小摩托穿梭的林间配送路线。</p>

        <section className="control-group">
          <div className="section-label"><span>世界参数</span><b>01</b></div>
          <Range label="森林密度" value={draft.forestDensity} min={0.24} max={1} step={0.01} display={`${Math.round(draft.forestDensity * 100)}%`} onChange={(v) => update("forestDensity", v)} />
          <Range label="道路宽度" value={draft.roadWidth} min={2.2} max={5.4} step={0.1} display={`${draft.roadWidth.toFixed(1)}m`} onChange={(v) => update("roadWidth", v)} />
          <Range label="道路弯曲" value={draft.roadCurves} min={0.12} max={1} step={0.01} display={`${Math.round(draft.roadCurves * 100)}%`} onChange={(v) => update("roadCurves", v)} />
          <Range label="晨雾浓度" value={draft.fogDensity} min={0.004} max={0.027} step={0.001} display={draft.fogDensity.toFixed(3)} onChange={(v) => update("fogDensity", v)} />
          <Range label="配送站点" value={draft.deliveryStops} min={2} max={8} step={1} display={`${draft.deliveryStops} 站`} onChange={(v) => update("deliveryStops", v)} />
        </section>

        <section className="control-group">
          <div className="section-label"><span>季节色谱</span><b>02</b></div>
          <div className="season-grid">
            {(Object.keys(SEASON_LABELS) as Season[]).map((season) => (
              <button key={season} className={draft.season === season ? "active" : ""} type="button" onClick={() => update("season", season)}>
                <i className={`swatch ${season}`} />{SEASON_LABELS[season]}
              </button>
            ))}
          </div>
        </section>

        <section className="seed-row">
          <label htmlFor="seed">地图种子</label>
          <div><span>#</span><input id="seed" value={draft.seed} inputMode="numeric" onChange={(event) => update("seed", Number(event.target.value) || 1)} /></div>
        </section>

        <div className="primary-actions">
          <button className="generate-button" type="button" onClick={() => generate()}>生成这片森林 <span>↗</span></button>
          <button className="dice-button" type="button" aria-label="随机地图" onClick={randomize}>✦</button>
        </div>

        <div className="file-actions">
          <button type="button" onClick={exportMap}>导出 JSON</button>
          <button type="button" onClick={() => importRef.current?.click()}>导入地图</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={(event) => importMap(event.target.files?.[0])} />
        </div>

        <footer className="panel-footer"><span>PROCEDURAL WORLD SYSTEM</span><span>v0.1</span></footer>
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
