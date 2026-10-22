# TaskVerse Frontend

Vue 3 + Vite. Pages: `/` (home / landing) and `/app` (workspace, auth + dashboard).

## Run locally
```bash
npm install
cp .env.example .env.development   # set VITE_API_BASE_URL (default http://localhost:3000)
npm run dev
```

## Deploy to Vercel
Import this folder as its own project (Root Directory: `frontend`) and set
`VITE_API_BASE_URL` to your deployed backend URL. See the root `README.md`.
