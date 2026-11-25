export type DiffStatus = "correct" | "wrong" | "missing" | "extra";

export interface DiffChar {
  char: string;
  expected?: string;
  status: DiffStatus;
}

export interface DiffSummary {
  diffs: DiffChar[];
  isMatch: boolean;
  correctCount: number;
  wrongCount: number;
  missingCount: number;
  extraCount: number;
}

interface AlignedDiffItem extends DiffChar {
  /** 0-based index in normalized expectedAnswer; undefined for "extra" tokens */
  ansIndex?: number;
  /** Answer index just before an "extra" insertion (used to detect extras inside a span) */
  afterAnsIndex?: number;
}

const PUNCTUATION_AND_SPACE_RE = /[，。？！；：、“”‘’《》〈〉（）()「」『』\[\]【】,.?!;:'"\s]/g;

/**
 * Strip punctuation and whitespace so scenario recitation comparison
 * focuses purely on classical Chinese characters.
 */
export function normalizeScenarioText(text: string): string {
  return text.replace(PUNCTUATION_AND_SPACE_RE, "");
}

/**
 * Exact match check after punctuation/whitespace normalization.
 */
export function isScenarioMatch(userInput: string, expectedAnswer: string): boolean {
  return normalizeScenarioText(userInput) === normalizeScenarioText(expectedAnswer);
}

function alignNormalizedTexts(normUser: string, normAns: string): AlignedDiffItem[] {
  const m = normUser.length;
  const n = normAns.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) {
    return Array.from(normAns, (ch, j) => ({
      char: "_",
      expected: ch,
      status: "missing" as const,
      ansIndex: j
    }));
  }
  if (n === 0) {
    return Array.from(normUser, ch => ({
      char: ch,
      status: "extra" as const,
      afterAnsIndex: -1
    }));
  }

  // Levenshtein minimum edit distance DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    const uCh = normUser[i - 1];
    for (let j = 1; j <= n; j++) {
      const aCh = normAns[j - 1];
      if (uCh === aCh) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution (wrong)
          dp[i][j - 1] + 1,     // deletion from expected (missing)
          dp[i - 1][j] + 1      // insertion in user input (extra)
        );
      }
    }
  }

  // Backtrack to reconstruct optimal alignment
  const reversed: AlignedDiffItem[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && normUser[i - 1] === normAns[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      reversed.push({
        char: normUser[i - 1],
        status: "correct",
        ansIndex: j - 1
      });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      reversed.push({
        char: normUser[i - 1],
        expected: normAns[j - 1],
        status: "wrong",
        ansIndex: j - 1
      });
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      reversed.push({
        char: "_",
        expected: normAns[j - 1],
        status: "missing",
        ansIndex: j - 1
      });
      j--;
    } else {
      reversed.push({
        char: normUser[i - 1],
        status: "extra",
        afterAnsIndex: j - 1
      });
      i--;
    }
  }

  return reversed.reverse();
}

/**
 * Compute character-level diff using Levenshtein minimum edit distance alignment
 * so missing or extra characters do not shift-misalign subsequent correct characters.
 */
export function computeScenarioDiff(userInput: string, expectedAnswer: string): DiffChar[] {
  const normUser = normalizeScenarioText(userInput);
  const normAns = normalizeScenarioText(expectedAnswer);
  return alignNormalizedTexts(normUser, normAns).map(({ char, expected, status }) =>
    expected !== undefined ? { char, expected, status } : { char, status }
  );
}

/**
 * Evaluate a student's recitation against the expected answer and return
 * both the aligned diff tokens and summary counts.
 */
export function evaluateScenarioAnswer(userInput: string, expectedAnswer: string): DiffSummary {
  const normUser = normalizeScenarioText(userInput);
  const normAns = normalizeScenarioText(expectedAnswer);
  const diffs = alignNormalizedTexts(normUser, normAns).map(({ char, expected, status }) =>
    expected !== undefined ? { char, expected, status } : { char, status }
  );

  let correctCount = 0;
  let wrongCount = 0;
  let missingCount = 0;
  let extraCount = 0;

  for (const item of diffs) {
    if (item.status === "correct") correctCount++;
    else if (item.status === "wrong") wrongCount++;
    else if (item.status === "missing") missingCount++;
    else extraCount++;
  }

  return {
    diffs,
    isMatch: normUser === normAns,
    correctCount,
    wrongCount,
    missingCount,
    extraCount
  };
}

/**
 * Extract the target classical Chinese phrase from a keyPoint annotation
 * such as "生 (通假字，通‘性’，天资)" -> "生".
 */
export function extractKeyPointTarget(keyPoint: string): string {
  const withoutNotes = keyPoint.replace(/[（(][^）)]*[）)]/g, "").trim();
  return normalizeScenarioText(withoutNotes);
}

/**
 * Identify indices of `keyPoints` whose target characters were missed,
 * mistyped, or disrupted by extra characters in the student's answer.
 */
export function findFailedKeyPointIndices(
  userInput: string,
  expectedAnswer: string,
  keyPoints: string[]
): number[] {
  if (keyPoints.length === 0) return [];

  const normUser = normalizeScenarioText(userInput);
  const normAns = normalizeScenarioText(expectedAnswer);
  if (normUser === normAns) return [];

  const aligned = alignNormalizedTexts(normUser, normAns);
  const ansStatus = new Array<DiffStatus>(normAns.length);
  const extraAfterAns = new Set<number>();

  for (const item of aligned) {
    if (item.ansIndex !== undefined) {
      ansStatus[item.ansIndex] = item.status;
    } else if (item.status === "extra" && item.afterAnsIndex !== undefined) {
      extraAfterAns.add(item.afterAnsIndex);
    }
  }

  const failedChars = new Set<string>();
  for (const item of aligned) {
    if ((item.status === "wrong" || item.status === "missing") && item.expected) {
      failedChars.add(item.expected);
    }
  }

  const failedIndices: number[] = [];

  keyPoints.forEach((kp, kpIdx) => {
    const target = extractKeyPointTarget(kp);
    if (!target) return;

    const matchStart = normAns.indexOf(target);
    if (matchStart !== -1) {
      const matchEnd = matchStart + target.length;
      let hasError = false;
      for (let pos = matchStart; pos < matchEnd; pos++) {
        if (ansStatus[pos] !== "correct") {
          hasError = true;
          break;
        }
        // Extra character inserted strictly inside this keyPoint span
        if (pos < matchEnd - 1 && extraAfterAns.has(pos)) {
          hasError = true;
          break;
        }
      }
      if (hasError) {
        failedIndices.push(kpIdx);
      }
      return;
    }

    // Fallback: if keyPoint phrasing isn't a verbatim substring, check char overlap with failed expected chars
    for (const ch of target) {
      if (failedChars.has(ch)) {
        failedIndices.push(kpIdx);
        break;
      }
    }
  });

  return failedIndices;
}
