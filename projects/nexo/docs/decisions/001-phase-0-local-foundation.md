# ADR 001 — Phase 0 is a local foundation

Date: 2026-10-30
Status: accepted in the development conversation.

## Context

The initial product specification included Supabase configuration and a database connection in Phase 0. During the subsequent discussion, the project owner agreed to first understand the data model and API, postponing hosted database setup.

## Decision

Phase 0 closes on a reproducible local frontend/API foundation, configuration examples, verified health communication, quality checks, Git versioning and private GitHub publication with CI.

Database selection and connection, SQLAlchemy models, Alembic migrations and catalog endpoints start in the next phase. Supabase remains the planned managed PostgreSQL/Auth provider. This is a sequencing change, not a replacement with another database.

## Consequences

- No hosted database, Supabase credentials or costs are needed to evaluate Phase 0.
- The health endpoint proves API liveness only.
- No persistence, authentication or recommendation capability is claimed as implemented.
- The original product specification is retained as the historical product plan; this ADR records the agreed change to the phase boundary.
