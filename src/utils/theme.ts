export type AppTheme = "light" | "dark";

const THEME_STORAGE_KEY = "wenyan_minimal_theme";

/**
 * Get current active theme
 */
export function getStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as AppTheme | null;
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  // Check system preference
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * Apply theme to document element
 */
export function applyTheme(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * Toggle theme between light and dark
 */
export function toggleTheme(current: AppTheme): AppTheme {
  const next: AppTheme = current === "light" ? "dark" : "light";
  applyTheme(next);
  return next;
}
