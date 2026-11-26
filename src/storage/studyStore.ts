import { useEffect, useSyncExternalStore } from "react";
import { CardFsrsState } from "../domain/fsrs/fsrsTypes";
import { getLocalDateString } from "../utils/date";
import {
  DailyRecord,
  DbMutationEvent,
  LEGACY_STORAGE_KEYS,
  UNIFIED_SETTINGS_KEYS,
  getAllBottlenecks,
  getAllCardStates,
  getAllSettings,
  getDailyRecords,
  getSafeLocalStorage,
  incrementDailyRecord,
  saveBottlenecks,
  saveCardState,
  saveCardStatesBatch,
  setSetting,
  subscribeDbMutations
} from "./db";

export type CramRatingValue = "stuck" | "doubt" | "mastered" | string;

export interface ScenarioWrongItem {
  questionId: string;
  articleId: string;
  answer?: string;
  markedAt: number;
}

export interface DailyActivityOptions {
  date?: string;
  countDelta?: number;
  newLearnedDelta?: number;
  snowballCountDelta?: number;
}

export interface StudyStoreSnapshot {
  cards: Map<string, CardFsrsState>;
  dailyRecords: Map<string, DailyRecord>;
  bottlenecks: Map<string, number[]>;
  settings: Map<string, unknown>;
  hydrated: boolean;
  hydrating: boolean;
}

const EMPTY_SNAPSHOT: StudyStoreSnapshot = {
  cards: new Map(),
  dailyRecords: new Map(),
  bottlenecks: new Map(),
  settings: new Map(),
  hydrated: false,
  hydrating: false
};

