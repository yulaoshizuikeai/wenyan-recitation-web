import { describe, it, expect, vi, beforeEach } from "vitest";
import { CardFsrsState, CardState, Rating, ReviewLog } from "../src/domain/fsrs/fsrsTypes";
import { computeDeckStats } from "../src/data/ankiDecks";
import { ALL_ARTICLES } from "../src/data/curriculumData";
import { ARTICLE_INDEX_MAP } from "../src/data/curriculumIndex";
import { flashcardCache } from "../src/data/flashcardCache";
import { getLocalDateString } from "../src/utils/date";

// ─── In-memory Fake IDB (mocking only `idb` so real db.ts & StudyStore execute) ──

type StoreName = "cards" | "logs" | "daily_records" | "bottlenecks" | "settings";

const KEY_PATHS: Record<StoreName, string | null> = {
  cards: "cardId",
  logs: "id",
  daily_records: "date",
  bottlenecks: "articleId",
  settings: null
};

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const fakeStores: Record<StoreName, Map<string, any>> = {
  cards: new Map(),
  logs: new Map(),
  daily_records: new Map(),
  bottlenecks: new Map(),
  settings: new Map()
};

let openDbCallCount = 0;
let getAllCallCount = 0;
let nextOpenDbError: Error | null = null;
let lastOpenDbCallbacks: any = null;
let lastCreatedFakeDb: any = null;
let lastTxStores: StoreName[] | null = null;
let getAllCardsDelayMs = 0;
let setSettingDelayMs = 0;

function createFakeStoreApi(name: StoreName, targetMap: Map<string, any>) {
  const keyPath = KEY_PATHS[name];
  return {
    get: async (key: string) => targetMap.get(key),
    getAll: async () => Array.from(targetMap.values()),
    getAllKeys: async () => Array.from(targetMap.keys()),
    put: async (value: any, explicitKey?: string) => {
      const k = keyPath ? value?.[keyPath] : explicitKey;
      if (typeof k !== "string" || !k) {
        throw new Error(`Missing key for store ${name}`);
      }
      targetMap.set(k, structuredClone(value));
      return k;
    },
    clear: async () => {
      targetMap.clear();
    },
    openCursor: async () => {
      const entries = Array.from(targetMap.entries());
      let idx = 0;
      const makeCursor = (): any => {
        if (idx >= entries.length) return null;
        const [key, value] = entries[idx];
        return {
          key,
          value: structuredClone(value),
          continue: async () => {
            idx += 1;
            return makeCursor();
          }
        };
      };
      return makeCursor();
    }
  };
}

function createFakeDB() {
  const db = {
    close: vi.fn(),
    get: async (name: StoreName, key: string) => {
      const val = fakeStores[name].get(key);
      return val !== undefined ? structuredClone(val) : undefined;
    },
    getAll: async (name: StoreName) => {
      getAllCallCount += 1;
      if (name === "cards" && getAllCardsDelayMs > 0) {
        await new Promise((r) => setTimeout(r, getAllCardsDelayMs));
      }
      return Array.from(fakeStores[name].values()).map((v) => structuredClone(v));
    },
    put: async (name: StoreName, value: any, explicitKey?: string) => {
      if (name === "settings" && setSettingDelayMs > 0) {
        await new Promise((r) => setTimeout(r, setSettingDelayMs));
      }
      const keyPath = KEY_PATHS[name];
      const k = keyPath ? value?.[keyPath] : explicitKey;
      if (typeof k !== "string" || !k) {
        throw new Error(`Missing key for store ${name}`);
      }
      fakeStores[name].set(k, structuredClone(value));
      return k;
    },
    transaction: (storeNames: StoreName | StoreName[], _mode?: IDBTransactionMode) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      lastTxStores = names;
      // Stage snapshot for simple rollback guarantee on error
      const backup = new Map<StoreName, Map<string, any>>();
      for (const n of names) {
        backup.set(n, new Map(Array.from(fakeStores[n].entries()).map(([k, v]) => [k, structuredClone(v)])));
      }
      const primaryStore = createFakeStoreApi(names[0], fakeStores[names[0]]);
      const txDone = Promise.resolve();
      return {
        store: primaryStore,
        objectStore: (n: StoreName) => createFakeStoreApi(n, fakeStores[n]),
        done: txDone,
        abort: () => {
          for (const [n, map] of backup.entries()) {
            fakeStores[n] = map;
          }
        }
      };
    }
  };
  lastCreatedFakeDb = db;
  return db;
}

