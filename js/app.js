/**
 * Main application controller.
 *
 * Wires together the game engine, the on-screen keypad, Google auth and the
 * Sheets service, and manages the three screens (home → game → results).
 */
import { GameEngine, DEFAULT_SETTINGS } from "./game.js?v=10";
import { Keypad } from "./keypad.js?v=10";
import { GoogleAuth } from "./auth.js?v=10";
import { SheetsService } from "./sheets.js?v=10";

const CONFIG = window.ZETAMAC_CONFIG || {};

// ── DOM helpers ──────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const screens = {
  home: $("#screen-home"),
  game: $("#screen-game"),
  results: $("#screen-results"),
};

// Cache hot-path nodes so each keystroke does no DOM lookups.
const els = {
  problem: $("#problem"),
  answer: $("#answer"),
  score: $("#score"),
  time: $("#time"),
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => (el.hidden = key !== name));
}

// ── App state ────────────────────────────────────────────────────────────
let engine = null;
let keypad = null;
let timerId = null;
let timeLeft = 0;
let pendingResults = null;
let showDailyLogForm = false;

const auth = new GoogleAuth(CONFIG.GOOGLE_CLIENT_ID);
const sheets = new SheetsService(auth, {
  spreadsheetId: CONFIG.SPREADSHEET_ID || "",
  targetGid: CONFIG.TARGET_SHEET_GID,
  targetName: CONFIG.TARGET_SHEET_NAME || "",
  dailyLogName: CONFIG.DAILY_LOG_SHEET_NAME || "Daily Log",
  spreadsheetName: CONFIG.SPREADSHEET_NAME || "Zetamac Results",
  sheetTab: CONFIG.SHEET_TAB_NAME || "Results",
});

// ── Settings: read the form into a settings object ───────────────────────
function readSettings() {
  const form = $("#settings");
  const num = (name, fallback) => {
    const v = Number(form.elements[name]?.value);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    duration: num("duration", 120),
    operations: {
      addition: {
        enabled: form.elements["addition"].checked,
        leftMin: num("add-leftMin", 2),
        leftMax: num("add-leftMax", 100),
        rightMin: num("add-rightMin", 2),
        rightMax: num("add-rightMax", 100),
      },
      subtraction: { enabled: form.elements["subtraction"].checked },
      multiplication: {
        enabled: form.elements["multiplication"].checked,
        leftMin: num("mul-leftMin", 2),
        leftMax: num("mul-leftMax", 12),
        rightMin: num("mul-rightMin", 2),
        rightMax: num("mul-rightMax", 100),
      },
      division: { enabled: form.elements["division"].checked },
    },
  };
}

// ── Game flow ────────────────────────────────────────────────────────────
function renderProblem() {
  els.problem.textContent = engine.current.text;
}

function renderAnswer(value) {
  els.answer.textContent = value;
}

function startGame() {
  const settings = readSettings();
  if (Object.values(settings.operations).every((o) => !o.enabled)) {
    settings.operations = DEFAULT_SETTINGS.operations; // never start with nothing enabled
  }
  engine = new GameEngine(settings);
  engine.start();

  timeLeft = settings.duration;
  els.time.textContent = timeLeft;
  els.score.textContent = 0;
  keypad.reset();
  renderAnswer("");
  renderProblem();
  showScreen("game");

  clearInterval(timerId);
  timerId = setInterval(() => {
    timeLeft -= 1;
    els.time.textContent = Math.max(0, timeLeft);
    if (timeLeft <= 0) endGame();
  }, 1000);
}

function handleChange(value) {
  // Auto-advance on an exact match — this is the core Zetamac feel.
  if (value !== "" && Number(value) === engine.current.answer) {
    engine.submit(value);
    keypad.reset();
    els.answer.textContent = "";
    els.problem.textContent = engine.current.text;
    els.score.textContent = engine.score;
  } else {
    els.answer.textContent = value;
  }
}

function handleSubmit(value) {
  if (value === "") return;
  const correct = engine.submit(value);
  keypad.reset();
  renderAnswer("");
  renderProblem();
  $("#score").textContent = engine.score;
  if (!correct) flashWrong();
}

function flashWrong() {
  const el = $("#problem");
  el.classList.remove("problem--wrong");
  void el.offsetWidth; // restart the animation
  el.classList.add("problem--wrong");
}

