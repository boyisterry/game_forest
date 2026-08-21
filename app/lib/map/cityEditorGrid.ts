import * as THREE from "three";
import {
  CITY_TILE_ORIGIN_X,
  CITY_TILE_ORIGIN_Z,
  OCCUPANCY_TILES_X,
  OCCUPANCY_TILES_Z,
  TILE_SIZE_METERS,
} from "./cityTiles.ts";

export type CityEditorGridVisibilityInput = Readonly<{
  enabled: boolean;
  mapType: "forest" | "city";
  driveMode: boolean;
  pendingDrive: boolean;
  hasDocument: boolean;
}>;

export type CityEditorGrid = Readonly<{
  mesh: THREE.Mesh;
  setHoveredCell: (cell: Readonly<{ i: number; j: number }> | null) => void;
  dispose: () => void;
}>;

/**
 * Editor chrome owns the user's preference, while the scene owns the actual
 * mode gates. In particular, a pending ride hides the grid before the rider
 * and city collision have finished loading, so direct play never flashes an
 * editing overlay.
 */
export function shouldShowCityEditorGrid(input: CityEditorGridVisibilityInput) {
  return input.enabled
    && input.mapType === "city"
    && input.hasDocument
    && !input.driveMode
    && !input.pendingDrive;
}

const MAP_WIDTH_METERS = OCCUPANCY_TILES_X * TILE_SIZE_METERS;
const MAP_DEPTH_METERS = OCCUPANCY_TILES_Z * TILE_SIZE_METERS;
const MAP_MAX_X = CITY_TILE_ORIGIN_X + MAP_WIDTH_METERS;
const MAP_MAX_Z = CITY_TILE_ORIGIN_Z + MAP_DEPTH_METERS;
const MAP_CENTER_X = (CITY_TILE_ORIGIN_X + MAP_MAX_X) * 0.5;
const MAP_CENTER_Z = (CITY_TILE_ORIGIN_Z + MAP_MAX_Z) * 0.5;

// The ground is at -0.025m and road tops begin around +0.005m. A small lift,
// plus polygon offset, keeps the overlay stable without making it read as a
// floating surface. Opaque buildings still occlude it because depth testing
// remains enabled.
const GRID_SURFACE_Y = 0.018;

