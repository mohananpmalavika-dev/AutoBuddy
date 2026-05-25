<#
Helper script to bootstrap the AutoBuddy dev environment on Windows.
Usage: Open PowerShell and run:
    ./scripts/start_dev.ps1

What it does:
- Creates a venv at .venv if missing
- Activates the venv
- Installs backend/requirements.txt
- Copies backend/.env.sample to backend/.env if .env missing
- Starts the backend (uvicorn) and a simple static server for frontend
#>

Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

Push-Location $repoRoot

# Create venv in repo root if missing
if (-not (Test-Path -Path (Join-Path $repoRoot ".venv"))) {
    python -m venv .venv
}

# Activate the venv
& .\.venv\Scripts\Activate.ps1

Write-Host "Installing backend requirements..."
if (Test-Path "backend\requirements.txt") {
    python -m pip install -r backend\requirements.txt
} else {
    Write-Warning "backend\requirements.txt not found"
}

# Ensure backend .env exists
if (-not (Test-Path "backend\.env")) {
    if (Test-Path "backend\.env.sample") {
        Copy-Item "backend\.env.sample" "backend\.env"
        Write-Host "Copied backend/.env.sample to backend/.env (please edit values)."
    } else {
        Write-Warning "No .env.sample found in backend. Create backend\.env with required vars."
    }
}

Write-Host "Starting backend (uvicorn) on port 8001..."
Start-Process -NoNewWindow -FilePath .\.venv\Scripts\python.exe -ArgumentList ('-m','uvicorn','backend.server:app','--host','127.0.0.1','--port','8001','--reload') -WorkingDirectory $repoRoot

Write-Host "Starting frontend static server on port 5500..."
Start-Process -NoNewWindow -FilePath .\.venv\Scripts\python.exe -ArgumentList ('-m','http.server','5500') -WorkingDirectory (Join-Path $repoRoot 'frontend')

Pop-Location

Write-Host "Dev servers started. Backend: http://127.0.0.1:8001  Frontend: http://127.0.0.1:5500"
