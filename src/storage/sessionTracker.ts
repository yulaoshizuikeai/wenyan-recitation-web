import { useState, useEffect, useCallback } from "react";
import { setSetting, getSetting } from "./db";

export type NavView = "dashboard" | "cram" | "snowball" | "flipcard" | "cloze" | "scenario" | "catalog" | "settings";

export const VALID_NAV_VIEWS = new Set<string>([
  "dashboard",
  "cram",
  "snowball",
  "flipcard",
  "cloze",
  "scenario",
  "catalog",
  "settings"
]);

export const SESSION_STORAGE_KEY = "wenyan_last_session";
export const SESSION_UPDATED_EVENT = "wenyan_session_updated";

export interface SessionExtra {
  stageIndex?: number;
  totalStages?: number;
  clozeLevel?: number;
  queueMode?: string;
  cardIndex?: number;
  totalCards?: number;
  goldenVerseIndex?: number;
  activeModule?: string;
  viewStyle?: "card" | "list";
  scenarioQuestionIndex?: number;
  scrollTop?: number;
  [key: string]: any;
}

export interface LastSessionState {
  view: NavView;
  articleId?: string;
  articleTitle?: string;
  articleAuthor?: string;
  articleDynasty?: string;
  modeName: string;
  progressText: string;
  progressPercent: number; // 0 - 100
  updatedAt: number; // epoch ms
  extra?: SessionExtra;
}

/**
 * Retrieve the last active study session from localStorage.
 * Returns null if not found or corrupted.
 */
export function getLastSession(): LastSessionState | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.view || !VALID_NAV_VIEWS.has(parsed.view)) {
      return null;
    }
    return parsed as LastSessionState;
  } catch (e) {
    console.warn("Failed to load last session from localStorage", e);
    return null;
  }
}

/**
 * Save the user's latest study session.
 * Writes synchronously to localStorage for zero-latency retrieval,
 * asynchronously mirrors to IndexedDB for backup,
 * and notifies active components via a CustomEvent.
 */
export function saveLastSession(session: LastSessionState): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const serialized = JSON.stringify(session);
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);

    // Asynchronously back up to IndexedDB settings store
    setSetting("last_session", session).catch(() => {});

    // Dispatch custom event for reactive UI updates across all listening views
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT, { detail: session }));
  } catch (e) {
    console.warn("Failed to save last session", e);
  }
}

/**
 * Remove the last session record.
 */
export function clearLastSession(): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    localStorage.removeItem(SESSION_STORAGE_KEY);

    // Also clear from IndexedDB
    setSetting("last_session", null).catch(() => {});

    // Dispatch event
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED_EVENT, { detail: null }));
  } catch (e) {
    console.warn("Failed to clear last session", e);
  }
}

/**
 * Human-friendly Chinese relative time formatting.
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return "近期";
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) {
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `昨天 ${hh}:${mm}`;
  }
  if (diffDay < 7) return `${diffDay} 天前`;

  const d = new Date(timestamp);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}月${day}日`;
}

/**
 * Return human-readable label for each view.
 */
export function getModeDisplayName(view: NavView): string {
  switch (view) {
    case "snowball":
      return "长卷滚雪球";
    case "flipcard":
      return "翻转闪卡";
    case "cloze":
      return "渐进遮挡";
    case "cram":
      return "考前抱佛脚";
    case "scenario":
      return "高考默写";
    case "catalog":
      return "诗文典库";
    case "dashboard":
      return "研习概览";
    default:
      return "研习进度";
  }
}

/**
 * React hook to observe and update the last session reactively.
 */
export function useLastSession() {
  const [session, setSession] = useState<LastSessionState | null>(() => getLastSession());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<LastSessionState | null>;
      setSession(customEvent.detail !== undefined ? customEvent.detail : getLastSession());
    };

    window.addEventListener(SESSION_UPDATED_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener(SESSION_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const save = useCallback((s: LastSessionState) => {
    saveLastSession(s);
  }, []);

  const clear = useCallback(() => {
    clearLastSession();
  }, []);

  return {
    lastSession: session,
    saveSession: save,
    clearSession: clear,
    refreshSession: () => setSession(getLastSession())
  };
}
