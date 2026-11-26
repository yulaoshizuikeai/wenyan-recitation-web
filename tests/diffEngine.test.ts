import { describe, it, expect } from "vitest";
import {
  normalizeScenarioText,
  isScenarioMatch,
  computeScenarioDiff,
  evaluateScenarioAnswer,
  extractKeyPointTarget,
  findFailedKeyPointIndices
} from "../src/domain/scenario/diffEngine";

describe("Scenario diffEngine", () => {
  describe("normalizeScenarioText", () => {
    it("strips common Chinese and English punctuation and spaces", () => {
      const raw = "君子曰：学不可以已。（荀子《劝学》）";
      expect(normalizeScenarioText(raw)).toBe("君子曰学不可以已荀子劝学");

      const withSpaces = "  白日 依山尽 ， 黄河 入海流 。 \n\t";
      expect(normalizeScenarioText(withSpaces)).toBe("白日依山尽黄河入海流");
    });

    it("handles brackets, quotes, and punctuation variations", () => {
      const complex = "“非生而知之者”，『孰能无惑』？【师说】";
      expect(normalizeScenarioText(complex)).toBe("非生而知之者孰能无惑师说");
    });
  });

  describe("isScenarioMatch", () => {
    it("returns true when text matches exactly or only differs in punctuation/spacing", () => {
      const expected = "青，取之于蓝，而青于蓝；冰，水为之，而寒于水。";
      const inputWithDifferentPunct = "青取之于蓝而青于蓝冰水为之而寒于水";
      expect(isScenarioMatch(inputWithDifferentPunct, expected)).toBe(true);

      const inputWithSpaces = "青， 取之于蓝 ，而青于蓝 ； 冰，水为之 ，而寒于水 。";
      expect(isScenarioMatch(inputWithSpaces, expected)).toBe(true);
    });

    it("returns false when characters differ, are missing, or extra", () => {
      const expected = "落霞与孤鹜齐飞，秋水共长天一色。";
      expect(isScenarioMatch("落霞与孤鸟齐飞，秋水共长天一色。", expected)).toBe(false);
      expect(isScenarioMatch("落霞与齐飞，秋水共长天一色。", expected)).toBe(false);
      expect(isScenarioMatch("落霞与孤鹜一起齐飞，秋水共长天一色。", expected)).toBe(false);
    });
  });

  describe("computeScenarioDiff (Levenshtein alignment)", () => {
    it("marks all characters as 'correct' on exact match", () => {
      const expected = "千里之行始于足下";
      const diff = computeScenarioDiff("千里之行始于足下", expected);

      expect(diff).toHaveLength(8);
      diff.forEach(item => {
        expect(item.status).toBe("correct");
      });
      expect(diff.map(d => d.char).join("")).toBe("千里之行始于足下");
    });

    it("identifies substituted character as 'wrong' with expected character", () => {
      const expected = "学而不思则罔";
      const input = "学而不思则惘"; // 罔 -> 惘 (typo)
      const diff = computeScenarioDiff(input, expected);

      expect(diff).toHaveLength(6);
      expect(diff[0].status).toBe("correct");
      expect(diff[5]).toEqual({
        char: "惘",
        expected: "罔",
        status: "wrong"
      });
    });

    it("preserves subsequent alignment when a character is missing at the beginning without shifting", () => {
      const expected = "海内存知己天涯若比邻";
      // Missing first character "海"
      const input = "内存知己天涯若比邻";
      const diff = computeScenarioDiff(input, expected);

      // First token is missing "海"
      expect(diff[0]).toEqual({
        char: "_",
        expected: "海",
        status: "missing"
      });

      // Subsequent characters are all correctly aligned!
      const subsequent = diff.slice(1);
      expect(subsequent).toHaveLength(9);
      subsequent.forEach(item => {
        expect(item.status).toBe("correct");
      });
      expect(subsequent.map(d => d.char).join("")).toBe("内存知己天涯若比邻");
    });

    it("preserves subsequent alignment when a character is missing in the middle", () => {
      const expected = "山重水复疑无路柳暗花明又一村";
      // Missing "水" at index 2
      const input = "山重复疑无路柳暗花明又一村";
      const diff = computeScenarioDiff(input, expected);

      expect(diff[0].status).toBe("correct"); // 山
      expect(diff[1].status).toBe("correct"); // 重
      expect(diff[2]).toEqual({ char: "_", expected: "水", status: "missing" });
      expect(diff[3].char).toBe("复");
      expect(diff[3].status).toBe("correct"); // 复 is NOT shifted to wrong!
    });

    it("identifies extra characters inserted without shifting following correct characters", () => {
      const expected = "会当凌绝顶一览众山小";
      // Extra "大" inserted between "顶" and "一"
      const input = "会当凌绝顶大一览众山小";
      const diff = computeScenarioDiff(input, expected);

      const extraItem = diff.find(d => d.status === "extra");
      expect(extraItem).toBeDefined();
      expect(extraItem?.char).toBe("大");

      // Verify surrounding correct items
      expect(diff[4]).toEqual({ char: "顶", status: "correct" });
      expect(diff[5]).toEqual({ char: "大", status: "extra" });
      expect(diff[6]).toEqual({ char: "一", status: "correct" });
    });

    it("handles mixed errors (substitution, missing, extra, correct) in one sentence", () => {
      const expected = "沉舟侧畔千帆过病树前头万木春";
      // "沉舟旁千帆过病树前头十万木春"
      // "侧畔" -> "旁" (missing one, wrong one), extra "十"
      const input = "沉舟旁千帆过病树前头十万木春";
      const diff = computeScenarioDiff(input, expected);

      expect(diff.some(d => d.status === "correct")).toBe(true);
      expect(diff.some(d => d.status === "missing")).toBe(true);
      expect(diff.some(d => d.status === "extra")).toBe(true);
    });

    it("handles empty user input against expected answer", () => {
      const expected = "无边落木萧萧下";
      const diff = computeScenarioDiff("", expected);

      expect(diff).toHaveLength(7);
      diff.forEach((d, idx) => {
        expect(d.status).toBe("missing");
        expect(d.expected).toBe(expected[idx]);
      });
    });
  });

  describe("evaluateScenarioAnswer", () => {
    it("returns correct metrics and isMatch flag for exact answer", () => {
      const summary = evaluateScenarioAnswer("大漠孤烟直，长河落日圆。", "大漠孤烟直，长河落日圆。");
      expect(summary.isMatch).toBe(true);
      expect(summary.correctCount).toBe(10);
      expect(summary.wrongCount).toBe(0);
      expect(summary.missingCount).toBe(0);
      expect(summary.extraCount).toBe(0);
    });

    it("accurately counts wrong, missing, and extra characters", () => {
      const expected = "东临碣石以观沧海"; // 8 chars
      // user: "东临借石以看沧海大"
      // 碣 -> 借 (wrong)
      // 观 -> 看 (wrong)
      // extra: "大"
      const summary = evaluateScenarioAnswer("东临借石以看沧海大", expected);
      expect(summary.isMatch).toBe(false);
      expect(summary.wrongCount).toBe(2);
      expect(summary.extraCount).toBe(1);
      expect(summary.correctCount).toBe(6);
      expect(summary.missingCount).toBe(0);
    });
  });

  describe("extractKeyPointTarget & findFailedKeyPointIndices", () => {
    it("extracts target keyword from keyPoint with parenthetical explanation", () => {
      expect(extractKeyPointTarget("生 (通假字，通‘性’，天资)")).toBe("生");
      expect(extractKeyPointTarget("輮以为轮 (通‘煣’)")).toBe("輮以为轮");
      expect(extractKeyPointTarget("生")).toBe("生");
    });

    it("returns empty array when user answer matches expected perfectly", () => {
      const ans = "君子生非异也，善假于物也。";
      const keyPoints = ["生 (通‘性’)", "假 (借助)"];
      expect(findFailedKeyPointIndices(ans, ans, keyPoints)).toEqual([]);
    });

    it("identifies failed keyPoint index when student makes typo in that keyPoint", () => {
      const expected = "君子生非异也善假于物也";
      // Mistyped "生" as "声"
      const user = "君子声非异也善假于物也";
      const keyPoints = ["生 (通‘性’)", "假 (借助)"];

      const failed = findFailedKeyPointIndices(user, expected, keyPoints);
      expect(failed).toEqual([0]); // Only keyPoint 0 ("生") failed
    });

    it("identifies failed keyPoint index when student omits the keyPoint characters", () => {
      const expected = "虽九死其犹未悔";
      // Omitted "犹"
      const user = "虽九死其未悔";
      const keyPoints = ["九死", "犹 (犹且，仍然)"];

      const failed = findFailedKeyPointIndices(user, expected, keyPoints);
      expect(failed).toEqual([1]); // "犹" was missing
    });

    it("handles keyPoints list being empty gracefully", () => {
      expect(findFailedKeyPointIndices("abc", "abd", [])).toEqual([]);
    });

    it("detects failure on a second occurrence of the same keyPoint in expectedAnswer", () => {
      const expected = "其生也荣，其生也哀。";
      const user = "其生也荣，其声也哀。";
      const failed = findFailedKeyPointIndices(user, expected, ["生"]);
      expect(failed).toEqual([0]);
    });

    it("aligns non-BMP surrogate-pair characters as single code points", () => {
      const expected = "甲𠀀乙";
      const user = "甲𠀁乙";
      const diff = computeScenarioDiff(user, expected);

      expect(diff).toEqual([
        { char: "甲", status: "correct" },
        { char: "𠀁", expected: "𠀀", status: "wrong" },
        { char: "乙", status: "correct" },
      ]);

      expect(findFailedKeyPointIndices(user, expected, ["𠀀"])).toEqual([0]);
      expect(findFailedKeyPointIndices(expected, expected, ["𠀀"])).toEqual([]);
    });
  });
});
