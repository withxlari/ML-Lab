# Phase 0 — local foundation

Date: 2026-10-30.

## Agreed scope

The original plan included Supabase configuration in Phase 0. The project owner subsequently agreed to model the data/API first and postpone hosted infrastructure. [ADR 001](decisions/001-phase-0-local-foundation.md) records that change. Database connectivity is not claimed as complete.

## Local validation complete

- React/TypeScript frontend with public home, exploration, local library and persistent themes.
- FastAPI backend, validated environment configuration, health contract and OpenAPI.
- Python 3.12 isolated inside the project.
- Safe local environment examples and setup/check scripts.
- Locked dependencies for reproducible installation.
- 5 API tests and 13 frontend tests passed on 2026-10-30.
- Ruff, mypy strict, ESLint, Prettier, TypeScript and Vite build passed.
- Private ML-lab repository created for projects/nexo.
- Private publication helper and root-monorepo CI preparation.

## Closure checks in progress

- Upload the committed Nexo snapshot.
- Verify the private repository visibility again after upload.
- Execute and inspect the first remote CI run.
- Recheck the local frontend-to-API health request.

## Next phase

Design the MediaItem contract and data model; implement the first catalog API with small in-memory data. Database schema/migrations and the eventual Supabase connection follow that design.

See the [evaluation guide](avaliacao-fase-0.md) for the user review and [GitHub notes](github.md) for the ML-lab organization.
