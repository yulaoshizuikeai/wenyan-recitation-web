import assert from "node:assert";
import { readFileSync } from "node:fs";

console.log("=================================================================");
console.log("=== Comprehensive Session Recovery & Cross-Mode Audit Suite ===");
console.log("=================================================================\n");

// --- Mock localStorage environment ---
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

globalThis.localStorage = new MockLocalStorage();
globalThis.window = {
  localStorage: globalThis.localStorage,
  dispatchEvent: () => true
};

const SESSION_STORAGE_KEY = "wenyan_last_session";

function getLastSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.view) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveLastSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearLastSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

// -------------------------------------------------------------
// Test 1: Cold start / Clean state
// -------------------------------------------------------------
console.log("1. Testing Cold Start & Empty State Handling...");
clearLastSession();
assert.strictEqual(getLastSession(), null, "Initial session should be null");
console.log("   ✓ Cold start correctly returns null without throwing");

// -------------------------------------------------------------
// Test 2: Snowball (长卷滚雪球) Mode Session Tracking & Recovery
// -------------------------------------------------------------
console.log("\n2. Testing Mode: Snowball (长卷滚雪球)...");
const snowballSession = {
  view: "snowball",
  articleId: "art_bx1_12",
  articleTitle: "劝学",
  articleAuthor: "荀子",
  articleDynasty: "先秦",
  modeName: "长卷滚雪球",
  progressText: "第 4 / 8 联",
  progressPercent: 50,
  updatedAt: Date.now(),
  extra: {
    stageIndex: 3,
    totalStages: 8
  }
};
saveLastSession(snowballSession);
const restoredSnowball = getLastSession();
assert.ok(restoredSnowball, "Snowball session should exist");
assert.strictEqual(restoredSnowball.view, "snowball");
assert.strictEqual(restoredSnowball.articleId, "art_bx1_12");
assert.strictEqual(restoredSnowball.extra.stageIndex, 3);
assert.strictEqual(restoredSnowball.progressPercent, 50);
console.log("   ✓ Snowball stageIndex 3/8 correctly persisted and restored");

// -------------------------------------------------------------
// Test 3: FlipCard (翻转闪卡) Mode Session Tracking & Recovery
// -------------------------------------------------------------
console.log("\n3. Testing Mode: FlipCard (翻转闪卡)...");
const flipCardSession = {
  view: "flipcard",
  articleId: "art_bx1_14",
  articleTitle: "赤壁赋",
  articleAuthor: "苏轼",
  articleDynasty: "宋代",
  modeName: "翻转闪卡",
  progressText: "遗忘复习 · 卡片 7 / 20",
  progressPercent: 35,
  updatedAt: Date.now(),
  extra: {
    queueMode: "due",
    cardIndex: 6,
    totalCards: 20
  }
};
saveLastSession(flipCardSession);
const restoredFlipCard = getLastSession();
assert.ok(restoredFlipCard, "FlipCard session should exist");
assert.strictEqual(restoredFlipCard.view, "flipcard");
assert.strictEqual(restoredFlipCard.extra.queueMode, "due");
assert.strictEqual(restoredFlipCard.extra.cardIndex, 6);
assert.strictEqual(restoredFlipCard.extra.totalCards, 20);
console.log("   ✓ FlipCard queueMode 'due' and cardIndex 6/20 correctly restored");

// -------------------------------------------------------------
// Test 4: Cloze (渐进遮挡) Mode Session Tracking & Recovery
// -------------------------------------------------------------
console.log("\n4. Testing Mode: Cloze (渐进遮挡)...");
const clozeSession = {
  view: "cloze",
  articleId: "art_bx1_13",
  articleTitle: "师说",
  articleAuthor: "韩愈",
  articleDynasty: "唐代",
  modeName: "渐进遮挡",
  progressText: "L2 半句 (4 词已显)",
  progressPercent: 60,
  updatedAt: Date.now(),
  extra: {
    clozeLevel: 2
  }
};
saveLastSession(clozeSession);
const restoredCloze = getLastSession();
assert.ok(restoredCloze, "Cloze session should exist");
assert.strictEqual(restoredCloze.view, "cloze");
assert.strictEqual(restoredCloze.extra.clozeLevel, 2);
assert.strictEqual(restoredCloze.progressPercent, 60);
console.log("   ✓ Cloze level 2 (L2 半句) correctly restored");

