import React, { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { NAV_SHORTCUT_ORDER } from "./Navbar";
import { useOptionalStudyApp } from "../state/StudyAppContext";

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

const MODE_SHORTCUTS: { group: string; items: { keys: string; label: string }[] }[] = [
  {
    group: "长卷滚雪球",
    items: [
      { keys: "Space", label: "下一联" },
      { keys: "←", label: "上一联" },
      { keys: "B", label: "标记卡壳" },
      { keys: "M", label: "前文遮挡/全览" }
    ]
  },
  {
    group: "牌组闪卡",
    items: [
      { keys: "Space", label: "翻卡" },
      { keys: "1 / 2 / 3 / 4", label: "评分（重来 / 困难 / 良好 / 简单）" }
    ]
  },
  {
    group: "渐进遮挡",
    items: [
      { keys: "← / →", label: "降低 / 提高遮挡等级" },
      { keys: "R", label: "全览 / 恢复遮挡" }
    ]
  },
  {
    group: "考前抱佛脚",
    items: [
      { keys: "Space", label: "翻句" },
      { keys: "← / →", label: "上一条 / 下一条" },
      { keys: "1 / 2 / 3", label: "卡壳 / 存疑 / 已过关" }
    ]
  },
  {
    group: "高考情境默写",
    items: [
      { keys: "Enter", label: "提交核对 / 下一题" }
    ]
  }
];

/**
 * 全站快捷键帮助浮层，PC 端按 ? 打开。
 */
export const ShortcutHelp: React.FC<ShortcutHelpProps> = ({ open, onClose }) => {
  const appCtx = useOptionalStudyApp();
  const isCommandPaletteOpen = Boolean(appCtx?.showCommandPalette);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !isCommandPaletteOpen) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open, onClose, isCommandPaletteOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <Keyboard className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">键盘快捷键</h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">在输入框外按下即可生效</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <h4 className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 mb-2">全局导航</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {NAV_SHORTCUT_ORDER.map(item => (
                <div key={item.view} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-zinc-600 dark:text-zinc-300">{item.label}</span>
                  <kbd className="kbd shrink-0">Alt + {item.key}</kbd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-600 dark:text-zinc-300">全局命令面板</span>
                <kbd className="kbd shrink-0">Ctrl / Cmd + K</kbd>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-600 dark:text-zinc-300">打开/关闭本面板</span>
                <kbd className="kbd shrink-0">?</kbd>
              </div>
            </div>
          </section>

          {MODE_SHORTCUTS.map(section => (
            <section key={section.group}>
              <h4 className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 mb-2">
                {section.group}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {section.items.map(item => (
                  <div key={item.keys + item.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-600 dark:text-zinc-300">{item.label}</span>
                    <kbd className="kbd shrink-0">{item.keys}</kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
