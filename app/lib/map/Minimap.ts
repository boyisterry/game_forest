import {
  CHUNK_SIZE,
  LOAD_RADIUS_CHUNKS,
  WORLD_HALF_DEPTH,
  WORLD_HALF_WIDTH,
  chunkKey,
  eastBoundaryX,
  isInsideWorld,
  northBoundaryZ,
  southBoundaryZ,
  westBoundaryX,
  worldToChunk,
} from "./world";

export type MinimapFrame = {
  road: Array<{ x: number; z: number }>;
  stops: Array<{ x: number; z: number }>;
  focusX: number;
  focusZ: number;
  cameraX: number;
  cameraZ: number;
  /** Actual direction of travel in world radians; null while editing the map. */
  travelHeading: number | null;
  loadedKeys: string[];
};

/** Lightweight 2D overview — full world always visible, streaming state as tint. */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private roadCache: Array<{ x: number; z: number }> = [];
  private stops: Array<{ x: number; z: number }> = [];
  private onJump: ((x: number, z: number) => void) | null = null;
  private worldSeed = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Minimap 2D context unavailable");
    this.ctx = ctx;
    canvas.addEventListener("pointerdown", this.handlePointer);
  }

  setWorld(road: Array<{ x: number; z: number }>, stops: Array<{ x: number; z: number }>, seed = 1) {
    // Decimate for draw cost while keeping route silhouette.
    this.roadCache = road.filter((_, index) => index % 6 === 0 || index === road.length - 1);
    this.stops = stops;
    this.worldSeed = seed;
  }

  setJumpHandler(handler: ((x: number, z: number) => void) | null) {
    this.onJump = handler;
  }

  private handlePointer = (event: PointerEvent) => {
    if (!this.onJump) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * this.canvas.width;
    const py = ((event.clientY - rect.top) / rect.height) * this.canvas.height;
    const world = this.pixelToWorld(px, py);
    if (!isInsideWorld(world.x, world.z, this.worldSeed, 24)) return;
    this.onJump(world.x, world.z);
  };

  private worldToPixel(x: number, z: number) {
    const pad = 10;
    const scaleX = (this.canvas.width - pad * 2) / (WORLD_HALF_WIDTH * 2);
    const scaleZ = (this.canvas.height - pad * 2) / (WORLD_HALF_DEPTH * 2);
    return {
      x: this.canvas.width * 0.5 + x * scaleX,
      y: this.canvas.height * 0.5 + z * scaleZ,
    };
  }

  private pixelToWorld(px: number, py: number) {
    const pad = 10;
    const scaleX = (this.canvas.width - pad * 2) / (WORLD_HALF_WIDTH * 2);
    const scaleZ = (this.canvas.height - pad * 2) / (WORLD_HALF_DEPTH * 2);
    return {
      x: (px - this.canvas.width * 0.5) / scaleX,
      z: (py - this.canvas.height * 0.5) / scaleZ,
    };
  }

  private traceBoundary() {
    const { ctx } = this;
    const steps = 36;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const x = -WORLD_HALF_WIDTH + (i / steps) * WORLD_HALF_WIDTH * 2;
      const p = this.worldToPixel(x, northBoundaryZ(x, this.worldSeed));
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let i = 0; i <= steps; i += 1) {
      const z = -WORLD_HALF_DEPTH + (i / steps) * WORLD_HALF_DEPTH * 2;
      const p = this.worldToPixel(eastBoundaryX(z, this.worldSeed), z);
      ctx.lineTo(p.x, p.y);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const x = -WORLD_HALF_WIDTH + (i / steps) * WORLD_HALF_WIDTH * 2;
      const p = this.worldToPixel(x, southBoundaryZ(x, this.worldSeed));
      ctx.lineTo(p.x, p.y);
    }
    for (let i = steps; i >= 0; i -= 1) {
      const z = -WORLD_HALF_DEPTH + (i / steps) * WORLD_HALF_DEPTH * 2;
      const p = this.worldToPixel(westBoundaryX(z, this.worldSeed), z);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  private strokeEdge(side: "north" | "east" | "south" | "west", color: string, width: number) {
    const { ctx } = this;
    const steps = 36;
    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      let x = 0;
      let z = 0;
      if (side === "north" || side === "south") {
        x = -WORLD_HALF_WIDTH + t * WORLD_HALF_WIDTH * 2;
        z = side === "north" ? northBoundaryZ(x, this.worldSeed) : southBoundaryZ(x, this.worldSeed);
      } else {
        z = -WORLD_HALF_DEPTH + t * WORLD_HALF_DEPTH * 2;
        x = side === "west" ? westBoundaryX(z, this.worldSeed) : eastBoundaryX(z, this.worldSeed);
      }
      const p = this.worldToPixel(x, z);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  draw(frame: MinimapFrame) {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "rgba(232, 237, 228, 0.92)";
    ctx.beginPath();
    const r = 10;
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#cfd8c6";
    this.traceBoundary();
    ctx.fill();

    // Loaded streaming neighborhood.
    ctx.save();
    this.traceBoundary();
    ctx.clip();
    ctx.fillStyle = "rgba(71, 111, 40, 0.12)";
    for (const key of frame.loadedKeys) {
      const [cx, cz] = key.split(",").map(Number);
      const a = this.worldToPixel(cx * CHUNK_SIZE, cz * CHUNK_SIZE);
      const b = this.worldToPixel((cx + 1) * CHUNK_SIZE, (cz + 1) * CHUNK_SIZE);
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    ctx.restore();

    this.strokeEdge("north", "#70796f", 4.2);
    this.strokeEdge("east", "#70796f", 4.2);
    this.strokeEdge("south", "#6e9da2", 3.5);
    this.strokeEdge("west", "#6e9da2", 3.5);

    ctx.strokeStyle = "#c4b08a";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    this.roadCache.forEach((point, index) => {
      const p = this.worldToPixel(point.x, point.z);
      if (index === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    for (const stop of this.stops) {
      const p = this.worldToPixel(stop.x, stop.z);
      ctx.fillStyle = "#e8a83a";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    const focus = this.worldToPixel(frame.focusX, frame.focusZ);
    const cam = this.worldToPixel(frame.cameraX, frame.cameraZ);
    const focusChunk = worldToChunk(frame.focusX, frame.focusZ);
    const ring = LOAD_RADIUS_CHUNKS * CHUNK_SIZE;
    const ringPx = this.worldToPixel(frame.focusX + ring, frame.focusZ).x - focus.x;
    ctx.strokeStyle = "rgba(40, 74, 42, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(focus.x, focus.y, Math.abs(ringPx), 0, Math.PI * 2);
    ctx.stroke();

    if (frame.travelHeading === null) {
      ctx.strokeStyle = "#294a2a";
      ctx.fillStyle = "#476f28";
      ctx.beginPath();
      ctx.moveTo(cam.x, cam.y);
      ctx.lineTo(focus.x, focus.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(focus.x, focus.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // World heading 0 points toward +Z, which is downward on the minimap.
      const dx = Math.sin(frame.travelHeading);
      const dy = Math.cos(frame.travelHeading);
      const sideX = -dy;
      const sideY = dx;
      const tipX = focus.x + dx * 10;
      const tipY = focus.y + dy * 10;
      const tailX = focus.x - dx * 5;
      const tailY = focus.y - dy * 5;
      ctx.save();
      ctx.shadowColor = "rgba(36, 45, 30, 0.34)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = "#e58c2f";
      ctx.strokeStyle = "#fff8e9";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tailX + sideX * 4.6, tailY + sideY * 4.6);
      ctx.lineTo(focus.x - dx * 1.5, focus.y - dy * 1.5);
      ctx.lineTo(tailX - sideX * 4.6, tailY - sideY * 4.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#294a2a";
      ctx.beginPath();
      ctx.arc(focus.x, focus.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(24, 48, 33, 0.72)";
    ctx.font = "600 9px 'Avenir Next', 'PingFang SC', sans-serif";
    ctx.fillText("WORLD MAP", 10, 14);
    ctx.fillStyle = "rgba(98, 112, 102, 0.85)";
    ctx.font = "8px 'SFMono-Regular', Consolas, monospace";
    ctx.fillText(`×20 · chunk ${chunkKey(focusChunk.cx, focusChunk.cz)}`, 10, h - 8);
  }

  dispose() {
    this.canvas.removeEventListener("pointerdown", this.handlePointer);
    this.onJump = null;
  }
}
