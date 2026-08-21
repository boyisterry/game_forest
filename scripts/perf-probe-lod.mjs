// Backward-compatible entry point. The authoritative R5 probe emits all three
// visual/collision stages as JSON instead of the old mixed showcase/map count.
await import("./perf-probe-map-lod-stages.mjs");
