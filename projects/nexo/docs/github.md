# Private GitHub organization

Nexo is grouped under the private repository:

- ML Lab: https://github.com/withxlari/ml-lab
- Nexo: https://github.com/withxlari/ml-lab/tree/main/projects/nexo
- CI: https://github.com/withxlari/ml-lab/actions

## Repository layout

    ml-lab/
      README.md
      .github/workflows/nexo-quality.yml
      projects/
        nexo/
          frontend/
          backend/
          ml/
          docs/
          scripts/

New ML projects can be added alongside Nexo under projects/<project-name>/.

## Local working copy and publication

The existing local Nexo directory stays in place. Its own Git history records development. The publication script exports only committed, tracked files into an ignored temporary ML-lab checkout under .cache/github/ml-lab, then commits the project snapshot.

After reviewing and committing local changes, run from the standalone Nexo directory:

    .\scripts\publish-ml-lab.ps1 -Push

Without -Push, the script prepares the publication checkout but does not send its commit to GitHub. It does not change repository visibility. It refuses to overwrite uncommitted changes in the publication checkout.

The root ML-lab workflow is generated from Nexo's CI definition with working directories adjusted to projects/nexo. Dependencies, local runtimes, secrets, caches and generated datasets are excluded by Git.

If you instead clone the complete ML-lab repository and work in projects/nexo, use normal Git commits/pushes from that monorepo. The export helper detects that layout and refuses nested export.

Creating the repository and pushing source code does not deploy a website. The repository remains private during evaluation.
