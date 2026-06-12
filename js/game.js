/**
 * Core game logic — a faithful re-implementation of the classic Zetamac
 * arithmetic game (arithmetic.zetamac.com).
 *
 * Behaviour kept identical to the original:
 *   - Four operations: addition, subtraction, multiplication, division.
 *   - On each problem one enabled operation is chosen uniformly at random.
 *   - Subtraction is the inverse of addition (uses the same number ranges),
 *     so it never produces a negative answer.
 *   - Division is the inverse of multiplication (uses the same ranges),
 *     so it always produces a whole-number answer.
 *   - The default ranges and 120-second timer match Zetamac's defaults.
 *
 * This module is intentionally UI-agnostic: it only generates problems and
 * tracks the score. The timer and rendering live in app.js.
 */

/** Default settings — these mirror Zetamac's out-of-the-box configuration. */
export const DEFAULT_SETTINGS = {
  duration: 120, // seconds
  operations: {
    addition: { enabled: true, leftMin: 2, leftMax: 100, rightMin: 2, rightMax: 100 },
    // Subtraction & division reuse the addition / multiplication ranges,
    // exactly like the original game.
    subtraction: { enabled: true },
    multiplication: { enabled: true, leftMin: 2, leftMax: 12, rightMin: 2, rightMax: 100 },
    division: { enabled: true },
  },
};

/** Inclusive random integer in [min, max]. */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Use real math symbols for display; answers are always plain numbers.
const SYMBOL = { addition: "+", subtraction: "\u2212", multiplication: "\u00D7", division: "\u00F7" };

export class GameEngine {
  /** @param {typeof DEFAULT_SETTINGS} settings */
  constructor(settings = DEFAULT_SETTINGS) {
    this.settings = settings;
    this.reset();
  }

  reset() {
    this.score = 0; // correct answers (this is the Zetamac "score")
    this.correct = 0;
    this.incorrect = 0;
    this.startTime = null;
    this.endTime = null;
    this.current = null;
    this._lastText = null;
  }

  /** List of operation keys that are currently enabled. */
  get enabledOps() {
    return Object.keys(this.settings.operations).filter(
      (k) => this.settings.operations[k].enabled
    );
  }

  start() {
    this.reset();
    this.startTime = Date.now();
    this.next();
    return this.current;
  }

  /** Build one problem of the given operation. */
  _build(op) {
    const ops = this.settings.operations;
    const add = ops.addition;
    const mul = ops.multiplication;

    switch (op) {
      case "addition": {
        const a = randInt(add.leftMin, add.leftMax);
        const b = randInt(add.rightMin, add.rightMax);
        return { op, text: `${a} ${SYMBOL.addition} ${b}`, answer: a + b };
      }
      case "subtraction": {
        // Inverse of addition: pick a + b, then ask sum minus one term.
        const a = randInt(add.leftMin, add.leftMax);
        const b = randInt(add.rightMin, add.rightMax);
        const sum = a + b;
        const subtractA = Math.random() < 0.5;
        const taken = subtractA ? a : b;
        return {
          op,
          text: `${sum} ${SYMBOL.subtraction} ${taken}`,
          answer: subtractA ? b : a,
        };
      }
      case "multiplication": {
        const a = randInt(mul.leftMin, mul.leftMax);
        const b = randInt(mul.rightMin, mul.rightMax);
        return { op, text: `${a} ${SYMBOL.multiplication} ${b}`, answer: a * b };
      }
      case "division": {
        // Inverse of multiplication: pick a * b, then divide by one factor.
        const a = randInt(mul.leftMin, mul.leftMax);
        const b = randInt(mul.rightMin, mul.rightMax);
        const product = a * b;
        return { op, text: `${product} ${SYMBOL.division} ${a}`, answer: b };
      }
      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  }

  /** Advance to the next problem, avoiding an immediate exact repeat. */
  next() {
    const ops = this.enabledOps;
    if (ops.length === 0) {
      this.current = { op: "addition", text: "0 + 0", answer: 0 };
      return this.current;
    }
    let problem;
    let attempts = 0;
    do {
      const op = ops[randInt(0, ops.length - 1)];
      problem = this._build(op);
      attempts++;
    } while (problem.text === this._lastText && attempts < 8);
    this._lastText = problem.text;
    this.current = problem;
    return this.current;
  }

  /**
   * Check a submitted value against the current problem.
   * @returns {boolean} whether it was correct
   */
  submit(value) {
    const parsed = Number(value);
    if (value === "" || Number.isNaN(parsed)) return false;
    const isCorrect = parsed === this.current.answer;
    if (isCorrect) {
      this.score++;
      this.correct++;
      this.next();
    } else {
      this.incorrect++;
    }
    return isCorrect;
  }

  finish() {
    this.endTime = Date.now();
  }

  /** Summary object used for the results screen and Sheets logging. */
  getResults() {
    return {
      date: new Date().toISOString(),
      startTime: this.startTime,
      endTime: this.endTime,
      score: this.score,
      correct: this.correct,
      incorrect: this.incorrect,
      durationSeconds: this.settings.duration,
      settings: this.settings,
    };
  }
}
