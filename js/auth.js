/**
 * Google authentication using Google Identity Services (GIS).
 *
 * We use the OAuth 2.0 *token* flow (no backend required). The browser
 * requests an access token directly from Google and uses it to call the
 * Sheets / Drive REST APIs. This keeps the whole app static and trivially
 * deployable to GitHub Pages.
 *
 * Scopes requested:
 *   - openid email profile   → identify the signed-in user
 *   - drive.file             → create + access ONLY files this app creates
 *   - spreadsheets           → read/write spreadsheet contents
 */

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");

export class GoogleAuth {
  constructor(clientId) {
    this.clientId = clientId;
    this.tokenClient = null;
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.profile = null; // { email, name, picture }
    this._listeners = [];
  }

  /** Whether Google login is configured at all. */
  get isConfigured() {
    return Boolean(this.clientId);
  }

  get isSignedIn() {
    return Boolean(this.accessToken) && Date.now() < this.tokenExpiry;
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  _emit() {
    this._listeners.forEach((fn) => fn(this));
  }

  /**
   * Initialise the GIS token client. Resolves once the GIS script is ready.
   */
  async init() {
    if (!this.isConfigured) return;
    await this._waitForGis();
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) {
          console.error("Token error:", resp);
          this._emit();
          return;
        }
        this.accessToken = resp.access_token;
        // expires_in is in seconds; refresh a little early.
        this.tokenExpiry = Date.now() + (Number(resp.expires_in) - 60) * 1000;
        try {
          this.profile = await this._fetchProfile();
        } catch (e) {
          console.warn("Could not load profile:", e);
        }
        this._emit();
      },
    });
  }

  _waitForGis() {
    return new Promise((resolve) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const start = Date.now();
      const timer = setInterval(() => {
        if (window.google?.accounts?.oauth2 || Date.now() - start > 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  /** Trigger the sign-in popup (and consent on first run). */
  signIn() {
    if (!this.tokenClient) return;
    this.tokenClient.requestAccessToken({ prompt: this.profile ? "" : "consent" });
  }

  signOut() {
    if (this.accessToken && window.google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(this.accessToken, () => {});
    }
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.profile = null;
    this._emit();
  }

  /** Ensure we have a fresh token before an API call; re-prompts silently if needed. */
  async ensureToken() {
    if (this.isSignedIn) return this.accessToken;
    return new Promise((resolve) => {
      const prev = this.tokenClient.callback;
      this.tokenClient.callback = async (resp) => {
        await prev(resp); // run the standard handler (updates token + profile)
        resolve(this.accessToken);
      };
      this.tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  async _fetchProfile() {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error(`userinfo ${res.status}`);
    return res.json();
  }
}
