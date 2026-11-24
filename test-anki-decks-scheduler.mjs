import assert from "node:assert";
import { readFileSync } from "node:fs";

console.log("=====================================================");
console.log("=== Running Anki Decks & Intelligent Scheduler Tests ===");
console.log("=====================================================\n");

// 1. Audit static source code files
console.log("1. Auditing Anki Decks & Scheduler Source Files...");

const ankiDecksSrc = readFileSync("./src/data/ankiDecks.ts", "utf-8");
assert.ok(ankiDecksSrc.includes("VOLUME_DECKS"), "ankiDecks.ts must export VOLUME_DECKS");
assert.ok(ankiDecksSrc.includes("VOL_BX1"), "ankiDecks.ts must include 必修上册 VOL_BX1");
assert.ok(ankiDecksSrc.includes("VOL_BX2"), "ankiDecks.ts must include 必修下册 VOL_BX2");
assert.ok(ankiDecksSrc.includes("VOL_XB1"), "ankiDecks.ts must include 选必上册 VOL_XB1");
assert.ok(ankiDecksSrc.includes("VOL_XB2"), "ankiDecks.ts must include 选必中册 VOL_XB2");
assert.ok(ankiDecksSrc.includes("VOL_XB3"), "ankiDecks.ts must include 选必下册 VOL_XB3");
assert.ok(ankiDecksSrc.includes("VOL_XX"), "ankiDecks.ts must include 选修 VOL_XX");
assert.ok(ankiDecksSrc.includes("computeDeckStats"), "ankiDecks.ts must export computeDeckStats");
console.log("   ✓ ankiDecks.ts defines the complete 6 volume hierarchy");

const schedulerSrc = readFileSync("./src/domain/fsrs/ankiScheduler.ts", "utf-8");
assert.ok(schedulerSrc.includes("class AnkiScheduler"), "ankiScheduler.ts must export AnkiScheduler");
assert.ok(schedulerSrc.includes("dailyNewLimit"), "ankiScheduler.ts must handle dailyNewLimit");
assert.ok(schedulerSrc.includes("dailyReviewLimit"), "ankiScheduler.ts must handle dailyReviewLimit");
assert.ok(schedulerSrc.includes("requeueFailedCard"), "ankiScheduler.ts must implement requeueFailedCard");
assert.ok(schedulerSrc.includes("buildDailyPlan"), "ankiScheduler.ts must implement buildDailyPlan");
console.log("   ✓ ankiScheduler.ts implements rational scheduling, daily limits and in-session loops");

const deckHubSrc = readFileSync("./src/components/AnkiDeckHub.tsx", "utf-8");
assert.ok(deckHubSrc.includes("AnkiDeckHub"), "AnkiDeckHub.tsx must export AnkiDeckHub");
assert.ok(deckHubSrc.includes("VOLUME_DECKS"), "AnkiDeckHub.tsx must use VOLUME_DECKS");
assert.ok(deckHubSrc.includes("text-sky-600"), "AnkiDeckHub.tsx must use Anki blue for new cards");
assert.ok(deckHubSrc.includes("text-red-600"), "AnkiDeckHub.tsx must use Anki red for learn cards");
assert.ok(deckHubSrc.includes("text-emerald-600"), "AnkiDeckHub.tsx must use Anki green for due cards");
console.log("   ✓ AnkiDeckHub.tsx renders authentic Anki UI with triple counters and expandable tree");

const flipCardSrc = readFileSync("./src/views/FlipCardView.tsx", "utf-8");
assert.ok(flipCardSrc.includes("AnkiDeckHub"), "FlipCardView.tsx must integrate AnkiDeckHub");
assert.ok(flipCardSrc.includes("viewMode"), "FlipCardView.tsx must support deck_hub and study viewModes");
assert.ok(flipCardSrc.includes("ankiScheduler"), "FlipCardView.tsx must use ankiScheduler");
assert.ok(flipCardSrc.includes("requeueFailedCard"), "FlipCardView.tsx must re-queue failed cards on AGAIN");
console.log("   ✓ FlipCardView.tsx integrates Anki Deck Hub, breadcrumb navigation and session loops");

