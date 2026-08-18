"use client";

import { useMemo, useState } from "react";
import {
  CITY_CATALOG,
  type CatalogEntrySnapshot,
} from "../lib/map/cityCatalog.ts";
import type { CityMapDocumentSnapshot } from "../lib/map/cityDocument.ts";
import type { RoadPresetId } from "../lib/map/cityRoadGraph.ts";

export type CityEditorTool = "select" | "place" | "road";

export type CityEditorPanelProps = Readonly<{
  document: CityMapDocumentSnapshot;
  locale: "en" | "zh";
  tool: CityEditorTool;
  activeCatalogId: string | null;
  activeRoadPreset: RoadPresetId;
  selectedPlacementId: string | null;
  topDown: boolean;
  onClose: () => void;
  onToolChange: (tool: CityEditorTool) => void;
  onCatalogChange: (catalogId: string) => void;
  onRoadPresetChange: (preset: RoadPresetId) => void;
  onRotateSelection: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleCamera: () => void;
  onImportDefault: () => void;
  onClear: () => void;
  onExport: () => void;
  onImportFile: () => void;
}>;

const ROAD_PRESETS: readonly Readonly<{ id: RoadPresetId; zh: string; en: string; width: string }>[] = [
  { id: "one-way-1", zh: "单行一车道", en: "One-way", width: "15 m" },
  { id: "two-way-1", zh: "双向单车道", en: "Two-way · 1", width: "30 m" },
  { id: "two-way-2", zh: "双向双车道", en: "Two-way · 2", width: "36 m" },
  { id: "two-way-3", zh: "双向三车道", en: "Two-way · 3", width: "42 m" },
];

function footprintLabel(entry: CatalogEntrySnapshot) {
  const footprint = entry.footprintOverride ?? {
    w: Math.ceil(entry.siteSizeMeters.x * entry.mapScale),
    d: Math.ceil(entry.siteSizeMeters.z * entry.mapScale),
  };
  return `${footprint.w}×${footprint.d}`;
}

