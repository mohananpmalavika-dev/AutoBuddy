<#
Simple setup script to create a virtualenv and install backend dependencies.
Run from repository root in PowerShell.
#>

if (-not (Test-Path -Path .venv)) {
    python -m venv .venv
}

Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
& .\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip

if (Test-Path -Path backend\requirements.txt) {
    pip install -r backend\requirements.txt
} else {
    Write-Host "backend\requirements.txt not found"
}

Write-Host "Setup complete. Activate with: & .\.venv\Scripts\Activate.ps1"