export type Season = "spring" | "summer" | "autumn";

export type MapSettings = {
  seed: number;
  forestDensity: number;
  roadWidth: number;
  roadCurves: number;
  fogDensity: number;
  deliveryStops: number;
  season: Season;
  /** Scales leaf clusters / tip growth (cursor_demo-style live knob). */
  treeLeafDensity: number;
  /** Scales crown envelope width. */
  treeCanopyWidth: number;
  /** Vertical-only scale so trunks can become towering without ballooning crowns. */
  treeHeightScale: number;
  /**
   * When true, forest presents the shattered floating-shard look (amount=1).
   * When false, intact grounded trees (amount=0). Toggle animates blast/gather.
   */
  shatterMode: boolean;
};

export const DEFAULT_SETTINGS: MapSettings = {
  seed: 24719,
  forestDensity: 0.86,
  roadWidth: 6.4,
  roadCurves: 0.66,
  fogDensity: 0.0028,
  deliveryStops: 4,
  season: "spring",
  treeLeafDensity: 1,
  treeCanopyWidth: 1.12,
  treeHeightScale: 1.55,
  shatterMode: false, // normal GLB is the default; shatter stays an opt-in FX state
};
