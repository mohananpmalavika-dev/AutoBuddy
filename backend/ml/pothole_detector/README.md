# Pothole detector (prototype)

This folder contains a minimal prototype script to train a simple pothole detector
from accelerometer/gyroscope data. It's intentionally lightweight and intended for
MVP PoC using threshold-based detection or a small ML model.

Files:
- `train.py`: example data processing and model training script.
- `requirements.txt`: python deps for the prototype.

Usage:
1. Prepare CSV with columns: timestamp, ax, ay, az, gx, gy, gz, latitude, longitude, label
2. Run `python train.py --input data.csv --out model.pkl`
