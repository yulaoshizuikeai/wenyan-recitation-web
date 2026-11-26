import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseHashRoute, formatHashRoute, useRegisterModalOpen } from "../src/state/StudyAppContext";
import {
  saveLastSession,
  getLastSession,
  clearLastSession,
  type SessionExtra
} from "../src/storage/sessionTracker";
import { ALL_ARTICLES } from "../src/data/curriculumData";

describe("URL Hash Route Synchronization (parseHashRoute & formatHashRoute)", () => {
  const validArticleId = ALL_ARTICLES[0].id; // e.g. "art_bx1_01"

  describe("parseHashRoute", () => {
    it("parses valid routes without articleId", () => {
      expect(parseHashRoute("#/dashboard")).toEqual({ view: "dashboard" });
      expect(parseHashRoute("#/cram")).toEqual({ view: "cram" });
      expect(parseHashRoute("#/scenario")).toEqual({ view: "scenario" });
      expect(parseHashRoute("#/settings")).toEqual({ view: "settings" });
    });

    it("parses valid routes with valid articleId for article-centric views", () => {
      expect(parseHashRoute(`#/snowball/${validArticleId}`)).toEqual({
        view: "snowball",
        articleId: validArticleId
      });
      expect(parseHashRoute(`#/cloze/${validArticleId}`)).toEqual({
        view: "cloze",
        articleId: validArticleId
      });
      expect(parseHashRoute(`#/flipcard/${validArticleId}`)).toEqual({
        view: "flipcard",
        articleId: validArticleId
      });
      expect(parseHashRoute(`#/catalog/${validArticleId}`)).toEqual({
        view: "catalog",
        articleId: validArticleId
      });
    });

    it("falls back to view without articleId if articleId does not exist in curriculum data", () => {
      expect(parseHashRoute("#/snowball/non_existent_article_id")).toEqual({
        view: "snowball"
      });
      expect(parseHashRoute("#/cloze/invalid_12345")).toEqual({
        view: "cloze"
      });
    });

    it("omits articleId for views that do not take articleId in their route", () => {
      expect(parseHashRoute(`#/cram/${validArticleId}`)).toEqual({
        view: "cram"
      });
      expect(parseHashRoute(`#/dashboard/${validArticleId}`)).toEqual({
        view: "dashboard"
      });
      expect(parseHashRoute(`#/settings/${validArticleId}`)).toEqual({
        view: "settings"
      });
    });

    it("falls back to dashboard for empty, missing, or malformed hashes", () => {
      expect(parseHashRoute("")).toEqual({ view: "dashboard" });
      expect(parseHashRoute("#")).toEqual({ view: "dashboard" });
      expect(parseHashRoute("dashboard")).toEqual({ view: "dashboard" });
      expect(parseHashRoute("#unknown")).toEqual({ view: "dashboard" });
      expect(parseHashRoute("#/unknown_view")).toEqual({ view: "dashboard" });
      expect(parseHashRoute("#/foobar/123")).toEqual({ view: "dashboard" });
    });

    it("handles trailing slashes gracefully", () => {
      expect(parseHashRoute("#/dashboard/")).toEqual({ view: "dashboard" });
      expect(parseHashRoute(`#/snowball/${validArticleId}/`)).toEqual({
        view: "snowball",
        articleId: validArticleId
      });
    });
  });

  describe("formatHashRoute", () => {
    it("formats simple view routes correctly", () => {
      expect(formatHashRoute("dashboard")).toBe("#/dashboard");
      expect(formatHashRoute("cram")).toBe("#/cram");
      expect(formatHashRoute("scenario")).toBe("#/scenario");
      expect(formatHashRoute("settings")).toBe("#/settings");
    });

    it("formats view routes with articleId for article-centric views", () => {
      expect(formatHashRoute("snowball", validArticleId)).toBe(`#/snowball/${validArticleId}`);
      expect(formatHashRoute("cloze", validArticleId)).toBe(`#/cloze/${validArticleId}`);
      expect(formatHashRoute("flipcard", validArticleId)).toBe(`#/flipcard/${validArticleId}`);
      expect(formatHashRoute("catalog", validArticleId)).toBe(`#/catalog/${validArticleId}`);
    });

    it("omits articleId when formatted for non-article views", () => {
      expect(formatHashRoute("dashboard", validArticleId)).toBe("#/dashboard");
      expect(formatHashRoute("cram", validArticleId)).toBe("#/cram");
      expect(formatHashRoute("scenario", validArticleId)).toBe("#/scenario");
      expect(formatHashRoute("settings", validArticleId)).toBe("#/settings");
    });

    it("supports round-trip parse and format consistency", () => {
      const routes: Array<{ view: any; articleId?: string }> = [
        { view: "dashboard" },
        { view: "snowball", articleId: validArticleId },
        { view: "cloze", articleId: validArticleId },
        { view: "flipcard", articleId: validArticleId },
        { view: "cram" },
        { view: "scenario" },
        { view: "catalog", articleId: validArticleId },
        { view: "settings" }
      ];

      for (const route of routes) {
        const hash = formatHashRoute(route.view, route.articleId);
        const parsed = parseHashRoute(hash);
        expect(parsed).toEqual(route);
      }
    });
  });

  describe("SessionExtra extensions & StudyAppContext exports", () => {
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

    beforeEach(() => {
      const storage = new FakeStorage();
      const fakeWindow = {
        localStorage: storage,
        dispatchEvent: vi.fn()
      };
      vi.stubGlobal("localStorage", storage);
      vi.stubGlobal("window", fakeWindow);
      vi.stubGlobal(
        "CustomEvent",
        class FakeCustomEvent<T = unknown> {
          type: string;
          detail: T;
          constructor(type: string, init?: { detail?: T }) {
            this.type = type;
            this.detail = init?.detail as T;
          }
        }
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("exports useRegisterModalOpen hook from StudyAppContext", () => {
      expect(typeof useRegisterModalOpen).toBe("function");
    });

    it("preserves extended SessionExtra fields (deckId, autoStart, filterArticleOnly) in sessionTracker", () => {
      const extra: SessionExtra = {
        queueMode: "deck",
        deckId: "VOL_BX1",
        autoStart: true,
        filterArticleOnly: true,
        cardIndex: 3
      };

      saveLastSession({
        view: "flipcard",
        articleId: validArticleId,
        modeName: "翻转闪卡",
        progressText: "选册排程 · 卡片 4 / 20",
        progressPercent: 20,
        updatedAt: 1770000000000,
        extra
      });

      const loaded = getLastSession();
      expect(loaded).not.toBeNull();
      expect(loaded?.extra).toEqual(extra);

      clearLastSession();
      expect(getLastSession()).toBeNull();
    });
  });
});
