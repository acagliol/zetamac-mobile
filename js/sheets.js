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
   * @param {{spreadsheetId?:string, targetGid?:number, spreadsheetName:string, sheetTab:string}} opts
   */
  constructor(auth, { spreadsheetId, targetGid, spreadsheetName, sheetTab }) {
    this.auth = auth;
    this.fixedId = spreadsheetId || "";
    this.targetGid = targetGid;
    this.spreadsheetName = spreadsheetName;
    this.sheetTab = sheetTab;
    this.spreadsheetId = this.fixedId || null;
    this._resolvedTab = null; // tab title resolved from gid (mode A)
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

  // ── Mode A: existing spreadsheet + specific tab (by gid) ─────────────────
  async _resolveTabTitle() {
    if (this._resolvedTab) return this._resolvedTab;
    const data = await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}` +
        `?fields=sheets(properties(sheetId,title))`
    );
    const sheets = data.sheets || [];
    // Prefer the tab whose gid matches TARGET_SHEET_GID; otherwise first tab.
    const match =
      sheets.find((s) => s.properties.sheetId === this.targetGid) || sheets[0];
    this._resolvedTab = match?.properties?.title || "Sheet1";
    return this._resolvedTab;
  }

  _formatSessionRow(results) {
    const fmtTime = (ms) =>
      ms
        ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "";
    const end = results.endTime || Date.now();
    const d = new Date(end);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    const secs = results.durationSeconds;
    const duration = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const ops = Object.keys(results.settings.operations)
      .filter((k) => results.settings.operations[k].enabled)
      .join(", ");
    const notes = `correct ${results.correct}, incorrect ${results.incorrect}; ops: ${ops}`;
    // Columns: Date, Start, End, Duration, Score, State, Notes
    return [dateStr, fmtTime(results.startTime), fmtTime(end), duration, results.score, "", notes];
  }

  async _appendToFixed(results) {
    const tab = await this._resolveTabTitle();
    const row = this._formatSessionRow(results);
    await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${this.fixedId}/values/` +
        `${encodeURIComponent(tab)}!A1:append` +
        `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [row] }) }
    );
    return this.fixedId;
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
