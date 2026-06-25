"""Inference helpers for pothole detection.

Provides a lightweight predict_hazard(metadata) function. Expects `metadata`
to include aggregated window features such as `az_max`, `az_std`, `ax_mean`,
`ay_mean` etc. Falls back to a simple threshold rule when no model exists.
"""
import os
import joblib
import math

MODEL_PATH = os.environ.get("POTHOLE_MODEL_PATH", os.path.join(os.path.dirname(__file__), "model.pkl"))


def _load_model():
    if os.path.exists(MODEL_PATH):
        try:
            m = joblib.load(MODEL_PATH)
            return m
        except Exception:
            return None
    return None


_MODEL = _load_model()


def predict_hazard(metadata: dict) -> dict:
    """Return dict with keys `severity` (int) and `type` (str) when possible.

    metadata: may include 'az_max', 'az_std', 'ax_mean', 'ay_mean', 'window_samples'.
    """
    if not metadata:
        return {}

    # Prefer model-based prediction
    if _MODEL:
        try:
            # Some saved artifacts are dicts with {'model': clf, 'type': 'rf'}
            model_obj = _MODEL.get('model') if isinstance(_MODEL, dict) else _MODEL
            features = []
            # Prepare consistent order of features
            feat_names = ['az_max', 'az_std', 'az_mean', 'ax_mean', 'ay_mean']
            for f in feat_names:
                v = metadata.get(f, 0.0)
                features.append(float(v))
            pred = model_obj.predict([features])[0]
            # Map numeric label to severity/type — assume binary 0/1
            if isinstance(pred, (int, float)):
                severity = 8 if int(pred) == 1 else 2
                return {"severity": severity, "type": "pothole" if int(pred) == 1 else "bump"}
        except Exception:
            pass

    # Fallback threshold rule
    az_max = float(metadata.get('az_max') or metadata.get('impact', 0.0))
    az_std = float(metadata.get('az_std', 0.0))
    threshold = max(1.2, (metadata.get('threshold') or (az_std * 3 + 1.0)))
    if az_max >= threshold:
        severity = min(10, int(math.ceil((az_max - threshold) * 2) + 6))
        return {"severity": severity, "type": "pothole"}

    return {"severity": 2, "type": "minor"}
