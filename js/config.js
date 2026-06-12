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
  GOOGLE_CLIENT_ID: "983661072068-vb52ohath6s5klvemh2romu2nbvabvof.apps.googleusercontent.com",

  // Write results into THIS existing spreadsheet (instead of creating one).
  // Leave empty ("") to fall back to auto-creating a "Zetamac Results" sheet.
  SPREADSHEET_ID: "1OZbNLykg9KNo0dnylNdmT4y7sfu5WY43fc-29Cy9AYk",

  // The specific tab (worksheet) to append to, identified by its gid from the
  // sheet URL (…#gid=NUMBER). The Session Log tab in this tracker.
  TARGET_SHEET_GID: 456037226,

  // Fallbacks used only when SPREADSHEET_ID is empty (auto-create mode).
  SPREADSHEET_NAME: "Zetamac Results",
  SHEET_TAB_NAME: "Results",
};
