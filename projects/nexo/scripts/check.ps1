$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'backend.ps1') check
Push-Location (Join-Path $taskRoot 'frontend')
try {
    foreach ($taskCheck in @('lint', 'format:check', 'test', 'build')) {
        & npm.cmd run $taskCheck
        if ($LASTEXITCODE -ne 0) { throw "Frontend check failed: $taskCheck" }
    }
}
finally { Pop-Location }
