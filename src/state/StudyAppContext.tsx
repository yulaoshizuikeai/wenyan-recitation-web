/**
 * StudyAppContext — Phase 2.1 轻量应用状态层 + URL Hash 双向同步
 *
 * 集中管理全局应用状态，消除 App.tsx 的 Prop Drilling。
 * 支持浏览器前进/后退切换视图、刷新页面保留当前模式与篇目。
 *
 * 导出：
 *   - `StudyAppProvider` — 包裹在 `<App>` 外层的 Context Provider
 *   - `useStudyApp()` — 获取全局状态与 dispatch 的 Hook
 *   - `parseHashRoute` / `formatHashRoute` — 纯函数，可独立单测
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useId,
} from "react";
import {
  type NavView,
  VALID_NAV_VIEWS,
  type SessionExtra,
  type LastSessionState,
  getLastSession,
} from "../storage/sessionTracker";
import { type AppTheme, getStoredTheme, applyTheme } from "../utils/theme";
import { getSetting, setSetting, subscribeDbMutations } from "../storage/db";
import { hydrateStudyStore } from "../storage/studyStore";
import { ARTICLE_INDEX } from "../data/curriculumIndex";
import { sound } from "../sound/audioSynthesizer";

// ─── Re-exports for convenience ────────────────────────────────────────────────
export type { NavView, SessionExtra, LastSessionState, AppTheme };

// ─── Hash Route Parsing ────────────────────────────────────────────────────────

/** 从 URL hash 中解析出的路由信息 */
export interface HashRoute {
  view: NavView;
  articleId?: string;
}

/**
 * 视图名称到 hash path segment 的映射。
 * hash 格式：`#/<segment>` 或 `#/<segment>/<articleId>`
 */
const VIEW_TO_SEGMENT: Record<NavView, string> = {
  dashboard: "dashboard",
  snowball: "snowball",
  flipcard: "flipcard",
  cloze: "cloze",
  cram: "cram",
  scenario: "scenario",
  catalog: "catalog",
  settings: "settings",
};

const SEGMENT_TO_VIEW: Record<string, NavView> = Object.fromEntries(
  Object.entries(VIEW_TO_SEGMENT).map(([v, s]) => [s, v as NavView])
);

/** 需要 articleId 的视图 */
const ARTICLE_VIEWS = new Set<NavView>(["snowball", "cloze", "flipcard", "catalog"]);

/** 验证 articleId 是否存在于数据集中（惰性缓存） */
let _articleIdSet: Set<string> | null = null;
function isValidArticleId(id: string): boolean {
  if (!_articleIdSet) {
    _articleIdSet = new Set(ARTICLE_INDEX.map(a => a.id));
  }
  return _articleIdSet.has(id);
}

/**
 * 解析 URL hash 为路由信息。
 * 纯函数，可独立单测。
 *
 * @param hash — `location.hash`，例如 `"#/snowball/art_bx1_12"` 或 `""` 或 `"#/dashboard"`
 * @returns 解析出的 `HashRoute`；不合法时降级为 `{ view: "dashboard" }`
 *
 * @example
 * parseHashRoute("#/snowball/art_bx1_12") // { view: "snowball", articleId: "art_bx1_12" }
 * parseHashRoute("#/cram")                // { view: "cram" }
 * parseHashRoute("")                      // { view: "dashboard" }
 * parseHashRoute("#/unknown")             // { view: "dashboard" }
 */
export function parseHashRoute(hash: string): HashRoute {
  if (!hash || !hash.startsWith("#/")) {
    return { view: "dashboard" };
  }

  // "#/snowball/art_bx1_12" → ["snowball", "art_bx1_12"]
  const parts = hash.slice(2).split("/").filter(Boolean);
  const segment = parts[0]?.toLowerCase() ?? "";
  const view = SEGMENT_TO_VIEW[segment];

  if (!view) {
    return { view: "dashboard" };
  }

  // 解析可选的 articleId
  const rawArticleId = parts[1];
  if (rawArticleId && ARTICLE_VIEWS.has(view) && isValidArticleId(rawArticleId)) {
    return { view, articleId: rawArticleId };
  }

  return { view };
}

