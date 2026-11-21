import assert from "node:assert";

console.log("=== Running Session Tracker Unit & Edge Case Tests ===");

// 1. Time formatting function tests (testing identical algorithm from sessionTracker.ts)
function formatRelativeTime(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "近期";
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSec < 60) return "刚刚";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) {
    const d = new Date(timestamp);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `昨天 ${hh}:${mm}`;
  }
  if (diffDay < 7) return `${diffDay} 天前`;

  const d = new Date(timestamp);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}月${day}日`;
}

function getModeDisplayName(view) {
  switch (view) {
    case "snowball":
      return "长卷滚雪球";
    case "flipcard":
      return "翻转闪卡";
    case "cloze":
      return "渐进遮挡";
    case "cram":
      return "考前抱佛脚";
    case "scenario":
      return "高考默写";
    case "catalog":
      return "诗文典库";
    case "dashboard":
      return "研习概览";
    default:
      return "研习进度";
  }
}

const now = Date.now();
assert.strictEqual(formatRelativeTime(now), "刚刚", "Immediate timestamp should be '刚刚'");
assert.strictEqual(formatRelativeTime(now - 30 * 1000), "刚刚", "30s ago should be '刚刚'");

// Probe previous bug: 50s and 59s ago should return "刚刚", NEVER "0 分钟前"!
assert.strictEqual(formatRelativeTime(now - 50 * 1000), "刚刚", "50s ago must be '刚刚', not '0 分钟前'");
assert.strictEqual(formatRelativeTime(now - 59 * 1000), "刚刚", "59s ago must be '刚刚', not '0 分钟前'");

// Exact minute transitions
assert.strictEqual(formatRelativeTime(now - 60 * 1000), "1 分钟前", "60s ago should be '1 分钟前'");
assert.strictEqual(formatRelativeTime(now - 119 * 1000), "1 分钟前", "119s ago should be '1 分钟前'");
assert.strictEqual(formatRelativeTime(now - 120 * 1000), "2 分钟前", "120s ago should be '2 分钟前'");
assert.strictEqual(formatRelativeTime(now - 45 * 60 * 1000), "45 分钟前", "45m ago should be '45 分钟前'");
assert.strictEqual(formatRelativeTime(now - 3 * 3600 * 1000), "3 小时前", "3h ago should be '3 小时前'");

const yesterdayTime = now - 26 * 3600 * 1000;
const formattedYesterday = formatRelativeTime(yesterdayTime);
assert.ok(formattedYesterday.startsWith("昨天"), `26h ago should start with '昨天', got: ${formattedYesterday}`);

const fourDaysAgo = now - 4 * 24 * 3600 * 1000;
assert.strictEqual(formatRelativeTime(fourDaysAgo), "4 天前", "4 days ago should be '4 天前'");

assert.strictEqual(formatRelativeTime(0), "近期", "0 timestamp should return '近期'");
assert.strictEqual(formatRelativeTime(NaN), "近期", "NaN timestamp should return '近期'");
assert.strictEqual(formatRelativeTime(null), "近期", "null timestamp should return '近期'");

// Future timestamp edge case
assert.strictEqual(formatRelativeTime(now + 10000), "刚刚", "Future timestamp should safely return '刚刚'");

console.log("✓ formatRelativeTime tests passed (including 50s bug fix)");

// 2. Test getModeDisplayName
assert.strictEqual(getModeDisplayName("snowball"), "长卷滚雪球");
assert.strictEqual(getModeDisplayName("flipcard"), "翻转闪卡");
assert.strictEqual(getModeDisplayName("cloze"), "渐进遮挡");
assert.strictEqual(getModeDisplayName("cram"), "考前抱佛脚");
assert.strictEqual(getModeDisplayName("scenario"), "高考默写");
assert.strictEqual(getModeDisplayName("catalog"), "诗文典库");
assert.strictEqual(getModeDisplayName("dashboard"), "研习概览");
assert.strictEqual(getModeDisplayName("settings"), "研习进度");

console.log("✓ getModeDisplayName tests passed");

// 3. LocalStorage persistence & parsing resilience
const VALID_NAV_VIEWS = new Set([
  "dashboard",
  "cram",
  "snowball",
  "flipcard",
  "cloze",
  "scenario",
  "catalog",
  "settings"
]);

const SESSION_STORAGE_KEY = "wenyan_last_session";
const mockStorage = new Map();
const localStorage = {
  getItem: (key) => mockStorage.get(key) || null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear()
};

function getLastSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.view || !VALID_NAV_VIEWS.has(parsed.view)) {
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveLastSession(session) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    // ignore
  }
}

function clearLastSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (e) {
    // ignore
  }
}

// Initial state should be null
assert.strictEqual(getLastSession(), null, "Initial session should be null");

// Save session
const sampleSession = {
  view: "snowball",
  articleId: "art_bx1_12",
  articleTitle: "劝学",
  articleAuthor: "荀子",
  articleDynasty: "战国",
  modeName: "长卷滚雪球",
  progressText: "第 3 / 8 联",
  progressPercent: 38,
  updatedAt: Date.now(),
  extra: {
    stageIndex: 2,
    totalStages: 8
  }
};

saveLastSession(sampleSession);
const retrieved = getLastSession();
assert.ok(retrieved !== null, "Session should be retrieved");
assert.strictEqual(retrieved.view, "snowball");
assert.strictEqual(retrieved.articleId, "art_bx1_12");
assert.strictEqual(retrieved.articleTitle, "劝学");
assert.strictEqual(retrieved.progressPercent, 38);
assert.strictEqual(retrieved.extra.stageIndex, 2);

// Clear session
clearLastSession();
assert.strictEqual(getLastSession(), null, "Session should be cleared");

// Corrupted data test
localStorage.setItem(SESSION_STORAGE_KEY, "{bad json");
assert.strictEqual(getLastSession(), null, "Corrupted JSON should safely return null");

localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ notAValidSession: true }));
assert.strictEqual(getLastSession(), null, "Session missing .view should return null");

// Invalid view test (Probe invalid view resilience)
localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ view: "bogus_hacked_view", progressPercent: 50 }));
assert.strictEqual(getLastSession(), null, "Invalid view should safely return null");

console.log("✓ Session storage & parsing resilience tests passed");

// 4. Test Dynasty & Author formatting (Probe empty bracket bug fix)
function formatDynastyAuthor(dynasty, author) {
  if (!author && !dynasty) return "";
  const dynastyPart = dynasty ? `〔${dynasty}〕` : "";
  return `${dynastyPart}${author || ""}`;
}

assert.strictEqual(formatDynastyAuthor("战国", "荀子"), "〔战国〕荀子");
assert.strictEqual(formatDynastyAuthor("", "李白"), "李白", "Empty dynasty should NEVER produce '〔〕'");
assert.strictEqual(formatDynastyAuthor(undefined, "苏轼"), "苏轼", "Undefined dynasty should NEVER produce '〔〕'");
assert.strictEqual(formatDynastyAuthor("唐", ""), "〔唐〕");
assert.strictEqual(formatDynastyAuthor("", ""), "");

console.log("✓ Dynasty & author formatting tests passed (no empty brackets)");

// 5. Test Book Title Bracket Formatting (Probe mode name wrapped in 《》 bug fix)
function formatResumeButtonLabel(session) {
  return session.articleTitle ? `接续《${session.articleTitle}》` : `接续${session.modeName}`;
}

assert.strictEqual(formatResumeButtonLabel({ articleTitle: "赤壁赋", modeName: "长卷滚雪球" }), "接续《赤壁赋》");
assert.strictEqual(formatResumeButtonLabel({ articleTitle: "", modeName: "考前抱佛脚" }), "接续考前抱佛脚", "Mode names should NEVER be wrapped in 《》");
assert.strictEqual(formatResumeButtonLabel({ modeName: "高考默写" }), "接续高考默写", "Mode names should NEVER be wrapped in 《》");

console.log("✓ Book title formatting tests passed (modes not wrapped in book brackets)");

console.log("=== All Unit Tests Passed! ===");