vi.mock("idb", () => ({
  openDB: vi.fn(async (_name: string, _version?: number, callbacks?: any) => {
    openDbCallCount += 1;
    lastOpenDbCallbacks = callbacks ?? null;
    if (nextOpenDbError) {
      const err = nextOpenDbError;
      nextOpenDbError = null;
      throw err;
    }
    return createFakeDB();
  })
}));

import {
  exportAllProgress,
  getAllBottlenecks,
  getAllCardStates,
  getAllLogs,
  getAllSettings,
  getDB,
  getDailyRecords,
  importAllProgress,
  recordReviewLog,
  recordSnowballCompletionLogs,
  resetAllProgress,
  saveBottlenecks,
  saveCardState,
  saveCardStatesBatch,
  setSetting,
  BackupDataV1,
  BackupDataV2
} from "../src/storage/db";
import { StudyStore, studyStore, hydrateStudyStore } from "../src/storage/studyStore";

function makeCardState(cardId: string, overrides: Partial<CardFsrsState> = {}): CardFsrsState {
  return {
    cardId,
    state: CardState.REVIEW,
    step: null,
    stability: 25,
    difficulty: 4.5,
    elapsedDays: 5,
    scheduledDays: 12,
    reps: 3,
    lapses: 0,
    lastReviewTime: 1770000000000,
    dueTime: 1770000000000 - 1000, // already due
    isLeech: false,
    ...overrides
  };
}

function makeReviewLog(cardId: string, overrides: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: `${cardId}_log_1`,
    cardId,
    rating: Rating.GOOD,
    previousState: CardState.NEW,
    currentState: CardState.REVIEW,
    stability: 5,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 4,
    reviewTime: 1770000000000,
    source: "flipcard",
    ...overrides
  };
}

