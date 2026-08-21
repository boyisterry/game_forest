import {
  cloneCityDocument,
  deepFreeze,
  emptyCityDocument,
  parseCityMapDocument,
  type CityMapDocumentSnapshot,
} from "./cityDocument.ts";
import {
  CEDAR_CROSSING_CONTENT_VERSION,
  CEDAR_CROSSING_NAME_EN,
  createCedarCrossingDocument,
} from "./cedarCrossing.ts";
import { DEFAULT_SETTINGS, type MapSettings, type MapType, type Season } from "./types.ts";

export const MAP_LIBRARY_RECORD_VERSION = 1;
export const FOREST_DEFAULT_MAP_ID = "forest-default";
export const CEDAR_CROSSING_MAP_ID = "cedar-crossing";
/** Legacy built-in identity retained only so old local records can be parsed safely. */
export const RAIN_HARBOR_MAP_ID = "rain-harbor";
export const MAP_LIBRARY_NAME_MAX_LENGTH = 48;

export type MapEntryMode = "edit" | "play";
export type MapSaveStatus = "saved" | "saving" | "error";

export type MapLibraryRecord = Readonly<{
  recordVersion: 1;
  id: string;
  name: string;
  kind: MapType;
  builtin: boolean;
  /** Version of shipped builtin content; custom maps always use zero. */
  builtinContentVersion: number;
  createdAt: number;
  updatedAt: number;
  revision: number;
  settings: Readonly<MapSettings>;
  cityDocument?: CityMapDocumentSnapshot;
}>;

export type CreateCityMapOptions = Readonly<{
  id?: string;
  now?: number;
  settings?: Partial<Omit<MapSettings, "mapType">>;
}>;

export type MapLibraryRepositoryOptions = Readonly<{
  now?: () => number;
  createId?: () => string;
}>;

export type MapLibraryCompareAndPutResult =
  | Readonly<{ stored: true }>
  | Readonly<{ stored: false; current: unknown | null }>;

/** Low-level persistence port. Implementations must resolve writes in call order. */
export interface MapLibraryStore {
  list(): Promise<readonly unknown[]>;
  get(id: string): Promise<unknown | null>;
  put(record: MapLibraryRecord): Promise<void>;
  compareAndPut(
    record: MapLibraryRecord,
    expectedRevision: number,
    options?: Readonly<{ allowMissing?: boolean }>,
  ): Promise<MapLibraryCompareAndPutResult>;
  delete(id: string): Promise<boolean>;
  flush(): Promise<void>;
  close(): void;
}

export class MapLibraryConflictError extends Error {
  readonly id: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(id: string, expectedRevision: number, actualRevision: number) {
    super(`map ${id} changed: expected revision ${expectedRevision}, received ${actualRevision}`);
    this.name = "MapLibraryConflictError";
    this.id = id;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class MapLibraryRecordNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`map ${id} does not exist`);
    this.name = "MapLibraryRecordNotFoundError";
    this.id = id;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function onlyFields(record: Record<string, unknown>, fields: readonly string[], label: string) {
  const allowed = new Set(fields);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unknown field ${key}`);
  }
}

function finiteNumber(value: unknown, label: string, minimum?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  if (minimum !== undefined && value < minimum) throw new TypeError(`${label} must be at least ${minimum}`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string) {
  const parsed = finiteNumber(value, label, 0);
  if (!Number.isInteger(parsed)) throw new TypeError(`${label} must be an integer`);
  return parsed;
}

function positiveNumber(value: unknown, label: string) {
  const parsed = finiteNumber(value, label);
  if (parsed <= 0) throw new TypeError(`${label} must be greater than zero`);
  return parsed;
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function booleanValue(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be boolean`);
  return value;
}

function mapKind(value: unknown, label: string): MapType {
  if (value !== "forest" && value !== "city") throw new TypeError(`${label} must be forest or city`);
  return value;
}

function seasonValue(value: unknown, label: string): Season {
  if (value !== "spring" && value !== "summer" && value !== "autumn") {
    throw new TypeError(`${label} must be spring, summer, or autumn`);
  }
  return value;
}

export function normalizeMapLibraryName(value: string) {
  if (typeof value !== "string") throw new TypeError("map name must be a string");
  const normalized = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(normalized).length;
  if (length === 0) throw new TypeError("map name must not be empty");
  if (length > MAP_LIBRARY_NAME_MAX_LENGTH) {
    throw new TypeError(`map name must contain at most ${MAP_LIBRARY_NAME_MAX_LENGTH} characters`);
  }
  if (/\p{Cc}/u.test(normalized)) throw new TypeError("map name must not contain control characters");
  return normalized;
}

