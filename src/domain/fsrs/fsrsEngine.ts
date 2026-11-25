import { CardFsrsState, CardState, NextStateResult, Rating, ReviewLog } from "./fsrsTypes";
import { getSetting, setSetting } from "../../storage/db";

export interface FsrsSettings {
  requestRetention: number;
  recitationStabilityFactor: number;
}

export const DEFAULT_FSRS_SETTINGS: FsrsSettings = {
  requestRetention: 0.93,
  recitationStabilityFactor: 0.72
};

const FSRS_SETTINGS_KEY = "fsrs_settings";

export const DEFAULT_FSRS_5_WEIGHTS = [
  0.40255,  // w0:  S0(Again)
  1.18385,  // w1:  S0(Hard)
  3.17300,  // w2:  S0(Good)
  15.69105, // w3:  S0(Easy)
  7.19490,  // w4:  D0(Again) base difficulty
  0.53450,  // w5:  D0 step exponent
  1.46040,  // w6:  Difficulty delta factor
  0.00460,  // w7:  Mean reversion rate
  1.54575,  // w8:  Recall S base factor
  0.11920,  // w9:  Recall S stability power damping
  1.01925,  // w10: Recall S retrievability exp factor
  1.93950,  // w11: Forget S long-term base factor
  0.11000,  // w12: Forget S difficulty power damping
  0.29605,  // w13: Forget S stability power factor
  2.26980,  // w14: Forget S retrievability exp factor
  0.23150,  // w15: Hard penalty factor
  2.98980,  // w16: Easy bonus factor
  0.51655,  // w17: Short-term S multiplier factor
  0.66210   // w18: Short-term S grade offset
];

export class FSRSEngine {
  weights: number[];
  requestRetention: number;
  maximumInterval: number;
  learningSteps: number[]; // in ms
  relearningSteps: number[]; // in ms
  recitationStabilityFactor: number;

  private decay = -0.5;
  private factor = Math.pow(0.9, 1.0 / this.decay) - 1.0; // ~0.2345679

  constructor(
    weights = [...DEFAULT_FSRS_5_WEIGHTS],
    requestRetention = 0.93,
    maximumInterval = 36500,
    learningSteps = [60_000, 600_000],
    relearningSteps = [600_000],
    recitationStabilityFactor = 0.72
  ) {
    this.weights = weights;
    this.requestRetention = requestRetention;
    this.maximumInterval = maximumInterval;
    this.learningSteps = learningSteps;
    this.relearningSteps = relearningSteps;
    this.recitationStabilityFactor = recitationStabilityFactor;
  }

  retrievability(elapsedDays: number, stability: number): number {
    if (stability <= 0) return 0;
    const t = Math.max(0, elapsedDays);
    return Math.pow(1.0 + this.factor * (t / stability), this.decay);
  }

  nextInterval(stability: number, retention = this.requestRetention): number {
    if (stability <= 0) return 1;
    const interval = (stability / this.factor) * (Math.pow(retention, 1.0 / this.decay) - 1.0);
    return Math.min(Math.max(Math.round(interval), 1), this.maximumInterval);
  }

  applyFuzz(interval: number, cardId: string, reps = 0): number {
    if (interval < 3) return interval;
    let hash = 0;
    for (let i = 0; i < cardId.length; i++) {
      hash = (hash * 31 + cardId.charCodeAt(i)) | 0;
    }
    hash = Math.abs((hash * 31) ^ reps);
    const maxFuzz = Math.max(1, Math.round(interval * 0.05));
    const delta = (hash % (2 * maxFuzz + 1)) - maxFuzz;
    return Math.min(Math.max(interval + delta, 1), this.maximumInterval);
  }

  initialStability(rating: Rating): number {
    return Math.max(this.weights[rating - 1] * this.recitationStabilityFactor, 0.001);
  }

  initialDifficulty(rating: Rating): number {
    const d = this.weights[4] - Math.exp(this.weights[5] * (rating - 1.0)) + 1.0;
    return Math.min(Math.max(d, 1.0), 10.0);
  }

