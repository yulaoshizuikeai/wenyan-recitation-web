import { openDB, DBSchema, IDBPDatabase } from "idb";
import { CardFsrsState, ReviewLog } from "../domain/fsrs/fsrsTypes";
import { getLocalDateString } from "../utils/date";

export interface DailyRecord {
  date: string; // 'YYYY-MM-DD'
  count: number;
  newLearned: number;
  snowballCount?: number;
}

interface WenYanDB extends DBSchema {
  cards: {
    key: string;
    value: CardFsrsState;
    indexes: { "by-due": number; "by-state": number };
  };
  logs: {
    key: string;
    value: ReviewLog;
    indexes: { "by-cardId": string; "by-reviewTime": number };
  };
  daily_records: {
    key: string; // 'YYYY-MM-DD'
    value: DailyRecord;
  };
  bottlenecks: {
    key: string; // articleId
    value: { articleId: string; indices: number[] };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = "wenyan_recitation_db";
const DB_VERSION = 1;

export const LEGACY_STORAGE_KEYS = {
  LAST_SESSION: "wenyan_last_session",
  CRAM_RATINGS: "wenyan_cram_ratings",
  EXPANDED_DECKS: "wenyan_anki_expanded_decks",
  SNOWBALL_STAGE_PREFIX: "snowball_stage_"
} as const;

export const UNIFIED_SETTINGS_KEYS = {
  LAST_SESSION: "last_session",
  CRAM_RATINGS: "cram_ratings",
  EXPANDED_DECKS: "expanded_decks",
  SNOWBALL_STAGES: "snowball_stages",
  SCENARIO_WRONG_ITEMS: "scenario_wrong_items",
  LOCAL_MIGRATED_V1: "local_storage_migrated_v1"
} as const;

export type DbMutationEvent =
  | { type: "card"; card: CardFsrsState }
  | { type: "cards"; cards: CardFsrsState[] }
  | { type: "daily_record"; record: DailyRecord }
  | { type: "bottlenecks"; articleId: string; indices: number[] }
  | { type: "setting"; key: string; value: unknown }
  | { type: "import" }
  | { type: "reset" };

type DbMutationListener = (event: DbMutationEvent) => void;
const dbMutationListeners = new Set<DbMutationListener>();

export function subscribeDbMutations(listener: DbMutationListener): () => void {
  dbMutationListeners.add(listener);
  return () => {
    dbMutationListeners.delete(listener);
  };
}

function emitDbMutation(event: DbMutationEvent): void {
  for (const listener of dbMutationListeners) {
    try {
      listener(event);
    } catch {
      // Isolate subscriber errors from DB persistence
    }
  }
}

export function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (
        typeof window.localStorage.getItem === "function" &&
        typeof window.localStorage.setItem === "function" &&
        typeof window.localStorage.removeItem === "function"
      ) {
        return window.localStorage;
      }
    }
    if (typeof globalThis !== "undefined") {
      const candidate = (globalThis as { localStorage?: Storage }).localStorage;
      if (
        candidate &&
        typeof candidate.getItem === "function" &&
        typeof candidate.setItem === "function" &&
        typeof candidate.removeItem === "function"
      ) {
        return candidate;
      }
    }
  } catch {
    // Ignore storage access errors (e.g., restricted context)
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

let dbPromise: Promise<IDBPDatabase<WenYanDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<WenYanDB>> {
  if (!dbPromise) {
    const promise = openDB<WenYanDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cards")) {
          const cardStore = db.createObjectStore("cards", { keyPath: "cardId" });
          cardStore.createIndex("by-due", "dueTime");
          cardStore.createIndex("by-state", "state");
        }
        if (!db.objectStoreNames.contains("logs")) {
          const logStore = db.createObjectStore("logs", { keyPath: "id" });
          logStore.createIndex("by-cardId", "cardId");
          logStore.createIndex("by-reviewTime", "reviewTime");
        }
        if (!db.objectStoreNames.contains("daily_records")) {
          db.createObjectStore("daily_records", { keyPath: "date" });
        }
        if (!db.objectStoreNames.contains("bottlenecks")) {
          db.createObjectStore("bottlenecks", { keyPath: "articleId" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
      },
      blocking(_currentVersion, _blockedVersion, event) {
        const targetDb = event?.target as IDBDatabase | null;
        if (targetDb && typeof targetDb.close === "function") {
          targetDb.close();
        }
        if (dbPromise === promise) {
          dbPromise = null;
        }
        void promise
          .then((db) => {
            if (typeof db?.close === "function") {
              db.close();
            }
          })
          .catch(() => {});
      },
      terminated() {
        if (dbPromise === promise) {
          dbPromise = null;
        }
      }
    }).catch((err) => {
      if (dbPromise === promise) {
        dbPromise = null;
      }
      throw err;
    });
    dbPromise = promise;
  }
  return dbPromise;
}

