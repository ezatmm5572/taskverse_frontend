# TaskVerse Frontend

Vue 3 + Vite single-page app for task and team management: list / board / calendar views, team and member
cards, bulk actions with undo, comments with @mentions, attachments, time tracking, templates, team dashboards (burn-down, workload),
reminders, CSV/PDF export, live updates (SSE), Arabic (RTL) and an installable PWA.

| Route | Page |
|---|---|
| `/` | Landing page |
| `/app` | Workspace (sign-in, then Overview, Tasks, Teams, Members, My assignments, Profile). `/app?tab=Tasks` deep-links to a tab. |

## Requirements
- Node.js 20+ and npm
- The TaskVerse backend for real data (optional: **Demo Mode** works with no backend)

## Run locally
```bash
npm install
cp .env.example .env.development      # set VITE_API_BASE_URL (default http://localhost:3000)
npm run dev                           # http://localhost:5173
```
No backend yet? Open the app and click **Demo Mode** (or visit `/app?demo=1`) for a fully interactive offline workspace.

### Environment variables
| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the deployed backend, no trailing slash (e.g. `https://your-backend.vercel.app`). If empty in production, the app calls its own origin, which only works behind a proxy. |

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` / `npm run preview` | Production build / serve it (the service worker only runs in the build) |
| `npm run test:e2e` | Playwright suite (app flows in Demo Mode + PWA checks) |
| `npm run test:e2e:app` | Only the app flows |
| `npm run test:unit` | Dependency-free unit tests (`node --test`) |
| `npx playwright test --project=integration` | Full backend flows (17 tests) against `tests/mock-backend`, a stand-in written from `TaskVerse_API_Documentation.md` |

Open items for the backend team are listed in [BACKEND_REQUESTS.md](BACKEND_REQUESTS.md).

### Tests
The suite uses your installed Edge (Windows) or Chrome, so nothing needs downloading. In CI:
```bash
npx playwright install chromium
PW_CHANNEL= npm run test:e2e
```
The dev server (5173) and a preview server (4179) are started automatically (or reused if already running).

## Deploy to Vercel
Import this repository as a project (framework: Vite; `vercel.json` already rewrites all routes to `index.html`)
and set `VITE_API_BASE_URL` to your backend URL.

## Project layout
```
src/
  views/WorkspaceView.vue   workspace shell + all tabs and cards
  components/               AuthPanel, KanbanBoard, CalendarView, OverviewInsights, MemberPicker, RichText, MentionInput, ...
  services/api.js           backend client (auth, refresh-token handling)
  services/extras.js        client-side store for features the backend does not have yet
  services/i18n.js          English / Arabic strings + RTL switch
  services/richtext.js      safe markdown-lite renderer and @mention helpers
  services/exporter.js      CSV download and print-to-PDF report
  services/modalA11y.js     dialog focus trap / Esc / focus return (v-modal-a11y)
  services/domTranslate.js  Arabic for template text (dictionary in i18n.ar.js)
  services/realtime.js      SSE client (GET /events) with polling fallback
public/                     PWA manifest, service worker, icons
tests/e2e/                  Playwright specs
```

## What is stored where
- **Real backend** (default): everything is server-side - auth, members, teams and roles (admin / editor / viewer), tasks with priority, tags,
  recurrence, reminders, estimates, subtasks, comments, attachments, time entries, templates, notifications, sessions, preferences and
  share links. The task card updates optimistically and re-fetches the task if a call fails. Live updates poll `GET /changes` (SSE is optional).
- **Demo Mode** (`?demo=1`): the same screens run fully offline; extras live in `localStorage` (see `src/services/extras.js`, `sync` adapter).
- Still browser-only until the backend specifies them: the activity log and the dashboards' numbers (computed from loaded data).

The contract is `TaskVerse_API_Documentation.md`. Open questions and gaps for the backend team: [BACKEND_REQUESTS.md](BACKEND_REQUESTS.md).
(`BACKEND_HANDOFF.md` / `BACKEND_API_SPEC.md` are the older design notes.)