export function CityEditorPanel(props: CityEditorPanelProps) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const grouped = useMemo(() => {
    const result = new Map<number, CatalogEntrySnapshot[]>();
    for (const entry of CITY_CATALOG) {
      if (normalizedSearch
        && !entry.id.includes(normalizedSearch)
        && !entry.titleZh.includes(search.trim())
        && !entry.titleEn.toLocaleLowerCase().includes(normalizedSearch)) continue;
      const items = result.get(entry.collection) ?? [];
      items.push(entry);
      result.set(entry.collection, items);
    }
    return [...result.entries()].sort(([left], [right]) => left - right);
  }, [normalizedSearch, search]);
  const selected = props.document.placements.find((placement) => placement.id === props.selectedPlacementId);
  const isZh = props.locale === "zh";

  return (
    <aside id="map-controls" className="control-panel city-editor-panel open">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">CITY DOCUMENT · v1</p>
          <h2>{isZh ? "城市地图工坊" : "City map workshop"}</h2>
        </div>
        <button className="close-panel" type="button" aria-label={isZh ? "关闭面板" : "Close panel"} onClick={props.onClose}>×</button>
      </div>

      <div className="city-editor-toolbar" role="toolbar" aria-label={isZh ? "编辑工具" : "Editing tools"}>
        <button type="button" className={props.tool === "select" ? "active" : ""} onClick={() => props.onToolChange("select")}>{isZh ? "选择" : "Select"}</button>
        <button type="button" className={props.tool === "place" ? "active" : ""} onClick={() => props.onToolChange("place")}>{isZh ? "放置" : "Place"}</button>
        <button type="button" className={props.tool === "road" ? "active" : ""} onClick={() => props.onToolChange("road")}>{isZh ? "道路刷" : "Road"}</button>
        <button type="button" onClick={props.onUndo} title="Ctrl/Cmd+Z">↶</button>
        <button type="button" onClick={props.onRedo} title="Ctrl/Cmd+Shift+Z">↷</button>
        <button type="button" className={props.topDown ? "active" : ""} onClick={props.onToggleCamera}>{props.topDown ? (isZh ? "透视" : "Perspective") : (isZh ? "俯视" : "Top")}</button>
      </div>

      {props.tool === "road" ? (
        <section className="control-group city-road-tools">
          <div className="section-label"><span>{isZh ? "道路剖面" : "ROAD PROFILE"}</span><b>01</b></div>
          <p className="city-editor-hint">{isZh ? "在地图上按下并拖动。道路锁定世界 X/Z 轴，并在交点自动拆边。" : "Drag on the map. Roads lock to world X/Z and split at crossings."}</p>
          <div className="city-road-preset-grid">
            {ROAD_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={props.activeRoadPreset === preset.id ? "active" : ""}
                onClick={() => props.onRoadPresetChange(preset.id)}
              >
                <strong>{isZh ? preset.zh : preset.en}</strong><small>{preset.width}</small>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="control-group city-palette">
          <div className="section-label"><span>{isZh ? "模型调色板" : "MODEL PALETTE"}</span><b>{CITY_CATALOG.length}</b></div>
          <label className="city-catalog-search">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={isZh ? "搜索建筑、场景、装饰…" : "Search buildings, scenes, decor…"} />
          </label>
          <div className="city-catalog-groups">
            {grouped.map(([collection, entries]) => (
              <section key={collection} className="city-catalog-group">
                <h3>COLLECTION {String(collection).padStart(2, "0")}</h3>
                <div className="city-catalog-grid">
                  {entries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      draggable
                      className={props.activeCatalogId === entry.id ? "active" : ""}
                      onClick={() => props.onCatalogChange(entry.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("application/x-forest-city-catalog", entry.id);
                        props.onCatalogChange(entry.id);
                      }}
                    >
                      <span className={`city-catalog-icon ${entry.category}`}>{String(collection).padStart(2, "0")}</span>
                      <span><strong>{isZh ? entry.titleZh : entry.titleEn}</strong><small>{footprintLabel(entry)} · {entry.category}</small></span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {grouped.length === 0 && <p className="city-editor-empty">{isZh ? "没有匹配条目" : "No matching catalog entries"}</p>}
          </div>
        </section>
      )}

      <section className="control-group city-inspector">
        <div className="section-label"><span>{isZh ? "检查器" : "INSPECTOR"}</span><b>02</b></div>
        {selected ? (
          <>
            <dl>
              <div><dt>ID</dt><dd>{selected.id}</dd></div>
              <div><dt>{isZh ? "目录" : "Catalog"}</dt><dd>{selected.catalogId}</dd></div>
              <div><dt>{isZh ? "位姿" : "Pose"}</dt><dd>{selected.poseKind}</dd></div>
              {selected.poseKind === "grid" && <div><dt>{isZh ? "格坐标" : "Grid"}</dt><dd>{selected.i}, {selected.j} · {selected.yaw}°</dd></div>}
              {selected.poseKind !== "grid" && <div><dt>XZ</dt><dd>{selected.x.toFixed(1)}, {selected.z.toFixed(1)}</dd></div>}
            </dl>
            <div className="city-selection-actions">
              <button type="button" onClick={props.onRotateSelection} disabled={selected.poseKind !== "grid"}>R · {isZh ? "旋转" : "Rotate"}</button>
              <button type="button" onClick={props.onDuplicateSelection} disabled={selected.poseKind !== "grid"}>{isZh ? "复制" : "Duplicate"}</button>
              <button type="button" className="danger" onClick={props.onDeleteSelection}>{isZh ? "删除" : "Delete"}</button>
            </div>
          </>
        ) : (
          <p className="city-editor-hint">{isZh ? "单击场景中的物件进行选择；Esc 取消当前工具。" : "Click an object to inspect it; Esc cancels the current tool."}</p>
        )}
      </section>

      <section className="control-group city-document-actions">
        <div className="section-label"><span>{isZh ? "文档" : "DOCUMENT"}</span><b>03</b></div>
        <div className="city-document-stats">
          <span><b>{props.document.placements.length}</b>{isZh ? "物件" : "placements"}</span>
          <span><b>{props.document.graph.edges.length}</b>{isZh ? "道路" : "roads"}</span>
          <span><b>{props.document.graph.nodes.length}</b>{isZh ? "节点" : "nodes"}</span>
        </div>
        <div className="city-document-buttons">
          <button type="button" onClick={props.onImportDefault}>{isZh ? "导入默认雨港" : "Import Rain Harbor"}</button>
          <button type="button" onClick={props.onClear}>{isZh ? "清空为镜框" : "Clear frame"}</button>
          <button type="button" onClick={props.onExport}>{isZh ? "导出 JSON" : "Export JSON"}</button>
          <button type="button" onClick={props.onImportFile}>{isZh ? "导入文件" : "Import file"}</button>
        </div>
      </section>

      <footer className="panel-footer"><span>RAIN HARBOR CITY DOCUMENT</span><span>v1</span></footer>
    </aside>
  );
}