export function parseMapLibrarySettings(value: unknown): Readonly<MapSettings> {
  const settings = recordValue(value, "map record settings");
  onlyFields(settings, [
    "mapType",
    "seed",
    "forestDensity",
    "cityDensity",
    "roadWidth",
    "roadCurves",
    "fogDensity",
    "deliveryStops",
    "season",
    "treeLeafDensity",
    "treeCanopyWidth",
    "treeHeightScale",
    "shatterMode",
  ], "map record settings");
  const deliveryStops = positiveNumber(settings.deliveryStops, "map record settings.deliveryStops");
  if (!Number.isInteger(deliveryStops)) {
    throw new TypeError("map record settings.deliveryStops must be an integer");
  }
  return deepFreeze({
    mapType: mapKind(settings.mapType, "map record settings.mapType"),
    seed: finiteNumber(settings.seed, "map record settings.seed"),
    forestDensity: finiteNumber(settings.forestDensity, "map record settings.forestDensity", 0),
    cityDensity: finiteNumber(settings.cityDensity, "map record settings.cityDensity", 0),
    roadWidth: positiveNumber(settings.roadWidth, "map record settings.roadWidth"),
    roadCurves: finiteNumber(settings.roadCurves, "map record settings.roadCurves", 0),
    fogDensity: finiteNumber(settings.fogDensity, "map record settings.fogDensity", 0),
    deliveryStops,
    season: seasonValue(settings.season, "map record settings.season"),
    treeLeafDensity: positiveNumber(settings.treeLeafDensity, "map record settings.treeLeafDensity"),
    treeCanopyWidth: positiveNumber(settings.treeCanopyWidth, "map record settings.treeCanopyWidth"),
    treeHeightScale: positiveNumber(settings.treeHeightScale, "map record settings.treeHeightScale"),
    shatterMode: booleanValue(settings.shatterMode, "map record settings.shatterMode"),
  });
}

function mapId(value: unknown) {
  const id = stringValue(value, "map record id");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)) {
    throw new TypeError("map record id is invalid");
  }
  return id;
}

function builtinForId(id: string) {
  return id === FOREST_DEFAULT_MAP_ID
    || id === CEDAR_CROSSING_MAP_ID
    || id === RAIN_HARBOR_MAP_ID;
}

export function isBuiltinMapId(id: string) {
  return builtinForId(id);
}

export function parseMapLibraryRecord(value: unknown): MapLibraryRecord {
  const input = recordValue(value, "map record");
  onlyFields(input, [
    "recordVersion",
    "id",
    "name",
    "kind",
    "builtin",
    "builtinContentVersion",
    "createdAt",
    "updatedAt",
    "revision",
    "settings",
    "cityDocument",
  ], "map record");
  if (input.recordVersion !== MAP_LIBRARY_RECORD_VERSION) {
    throw new TypeError("unsupported map record version");
  }
  const id = mapId(input.id);
  const kind = mapKind(input.kind, "map record kind");
  const builtin = booleanValue(input.builtin, "map record builtin");
  const reserved = builtinForId(id);
  if (builtin !== reserved) {
    throw new TypeError(reserved ? `reserved map ${id} must be builtin` : "custom maps cannot be builtin");
  }
  const builtinContentVersion = input.builtinContentVersion === undefined
    ? 0
    : nonNegativeInteger(input.builtinContentVersion, "map record builtinContentVersion");
  if (!builtin && builtinContentVersion !== 0) {
    throw new TypeError("custom maps must use builtinContentVersion zero");
  }
  if (id === FOREST_DEFAULT_MAP_ID && kind !== "forest") {
    throw new TypeError("forest-default must be a forest map");
  }
  if ((id === CEDAR_CROSSING_MAP_ID || id === RAIN_HARBOR_MAP_ID) && kind !== "city") {
    throw new TypeError(`${id} must be a city map`);
  }

  const settings = parseMapLibrarySettings(input.settings);
  if (settings.mapType !== kind) throw new TypeError("map record kind must match settings.mapType");
  const createdAt = nonNegativeInteger(input.createdAt, "map record createdAt");
  const updatedAt = nonNegativeInteger(input.updatedAt, "map record updatedAt");
  if (updatedAt < createdAt) throw new TypeError("map record updatedAt must not precede createdAt");

  let cityDocument: CityMapDocumentSnapshot | undefined;
  if (kind === "city") {
    if (input.cityDocument === undefined) throw new TypeError("city map records require cityDocument");
    cityDocument = parseCityMapDocument(input.cityDocument).document;
  } else if (input.cityDocument !== undefined) {
    throw new TypeError("forest map records must not contain cityDocument");
  }

  return deepFreeze({
    recordVersion: MAP_LIBRARY_RECORD_VERSION,
    id,
    name: normalizeMapLibraryName(stringValue(input.name, "map record name")),
    kind,
    builtin,
    builtinContentVersion,
    createdAt,
    updatedAt,
    revision: nonNegativeInteger(input.revision, "map record revision"),
    settings,
    ...(cityDocument ? { cityDocument } : {}),
  });
}