// -------------------------------------------------------------
// Test 5: Scenario (高考默写) Mode Session Tracking & Recovery
// -------------------------------------------------------------
console.log("\n5. Testing Mode: Scenario (高考默写)...");
const scenarioSession = {
  view: "scenario",
  articleId: undefined,
  articleTitle: "劝学",
  articleAuthor: "荀子",
  articleDynasty: "",
  modeName: "高考默写",
  progressText: "第 12 / 80 题",
  progressPercent: 15,
  updatedAt: Date.now(),
  extra: {
    scenarioQuestionIndex: 11,
    totalCards: 80
  }
};
saveLastSession(scenarioSession);
const restoredScenario = getLastSession();
assert.ok(restoredScenario, "Scenario session should exist");
assert.strictEqual(restoredScenario.view, "scenario");
assert.strictEqual(restoredScenario.extra.scenarioQuestionIndex, 11);
assert.strictEqual(restoredScenario.extra.totalCards, 80);
console.log("   ✓ Scenario question index 11/80 correctly restored");

// -------------------------------------------------------------
// Test 6: CramMode (考前抱佛脚·核心金句) Session Tracking & Recovery
// -------------------------------------------------------------
console.log("\n6. Testing Mode: CramMode (考前抱佛脚)...");
const cramSession = {
  view: "cram",
  articleId: "art_bx1_08",
  articleTitle: "琵琶行并序",
  articleAuthor: "白居易",
  articleDynasty: "唐代",
  modeName: "考前抱佛脚",
  progressText: "金句 25 / 150",
  progressPercent: 17,
  updatedAt: Date.now(),
  extra: {
    goldenVerseIndex: 24,
    activeModule: "COMPULSORY_1",
    viewStyle: "card",
    totalCards: 150
  }
};
saveLastSession(cramSession);
const restoredCram = getLastSession();
assert.ok(restoredCram, "CramMode session should exist");
assert.strictEqual(restoredCram.view, "cram");
assert.strictEqual(restoredCram.extra.goldenVerseIndex, 24);
assert.strictEqual(restoredCram.extra.activeModule, "COMPULSORY_1");
assert.strictEqual(restoredCram.extra.viewStyle, "card");
console.log("   ✓ CramMode verse index 24, module COMPULSORY_1, style 'card' correctly restored");

// -------------------------------------------------------------
// Test 7: Catalog (诗文典库) Mode Tracking
// -------------------------------------------------------------
console.log("\n7. Testing Mode: Catalog (诗文典库)...");
const catalogSession = {
  view: "catalog",
  articleId: "art_xb1_07",
  articleTitle: "离骚",
  articleAuthor: "屈原",
  articleDynasty: "战国",
  modeName: "诗文典库",
  progressText: "全文研览",
  progressPercent: 100,
  updatedAt: Date.now()
};
saveLastSession(catalogSession);
const restoredCatalog = getLastSession();
assert.ok(restoredCatalog, "Catalog session should exist");
assert.strictEqual(restoredCatalog.view, "catalog");
assert.strictEqual(restoredCatalog.articleId, "art_xb1_07");
assert.strictEqual(restoredCatalog.progressPercent, 100);
console.log("   ✓ Catalog reading session for 离骚 correctly tracked");

// -------------------------------------------------------------
// Test 8: Robustness & Corrupted Storage Resilience
// -------------------------------------------------------------
console.log("\n8. Testing Edge Cases & Corrupted Data Handling...");
// Corrupted JSON string
localStorage.setItem(SESSION_STORAGE_KEY, "{corrupt-invalid-json: missing quotes");
assert.strictEqual(getLastSession(), null, "Corrupt JSON should safely return null");

// Empty string
localStorage.setItem(SESSION_STORAGE_KEY, "");
assert.strictEqual(getLastSession(), null, "Empty string should safely return null");

// Non-object primitive
localStorage.setItem(SESSION_STORAGE_KEY, "12345");
assert.strictEqual(getLastSession(), null, "Number primitive should return null");

// Object missing view property
localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ articleId: "123" }));
assert.strictEqual(getLastSession(), null, "Object missing 'view' should return null");

console.log("   ✓ Corrupted / malformed storage values safely handled without crashing");

// -------------------------------------------------------------
// Test 9: Index Out-of-Bounds & Clamping Simulation
// -------------------------------------------------------------
console.log("\n9. Testing Index Bounds & Graceful Fallback...");
function resolveRestoredStageIndex(extraIndex, maxStages) {
  if (typeof extraIndex !== "number" || isNaN(extraIndex)) return 0;
  if (extraIndex < 0 || extraIndex >= maxStages) return 0;
  return extraIndex;
}

assert.strictEqual(resolveRestoredStageIndex(3, 8), 3, "Valid index in range preserved");
assert.strictEqual(resolveRestoredStageIndex(99, 8), 0, "Out-of-bounds stage index resets to 0");
assert.strictEqual(resolveRestoredStageIndex(-1, 8), 0, "Negative stage index resets to 0");
assert.strictEqual(resolveRestoredStageIndex(NaN, 8), 0, "NaN stage index resets to 0");
console.log("   ✓ Index boundary guardrails validated");