export async function getCardState(cardId: string): Promise<CardFsrsState | undefined> {
  const db = await getDB();
  return db.get("cards", cardId);
}

export async function getAllCardStates(): Promise<CardFsrsState[]> {
  const db = await getDB();
  return db.getAll("cards");
}

export async function saveCardState(card: CardFsrsState): Promise<void> {
  const db = await getDB();
  await db.put("cards", card);
  emitDbMutation({ type: "card", card });
}

export async function saveCardStatesBatch(cards: CardFsrsState[]): Promise<void> {
  if (cards.length === 0) return;
  const db = await getDB();
  const tx = db.transaction("cards", "readwrite");
  for (const c of cards) {
    await tx.store.put(c);
  }
  await tx.done;
  emitDbMutation({ type: "cards", cards });
}

export async function recordReviewLog(
  log: ReviewLog,
  options?: { updateDailyRecord?: boolean }
): Promise<void> {
  const db = await getDB();
  const id = log.id || `${log.cardId}_${log.reviewTime}_${Math.random().toString(36).slice(2, 6)}`;
  const logEntry: ReviewLog = { ...log, id };

  // Quota-isolated logs (e.g. snowball completion) or disabled daily updates only write to logs.
  if (options?.updateDailyRecord === false || log.quotaIsolated || log.source === "snowball") {
    await db.put("logs", logEntry);
    return;
  }

  // Update logs and today's daily record atomically in a single readwrite transaction
  const todayStr = getLocalDateString();
  const tx = db.transaction(["logs", "daily_records"], "readwrite");
  await tx.objectStore("logs").put(logEntry);
  const recordStore = tx.objectStore("daily_records");
  const existing = (await recordStore.get(todayStr)) || { date: todayStr, count: 0, newLearned: 0 };
  existing.count += 1;
  if (log.previousState === 0) {
    existing.newLearned += 1;
  }
  await recordStore.put(existing);
  await tx.done;
  emitDbMutation({ type: "daily_record", record: existing });
}

/**
 * Persist snowball completion review logs in a single transaction while isolating
 * flashcard daily new/review quotas (never increments newLearned, and records at most
 * 1 session activity count for the heatmap/streak instead of per-card counts).
 */
export async function recordSnowballCompletionLogs(
  logs: ReviewLog[],
  recordDailyActivity = true
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["logs", "daily_records"], "readwrite");
  const logStore = tx.objectStore("logs");

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const id = `${log.cardId}_${log.reviewTime}_${i}_${Math.random().toString(36).slice(2, 6)}`;
    await logStore.put({
      ...log,
      id,
      source: log.source ?? "snowball",
      quotaIsolated: log.quotaIsolated ?? true
    });
  }

  let updatedRecord: DailyRecord | null = null;
  if (recordDailyActivity) {
    const todayStr = getLocalDateString();
    const recordStore = tx.objectStore("daily_records");
    const existing = (await recordStore.get(todayStr)) || { date: todayStr, count: 0, newLearned: 0 };
    existing.count += 1;
    existing.snowballCount = (existing.snowballCount ?? 0) + 1;
    await recordStore.put(existing);
    updatedRecord = existing;
  }

  await tx.done;
  if (updatedRecord) {
    emitDbMutation({ type: "daily_record", record: updatedRecord });
  }
}

export async function getDailyRecords(): Promise<DailyRecord[]> {
  const db = await getDB();
  return db.getAll("daily_records");
}

export async function saveDailyRecord(record: DailyRecord): Promise<void> {
  const db = await getDB();
  await db.put("daily_records", record);
  emitDbMutation({ type: "daily_record", record });
}

