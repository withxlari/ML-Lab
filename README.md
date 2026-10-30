# ML Lab

A private workspace for machine learning and AI engineering projects.

## Projects

| Project | Description | Status |
| --- | --- | --- |
| [Nexo](projects/nexo) | Cross-media discovery and recommendation project for movies, series and books | Phase 0: local foundation |

Each project has its own source, dependency lockfiles, setup instructions and documentation. Add new projects under projects/<project-name>/ and register them in this table.

## Nexo

Start with [the project README](projects/nexo/README.md) and [the development guide](projects/nexo/docs/development.md).

From a fresh clone:

    cd projects/nexo
    .\scripts\setup.ps1

The root GitHub Actions workflow validates Nexo from its project subdirectory. No website is deployed by this repository.

Visibility: private. Do not add datasets, credentials or local environments to Git.