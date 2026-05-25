# AutoBuddy — Quick Start (Windows)

This repository contains a FastAPI backend and a simple static frontend.

Documentation: see `docs/POLICY.md` (policy) and `docs/USER_MANUAL.md` (user manual).


Quick bootstrap (Windows PowerShell):

1. Open PowerShell in this repo root.
2. Run the helper script:

```powershell
./scripts/start_dev.ps1
```

What the script does:
- Creates `.venv` and activates it
- Installs `backend/requirements.txt`
- Copies `backend/.env.sample` to `backend/.env` if missing (edit values as needed)
- Starts backend at `http://127.0.0.1:8001`
- Serves frontend at `http://127.0.0.1:5500`

If you prefer to run steps manually:

```powershell
# create and activate venv
python -m venv .venv
& .venv\Scripts\Activate.ps1

# install backend deps
pip install -r backend\requirements.txt

# copy .env and edit
copy backend\.env.sample backend\.env
notepad backend\.env

# run backend
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8001 --reload

# serve frontend (in separate shell)
cd frontend
python -m http.server 5500
```

Next steps I can take:
- Run the test suite and fix failing tests
- Diagnose runtime errors when starting the backend and patch code
- Wire up a simple `devcontainer` or GitHub Actions workflow for CI

If you'd like, I can proceed to run the backend locally, fix any startup errors, and run tests now.

Compatibility note:
- If you are using Python 3.14 the pinned packages in `backend/requirements.txt` may not have wheels available (for example `protobuf==6.38.0`). If you hit install errors, prefer creating the venv with Python 3.11:

```powershell
# Example when Python 3.11 is installed as `py -3.11` on Windows
py -3.11 -m venv .venv
& .venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

If you want, I can either adjust `backend/requirements.txt` to loosen incompatible pins, or help you recreate the venv with Python 3.11. Which do you prefer?
