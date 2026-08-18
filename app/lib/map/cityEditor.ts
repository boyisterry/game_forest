import { cloneCityDocument, deepFreeze, parseCityMapDocument } from "./cityDocument.ts";
import type { CityMapDocument, CityMapDocumentSnapshot } from "./cityDocument.ts";

export const CityDirtyLayer = Object.freeze({
  Environment: 1 << 0,
  Roads: 1 << 1,
  Placements: 1 << 2,
  Collision: 1 << 3,
  Surface: 1 << 4,
  Signals: 1 << 5,
  Minimap: 1 << 6,
  Spawn: 1 << 7,
  All: (1 << 8) - 1,
} as const);

export type LayerMask = number;

export type DocumentDelta = Readonly<{
  name: string;
  dirty: LayerMask;
  apply(doc: CityMapDocumentSnapshot): CityMapDocument;
  revert(doc: CityMapDocumentSnapshot): CityMapDocument;
}>;

type HistoryCommand = Readonly<{
  name: string;
  dirty: LayerMask;
  apply(doc: CityMapDocumentSnapshot): CityMapDocument;
  revert(doc: CityMapDocumentSnapshot): CityMapDocument;
}>;

const HISTORY_LIMIT = 100;
const REVISION_DIRTY_LIMIT = 256;

function closeDirtyMask(mask: LayerMask): LayerMask {
  let result = mask & CityDirtyLayer.All;
  if ((result & CityDirtyLayer.Roads) !== 0) {
    result |= CityDirtyLayer.Collision
      | CityDirtyLayer.Surface
      | CityDirtyLayer.Signals
      | CityDirtyLayer.Minimap;
  }
  if ((result & CityDirtyLayer.Placements) !== 0) {
    result |= CityDirtyLayer.Collision | CityDirtyLayer.Surface | CityDirtyLayer.Minimap;
  }
  return result;
}

function sealDocument(document: CityMapDocument): CityMapDocumentSnapshot {
  return parseCityMapDocument(document).document;
}

export class CityEditorSession {
  private _document: CityMapDocumentSnapshot;
  private _revision = 0;
  private readonly listeners = new Set<() => void>();
  private readonly undoStack: HistoryCommand[] = [];
  private readonly redoStack: HistoryCommand[] = [];
  private readonly revisionDirty = new Map<number, LayerMask>();
  private snapshotCache: Readonly<{
    document: CityMapDocumentSnapshot;
    revision: number;
    lastDirty: LayerMask;
  }>;

  constructor(initial: CityMapDocumentSnapshot | CityMapDocument) {
    this._document = sealDocument(cloneCityDocument(initial as CityMapDocumentSnapshot));
    this.snapshotCache = Object.freeze({ document: this._document, revision: 0, lastDirty: CityDirtyLayer.All });
  }

  get document(): CityMapDocumentSnapshot {
    return this._document;
  }

  get revision(): number {
    return this._revision;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.snapshotCache;

  readonly getRenderUpdate = (sinceRevision: number | null): Readonly<{
    document: CityMapDocumentSnapshot;
    revision: number;
    dirty: LayerMask;
  }> => {
    if (sinceRevision === this._revision) {
      return Object.freeze({ document: this._document, revision: this._revision, dirty: 0 });
    }
    if (sinceRevision === null || sinceRevision < 0 || sinceRevision > this._revision) {
      return Object.freeze({ document: this._document, revision: this._revision, dirty: CityDirtyLayer.All });
    }
    let dirty = 0;
    for (let revision = sinceRevision + 1; revision <= this._revision; revision += 1) {
      const mask = this.revisionDirty.get(revision);
      if (mask === undefined) {
        dirty = CityDirtyLayer.All;
        break;
      }
      dirty |= mask;
    }
    return Object.freeze({ document: this._document, revision: this._revision, dirty });
  };

  apply(delta: DocumentDelta): void {
    const dirty = closeDirtyMask(delta.dirty);
    const next = sealDocument(delta.apply(this._document));
    const command: HistoryCommand = Object.freeze({ ...delta, dirty });
    this.undoStack.push(command);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.publish(next, dirty);
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    const next = sealDocument(command.revert(this._document));
    this.redoStack.push(command);
    this.publish(next, command.dirty);
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    const next = sealDocument(command.apply(this._document));
    this.undoStack.push(command);
    this.publish(next, command.dirty);
  }

  replace(next: CityMapDocument, name: "import" | "clear"): void {
    const before = this._document;
    const after = sealDocument(next);
    const command: HistoryCommand = Object.freeze({
      name,
      dirty: CityDirtyLayer.All,
      apply: () => cloneCityDocument(after),
      revert: () => cloneCityDocument(before),
    });
    this.undoStack.push(command);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.publish(after, CityDirtyLayer.All);
  }

  private publish(next: CityMapDocumentSnapshot, dirty: LayerMask) {
    this._document = next;
    this._revision += 1;
    this.revisionDirty.set(this._revision, dirty);
    while (this.revisionDirty.size > REVISION_DIRTY_LIMIT) {
      const oldest = this.revisionDirty.keys().next().value as number | undefined;
      if (oldest === undefined) break;
      this.revisionDirty.delete(oldest);
    }
    this.snapshotCache = deepFreeze({ document: this._document, revision: this._revision, lastDirty: dirty });
    for (const listener of this.listeners) listener();
  }
}
