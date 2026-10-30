# Phase 0 complete — local foundation

Closed on 2026-10-30.

## Scope and decision

The original plan included Supabase setup in Phase 0. The project owner subsequently agreed to model the data and API before hosted infrastructure. [ADR 001](decisions/001-phase-0-local-foundation.md) records this scope change. This phase is complete as the agreed local foundation; database connectivity has not been implemented or claimed.

## Delivered

- React/TypeScript/Vite frontend with a public home, exploration and browser-local library.
- Responsive light/dark themes, local font assets and credited editorial imagery.
- FastAPI application with validated configuration, a typed /health response and OpenAPI.
- Isolated Python 3.12, virtual environment and dependency lockfiles.
- Setup scripts that check prerequisites and create ignored .env files without overwriting existing values.
- Automated linting, formatting, type checks, frontend tests and API tests.
- Local Git history and a private ML-lab repository with Nexo under projects/nexo.
- A private-publication helper that refuses a publicly readable destination and excludes generated/private configuration files.
- GitHub Actions adjusted for the ML-lab project-folder layout.
- Product, architecture, development, interface, publishing and evaluation documentation.

## Verification evidence

| Check | Result |
| --- | --- |
| Installation from lockfiles | scripts/setup.ps1 passed on 2026-10-30 |
| API tests | 5 passed |
| Frontend tests | 13 passed |
| Static quality | Ruff, mypy strict, ESLint, Prettier and TypeScript passed |
| Production build | Vite passed |
| Local application routes | /, /explore, /library and /dev/status returned HTTP 200 |
| API health | Direct request and frontend proxy returned the expected contract |
| OpenAPI | /openapi.json returned HTTP 200 |
| Export integrity | All 74 source files matched the committed snapshot by Git object hash before first upload |
| Git exclusions | No real .env, node_modules, .venv, .runtime or cache files were uploaded |
| GitHub privacy | Repository private=true and visibility=private after upload |
| Remote CI | Frontend and backend jobs succeeded on Ubuntu |

First successful remote run: [Nexo Quality #1](https://github.com/withxlari/ml-lab/actions/runs/41099665915). This verified installation, tests, lint, formatting, types and build outside the development computer.

## Private GitHub workspace

- [ML-lab](https://github.com/withxlari/ml-lab)
- [Nexo source folder](https://github.com/withxlari/ml-lab/tree/main/projects/nexo)
- [Actions history](https://github.com/withxlari/ml-lab/actions)

The existing local Nexo folder remains in place. See [publication instructions](github.md) for how the standalone working copy and the grouped repository relate.

## Evaluation and next step

Use the [Portuguese evaluation guide](avaliacao-fase-0.md).

The local development servers were started for review on 2026-10-30. They can be restarted using the guide if the terminals or computer are closed. No public website was deployed.

The next learning task is to define MediaItem fields, types, required/null behavior and validation rules, then implement a Pydantic schema and an in-memory catalog endpoint.

Database/schema/migrations, Supabase, authentication, imported catalog data, server-side user libraries and recommendation models remain future work.