describe("Phase 3.1 StudyStore & Phase 3.3 Unified Backup v2", () => {
  let fakeLocalStorage: FakeStorage;

  beforeEach(async () => {
    for (const key of Object.keys(fakeStores) as StoreName[]) {
      fakeStores[key].clear();
    }
    openDbCallCount = 0;
    getAllCallCount = 0;
    nextOpenDbError = null;
    lastTxStores = null;
    getAllCardsDelayMs = 0;
    setSettingDelayMs = 0;
    fakeLocalStorage = new FakeStorage();
    vi.stubGlobal("localStorage", fakeLocalStorage);
    await studyStore.refreshFromDB();
  });

  // ── 1. db.ts Collection Getters & Backup v2 Export/Import ─────────────────

  describe("db.ts collection getters & Backup v1/v2 import/export", () => {
    it("reads all bottlenecks, logs, and out-of-line settings keys accurately", async () => {
      await saveBottlenecks("art_bx1_12", [1, 4, 7]);
      await saveBottlenecks("art_bx1_14", [0, 2]);
      await recordReviewLog(makeReviewLog("fc_1", { id: "log_a" }));
      await setSetting("fsrs_settings", { requestRetention: 0.92, recitationStabilityFactor: 0.75 });
      await setSetting("auto_resume_on_startup", true);

      const bottlenecks = await getAllBottlenecks();
      const logs = await getAllLogs();
      const settings = await getAllSettings();

      expect(bottlenecks).toEqual({
        art_bx1_12: [1, 4, 7],
        art_bx1_14: [0, 2]
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].id).toBe("log_a");
      expect(settings).toEqual({
        fsrs_settings: { requestRetention: 0.92, recitationStabilityFactor: 0.75 },
        auto_resume_on_startup: true
      });
    });

    it("exports full BackupDataV2 snapshot including cards, records, logs, bottlenecks, settings, and localPreferences", async () => {
      const card = makeCardState("fc_art_bx1_12_u0_upper");
      await saveCardState(card);
      await recordReviewLog(makeReviewLog(card.cardId, { id: "log_export_1" }));
      await saveBottlenecks("art_bx1_12", [2, 5]);
      await setSetting("selected_scope", "GAOKAO72");
      await setSetting("cram_ratings", { gv_1: "mastered", gv_2: "stuck" });
      await setSetting("expanded_decks", ["VOL_BX1", "VOL_XB1"]);
      await setSetting("last_session", { view: "snowball", articleId: "art_bx1_12" });
      fakeLocalStorage.setItem("snowball_stage_art_bx1_12", "4");

      const exported = await exportAllProgress();

      expect(exported.version).toBe(2);
      expect(typeof exported.exportTime).toBe("string");
      expect(exported.cards).toHaveLength(1);
      expect(exported.cards[0].cardId).toBe(card.cardId);
      expect(exported.records).toHaveLength(1);
      expect(exported.logs).toHaveLength(1);
      expect(exported.bottlenecks).toEqual({ art_bx1_12: [2, 5] });
      expect(exported.settings.selected_scope).toBe("GAOKAO72");
      expect(exported.localPreferences).toEqual({
        cramRatings: { gv_1: "mastered", gv_2: "stuck" },
        snowballStages: { art_bx1_12: 4 },
        expandedDecks: ["VOL_BX1", "VOL_XB1"],
        lastSession: { view: "snowball", articleId: "art_bx1_12" }
      });
    });

    it("imports legacy v1 backups (without version and with version '1.0')", async () => {
      const v1NoVersion: BackupDataV1 = {
        cards: [makeCardState("c_v1_a")],
        records: [{ date: "2026-11-20", count: 12, newLearned: 4 }]
      };

      const res1 = await importAllProgress(v1NoVersion);
      expect(res1.version).toBe(1);
      expect(res1.cardsImported).toBe(1);
      expect(res1.recordsImported).toBe(1);
      expect(res1.logsImported).toBe(0);

      const v1Explicit: BackupDataV1 = {
        version: "1.0",
        cards: [makeCardState("c_v1_b")],
        records: [{ date: "2026-11-21", count: 8, newLearned: 2, snowballCount: 1 }]
      };
      const res2 = await importAllProgress(v1Explicit);
      expect(res2.version).toBe(1);

      const cards = await getAllCardStates();
      const records = await getDailyRecords();
      expect(cards.map((c) => c.cardId).sort()).toEqual(["c_v1_a", "c_v1_b"]);
      expect(records).toHaveLength(2);
    });

    it("imports legacy '2.0.0' exports without wiping existing settings", async () => {
      await setSetting("fsrs_settings", { requestRetention: 0.95, recitationStabilityFactor: 0.72 });

      const legacy200 = {
        version: "2.0.0",
        exportTime: "2026-11-25T00:00:00.000Z",
        cards: [makeCardState("c_legacy")],
        records: [{ date: "2026-11-22", count: 5, newLearned: 5 }]
      };

      const res = await importAllProgress(legacy200);
      expect(res.version).toBe(2);
      expect(res.cardsImported).toBe(1);
      expect(res.recordsImported).toBe(1);

      const settings = await getAllSettings();
      expect(settings.fsrs_settings).toEqual({ requestRetention: 0.95, recitationStabilityFactor: 0.72 });
    });

    it("transactionally restores full v2 backup including logs, bottlenecks, settings, and localPreferences", async () => {
      const v2Backup: BackupDataV2 = {
        version: 2,
        exportTime: "2026-11-26T00:00:00.000Z",
        cards: [makeCardState("c_v2_1"), makeCardState("c_v2_2")],
        records: [{ date: "2026-11-26", count: 15, newLearned: 6, snowballCount: 2 }],
        logs: [
          makeReviewLog("c_v2_1", { id: "log_v2_1" }),
          makeReviewLog("c_v2_2", { id: undefined, reviewTime: 1770000001000 })
        ],
        bottlenecks: {
          art_bx1_12: [0, 3],
          art_bx1_14: [2]
        },
        settings: {
          selected_scope: "VOL_BX1",
          sound_enabled: true
        },
        localPreferences: {
          cramRatings: { gv_10: "doubt" },
          snowballStages: { art_bx1_13: 5 },
          expandedDecks: ["VOL_BX2"],
          lastSession: { view: "cloze", articleId: "art_bx1_13" }
        }
      };

      const result = await importAllProgress(v2Backup);

      expect(result).toEqual({
        version: 2,
        cardsImported: 2,
        recordsImported: 1,
        logsImported: 2,
        bottlenecksImported: 2,
        settingsImported: 2,
        preferencesRestored: 4
      });

      expect((await getAllCardStates()).map((c) => c.cardId).sort()).toEqual(["c_v2_1", "c_v2_2"]);
      expect(await getDailyRecords()).toHaveLength(1);
      expect(await getAllLogs()).toHaveLength(2);
      expect(await getAllBottlenecks()).toEqual({ art_bx1_12: [0, 3], art_bx1_14: [2] });

      const settings = await getAllSettings();
      expect(settings.selected_scope).toBe("VOL_BX1");
      expect(settings.sound_enabled).toBe(true);
      expect(settings.cram_ratings).toEqual({ gv_10: "doubt" });
      expect(settings.snowball_stages).toEqual({ art_bx1_13: 5 });
      expect(settings.expanded_decks).toEqual(["VOL_BX2"]);
      expect(settings.last_session).toEqual({ view: "cloze", articleId: "art_bx1_13" });

      // Mirrors localPreferences back to localStorage for existing view compatibility
      expect(JSON.parse(fakeLocalStorage.getItem("wenyan_cram_ratings")!)).toEqual({ gv_10: "doubt" });
      expect(fakeLocalStorage.getItem("snowball_stage_art_bx1_13")).toBe("5");
      expect(JSON.parse(fakeLocalStorage.getItem("wenyan_anki_expanded_decks")!)).toEqual(["VOL_BX2"]);
      expect(JSON.parse(fakeLocalStorage.getItem("wenyan_last_session")!)).toEqual({
        view: "cloze",
        articleId: "art_bx1_13"
      });
    });

    it("rejects malformed or unsupported backup payloads without corrupting DB", async () => {
      await saveCardState(makeCardState("keep_me"));

      await expect(importAllProgress(null as any)).rejects.toThrow(/无效的备份文件格式/);
      await expect(importAllProgress({ cards: [] } as any)).rejects.toThrow(/缺少 cards 或 records/);
      await expect(importAllProgress({ version: 3, cards: [], records: [] } as any)).rejects.toThrow(
        /不支持的备份版本/
      );
      await expect(
        importAllProgress({ version: 2, cards: [], records: [], logs: "bad" } as any)
      ).rejects.toThrow(/logs 必须为数组/);
      await expect(
        importAllProgress({ version: 2, cards: [], records: [], bottlenecks: [] } as any)
      ).rejects.toThrow(/bottlenecks 必须为对象/);
      await expect(
        importAllProgress({ version: 2, cards: [], records: [], settings: [] } as any)
      ).rejects.toThrow(/settings 必须为对象/);
      await expect(
        importAllProgress({ version: 2, cards: [], records: [], localPreferences: "bad" } as any)
      ).rejects.toThrow(/localPreferences 必须为对象/);

      const cards = await getAllCardStates();
      expect(cards.map((c) => c.cardId)).toEqual(["keep_me"]);
    });

    it("clears all IndexedDB stores and legacy localStorage keys on resetAllProgress", async () => {
      await saveCardState(makeCardState("c_reset"));
      await saveBottlenecks("art_bx1_12", [1]);
      await setSetting("selected_scope", "ALL");
      fakeLocalStorage.setItem("wenyan_last_session", "{}");
      fakeLocalStorage.setItem("wenyan_cram_ratings", "{}");
      fakeLocalStorage.setItem("wenyan_anki_expanded_decks", "[]");
      fakeLocalStorage.setItem("snowball_stage_art_bx1_12", "3");

      await resetAllProgress();

      expect(await getAllCardStates()).toEqual([]);
      expect(await getAllLogs()).toEqual([]);
      expect(await getDailyRecords()).toEqual([]);
      expect(await getAllBottlenecks()).toEqual({});
      expect(await getAllSettings()).toEqual({});
      expect(fakeLocalStorage.getItem("wenyan_last_session")).toBeNull();
      expect(fakeLocalStorage.getItem("wenyan_cram_ratings")).toBeNull();
      expect(fakeLocalStorage.getItem("wenyan_anki_expanded_decks")).toBeNull();
      expect(fakeLocalStorage.getItem("snowball_stage_art_bx1_12")).toBeNull();
    });
  });

  // ── 2. StudyStore Hydration, Migration, Optimistic Updates & Map Derivation ──

  describe("StudyStore reactive cache, migration & Map derivation", () => {
    it("deduplicates concurrent hydrateStudyStore calls and runs one-time localStorage migration", async () => {
      const store = new StudyStore();
      fakeLocalStorage.setItem("wenyan_cram_ratings", JSON.stringify({ gv_1: "stuck", gv_2: "mastered" }));
      fakeLocalStorage.setItem("wenyan_anki_expanded_decks", JSON.stringify(["VOL_XB1", "VOL_XX"]));
      fakeLocalStorage.setItem("snowball_stage_art_bx1_12", "3");
      fakeLocalStorage.setItem("snowball_stage_art_bx1_14", "6");
      fakeLocalStorage.setItem(
        "wenyan_last_session",
        JSON.stringify({ view: "snowball", articleId: "art_bx1_12", modeName: "长卷滚雪球" })
      );

      await saveCardState(makeCardState("hydrated_card"));
      await saveBottlenecks("art_bx1_12", [2]);
      const readsBefore = getAllCallCount;

      const p1 = store.hydrate();
      const p2 = store.hydrate();
      expect(p1).toBe(p2);

      await p1;
      // Only a single hydration batch (cards, daily_records, bottlenecks) should have executed
      expect(getAllCallCount - readsBefore).toBe(3);

      const snap = store.getSnapshot();
      expect(snap.hydrated).toBe(true);
      expect(snap.hydrating).toBe(false);
      expect(snap.cards.get("hydrated_card")?.cardId).toBe("hydrated_card");
      expect(snap.bottlenecks.get("art_bx1_12")).toEqual([2]);

      // One-time migration moved legacy keys into unified settings store while preserving mirrors
      expect(store.getCramRatings()).toEqual({ gv_1: "stuck", gv_2: "mastered" });
      expect(store.getExpandedDecks()).toEqual(["VOL_XB1", "VOL_XX"]);
      expect(store.getSnowballStage("art_bx1_12")).toBe(3);
      expect(store.getSnowballStage("art_bx1_14")).toBe(6);
      expect(snap.settings.get("local_storage_migrated_v1")).toBe(true);

      const persistedSettings = await getAllSettings();
      expect(persistedSettings.cram_ratings).toEqual({ gv_1: "stuck", gv_2: "mastered" });
      expect(persistedSettings.expanded_decks).toEqual(["VOL_XB1", "VOL_XX"]);
      expect(persistedSettings.snowball_stages).toEqual({ art_bx1_12: 3, art_bx1_14: 6 });

      // Calling hydrate again after completion is a zero-read no-op
      const readsAfter = getAllCallCount;
      const g1 = hydrateStudyStore();
      const g2 = hydrateStudyStore();
      expect(g1).toBe(g2);
      await g1;
      expect(getAllCallCount).toBe(readsAfter);
      store.dispose();
    });

    it("performs 0ms optimistic updates with structural Map reference stability and async IDB persistence", async () => {
      const store = new StudyStore();
      await store.hydrate();

      const listener = vi.fn();
      const unsub = store.subscribe(listener);

      const snapBefore = store.getSnapshot();
      const quanXue = ALL_ARTICLES.find((a) => a.id === "art_bx1_12")!;
      const quanXueMeta = ARTICLE_INDEX_MAP["art_bx1_12"]!;
      expect(quanXue).toBeDefined();
      expect(quanXueMeta).toBeDefined();

      // Pre-compute initial deck stats from empty Map
      const initialStats = computeDeckStats(quanXue.id, quanXue.title, [quanXueMeta], snapBefore.cards, 1770000000000);
      expect(initialStats.totalCards).toBeGreaterThan(0);
      expect(initialStats.newCount).toBe(initialStats.totalCards);
      expect(initialStats.matureCount).toBe(0);

      // Optimistically upsert one real flashcard of 劝学 (should appear synchronously at 0ms!)
      const firstCard = flashcardCache.getCardsForArticle(quanXue)[0];
      expect(firstCard).toBeDefined();
      const cardId = firstCard.id;
      const matureCard = makeCardState(cardId, { stability: 30, dueTime: 1770000000000 - 500 });
      store.upsertCard(matureCard);

      const snapAfterCard = store.getSnapshot();
      expect(listener).toHaveBeenCalledTimes(1);
      // Only `cards` Map replaced; untouched Maps keep exact referential identity
      expect(snapAfterCard.cards).not.toBe(snapBefore.cards);
      expect(snapAfterCard.dailyRecords).toBe(snapBefore.dailyRecords);
      expect(snapAfterCard.bottlenecks).toBe(snapBefore.bottlenecks);
      expect(snapAfterCard.settings).toBe(snapBefore.settings);

      // Derive Anki stats in 0ms immediately from updated Map (before IDB flush)
      const derivedStats = computeDeckStats(
        quanXue.id,
        quanXue.title,
        [quanXueMeta],
        snapAfterCard.cards,
        1770000000000
      );
      expect(derivedStats.newCount).toBe(initialStats.totalCards - 1);
      expect(derivedStats.dueCount).toBe(1);
      expect(derivedStats.matureCount).toBe(1);

      // Rapid optimistic daily activity updates without flicker
      const today = getLocalDateString();
      store.recordDailyActivity({ date: today, countDelta: 1, newLearnedDelta: 1 });
      store.recordDailyActivity({ date: today, countDelta: 1, newLearnedDelta: 0 });

      expect(store.getSnapshot().dailyRecords.get(today)).toEqual({
        date: today,
        count: 2,
        newLearned: 1
      });

      // Optimistic bottlenecks, cram ratings, snowball stage, expanded decks
      store.setBottlenecks("art_bx1_12", [1, 3]);
      store.setCramRating("gv_99", "stuck");
      store.setSnowballStage("art_bx1_14", 4);
      store.setExpandedDecks(["VOL_BX1", "VOL_XB2"]);

      const snapAfterAll = store.getSnapshot();
      expect(snapAfterAll.bottlenecks.get("art_bx1_12")).toEqual([1, 3]);
      expect(store.getCramRatings()).toEqual({ gv_99: "stuck" });
      expect(store.getSnowballStage("art_bx1_14")).toBe(4);
      expect(store.getExpandedDecks()).toEqual(["VOL_BX1", "VOL_XB2"]);

      // Flush background IDB persistence and verify everything reached IndexedDB
      await store.flush();

      const dbCards = await getAllCardStates();
      expect(dbCards.find((c) => c.cardId === cardId)?.stability).toBe(30);
      const dbRecords = await getDailyRecords();
      expect(dbRecords.find((r) => r.date === today)).toEqual({
        date: today,
        count: 2,
        newLearned: 1
      });
      expect(await getAllBottlenecks()).toEqual({ art_bx1_12: [1, 3] });
      const dbSettings = await getAllSettings();
      expect(dbSettings.cram_ratings).toEqual({ gv_99: "stuck" });
      expect(dbSettings.snowball_stages).toEqual({ art_bx1_14: 4 });
      expect(dbSettings.expanded_decks).toEqual(["VOL_BX1", "VOL_XB2"]);

      // Reset snowball stage to 0 removes both settings entry and localStorage mirror
      store.setSnowballStage("art_bx1_14", 0);
      expect(store.getSnowballStage("art_bx1_14")).toBe(0);
      expect(fakeLocalStorage.getItem("snowball_stage_art_bx1_14")).toBeNull();

      unsub();
      store.dispose();
    });

    it("syncs external db.ts mutations (e.g. from SnowballView) and reloads on refreshFromDB", async () => {
      const store = new StudyStore();
      await store.hydrate();

      // Simulate SnowballView writing directly to db.ts
      await saveBottlenecks("art_xb1_07", [0, 2, 4]);
      await saveCardStatesBatch([makeCardState("fc_snowball_1"), makeCardState("fc_snowball_2")]);
      await recordSnowballCompletionLogs([makeReviewLog("fc_snowball_1", { source: "snowball", quotaIsolated: true })], true);

      const snap = store.getSnapshot();
      expect(snap.bottlenecks.get("art_xb1_07")).toEqual([0, 2, 4]);
      expect(snap.cards.has("fc_snowball_1")).toBe(true);
      expect(snap.cards.has("fc_snowball_2")).toBe(true);
      expect(snap.dailyRecords.get(getLocalDateString())?.snowballCount).toBe(1);

      // Import a v2 backup and verify refreshFromDB reloads the restored state
      await resetAllProgress();
      await store.refreshFromDB();
      expect(store.getSnapshot().cards.size).toBe(0);

      await importAllProgress({
        version: 2,
        exportTime: "2026-11-26T00:00:00.000Z",
        cards: [makeCardState("restored_card")],
        records: [{ date: "2026-11-26", count: 7, newLearned: 3 }],
        logs: [],
        bottlenecks: { art_bx1_12: [9] },
        settings: { sound_enabled: true },
        localPreferences: { cramRatings: { gv_3: "mastered" } }
      });

      await store.refreshFromDB();
      const restoredSnap = store.getSnapshot();
      expect(restoredSnap.cards.get("restored_card")?.cardId).toBe("restored_card");
      expect(restoredSnap.dailyRecords.get("2026-11-26")?.count).toBe(7);
      expect(restoredSnap.bottlenecks.get("art_bx1_12")).toEqual([9]);
      expect(store.getCramRatings()).toEqual({ gv_3: "mastered" });

      store.dispose();
    });
  });

  // ── 3. Regression Tests for Bug Fixes ─────────────────────────────────────

  describe("Regression fixes: db.ts & StudyStore concurrency, recovery & migration", () => {
    it("resets dbPromise on openDB rejection, terminated, and blocking (closing db)", async () => {
      // Ensure dbPromise is initialized and callbacks are captured
      const db1 = await getDB();
      expect(lastOpenDbCallbacks).toBeTruthy();

      // 1. blocking closes connection and resets dbPromise
      const callsBeforeBlocking = openDbCallCount;
      lastOpenDbCallbacks.blocking(1, 2, { target: db1 });
      expect(lastCreatedFakeDb.close).toHaveBeenCalled();

      const db2 = await getDB();
      expect(openDbCallCount).toBe(callsBeforeBlocking + 1);
      expect(db2).not.toBe(db1);

      // 2. terminated resets dbPromise so next getDB() reopens
      lastOpenDbCallbacks.terminated();

      // 3. openDB rejection resets dbPromise so future calls can retry cleanly
      nextOpenDbError = new Error("IDB open failed");
      await expect(getDB()).rejects.toThrow("IDB open failed");

      const callsBeforeRetry = openDbCallCount;
      const db3 = await getDB();
      expect(openDbCallCount).toBe(callsBeforeRetry + 1);
      expect(db3).toBeDefined();
    });

    it("writes log and daily_record inside a single readwrite transaction in recordReviewLog", async () => {
      const today = getLocalDateString();
      await recordReviewLog(makeReviewLog("fc_tx_1", { id: "log_tx_1", previousState: CardState.NEW }));
      expect(lastTxStores).toEqual(["logs", "daily_records"]);

      await recordReviewLog(makeReviewLog("fc_tx_2", { id: "log_tx_2", previousState: CardState.REVIEW }));
      expect(lastTxStores).toEqual(["logs", "daily_records"]);

      const records = await getDailyRecords();
      expect(records.find((r) => r.date === today)).toEqual({
        date: today,
        count: 2,
        newLearned: 1
      });
    });

    it("cleans stale snowball_stage_* keys and removes lastSession on null/undefined during full v2 restore", async () => {
      fakeLocalStorage.setItem("snowball_stage_art_stale", "5");
      fakeLocalStorage.setItem("snowball_stage_art_bx1_12", "2");
      fakeLocalStorage.setItem("wenyan_last_session", JSON.stringify({ view: "snowball", articleId: "art_bx1_12" }));

      // Full v2 restore with snowballStages only containing art_bx1_14 and no lastSession
      await importAllProgress({
        version: 2,
        exportTime: "2026-11-26T00:00:00.000Z",
        cards: [],
        records: [],
        logs: [],
        bottlenecks: {},
        settings: {},
        localPreferences: {
          snowballStages: { art_bx1_14: 4 }
        }
      });

      expect(fakeLocalStorage.getItem("snowball_stage_art_stale")).toBeNull();
      expect(fakeLocalStorage.getItem("snowball_stage_art_bx1_12")).toBeNull();
      expect(fakeLocalStorage.getItem("snowball_stage_art_bx1_14")).toBe("4");
      expect(fakeLocalStorage.getItem("wenyan_last_session")).toBeNull();

      // Also when lastSession is explicitly null
      fakeLocalStorage.setItem("wenyan_last_session", JSON.stringify({ view: "cram" }));
      await importAllProgress({
        version: 2,
        exportTime: "2026-11-26T00:00:00.000Z",
        cards: [],
        records: [],
        logs: [],
        bottlenecks: {},
        settings: {},
        localPreferences: {
          lastSession: null
        }
      });
      expect(fakeLocalStorage.getItem("wenyan_last_session")).toBeNull();
    });

    it("clears pre-existing stale cards, records, logs, bottlenecks, and settings during full v2 restore", async () => {
      await saveCardState(makeCardState("ghost_card"));
      await recordReviewLog(makeReviewLog("ghost_card", { id: "ghost_log" }));
      await saveBottlenecks("art_ghost", [0, 1]);
      await setSetting("ghost_setting", "should_be_removed");

      await importAllProgress({
        version: 2,
        exportTime: "2026-11-28T00:00:00.000Z",
        cards: [makeCardState("fresh_card")],
        records: [{ date: "2026-11-28", count: 3, newLearned: 1 }],
        logs: [makeReviewLog("fresh_card", { id: "fresh_log" })],
        bottlenecks: { art_bx1_12: [2] },
        settings: { selected_scope: "VOL_BX1" },
        localPreferences: {}
      });

      expect((await getAllCardStates()).map((c) => c.cardId)).toEqual(["fresh_card"]);
      expect((await getDailyRecords()).map((r) => r.date)).toEqual(["2026-11-28"]);
      expect((await getAllLogs()).map((l) => l.id)).toEqual(["fresh_log"]);
      expect(await getAllBottlenecks()).toEqual({ art_bx1_12: [2] });
      const settings = await getAllSettings();
      expect(settings.ghost_setting).toBeUndefined();
      expect(settings.selected_scope).toBe("VOL_BX1");
    });

    it("leaves hydrated=false on hydration failure so subsequent hydrate() retries succeed", async () => {
      const store = new StudyStore({ subscribeToDb: false });
      const db = await getDB();
      const origGetAll = db.getAll;
      let failOnce = true;
      db.getAll = async (name: StoreName) => {
        if (failOnce && name === "cards") {
          failOnce = false;
          throw new Error("Simulated IDB read error");
        }
        return origGetAll(name);
      };

      try {
        await store.hydrate();
        expect(store.getSnapshot().hydrated).toBe(false);
        expect(store.getSnapshot().hydrating).toBe(false);

        await store.hydrate();
        expect(store.getSnapshot().hydrated).toBe(true);
      } finally {
        db.getAll = origGetAll;
        store.dispose();
      }
    });

    it("preserves dirty optimistic mutations during hydrate/migration and accumulates daily deltas onto DB counts", async () => {
      const today = getLocalDateString();
      // Pre-populate DB with existing daily record & card
      fakeStores.daily_records.set(today, { date: today, count: 10, newLearned: 3 });
      await saveCardState(makeCardState("db_existing_card"));
      fakeLocalStorage.setItem("wenyan_cram_ratings", JSON.stringify({ gv_old: "stuck" }));

      getAllCardsDelayMs = 15;
      setSettingDelayMs = 15;

      const store = new StudyStore();
      const hydratePromise = store.hydrate();

      // Phase 1: optimistic mutations while Promise.all is awaiting
      store.upsertCard(makeCardState("dirty_during_load"));
      store.recordDailyActivity({ date: today, countDelta: 2, newLearnedDelta: 1 });

      // Wait until Promise.all finishes and migrateLegacyLocalStorage is awaiting setSetting
      await new Promise((r) => setTimeout(r, 20));
      store.setSettingValue("cram_ratings", { gv_new: "mastered" });
      store.setBottlenecks("art_bx1_12", [1, 2]);
      store.recordDailyActivity({ date: today, countDelta: 1, newLearnedDelta: 0 });

      await hydratePromise;
      await store.flush();

      const snap = store.getSnapshot();
      expect(snap.hydrated).toBe(true);
      expect(snap.cards.has("db_existing_card")).toBe(true);
      expect(snap.cards.has("dirty_during_load")).toBe(true);
      expect(snap.bottlenecks.get("art_bx1_12")).toEqual([1, 2]);
      expect(store.getCramRatings()).toEqual({ gv_new: "mastered" });
      // Must accumulate 10 + 2 + 1 = 13 (and 3 + 1 = 4) rather than overwriting DB with 0 + 3
      expect(snap.dailyRecords.get(today)).toEqual({
        date: today,
        count: 13,
        newLearned: 4
      });

      const dbDaily = await getDailyRecords();
      expect(dbDaily.find((r) => r.date === today)).toEqual({
        date: today,
        count: 13,
        newLearned: 4
      });

      store.dispose();
    });

    it("preserves dirty optimistic mutations occurring during refreshFromDB", async () => {
      const store = new StudyStore();
      await store.hydrate();

      getAllCardsDelayMs = 20;
      const refreshPromise = store.refreshFromDB();
      // Mutate optimistically while refreshFromDB is awaiting Promise.all
      await new Promise((r) => setTimeout(r, 5));
      store.upsertCard(makeCardState("dirty_during_refresh"));
      store.setSettingValue("expanded_decks", ["VOL_XB3"]);

      await refreshPromise;
      await store.flush();

      expect(store.getSnapshot().cards.has("dirty_during_refresh")).toBe(true);
      expect(store.getExpandedDecks()).toEqual(["VOL_XB3"]);
      store.dispose();
    });

    it("does not fall back to legacy localStorage once settings key exists or LOCAL_MIGRATED_V1 is true", async () => {
      const store = new StudyStore();
      await store.hydrate();

      // After hydration, LOCAL_MIGRATED_V1 is true
      expect(store.getSnapshot().settings.get("local_storage_migrated_v1")).toBe(true);

      // Inject stale legacy localStorage values after migration
      fakeLocalStorage.setItem("snowball_stage_art_bx1_12", "7");
      fakeLocalStorage.setItem("wenyan_cram_ratings", JSON.stringify({ gv_stale: "stuck" }));
      fakeLocalStorage.setItem("wenyan_anki_expanded_decks", JSON.stringify(["VOL_STALE"]));

      expect(store.getSnowballStage("art_bx1_12")).toBe(0);
      expect(store.getCramRatings()).toEqual({});
      expect(store.getExpandedDecks()).toEqual([]);

      // Also verify explicit settings keys (even when reset/empty) never fall back
      store.setSnowballStage("art_bx1_12", 4);
      store.setSnowballStage("art_bx1_12", 0);
      fakeLocalStorage.setItem("snowball_stage_art_bx1_12", "4");
      expect(store.getSnowballStage("art_bx1_12")).toBe(0);

      store.dispose();
    });
  });
});
