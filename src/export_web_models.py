"""Export existing sklearn models for inference for the local dashboard.

No training is performed. Run from any directory with the project's Python.
"""
from pathlib import Path
import gzip
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web/dist/assets"
OUT.mkdir(parents=True, exist_ok=True)
bundle = joblib.load(ROOT / "models/best_model.joblib")
models = joblib.load(ROOT / "models/trained_models.joblib")
columns = bundle["input_columns"]
raw = pd.read_csv(ROOT / "data/processed/dataset_SFM_Selected.csv")
raw = raw[raw.OUTCOME.isin(["Good", "Bad"])]
X = raw[columns].replace([np.inf, -np.inf], np.nan)
y = raw.OUTCOME.map({"Good": 0, "Bad": 1})
train, test, _, ytest = train_test_split(X, y, test_size=.25, stratify=y, random_state=42)
imputer = bundle["imputer"]
test = pd.DataFrame(imputer.transform(test), columns=columns, index=test.index)
train = pd.DataFrame(imputer.transform(train), columns=columns, index=train.index)
sample = test.sample(n=80, random_state=42)
background = train.sample(n=8, random_state=17)
metrics = pd.read_csv(ROOT / "results/model_comparison_results.csv")

def save(name, data):
    (OUT / name).write_text(json.dumps(data, separators=(",", ":"), allow_nan=False), encoding="utf-8")

engines = []
for key, name, short in [("hgb", "HistGradientBoosting", "Gradient Boosting"),
                         ("rf", "Random Forest", "Random Forest"),
                         ("lr", "Logistic Regression", "Logistic Regression")]:
    model = models[("SFM Selected", name)]
    metric = metrics[(metrics.Model == name) & (metrics["Feature Set"] == "SFM Selected")].iloc[0]
    engines.append({"id": key, "name": short, "fullName": name,
                    "auc": float(metric.AUC), "accuracy": float(metric.Accuracy),
                    "recall": float(metric["Bad Recall"]), "f1": float(metric["Bad F1"])})
    if key == "lr":
        scaler, logistic = model.steps[0][1], model.steps[1][1]
        save("lr.json", {"mean": scaler.mean_.tolist(), "scale": scaler.scale_.tolist(),
                         "coef": logistic.coef_[0].tolist(), "intercept": float(logistic.intercept_[0])})
    elif key == "hgb":
        trees = []
        for predictors in model._predictors:
            nodes = predictors[0].nodes
            assert not nodes["is_categorical"].any(), "Categorical trees require a different exporter"
            trees.append([[int(n["left"]), int(n["right"]), int(n["feature_idx"]),
                           float(n["num_threshold"]), float(n["value"]), bool(n["is_leaf"])] for n in nodes])
        save("hgb.json", {"baseline": float(model._baseline_prediction[0, 0]), "trees": trees})
    else:
        # Fixed 24-byte nodes: child indices, feature, threshold, P(Bad).
        dtype = np.dtype([("left", "<i4"), ("right", "<i4"), ("feature", "<i4"),
                          ("threshold", "<f8"), ("probability", "<f4")])
        roots, parts, offset = [], [], 0
        for estimator in model.estimators_:
            tree = estimator.tree_
            roots.append(offset)
            nodes = np.empty(tree.node_count, dtype=dtype)
            nodes["left"], nodes["right"] = tree.children_left, tree.children_right
            nodes["feature"], nodes["threshold"] = tree.feature, tree.threshold
            values = tree.value[:, 0, :]
            nodes["probability"] = values[:, 1] / values.sum(axis=1)
            parts.append(nodes.tobytes())
            offset += tree.node_count
        with gzip.open(OUT / "rf.bin.gz", "wb", compresslevel=9) as f:
            f.write(b"".join(parts))
        save("rf.json", {"roots": roots, "nodeSize": 24})

labels = ["Risk score", "Enquiries · 6 months", "Enquiries · 12 months", "Months · VCR228",
          "Sum · VCR053", "CR21 credit score", "CR22 credit score", "CR21 additional score",
          "Risk relative index", "Risk relative odds", "Months employed", "Months at address"]
features = [{"key": c, "label": labels[i], "median": float(imputer.statistics_[i]),
             "min": float(train[c].min()), "max": float(train[c].max()),
             "sliderMin": float(train[c].quantile(.01)), "sliderMax": float(train[c].quantile(.99))}
            for i, c in enumerate(columns)]
customers = [{"id": f"APP-{i+1001}", "values": row.tolist(), "actual": int(ytest.loc[idx])}
             for i, (idx, row) in enumerate(sample.iterrows())]
# Retain verified raw IDs only for unchanged sample records.
old_portfolio = OUT / "portfolio.json"
if old_portfolio.exists():
    previous = {c["id"]: c for c in json.loads(old_portfolio.read_text(encoding="utf-8"))["customers"]}
    for customer in customers:
        old = previous.get(customer["id"], {})
        customer["customerId"] = old.get("customerId") if old.get("values") == customer["values"] and old.get("actual") == customer["actual"] else None

save("portfolio.json", {"features": features, "engines": engines, "customers": customers,
                         "background": background.values.tolist(), "testRows": len(test),
                         "trainingRows": 126510, "labeledRows": len(raw),
                         "target": {"Good": 0, "Bad": 1}, "featureSet": "SFM Selected"})

print("Exported the three fitted models for the local web application.")
print("Compressed forest size:", round((OUT / "rf.bin.gz").stat().st_size / 1024**2, 2), "MB")
