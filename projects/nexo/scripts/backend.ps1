param(
    [ValidateSet('setup', 'dev', 'check')]
    [string]$Task = 'dev'
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$env:UV_CACHE_DIR = Join-Path $taskRoot '.cache\uv'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $taskRoot '.runtime\python'

function Invoke-CheckedUv {
    & uv @args
    if ($LASTEXITCODE -ne 0) { throw "uv failed (exit $LASTEXITCODE)." }
}

Push-Location $taskRoot
try {
    switch ($Task) {
        'setup' {
            Invoke-CheckedUv python install 3.12 --no-bin --no-registry
            Invoke-CheckedUv sync --project backend --locked
        }
        'dev' {
            Invoke-CheckedUv run --project backend --locked uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload --reload-dir backend/app
        }
        'check' {
            Invoke-CheckedUv run --project backend --locked ruff check backend
            Invoke-CheckedUv run --project backend --locked ruff format --check backend
            Invoke-CheckedUv run --project backend --locked mypy --config-file backend/pyproject.toml backend/app backend/tests
            Invoke-CheckedUv run --project backend --locked pytest backend
        }
    }
}
finally { Pop-Location }
