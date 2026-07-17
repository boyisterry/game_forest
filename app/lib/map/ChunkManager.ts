import * as THREE from "three";
import {
  buildChunk,
  disposeChunkGroup,
  type ChunkBuildContext,
  type SharedForestAssets,
} from "./forestAssets";
import {
  CHUNK_SIZE,
  LOAD_RADIUS_CHUNKS,
  UNLOAD_RADIUS_CHUNKS,
  chunkKey,
  chunksInRadius,
  worldToChunk,
  type ChunkCoord,
} from "./world";

type LoadedChunk = {
  coord: ChunkCoord;
  group: THREE.Group;
  treeCount: number;
  drawCalls: number;
};

const LOADS_PER_FRAME = 2;

export class ChunkManager {
  private loaded = new Map<string, LoadedChunk>();
  private parent: THREE.Group;
  private context: ChunkBuildContext | null = null;
  private focus: ChunkCoord = { cx: 0, cz: 0 };
  private pending: ChunkCoord[] = [];

  constructor(parent: THREE.Group) {
    this.parent = parent;
  }

  configure(context: ChunkBuildContext) {
    this.clear();
    this.context = context;
    this.pending = [];
  }

  get assets(): SharedForestAssets | null {
    return this.context?.assets ?? null;
  }

  getStats() {
    let trees = 0;
    let drawCalls = 0;
    for (const chunk of this.loaded.values()) {
      trees += chunk.treeCount;
      drawCalls += chunk.drawCalls;
    }
    return {
      chunks: this.loaded.size,
      trees,
      drawCalls,
      focus: this.focus,
      loadedKeys: [...this.loaded.keys()],
      pending: this.pending.length,
    };
  }

  /** Queue neighborhood streaming around a world-space focus point. */
  update(focusX: number, focusZ: number) {
    if (!this.context) return;
    const nextFocus = worldToChunk(focusX, focusZ);
    this.focus = nextFocus;
    const neededList = chunksInRadius(nextFocus, LOAD_RADIUS_CHUNKS).filter((coord) => {
      const centerX = (coord.cx + 0.5) * CHUNK_SIZE;
      const centerZ = (coord.cz + 0.5) * CHUNK_SIZE;
      return this.context!.insideWorld(centerX, centerZ, -CHUNK_SIZE);
    });
    // Near-first so the camera neighborhood fills before the ring edge.
    neededList.sort((a, b) => {
      const da = (a.cx - nextFocus.cx) ** 2 + (a.cz - nextFocus.cz) ** 2;
      const db = (b.cx - nextFocus.cx) ** 2 + (b.cz - nextFocus.cz) ** 2;
      return da - db;
    });
    const needed = new Set(neededList.map((c) => chunkKey(c.cx, c.cz)));

    this.pending = neededList.filter((coord) => !this.loaded.has(chunkKey(coord.cx, coord.cz)));

    for (const [key, chunk] of this.loaded) {
      const dx = chunk.coord.cx - nextFocus.cx;
      const dz = chunk.coord.cz - nextFocus.cz;
      if (dx * dx + dz * dz > UNLOAD_RADIUS_CHUNKS * UNLOAD_RADIUS_CHUNKS && !needed.has(key)) {
        this.unload(key);
      }
    }
  }

  /** Call once per animation frame; returns true if any chunk was built. */
  pump(): boolean {
    if (!this.context || !this.pending.length) return false;
    let built = false;
    for (let i = 0; i < LOADS_PER_FRAME && this.pending.length; i += 1) {
      const coord = this.pending.shift()!;
      const key = chunkKey(coord.cx, coord.cz);
      if (this.loaded.has(key)) continue;
      this.load(coord);
      built = true;
    }
    return built;
  }

  private load(coord: ChunkCoord) {
    if (!this.context) return;
    const built = buildChunk(coord, this.context);
    this.parent.add(built.group);
    this.loaded.set(chunkKey(coord.cx, coord.cz), {
      coord,
      group: built.group,
      treeCount: built.treeCount,
      drawCalls: built.drawCalls,
    });
  }

  private unload(key: string) {
    const chunk = this.loaded.get(key);
    if (!chunk) return;
    this.parent.remove(chunk.group);
    disposeChunkGroup(chunk.group);
    this.loaded.delete(key);
  }

  clear() {
    this.pending = [];
    for (const key of [...this.loaded.keys()]) this.unload(key);
  }
}
