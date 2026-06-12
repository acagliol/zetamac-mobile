# Zetamac Mobile

A **mobile-friendly mental-math game** in the style of
[Zetamac](https://arithmetic.zetamac.com), with an on-screen numeric keypad and
optional **Google sign-in + automatic Google Sheets result tracking**.

The game itself is a faithful re-implementation of Zetamac's behaviour
(same four operations, the same default number ranges, the same 120-second
timer, and the same "type the answer and it auto-advances" feel). The new part
is everything that makes it pleasant on a phone, plus per-user score history.

- 100% static — **no backend, no build step**.
- Deploys to **GitHub Pages** (or Netlify / Vercel) in a couple of clicks.
- Google login uses the official Google Identity Services token flow.
- Results are saved to a spreadsheet **in the signed-in user's own Drive**.
  If they don't have one yet, it is created automatically.

---

## Features

- ✅ Responsive, dark, mobile-first UI.
- ✅ On-screen keypad: digits **0–9**, **Backspace (⌫)**, **Clear (C)**, **Enter**.
- ✅ Physical-keyboard support on desktop.
- ✅ Configurable operations, number ranges, and duration.
- ✅ Auto-advance on a correct answer (classic Zetamac behaviour).
- ✅ Per-user Google Sheet logging: **date, score, correct, incorrect, duration, settings**.
- ✅ Works fully offline if Google login is not configured.

---

## Project structure

```
zetamac-mobile/
├── index.html            # Markup + screen layout
├── css/
│   └── styles.css         # Mobile-first styling
├── js/
│   ├── config.js          # Your Google Client ID (edit this)
│   ├── game.js            # Zetamac game engine (problem generation + scoring)
│   ├── keypad.js          # On-screen numeric keypad component
│   ├── auth.js            # Google Identity Services (OAuth token flow)
│   ├── sheets.js          # Google Sheets / Drive integration
│   └── app.js             # Main controller wiring everything together
├── .github/workflows/
│   └── deploy.yml         # One-click GitHub Pages deployment
├── .gitignore
└── README.md
```

---

## Quick start (local)

The app uses ES modules, so it must be served over HTTP (not opened as a
`file://` path). Any static server works:

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>. The game is fully playable immediately —
Google login is only needed for score saving.

---

## Google setup (login + Sheets)

You only need this if you want scores saved to Google Sheets. Everything is on
the free tier.

### 1. Create a Google Cloud project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or pick an existing one).

### 2. Enable the APIs

In **APIs & Services → Library**, enable both:

- **Google Sheets API**
- **Google Drive API**

### 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External**.
3. Fill in the app name, support email, and developer contact.
4. Under **Scopes**, add:
   - `.../auth/drive.file`
   - `.../auth/spreadsheets`
   - `openid`, `email`, `profile` (usually added automatically)
5. While the app is in **Testing**, add your Google account(s) under
   **Test users**. (Publishing is optional; testing mode is fine for personal use.)

> `drive.file` is a *narrow* scope: the app can only see and modify files it
> creates itself. It never has access to the rest of a user's Drive.

### 4. Create an OAuth Client ID

1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorized JavaScript origins**, add every origin you'll run from:
   - `http://localhost:8000` (local dev)
   - `https://YOUR_USERNAME.github.io` (GitHub Pages — origin only, no path)
4. Click **Create** and copy the **Client ID**.

> The token flow used here relies on JavaScript origins, **not** redirect URIs,
> so you don't need to configure redirect URIs.

### 5. Add the Client ID to the app

Open [`js/config.js`](js/config.js) and paste your Client ID:

```js
window.ZETAMAC_CONFIG = {
  GOOGLE_CLIENT_ID: "1234567890-abcdefg.apps.googleusercontent.com",
  SPREADSHEET_NAME: "Zetamac Results",
  SHEET_TAB_NAME: "Results",
};
```

That's it. On the home screen you'll now see **Sign in with Google**. After a
game finishes, the result is appended to a spreadsheet named *Zetamac Results*
in your Drive (created automatically the first time).

### A note on "environment variables"

This is a static client-side app, so there is no server and no secret to hide.
The OAuth **Web application Client ID is public by design** — it is safe to
commit `js/config.js`. If you prefer to inject it at deploy time instead of
committing it, you can have your CI write `js/config.js` from a repository
variable; see the commented step in `.github/workflows/deploy.yml`.

---

## Deploy to GitHub Pages

### Option A — automatic (included workflow)

1. Push this folder to a GitHub repository.
2. In the repo, go to **Settings → Pages** and set **Source: GitHub Actions**.
3. The included [`deploy.yml`](.github/workflows/deploy.yml) publishes the site
   on every push to `main`.
4. Add `https://YOUR_USERNAME.github.io` to your OAuth **Authorized JavaScript
   origins** (step 4 above).

Your game will be live at `https://YOUR_USERNAME.github.io/REPO_NAME/`.

### Option B — manual

**Settings → Pages → Source: Deploy from a branch**, choose `main` / root.

### Netlify / Vercel

Drag-and-drop the folder, or point the platform at the repo. No build command
is required — set the publish/output directory to the project root.

---

## How the game logic maps to Zetamac

| Operation       | How problems are generated                                              |
| --------------- | ----------------------------------------------------------------------- |
| Addition        | `a + b` with `a, b` in the addition ranges.                             |
| Subtraction     | Inverse of addition: `(a+b) − a` → always non-negative.                 |
| Multiplication  | `a × b` with `a, b` in the multiplication ranges.                       |
| Division        | Inverse of multiplication: `(a×b) ÷ a` → always a whole number.         |

Each problem picks one enabled operation uniformly at random. Defaults match
Zetamac: addition `2–100 + 2–100`, multiplication `2–12 × 2–100`, 120 seconds.

---

## Data saved to the spreadsheet

Each finished game appends one row:

| Date (ISO) | Score | Correct | Incorrect | Duration (s) | Settings (JSON) |
| ---------- | ----- | ------- | --------- | ------------ | --------------- |

---

## License

[MIT](LICENSE)