export async function incrementDailyRecord(
  date = getLocalDateString(),
  deltas: { countDelta?: number; newLearnedDelta?: number; snowballCountDelta?: number } = {}
): Promise<DailyRecord> {
  const db = await getDB();
  const tx = db.transaction("daily_records", "readwrite");
  const store = tx.store;
  const existing = (await store.get(date)) || { date, count: 0, newLearned: 0 };
  const snowballDelta = deltas.snowballCountDelta ?? 0;
  const updated: DailyRecord = {
    date,
    count: Math.max(0, existing.count + (deltas.countDelta ?? 1)),
    newLearned: Math.max(0, existing.newLearned + (deltas.newLearnedDelta ?? 0)),
    ...(existing.snowballCount !== undefined || snowballDelta > 0
      ? { snowballCount: Math.max(0, (existing.snowballCount ?? 0) + snowballDelta) }
      : {})
  };
  await store.put(updated);
  await tx.done;
  emitDbMutation({ type: "daily_record", record: updated });
  return updated;
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await getDB();
  const val = await db.get("settings", key);
  return val !== undefined ? val : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put("settings", value, key);
  emitDbMutation({ type: "setting", key, value });
}

export async function getBottlenecks(articleId: string): Promise<number[]> {
  const db = await getDB();
  const res = await db.get("bottlenecks", articleId);
  return res ? res.indices : [];
}

export async function saveBottlenecks(articleId: string, indices: number[]): Promise<void> {
  const db = await getDB();
  const clean = [...indices];
  await db.put("bottlenecks", { articleId, indices: clean });
  emitDbMutation({ type: "bottlenecks", articleId, indices: clean });
}

export async function getAllBottlenecks(): Promise<Record<string, number[]>> {
  const db = await getDB();
  const rows = await db.getAll("bottlenecks");
  const result: Record<string, number[]> = {};
  for (const row of rows) {
    if (row && typeof row.articleId === "string" && Array.isArray(row.indices)) {
      result[row.articleId] = [...row.indices];
    }
  }
  return result;
}

export async function getAllLogs(): Promise<ReviewLog[]> {
  const db = await getDB();
  return db.getAll("logs");
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const db = await getDB();
  const tx = db.transaction("settings", "readonly");
  const result: Record<string, unknown> = {};
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (typeof cursor.key === "string") {
      result[cursor.key] = cursor.value;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  return result;
}

export interface LocalPreferencesBackup {
  cramRatings?: Record<string, string>;
  snowballStages?: Record<string, number>;
  expandedDecks?: string[];
  lastSession?: unknown;
}

export interface BackupDataV1 {
  version?: string | number;
  exportTime?: string;
  cards: CardFsrsState[];
  records: DailyRecord[];
}

export interface BackupDataV2 {
  version: 2 | "2";
  exportTime: string;
  cards: CardFsrsState[];
  records: DailyRecord[];
  logs: ReviewLog[];
  bottlenecks: Record<string, number[]>;
  settings: Record<string, unknown>;
  localPreferences: LocalPreferencesBackup;
}

export type BackupData = BackupDataV1 | BackupDataV2;

export interface ImportProgressResult {
  version: 1 | 2;
  cardsImported: number;
  recordsImported: number;
  logsImported: number;
  bottlenecksImported: number;
  settingsImported: number;
  preferencesRestored: number;
}

function parseJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function collectLocalPreferences(settings: Record<string, unknown>): LocalPreferencesBackup {
  const storage = getSafeLocalStorage();
  const prefs: LocalPreferencesBackup = {};

  // 1. cramRatings
  const settingsCram = settings[UNIFIED_SETTINGS_KEYS.CRAM_RATINGS];
  if (isPlainObject(settingsCram)) {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(settingsCram)) {
      if (typeof v === "string") cleaned[k] = v;
    }
    prefs.cramRatings = cleaned;
  } else if (storage) {
    const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.CRAM_RATINGS));
    if (isPlainObject(parsed)) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") cleaned[k] = v;
      }
      prefs.cramRatings = cleaned;
    }
  }

  // 2. snowballStages (merge settings with live localStorage entries written by SnowballView)
  const mergedStages: Record<string, number> = {};
  const settingsStages = settings[UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES];
  if (isPlainObject(settingsStages)) {
    for (const [artId, stage] of Object.entries(settingsStages)) {
      if (typeof stage === "number" && Number.isFinite(stage) && stage >= 0) {
        mergedStages[artId] = stage;
      }
    }
  }
  if (storage) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX)) {
        const artId = key.slice(LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX.length);
        const val = Number.parseInt(storage.getItem(key) || "", 10);
        if (artId && Number.isFinite(val) && val >= 0) {
          mergedStages[artId] = val;
        }
      }
    }
  }
  if (Object.keys(mergedStages).length > 0) {
    prefs.snowballStages = mergedStages;
  }

  // 3. expandedDecks
  const settingsExpanded = settings[UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS];
  if (Array.isArray(settingsExpanded)) {
    prefs.expandedDecks = settingsExpanded.filter((id): id is string => typeof id === "string");
  } else if (storage) {
    const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.EXPANDED_DECKS));
    if (Array.isArray(parsed)) {
      prefs.expandedDecks = parsed.filter((id): id is string => typeof id === "string");
    }
  }

  // 4. lastSession
  if (settings[UNIFIED_SETTINGS_KEYS.LAST_SESSION] !== undefined) {
    prefs.lastSession = settings[UNIFIED_SETTINGS_KEYS.LAST_SESSION];
  } else if (storage) {
    const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.LAST_SESSION));
    if (isPlainObject(parsed)) {
      prefs.lastSession = parsed;
    }
  }

  return prefs;
}

