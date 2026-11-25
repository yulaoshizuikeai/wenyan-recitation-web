import { openDB, DBSchema, IDBPDatabase } from "idb";
import { CardFsrsState, ReviewLog, Rating } from "../domain/fsrs/fsrsTypes";
import { getLocalDateString } from "../utils/date";

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
    value: { date: string; count: number; newLearned: number; snowballCount?: number };
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

let dbPromise: Promise<IDBPDatabase<WenYanDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<WenYanDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WenYanDB>(DB_NAME, DB_VERSION, {
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
      }
    });
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
}

export async function saveCardStatesBatch(cards: CardFsrsState[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("cards", "readwrite");
  for (const c of cards) {
    await tx.store.put(c);
  }
  await tx.done;
}

export async function recordReviewLog(log: ReviewLog): Promise<void> {
  const db = await getDB();
  const id = `${log.cardId}_${log.reviewTime}_${Math.random().toString(36).slice(2, 6)}`;
  await db.put("logs", { ...log, id });

  // Quota-isolated logs (e.g. snowball completion) must not consume flashcard daily quotas.
  if (log.quotaIsolated || log.source === "snowball") {
    return;
  }

  // Update today's record
  const todayStr = getLocalDateString();
  const existing = (await db.get("daily_records", todayStr)) || { date: todayStr, count: 0, newLearned: 0 };
  existing.count += 1;
  if (log.previousState === 0) {
    existing.newLearned += 1;
  }
  await db.put("daily_records", existing);
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

  if (recordDailyActivity) {
    const todayStr = getLocalDateString();
    const recordStore = tx.objectStore("daily_records");
    const existing = (await recordStore.get(todayStr)) || { date: todayStr, count: 0, newLearned: 0 };
    existing.count += 1;
    existing.snowballCount = (existing.snowballCount ?? 0) + 1;
    await recordStore.put(existing);
  }

  await tx.done;
}

export async function getDailyRecords(): Promise<{ date: string; count: number; newLearned: number; snowballCount?: number }[]> {
  const db = await getDB();
  return db.getAll("daily_records");
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await getDB();
  const val = await db.get("settings", key);
  return val !== undefined ? val : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put("settings", value, key);
}

export async function getBottlenecks(articleId: string): Promise<number[]> {
  const db = await getDB();
  const res = await db.get("bottlenecks", articleId);
  return res ? res.indices : [];
}

export async function saveBottlenecks(articleId: string, indices: number[]): Promise<void> {
  const db = await getDB();
  await db.put("bottlenecks", { articleId, indices });
}

export interface BackupData {
  version?: string;
  exportTime?: string;
  cards: CardFsrsState[];
  records: { date: string; count: number; newLearned: number; snowballCount?: number }[];
}

export async function importAllProgress(
  data: BackupData
): Promise<{ cardsImported: number; recordsImported: number }> {
  if (!data || typeof data !== "object" || !Array.isArray(data.cards) || !Array.isArray(data.records)) {
    throw new Error("无效的备份文件格式：缺少 cards 或 records 数组");
  }

  const db = await getDB();
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
  return { cardsImported, recordsImported };
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

  if (typeof window !== "undefined" && window.localStorage) {
    localStorage.removeItem("wenyan_last_session");
    localStorage.removeItem("wenyan_cram_ratings");
    localStorage.removeItem("wenyan_anki_expanded_decks");
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("snowball_stage_")) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}