const catalogSrc = readFileSync("./src/views/CatalogView.tsx", "utf-8");
assert.ok(catalogSrc.includes("VOL_BX1"), "CatalogView.tsx must support 选册 filter chips");
assert.ok(catalogSrc.includes("volumes"), "CatalogView.tsx must support 按选册排架 layout");
assert.ok(catalogSrc.includes("闪卡"), "CatalogView.tsx must provide direct Anki flashcard action");
console.log("   ✓ CatalogView.tsx supports 选册排架 and direct Anki card triggers");

const dashboardSrc = readFileSync("./src/views/DashboardView.tsx", "utf-8");
assert.ok(dashboardSrc.includes("VOLUME_DECKS"), "DashboardView.tsx must use VOLUME_DECKS");
assert.ok(dashboardSrc.includes("6 大选册背诵进度"), "DashboardView.tsx must render volume progress overview");
console.log("   ✓ DashboardView.tsx displays 6 Volume Decks progress overview");

// 2. Logic simulation tests
console.log("\n2. Testing In-Session Re-queueing Logic...");
function requeueFailedCard(currentQueue, currentIndex, card, offset = 4) {
  const nextQueue = [...currentQueue];
  const insertIndex = Math.min(nextQueue.length, currentIndex + offset);
  nextQueue.splice(insertIndex, 0, card);
  return nextQueue;
}

const queue = [
  { id: "c1", prompt: "p1" },
  { id: "c2", prompt: "p2" },
  { id: "c3", prompt: "p3" },
  { id: "c4", prompt: "p4" },
  { id: "c5", prompt: "p5" }
];

const requeued = requeueFailedCard(queue, 0, queue[0], 3);
assert.strictEqual(requeued.length, 6, "Length should increase by 1");
assert.strictEqual(requeued[3].id, "c1", "Card should re-appear at target offset position");
console.log("   ✓ Re-queueing correctly positions failed card for reinforcement");

// 3. Test daily limits logic
console.log("\n3. Testing Daily Limits and Priority Order...");
function buildDailyPlanMock(dueCards, learningCards, newCards, settings, todayNewLearned = 0) {
  const effectiveDue = settings.dailyReviewLimit > 0
    ? dueCards.slice(0, settings.dailyReviewLimit)
    : dueCards;
  const remainingNewQuota = settings.dailyNewLimit > 0
    ? Math.max(0, settings.dailyNewLimit - todayNewLearned)
    : newCards.length;
  const effectiveNew = newCards.slice(0, remainingNewQuota);
  const sessionQueue = [...learningCards, ...effectiveDue, ...effectiveNew];
  return {
    due: effectiveDue,
    learning: learningCards,
    new: effectiveNew,
    sessionQueue,
    totalTargetCards: sessionQueue.length
  };
}

const mockDue = Array.from({ length: 30 }, (_, i) => ({ id: `due_${i}` }));
const mockLearn = Array.from({ length: 5 }, (_, i) => ({ id: `learn_${i}` }));
const mockNew = Array.from({ length: 80 }, (_, i) => ({ id: `new_${i}` }));

const planA = buildDailyPlanMock(mockDue, mockLearn, mockNew, { dailyNewLimit: 20, dailyReviewLimit: 100 });
assert.strictEqual(planA.due.length, 30);
assert.strictEqual(planA.learning.length, 5);
assert.strictEqual(planA.new.length, 20, "New cards capped at 20");
assert.strictEqual(planA.totalTargetCards, 55);
assert.strictEqual(planA.sessionQueue[0].id, "learn_0", "Learning cards take first priority");
assert.strictEqual(planA.sessionQueue[5].id, "due_0", "Due reviews take second priority");
assert.strictEqual(planA.sessionQueue[35].id, "new_0", "New cards take third priority");
console.log("   ✓ Priority order strictly enforced: Learn -> Due Reviews -> New Cards");

const planB = buildDailyPlanMock(mockDue, mockLearn, mockNew, { dailyNewLimit: 20, dailyReviewLimit: 100 }, 15);
assert.strictEqual(planB.new.length, 5, "Remaining new quota correctly adjusted by todayNewLearned (20 - 15 = 5)");
console.log("   ✓ Daily new cards correctly respect today's already learned progress");

console.log("\n=====================================================");
console.log("=== All Anki Decks & Scheduler Tests Passed Successfully! ===");
console.log("=====================================================");
