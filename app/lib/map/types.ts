export type Season = "spring" | "summer" | "autumn";

export type MapSettings = {
  seed: number;
  forestDensity: number;
  roadWidth: number;
  roadCurves: number;
  fogDensity: number;
  deliveryStops: number;
  season: Season;
};

export const DEFAULT_SETTINGS: MapSettings = {
  seed: 24719,
  forestDensity: 0.72,
  roadWidth: 3.2,
  roadCurves: 0.66,
  fogDensity: 0.012,
  deliveryStops: 4,
  season: "spring",
};
