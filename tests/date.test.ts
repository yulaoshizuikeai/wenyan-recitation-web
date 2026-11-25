import { describe, it, expect } from "vitest";
import { getLocalDateString } from "../src/utils/date";

describe("getLocalDateString", () => {
  it("returns YYYY-MM-DD formatted string for current date when called with no arguments", () => {
    const result = getLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(result).toBe(expected);
  });

  it("pads single-digit month and day with leading zeroes", () => {
    // 2026-03-05
    const d1 = new Date(2026, 2, 5, 10, 30, 0);
    expect(getLocalDateString(d1)).toBe("2026-03-05");

    // 2026-01-09
    const d2 = new Date(2026, 0, 9, 8, 0, 0);
    expect(getLocalDateString(d2)).toBe("2026-01-09");
  });

  it("handles local midnight boundaries (00:00:00 vs 23:59:59)", () => {
    // Start of day
    const startOfDay = new Date(2026, 10, 25, 0, 0, 0, 0); // 2026-11-25 00:00:00
    expect(getLocalDateString(startOfDay)).toBe("2026-11-25");

    // End of day
    const endOfDay = new Date(2026, 10, 25, 23, 59, 59, 999); // 2026-11-25 23:59:59.999
    expect(getLocalDateString(endOfDay)).toBe("2026-11-25");

    // One millisecond later -> next day
    const nextDay = new Date(2026, 10, 26, 0, 0, 0, 0); // 2026-11-26 00:00:00
    expect(getLocalDateString(nextDay)).toBe("2026-11-26");
  });

  it("handles month and year rollover boundaries", () => {
    // End of year rollover
    const yearEnd = new Date(2026, 11, 31, 23, 59, 59); // 2026-12-31
    expect(getLocalDateString(yearEnd)).toBe("2026-12-31");

    const newYear = new Date(2027, 0, 1, 0, 0, 0); // 2027-01-01
    expect(getLocalDateString(newYear)).toBe("2027-01-01");

    // Leap year February (2024 is leap year, 2026 is non-leap)
    const leapDay = new Date(2024, 1, 29, 12, 0, 0);
    expect(getLocalDateString(leapDay)).toBe("2024-02-29");

    const nonLeapDay = new Date(2026, 1, 28, 12, 0, 0);
    expect(getLocalDateString(nonLeapDay)).toBe("2026-02-28");
  });

  it("correctly extracts local date components regardless of ISO string UTC representation", () => {
    // Test that local date functions getFullYear/getMonth/getDate are honored
    const testDate = new Date("2026-11-25T23:59:59+08:00");
    const expectedLocal = `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, "0")}-${String(testDate.getDate()).padStart(2, "0")}`;
    expect(getLocalDateString(testDate)).toBe(expectedLocal);

    const testDateMorning = new Date("2026-11-26T00:00:01+08:00");
    const expectedMorning = `${testDateMorning.getFullYear()}-${String(testDateMorning.getMonth() + 1).padStart(2, "0")}-${String(testDateMorning.getDate()).padStart(2, "0")}`;
    expect(getLocalDateString(testDateMorning)).toBe(expectedMorning);
  });
});