export const DEFAULT_CITY_MAP_SETTINGS: Readonly<MapSettings> = parseMapLibrarySettings({
  ...DEFAULT_SETTINGS,
  mapType: "city",
  roadWidth: 8,
  deliveryStops: Math.max(6, DEFAULT_SETTINGS.deliveryStops),
  fogDensity: Math.min(DEFAULT_SETTINGS.fogDensity, 0.0024),
});

let cachedDefaults: readonly MapLibraryRecord[] | null = null;

export function createDefaultMapLibraryRecords(now = 0): readonly MapLibraryRecord[] {
  if (now === 0 && cachedDefaults) return cachedDefaults;
  const timestamp = nonNegativeInteger(now, "default map timestamp");
  const records = Object.freeze([
    parseMapLibraryRecord({
      recordVersion: MAP_LIBRARY_RECORD_VERSION,
      id: FOREST_DEFAULT_MAP_ID,
      name: "Deep Forest",
      kind: "forest",
      builtin: true,
      builtinContentVersion: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 0,
      settings: { ...DEFAULT_SETTINGS },
    }),
    parseMapLibraryRecord({
      recordVersion: MAP_LIBRARY_RECORD_VERSION,
      id: CEDAR_CROSSING_MAP_ID,
      name: CEDAR_CROSSING_NAME_EN,
      kind: "city",
      builtin: true,
      builtinContentVersion: CEDAR_CROSSING_CONTENT_VERSION,
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 0,
      settings: { ...DEFAULT_CITY_MAP_SETTINGS },
      cityDocument: cloneCityDocument(createCedarCrossingDocument()),
    }),
  ]);
  if (now === 0) cachedDefaults = records;
  return records;
}