async function endGame() {
  clearInterval(timerId);
  engine.finish();
  pendingResults = engine.getResults();

  $("#final-score").textContent = pendingResults.score;
  $("#final-correct").textContent = pendingResults.correct;
  $("#final-incorrect").textContent = pendingResults.incorrect;
  $("#final-duration").textContent = `${pendingResults.durationSeconds}s`;
  $("#view-sheet").hidden = true;
  $("#save-status").textContent = "";
  showScreen("results");

  await prepareLogForms();
}

async function prepareLogForms() {
  const forms = $("#log-forms");
  const dailySection = $("#daily-log-section");
  const form = $("#log-forms");
  form.reset();

  if (!auth.isConfigured || !auth.isSignedIn) {
    forms.hidden = true;
    $("#save-status").textContent = auth.isConfigured
      ? "Sign in on the home screen to save scores to Google Sheets."
      : "";
    return;
  }

  forms.hidden = false;
  showDailyLogForm = await sheets.isFirstSessionToday(pendingResults.endTime);
  dailySection.hidden = !showDailyLogForm;

  if (showDailyLogForm) {
    $("#save-status").textContent = "Fill in today's context and session notes, then save.";
  } else {
    $("#save-status").textContent = "Fill in session notes, then save.";
  }
}

function readLogForms() {
  const f = $("#log-forms").elements;
  const log = {
    session: {
      state: f["session-state"].value,
      notes: f["session-notes"].value,
      tag: f["session-tag"].value,
    },
    includeDaily: showDailyLogForm,
  };
  if (showDailyLogForm) {
    log.daily = {
      wake: f["daily-wake"].value,
      bed: f["daily-bed"].value,
      sleepQuality: f["daily-sleep-quality"].value,
      food: f["daily-food"].value,
      caffeine: f["daily-caffeine"].value,
      breakfast: f["daily-breakfast"].value,
      energy: f["daily-energy"].value,
      focus: f["daily-focus"].value,
      notes: f["daily-notes"].value,
    };
  }
  return log;
}

async function saveResults() {
  const status = $("#save-status");
  if (!pendingResults) return;
  if (!auth.isConfigured || !auth.isSignedIn) {
    status.textContent = "Sign in on the home screen to save scores to Google Sheets.";
    return;
  }
  status.textContent = "Saving to Google Sheets…";
  $("#save-btn").disabled = true;
  try {
    const log = readLogForms();
    await sheets.saveResult(pendingResults, log);
    status.textContent = "Saved to your Google Sheet.";
    const link = $("#view-sheet");
    link.href = sheets.spreadsheetUrl;
    link.hidden = false;
    showDailyLogForm = false;
    $("#daily-log-section").hidden = true;
  } catch (err) {
    console.error(err);
    status.textContent = "Could not save to Google Sheets. See console for details.";
  } finally {
    $("#save-btn").disabled = false;
  }
}

// ── Auth UI ──────────────────────────────────────────────────────────────
function renderAuth() {
  const signinBtn = $("#signin-btn");
  const info = $("#account-info");
  const note = $("#auth-note");

  if (!auth.isConfigured) {
    signinBtn.hidden = true;
    info.hidden = true;
    note.hidden = true;
    return;
  }

  if (auth.isSignedIn && auth.profile) {
    signinBtn.hidden = true;
    info.hidden = false;
    note.hidden = true;
    $("#account-email").textContent = auth.profile.email || "";
    if (auth.profile.picture) $("#account-pic").src = auth.profile.picture;
  } else {
    signinBtn.hidden = false;
    info.hidden = true;
    note.hidden = false;
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────
function init() {
  keypad = new Keypad($("#keypad"), { onChange: handleChange, onSubmit: handleSubmit });

  $("#start-btn").addEventListener("click", startGame);
  $("#again-btn").addEventListener("click", () => {
    pendingResults = null;
    showScreen("home");
  });
  $("#save-btn").addEventListener("click", saveResults);

  // Zetamac flow: press Enter to start from the home screen, and to play
  // again from the results screen.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (!screens.home.hidden) {
      e.preventDefault();
      startGame();
    } else if (!screens.results.hidden && $("#log-forms").hidden) {
      e.preventDefault();
      showScreen("home");
    }
  });
  $("#signin-btn").addEventListener("click", () => auth.signIn());
  $("#signout-btn").addEventListener("click", () => auth.signOut());

  auth.onChange(renderAuth);
  renderAuth();
  auth.init().then(renderAuth);

  showScreen("home");
}

init();