const RESOLVED_PROMISE: Promise<void> = Promise.resolve();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonSafe<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class StudyStore {
  private cards = new Map<string, CardFsrsState>();
  private dailyRecords = new Map<string, DailyRecord>();
  private bottlenecks = new Map<string, number[]>();
  private settings = new Map<string, unknown>();
  private hydrated = false;
  private hydrating = false;

  private snapshot: StudyStoreSnapshot = {
    cards: this.cards,
    dailyRecords: this.dailyRecords,
    bottlenecks: this.bottlenecks,
    settings: this.settings,
    hydrated: false,
    hydrating: false
  };

  private listeners = new Set<() => void>();
  private hydratePromise: Promise<void> | null = null;
  private refreshPromise: Promise<void> | null = null;
  private refreshing = false;
  private writeQueue: Promise<void> = Promise.resolve();

  // In-flight optimistic write counters to ignore self-triggered DB echoes
  private pendingCardWrites = new Map<string, number>();
  private pendingDailyWrites = new Map<string, number>();
  private pendingBottleneckWrites = new Map<string, number>();
  private pendingSettingWrites = new Map<string, number>();

  // Keys updated optimistically while initial hydration or DB refresh is running
  private dirtyCardIds = new Set<string>();
  private dirtyDailyDates = new Set<string>();
  private dirtyBottleneckIds = new Set<string>();
  private dirtySettingKeys = new Set<string>();
  private dirtyDailyDeltas = new Map<
    string,
    { countDelta: number; newLearnedDelta: number; snowballCountDelta: number }
  >();
  private committedDailyDuringLoad = new Map<string, DailyRecord>();

  private unsubscribeDb: (() => void) | null = null;

  constructor(options?: { subscribeToDb?: boolean }) {
    if (options?.subscribeToDb !== false && typeof subscribeDbMutations === "function") {
      this.unsubscribeDb = subscribeDbMutations((event) => this.handleDbMutation(event));
    }
  }

  dispose(): void {
    if (this.unsubscribeDb) {
      this.unsubscribeDb();
      this.unsubscribeDb = null;
    }
    this.listeners.clear();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StudyStoreSnapshot => {
    return this.snapshot;
  };

  getServerSnapshot = (): StudyStoreSnapshot => {
    return EMPTY_SNAPSHOT;
  };

  private updateSnapshot(): void {
    this.snapshot = {
      cards: this.cards,
      dailyRecords: this.dailyRecords,
      bottlenecks: this.bottlenecks,
      settings: this.settings,
      hydrated: this.hydrated,
      hydrating: this.hydrating
    };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Isolate subscriber errors
      }
    }
  }

  private enqueueWrite(task: () => Promise<void>): void {
    const run = async () => {
      try {
        await task();
      } catch (err) {
        console.warn("[StudyStore] Background persistence failed:", err);
      }
    };
    this.writeQueue = this.writeQueue.then(run, run);
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private incPending(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  private decPending(map: Map<string, number>, key: string): void {
    const current = map.get(key) ?? 0;
    if (current <= 1) {
      map.delete(key);
    } else {
      map.set(key, current - 1);
    }
  }

  private handleDbMutation(event: DbMutationEvent): void {
    switch (event.type) {
      case "card": {
        if ((this.pendingCardWrites.get(event.card.cardId) ?? 0) > 0) return;
        if (this.cards.get(event.card.cardId) === event.card) return;
        const next = new Map(this.cards);
        next.set(event.card.cardId, event.card);
        this.cards = next;
        this.updateSnapshot();
        return;
      }
      case "cards": {
        const externalCards = event.cards.filter(
          (c) => (this.pendingCardWrites.get(c.cardId) ?? 0) === 0
        );
        if (externalCards.length === 0) return;
        const next = new Map(this.cards);
        for (const c of externalCards) {
          next.set(c.cardId, c);
        }
        this.cards = next;
        this.updateSnapshot();
        return;
      }
      case "daily_record": {
        if ((this.pendingDailyWrites.get(event.record.date) ?? 0) > 0) return;
        const next = new Map(this.dailyRecords);
        next.set(event.record.date, event.record);
        this.dailyRecords = next;
        this.updateSnapshot();
        return;
      }
      case "bottlenecks": {
        if ((this.pendingBottleneckWrites.get(event.articleId) ?? 0) > 0) return;
        const next = new Map(this.bottlenecks);
        next.set(event.articleId, [...event.indices]);
        this.bottlenecks = next;
        this.updateSnapshot();
        return;
      }
      case "setting": {
        if ((this.pendingSettingWrites.get(event.key) ?? 0) > 0) return;
        const next = new Map(this.settings);
        next.set(event.key, event.value);
        this.settings = next;
        this.updateSnapshot();
        return;
      }
      case "reset": {
        this.cards = new Map();
        this.dailyRecords = new Map();
        this.bottlenecks = new Map();
        this.settings = new Map();
        this.dirtyCardIds.clear();
        this.dirtyDailyDates.clear();
        this.dirtyBottleneckIds.clear();
        this.dirtySettingKeys.clear();
        this.updateSnapshot();
        return;
      }
      case "import": {
        // Explicit callers (e.g. SettingsView) await studyStore.refreshFromDB();
        return;
      }
    }
  }

  private isLoadingFromDb(): boolean {
    return this.hydrating || this.refreshing;
  }

  private clearDirtyTracking(): void {
    this.dirtyCardIds.clear();
    this.dirtyDailyDates.clear();
    this.dirtyBottleneckIds.clear();
    this.dirtySettingKeys.clear();
    this.dirtyDailyDeltas.clear();
    this.committedDailyDuringLoad.clear();
  }

  private applyDirtyMutations(
    nextCards: Map<string, CardFsrsState>,
    nextDaily: Map<string, DailyRecord>,
    nextBottlenecks: Map<string, number[]>,
    nextSettings: Map<string, unknown>
  ): void {
    for (const dirtyId of this.dirtyCardIds) {
      const localCard = this.cards.get(dirtyId);
      if (localCard) nextCards.set(dirtyId, localCard);
    }

    for (const dirtyDate of this.dirtyDailyDates) {
      const base = this.committedDailyDuringLoad.get(dirtyDate) ??
        nextDaily.get(dirtyDate) ?? { date: dirtyDate, count: 0, newLearned: 0 };
      const pendingDelta = this.dirtyDailyDeltas.get(dirtyDate);
      if (pendingDelta) {
        const merged: DailyRecord = {
          date: dirtyDate,
          count: Math.max(0, base.count + pendingDelta.countDelta),
          newLearned: Math.max(0, base.newLearned + pendingDelta.newLearnedDelta),
          ...(base.snowballCount !== undefined || pendingDelta.snowballCountDelta > 0
            ? { snowballCount: Math.max(0, (base.snowballCount ?? 0) + pendingDelta.snowballCountDelta) }
            : {})
        };
        nextDaily.set(dirtyDate, merged);
      } else {
        nextDaily.set(dirtyDate, { ...base });
      }
    }

    for (const dirtyArtId of this.dirtyBottleneckIds) {
      const localIndices = this.bottlenecks.get(dirtyArtId);
      if (localIndices) nextBottlenecks.set(dirtyArtId, [...localIndices]);
    }

    for (const dirtyKey of this.dirtySettingKeys) {
      if (this.settings.has(dirtyKey)) {
        nextSettings.set(dirtyKey, this.settings.get(dirtyKey));
      }
    }
  }

  /**
   * Pre-hydrate all IndexedDB stores into in-memory Maps once on startup.
   * Deduplicates concurrent calls.
   */
  hydrate(): Promise<void> {
    if (this.hydrated) {
      return RESOLVED_PROMISE;
    }
    if (this.hydratePromise) {
      return this.hydratePromise;
    }

    this.hydrating = true;
    this.clearDirtyTracking();
    this.updateSnapshot();

    this.hydratePromise = this.performLoadAndMigrate()
      .then(() => {
        this.hydrated = true;
      })
      .catch((err) => {
        console.warn("[StudyStore] Hydration failed:", err);
        this.hydrated = false;
      })
      .finally(() => {
        this.hydrating = false;
        this.hydratePromise = null;
        this.updateSnapshot();
      });

    return this.hydratePromise;
  }

  private async performLoadAndMigrate(): Promise<void> {
    const [cardList, recordList, bottlenecksObj, settingsObj] = await Promise.all([
      getAllCardStates(),
      getDailyRecords(),
      getAllBottlenecks(),
      getAllSettings()
    ]);

    const nextCards = new Map<string, CardFsrsState>();
    for (const card of cardList) {
      if (card && typeof card.cardId === "string") {
        nextCards.set(card.cardId, card);
      }
    }

    const nextDaily = new Map<string, DailyRecord>();
    for (const rec of recordList) {
      if (rec && typeof rec.date === "string") {
        nextDaily.set(rec.date, rec);
      }
    }

    const nextBottlenecks = new Map<string, number[]>();
    for (const [artId, indices] of Object.entries(bottlenecksObj)) {
      if (Array.isArray(indices)) {
        nextBottlenecks.set(artId, [...indices]);
      }
    }

    const nextSettings = new Map<string, unknown>();
    for (const [k, v] of Object.entries(settingsObj)) {
      nextSettings.set(k, v);
    }
    // Apply pre-migration dirty settings so legacy localStorage migration doesn't overwrite them
    for (const dirtyKey of this.dirtySettingKeys) {
      if (this.settings.has(dirtyKey)) {
        nextSettings.set(dirtyKey, this.settings.get(dirtyKey));
      }
    }

    await this.migrateLegacyLocalStorage(nextSettings);

    // Re-apply all optimistic dirty mutations made during Promise.all or migrateLegacyLocalStorage
    this.applyDirtyMutations(nextCards, nextDaily, nextBottlenecks, nextSettings);
    this.clearDirtyTracking();

    this.cards = nextCards;
    this.dailyRecords = nextDaily;
    this.bottlenecks = nextBottlenecks;
    this.settings = nextSettings;
  }

  private async migrateLegacyLocalStorage(settingsMap: Map<string, unknown>): Promise<void> {
    if (settingsMap.get(UNIFIED_SETTINGS_KEYS.LOCAL_MIGRATED_V1) === true) {
      return;
    }

    const storage = getSafeLocalStorage();
    if (!storage) {
      return;
    }

    const writes: Promise<void>[] = [];
    const queueSettingMigration = (key: string, value: unknown) => {
      settingsMap.set(key, value);
      this.incPending(this.pendingSettingWrites, key);
      writes.push(
        setSetting(key, value).finally(() => {
          this.decPending(this.pendingSettingWrites, key);
        })
      );
    };

    // 1. wenyan_cram_ratings
    if (!settingsMap.has(UNIFIED_SETTINGS_KEYS.CRAM_RATINGS)) {
      const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.CRAM_RATINGS));
      if (isPlainObject(parsed)) {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") clean[k] = v;
        }
        queueSettingMigration(UNIFIED_SETTINGS_KEYS.CRAM_RATINGS, clean);
      }
    }

    // 2. wenyan_anki_expanded_decks
    if (!settingsMap.has(UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS)) {
      const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.EXPANDED_DECKS));
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((id): id is string => typeof id === "string");
        queueSettingMigration(UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS, clean);
      }
    }

    // 3. snowball_stage_*
    const legacyStages: Record<string, number> = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX)) {
        const artId = key.slice(LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX.length);
        const parsedStage = Number.parseInt(storage.getItem(key) || "", 10);
        if (artId && Number.isFinite(parsedStage) && parsedStage >= 0) {
          legacyStages[artId] = parsedStage;
        }
      }
    }
    if (Object.keys(legacyStages).length > 0) {
      const existingStages = isPlainObject(settingsMap.get(UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES))
        ? (settingsMap.get(UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES) as Record<string, number>)
        : {};
      const merged = { ...legacyStages, ...existingStages };
      queueSettingMigration(UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES, merged);
    }

    // 4. wenyan_last_session
    if (!settingsMap.has(UNIFIED_SETTINGS_KEYS.LAST_SESSION)) {
      const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.LAST_SESSION));
      if (isPlainObject(parsed) && typeof parsed.view === "string") {
        queueSettingMigration(UNIFIED_SETTINGS_KEYS.LAST_SESSION, parsed);
      }
    }

    queueSettingMigration(UNIFIED_SETTINGS_KEYS.LOCAL_MIGRATED_V1, true);

    await Promise.all(writes);
  }

  /**
   * Reload all Maps directly from IndexedDB (e.g., after backup import or reset).
   */
  refreshFromDB(): Promise<void> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      if (this.hydratePromise) {
        await this.hydratePromise;
      }
      await this.flush();

      this.clearDirtyTracking();
      this.refreshing = true;

      try {
        const [cardList, recordList, bottlenecksObj, settingsObj] = await Promise.all([
          getAllCardStates(),
          getDailyRecords(),
          getAllBottlenecks(),
          getAllSettings()
        ]);

        const nextCards = new Map<string, CardFsrsState>();
        for (const card of cardList) {
          if (card && typeof card.cardId === "string") {
            nextCards.set(card.cardId, card);
          }
        }

        const nextDaily = new Map<string, DailyRecord>();
        for (const rec of recordList) {
          if (rec && typeof rec.date === "string") {
            nextDaily.set(rec.date, rec);
          }
        }

        const nextBottlenecks = new Map<string, number[]>();
        for (const [artId, indices] of Object.entries(bottlenecksObj)) {
          if (Array.isArray(indices)) {
            nextBottlenecks.set(artId, [...indices]);
          }
        }

        const nextSettings = new Map<string, unknown>();
        for (const [k, v] of Object.entries(settingsObj)) {
          nextSettings.set(k, v);
        }

        // Preserve any optimistic mutations triggered while Promise.all was in flight
        this.applyDirtyMutations(nextCards, nextDaily, nextBottlenecks, nextSettings);
        this.clearDirtyTracking();

        this.cards = nextCards;
        this.dailyRecords = nextDaily;
        this.bottlenecks = nextBottlenecks;
        this.settings = nextSettings;
        this.hydrated = true;
        this.hydrating = false;
        this.updateSnapshot();
      } finally {
        this.refreshing = false;
      }
    })().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  // ── Optimistic Mutations ───────────────────────────────────────────────────

  upsertCard(card: CardFsrsState): void {
    const next = new Map(this.cards);
    next.set(card.cardId, card);
    this.cards = next;
    if (this.isLoadingFromDb()) {
      this.dirtyCardIds.add(card.cardId);
    }
    this.updateSnapshot();

    this.incPending(this.pendingCardWrites, card.cardId);
    this.enqueueWrite(async () => {
      try {
        await saveCardState(card);
      } finally {
        this.decPending(this.pendingCardWrites, card.cardId);
      }
    });
  }

  upsertCardsBatch(cards: CardFsrsState[]): void {
    if (cards.length === 0) return;

    const next = new Map(this.cards);
    for (const c of cards) {
      next.set(c.cardId, c);
      if (this.isLoadingFromDb()) {
        this.dirtyCardIds.add(c.cardId);
      }
      this.incPending(this.pendingCardWrites, c.cardId);
    }
    this.cards = next;
    this.updateSnapshot();

    const batchCopy = [...cards];
    this.enqueueWrite(async () => {
      try {
        await saveCardStatesBatch(batchCopy);
      } finally {
        for (const c of batchCopy) {
          this.decPending(this.pendingCardWrites, c.cardId);
        }
      }
    });
  }

  recordDailyActivity(options: DailyActivityOptions = {}): DailyRecord {
    const date = options.date || getLocalDateString();
    const countDelta = options.countDelta ?? 1;
    const newLearnedDelta = options.newLearnedDelta ?? 0;
    const snowballCountDelta = options.snowballCountDelta ?? 0;

    const existing = this.dailyRecords.get(date) || { date, count: 0, newLearned: 0 };
    const updated: DailyRecord = {
      date,
      count: Math.max(0, existing.count + countDelta),
      newLearned: Math.max(0, existing.newLearned + newLearnedDelta),
      ...(existing.snowballCount !== undefined || snowballCountDelta > 0
        ? { snowballCount: Math.max(0, (existing.snowballCount ?? 0) + snowballCountDelta) }
        : {})
    };

    const next = new Map(this.dailyRecords);
    next.set(date, updated);
    this.dailyRecords = next;

    const trackedDuringLoad = this.isLoadingFromDb();
    if (trackedDuringLoad) {
      this.dirtyDailyDates.add(date);
      const prevDelta = this.dirtyDailyDeltas.get(date) || {
        countDelta: 0,
        newLearnedDelta: 0,
        snowballCountDelta: 0
      };
      this.dirtyDailyDeltas.set(date, {
        countDelta: prevDelta.countDelta + countDelta,
        newLearnedDelta: prevDelta.newLearnedDelta + newLearnedDelta,
        snowballCountDelta: prevDelta.snowballCountDelta + snowballCountDelta
      });
    }
    this.updateSnapshot();

    this.incPending(this.pendingDailyWrites, date);
    this.enqueueWrite(async () => {
      try {
        const committed = await incrementDailyRecord(date, {
          countDelta,
          newLearnedDelta,
          snowballCountDelta
        });
        if (trackedDuringLoad && this.isLoadingFromDb()) {
          const curDelta = this.dirtyDailyDeltas.get(date);
          if (curDelta) {
            const remCount = curDelta.countDelta - countDelta;
            const remNew = curDelta.newLearnedDelta - newLearnedDelta;
            const remSnowball = curDelta.snowballCountDelta - snowballCountDelta;
            if (remCount === 0 && remNew === 0 && remSnowball === 0) {
              this.dirtyDailyDeltas.delete(date);
            } else {
              this.dirtyDailyDeltas.set(date, {
                countDelta: remCount,
                newLearnedDelta: remNew,
                snowballCountDelta: remSnowball
              });
            }
          }
          this.committedDailyDuringLoad.set(date, committed);
        }
      } finally {
        this.decPending(this.pendingDailyWrites, date);
      }
    });

    return updated;
  }

  setBottlenecks(articleId: string, indices: number[]): void {
    const clean = [...indices];
    const next = new Map(this.bottlenecks);
    next.set(articleId, clean);
    this.bottlenecks = next;
    if (this.isLoadingFromDb()) {
      this.dirtyBottleneckIds.add(articleId);
    }
    this.updateSnapshot();

    this.incPending(this.pendingBottleneckWrites, articleId);
    this.enqueueWrite(async () => {
      try {
        await saveBottlenecks(articleId, clean);
      } finally {
        this.decPending(this.pendingBottleneckWrites, articleId);
      }
    });
  }

  setSettingValue<T = unknown>(key: string, value: T): void {
    const next = new Map(this.settings);
    next.set(key, value);
    this.settings = next;
    if (this.isLoadingFromDb()) {
      this.dirtySettingKeys.add(key);
    }
    this.mirrorSettingToLocalStorage(key, value);
    this.updateSnapshot();

    this.incPending(this.pendingSettingWrites, key);
    this.enqueueWrite(async () => {
      try {
        await setSetting(key, value);
      } finally {
        this.decPending(this.pendingSettingWrites, key);
      }
    });
  }

  private mirrorSettingToLocalStorage(key: string, value: unknown): void {
    const storage = getSafeLocalStorage();
    if (!storage) return;

    if (key === UNIFIED_SETTINGS_KEYS.CRAM_RATINGS && isPlainObject(value)) {
      storage.setItem(LEGACY_STORAGE_KEYS.CRAM_RATINGS, JSON.stringify(value));
    } else if (key === UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS && Array.isArray(value)) {
      storage.setItem(LEGACY_STORAGE_KEYS.EXPANDED_DECKS, JSON.stringify(value));
    } else if (key === UNIFIED_SETTINGS_KEYS.LAST_SESSION) {
      if (isPlainObject(value)) {
        storage.setItem(LEGACY_STORAGE_KEYS.LAST_SESSION, JSON.stringify(value));
      } else if (value === null) {
        storage.removeItem(LEGACY_STORAGE_KEYS.LAST_SESSION);
      }
    } else if (key === UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES && isPlainObject(value)) {
      for (const [artId, stage] of Object.entries(value)) {
        if (typeof stage === "number" && Number.isFinite(stage) && stage > 0) {
          storage.setItem(`${LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX}${artId}`, String(stage));
        } else {
          storage.removeItem(`${LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX}${artId}`);
        }
      }
    }
  }

  // ── Unified Local Preferences Helpers ──────────────────────────────────────

  getCramRatings(): Record<string, CramRatingValue> {
    const fromSettings = this.settings.get(UNIFIED_SETTINGS_KEYS.CRAM_RATINGS);
    if (isPlainObject(fromSettings)) {
      const result: Record<string, CramRatingValue> = {};
      for (const [k, v] of Object.entries(fromSettings)) {
        if (typeof v === "string") result[k] = v;
      }
      return result;
    }

    if (
      this.settings.has(UNIFIED_SETTINGS_KEYS.CRAM_RATINGS) ||
      this.settings.get(UNIFIED_SETTINGS_KEYS.LOCAL_MIGRATED_V1) === true
    ) {
      return {};
    }

    const storage = getSafeLocalStorage();
    if (storage) {
      const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.CRAM_RATINGS));
      if (isPlainObject(parsed)) {
        const result: Record<string, CramRatingValue> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") result[k] = v;
        }
        return result;
      }
    }
    return {};
  }

  setCramRating(verseId: string, rating: CramRatingValue | null): Record<string, CramRatingValue> {
    const next = { ...this.getCramRatings() };
    if (rating === null) {
      delete next[verseId];
    } else {
      next[verseId] = rating;
    }
    this.setSettingValue(UNIFIED_SETTINGS_KEYS.CRAM_RATINGS, next);
    return next;
  }

  private getSnowballStagesMap(): Record<string, number> {
    const fromSettings = this.settings.get(UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES);
    if (isPlainObject(fromSettings)) {
      const result: Record<string, number> = {};
      for (const [artId, stage] of Object.entries(fromSettings)) {
        if (typeof stage === "number" && Number.isFinite(stage) && stage >= 0) {
          result[artId] = stage;
        }
      }
      return result;
    }
    return {};
  }

  getSnowballStage(articleId: string): number {
    const stages = this.getSnowballStagesMap();
    if (typeof stages[articleId] === "number") {
      return stages[articleId];
    }
    if (
      this.settings.has(UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES) ||
      this.settings.get(UNIFIED_SETTINGS_KEYS.LOCAL_MIGRATED_V1) === true
    ) {
      return 0;
    }
    const storage = getSafeLocalStorage();
    if (storage) {
      const raw = storage.getItem(`${LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX}${articleId}`);
      if (raw) {
        const val = Number.parseInt(raw, 10);
        if (Number.isFinite(val) && val >= 0) return val;
      }
    }
    return 0;
  }

  setSnowballStage(articleId: string, stage: number): void {
    const next = { ...this.getSnowballStagesMap() };
    const storage = getSafeLocalStorage();
    if (Number.isFinite(stage) && stage > 0) {
      next[articleId] = stage;
      storage?.setItem(`${LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX}${articleId}`, String(stage));
    } else {
      delete next[articleId];
      storage?.removeItem(`${LEGACY_STORAGE_KEYS.SNOWBALL_STAGE_PREFIX}${articleId}`);
    }
    this.setSettingValue(UNIFIED_SETTINGS_KEYS.SNOWBALL_STAGES, next);
  }

  getExpandedDecks(): string[] {
    const fromSettings = this.settings.get(UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS);
    if (Array.isArray(fromSettings)) {
      return fromSettings.filter((id): id is string => typeof id === "string");
    }
    if (
      this.settings.has(UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS) ||
      this.settings.get(UNIFIED_SETTINGS_KEYS.LOCAL_MIGRATED_V1) === true
    ) {
      return [];
    }
    const storage = getSafeLocalStorage();
    if (storage) {
      const parsed = parseJsonSafe<unknown>(storage.getItem(LEGACY_STORAGE_KEYS.EXPANDED_DECKS));
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string");
      }
    }
    return [];
  }

  setExpandedDecks(deckIds: Iterable<string>): void {
    const unique = Array.from(new Set(Array.from(deckIds).filter((id) => typeof id === "string")));
    this.setSettingValue(UNIFIED_SETTINGS_KEYS.EXPANDED_DECKS, unique);
  }

  getScenarioWrongItems(): ScenarioWrongItem[] {
    const raw = this.settings.get(UNIFIED_SETTINGS_KEYS.SCENARIO_WRONG_ITEMS);
    if (!Array.isArray(raw)) return [];
    const result: ScenarioWrongItem[] = [];
    for (const item of raw) {
      if (
        isPlainObject(item) &&
        typeof item.questionId === "string" &&
        typeof item.articleId === "string"
      ) {
        result.push({
          questionId: item.questionId,
          articleId: item.articleId,
          answer: typeof item.answer === "string" ? item.answer : undefined,
          markedAt: typeof item.markedAt === "number" && Number.isFinite(item.markedAt) ? item.markedAt : 0
        });
      }
    }
    return result;
  }

  recordScenarioWrongItem(
    item: Omit<ScenarioWrongItem, "markedAt"> & { markedAt?: number }
  ): ScenarioWrongItem[] {
    const existing = this.getScenarioWrongItems().filter((x) => x.questionId !== item.questionId);
    const entry: ScenarioWrongItem = {
      questionId: item.questionId,
      articleId: item.articleId,
      ...(item.answer ? { answer: item.answer } : {}),
      markedAt: item.markedAt ?? Date.now()
    };
    const next = [entry, ...existing];
    this.setSettingValue(UNIFIED_SETTINGS_KEYS.SCENARIO_WRONG_ITEMS, next);
    return next;
  }

  removeScenarioWrongItem(questionId: string): ScenarioWrongItem[] {
    const existing = this.getScenarioWrongItems();
    const next = existing.filter((x) => x.questionId !== questionId);
    if (next.length !== existing.length) {
      this.setSettingValue(UNIFIED_SETTINGS_KEYS.SCENARIO_WRONG_ITEMS, next);
    }
    return next;
  }
}

export const studyStore = new StudyStore();

export function hydrateStudyStore(): Promise<void> {
  return studyStore.hydrate();
}

export function useStudyStore(): StudyStoreSnapshot {
  const snapshot = useSyncExternalStore(
    studyStore.subscribe,
    studyStore.getSnapshot,
    studyStore.getServerSnapshot
  );

  useEffect(() => {
    if (!snapshot.hydrated && !snapshot.hydrating) {
      void hydrateStudyStore();
    }
  }, [snapshot.hydrated, snapshot.hydrating]);

  return snapshot;
}
