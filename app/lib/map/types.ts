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
};

export const DEFAULT_SETTINGS: MapSettings = {
  seed: 24719,
  forestDensity: 0.86,
  roadWidth: 3.2,
  roadCurves: 0.66,
  fogDensity: 0.0028,
  deliveryStops: 4,
  season: "spring",
  treeLeafDensity: 1,
  treeCanopyWidth: 1.12,
  treeHeightScale: 1.55,
};