function dispatchSessionUpdated(detail: unknown): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent("wenyan_session_updated", { detail }));
    } catch {
      // Ignore in restricted environments
    }
  }
}

function mirrorPreferencesToLocalStorage(
  prefs: LocalPreferencesBackup,
  isFullRestore = false
): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;

  if (prefs.cramRatings) {
    storage.setItem(LEGACY_STORAGE_KEYS.CRAM_RATINGS, JSON.stringify(prefs.cramRatings));
  }
  if (prefs.snowballStages) {
    const staleStageKeys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX)) {
        const artId = key.slice(LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX.length);
        if (!Object.prototype.hasOwnProperty.call(prefs.snowballStages, artId)) {
          staleStageKeys.push(key);
        }
      }
    }
    for (const key of staleStageKeys) {
      storage.removeItem(key);
    }
    for (const [artId, stage] of Object.entries(prefs.snowballStages)) {
      if (typeof stage === "number" && Number.isFinite(stage) && stage > 0) {
        storage.setItem(`${LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX}${artId}`, String(stage));
      } else {
        storage.removeItem(`${LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX}${artId}`);
      }
    }
  }
  if (prefs.expandedDecks) {
    storage.setItem(LEGACY_STORAGE_KEYS.EXPANDED_DECKS, JSON.stringify(prefs.expandedDecks));
  }
  if (isPlainObject(prefs.lastSession)) {
    storage.setItem(LEGACY_STORAGE_KEYS.LAST_SESSION, JSON.stringify(prefs.lastSession));
    dispatchSessionUpdated(prefs.lastSession);
  } else if (prefs.lastSession === null || (prefs.lastSession === undefined && isFullRestore)) {
    storage.removeItem(LEGACY_STORAGE_KEYS.LAST_SESSION);
    dispatchSessionUpdated(null);
  }
}

export async function exportAllProgress(): Promise<BackupDataV2> {
  const [cards, records, logs, bottlenecks, settings] = await Promise.all([
    getAllCardStates(),
    getDailyRecords(),
    getAllLogs(),
    getAllBottlenecks(),
    getAllSettings()
  ]);

  const localPreferences = collectLocalPreferences(settings);

  return {
    version: 2,
    exportTime: new Date().toISOString(),
    cards,
    records,
    logs,
    bottlenecks,
    settings,
    localPreferences
  };
}

function detectBackupVersion(data: Record<string, unknown>): 1 | 2 {
  const v = data.version;
  if (v === undefined || v === null || v === "") {
    return 1;
  }
  if (v === 1 || v === "1" || v === "1.0" || v === "1.0.0") {
    return 1;
  }
  if (v === 2 || v === "2" || v === "2.0" || v === "2.0.0") {
    return 2;
  }
  throw new Error(`不支持的备份版本：${String(v)}`);
}

