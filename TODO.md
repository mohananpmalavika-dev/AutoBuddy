# TODO

## Step 1: Fix Tier1 latitude/longitude Field syntax
- Locate the broken `latitude` / `longitude` `Field(...)` lines in `backend/app/routers/tier1_driver_features.py`.
- Replace the malformed expressions like `Field(. ge=-90, le=90)` with the valid form: `Field(..., ge=-90, le=90)` (and similarly for longitude).

## Step 2: Validate startup
- Run compile/import check to ensure syntax is resolved.
- Completed: `python -m py_compile backend/app/routers/tier1_driver_features.py`


