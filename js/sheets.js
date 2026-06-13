/**
 * Google Sheets integration.
 *
 * Two modes:
 *   A) Fixed spreadsheet (preferred): write into an existing spreadsheet whose
 *      ID is set in config (SPREADSHEET_ID), into a specific tab identified by
 *      its gid (TARGET_SHEET_GID). Rows are formatted to match a "Session Log"
 *      style layout: Date, Start, End, Duration, Score, State, Notes.
 *   B) Auto-create (fallback): if no SPREADSHEET_ID is configured, find or
 *      create a "Zetamac Results" sheet in the user's Drive and append a simple
 *      results row.
 *
 * Requests are authenticated with the OAuth access token from GoogleAuth. The
 * `spreadsheets` scope grants read/write to spreadsheets the user can access,
 * which is what lets mode A write into an existing, hand-made spreadsheet.
 */

const HEADER_ROW = ["Date", "Score", "Correct", "Incorrect", "Duration (s)", "Settings"];

export class SheetsService {
  /**
   * @param {import('./auth.js').GoogleAuth} auth
   * @param {{spreadsheetId?:string, targetGid?:number, targetName?:string, dailyLogName?:string, spreadsheetName:string, sheetTab:string}} opts
   */
  constructor(auth, { spreadsheetId, targetGid, targetName, dailyLogName, spreadsheetName, sheetTab }) {
    this.auth = auth;
    this.fixedId = spreadsheetId || "";
    this.targetGid = targetGid;
    this.targetName = targetName || "";
    this.dailyLogName = dailyLogName || "Daily Log";
    this.spreadsheetName = spreadsheetName;
    this.sheetTab = sheetTab;
    this.spreadsheetId = this.fixedId || null;
    this._resolvedTab = null;
    this._sheetTitles = null;
  }

  get usingFixedSheet() {
    return Boolean(this.fixedId);
  }

  _localKey() {
    const email = this.auth.profile?.email || "anon";
    return `zetamac.spreadsheetId.${email}`;
  }

