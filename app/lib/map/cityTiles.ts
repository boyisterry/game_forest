export const TILE_SIZE_METERS = 1;
export const OCCUPANCY_TILES_X = 2200;
export const OCCUPANCY_TILES_Z = 1940;
export const CITY_TILE_ORIGIN_X = -1100;
export const CITY_TILE_ORIGIN_Z = -1080;

const GRID_EPSILON = 1e-6;

export type Yaw90 = 0 | 90 | 180 | 270;

export const CityTileLayer = Object.freeze({
  Road: 1 << 0,
  Sidewalk: 1 << 1,
  Intersection: 1 << 2,
  Decoration: 1 << 3,
  Reservation: 1 << 4,
  Solid: 1 << 5,
  Restricted: 1 << 6,
} as const);
export type CityTileLayerValue = (typeof CityTileLayer)[keyof typeof CityTileLayer];

export type TileRange = Readonly<{
  first: number;
  lastExclusive: number;
}>;

export type TileRect = Readonly<{
  i: number;
  j: number;
  w: number;
  d: number;
}>;

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

export function isYaw90(value: number): value is Yaw90 {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

export function normalizeYaw90(value: number): Yaw90 {
  assertFinite(value, "yaw");
  const normalized = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (!isYaw90(normalized)) throw new TypeError(`invalid right-angle yaw: ${value}`);
  return normalized;
}

export function worldSizeToTiles(sizeMeters: number): number {
  assertFinite(sizeMeters, "sizeMeters");
  if (sizeMeters < 0) throw new RangeError("sizeMeters must be non-negative");
  return Math.max(1, Math.ceil(sizeMeters / TILE_SIZE_METERS - GRID_EPSILON));
}

export function footprintTiles(
  worldX: number,
  worldZ: number,
  yaw: Yaw90,
): Readonly<{ w: number; d: number }> {
  if (!isYaw90(yaw)) throw new TypeError(`invalid right-angle yaw: ${yaw}`);
  const swap = yaw === 90 || yaw === 270;
  return Object.freeze({
    w: worldSizeToTiles(swap ? worldZ : worldX),
    d: worldSizeToTiles(swap ? worldX : worldZ),
  });
}

/** The only world-axis to tile-interval conversion. max is half-open. */
export function rasterizeWorldAabb(min: number, max: number, origin: number): TileRange {
  assertFinite(min, "min");
  assertFinite(max, "max");
  assertFinite(origin, "origin");
  if (max < min) throw new RangeError("max must be greater than or equal to min");
  const first = Math.floor((min - origin) / TILE_SIZE_METERS + GRID_EPSILON);
  const lastExclusive = Math.ceil((max - origin) / TILE_SIZE_METERS - GRID_EPSILON);
  return Object.freeze({ first, lastExclusive: Math.max(first, lastExclusive) });
}

export function rasterizeWorldAabb2d(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): TileRect {
  const x = rasterizeWorldAabb(minX, maxX, CITY_TILE_ORIGIN_X);
  const z = rasterizeWorldAabb(minZ, maxZ, CITY_TILE_ORIGIN_Z);
  return Object.freeze({
    i: x.first,
    j: z.first,
    w: x.lastExclusive - x.first,
    d: z.lastExclusive - z.first,
  });
}

export function squareTilesFromCircle(
  diameterMeters: number,
): Readonly<{ n: number; padMeters: number }> {
  const n = worldSizeToTiles(diameterMeters);
  return Object.freeze({ n, padMeters: n * TILE_SIZE_METERS });
}

export function tileToWorldCenter(i: number, j: number): Readonly<{ x: number; z: number }> {
  if (!Number.isInteger(i) || !Number.isInteger(j)) {
    throw new TypeError("tile coordinates must be integers");
  }
  return Object.freeze({
    x: CITY_TILE_ORIGIN_X + (i + 0.5) * TILE_SIZE_METERS,
    z: CITY_TILE_ORIGIN_Z + (j + 0.5) * TILE_SIZE_METERS,
  });
}

export function worldToNearestTileCenter(x: number, z: number): Readonly<{ i: number; j: number; x: number; z: number }> {
  assertFinite(x, "x");
  assertFinite(z, "z");
  const i = Math.round((x - CITY_TILE_ORIGIN_X) / TILE_SIZE_METERS - 0.5);
  const j = Math.round((z - CITY_TILE_ORIGIN_Z) / TILE_SIZE_METERS - 0.5);
  const centre = tileToWorldCenter(i, j);
  return Object.freeze({ i, j, x: centre.x, z: centre.z });
}

/** Rotate a grid footprint around its centre, never around the north-west corner. */
export function rotateTileRect90(rect: TileRect): TileRect {
  const centerI2 = rect.i * 2 + rect.w;
  const centerJ2 = rect.j * 2 + rect.d;
  const nextW = rect.d;
  const nextD = rect.w;
  const nextI2 = centerI2 - nextW;
  const nextJ2 = centerJ2 - nextD;
  // Mixed-parity footprints (for example the required 4×1 planter) cannot
  // preserve their exact centre using integer corner coordinates. Half-tile
  // corners are therefore a deliberate placement value. Occupancy callers
  // rasterize the resulting world AABB and never index arrays with this value.
  return Object.freeze({ i: nextI2 / 2, j: nextJ2 / 2, w: nextW, d: nextD });
}

export function isTileRectInsideMap(rect: TileRect): boolean {
  return rect.i >= 0
    && rect.j >= 0
    && rect.w >= 0
    && rect.d >= 0
    && rect.i + rect.w <= OCCUPANCY_TILES_X
    && rect.j + rect.d <= OCCUPANCY_TILES_Z;
}

/** Compact occupancy: one byte per cell plus a numeric reservation owner table. */
export class CityTileOccupancy {
  readonly layers = new Uint8Array(OCCUPANCY_TILES_X * OCCUPANCY_TILES_Z);
  private static readonly RESERVATION_CHUNK_SIZE = 64;
  private readonly reservationChunks = new Map<number, Uint32Array>();
  private readonly ownerToId = new Map<string, number>();
  private readonly idToOwner: string[] = [""];

  private index(i: number, j: number) {
    if (!Number.isInteger(i) || !Number.isInteger(j)
      || i < 0 || j < 0 || i >= OCCUPANCY_TILES_X || j >= OCCUPANCY_TILES_Z) {
      throw new RangeError(`tile out of range: ${i},${j}`);
    }
    return j * OCCUPANCY_TILES_X + i;
  }

  private ownerId(owner: string) {
    const existing = this.ownerToId.get(owner);
    if (existing !== undefined) return existing;
    const id = this.idToOwner.length;
    this.ownerToId.set(owner, id);
    this.idToOwner.push(owner);
    return id;
  }

  private reservationChunk(i: number, j: number, create: boolean) {
    const size = CityTileOccupancy.RESERVATION_CHUNK_SIZE;
    const chunkX = Math.floor(i / size);
    const chunkZ = Math.floor(j / size);
    const chunksX = Math.ceil(OCCUPANCY_TILES_X / size);
    const key = chunkZ * chunksX + chunkX;
    let chunk = this.reservationChunks.get(key);
    if (!chunk && create) {
      chunk = new Uint32Array(size * size);
      this.reservationChunks.set(key, chunk);
    }
    return { chunk, offset: (j % size) * size + (i % size), key };
  }

  get reservationChunkCount() {
    return this.reservationChunks.size;
  }

  getLayers(i: number, j: number) {
    return this.layers[this.index(i, j)];
  }

  getReservationOwner(i: number, j: number): string | null {
    this.index(i, j);
    const reservation = this.reservationChunk(i, j, false);
    const id = reservation.chunk?.[reservation.offset] ?? 0;
    return id === 0 ? null : (this.idToOwner[id] ?? null);
  }

  hasAny(rect: TileRect, mask: number) {
    if (!isTileRectInsideMap(rect)) return true;
    for (let j = rect.j; j < rect.j + rect.d; j += 1) {
      let offset = j * OCCUPANCY_TILES_X + rect.i;
      for (let i = 0; i < rect.w; i += 1, offset += 1) {
        if ((this.layers[offset] & mask) !== 0) return true;
      }
    }
    return false;
  }

  paint(rect: TileRect, mask: number, reservationOwner?: string) {
    if (!isTileRectInsideMap(rect)) throw new RangeError("tile rectangle is outside the city map");
    const ownerId = reservationOwner === undefined ? 0 : this.ownerId(reservationOwner);
    for (let j = rect.j; j < rect.j + rect.d; j += 1) {
      let offset = j * OCCUPANCY_TILES_X + rect.i;
      for (let i = 0; i < rect.w; i += 1, offset += 1) {
        this.layers[offset] |= mask;
        if ((mask & CityTileLayer.Reservation) !== 0) {
          const reservation = this.reservationChunk(rect.i + i, j, true);
          reservation.chunk![reservation.offset] = ownerId;
        }
      }
    }
  }

  clear(rect: TileRect, mask: number, reservationOwner?: string) {
    if (!isTileRectInsideMap(rect)) throw new RangeError("tile rectangle is outside the city map");
    for (let j = rect.j; j < rect.j + rect.d; j += 1) {
      let offset = j * OCCUPANCY_TILES_X + rect.i;
      for (let i = 0; i < rect.w; i += 1, offset += 1) {
        if ((mask & CityTileLayer.Reservation) !== 0 && reservationOwner !== undefined) {
          const reservation = this.reservationChunk(rect.i + i, j, false);
          const current = reservation.chunk?.[reservation.offset] ?? 0;
          if (current !== 0 && this.idToOwner[current] !== reservationOwner) continue;
        }
        this.layers[offset] &= ~mask;
        if ((mask & CityTileLayer.Reservation) !== 0) {
          const reservation = this.reservationChunk(rect.i + i, j, false);
          if (reservation.chunk) {
            reservation.chunk[reservation.offset] = 0;
            if (!reservation.chunk.some((owner) => owner !== 0)) {
              this.reservationChunks.delete(reservation.key);
            }
          }
        }
      }
    }
  }
}
