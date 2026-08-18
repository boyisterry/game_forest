export type MinimapPoint = Readonly<{ x: number; z: number }>;
export type MinimapRoadLine = readonly MinimapPoint[];

type CityMinimapGraph = Readonly<{
  nodes: readonly Readonly<{ id: string; x: number; z: number }>[];
  edges: readonly Readonly<{ a: string; b: string }>[];
}>;

export type CityMinimapWorld = Readonly<{
  roadLines: readonly MinimapRoadLine[];
  stops: readonly MinimapPoint[];
}>;

/**
 * Convert the authoritative city graph into independent minimap lines. Stops
 * are sampled by network length, so changing the document immediately changes
 * both the route overview and the delivery readout without reviving the legacy
 * hard-coded Rain Harbor grid.
 */
export function deriveCityMinimapWorld(graph: CityMinimapGraph, requestedStops: number): CityMinimapWorld {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const measuredLines: Array<Readonly<{
    line: readonly [MinimapPoint, MinimapPoint];
    length: number;
  }>> = [];
  let totalLength = 0;
  for (const edge of graph.edges) {
    const a = nodes.get(edge.a);
    const b = nodes.get(edge.b);
    if (!a || !b) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length <= 1e-6) continue;
    const line = Object.freeze([
      Object.freeze({ x: a.x, z: a.z }),
      Object.freeze({ x: b.x, z: b.z }),
    ]) as readonly [MinimapPoint, MinimapPoint];
    measuredLines.push(Object.freeze({ line, length }));
    totalLength += length;
  }

  const stopCount = Number.isFinite(requestedStops)
    ? Math.max(0, Math.floor(requestedStops))
    : 0;
  const stops: MinimapPoint[] = [];
  if (totalLength > 0) {
    let lineIndex = 0;
    let lineStartDistance = 0;
    for (let index = 0; index < stopCount; index += 1) {
      const targetDistance = ((index + 1) / (stopCount + 1)) * totalLength;
      while (
        lineIndex < measuredLines.length - 1
        && lineStartDistance + measuredLines[lineIndex].length < targetDistance
      ) {
        lineStartDistance += measuredLines[lineIndex].length;
        lineIndex += 1;
      }
      const measured = measuredLines[lineIndex];
      const t = Math.min(1, Math.max(0, (targetDistance - lineStartDistance) / measured.length));
      const [a, b] = measured.line;
      stops.push(Object.freeze({
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
      }));
    }
  }

  return Object.freeze({
    roadLines: Object.freeze(measuredLines.map(({ line }) => line)),
    stops: Object.freeze(stops),
  });
}