  async _fetch(url, options = {}) {
    const token = await this.auth.ensureToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google API ${res.status}: ${body}`);
    }
    return res.json();
  }

  /** Append one game result. */
  async saveResult(results) {
    if (this.usingFixedSheet) return this._appendToFixed(results);
    return this._appendToAutoCreated(results);
  }

  // ── Mode A: existing spreadsheet, "Session Log" style tab ────────────────
  // The Session Log table has its header on row 4 and data from row 5:
  //   A Date | B Session # | C Start | D End | E Duration(min) |
  //   F Score | G Time Range | H Pre-session State | I Notes | J Tag
  static DATA_START_ROW = 5;
  static DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  async _loadSheetTitles() {
    if (this._sheetTitles) return this._sheetTitles;
    const data = await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}` +
        `?fields=sheets(properties(sheetId,title))`
    );
    this._sheetTitles = data.sheets || [];
    return this._sheetTitles;
  }

  async _tabTitle({ name, gid, fallback }) {
    const sheets = await this._loadSheetTitles();
    if (name) {
      const byName = sheets.find(
        (s) => s.properties.title.toLowerCase() === name.toLowerCase()
      );
      if (byName) return byName.properties.title;
    }
    if (gid != null) {
      const byGid = sheets.find((s) => s.properties.sheetId === gid);
      if (byGid) return byGid.properties.title;
    }
    return fallback || sheets[0]?.properties?.title || "Sheet1";
  }

  async _resolveTabTitle() {
    if (this._resolvedTab) return this._resolvedTab;
    this._resolvedTab = await this._tabTitle({
      name: this.targetName,
      gid: this.targetGid,
    });
    return this._resolvedTab;
  }

  async _readColumn(tab, col, startRow) {
    const data = await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}/values/` +
        `${encodeURIComponent(tab)}!${col}${startRow}:${col}`
    );
    return data.values || [];
  }

  _firstEmptyIndex(values) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i] && values[i][0];
      if (!v || String(v).trim() === "") return i;
    }
    return values.length;
  }

  _findTodayIndex(values, d) {
    for (let i = 0; i < values.length; i++) {
      const v = values[i] && values[i][0];
      if (v && SheetsService._sameDay(v, d)) return i;
    }
    return -1;
  }

  static _fmtTime(ms) {
    return ms
      ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
  }

  static _sameDay(displayDate, d) {
    const p = new Date(displayDate);
    return (
      !Number.isNaN(p.getTime()) &&
      p.getFullYear() === d.getFullYear() &&
      p.getMonth() === d.getMonth() &&
      p.getDate() === d.getDate()
    );
  }

  async _appendToFixed(results) {
    const tab = await this._resolveTabTitle();
    const start = SheetsService.DATA_START_ROW;
    const dates = await this._readColumn(tab, "A", start);
    const firstEmpty = this._firstEmptyIndex(dates);
    const targetRow = start + firstEmpty;

    const end = results.endTime || Date.now();
    const d = new Date(end);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

    let sessionNum = 1;
    for (let i = 0; i < firstEmpty; i++) {
      const v = dates[i] && dates[i][0];
      if (v && SheetsService._sameDay(v, d)) sessionNum++;
    }

    const startStr = SheetsService._fmtTime(results.startTime);
    const endStr = SheetsService._fmtTime(end);
    const durationMin = Math.round((results.durationSeconds / 60) * 100) / 100;
    const ops = Object.keys(results.settings.operations)
      .filter((k) => results.settings.operations[k].enabled)
      .map((k) => ({ addition: "+", subtraction: "−", multiplication: "×", division: "÷" }[k]))
      .join("");
    const notes = `Zetamac Mobile — correct ${results.correct}, incorrect ${results.incorrect}, ops ${ops}`;
    const timeRange = startStr && endStr ? `${startStr} - ${endStr}` : "";

    const row = [
      dateStr,
      sessionNum,
      startStr,
      endStr,
      durationMin,
      results.score,
      timeRange,
      "",
      notes,
      "",
    ];

    await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}/values/` +
        `${encodeURIComponent(tab)}!A${targetRow}:J${targetRow}` +
        `?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [row] }) }
    );

    await this._updateDailyLog(results, dateStr, d, endStr);
    return this.fixedId;
  }

  /**
   * Ensure today has a Daily Log row and note this mobile run in column L.
   * Daily Log layout: header row 4, data from row 5 — Date | Day | … | Notes.
   */
  async _updateDailyLog(results, dateStr, d, endStr) {
    const tab = await this._tabTitle({ name: this.dailyLogName });
    const start = SheetsService.DATA_START_ROW;
    const dates = await this._readColumn(tab, "A", start);
    const todayIdx = this._findTodayIndex(dates, d);
    const runNote = `Zetamac mobile — score ${results.score} at ${endStr || "end of run"}`;

    if (todayIdx === -1) {
      const row = start + this._firstEmptyIndex(dates);
      const day = SheetsService.DAY_NAMES[d.getDay()];
      await this._fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}/values/` +
          `${encodeURIComponent(tab)}!A${row}:L${row}` +
          `?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          body: JSON.stringify({
            values: [[dateStr, day, "", "", "", "", "", "", "", "", "", runNote]],
          }),
        }
      );
      return;
    }

    const row = start + todayIdx;
    const noteData = await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}/values/` +
        `${encodeURIComponent(tab)}!L${row}`
    );
    const existing = (noteData.values && noteData.values[0] && noteData.values[0][0]) || "";
    const merged = existing ? `${existing}; ${runNote}` : runNote;
    await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}/values/` +
        `${encodeURIComponent(tab)}!L${row}` +
        `?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [[merged]] }) }
    );
  }

  // ── Mode B: auto-create a personal results spreadsheet ───────────────────
  async _appendToAutoCreated(results) {
    const id = await this._ensureAutoSpreadsheet();
    const row = [
      results.date,
      results.score,
      results.correct,
      results.incorrect,
      results.durationSeconds,
      JSON.stringify(results.settings),
    ];
    await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/` +
        `${encodeURIComponent(this.sheetTab)}!A1:append?valueInputOption=USER_ENTERED`,
      { method: "POST", body: JSON.stringify({ values: [row] }) }
    );
    return id;
  }

  async _ensureAutoSpreadsheet() {
    if (this.spreadsheetId) return this.spreadsheetId;

    const cached = localStorage.getItem(this._localKey());
    if (cached && (await this._spreadsheetExists(cached))) {
      this.spreadsheetId = cached;
      return cached;
    }

    const found = await this._findSpreadsheet();
    if (found) {
      this.spreadsheetId = found;
      localStorage.setItem(this._localKey(), found);
      return found;
    }

    this.spreadsheetId = await this._createSpreadsheet();
    localStorage.setItem(this._localKey(), this.spreadsheetId);
    return this.spreadsheetId;
  }

  async _spreadsheetExists(id) {
    try {
      await this._fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`
      );
      return true;
    } catch {
      return false;
    }
  }

  async _findSpreadsheet() {
    const q = encodeURIComponent(
      `name='${this.spreadsheetName}' and ` +
        `mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`
    );
    const data = await this._fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`
    );
    return data.files?.[0]?.id || null;
  }

  async _createSpreadsheet() {
    const data = await this._fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: JSON.stringify({
        properties: { title: this.spreadsheetName },
        sheets: [{ properties: { title: this.sheetTab } }],
      }),
    });
    const id = data.spreadsheetId;
    await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/` +
        `${encodeURIComponent(this.sheetTab)}!A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [HEADER_ROW] }) }
    );
    return id;
  }

  /** Direct link to the spreadsheet for the "View results" button. */
  get spreadsheetUrl() {
    const id = this.spreadsheetId || this.fixedId;
    if (!id) return null;
    const base = `https://docs.google.com/spreadsheets/d/${id}`;
    return this.targetGid ? `${base}/edit#gid=${this.targetGid}` : base;
  }
}