/**
 * 将视图和篇目 ID 格式化为 URL hash 字符串。
 * 纯函数，可独立单测。
 *
 * @example
 * formatHashRoute("snowball", "art_bx1_12") // "#/snowball/art_bx1_12"
 * formatHashRoute("cram")                   // "#/cram"
 * formatHashRoute("dashboard")              // "#/dashboard"
 */
export function formatHashRoute(view: NavView, articleId?: string): string {
  const segment = VIEW_TO_SEGMENT[view] ?? "dashboard";
  if (articleId && ARTICLE_VIEWS.has(view)) {
    return `#/${segment}/${articleId}`;
  }
  return `#/${segment}`;
}

// ─── Context Shape ──────────────────────────────────────────────────────────────

export interface StudyAppState {
  /** 当前活跃视图 */
  currentView: NavView;
  /** 教材范围筛选 */
  selectedScope: string;
  /** 当前活跃篇目 ID */
  activeArticleId: string;
  /** 恢复上次进度时的附加信息 */
  resumeExtra: SessionExtra | undefined;
  /** 应用主题：浅色 / 深色 */
  theme: AppTheme;
  /** 编钟音效开关 */
  soundEnabled: boolean;
  /** 快捷键帮助面板是否展开 */
  showShortcuts: boolean;
  /** Cmd/Ctrl + K 命令面板是否展开 */
  showCommandPalette: boolean;
  /** 当前打开的局部模态框数量 */
  localModalCount: number;
}

export interface StudyAppActions {
  /** 切换视图（同时更新 URL hash） */
  setCurrentView: (view: NavView) => void;
  /** 设置教材范围（持久化到 IndexedDB） */
  setSelectedScope: (scope: string) => void;
  /** 设置当前篇目 */
  setActiveArticleId: (id: string) => void;
  /** 设置恢复上次进度的附加信息 */
  setResumeExtra: (extra: SessionExtra | undefined) => void;
  /** 设置主题 */
  setTheme: (theme: AppTheme) => void;
  /** 切换音效开关 */
  toggleSound: () => void;
  /** 切换快捷键帮助面板 */
  toggleShortcuts: () => void;
  /** 设置快捷键帮助面板显示 */
  setShowShortcuts: (show: boolean) => void;
  /** 切换命令面板 */
  toggleCommandPalette: () => void;
  /** 设置命令面板显示 */
  setShowCommandPalette: (show: boolean) => void;
  /** 一次性导航到指定篇目+视图（常用于从典库/仪表盘/命令面板跳转） */
  navigateToArticle: (articleId: string, view: NavView, extra?: SessionExtra) => void;
  /** 注册/注销局部模态框打开状态，用于屏蔽全局快捷键 */
  registerModalOpen: (id: string, isOpen: boolean) => void;
  /** 一键进入闪卡高频卡壳急救队列 */
  startRescueFlipCard: () => void;
  /** 恢复上次学习会话 */
  resumeSession: (session: LastSessionState) => void;
}

export type StudyAppContextValue = StudyAppState & StudyAppActions;

const StudyAppContext = createContext<StudyAppContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────────

const DEFAULT_ARTICLE_ID = "art_bx1_12"; // 劝学

export interface StudyAppProviderProps {
  children: React.ReactNode;
}

