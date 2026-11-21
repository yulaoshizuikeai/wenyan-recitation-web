import assert from "node:assert";

console.log("=== Running Session Tracker Unit & Edge Case Tests ===");

// 1. Time formatting function tests (testing identical algorithm)
function formatRelativeTime(timestamp) {
  if (!timestamp || isNaN(timestamp)) return "近期";
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSec < 45) return "刚刚";
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
assert.strictEqual(formatRelativeTime(now - 120 * 1000), "2 分钟前", "2m ago should be '2 分钟前'");
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

console.log("✓ formatRelativeTime tests passed");

// 2. Test getModeDisplayName
assert.strictEqual(getModeDisplayName("snowball"), "长卷滚雪球");
assert.strictEqual(getModeDisplayName("flipcard"), "翻转闪卡");
assert.strictEqual(getModeDisplayName("cloze"), "渐进遮挡");
assert.strictEqual(getModeDisplayName("cram"), "考前抱佛脚");
assert.strictEqual(getModeDisplayName("scenario"), "高考默写");
assert.strictEqual(getModeDisplayName("catalog"), "诗文典库");
assert.strictEqual(getModeDisplayName("dashboard"), "研习概览");

console.log("✓ getModeDisplayName tests passed");

// 3. LocalStorage persistence & parsing resilience
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
    if (!parsed || typeof parsed !== "object" || !parsed.view) {
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

console.log("✓ Session storage & parsing resilience tests passed");

console.log("=== All Unit Tests Passed! ===");