export async function importAllProgress(
  data: BackupData
): Promise<ImportProgressResult> {
  if (!isPlainObject(data) || !Array.isArray(data.cards) || !Array.isArray(data.records)) {
    throw new Error("无效的备份文件格式：缺少 cards 或 records 数组");
  }

  const rawObj = data as unknown as Record<string, unknown>;
  const version = detectBackupVersion(rawObj);

  if (version === 2) {
    if (rawObj.logs !== undefined && !Array.isArray(rawObj.logs)) {
      throw new Error("无效的备份文件格式：logs 必须为数组");
    }
    if (rawObj.bottlenecks !== undefined && !isPlainObject(rawObj.bottlenecks)) {
      throw new Error("无效的备份文件格式：bottlenecks 必须为对象");
    }
    if (rawObj.settings !== undefined && !isPlainObject(rawObj.settings)) {
      throw new Error("无效的备份文件格式：settings 必须为对象");
    }
    if (rawObj.localPreferences !== undefined && !isPlainObject(rawObj.localPreferences)) {
      throw new Error("无效的备份文件格式：localPreferences 必须为对象");
    }
  }

  const db = await getDB();

  if (version === 1) {
    const tx = db.transaction(["cards", "daily_records"], "readwrite");
    const cardStore = tx.objectStore("cards");
    const recordStore = tx.objectStore("daily_records");

    let cardsImported = 0;
    for (const card of data.cards) {
      if (card && typeof card.cardId === "string") {
        await cardStore.put(card);
        cardsImported += 1;
      }
    }

    let recordsImported = 0;
    for (const rec of data.records) {
      if (rec && typeof rec.date === "string" && typeof rec.count === "number") {
        await recordStore.put({
          date: rec.date,
          count: rec.count,
          newLearned: typeof rec.newLearned === "number" ? rec.newLearned : 0,
          ...(typeof rec.snowballCount === "number" ? { snowballCount: rec.snowballCount } : {})
        });
        recordsImported += 1;
      }
    }

    await tx.done;
    emitDbMutation({ type: "import" });
    return {
      version: 1,
      cardsImported,
      recordsImported,
      logsImported: 0,
      bottlenecksImported: 0,
      settingsImported: 0,
      preferencesRestored: 0
    };
  }

  // Version 2 transactional restore across all 5 stores
  const v2 = data as Partial<BackupDataV2>;
  const isFullV2Restore =
    Array.isArray(v2.logs) ||
    isPlainObject(v2.bottlenecks) ||
    isPlainObject(v2.settings) ||
    isPlainObject(v2.localPreferences);

  const tx = db.transaction(["cards", "daily_records", "logs", "bottlenecks", "settings"], "readwrite");
  const cardStore = tx.objectStore("cards");
  const recordStore = tx.objectStore("daily_records");
  const logStore = tx.objectStore("logs");
  const bottleneckStore = tx.objectStore("bottlenecks");
  const settingStore = tx.objectStore("settings");

  // Full v2 restore replaces existing data cleanly so stale/ghost records do not survive
  if (isFullV2Restore) {
    await cardStore.clear();
    await recordStore.clear();
    if (Array.isArray(v2.logs)) {
      await logStore.clear();
    }
    if (isPlainObject(v2.bottlenecks)) {
      await bottleneckStore.clear();
    }
    if (isPlainObject(v2.settings)) {
      await settingStore.clear();
    }
  }

  let cardsImported = 0;
  for (const card of data.cards) {
    if (card && typeof card.cardId === "string") {
      await cardStore.put(card);
      cardsImported += 1;
    }
  }

  let recordsImported = 0;
  for (const rec of data.records) {
    if (rec && typeof rec.date === "string" && typeof rec.count === "number") {
      await recordStore.put({
        date: rec.date,
        count: rec.count,
        newLearned: typeof rec.newLearned === "number" ? rec.newLearned : 0,
        ...(typeof rec.snowballCount === "number" ? { snowballCount: rec.snowballCount } : {})
      });
      recordsImported += 1;
    }
  }

  let logsImported = 0;
  if (Array.isArray(v2.logs)) {
    for (let i = 0; i < v2.logs.length; i++) {
      const log = v2.logs[i];
      if (log && typeof log.cardId === "string" && typeof log.reviewTime === "number") {
        const id =
          typeof log.id === "string" && log.id.length > 0
            ? log.id
            : `${log.cardId}_${log.reviewTime}_${i}`;
        await logStore.put({ ...log, id });
        logsImported += 1;
      }
    }
  }

  let bottlenecksImported = 0;
  if (isPlainObject(v2.bottlenecks)) {
    for (const [articleId, rawIndices] of Object.entries(v2.bottlenecks)) {
      if (typeof articleId === "string" && articleId.length > 0 && Array.isArray(rawIndices)) {
        const indices = rawIndices.filter(
          (n): n is number => typeof n === "number" && Number.isFinite(n)
        );
        await bottleneckStore.put({ articleId, indices });
        bottlenecksImported += 1;
      }
    }
  }

  let settingsImported = 0;
  const restoredSettings: Record<string, unknown> = {};
  if (isPlainObject(v2.settings)) {
    for (const [key, value] of Object.entries(v2.settings)) {
      if (typeof key === "string" && key.length > 0) {
        await settingStore.put(value, key);
        restoredSettings[key] = value;
        settingsImported += 1;
      }
    }
  }

  let preferencesRestored = 0;
  const prefsToMirror: LocalPreferencesBackup = {};

  // Build normalized preferences from localPreferences (explicit) or fallback from restoredSettings
  const rawPrefs = isPlainObject(v2.localPreferences) ? v2.localPreferences : {};

  if (isPlainObject(rawPrefs.cramRatings)) {
    const cleanRatings: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawPrefs.cramRatings)) {
      if (typeof v === "string") cleanRatings[k] = v;
    }
    await settingStore.put(cleanRatings, UNIFIED_SETTINGS_KEYS.CRAM_RATINGS);
    prefsToMirror.cramRatings = cleanRatings;
    preferencesRestored += 1;
  } else if (isPlainObject(restoredSettings[UNIFIED_SETTINGS_KEYS.CRAM_RATINGS])) {
    const cleanRatings: Record<string, string> = {};
    for (const [k, v] of Object.entries(
      restoredSettings[UNIFIED_SETTINGS_KEYS.CRAM_RATINGS] as Record<string, unknown>
    )) {
      if (typeof v === "string") cleanRatings[k] = v;
    }
    prefsToMirror.cramRatings = cleanRatings;
  }

  if (isPlainObject(rawPrefs.snowballStages)) {
    const cleanStages: Record<string, number> = {};
    for (const [artId, stage] of Object.entries(rawPrefs.snowballStages)) {
      if (typeof stage === "number" && Number.isFinite(stage) && stage >= 0) {
        cleanStages[artId] = stage;
      }
    }
    await settingStore.put(cleanStages, UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES);
    prefsToMirror.snowballStages = cleanStages;
    preferencesRestored += 1;
  } else if (isPlainObject(restoredSettings[UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES])) {
    const cleanStages: Record<string, number> = {};
    for (const [artId, stage] of Object.entries(
      restoredSettings[UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES] as Record<string, unknown>
    )) {
      if (typeof stage === "number" && Number.isFinite(stage) && stage >= 0) {
        cleanStages[artId] = stage;
      }
    }
    prefsToMirror.snowballStages = cleanStages;
  }

  if (Array.isArray(rawPrefs.expandedDecks)) {
    const cleanDecks = rawPrefs.expandedDecks.filter((id): id is string => typeof id === "string");
    await settingStore.put(cleanDecks, UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS);
    prefsToMirror.expandedDecks = cleanDecks;
    preferencesRestored += 1;
  } else if (Array.isArray(restoredSettings[UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS])) {
    prefsToMirror.expandedDecks = (
      restoredSettings[UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS] as unknown[]
    ).filter((id): id is string => typeof id === "string");
  }

  if (rawPrefs.lastSession !== undefined) {
    await settingStore.put(rawPrefs.lastSession, UNIFIED_SETTINGS_KEYS.LAST_SESSION);
    prefsToMirror.lastSession = rawPrefs.lastSession;
    preferencesRestored += 1;
  } else if (restoredSettings[UNIFIED_SETTINGS_KEYS.LAST_SESSION] !== undefined) {
    prefsToMirror.lastSession = restoredSettings[UNIFIED_SETTINGS_KEYS.LAST_SESSION];
  }

  await tx.done;

  const isFullRestore = isPlainObject(v2.localPreferences) || isPlainObject(v2.settings);
  mirrorPreferencesToLocalStorage(prefsToMirror, isFullRestore);
  emitDbMutation({ type: "import" });

  return {
    version: 2,
    cardsImported,
    recordsImported,
    logsImported,
    bottlenecksImported,
    settingsImported,
    preferencesRestored
  };
}

export async function resetAllProgress(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["cards", "logs", "daily_records", "bottlenecks", "settings"], "readwrite");
  await tx.objectStore("cards").clear();
  await tx.objectStore("logs").clear();
  await tx.objectStore("daily_records").clear();
  await tx.objectStore("bottlenecks").clear();
  await tx.objectStore("settings").clear();
  await tx.done;

  const storage = getSafeLocalStorage();
  if (storage) {
    storage.removeItem(LEGACY_STORAGE_KEYS.LAST_SESSION);
    storage.removeItem(LEGACY_STORAGE_KEYS.CRAM_RATINGS);
    storage.removeItem(LEGACY_STORAGE_KEYS.EXPANDED_DECKS);
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      try {
        window.dispatchEvent(new CustomEvent("wenyan_session_updated", { detail: null }));
      } catch {
        // Ignore
      }
    }
  }

  emitDbMutation({ type: "reset" });
}
