/**
 * useWorkspaceShortcuts — Phase 2.2 统一全局快捷键调度
 *
 * 集中处理全站键盘快捷键，消除各视图重复的 `window.addEventListener("keydown", ...)` 监听。
 *
 * 功能：
 *   1. INPUT / TEXTAREA / contentEditable 自动屏蔽（输入态不触发快捷键）
 *   2. 弹窗打开时冻结快捷键（仅保留 Esc 关闭弹窗）
 *   3. `?` 切换快捷键帮助面板
 *   4. `Cmd/Ctrl + K` 切换命令面板
 *   5. `Alt + 1~8` 切换视图（与修饰键隔离，不与 Ctrl / Cmd 冲突）
 *
 * @example
 * ```tsx
 * useWorkspaceShortcuts({
 *   onToggleShortcuts: () => setShowShortcuts(prev => !prev),
 *   onToggleCommandPalette: () => setShowCommandPalette(prev => !prev),
 *   onSwitchView: (view) => setCurrentView(view),
 *   isModalOpen: showShortcuts || showCommandPalette,
 * });
 * ```
 */

import { useEffect } from "react";
import type { NavView } from "../storage/sessionTracker";

/** Alt + 数字快捷键映射表 */
const ALT_DIGIT_TO_VIEW: Record<string, NavView> = {
  "1": "dashboard",
  "2": "snowball",
  "3": "flipcard",
  "4": "cloze",
  "5": "cram",
  "6": "scenario",
  "7": "catalog",
  "8": "settings",
};

export interface UseWorkspaceShortcutsOptions {
  /** 切换快捷键帮助面板 */
  onToggleShortcuts: () => void;
  /** 切换命令面板 */
  onToggleCommandPalette: () => void;
  /** 切换视图（Alt + 1~8） */
  onSwitchView: (view: NavView) => void;
  /**
   * 任意弹窗/模态框是否处于打开状态。
   * 打开时冻结所有快捷键（除 Esc）。
   */
  isModalOpen?: boolean;
}

/**
 * 检测事件目标是否为文本输入元素。
 * 输入态时不拦截快捷键，让用户正常输入。
 */
function isTextInputTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function useWorkspaceShortcuts({
  onToggleShortcuts,
  onToggleCommandPalette,
  onSwitchView,
  isModalOpen = false,
}: UseWorkspaceShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ── Cmd/Ctrl + K：命令面板（即使在模态框中也允许切换） ──
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !e.altKey) {
        e.preventDefault();
        onToggleCommandPalette();
        return;
      }

      // ── 输入框中不拦截其他快捷键 ──
      if (isTextInputTarget(e)) return;

      // ── 弹窗打开时冻结所有非系统快捷键 ──
      if (isModalOpen) return;

      // ── ? — 快捷键帮助面板 ──
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        onToggleShortcuts();
        return;
      }

      // ── Alt + 数字 — 视图切换 ──
      // 仅 Alt 修饰键生效，不与 Ctrl / Cmd / Shift 组合
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const digit = e.code.startsWith("Digit") ? e.code.slice(5) : "";
        const view = ALT_DIGIT_TO_VIEW[digit];
        if (view) {
          e.preventDefault();
          onSwitchView(view);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onToggleShortcuts, onToggleCommandPalette, onSwitchView, isModalOpen]);
}