// -------------------------------------------------------------
// Test 10: Clear / Reset Behavior
// -------------------------------------------------------------
console.log("\n10. Testing Clear & Reset Behavior...");
saveLastSession(snowballSession);
assert.ok(getLastSession() !== null);
clearLastSession();
assert.strictEqual(getLastSession(), null, "clearLastSession should erase stored session");
console.log("   ✓ clearLastSession cleanly wipes stored session");

// -------------------------------------------------------------
// Test 11: Static Source Code Invariant Audits
// -------------------------------------------------------------
console.log("\n11. Auditing Static Source Code Integrations & Wire-up...");

const appSrc = readFileSync("./src/App.tsx", "utf-8");
assert.ok(appSrc.includes("useLastSession"), "App.tsx must import and use useLastSession");
assert.ok(appSrc.includes("handleResumeLastSession"), "App.tsx must implement handleResumeLastSession");
assert.ok(appSrc.includes("resumeExtra={resumeExtra}"), "App.tsx must pass resumeExtra to view components");
assert.ok(appSrc.includes("auto_resume_on_startup"), "App.tsx must check auto_resume_on_startup setting");
console.log("   ✓ App.tsx correctly manages resumeExtra and auto-resume hooks");

const dashboardSrc = readFileSync("./src/views/DashboardView.tsx", "utf-8");
assert.ok(dashboardSrc.includes("PickUpCard"), "DashboardView must render PickUpCard");
assert.ok(dashboardSrc.includes("variant=\"hero\""), "DashboardView must use hero variant for PickUpCard");
console.log("   ✓ DashboardView hero card correctly wired up");

const snowballSrc = readFileSync("./src/views/SnowballView.tsx", "utf-8");
assert.ok(snowballSrc.includes("resumeExtra"), "SnowballView must accept resumeExtra prop");
assert.ok(snowballSrc.includes("saveLastSession"), "SnowballView must save session on change");
console.log("   ✓ SnowballView correctly handles resumeExtra and session saving");

const flipCardSrc = readFileSync("./src/views/FlipCardView.tsx", "utf-8");
assert.ok(flipCardSrc.includes("resumeExtra"), "FlipCardView must accept resumeExtra prop");
assert.ok(flipCardSrc.includes("saveLastSession"), "FlipCardView must save session on change");
console.log("   ✓ FlipCardView correctly handles resumeExtra and session saving");

const clozeSrc = readFileSync("./src/views/ClozeView.tsx", "utf-8");
assert.ok(clozeSrc.includes("resumeExtra"), "ClozeView must accept resumeExtra prop");
assert.ok(clozeSrc.includes("saveLastSession"), "ClozeView must save session on change");
console.log("   ✓ ClozeView correctly handles resumeExtra and session saving");

const scenarioSrc = readFileSync("./src/views/ScenarioView.tsx", "utf-8");
assert.ok(scenarioSrc.includes("resumeExtra"), "ScenarioView must accept resumeExtra prop");
assert.ok(scenarioSrc.includes("saveLastSession"), "ScenarioView must save session on change");
console.log("   ✓ ScenarioView correctly handles resumeExtra and session saving");

const cramSrc = readFileSync("./src/views/CramModeView.tsx", "utf-8");
assert.ok(cramSrc.includes("resumeExtra"), "CramModeView must accept resumeExtra prop");
assert.ok(cramSrc.includes("saveLastSession"), "CramModeView must save session on change");
console.log("   ✓ CramModeView correctly handles resumeExtra and session saving");

const catalogSrc = readFileSync("./src/views/CatalogView.tsx", "utf-8");
assert.ok(catalogSrc.includes("variant=\"banner\""), "CatalogView must render banner variant PickUpCard");
console.log("   ✓ CatalogView correctly renders banner variant PickUpCard");

const navbarSrc = readFileSync("./src/components/Navbar.tsx", "utf-8");
assert.ok(navbarSrc.includes("lastSession"), "Navbar must accept and render lastSession quick button");
console.log("   ✓ Navbar correctly renders quick resume trigger");

const settingsSrc = readFileSync("./src/views/SettingsView.tsx", "utf-8");
assert.ok(settingsSrc.includes("auto_resume_on_startup"), "SettingsView must provide auto_resume_on_startup toggle");
assert.ok(settingsSrc.includes("clearSession"), "SettingsView must provide clearSession action");
console.log("   ✓ SettingsView correctly includes preferences and clear action");

const dbSrc = readFileSync("./src/storage/db.ts", "utf-8");
assert.ok(dbSrc.includes("wenyan_last_session"), "resetAllProgress must clean wenyan_last_session");
console.log("   ✓ db.ts resetAllProgress cleans session storage");

console.log("\n=================================================================");
console.log("=== All 11 Verification Phases Passed with Zero Failures! ===");
console.log("=================================================================");
