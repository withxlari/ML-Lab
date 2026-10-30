param([switch]$Push)

$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$taskRemote = 'https://github.com/withxlari/ml-lab.git'
$taskCheckout = Join-Path $taskRoot '.cache\github\ml-lab'
$taskProject = Join-Path $taskCheckout 'projects\nexo'
$taskPrefix = 'projects/nexo/'
$env:GIT_TERMINAL_PROMPT = '0'

# Fail closed if the destination is publicly readable. A private repo returns
# 404 without authentication; the normal Git credential manager handles access.
try {
    $taskVisibility = Invoke-RestMethod -Uri 'https://api.github.com/repos/withxlari/ml-lab' -Headers @{'User-Agent'='Nexo-Publisher'}
    if (-not $taskVisibility.private) { throw 'The ML-lab repository is public. Publication stopped.' }
}
catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
}

function Invoke-CheckedGit {
    & git @args
    if ($LASTEXITCODE -ne 0) { throw "Git command failed (exit $LASTEXITCODE)." }
}

$taskGitRoot = (& git -C $taskRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'The source is not a Git repository.' }
if ([IO.Path]::GetFullPath($taskGitRoot) -ne $taskRoot) {
    throw 'This exporter is for the standalone Nexo checkout. In the ML-lab clone, commit and push from the repository root.'
}
$taskSourceStatus = @(& git -C $taskRoot status --porcelain)
if ($taskSourceStatus.Count -gt 0) { throw 'Commit the local Nexo changes before exporting a reproducible snapshot.' }

[IO.Directory]::CreateDirectory((Split-Path $taskCheckout -Parent)) | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $taskCheckout '.git'))) {
    Invoke-CheckedGit clone $taskRemote $taskCheckout
}
$taskOrigin = (& git -C $taskCheckout remote get-url origin).Trim()
if ($taskOrigin -ne $taskRemote) { throw 'Unexpected publication remote. No files were copied.' }
if (@(& git -C $taskCheckout status --porcelain).Count -gt 0) {
    throw 'The publication checkout has uncommitted changes. Review them before exporting.'
}
$taskHeads = @(& git -C $taskCheckout for-each-ref '--format=%(refname)' refs/heads/)
$taskHasHead = $taskHeads.Count -gt 0
if ($taskHasHead) {
    $taskRemoteHeads = @(& git -C $taskCheckout ls-remote --heads origin refs/heads/main)
    if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the publication branch.' }
    if ($taskRemoteHeads.Count -gt 0) { Invoke-CheckedGit -C $taskCheckout pull --ff-only }
}
else { Invoke-CheckedGit -C $taskCheckout branch -M main }

$taskFiles = @(& git -C $taskRoot -c core.quotepath=false ls-files)
$taskExpected = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($taskRelative in $taskFiles) {
    if ([IO.Path]::IsPathRooted($taskRelative) -or $taskRelative.Split('/') -contains '..') { throw 'Invalid source path.' }
    if ($taskRelative -match '(^|/)\.env($|\.)' -and $taskRelative -notmatch '(^|/)\.env(\.[^/]+)?\.example$') {
        throw 'A real environment file is tracked. Publication stopped.'
    }
    if ($taskRelative -match '(^|/)(node_modules|\.venv|\.runtime|\.cache)/') { throw 'A generated dependency directory is tracked.' }
    $taskDestination = [IO.Path]::GetFullPath((Join-Path $taskProject $taskRelative))
    if (-not $taskDestination.StartsWith($taskProject + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Destination escaped the Nexo publication folder.' }
    [void]$taskExpected.Add($taskPrefix + $taskRelative)
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskDestination)) | Out-Null
    [IO.File]::Copy((Join-Path $taskRoot $taskRelative), $taskDestination, $true)
}
# Remove only obsolete, tracked files inside this generated Nexo folder.
$taskOldFiles = @(& git -C $taskCheckout -c core.quotepath=false ls-files -- $taskPrefix)
foreach ($taskOld in $taskOldFiles) {
    if ($taskOld.StartsWith($taskPrefix) -and -not $taskExpected.Contains($taskOld)) {
        $taskObsolete = [IO.Path]::GetFullPath((Join-Path $taskCheckout $taskOld))
        if (-not $taskObsolete.StartsWith($taskProject + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid obsolete-file path.' }
        if (Test-Path -LiteralPath $taskObsolete -PathType Leaf) { Remove-Item -LiteralPath $taskObsolete }
    }
}

$taskHubReadme = @'
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
'@
if (-not (Test-Path -LiteralPath (Join-Path $taskCheckout 'README.md'))) {
    [IO.File]::WriteAllText((Join-Path $taskCheckout 'README.md'), $taskHubReadme)
}
if (-not (Test-Path -LiteralPath (Join-Path $taskCheckout '.gitignore'))) {
    [IO.File]::WriteAllText((Join-Path $taskCheckout '.gitignore'), ".env`n.env.*`n!.env.example`n!.env.*.example`nnode_modules/`n.venv/`n.cache/`n.runtime/`ndist/`n__pycache__/`n")
}
$taskWorkflow = [IO.File]::ReadAllText((Join-Path $taskRoot '.github\workflows\ci.yml'))
$taskWorkflow = $taskWorkflow.Replace('name: Quality', 'name: Nexo Quality').Replace('working-directory: frontend', 'working-directory: projects/nexo/frontend').Replace('working-directory: backend', 'working-directory: projects/nexo/backend').Replace('frontend/package-lock.json', 'projects/nexo/frontend/package-lock.json')
[IO.Directory]::CreateDirectory((Join-Path $taskCheckout '.github\workflows')) | Out-Null
[IO.File]::WriteAllText((Join-Path $taskCheckout '.github\workflows\nexo-quality.yml'), $taskWorkflow)

Invoke-CheckedGit -C $taskCheckout add -- projects/nexo .github/workflows/nexo-quality.yml README.md .gitignore
& git -C $taskCheckout diff --cached --quiet
if ($LASTEXITCODE -eq 1) {
    $taskSourceCommit = (& git -C $taskRoot rev-parse --short HEAD).Trim()
    Invoke-CheckedGit -C $taskCheckout commit -m "Update Nexo Phase 0 snapshot ($taskSourceCommit)"
}
elseif ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the staged publication snapshot.' }

if ($Push) { Invoke-CheckedGit -C $taskCheckout push --set-upstream origin main }
Write-Host "Publication checkout: $taskCheckout"
Write-Host 'ML-lab: https://github.com/withxlari/ml-lab'
Write-Host 'Nexo: https://github.com/withxlari/ml-lab/tree/main/projects/nexo'
