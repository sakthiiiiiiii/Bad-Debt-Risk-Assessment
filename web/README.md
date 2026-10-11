# Risk Observatory

Local credit risk dashboard using the project's fitted Logistic Regression, Random Forest, and HistGradientBoosting classifiers. No synthetic model metrics, model retraining, or external AI API is used.

## Run locally with Uvicorn

Run this app on your computer using Uvicorn.

1. Open a terminal in the project root (`Session 3`), the folder containing `requirements.txt`, `models`, and `web`.
2. Install the dependencies using the same Python interpreter you will run:

   ```powershell
   python -m pip install -r requirements.txt
   ```

3. Start the local web server from the project root:

   ```powershell
   python -m uvicorn web.app:app --host 127.0.0.1 --port 8000 --reload
   ```

4. Keep the terminal running and open **http://127.0.0.1:8000** in your browser.
5. Click **Predict customer risk** in the left panel to open the input form. Enter the optional Customer ID and all 12 numerical credit/risk values. **Load sample inputs** fills a real test example if you want to try the form first.
6. Click **Predict customer risk**. The results show **High risk** or **Low risk** for each of the three models, plus the majority result. Customer ID identifies the result and is not a model input.
7. Press **Ctrl+C** in the terminal to stop the server.

A Bad risk score of 50% or higher gives the label **Bad**; a lower score gives **Good**. The same cutoff gives High risk (Bad) at 50% or higher and Low risk (Good) below 50%.

If you use the existing virtual environment, activate it first with `.\.venv\Scripts\Activate.ps1`, or replace `python` in both commands with `.\.venv\Scripts\python.exe`. If port 8000 is busy, choose `--port 8001` and open http://127.0.0.1:8001. If `web` cannot be imported, change your terminal directory to the project root. If Uvicorn is missing, run `python -m pip install fastapi uvicorn` with the same interpreter.

FastAPI/Uvicorn serves the page and model assets locally. All three fitted models run in a browser worker; starting the app does not retrain them. No hosted link or external prediction service is required. Serve through HTTP rather than opening `index.html` directly. A current Chrome, Edge, Firefox, or Safari browser with Web Workers and DecompressionStream support is required.

## Features

- Real model cards with test-set AUC, accuracy, and Bad recall.
- Search, risk filters, score sorting, pagination, and filtered CSV export.
- A fixed sample of 80 held-out applications with verified raw Customer IDs; this is not the full portfolio.
- A customer drawer with all three predictions, mean consensus, and a risk gauge.
- Approximate interventional permutation SHAP with eight training background rows.
- Live scenarios using credit score, enquiries, and employment sliders. All 12 features can also be entered numerically. Blank values use training medians.
- New assessments, local-only scenario inputs, responsive layout, keyboard-accessible dialogs, and load-error recovery.

## Inference and data

The saved model assets are already included in `dist/assets/`. No export, training, Node.js installation, or frontend build is needed to start the app.

`dist/inference.mjs` evaluates these fitted models; `dist/worker.mjs` keeps inference and explanation off the UI thread. Missing values use saved training medians. Features are ordered exactly as in the fitted model. The positive class is Bad.

The local static assets include model parameters, 80 pseudonymous examples and eight numeric background rows. They exclude the full dataset, joblib files, and real customer identifiers. Inputs entered in the interface are never sent to a prediction service or persisted. The Uvicorn server listens on your computer only (127.0.0.1).

Risk bands (<30%, 30–60%, >=60%) are illustrative UI categories. Model scores are uncalibrated because training used oversampling. The original model comparison selected models using the test set, so these evaluation metrics are not an independent final validation. Scenarios are sensitivity analyses rather than causal advice or automated lending decisions.

## Local files

- `app.py`: FastAPI/Uvicorn server.
- `__init__.py`: Python package file.
- `dist/`: webpage, styles, prediction code, and the three saved model assets.
- Root `.gitignore`: excludes generated caches and local environment files.
- `README.md`: setup and run instructions.

Python may regenerate `__pycache__` when the server starts; it is ignored by Git.

The raw files contain numeric Customer IDs but no names, father names, or locations. The table and inspection drawer show IDs verified by matching all 12 original feature values to the raw workbooks. New assessments use credit/risk inputs only.

The prediction form opens from the left-panel **Predict customer risk** button; **Portfolio overview** returns to the dashboard without clearing inputs. Each feature shows a one-sentence explanation and its observed training-data minimum and maximum. Bureau fields without definitions in the column-description workbook are labeled as undocumented. Ranges describe the source data and do not enforce universal eligibility limits.

The local interface uses the original dark slate theme. Theme colors are defined in `dist/tokens.css`; component styles are in `dist/styles.css`.

After retraining the models, update the webpage model assets from the project root with `python src/export_web_models.py`. This uses your local saved model files and does not retrain them.
