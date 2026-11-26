import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";

/**
 * 温和的 PWA 离线更新提示条：
 * 仅在检测到新版本 Service Worker 就绪时在右下角轻量浮现，
 * 不打断当前背诵，由用户主动点击刷新。
 */
export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-4 py-3 shadow-lg flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-200"
    >
      <div className="flex-1 space-y-0.5">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">
          发现新版本内容
        </p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          已缓存完毕，可随时刷新应用（不影响当前背诵进度）。
        </p>
      </div>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 px-2.5 py-1.5 font-medium hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>立即刷新</span>
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="稍后提醒"
        className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors shrink-0 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
