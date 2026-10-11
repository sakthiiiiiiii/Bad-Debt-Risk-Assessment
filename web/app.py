"""Serve the dashboard locally with: python -m uvicorn web.app:app --reload."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

WEB_ROOT = Path(__file__).resolve().parent / "dist"

app = FastAPI(title="Bad Debt Prediction", docs_url=None, redoc_url=None)


@app.get("/api/health")
def health():
    return {"status": "ok", "models": [
        "Logistic Regression", "Random Forest", "HistGradientBoosting"
    ]}


# Model inference runs in the browser using the exported fitted models.
# StaticFiles resolves paths relative to this file, independent of the shell cwd.
app.mount("/", StaticFiles(directory=WEB_ROOT, html=True), name="dashboard")
