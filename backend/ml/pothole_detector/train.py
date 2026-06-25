"""Train a simple pothole detector from accelerometer vertical-axis peaks.

This is a minimal example: it computes RMS or peak of z-acceleration over
short windows and trains a small RandomForest classifier when labels are present.
"""
import argparse
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib


def featurize(df, window_ms=500, sample_rate_hz=50):
    # window size in samples
    w = int(window_ms * sample_rate_hz / 1000)
    feats = []
    labels = []
    for start in range(0, len(df) - w, w):
        win = df.iloc[start : start + w]
        az = win['az'].values
        ax = win.get('ax', pd.Series(np.zeros(len(win)))).values
        ay = win.get('ay', pd.Series(np.zeros(len(win)))).values
        feat = {
            'az_mean': np.mean(az),
            'az_std': np.std(az),
            'az_max': np.max(az),
            'az_min': np.min(az),
            'ax_mean': np.mean(ax),
            'ay_mean': np.mean(ay),
        }
        feats.append(feat)
        if 'label' in win.columns:
            labels.append(int(win['label'].max()))
    X = pd.DataFrame(feats)
    y = np.array(labels) if labels else None
    return X, y


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', default='model.pkl')
    args = parser.parse_args()

    df = pd.read_csv(args.input)
    # Expect columns: timestamp, ax, ay, az, gx, gy, gz, latitude, longitude, label(optional)
    X, y = featurize(df)
    if y is None or len(y) == 0:
        print('No labels found. Will save a simple threshold rule instead.')
        # Save a threshold rule: az_max > threshold -> pothole
        threshold = X['az_max'].mean() + 2 * X['az_std'].mean()
        joblib.dump({'threshold': float(threshold), 'type': 'threshold'}, args.out)
        print('Saved threshold model to', args.out)
        return

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    preds = clf.predict(X_test)
    print(classification_report(y_test, preds))
    joblib.dump({'model': clf, 'type': 'rf'}, args.out)
    print('Saved model to', args.out)


if __name__ == '__main__':
    main()
