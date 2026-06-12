/**
 * Google Sheets integration.
 *
 * Responsibilities:
 *   - Find the user's "Zetamac Results" spreadsheet (created by this app).
 *   - Create it automatically (with a header row) if it does not exist.
 *   - Append one row per finished game.
 *
 * All requests are authenticated with the OAuth access token from GoogleAuth.
 * Because we use the `drive.file` scope, Drive only ever sees / lists files
 * that this app itself created — we never touch the rest of the user's Drive.
 */

const HEADER_ROW = [
  "Date",
  "Score",
  "Correct",
  "Incorrect",
  "Duration (s)",
  "Settings",
];

export class SheetsService {
  /**
   * @param {import('./auth.js').GoogleAuth} auth
   * @param {{spreadsheetName:string, sheetTab:string}} opts
   */
  constructor(auth, { spreadsheetName, sheetTab }) {
    this.auth = auth;
    this.spreadsheetName = spreadsheetName;
    this.sheetTab = sheetTab;
    this.spreadsheetId = null;
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

  /** Locate or create the results spreadsheet, returning its ID. */
  async ensureSpreadsheet() {
    if (this.spreadsheetId) return this.spreadsheetId;

    // 1) Fast path: remembered from a previous session on this device.
    const cached = localStorage.getItem(this._localKey());
    if (cached && (await this._spreadsheetExists(cached))) {
      this.spreadsheetId = cached;
      return cached;
    }

    // 2) Search the user's Drive for an app-created file with our name.
    const found = await this._findSpreadsheet();
    if (found) {
      this.spreadsheetId = found;
      localStorage.setItem(this._localKey(), found);
      return found;
    }

    // 3) Nothing found → create a fresh spreadsheet for this user.
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
    // Seed the header row.
    await this._fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/` +
        `${encodeURIComponent(this.sheetTab)}!A1?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: [HEADER_ROW] }) }
    );
    return id;
  }

  /**
   * Append one game result as a new row.
   * @param {ReturnType<import('./game.js').GameEngine['getResults']>} results
   */
  async saveResult(results) {
    const id = await this.ensureSpreadsheet();
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

  /** Direct link to the spreadsheet for the "View results" button. */
  get spreadsheetUrl() {
    return this.spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`
      : null;
  }
}
