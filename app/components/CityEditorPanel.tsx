"use client";

import { useMemo, useState } from "react";
import {
  CITY_CATALOG,
  STANDARD_COMMUNITY_ROW_OPTIONS,
  standardCommunityRowsFromCatalogId,
  type CatalogEntrySnapshot,
  type StandardCommunityRowOption,
} from "../lib/map/cityCatalog.ts";
import type { CityMapDocumentSnapshot } from "../lib/map/cityDocument.ts";
import {
  corridorMeters,
  createRoadProfile,
  SIDEWALK_WIDTH_METERS,
  type RoadPresetId,
  type SidewalkWidthTier,
} from "../lib/map/cityRoadGraph.ts";
import type { MapSaveStatus } from "../lib/map/mapLibrary.ts";

export type CityEditorTool = "select" | "place" | "road";

export type CityEditorPanelProps = Readonly<{
  document: CityMapDocumentSnapshot;
  locale: "en" | "zh";
  tool: CityEditorTool;
  activeCatalogId: string | null;
  activeRoadPreset: RoadPresetId;
  activeSidewalkWidth: SidewalkWidthTier;
  selectedPlacementId: string | null;
  topDown: boolean;
  gridVisible: boolean;
  saveStatus: MapSaveStatus;
  onClose: () => void;
  onExit: () => void;
  onToolChange: (tool: CityEditorTool) => void;
  onCatalogChange: (catalogId: string) => void;
  onRoadPresetChange: (preset: RoadPresetId) => void;
  onSidewalkWidthChange: (width: SidewalkWidthTier) => void;
  onMoveSelection: () => void;
  onRotateSelection: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onStandardCommunityRowsChange: (rowsPerSide: StandardCommunityRowOption) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleCamera: () => void;
  onToggleGrid: () => void;
  onImportDefault: () => void;
  onClear: () => void;
  onExport: () => void;
  onImportFile: () => void;
}>;

const ROAD_PRESETS: readonly Readonly<{ id: RoadPresetId; zh: string; en: string }>[] = [
  { id: "one-way-1", zh: "单行一车道", en: "One-way" },
  { id: "two-way-1", zh: "双向单车道", en: "Two-way · 1" },
  { id: "two-way-2", zh: "双向双车道", en: "Two-way · 2" },
  { id: "two-way-3", zh: "双向三车道", en: "Two-way · 3" },
];

