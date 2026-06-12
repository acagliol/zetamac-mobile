/**
 * Client-side configuration.
 *
 * These values are PUBLIC by design (an OAuth "Web application" Client ID is
 * meant to be exposed in the browser), so it is safe to commit this file.
 *
 * To enable Google login + Sheets saving:
 *   1. Create an OAuth 2.0 Client ID (type: Web application) in Google Cloud.
 *   2. Paste it into GOOGLE_CLIENT_ID below.
 *
 * If GOOGLE_CLIENT_ID is left empty, the game still works fully offline —
 * login and result-saving are simply disabled.
 *
 * See README.md for the full setup walkthrough.
 */
window.ZETAMAC_CONFIG = {
  // e.g. "1234567890-abcdefg.apps.googleusercontent.com"
  GOOGLE_CLIENT_ID: "",

  // Name of the spreadsheet created in each user's Google Drive.
  SPREADSHEET_NAME: "Zetamac Results",

  // Name of the tab/worksheet inside that spreadsheet.
  SHEET_TAB_NAME: "Results",
};