export const StudyAppProvider: React.FC<StudyAppProviderProps> = ({ children }) => {
  // ── Derive initial state from URL hash (if any) ──
  const initialHashRef = useRef<string>(typeof window !== "undefined" ? window.location.hash : "");
  const initialRoute = useMemo(() => parseHashRoute(initialHashRef.current), []);

  const [currentView, setCurrentViewRaw] = useState<NavView>(initialRoute.view);
  const [selectedScope, setSelectedScopeRaw] = useState<string>("ALL");
  const [activeArticleId, setActiveArticleIdRaw] = useState<string>(() => {
    if (initialRoute.articleId) return initialRoute.articleId;
    const last = getLastSession();
    if (last?.articleId && isValidArticleId(last.articleId)) {
      return last.articleId;
    }
    return DEFAULT_ARTICLE_ID;
  });
  const [resumeExtra, setResumeExtra] = useState<SessionExtra | undefined>(undefined);
  const [theme, setThemeRaw] = useState<AppTheme>(() => getStoredTheme());
  const [soundEnabled, setSoundEnabledRaw] = useState<boolean>(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [localModalCount, setLocalModalCount] = useState(0);

  // 追踪最近一次主动写入的 hash，避免回声触发 onHashChange；允许浏览器立即后退/前进
  const lastSyncedHashRef = useRef<string | null>(null);
  const hasAutoResumedRef = useRef(false);
  const openModalIdsRef = useRef<Set<string>>(new Set());
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  // ── 恢复会话辅助函数 ──
  const resumeSession = useCallback((session: LastSessionState) => {
    if (!VALID_NAV_VIEWS.has(session.view)) {
      setCurrentViewRaw("dashboard");
      return;
    }
    if (session.articleId && isValidArticleId(session.articleId)) {
      setActiveArticleIdRaw(session.articleId);
    }
    setResumeExtra(session.extra);
    setCurrentViewRaw(session.view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── 初始化：预水合 StudyStore 并从 IndexedDB 加载持久化设置 ──
  useEffect(() => {
    let cancelled = false;
    void hydrateStudyStore();

    const syncSettingsFromDb = () => {
      getSetting<string>("selected_scope", "ALL")
        .then((val) => {
          if (!cancelled) setSelectedScopeRaw(val);
        })
        .catch(() => {});
      getSetting<boolean>("sound_enabled", false)
        .then((val) => {
          if (cancelled) return;
          soundEnabledRef.current = val;
          setSoundEnabledRaw(val);
          sound.enabled = val;
        })
        .catch(() => {});
    };

    syncSettingsFromDb();

    const unsubscribeDb = subscribeDbMutations((event) => {
      if (event.type === "setting") {
        if (event.key === "selected_scope" && typeof event.value === "string") {
          setSelectedScopeRaw(event.value);
        } else if (event.key === "sound_enabled" && typeof event.value === "boolean") {
          soundEnabledRef.current = event.value;
          setSoundEnabledRaw(event.value);
          sound.enabled = event.value;
        }
      } else if (event.type === "reset") {
        setSelectedScopeRaw("ALL");
        soundEnabledRef.current = false;
        setSoundEnabledRaw(false);
        sound.enabled = false;
      } else if (event.type === "import") {
        syncSettingsFromDb();
      }
    });

    // 仅当用户直接打开根路径或 #/dashboard 时才触发启动自动恢复，避免覆盖刷新/深链 Hash
    if (!hasAutoResumedRef.current) {
      hasAutoResumedRef.current = true;
      const rawHash = initialHashRef.current;
      const isLandingRoot = !rawHash || rawHash === "#" || rawHash === "#/" || rawHash === "#/dashboard";
      if (isLandingRoot) {
        getSetting<boolean>("auto_resume_on_startup", false).then(autoResume => {
          if (cancelled) return;
          if (autoResume) {
            const session = getLastSession();
            if (session && session.view !== "dashboard") {
              resumeSession(session);
            }
          }
        }).catch(() => {});
      }
    }

    return () => {
      cancelled = true;
      unsubscribeDb();
    };
  }, [resumeSession]);

  // ── Theme side-effect ──
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // ── URL Hash → State（浏览器前进/后退） ──
  useEffect(() => {
    const onHashChange = () => {
      if (lastSyncedHashRef.current !== null && window.location.hash === lastSyncedHashRef.current) {
        lastSyncedHashRef.current = null;
        return;
      }
      lastSyncedHashRef.current = null;
      const route = parseHashRoute(window.location.hash);
      setCurrentViewRaw(route.view);
      if (route.articleId) {
        setActiveArticleIdRaw(route.articleId);
      }
      // 通过 hash 切换视图时清除 resumeExtra
      setResumeExtra(undefined);
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // ── State → URL Hash（同步写出） ──
  const syncHashToUrl = useCallback((view: NavView, articleId?: string) => {
    const newHash = formatHashRoute(view, ARTICLE_VIEWS.has(view) ? articleId : undefined);
    if (window.location.hash !== newHash) {
      lastSyncedHashRef.current = newHash;
      window.location.hash = newHash;
    }
  }, []);

  // 每当 currentView 或 activeArticleId 变化时，同步到 URL Hash
  useEffect(() => {
    syncHashToUrl(currentView, activeArticleId);
  }, [currentView, activeArticleId, syncHashToUrl]);

  // ── Actions ──

  const setCurrentView = useCallback((view: NavView) => {
    if (!VALID_NAV_VIEWS.has(view)) return;
    setResumeExtra(undefined);
    setCurrentViewRaw(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const setSelectedScope = useCallback((scope: string) => {
    setSelectedScopeRaw(scope);
    void setSetting("selected_scope", scope);
  }, []);

  const setActiveArticleId = useCallback((id: string) => {
    if (!isValidArticleId(id)) return;
    setActiveArticleIdRaw(id);
  }, []);

  const setTheme = useCallback((t: AppTheme) => {
    setThemeRaw(t);
    // applyTheme 由 useEffect 驱动
  }, []);

  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabledRaw(next);
    sound.enabled = next;
    void setSetting("sound_enabled", next);
  }, []);

  const toggleShortcuts = useCallback(() => {
    setShowShortcuts(prev => !prev);
  }, []);

  const toggleCommandPalette = useCallback(() => {
    setShowCommandPalette(prev => !prev);
  }, []);

  const navigateToArticle = useCallback((articleId: string, view: NavView, extra?: SessionExtra) => {
    if (isValidArticleId(articleId)) {
      setActiveArticleIdRaw(articleId);
    }
    setResumeExtra(extra);
    setCurrentViewRaw(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const registerModalOpen = useCallback((id: string, isOpen: boolean) => {
    const set = openModalIdsRef.current;
    const prevSize = set.size;
    if (isOpen) {
      set.add(id);
    } else {
      set.delete(id);
    }
    if (set.size !== prevSize) {
      setLocalModalCount(set.size);
    }
  }, []);

  const startRescueFlipCard = useCallback(() => {
    setResumeExtra({ queueMode: "rescue" });
    setCurrentViewRaw("flipcard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ── Context Value ──
  const value = useMemo<StudyAppContextValue>(() => ({
    // State
    currentView,
    selectedScope,
    activeArticleId,
    resumeExtra,
    theme,
    soundEnabled,
    showShortcuts,
    showCommandPalette,
    localModalCount,
    // Actions
    setCurrentView,
    setSelectedScope,
    setActiveArticleId,
    setResumeExtra,
    setTheme,
    toggleSound,
    toggleShortcuts,
    setShowShortcuts,
    toggleCommandPalette,
    setShowCommandPalette,
    navigateToArticle,
    registerModalOpen,
    startRescueFlipCard,
    resumeSession,
  }), [
    currentView,
    selectedScope,
    activeArticleId,
    resumeExtra,
    theme,
    soundEnabled,
    showShortcuts,
    showCommandPalette,
    localModalCount,
    setCurrentView,
    setSelectedScope,
    setActiveArticleId,
    setTheme,
    toggleSound,
    toggleShortcuts,
    toggleCommandPalette,
    navigateToArticle,
    registerModalOpen,
    startRescueFlipCard,
    resumeSession,
  ]);

  return (
    <StudyAppContext.Provider value={value}>
      {children}
    </StudyAppContext.Provider>
  );
};

// ─── Consumer Hook ──────────────────────────────────────────────────────────────

/**
 * 获取全局应用状态与操作（若不在 Provider 内则返回 null，用于组件兼容独立渲染）。
 */
export function useOptionalStudyApp(): StudyAppContextValue | null {
  return useContext(StudyAppContext);
}

/**
 * 向 StudyAppContext 注册局部模态框的打开状态，防止后台全局快捷键误触发。
 * 在无 Provider 的独立测试/渲染环境中安全降级为 no-op。
 */
export function useRegisterModalOpen(isOpen: boolean): void {
  const appCtx = useOptionalStudyApp();
  const modalId = useId();
  const registerModalOpen = appCtx?.registerModalOpen;

  useEffect(() => {
    if (!registerModalOpen) return;
    registerModalOpen(modalId, isOpen);
    return () => {
      registerModalOpen(modalId, false);
    };
  }, [registerModalOpen, modalId, isOpen]);
}

/**
 * 获取全局应用状态与操作。
 * 必须在 `<StudyAppProvider>` 内部使用。
 *
 * @example
 * ```tsx
 * const { currentView, setCurrentView, theme, toggleSound } = useStudyApp();
 * ```
 */
export function useStudyApp(): StudyAppContextValue {
  const ctx = useContext(StudyAppContext);
  if (!ctx) {
    throw new Error(
      "useStudyApp() 必须在 <StudyAppProvider> 内部使用。请确保在组件树顶层包裹了 StudyAppProvider。"
    );
  }
  return ctx;
}