const VERTEX_SHADER = /* glsl */`
  varying vec2 vGridWorld;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vGridWorld = worldPosition.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  precision highp float;

  varying vec2 vGridWorld;

  uniform vec2 uMapMin;
  uniform vec2 uMapMax;
  uniform vec3 uGridSteps;
  uniform vec2 uHoveredCell;
  uniform float uHasHoveredCell;

  // Returns antialiased line coverage. Dividing the repeating coordinate by
  // fwidth converts the distance into screen pixels, preventing the dense
  // one-metre grid from turning into a shimmering moire pattern when zoomed.
  float gridLine(vec2 coordinate, float halfWidthPixels) {
    vec2 derivative = max(fwidth(coordinate), vec2(0.00001));
    vec2 distancePixels = abs(fract(coordinate - 0.5) - 0.5) / derivative;
    float nearest = min(distancePixels.x, distancePixels.y);
    return 1.0 - smoothstep(halfWidthPixels, halfWidthPixels + 1.0, nearest);
  }

  float signedAxisLine(float coordinate, float metresPerPixel, float halfWidthPixels) {
    float distancePixels = abs(coordinate) / max(metresPerPixel, 0.00001);
    return 1.0 - smoothstep(halfWidthPixels, halfWidthPixels + 1.0, distancePixels);
  }

  void addLayer(
    inout vec3 accumulatedColor,
    inout float accumulatedAlpha,
    vec3 layerColor,
    float layerAlpha
  ) {
    layerAlpha = clamp(layerAlpha, 0.0, 1.0);
    float nextAlpha = accumulatedAlpha + layerAlpha * (1.0 - accumulatedAlpha);
    if (nextAlpha > 0.00001) {
      accumulatedColor = (
        accumulatedColor * accumulatedAlpha * (1.0 - layerAlpha)
        + layerColor * layerAlpha
      ) / nextAlpha;
    }
    accumulatedAlpha = nextAlpha;
  }

  void main() {
    vec2 worldDerivative = max(fwidth(vGridWorld), vec2(0.00001));
    float metresPerPixel = max(worldDerivative.x, worldDerivative.y);
    float pixelsPerMetre = 1.0 / metresPerPixel;
    vec2 fromMapOrigin = vGridWorld - uMapMin;

    float oneMetre = gridLine(fromMapOrigin / uGridSteps.x, 0.22);
    float tenMetres = gridLine(fromMapOrigin / uGridSteps.y, 0.42);
    float hundredMetres = gridLine(fromMapOrigin / uGridSteps.z, 0.68);

    // Each level appears only when its interval occupies enough pixels to be
    // legible. The transition is local to the fragment, so an oblique camera
    // naturally fades the horizon before it aliases while retaining near cells.
    float oneMetreFade = smoothstep(2.4, 6.0, pixelsPerMetre * uGridSteps.x);
    float tenMetreFade = smoothstep(1.5, 4.5, pixelsPerMetre * uGridSteps.y);
    float hundredMetreFade = smoothstep(1.0, 3.0, pixelsPerMetre * uGridSteps.z);

    vec3 color = vec3(0.0);
    float alpha = 0.0;
    addLayer(color, alpha, vec3(0.28, 0.46, 0.50), oneMetre * oneMetreFade * 0.24);
    addLayer(color, alpha, vec3(0.13, 0.34, 0.40), tenMetres * tenMetreFade * 0.42);
    addLayer(color, alpha, vec3(0.91, 0.63, 0.29), hundredMetres * hundredMetreFade * 0.62);

    // World axes remain distinct from the tile-origin hierarchy. Warm is the
    // X axis (z=0); blue is the Z axis (x=0).
    float xAxis = signedAxisLine(vGridWorld.y, metresPerPixel, 0.85);
    float zAxis = signedAxisLine(vGridWorld.x, metresPerPixel, 0.85);
    addLayer(color, alpha, vec3(0.91, 0.33, 0.20), xAxis * 0.82);
    addLayer(color, alpha, vec3(0.16, 0.49, 0.76), zAxis * 0.82);

    float boundaryDistance = min(
      min(vGridWorld.x - uMapMin.x, uMapMax.x - vGridWorld.x),
      min(vGridWorld.y - uMapMin.y, uMapMax.y - vGridWorld.y)
    );
    float boundaryPixels = max(boundaryDistance, 0.0) / metresPerPixel;
    float boundary = 1.0 - smoothstep(0.65, 1.85, boundaryPixels);
    addLayer(color, alpha, vec3(0.96, 0.82, 0.51), boundary * 0.88);

    if (uHasHoveredCell > 0.5) {
      vec2 tileCoordinate = fromMapOrigin / uGridSteps.x;
      vec2 local = tileCoordinate - uHoveredCell;
      float inside = step(0.0, local.x) * step(local.x, 1.0)
        * step(0.0, local.y) * step(local.y, 1.0);
      float hoverEdgeTiles = min(min(local.x, 1.0 - local.x), min(local.y, 1.0 - local.y));
      float hoverEdgePixels = max(hoverEdgeTiles, 0.0) / metresPerPixel;
      float hoverOutline = inside * (1.0 - smoothstep(0.55, 1.8, hoverEdgePixels));
      addLayer(color, alpha, vec3(1.0, 0.73, 0.22), inside * 0.14);
      addLayer(color, alpha, vec3(1.0, 0.82, 0.34), hoverOutline * 0.92);
    }

    if (alpha < 0.002) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createCityEditorGrid(): CityEditorGrid {
  const geometry = new THREE.PlaneGeometry(MAP_WIDTH_METERS, MAP_DEPTH_METERS, 1, 1);
  geometry.name = "city-editor-grid-geometry";

  const uniforms = {
    uMapMin: { value: new THREE.Vector2(CITY_TILE_ORIGIN_X, CITY_TILE_ORIGIN_Z) },
    uMapMax: { value: new THREE.Vector2(MAP_MAX_X, MAP_MAX_Z) },
    uGridSteps: { value: new THREE.Vector3(TILE_SIZE_METERS, 10, 100) },
    uHoveredCell: { value: new THREE.Vector2(-1, -1) },
    uHasHoveredCell: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: "city-editor-grid-material",
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "city-editor-grid";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(MAP_CENTER_X, GRID_SURFACE_Y, MAP_CENTER_Z);
  mesh.renderOrder = 4;
  // Callers must apply shouldShowCityEditorGrid after mounting. Starting hidden
  // prevents a direct-play scene from flashing the editor overlay for one frame.
  mesh.visible = false;
  mesh.updateMatrixWorld(true);

  let disposed = false;
  const setHoveredCell = (cell: Readonly<{ i: number; j: number }> | null) => {
    const valid = cell !== null
      && Number.isInteger(cell.i)
      && Number.isInteger(cell.j)
      && cell.i >= 0
      && cell.i < OCCUPANCY_TILES_X
      && cell.j >= 0
      && cell.j < OCCUPANCY_TILES_Z;
    if (!valid || !cell) {
      uniforms.uHasHoveredCell.value = 0;
      uniforms.uHoveredCell.value.set(-1, -1);
      return;
    }
    uniforms.uHoveredCell.value.set(cell.i, cell.j);
    uniforms.uHasHoveredCell.value = 1;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mesh.removeFromParent();
    geometry.dispose();
    material.dispose();
  };

  return Object.freeze({ mesh, setHoveredCell, dispose });
}
