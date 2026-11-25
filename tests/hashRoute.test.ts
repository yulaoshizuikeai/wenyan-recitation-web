import { describe, it, expect } from "vitest";
import { parseHashRoute, formatHashRoute } from "../src/state/StudyAppContext";
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
});
