$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
foreach ($taskCommand in @('git', 'node', 'npm.cmd', 'uv')) {
    if (-not (Get-Command $taskCommand -ErrorAction SilentlyContinue)) {
        throw "Missing prerequisite: $taskCommand. See README.md."
    }
}
foreach ($taskComponent in @('frontend', 'backend')) {
    $taskEnvironment = Join-Path $taskRoot "$taskComponent\.env"
    if (-not (Test-Path -LiteralPath $taskEnvironment)) {
        Copy-Item -LiteralPath (Join-Path $taskRoot "$taskComponent\.env.example") -Destination $taskEnvironment
    }
}
& (Join-Path $PSScriptRoot 'backend.ps1') setup
Push-Location (Join-Path $taskRoot 'frontend')
try {
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend installation failed.' }
}
finally { Pop-Location }
Write-Host 'Nexo is ready. See README.md to start both servers.'