export function createCustomCityMapId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `city-${uuid}`;
  return `city-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function createCityMapRecord(name: string, options?: CreateCityMapOptions): MapLibraryRecord;
export function createCityMapRecord(options: CreateCityMapOptions & Readonly<{ name: string }>): MapLibraryRecord;
export function createCityMapRecord(
  nameOrOptions: string | (CreateCityMapOptions & Readonly<{ name: string }>),
  maybeOptions: CreateCityMapOptions = {},
): MapLibraryRecord {
  const name = typeof nameOrOptions === "string" ? nameOrOptions : nameOrOptions.name;
  const options = typeof nameOrOptions === "string" ? maybeOptions : nameOrOptions;
  const now = nonNegativeInteger(options.now ?? Date.now(), "map timestamp");
  const id = mapId(options.id ?? createCustomCityMapId());
  if (builtinForId(id)) throw new TypeError(`${id} is reserved for a builtin map`);
  const settings = parseMapLibrarySettings({
    ...DEFAULT_CITY_MAP_SETTINGS,
    ...options.settings,
    mapType: "city",
  });
  return parseMapLibraryRecord({
    recordVersion: MAP_LIBRARY_RECORD_VERSION,
    id,
    name,
    kind: "city",
    builtin: false,
    builtinContentVersion: 0,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    settings,
    cityDocument: cloneCityDocument(emptyCityDocument()),
  });
}

export function cloneMapLibraryRecord(record: MapLibraryRecord): MapLibraryRecord {
  return parseMapLibraryRecord(structuredClone(record));
}

function compareRecords(left: MapLibraryRecord, right: MapLibraryRecord) {
  if (left.id === FOREST_DEFAULT_MAP_ID) return right.id === FOREST_DEFAULT_MAP_ID ? 0 : -1;
  if (right.id === FOREST_DEFAULT_MAP_ID) return 1;
  if (left.id === CEDAR_CROSSING_MAP_ID) return right.id === CEDAR_CROSSING_MAP_ID ? 0 : -1;
  if (right.id === CEDAR_CROSSING_MAP_ID) return 1;
  return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

/**
 * Versioned map repository. Reads wait for queued writes, and saves use an
 * optimistic revision check so a stale async autosave can never overwrite a
 * newer document.
 */
export class MapLibraryRepository {
  private writeTail: Promise<void> = Promise.resolve();
  private readonly store: MapLibraryStore;
  private readonly defaults: ReadonlyMap<string, MapLibraryRecord>;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(
    store: MapLibraryStore,
    options: MapLibraryRepositoryOptions = {},
  ) {
    this.store = store;
    this.defaults = new Map(createDefaultMapLibraryRecords().map((record) => [record.id, record]));
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? createCustomCityMapId;
  }

  async list(): Promise<readonly MapLibraryRecord[]> {
    await this.writeTail;
    const records = new Map(this.defaults);
    for (const raw of await this.store.list()) {
      const record = this.resolveBuiltinContent(parseMapLibraryRecord(raw));
      // Rain Harbor used an older generated/legacy-massing document. Keep the
      // durable value untouched for recovery, but never let it replace or sit
      // beside the editor-native Cedar Crossing built-in.
      if (record.id === RAIN_HARBOR_MAP_ID) continue;
      records.set(record.id, record);
    }
    return Object.freeze([...records.values()].sort(compareRecords));
  }

  async get(id: string): Promise<MapLibraryRecord | null> {
    const validId = mapId(id);
    if (validId === RAIN_HARBOR_MAP_ID) return null;
    await this.writeTail;
    const stored = await this.store.get(validId);
    if (stored !== null) return this.resolveBuiltinContent(parseMapLibraryRecord(stored));
    return this.defaults.get(validId) ?? null;
  }

  createCity(name: string, options: Omit<CreateCityMapOptions, "now"> = {}): Promise<MapLibraryRecord> {
    return this.enqueueWrite(async () => {
      const record = createCityMapRecord(name, {
        ...options,
        id: options.id ?? this.createId(),
        now: this.timestamp(),
      });
      if (await this.store.get(record.id) !== null || this.defaults.has(record.id)) {
        throw new TypeError(`map ${record.id} already exists`);
      }
      await this.store.put(record);
      return record;
    });
  }

  save(record: MapLibraryRecord, expectedRevision = record.revision): Promise<MapLibraryRecord> {
    const draft = parseMapLibraryRecord(record);
    const expected = nonNegativeInteger(expectedRevision, "expectedRevision");
    return this.enqueueWrite(async () => {
      const raw = await this.store.get(draft.id);
      const current = raw === null
        ? this.defaults.get(draft.id) ?? null
        : this.resolveBuiltinContent(parseMapLibraryRecord(raw));
      if (!current) throw new MapLibraryRecordNotFoundError(draft.id);
      if (current.revision !== expected) {
        throw new MapLibraryConflictError(draft.id, expected, current.revision);
      }
      if (draft.kind !== current.kind
        || draft.builtin !== current.builtin
        || draft.builtinContentVersion !== current.builtinContentVersion
        || draft.createdAt !== current.createdAt) {
        throw new TypeError("map identity fields cannot change during save");
      }
      const next = parseMapLibraryRecord({
        ...draft,
        createdAt: current.createdAt,
        updatedAt: Math.max(this.timestamp(), current.updatedAt + 1),
        revision: current.revision + 1,
      });
      const result = await this.store.compareAndPut(next, expected, {
        // Unsaved builtins are virtual revision-zero records. Their first save
        // atomically creates the durable override; custom records must exist.
        allowMissing: this.defaults.get(draft.id)?.revision === expected,
      });
      if (!result.stored) {
        if (result.current === null) throw new MapLibraryRecordNotFoundError(draft.id);
        const raced = parseMapLibraryRecord(result.current);
        throw new MapLibraryConflictError(draft.id, expected, raced.revision);
      }
      return next;
    });
  }

  delete(id: string): Promise<boolean> {
    const validId = mapId(id);
    if (builtinForId(validId)) return Promise.resolve(false);
    return this.enqueueWrite(() => this.store.delete(validId));
  }

  async flush(): Promise<void> {
    await this.writeTail;
    await this.store.flush();
  }

  close(): void {
    void this.flush().finally(() => this.store.close());
  }

  private timestamp() {
    return nonNegativeInteger(this.now(), "map timestamp");
  }

  private resolveBuiltinContent(record: MapLibraryRecord) {
    const shipped = this.defaults.get(record.id);
    if (!shipped?.builtin || record.builtinContentVersion >= shipped.builtinContentVersion) return record;
    // Keep the durable CAS identity while replacing only the obsolete shipped
    // template. The next real edit stores the upgraded content atomically.
    return parseMapLibraryRecord({
      ...shipped,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      revision: record.revision,
    });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeTail.then(operation, operation);
    this.writeTail = result.then(() => undefined, () => undefined);
    return result;
  }
}
