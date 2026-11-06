# Nexo

Nexo is a discovery and recommendation app for movies, TV series, books, manga, and games. You can keep a personal library, track your progress, rate and review titles, and share selected favorites on an optional public profile.

[Live app](https://nexo-aiproject.vercel.app) · [API health](https://nexo-api-sooty.vercel.app/health)

## Run locally

Install Node.js 24, Python 3.12, and uv. From the project directory, run the setup script in PowerShell.

```powershell
.\scripts\setup.ps1
```

Create `backend/.env` and `frontend/.env` from their respective `.env.example` files. For a fresh Supabase project, apply the database scripts listed below. To prepare the recommendation model, run these commands from the project directory.

```powershell
Push-Location backend
uv run python -m app.semantic
Pop-Location
```

Start the API and frontend in separate terminals, both from the project directory.

```powershell
.\scripts\backend.ps1 dev
```

```powershell
npm.cmd --prefix frontend run dev
```

The frontend runs at <http://127.0.0.1:5173> and the API at <http://127.0.0.1:8000>. If a port is occupied, check whether that service is already running.

## Project structure

| Path | Purpose |
| :--- | :--- |
| [`frontend/`](frontend) | React, TypeScript, and Vite app with light and dark themes, discovery, libraries, reviews, and profiles |
| [`backend/app/`](backend/app) | FastAPI application with catalog integrations, account validation, and recommendations |
| [`backend/tests/`](backend/tests) | Automated tests and SQL privacy checks that roll back their test transactions |
| [`scripts/`](scripts) | Local setup, development, checks, and ML Lab publishing |

For a fresh database, apply `catalog.sql`, `account.sql`, `library-preferences.sql`, `onboarding.sql`, `community.sql`, `avatars.sql`, `people.sql`, `profile-details.sql`, and `completed-and-search.sql` from [`backend/`](backend). Apply `catalog-discovery.sql` before `book-catalog-runtime.sql`, and install `book-lookup-stats.sql` for book lookup metrics. Apply database changes before deploying the code that depends on them.

## Catalog and recommendations

Movies and TV series use TMDB. Book search prioritizes Google Books and Portuguese-language editions, with Open Library as a fallback. The Brazilian book selection uses BookInfo's public rankings, displays the source and date range, and caches results for 24 hours. Manga uses Kitsu and games use IGDB. External search covers more titles than the initial catalog.

The content-based recommender uses multilingual MiniLM embeddings through FastEmbed and ONNX Runtime to compare work descriptions and preference text. It combines semantic similarity and genres with ratings, favorites, Top 5 selections, and feedback, including negative reactions. Suggestions explain what contributed to the match. The backend runs the model locally and keeps private text away from external AI APIs. Feedback updates the ranking signals. The embedding model stays fixed, and recommendation quality is still being evaluated.

Public metadata and vectors use a cache with expiration and size limits. The frontend waits 450 ms after typing before starting a search. Changing the featured title reuses existing results. Public cache entries exclude tokens and private text.

When Supabase catalog mode and `NEXO_SUPABASE_SECRET_KEY` are configured, the backend saves books returned by Google Books or Open Library after responding to search or detail requests. It stores entries by ISBN where available, with `origin = 'runtime'`. Saved details can be served from the catalog, and missing covers or descriptions are refreshed in the background at most once a day. Discovery excludes these runtime entries.

Responses include `X-Request-Id` and `Server-Timing` headers. With the backend Supabase secret configured, book provider calls are logged to `lookup_stats`. The queries in [`book-lookup-stats.sql`](backend/book-lookup-stats.sql) report cache hit rates and latency.

## Accounts and privacy

Anyone can browse. Saving titles, rating them, adding favorites, and following profiles require an account. Supabase Auth validates sessions, and PostgreSQL row-level security restricts access to personal libraries and preferences.

Public profiles are opt-in. They can include Top 5 selections, explicitly public reviews, completed and favorite counts, and follower and following information. Users control which sections appear. Totals can be shared while individual library entries stay private. Profile search only returns published profiles.

Marking a recommendation as watched, read, or played records it as completed. You can add or remove a private like or dislike from your library. That reaction influences future recommendations independently of star ratings.

Database functions in the internal `nexo_private` schema calculate public totals after checking whether the profile is published and which sections are visible. Avatars use a private storage bucket with short-lived signed URLs and a 1 MB WebP limit.

## Deployment

The frontend and API deploy separately on Vercel using their respective `vercel.json` files. Keep provider credentials and the Supabase secret in backend environment variables. Frontend settings use the API URL, Supabase URL, and Supabase publishable key.

Set `NEXO_ENVIRONMENT=production`, `NEXO_CORS_ORIGINS`, `VITE_API_BASE_URL`, and the public Supabase URLs for your deployment. Before opening public signups, configure custom SMTP, integrate CAPTCHA with the form and Supabase Auth, and verify password settings, HTTPS, and allowed redirect URLs. See the [Supabase plan limits](https://supabase.com/pricing) and [SMTP configuration guide](https://supabase.com/docs/guides/auth/auth-smtp).

The API applies per-process IP rate limits, caps request bodies at 4 MB, and prevents shared caching of private responses. The frontend build includes a content security policy. For deployments with multiple workers, configure shared rate limiting at the edge.

The API build prepares the model in `.model/`. Runtime caches on Vercel live in `/tmp/nexo` and are temporary per instance. For a deployment that needs to reuse cache entries across instances, use shared storage. Measure recommendation quality and traffic capacity before expanding the beta.

## Checks

```powershell
.\scripts\check.ps1
backend\.venv\Scripts\python.exe scripts/check-secrets.py
```

The secret scanner checks candidate files and local Git history without printing credential values. Keep credentials, private data, downloaded models, local environments, and build output outside Git.