  nextDifficulty(currentD: number, rating: Rating): number {
    const deltaD = -this.weights[6] * (rating - 3.0);
    const dPrime = currentD + (deltaD * (10.0 - currentD)) / 9.0;
    const dInitEasy = this.weights[4] - Math.exp(this.weights[5] * 3.0) + 1.0;
    const dDoublePrime = this.weights[7] * dInitEasy + (1.0 - this.weights[7]) * dPrime;
    return Math.min(Math.max(dDoublePrime, 1.0), 10.0);
  }

  nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
    const hardPenalty = rating === Rating.HARD ? this.weights[15] : 1.0;
    const easyBonus = rating === Rating.EASY ? this.weights[16] : 1.0;
    const sInc =
      1.0 +
      Math.exp(this.weights[8]) *
        (11.0 - d) *
        Math.pow(s, -this.weights[9]) *
        (Math.exp((1.0 - r) * this.weights[10]) - 1.0) *
        hardPenalty *
        easyBonus;
    return Math.max(s * sInc, 0.001);
  }

  nextForgetStability(d: number, s: number, r: number): number {
    const sLong =
      this.weights[11] *
      Math.pow(d, -this.weights[12]) *
      (Math.pow(s + 1.0, this.weights[13]) - 1.0) *
      Math.exp((1.0 - r) * this.weights[14]);
    const sShort = s / Math.exp(this.weights[17] * this.weights[18]);
    return Math.max(Math.min(sLong, sShort), 0.001);
  }

  shortTermStability(s: number, rating: Rating): number {
    const safeS = isNaN(s) || s <= 0 ? 0.001 : s;
    let sInc = Math.exp(this.weights[17] * (rating - 3.0 + this.weights[18]));
    if (rating >= 3) {
      sInc = Math.max(sInc, 1.0);
    }
    return Math.max(safeS * sInc, 0.001);
  }

  formatDurationBadge(millis: number): string {
    const minutes = Math.floor(millis / 60_000);
    return minutes < 60 ? `${Math.max(1, minutes)}分` : `${Math.floor(minutes / 60)}小时`;
  }

  formatIntervalBadge(days: number): string {
    if (days < 1) return "1天";
    if (days < 30) return `${days}天`;
    if (days < 365) return `${Math.round(days / 30)}个月`;
    return `${(days / 365).toFixed(1)}年`;
  }

  createInitialCard(cardId: string): CardFsrsState {
    return {
      cardId,
      state: CardState.NEW,
      step: null,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      lastReviewTime: null,
      dueTime: Date.now(),
      isLeech: false
    };
  }

  previewIntervals(card: CardFsrsState, nowMillis = Date.now()): Record<Rating, string> {
    const result: Record<number, string> = {};
    for (const rating of [Rating.AGAIN, Rating.HARD, Rating.GOOD, Rating.EASY]) {
      const evalRes = this.evaluateReview(card, rating, nowMillis);
      const updatedCard = evalRes.updatedCard;
      if (updatedCard.state === CardState.LEARNING || updatedCard.state === CardState.RELEARNING) {
        const stepDelay = Math.max(60_000, updatedCard.dueTime - nowMillis);
        result[rating] = this.formatDurationBadge(stepDelay);
      } else if (updatedCard.state === CardState.REVIEW) {
        result[rating] = this.formatIntervalBadge(updatedCard.scheduledDays);
      } else {
        result[rating] = "1天";
      }
    }
    return result as Record<Rating, string>;
  }

  evaluateReview(card: CardFsrsState, rating: Rating, nowMillis = Date.now()): NextStateResult {
    let elapsedDays = 0;
    if (card.lastReviewTime != null) {
      const lastDate = new Date(card.lastReviewTime).setHours(0, 0, 0, 0);
      const nowDate = new Date(nowMillis).setHours(0, 0, 0, 0);
      elapsedDays = Math.max(0, Math.floor((nowDate - lastDate) / 86_400_000));
    }
    const isSameDay = card.lastReviewTime != null && elapsedDays === 0;

    const safeStability = isNaN(card.stability) || card.stability <= 0 ? 0.001 : card.stability;
    const safeDifficulty = isNaN(card.difficulty) ? 5.0 : Math.min(Math.max(card.difficulty, 1.0), 10.0);

    let newStability = safeStability;
    let newDifficulty = safeDifficulty;

    switch (card.state) {
      case CardState.NEW:
        newStability = this.initialStability(rating);
        newDifficulty = this.initialDifficulty(rating);
        break;

      case CardState.LEARNING:
      case CardState.RELEARNING:
        if (isSameDay) {
          newStability = this.shortTermStability(safeStability, rating);
          newDifficulty = this.nextDifficulty(safeDifficulty, rating);
        } else {
          const r = this.retrievability(elapsedDays, safeStability);
          newStability =
            rating === Rating.AGAIN
              ? this.nextForgetStability(safeDifficulty, safeStability, r)
              : this.nextRecallStability(safeDifficulty, safeStability, r, rating);
          newDifficulty = this.nextDifficulty(safeDifficulty, rating);
        }
        break;

      case CardState.REVIEW:
        if (isSameDay) {
          newStability = this.shortTermStability(safeStability, rating);
        } else {
          const r = this.retrievability(elapsedDays, safeStability);
          newStability =
            rating === Rating.AGAIN
              ? this.nextForgetStability(safeDifficulty, safeStability, r)
              : this.nextRecallStability(safeDifficulty, safeStability, r, rating);
        }
        newDifficulty = this.nextDifficulty(safeDifficulty, rating);
        break;
    }

    let nextState = card.state;
    let nextStep = card.step;
    let scheduledDays = 0;
    let dueMillis = nowMillis;
    let lapses = card.lapses;

    switch (card.state) {
      case CardState.NEW:
        switch (rating) {
          case Rating.AGAIN:
            nextState = CardState.LEARNING;
            nextStep = 0;
            dueMillis = nowMillis + (this.learningSteps[0] || 60_000);
            break;
          case Rating.HARD:
            nextState = CardState.LEARNING;
            nextStep = 0;
            dueMillis = nowMillis + Math.floor((this.learningSteps[0] || 60_000) * 1.5);
            break;
          case Rating.GOOD:
            if (this.learningSteps.length <= 1) {
              nextState = CardState.REVIEW;
              nextStep = null;
              scheduledDays = this.nextInterval(newStability);
              dueMillis = nowMillis + scheduledDays * 86_400_000;
            } else {
              nextState = CardState.LEARNING;
              nextStep = 1;
              dueMillis = nowMillis + (this.learningSteps[1] || 600_000);
            }
            break;
          case Rating.EASY:
            nextState = CardState.REVIEW;
            nextStep = null;
            scheduledDays = this.nextInterval(newStability);
            dueMillis = nowMillis + scheduledDays * 86_400_000;
            break;
        }
        break;

      case CardState.LEARNING: {
        const currentStep = card.step ?? 0;
        switch (rating) {
          case Rating.AGAIN:
            nextStep = 0;
            dueMillis = nowMillis + (this.learningSteps[0] || 60_000);
            break;
          case Rating.HARD:
            dueMillis = nowMillis + (this.learningSteps[currentStep] || 600_000);
            break;
          case Rating.GOOD:
            if (currentStep + 1 >= this.learningSteps.length) {
              nextState = CardState.REVIEW;
              nextStep = null;
              scheduledDays = this.nextInterval(newStability);
              dueMillis = nowMillis + scheduledDays * 86_400_000;
            } else {
              nextStep = currentStep + 1;
              dueMillis = nowMillis + (this.learningSteps[nextStep] || 600_000);
            }
            break;
          case Rating.EASY:
            nextState = CardState.REVIEW;
            nextStep = null;
            scheduledDays = this.nextInterval(newStability);
            dueMillis = nowMillis + scheduledDays * 86_400_000;
            break;
        }
        break;
      }

      case CardState.REVIEW:
        switch (rating) {
          case Rating.AGAIN:
            nextState = CardState.RELEARNING;
            nextStep = 0;
            lapses += 1;
            dueMillis = nowMillis + (this.relearningSteps[0] || 600_000);
            break;
          case Rating.HARD:
          case Rating.GOOD:
            scheduledDays = this.nextInterval(newStability);
            dueMillis = nowMillis + scheduledDays * 86_400_000;
            break;
          case Rating.EASY: {
            const r = card.lastReviewTime == null ? 1.0 : this.retrievability(elapsedDays, card.stability);
            const goodStability = isSameDay
              ? this.shortTermStability(card.stability, Rating.GOOD)
              : this.nextRecallStability(card.difficulty, card.stability, r, Rating.GOOD);
            const goodIvl = this.nextInterval(goodStability);
            const easyIvl = this.nextInterval(newStability);
            scheduledDays = Math.min(Math.max(easyIvl, goodIvl + 1), this.maximumInterval);
            dueMillis = nowMillis + scheduledDays * 86_400_000;
            break;
          }
        }
        break;

      case CardState.RELEARNING: {
        const currentStep = card.step ?? 0;
        switch (rating) {
          case Rating.AGAIN:
            nextStep = 0;
            dueMillis = nowMillis + (this.relearningSteps[0] || 600_000);
            break;
          case Rating.HARD:
            dueMillis = nowMillis + (this.relearningSteps[currentStep] || 600_000);
            break;
          case Rating.GOOD:
          case Rating.EASY:
            nextState = CardState.REVIEW;
            nextStep = null;
            scheduledDays = this.nextInterval(newStability);
            dueMillis = nowMillis + scheduledDays * 86_400_000;
            break;
        }
        break;
      }
    }

    if (nextState === CardState.REVIEW && scheduledDays >= 3) {
      scheduledDays = this.applyFuzz(scheduledDays, card.cardId, card.reps + 1);
      dueMillis = nowMillis + scheduledDays * 86_400_000;
    }

    const updatedCard: CardFsrsState = {
      ...card,
      state: nextState,
      step: nextStep,
      stability: newStability,
      difficulty: newDifficulty,
      elapsedDays,
      scheduledDays,
      reps: card.reps + 1,
      lapses,
      lastReviewTime: nowMillis,
      dueTime: dueMillis,
      isLeech: lapses >= 4
    };

    const reviewLog: ReviewLog = {
      cardId: card.cardId,
      rating,
      previousState: card.state,
      currentState: nextState,
      stability: newStability,
      difficulty: newDifficulty,
      elapsedDays,
      scheduledDays,
      reviewTime: nowMillis
    };

    return {
      updatedCard,
      reviewLog,
      nextIntervalDays: scheduledDays
    };
  }
}

export async function getFsrsSettings(): Promise<FsrsSettings> {
  const saved = await getSetting<Partial<FsrsSettings> | null>(FSRS_SETTINGS_KEY, null);
  return {
    ...DEFAULT_FSRS_SETTINGS,
    ...(saved || {})
  };
}

export async function saveFsrsSettings(settings: FsrsSettings): Promise<void> {
  await setSetting(FSRS_SETTINGS_KEY, settings);
}

export function createFsrsEngine(settings?: Partial<FsrsSettings>): FSRSEngine {
  const retention = settings?.requestRetention ?? DEFAULT_FSRS_SETTINGS.requestRetention;
  const factor = settings?.recitationStabilityFactor ?? DEFAULT_FSRS_SETTINGS.recitationStabilityFactor;
  return new FSRSEngine(
    [...DEFAULT_FSRS_5_WEIGHTS],
    retention,
    36500,
    [60_000, 600_000],
    [600_000],
    factor
  );
}