const SIDEWALK_WIDTH_OPTIONS: readonly Readonly<{ id: SidewalkWidthTier; zh: string; en: string }>[] = [
  { id: "narrow", zh: "窄", en: "Narrow" },
  { id: "medium", zh: "中", en: "Medium" },
  { id: "wide", zh: "宽", en: "Wide" },
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
  const selectedCommunityRows = selected ? standardCommunityRowsFromCatalogId(selected.catalogId) : null;
  const isZh = props.locale === "zh";

  return (
    <aside id="map-controls" className="control-panel city-editor-panel open">
      <div className="workspace-panel-nav">
        <button type="button" className="workspace-back-button" data-testid="editor-back-to-maps" onClick={props.onExit}>
          <span aria-hidden="true">←</span>{isZh ? "返回地图列表" : "Back to map list"}
        </button>
        <span className={`map-autosave-status ${props.saveStatus}`} role="status" aria-live="polite" data-testid="map-autosave-status" data-state={props.saveStatus}>
          <i aria-hidden="true" />
          {props.saveStatus === "saving"
            ? (isZh ? "正在自动保存" : "Autosaving")
            : props.saveStatus === "error"
              ? (isZh ? "保存失败" : "Save failed")
              : (isZh ? "已自动保存" : "Autosaved")}
        </span>
      </div>
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
        <button
          type="button"
          className={props.topDown ? "active" : ""}
          aria-label={props.topDown ? (isZh ? "切换到透视视角" : "Switch to perspective view") : (isZh ? "切换到俯视视角" : "Switch to top view")}
          title={props.topDown ? (isZh ? "透视视角" : "Perspective view") : (isZh ? "俯视视角" : "Top view")}
          onClick={props.onToggleCamera}
        >
          {props.topDown ? (isZh ? "透视" : "3D") : (isZh ? "俯视" : "Top")}
        </button>
        <button
          type="button"
          className={props.gridVisible ? "active" : ""}
          aria-pressed={props.gridVisible}
          aria-label={isZh ? "地图编辑网格" : "Map editor grid"}
          title={props.gridVisible ? (isZh ? "关闭网格" : "Hide grid") : (isZh ? "打开网格" : "Show grid")}
          onClick={props.onToggleGrid}
        >
          <span aria-hidden="true">▦</span>{isZh ? "网格" : "Grid"}
        </button>
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
                <strong>{isZh ? preset.zh : preset.en}</strong>
                <small>{isZh ? "总宽" : "Total"} {corridorMeters({ profile: createRoadProfile(preset.id, props.activeSidewalkWidth) })} m</small>
              </button>
            ))}
          </div>
          <div className="city-sidewalk-width-label">
            <strong>{isZh ? "人行道宽度" : "SIDEWALK WIDTH"}</strong>
            <small>{isZh ? "单侧" : "PER SIDE"}</small>
          </div>
          <div className="city-sidewalk-width-grid" role="group" aria-label={isZh ? "人行道宽度" : "Sidewalk width"}>
            {SIDEWALK_WIDTH_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={props.activeSidewalkWidth === option.id ? "active" : ""}
                aria-pressed={props.activeSidewalkWidth === option.id}
                onClick={() => props.onSidewalkWidthChange(option.id)}
              >
                <strong>{isZh ? option.zh : option.en}</strong>
                <small>{SIDEWALK_WIDTH_METERS[option.id]} m</small>
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
            {selectedCommunityRows !== null && (
              <fieldset className="city-community-row-selector">
                <legend>{isZh ? "左右两侧住宅排数" : "ROWS PER SIDE"}</legend>
                <p>{isZh ? "保持中心点不变，在3–6排之间扩展或缩小1米网格占地。" : "Resize the 1 m-grid site from 3 to 6 rows while preserving its centre."}</p>
                <div>
                  {STANDARD_COMMUNITY_ROW_OPTIONS.map((rows) => (
                    <button
                      key={rows}
                      type="button"
                      className={selectedCommunityRows === rows ? "active" : ""}
                      aria-pressed={selectedCommunityRows === rows}
                      onClick={() => props.onStandardCommunityRowsChange(rows)}
                    >
                      {rows}{isZh ? "排" : " rows"}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="city-selection-actions">
              <button type="button" onClick={props.onMoveSelection} disabled={selected.poseKind !== "grid"}>{isZh ? "移动" : "Move"}</button>
              <button type="button" onClick={props.onRotateSelection} disabled={selected.poseKind !== "grid"}>R · {isZh ? "旋转" : "Rotate"}</button>
              <button type="button" onClick={props.onDuplicateSelection} disabled={selected.poseKind !== "grid"}>{isZh ? "复制" : "Duplicate"}</button>
              <button type="button" className="danger" onClick={props.onDeleteSelection}>{isZh ? "删除" : "Delete"}</button>
            </div>
          </>
        ) : (
          <p className="city-editor-hint">{isZh ? "单击场景中的物件进行选择；拖动物件可预览新位置，再单击确认；Esc 取消。" : "Click an object to select it; drag to preview a new location, then click to confirm; Esc cancels."}</p>
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
          <button type="button" onClick={props.onImportDefault}>{isZh ? "导入默认雪松新城" : "Import Cedar Crossing"}</button>
          <button type="button" onClick={props.onClear}>{isZh ? "清空为镜框" : "Clear frame"}</button>
          <button type="button" onClick={props.onExport}>{isZh ? "导出 JSON" : "Export JSON"}</button>
          <button type="button" onClick={props.onImportFile}>{isZh ? "导入文件" : "Import file"}</button>
        </div>
      </section>

      <footer className="panel-footer"><span>CEDAR CROSSING CITY DOCUMENT</span><span>v1</span></footer>
    </aside>
  );
}
