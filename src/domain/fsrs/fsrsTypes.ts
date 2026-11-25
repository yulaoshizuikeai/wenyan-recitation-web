export enum Rating {
  AGAIN = 1,
  HARD = 2,
  GOOD = 3,
  EASY = 4
}

export enum CardState {
  NEW = 0,
  LEARNING = 1,
  REVIEW = 2,
  RELEARNING = 3
}

export type ReviewSource = "flipcard" | "snowball" | "cloze" | "scenario" | "cram";

export interface CardFsrsState {
  cardId: string;
  state: CardState;
  step: number | null;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewTime: number | null;
  dueTime: number;
  isLeech: boolean;
  lastSource?: ReviewSource;
}

export interface ReviewLog {
  id?: string;
  cardId: string;
  rating: Rating;
  previousState: CardState;
  currentState: CardState;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reviewTime: number;
  source?: ReviewSource;
  quotaIsolated?: boolean;
}

export interface NextStateResult {
  updatedCard: CardFsrsState;
  reviewLog: ReviewLog;
  nextIntervalDays: number;
}
